import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { SeededRandom } from '../utils/SeededRandom';
import { SCENARIO } from '../data/mockScenario';
import { createLeafMesh, getLeafMaterial } from '../plant/LeafGenerator';
import { createHeatmap, type HeatmapHandle } from './Heatmap';
import { createRobot, type RobotHandle } from './Robot';
import { createPathTrail, type PathTrailHandle } from './PathTrail';
import { attachZonePicker } from './ZonePicker';

export interface GreenhouseSceneHandle {
  heatmap: HeatmapHandle;
  robot: RobotHandle;
  pathTrail: PathTrailHandle;
  plantNodes: TransformNode[];
  update: (day: number) => void;
  onZoneHover: (cb: (zoneId: number | null) => void) => void;
  onZoneClick: (cb: (zoneId: number | null) => void) => void;
}

export function buildGreenhouseScene(scene: Scene): GreenhouseSceneHandle {
  const bedLen = SCENARIO.bedLengthM;

  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: bedLen + 4, height: 8, subdivisions: 2 },
    scene
  );
  const groundMat = new PBRMaterial('groundMat', scene);
  groundMat.albedoColor = Color3.FromHexString('#9a9a92');
  groundMat.metallic = 0;
  groundMat.roughness = 0.85;
  ground.material = groundMat;
  ground.receiveShadows = true;

  const path = MeshBuilder.CreateGround(
    'path',
    { width: bedLen, height: 1.2, subdivisions: 1 },
    scene
  );
  path.position = new Vector3(0, 0.005, 1.5);
  const pathMat = new PBRMaterial('pathMat', scene);
  pathMat.albedoColor = Color3.FromHexString('#7a7a72');
  pathMat.metallic = 0;
  pathMat.roughness = 0.9;
  path.material = pathMat;
  path.receiveShadows = true;

  const bed = MeshBuilder.CreateBox(
    'bed',
    { width: bedLen, height: 0.15, depth: 0.35 },
    scene
  );
  bed.position = new Vector3(0, SCENARIO.bedY - 0.075, 0);
  const bedMat = new PBRMaterial('bedMat', scene);
  bedMat.albedoColor = Color3.FromHexString('#c0c0b8');
  bedMat.metallic = 0.75;
  bedMat.roughness = 0.3;
  bed.material = bedMat;
  bed.receiveShadows = true;

  // Greenhouse frame ribs (simple A-frames at 4m intervals)
  const frameMat = new PBRMaterial('frameMat', scene);
  frameMat.albedoColor = Color3.FromHexString('#b8b8b0');
  frameMat.metallic = 0.85;
  frameMat.roughness = 0.35;
  for (let i = 0; i <= bedLen / 4; i++) {
    const x = -bedLen / 2 + i * 4;
    const beam = MeshBuilder.CreateCylinder(
      `rib_${i}`,
      { height: 5.2, diameter: 0.045 },
      scene
    );
    beam.position = new Vector3(x, 2.5, 2.6);
    beam.rotation.x = -0.4;
    beam.material = frameMat;
  }

  // Plant placeholder markers (30) — simple stems
  const stemMat = new PBRMaterial('stemMat', scene);
  stemMat.albedoColor = Color3.FromHexString('#3a5a25');
  stemMat.metallic = 0;
  stemMat.roughness = 0.8;

  const plantNodes: TransformNode[] = [];
  for (let i = 0; i < SCENARIO.plantCount; i++) {
    const plant = SCENARIO.plants[i];
    const node = new TransformNode(`plant_${i}`, scene);
    node.position = new Vector3(plant.position[0], plant.position[1], plant.position[2]);
    plantNodes.push(node);

    const stem = MeshBuilder.CreateCylinder(
      `stem_${i}`,
      { height: 1.5, diameter: 0.025, tessellation: 6 },
      scene
    );
    stem.parent = node;
    stem.position = new Vector3(0, 0.75, 0);
    stem.material = stemMat;
  }

  // One full-detail showcase plant in the center
  const showcasePlantIndex = Math.floor(SCENARIO.plantCount / 2);
  const showcase = plantNodes[showcasePlantIndex];
  const leafMat = getLeafMaterial(scene);
  const leafCount = 7;
  for (let i = 0; i < leafCount; i++) {
    const t = i / (leafCount - 1);
    const heightY = 0.4 + t * 1.3;
    const ageFrac = Math.min(1, (1 - t) * 0.9);
    const maturity = 0.5 + (1 - t) * 0.5;

    for (const side of [-1, 1]) {
      const rng = new SeededRandom(2000 + i * 100 + (side > 0 ? 7 : 13));
      const leaf = createLeafMesh(
        `showcase_leaf_${i}_${side}`,
        scene,
        7,
        2.0,
        maturity,
        0.15,
        rng,
        undefined,
        ageFrac
      );
      leaf.material = leafMat;
      leaf.parent = showcase;
      leaf.position = new Vector3(0, heightY, 0);
      const azimuth = side > 0 ? 0 : Math.PI;
      const phyll = i * 0.5;
      leaf.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), azimuth + phyll);
    }
  }

  const heatmap = createHeatmap(scene);
  const robot = createRobot(scene);
  const pathTrail = createPathTrail(scene);

  let hoverCb: ((zoneId: number | null) => void) | null = null;
  let clickCb: ((zoneId: number | null) => void) | null = null;

  attachZonePicker(
    scene,
    heatmap.mesh,
    (zoneId) => {
      heatmap.setHoveredZone(zoneId);
      hoverCb?.(zoneId);
    },
    (zoneId) => clickCb?.(zoneId)
  );

  return {
    heatmap,
    robot,
    pathTrail,
    plantNodes,
    update(day) {
      heatmap.update(day);
      robot.update(day);
      pathTrail.update(day);

      for (let i = 0; i < SCENARIO.plantCount; i++) {
        const plant = SCENARIO.plants[i];
        const snap = plant.daily[Math.max(0, Math.min(plant.daily.length - 1, Math.floor(day)))];
        const heightScale = snap.heightCm / 220;
        plantNodes[i].scaling = new Vector3(1, Math.max(0.05, heightScale), 1);
      }
    },
    onZoneHover(cb) { hoverCb = cb; },
    onZoneClick(cb) { clickCb = cb; },
  };
}
