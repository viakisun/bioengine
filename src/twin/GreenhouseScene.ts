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
import { GrowthEngine } from '../simulation/GrowthEngine';
import { createShowcasePlant, type ShowcasePlantHandle } from './ShowcasePlant';
import { getGroundAlbedoTexture, getGroundNormalTexture } from './GroundTexture';

const TOMATO_RIPEN_COLORS = [
  '#3c8a30', // green
  '#8c9432', // breaker
  '#b9683c', // orange
  '#d25240', // light red
  '#c83228', // dark red
];

function addFruitCluster(scene: Scene, parent: TransformNode, detail: 'full' | 'reduced' = 'full') {
  const trussConfigs: Array<{ height: number; count: number; ripenStage: number }> = detail === 'full'
    ? [
        { height: 0.55, count: 4, ripenStage: 4 },
        { height: 0.85, count: 3, ripenStage: 3 },
        { height: 1.15, count: 5, ripenStage: 2 },
        { height: 1.4, count: 4, ripenStage: 0 },
      ]
    : [
        { height: 0.7, count: 3, ripenStage: 4 },
        { height: 1.1, count: 3, ripenStage: 2 },
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
  growthEngine: GrowthEngine;
  showcasePlant: ShowcasePlantHandle;
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
  groundMat.albedoColor = new Color3(1, 1, 1);
  groundMat.albedoTexture = getGroundAlbedoTexture(scene);
  groundMat.bumpTexture = getGroundNormalTexture(scene);
  groundMat.metallic = 0;
  groundMat.roughness = 0.88;
  groundMat.environmentIntensity = 0.45;
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

  // Greenhouse frame (galvanized A-frames + ridge beam + side posts)
  const frameMat = new PBRMaterial('frameMat', scene);
  frameMat.albedoColor = Color3.FromHexString('#c8c8c0');
  frameMat.metallic = 0.85;
  frameMat.roughness = 0.3;

  const ridgeY = 4.5;
  const eaveY = 3.6;
  const halfWidth = 3.5;

  for (let i = 0; i <= bedLen / 4; i++) {
    const x = -bedLen / 2 + i * 4;
    // Side posts (vertical)
    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateCylinder(
        `post_${i}_${side}`,
        { height: eaveY, diameter: 0.06 },
        scene
      );
      post.position = new Vector3(x, eaveY / 2, side * halfWidth);
      post.material = frameMat;
    }
    // Roof rafters (sloped)
    for (const side of [-1, 1]) {
      const rafterLen = Math.sqrt(halfWidth * halfWidth + (ridgeY - eaveY) * (ridgeY - eaveY));
      const rafter = MeshBuilder.CreateCylinder(
        `rafter_${i}_${side}`,
        { height: rafterLen, diameter: 0.05 },
        scene
      );
      rafter.position = new Vector3(x, (ridgeY + eaveY) / 2, side * halfWidth / 2);
      rafter.rotation.x = side * Math.atan2(halfWidth, ridgeY - eaveY) - Math.PI / 2;
      rafter.material = frameMat;
    }
  }

  // Ridge beam (top long axis)
  const ridge = MeshBuilder.CreateCylinder(
    'ridge',
    { height: bedLen + 1, diameter: 0.07 },
    scene
  );
  ridge.position = new Vector3(0, ridgeY, 0);
  ridge.rotation.z = Math.PI / 2;
  ridge.material = frameMat;

  // Eave beams (long axis at eave height)
  for (const side of [-1, 1]) {
    const eave = MeshBuilder.CreateCylinder(
      `eave_${side}`,
      { height: bedLen + 1, diameter: 0.05 },
      scene
    );
    eave.position = new Vector3(0, eaveY, side * halfWidth);
    eave.rotation.z = Math.PI / 2;
    eave.material = frameMat;
  }

  // Roof panels (translucent polycarbonate)
  const roofMat = new PBRMaterial('roofMat', scene);
  roofMat.albedoColor = Color3.FromHexString('#dfe8e0');
  roofMat.alpha = 0.18;
  roofMat.metallic = 0.0;
  roofMat.roughness = 0.12;
  roofMat.indexOfRefraction = 1.49;
  roofMat.backFaceCulling = false;
  roofMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
  roofMat.environmentIntensity = 1.2;

  for (const side of [-1, 1]) {
    const slopeLen = Math.sqrt(halfWidth * halfWidth + (ridgeY - eaveY) * (ridgeY - eaveY));
    const panel = MeshBuilder.CreatePlane(
      `roof_${side}`,
      { width: bedLen + 1, height: slopeLen },
      scene
    );
    panel.position = new Vector3(0, (ridgeY + eaveY) / 2, side * halfWidth / 2);
    panel.rotation.x = -side * Math.atan2(halfWidth, ridgeY - eaveY);
    panel.rotation.y = side > 0 ? 0 : Math.PI;
    panel.material = roofMat;
  }

  // Side wall panels (translucent)
  for (const side of [-1, 1]) {
    const wall = MeshBuilder.CreatePlane(
      `wall_${side}`,
      { width: bedLen + 1, height: eaveY },
      scene
    );
    wall.position = new Vector3(0, eaveY / 2, side * halfWidth);
    wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    wall.material = roofMat;
  }

  // Overhead training wires (two parallel cables, then per-plant vertical strings)
  const wireMat = new PBRMaterial('wireMat', scene);
  wireMat.albedoColor = Color3.FromHexString('#888888');
  wireMat.metallic = 0.8;
  wireMat.roughness = 0.4;

  const wireY = 3.4;
  for (const wireZ of [-0.15, 0.15]) {
    const wire = MeshBuilder.CreateCylinder(
      `wire_${wireZ}`,
      { height: bedLen + 0.5, diameter: 0.004 },
      scene
    );
    wire.position = new Vector3(0, wireY, wireZ);
    wire.rotation.z = Math.PI / 2;
    wire.material = wireMat;
  }

  // Vertical training strings per plant (white twine)
  const stringMat = new PBRMaterial('stringMat', scene);
  stringMat.albedoColor = Color3.FromHexString('#e0d8c8');
  stringMat.metallic = 0;
  stringMat.roughness = 0.9;

  for (const plant of SCENARIO.plants) {
    for (const stringZ of [-0.15, 0.15]) {
      const str = MeshBuilder.CreateCylinder(
        `string_${plant.id}_${stringZ}`,
        { height: wireY - SCENARIO.bedY, diameter: 0.002 },
        scene
      );
      str.position = new Vector3(plant.position[0], (wireY + SCENARIO.bedY) / 2, stringZ);
      str.material = stringMat;
    }
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

  // GrowthEngine — drives the live showcase plant.
  // Greenhouse environment params can be tweaked from this single seam.
  const growthEngine = new GrowthEngine();
  growthEngine.setEnvironment({
    temperatureC: 23,
    humidity: 0.7,
    lightHoursPerDay: 14,
    co2ppm: 800,
    substrateWater: 0.6,
    nutrientEC: 3.0,
  });
  const SHOWCASE_SEED = 20260520;
  growthEngine.addPlant({ seed: SHOWCASE_SEED });

  const leafMat = getLeafMaterial(scene);
  const showcasePlantIndex = Math.floor(SCENARIO.plantCount / 2);
  const showcasePlantSpec = SCENARIO.plants[showcasePlantIndex];
  const showcasePlant = createShowcasePlant(
    scene,
    growthEngine,
    SHOWCASE_SEED,
    new Vector3(
      showcasePlantSpec.position[0],
      showcasePlantSpec.position[1],
      showcasePlantSpec.position[2]
    )
  );

  for (let pi = 0; pi < SCENARIO.plantCount; pi++) {
    const distFromCenter = Math.abs(pi - showcasePlantIndex);
    const isShowcase = distFromCenter === 0;
    if (isShowcase) continue; // showcase plant is rendered by ShowcasePlant from GrowthEngine
    const isNearShowcase = distFromCenter <= 2;

    let leafCount: number;
    let leafScale: number;
    let leafletCount: number;
    if (isShowcase) {
      leafCount = 7;
      leafScale = 2.0;
      leafletCount = 7;
    } else if (isNearShowcase) {
      leafCount = 6;
      leafScale = 1.7;
      leafletCount = 7;
    } else if (distFromCenter <= 6) {
      leafCount = 4;
      leafScale = 1.3;
      leafletCount = 5;
    } else {
      leafCount = 3;
      leafScale = 1.0;
      leafletCount = 3;
    }

    const plantNode = plantNodes[pi];
    for (let i = 0; i < leafCount; i++) {
      const t = i / Math.max(1, leafCount - 1);
      const heightY = 0.4 + t * 1.3;
      const ageFrac = Math.min(1, (1 - t) * 0.9);
      const maturity = 0.5 + (1 - t) * 0.5;

      for (const side of [-1, 1]) {
        const rng = new SeededRandom(2000 + pi * 1000 + i * 100 + (side > 0 ? 7 : 13));
        const leaf = createLeafMesh(
          `plant_${pi}_leaf_${i}_${side}`,
          scene,
          leafletCount,
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

    if (distFromCenter <= 8) {
      addFruitCluster(scene, plantNode, isShowcase ? 'full' : 'reduced');
    }
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
    growthEngine,
    showcasePlant,
    plantNodes,
    update(day) {
      heatmap.update(day);
      robot.update(day);
      pathTrail.update(day);
      uwb.update(robot.currentPosition());
      showcasePlant.update(day);

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
