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
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { createUwbAnchors, type UwbAnchorsHandle } from './UwbAnchors';

const TOMATO_RIPEN_COLORS = [
  '#3c8a30', // green
  '#8c9432', // breaker
  '#b9683c', // orange
  '#d25240', // light red
  '#c83228', // dark red
];

function addFruitCluster(scene: Scene, parent: TransformNode) {
  const trussConfigs: Array<{ height: number; count: number; ripenStage: number }> = [
    { height: 0.55, count: 4, ripenStage: 4 },
    { height: 0.85, count: 3, ripenStage: 3 },
    { height: 1.15, count: 5, ripenStage: 2 },
    { height: 1.4, count: 4, ripenStage: 0 },
  ];

  for (const truss of trussConfigs) {
    const trussNode = new TransformNode('truss', scene);
    trussNode.parent = parent;
    trussNode.position = new Vector3(0.08, truss.height, 0.04);

    const pedicel = MeshBuilder.CreateCylinder(
      'pedicel',
      { height: 0.12, diameter: 0.006, tessellation: 5 },
      scene
    );
    pedicel.parent = trussNode;
    pedicel.rotation.z = -Math.PI / 3;
    pedicel.position = new Vector3(0.05, -0.04, 0);
    const pedMat = new PBRMaterial('pedMat', scene);
    pedMat.albedoColor = Color3.FromHexString('#4a8a30');
    pedMat.metallic = 0;
    pedMat.roughness = 0.8;
    pedicel.material = pedMat;

    const fruitMat = new PBRMaterial(`fruit_${truss.ripenStage}_mat`, scene);
    fruitMat.albedoColor = Color3.FromHexString(TOMATO_RIPEN_COLORS[truss.ripenStage]);
    fruitMat.metallic = 0;
    fruitMat.roughness = 0.28;
    fruitMat.clearCoat.isEnabled = true;
    fruitMat.clearCoat.intensity = 0.4;
    fruitMat.clearCoat.roughness = 0.12;

    for (let i = 0; i < truss.count; i++) {
      const fruitSize = 0.045 + (truss.ripenStage >= 3 ? 0.01 : 0);
      const fruit = MeshBuilder.CreateSphere(
        `fruit_${truss.ripenStage}_${i}`,
        { diameter: fruitSize, segments: 10 },
        scene
      );
      fruit.parent = trussNode;
      const angle = (i / truss.count) * Math.PI * 1.5 - Math.PI * 0.75;
      const dropX = 0.08 + i * 0.025;
      const dropY = -0.04 - i * 0.025;
      const dropZ = Math.sin(angle) * 0.04;
      fruit.position = new Vector3(dropX, dropY, dropZ);
      fruit.material = fruitMat;
    }
  }
}

export interface GreenhouseSceneHandle {
  heatmap: HeatmapHandle;
  robot: RobotHandle;
  pathTrail: PathTrailHandle;
  uwb: UwbAnchorsHandle;
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

  const leafMat = getLeafMaterial(scene);
  const showcasePlantIndex = Math.floor(SCENARIO.plantCount / 2);
  const neighborhoodSize = 5;

  for (
    let pi = showcasePlantIndex - neighborhoodSize;
    pi <= showcasePlantIndex + neighborhoodSize;
    pi++
  ) {
    if (pi < 0 || pi >= SCENARIO.plantCount) continue;
    const isShowcase = pi === showcasePlantIndex;
    const distFromCenter = Math.abs(pi - showcasePlantIndex);
    const leafScale = isShowcase ? 2.0 : Math.max(1.0, 1.8 - distFromCenter * 0.18);
    const leafCount = isShowcase ? 7 : 5;
    const plantNode = plantNodes[pi];

    for (let i = 0; i < leafCount; i++) {
      const t = i / (leafCount - 1);
      const heightY = 0.4 + t * 1.3;
      const ageFrac = Math.min(1, (1 - t) * 0.9);
      const maturity = 0.5 + (1 - t) * 0.5;

      for (const side of [-1, 1]) {
        const rng = new SeededRandom(2000 + pi * 1000 + i * 100 + (side > 0 ? 7 : 13));
        const leaf = createLeafMesh(
          `plant_${pi}_leaf_${i}_${side}`,
          scene,
          7,
          leafScale,
          maturity,
          0.15,
          rng,
          undefined,
          ageFrac
        );
        leaf.material = leafMat;
        leaf.parent = plantNode;
        leaf.position = new Vector3(0, heightY, 0);
        const azimuth = side > 0 ? 0 : Math.PI;
        const phyll = i * 0.5 + pi * 0.13;
        leaf.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), azimuth + phyll);
      }
    }

    if (isShowcase) addFruitCluster(scene, plantNode);
  }

  const heatmap = createHeatmap(scene);
  const robot = createRobot(scene);
  const pathTrail = createPathTrail(scene);
  const uwb = createUwbAnchors(scene);

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
    uwb,
    plantNodes,
    update(day) {
      heatmap.update(day);
      robot.update(day);
      pathTrail.update(day);
      uwb.update(robot.currentPosition());

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
