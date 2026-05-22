import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { SeededRandom } from '@farmsim/tomato-engine';
import { SCENARIO } from '../data/mockScenario';
import { createLeafMesh, getLeafMaterial } from '../plant/LeafGenerator';
import { createHeatmap, type HeatmapHandle } from './Heatmap';
import { createRobot, type RobotHandle } from './Robot';
import { createPathTrail, type PathTrailHandle } from './PathTrail';
import { attachZonePicker } from './ZonePicker';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { GrowthEngine } from '@farmsim/tomato-engine';
import { useTwinStore } from '../store/twinStore';
import { createShowcasePlant, type ShowcasePlantHandle } from './ShowcasePlant';
import { createSupportingPlant, type SupportingPlantHandle } from './SupportingPlant';
import { createPlantLODManager } from './PlantLODManager';
import { createCocopeatBags, SUBSTRATE_TOP_Y } from './CocopeatBags';
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
  growthEngine: GrowthEngine;
  showcasePlant: ShowcasePlantHandle;
  supportingPlants: SupportingPlantHandle[];
  plantLOD: import('./PlantLODManager').PlantLODManagerHandle;
  update: (day: number) => void;
  onZoneHover: (cb: (zoneId: number | null) => void) => void;
  onZoneClick: (cb: (zoneId: number | null) => void) => void;
}

