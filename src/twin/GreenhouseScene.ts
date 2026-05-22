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
import { createTubeRail } from './TubeRail';
import { createBedStands } from './BedStands';
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

  // Multi-bed layout — five parallel hanging beds along Z.
  // The center bed (Z=0) carries the simulation's 90 plants + heatmap;
  // the four sister beds are visual-only (cocopeat-prepped, awaiting
  // the next planting cycle), which matches the reference photos of
  // empty K-smartfarm interiors.
  const BED_Z_POSITIONS = [-6, -3, 0, 3, 6] as const;

  const bedMat = new PBRMaterial('bedMat', scene);
  bedMat.albedoColor = Color3.FromHexString('#c0c0b8');
  bedMat.metallic = 0.75;
  bedMat.roughness = 0.3;

  for (const [bedIdx, bedZ] of BED_Z_POSITIONS.entries()) {
    const bed = MeshBuilder.CreateBox(
      `bed_${bedIdx}`,
      { width: bedLen, height: 0.15, depth: 0.35 },
      scene
    );
    bed.position = new Vector3(0, SCENARIO.bedY - 0.075, bedZ);
    bed.material = bedMat;
    bed.receiveShadows = true;
  }

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

  // Roof + wall polycarbonate.
  //
  // Two non-obvious settings, both load-bearing for visual correctness:
  //
  //  1. needDepthPrePass = true
  //     Without it, the alpha-blended polycarb is drawn *after* opaque
  //     geometry but doesn't depth-test cleanly against leaf chunks
  //     that use alpha-test. The wall behind the bed then bleeds a
  //     milky tint across the leaves in front of it (classic
  //     transparent-over-alpha-tested ordering bug). Forcing a
  //     depth-only pre-pass fixes that — the polycarb still blends
  //     correctly where it's actually closer than the plants.
  //
  //  2. environmentIntensity kept low (0.5).
  //     The HDRI reflection on a near-transparent surface was
  //     producing a strong white sheen that read as "fog over the
  //     plants" in the viewer's image. 0.5 keeps a hint of sky tint
  //     but stops the milkiness.
  //
  // Alpha also lowered (0.18 → 0.08) so the polycarb reads as truly
  // glassy — real horticultural polycarbonate is closer to this.
  const roofMat = new PBRMaterial('roofMat', scene);
  roofMat.albedoColor = Color3.FromHexString('#dfe8e0');
  roofMat.alpha = 0.08;
  roofMat.metallic = 0.0;
  roofMat.roughness = 0.12;
  roofMat.indexOfRefraction = 1.49;
  roofMat.backFaceCulling = false;
  roofMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
  roofMat.environmentIntensity = 0.5;
  roofMat.needDepthPrePass = true;

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
  //
  // Rotation: default plane lies in XY (normal +Z). Rotating around Y by
  // ±π/2 puts it in the YZ plane (normal ±X). "Width" then runs along Z,
  // matching halfWidth*2; "height" stays along Y, matching ridgeY.
  for (const xSign of [-1, 1]) {
    const endWall = MeshBuilder.CreatePlane(
      `endwall_${xSign}`,
      { width: halfWidth * 2, height: ridgeY },
      scene
    );
    endWall.position = new Vector3(xSign * halfLen, ridgeY / 2, 0);
    endWall.rotation.y = xSign > 0 ? -Math.PI / 2 : Math.PI / 2;
    endWall.material = roofMat;
  }

  // Overhead training wires (two parallel cables, then per-plant vertical strings)
  const wireMat = new PBRMaterial('wireMat', scene);
  wireMat.albedoColor = Color3.FromHexString('#888888');
  wireMat.metallic = 0.8;
  wireMat.roughness = 0.4;

  // Overhead training wires + per-plant strings — replicated above
  // every bed (the wire grid is the building-wide infrastructure that
  // tomato vines are tied to). String offsets ±0.15m are relative to
  // each bed's center Z.
  const wireY = 3.4;
  for (const [bedIdx, bedZ] of BED_Z_POSITIONS.entries()) {
    for (const wireOffset of [-0.15, 0.15]) {
      const wire = MeshBuilder.CreateCylinder(
        `wire_b${bedIdx}_${wireOffset}`,
        { height: bedLen + 0.5, diameter: 0.004 },
        scene
      );
      wire.position = new Vector3(0, wireY, bedZ + wireOffset);
      wire.rotation.z = Math.PI / 2;
      wire.material = wireMat;
    }
  }

  // Vertical training strings per plant (white twine) — one string
  // per plant slot per bed.
  const stringMat = new PBRMaterial('stringMat', scene);
  stringMat.albedoColor = Color3.FromHexString('#e0d8c8');
  stringMat.metallic = 0;
  stringMat.roughness = 0.9;

  for (const [bedIdx, bedZ] of BED_Z_POSITIONS.entries()) {
    for (const plant of SCENARIO.plants) {
      for (const stringOffset of [-0.15, 0.15]) {
        const str = MeshBuilder.CreateCylinder(
          `string_b${bedIdx}_${plant.id}_${stringOffset}`,
          { height: wireY - SUBSTRATE_TOP_Y, diameter: 0.002 },
          scene
        );
        str.position = new Vector3(
          plant.position[0],
          (wireY + SUBSTRATE_TOP_Y) / 2,
          bedZ + stringOffset,
        );
        str.material = stringMat;
      }
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

  // Per-bed seed namespace — each bed's plants get a stride-PLANT_COUNT
  // block so seeds never collide and each plant remains uniquely
  // procedural (genome, leaf shape, fruit count etc. all seed-driven).
  // The middle bed (Z=0) keeps the canonical SHOWCASE_SEED at its
  // center slot so the showcase plant doesn't drift between runs.
  const MAIN_BED_IDX = BED_Z_POSITIONS.indexOf(0);
  const PLANT_BLOCK = SCENARIO.plantCount;          // 90
  const plantSeedFor = (bedIdx: number, slot: number): number => {
    if (bedIdx === MAIN_BED_IDX && slot === showcasePlantIndex) return SHOWCASE_SEED;
    return SHOWCASE_SEED + 1 + bedIdx * PLANT_BLOCK + slot;
  };

  // Register every plant across all five beds with the growth engine.
  // No hardcoded shape data — engine.getGenome(seed) yields a fresh
  // genome per seed (height curve, fruit ploidy, leaf turn etc.).
  for (let bedIdx = 0; bedIdx < BED_Z_POSITIONS.length; bedIdx++) {
    for (let slot = 0; slot < PLANT_BLOCK; slot++) {
      growthEngine.addPlant({ seed: plantSeedFor(bedIdx, slot) });
    }
  }

  // Cocopeat grow bags row + substrate mounds — bag top now occupies
  // y ∈ [0.95, 1.05]. Plant root y is lifted from scenario's bedY
  // (0.95) up to SUBSTRATE_TOP_Y (1.062) so the stem appears to
  // emerge from the brown mound visible through each bag hole.
  //
  // Replicated across all five beds (the four sister rows are visually
  // identical but get no plants — see comment near BED_Z_POSITIONS).
  for (const [bedIdx, bedZ] of BED_Z_POSITIONS.entries()) {
    createCocopeatBags(scene, { centerZ: bedZ, instanceTag: `bed${bedIdx}` });
  }

  // Bed support legs — without these the cocopeat bag rows visibly
  // float at Y=0.95 from any low or interior camera. One merged-mesh
  // stand per bed (two posts every 2m along the length).
  for (const [bedIdx, bedZ] of BED_Z_POSITIONS.entries()) {
    createBedStands(scene, {
      centerZ: bedZ,
      lengthM: bedLen,
      bedTopY: SCENARIO.bedY,
      material: frameMat,
      instanceTag: `bed${bedIdx}`,
    });
  }

  // Tube rails — pair of pipes laid in each aisle for the robot/cart
  // to roll on. Gauge 55cm per K-smartfarm spec; hairpin loops cap
  // both X ends.
  const AISLE_Z_POSITIONS = [-4.5, -1.5, 1.5, 4.5] as const;
  for (const [aisleIdx, aisleZ] of AISLE_Z_POSITIONS.entries()) {
    createTubeRail(scene, {
      centerZ: aisleZ,
      lengthM: bedLen,
      instanceTag: `aisle${aisleIdx}`,
    });
  }

  // Showcase plant — heavy-LOD, unique to the main bed (Z=0). Sits in
  // the canonical slot (middle of the bed) so it picks up the same
  // SCENARIO data that feeds the heatmap + capture sessions.
  const showcasePlant = createShowcasePlant(
    scene,
    growthEngine,
    SHOWCASE_SEED,
    new Vector3(
      showcasePlantSpec.position[0],
      SUBSTRATE_TOP_Y,
      0  // main bed Z
    )
  );

  // Supporting plants — Light-LOD, GrowthEngine-driven. We fill all
  // five beds with the same 90-slot grid, skipping the showcase's slot
  // on the main bed (one slot replaced by the heavy-LOD showcase).
  //
  // Each plant's seed is unique (see plantSeedFor) so leaf shapes,
  // fruit counts, height curves etc. are all procedurally different —
  // no preset / hardcoded values per stem.
  //
  // Rebuild staggering: each plant rebuilds its geometry every ~2
  // sim-days. With ~449 supports, spreading them across the 2-day
  // window keeps the per-frame GC bounded.
  const supportingPlants: SupportingPlantHandle[] = [];
  // Parallel to supportingPlants. For main-bed plants this is the
  // SCENARIO.plants index (drives health label per day). For sister
  // beds it's -1 — the plant runs on its own engine seed with default
  // health (visual-only).
  const supportingPlantSlotIds: number[] = [];
  let supportIdx = 0;
  const totalSupports = BED_Z_POSITIONS.length * PLANT_BLOCK - 1; // minus showcase slot

  for (let bedIdx = 0; bedIdx < BED_Z_POSITIONS.length; bedIdx++) {
    const bedZ = BED_Z_POSITIONS[bedIdx];
    const isMainBed = bedIdx === MAIN_BED_IDX;
    for (let slot = 0; slot < PLANT_BLOCK; slot++) {
      if (isMainBed && slot === showcasePlantIndex) continue;
      const spec = SCENARIO.plants[slot];
      const rebuildOffset = (supportIdx / totalSupports) * 2.0;
      supportingPlants.push(
        createSupportingPlant(
          scene,
          growthEngine,
          plantSeedFor(bedIdx, slot),
          new Vector3(spec.position[0], SUBSTRATE_TOP_Y, bedZ),
          rebuildOffset
        )
      );
      supportingPlantSlotIds.push(isMainBed ? slot : -1);
      supportIdx++;
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
        const slotId = supportingPlantSlotIds[i];
        if (slotId < 0) {
          // Sister-bed plant — no scenario health track; use 'normal'.
          supportingPlants[i].update(day, 'normal', waterStressOverride);
          continue;
        }
        const plant = SCENARIO.plants[slotId];
        const snap = plant.daily[Math.min(plant.daily.length - 1, dayIdx)];
        supportingPlants[i].update(day, snap.health, waterStressOverride);
      }
    },
    onZoneHover(cb) { hoverCb = cb; },
    onZoneClick(cb) { clickCb = cb; },
  };
}