export function buildGreenhouseScene(scene: Scene): GreenhouseSceneHandle {
  const bedLen = SCENARIO.bedLengthM;

  // Greenhouse footprint floor — sized to match the structural envelope
  // so the floor visually fills the building.
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: bedLen + 4, height: 24, subdivisions: 4 },
    scene
  );
  const groundMat = new PBRMaterial('groundMat', scene);
  // Lift the ground albedo into the light theme so it doesn't read as a
  // dark slab against the #e8e6df UI. Tinting the white-texture sample
  // toward a warm cream matches the reference's gradient floor.
  groundMat.albedoColor = Color3.FromHexString('#d9d3bf');
  groundMat.albedoTexture = getGroundAlbedoTexture(scene);
  groundMat.bumpTexture = getGroundNormalTexture(scene);
  groundMat.metallic = 0;
  groundMat.roughness = 0.88;
  groundMat.environmentIntensity = 0.6;
  ground.material = groundMat;
  ground.receiveShadows = true;

  const path = MeshBuilder.CreateGround(
    'path',
    { width: bedLen, height: 1.2, subdivisions: 1 },
    scene
  );
  path.position = new Vector3(0, 0.005, 1.5);
  const pathMat = new PBRMaterial('pathMat', scene);
  // Light walkway tint, matches the reference's pale concrete look.
  pathMat.albedoColor = Color3.FromHexString('#b6b3a4');
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

  // Real Korean smart-farm greenhouse footprint: ~24m wide × ~34m long,
  // with eaves at 5.5m and ridge at 7m. This generously envelopes the
  // 30m × 0.35m bed in the middle and leaves room for future multi-bed
  // expansion. End walls cap the long axis (no more "infinite tunnel").
  const ridgeY = 7.0;
  const eaveY = 5.5;
  const halfWidth = 12.0;
  const endMargin = 2.0;
  const halfLen = bedLen / 2 + endMargin;

  // A-frames spaced every 4m along the length.
  for (let i = 0; i <= bedLen / 4; i++) {
    const x = -bedLen / 2 + i * 4;
    // Side posts (vertical)
    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateCylinder(
        `post_${i}_${side}`,
        { height: eaveY, diameter: 0.08 },
        scene
      );
      post.position = new Vector3(x, eaveY / 2, side * halfWidth);
      post.material = frameMat;
    }
    // Roof rafters — go from eave (Z=±halfWidth, Y=eaveY) to ridge (Z=0, Y=ridgeY).
    // Cylinder default extends along +Y; we tilt it by the slope angle so its
    // ends land exactly at eave/ridge. Sign by side direction.
    for (const side of [-1, 1]) {
      const rafterLen = Math.sqrt(halfWidth * halfWidth + (ridgeY - eaveY) * (ridgeY - eaveY));
      const rafter = MeshBuilder.CreateCylinder(
        `rafter_${i}_${side}`,
        { height: rafterLen, diameter: 0.06 },
        scene
      );
      rafter.position = new Vector3(x, (ridgeY + eaveY) / 2, side * halfWidth / 2);
      rafter.rotation.x = -side * Math.atan2(halfWidth, ridgeY - eaveY);
      rafter.material = frameMat;
    }
  }

  // End-cap frames (front + back walls of the greenhouse).
  for (const xSign of [-1, 1]) {
    const xEnd = xSign * halfLen;
    // Vertical end posts at the four corners + middle
    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateCylinder(
        `endpost_${xSign}_${side}`,
        { height: eaveY, diameter: 0.08 },
        scene
      );
      post.position = new Vector3(xEnd, eaveY / 2, side * halfWidth);
      post.material = frameMat;
    }
    // Center support post under the ridge at each end
    const center = MeshBuilder.CreateCylinder(
      `endcenter_${xSign}`,
      { height: ridgeY, diameter: 0.08 },
      scene
    );
    center.position = new Vector3(xEnd, ridgeY / 2, 0);
    center.material = frameMat;
  }

  // Ridge beam (top long axis)
  const ridge = MeshBuilder.CreateCylinder(
    'ridge',
    { height: halfLen * 2, diameter: 0.08 },
    scene
  );
  ridge.position = new Vector3(0, ridgeY, 0);
  ridge.rotation.z = Math.PI / 2;
  ridge.material = frameMat;

  // Eave beams (long axis at eave height)
  for (const side of [-1, 1]) {
    const eave = MeshBuilder.CreateCylinder(
      `eave_${side}`,
      { height: halfLen * 2, diameter: 0.06 },
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

  const slopeLen = Math.sqrt(halfWidth * halfWidth + (ridgeY - eaveY) * (ridgeY - eaveY));
  for (const side of [-1, 1]) {
    const panel = MeshBuilder.CreatePlane(
      `roof_${side}`,
      { width: halfLen * 2, height: slopeLen },
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
      { width: halfLen * 2, height: eaveY },
      scene
    );
    wall.position = new Vector3(0, eaveY / 2, side * halfWidth);
    wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    wall.material = roofMat;
  }

  // End walls (front + back) — flat rectangular panels at X = ±halfLen,
  // with a triangular gable section above the eave to match the roof slope.
  // We approximate the gable + rectangular wall as a single plane covering
  // the full ridge height; the polycarb is translucent so the visual
  // difference vs a precise gable cutout is minimal.
  for (const xSign of [-1, 1]) {
    const endWall = MeshBuilder.CreatePlane(
      `endwall_${xSign}`,
      { width: halfWidth * 2, height: ridgeY },
      scene
    );
    endWall.position = new Vector3(xSign * halfLen, ridgeY / 2, 0);
    endWall.rotation.y = xSign > 0 ? Math.PI : 0;
    endWall.material = roofMat;
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

  // Strings tie into the substrate mound (SUBSTRATE_TOP_Y) now, not
  // the bed top, so they visually meet the plant stem base rather
  // than disappearing into the bag.
  for (const plant of SCENARIO.plants) {
    for (const stringZ of [-0.15, 0.15]) {
      const str = MeshBuilder.CreateCylinder(
        `string_${plant.id}_${stringZ}`,
        { height: wireY - SUBSTRATE_TOP_Y, diameter: 0.002 },
        scene
      );
      str.position = new Vector3(plant.position[0], (wireY + SUBSTRATE_TOP_Y) / 2, stringZ);
      str.material = stringMat;
    }
  }

  // GrowthEngine — drives all 30 plants (showcase + 29 supporting).
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
  const showcasePlantIndex = Math.floor(SCENARIO.plantCount / 2);
  const showcasePlantSpec = SCENARIO.plants[showcasePlantIndex];

  // Register all 30 plants — showcase gets the canonical seed,
  // supporting plants get derivatives so they share the same scenario day
  // schedule but otherwise look like individuals.
  growthEngine.addPlant({ seed: SHOWCASE_SEED });
  for (let i = 0; i < SCENARIO.plantCount; i++) {
    if (i === showcasePlantIndex) continue;
    growthEngine.addPlant({ seed: SHOWCASE_SEED + 1 + i });
  }

  // Cocopeat grow bags row + substrate mounds — bag top now occupies
  // y ∈ [0.95, 1.05]. Plant root y is lifted from scenario's bedY
  // (0.95) up to SUBSTRATE_TOP_Y (1.062) so the stem appears to
  // emerge from the brown mound visible through each bag hole.
  createCocopeatBags(scene);

  const showcasePlant = createShowcasePlant(
    scene,
    growthEngine,
    SHOWCASE_SEED,
    new Vector3(
      showcasePlantSpec.position[0],
      SUBSTRATE_TOP_Y,
      showcasePlantSpec.position[2]
    )
  );

  // Supporting plants — 29 Light-LOD GrowthEngine-driven plants
  // (replaces the old "scale static foliage by heightCm/220" path).
  // Stagger rebuilds by spreading each plant's offset across the
  // 2-day rebuild window, so dispose/create work is amortized across
  // many frames instead of bunching every 2 sim-days.
  const supportingPlants: SupportingPlantHandle[] = [];
  const supportingPlantIds: number[] = []; // parallel array → SCENARIO.plants[id]
  let supportIdx = 0;
  for (let i = 0; i < SCENARIO.plantCount; i++) {
    if (i === showcasePlantIndex) continue;
    const spec = SCENARIO.plants[i];
    const rebuildOffset = (supportIdx / 29) * 2.0; // 0 → ~2 days
    supportingPlants.push(
      createSupportingPlant(
        scene,
        growthEngine,
        SHOWCASE_SEED + 1 + i,
        new Vector3(spec.position[0], SUBSTRATE_TOP_Y, spec.position[2]),
        rebuildOffset
      )
    );
    supportingPlantIds.push(i);
    supportIdx++;
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

  const plantLOD = createPlantLODManager(scene, scene.activeCamera!, supportingPlants);

  return {
    heatmap,
    robot,
    pathTrail,
    growthEngine,
    showcasePlant,
    supportingPlants,
    plantLOD,
    update(day) {
      heatmap.update(day);
      robot.update(day);
      pathTrail.update(day);
      showcasePlant.update(day);
      // Wire each supporting plant to its mockScenario healthLabel
      // → engine env override + stress inputs.
      const dayIdx = Math.max(0, Math.min(SCENARIO.durationDays, Math.floor(day)));
      const waterStressOverride = useTwinStore.getState().waterStressOverride;
      for (let i = 0; i < supportingPlants.length; i++) {
        const plant = SCENARIO.plants[supportingPlantIds[i]];
        const snap = plant.daily[Math.min(plant.daily.length - 1, dayIdx)];
        supportingPlants[i].update(day, snap.health, waterStressOverride);
      }
    },
    onZoneHover(cb) { hoverCb = cb; },
    onZoneClick(cb) { clickCb = cb; },
  };
}
