// Scientific growth model for tomato plant
// Per-plant parameterization via PlantGenome

import type { PlantGenome } from './PlantGenome';
import { computePhysics } from './PhysicsModel';
import type { Cultivar } from './Cultivar';
import { sampleCultivarGenome, getCultivar, samplePlantArchitecture, getScenario } from './Cultivar';
import { SeededRandom } from './SeededRandom';
import { ACTIVE_MODEL, ACTIVE_TRAINING, ACTIVE_BOTANICAL } from './ModelRegistry';
import {
  approximateTT,
  phytomerCountFromTT,
  type SimulationContext,
} from './SimulationContext';
import { ACTIVE_ENGINE_MODE, setEngineMode } from './EngineMode';
import { leafletCountFromMaturity } from './LeafStage';

// Phase 3: hybrid is now the default. Legacy sigmoid path remains as
// fallback for paths that don't supply a physiology state.
setEngineMode('hybridFspmMode');

export const TOTAL_DAYS = 120;

export const STAGE_COLORS: [number, number, number][] = [
  [34, 120, 30],    // 녹숙기
  [140, 148, 50],   // 변색기
  [185, 110, 60],   // 채색기
  [210, 80, 65],    // 도색기
  [215, 50, 40],    // 담적색기
  [195, 30, 22],    // 완숙기
];

export const GROWTH_STAGES = [
  { name: '육묘기', dayStart: 0, dayEnd: 10 },
  { name: '영양생장기', dayStart: 10, dayEnd: 35 },
  { name: '개화기', dayStart: 35, dayEnd: 50 },
  { name: '착과기', dayStart: 50, dayEnd: 70 },
  { name: '과실비대기', dayStart: 70, dayEnd: 95 },
  { name: '숙성기', dayStart: 95, dayEnd: 120 },
] as const;

export const RIPEN_NAMES = ['녹숙기', '변색기', '채색기', '도색기', '담적색기', '완숙기'];

function sigmoid(x: number, k: number, mid: number): number {
  return 1 / (1 + Math.exp(-k * (x - mid)));
}

export interface FruitState {
  index: number;
  diameterMm: number;
  ripenStage: number;
  ripenFraction: number;
  color: [number, number, number];
  age: number;
  /** Per-fruit morphology + color variance sample, drawn from the
   *  plant's cultivar distribution at first fruit appearance. Carries
   *  locule count, H:W ratio, ribbing strength, asymmetry RNG seed,
   *  surface-mottle RNG seed, ripeningSpeedFactor, and blossom-end
   *  advance fraction. Used by the visual layer (FruitGenerator) to
   *  individualize geometry and per-vertex color — different shape
   *  and surface for every single fruit.
   *  Optional for back-compat with code paths that pre-date Phase 4. */
  cultivarGenome?: import('./Cultivar').CultivarSample;
}

export interface FlowerState {
  index: number;
  bloomProgress: number;
}

export interface TrussState {
  flowers: FlowerState[];
  fruits: FruitState[];
}

export type BudState = 'dormant' | 'growing' | 'pruned';

/** Recursive stem axis — main stem + side shoots tree. Visual layer
 *  iterates `allAxes` flat array; engine can walk via `parentAxisIdx`. */
export interface StemAxis {
  /** 0 = main stem, 1 = 1st-order side shoot, 2 = 2nd-order. */
  order: number;
  /** NodeState[] of this axis. main axis nodes === plant.nodes (alias). */
  nodes: NodeState[];
  /** Index of the parent axis's node that this branched from. null for main. */
  parentNodeIdx: number | null;
  /** Index of parent axis in plant.allAxes. null for main. */
  parentAxisIdx: number | null;
  /** Branch azimuth from parent's tangent frame (radians). */
  branchAzimuth: number;
}

export interface NodeState {
  index: number;
  heightCm: number;
  phyllotaxisAngle: number;
  leafMaturity: number;
  leafSizeFactor: number;
  leafletCount: number;
  yellowing: number;
  droopExtra: number;
  truss: TrussState | null;
  age: number;
  emergence: number; // 0-1: newest node's emergence fraction
  // Science-based fields
  leafAreaCm2: number;       // estimated leaf area (cm²)
  leafMassG: number;         // leaf fresh weight (g) — for droop/physics
  internodeLenCm: number;    // internode length at this node (cm)
  // Physics (populated by PhysicsModel)
  massAboveKg: number;
  stemRadiusMm: number;
  bendingMomentNm: number;
  deflectionRad: number;
  deflectionAzimuth: number;
  // Stress fields (plant-level, copied per node for convenient access)
  waterStress: number;       // 0-1, substrateWater 가 0.45 미만이면 증가
  diseaseLoad: number;       // 0-1, healthLabel 'disease' 일 때 증가

  // ── Skeleton growth (Plan 3a) ────────────────────────────────────
  // Accumulated 3D position (meters, world units) computed via direction
  // synthesis (prevDir + up + light + noise - gravity). Never a straight
  // line — every internode picks its own direction from the previous +
  // small noise. heightCm above is just the Y-component-ish summary;
  // position is the authoritative coordinate.
  position: { x: number; y: number; z: number };
  /** Unit vector — direction the next internode departs in (world). */
  growthDir: { x: number; y: number; z: number };

  // ── Axillary bud & side shoot (Plan 3a) ──────────────────────────
  budState: BudState;
  /** Recursive side shoot from this node's leaf axil, when activated. */
  sideShoot: StemAxis | null;
  /** Side shoot departure angle (degrees from stem tangent). */
  sideShootAngleDeg: number | null;
}

export interface PlantState {
  seed: number;
  day: number;
  heightCm: number;
  nodes: NodeState[];
  nodeCount: number;
  leafCount: number;
  trussCount: number;
  totalFruits: number;
  maxRipenStage: number;
  currentStage: { name: string; dayStart: number; dayEnd: number };
  hasCotyledons: boolean;
  cotyledonSize: number;
  // Plant-level stress (mirrored per-node for convenience)
  waterStress: number;
  diseaseLoad: number;

  // ── Skeleton (Plan 3a) ───────────────────────────────────────────
  /** Main stem axis. main.nodes === plant.nodes (alias). */
  mainAxis: StemAxis;
  /** Flat list of every axis (main + all side shoots, recursive). */
  allAxes: StemAxis[];

  // ── Geometry mode (v3.0 Phase 5.5) ───────────────────────────────
  /** 'free' = apex still growing upward; 'wire_compressed' = capped at
   *  training.maxPlantHeightCm and sliding horizontally along the wire. */
  geometryMode: 'free' | 'wire_compressed';
}

/** Per-plant stress inputs that the renderer / health-label system can pass in. */
export interface PlantStressInputs {
  /** 0–1: derived from substrateWater (engine sets this from env) */
  waterStress?: number;
  /** 0–1: derived from healthLabel === 'disease' or sensor input */
  diseaseLoad?: number;
}

/**
 * Overlay a TOMGRO physiology-derived fruit set onto a sigmoid PlantState.
 *
 * The sigmoid PlantState already carries the full plant structure
 * (nodes / leaves / stem / truss attachment positions). What we replace
 * is the *fruit content* of each truss — TOMGRO's per-fruit diameter,
 * ripening stage, color, and cultivarGenome — so the visual matches
 * the academic model. Result: fruit ripening transitions visibly in
 * 1-minute steps in single-plant mode.
 *
 * Trusses are matched by index (truss 0 of physiology → first non-null
 * truss of base PlantState). Bases without a matching physiology truss
 * keep their sigmoid fruits.
 *
 * Used by Single-Plant Analysis mode (ShowcasePlant.update receives
 * the optional physiology parameter).
 */
export function overlayPhysiologyFruits(
  base: PlantState,
  physiology: import('./CoreModel').PlantPhysiologyState,
): PlantState {
  // Locate every truss-bearing node in the base state, in order.
  const baseTrussNodes = base.nodes.filter((n) => n.truss !== null);

  // --- Leaf size scaling (Phase 4 second half) ---
  // The sigmoid PlantState's leaves at e.g. Day 105 look sparse compared
  // to what the TOMGRO model says the canopy LAI should be (3.22 vs
  // sigmoid's much smaller implicit area). Scale every leaf node's
  // leafSizeFactor + leafAreaCm2 so the visible total matches
  // physiology.LAI · plantFootprintM2.
  let currentLeafAreaCm2 = 0;
  for (const n of base.nodes) {
    if (!n.truss) currentLeafAreaCm2 += n.leafAreaCm2 * (1 - n.yellowing);
  }
  // physiology.LAI is m²/m² over the plant's footprint (default 0.4 m²
  // for K-smartfarm). Total leaf area target in cm²:
  const targetLeafAreaCm2 = physiology.LAI * 0.4 * 10000;
  const areaScale = currentLeafAreaCm2 > 1
    ? targetLeafAreaCm2 / currentLeafAreaCm2
    : 1;
  // Linear (radius) scale = √(area scale). Cap at 3× to avoid
  // pathological huge leaves if sigmoid is very sparse early on.
  const linearScale = Math.min(3.0, Math.max(0.5, Math.sqrt(areaScale)));

  const newNodes = base.nodes.map((node) => {
    // Scale leaves on ALL nodes (truss + non-truss alike — leaves
    // grow on truss nodes too in tomato anatomy).
    const scaledNode = {
      ...node,
      leafSizeFactor: node.leafSizeFactor * linearScale,
      leafAreaCm2: node.leafAreaCm2 * (linearScale * linearScale),
    };
    if (!node.truss) return scaledNode;
    const baseTrussIdx = baseTrussNodes.indexOf(node);
    const physTruss = physiology.trusses[baseTrussIdx];
    if (!physTruss) return scaledNode;

    // Map physiology fruits → FruitState. Filter out aborted + harvested.
    const liveFruits = physTruss.fruits.filter(
      (f) => !f.aborted && !f.harvested && f.fertilizationTT > 0,
    );
    const newFruitsState: FruitState[] = liveFruits.map((f, i) => {
      // Interpolate stage color from base palette (STAGE_COLORS).
      const stageIdx = Math.max(0, Math.min(5, f.ripenStage));
      const c1 = STAGE_COLORS[stageIdx];
      const c2 = STAGE_COLORS[Math.min(5, stageIdx + 1)];
      const color = lerpColor(c1, c2, f.ripenFraction);
      return {
        index: i,
        diameterMm: f.diameter,
        ripenStage: f.ripenStage,
        ripenFraction: f.ripenFraction,
        color,
        age: 0,
        cultivarGenome: f.genome,
      };
    });

    return {
      ...scaledNode,
      truss: {
        flowers: node.truss.flowers,   // keep sigmoid flowers (no physiology data)
        fruits: newFruitsState,
      },
    };
  });

  // Roll-up plant-level counts from the overlaid trusses.
  let totalFruits = 0;
  let maxRipenStage = 0;
  for (const n of newNodes) {
    if (!n.truss) continue;
    for (const f of n.truss.fruits) {
      totalFruits++;
      if (f.ripenStage > maxRipenStage) maxRipenStage = f.ripenStage;
    }
  }

  // Rewire mainAxis.nodes to the new nodes array so skeleton walks the
  // overlaid plant (preserves position / growthDir / sideShoot pointers
  // — these are spread by ...node so still present on each newNode).
  const newMainAxis: StemAxis = {
    ...base.mainAxis,
    nodes: newNodes,
  };
  // allAxes: main + every side shoot. Side shoots point at the OLD nodes
  // (their own internal nodes are not duplicated by the overlay), which
  // is fine — SkeletonOverlay only needs each axis's own positions.
  const newAllAxes: StemAxis[] = [newMainAxis, ...base.allAxes.slice(1)];

  return {
    ...base,
    nodes: newNodes,
    heightCm: physiology.heightCm,    // height from TOMGRO
    nodeCount: physiology.N,
    trussCount: physiology.trusses.length,
    totalFruits,
    maxRipenStage,
    mainAxis: newMainAxis,
    allAxes: newAllAxes,
  };
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

const GOLDEN_ANGLE = 137.508; // degrees

// ─────────────────────────────────────────────────────────────────────
// Skeleton growth helpers (Plan 3a) — direction synthesis (no straight
// internodes). prevDir × 0.65 + up × 0.25 + lightDir × 0.10 + noise × 0.12
// - gravity × sagFactor, then normalize. Every internode wanders slightly
// off-axis; same seed → same wandering. Matches FSPM reference §5.
// ─────────────────────────────────────────────────────────────────────

function normalize3(v: { x: number; y: number; z: number }) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// Restoring strength toward the anchor's vertical line. Lower = the stem can
// bend further before being pulled back; higher = the stem stays more rigidly
// vertical. 0.25 gives a visible bend while still keeping the plant within a
// rough ±30cm horizontal envelope around the anchor over a 3m stem.
const STEM_RESTORE_K = 0.25;

function synthesizeGrowthDir(
  prevDir: { x: number; y: number; z: number },
  prevPos: { x: number; y: number; z: number },
  anchor: { x: number; z: number },
  age: number,
  massAboveKg: number,
  rng: SeededRandom,
  sway: { amp: number; freq: number; phase: number },
): { x: number; y: number; z: number } {
  const noiseX = rng.gaussian(0, 0.12);
  const noiseY = rng.gaussian(0, 0.04);
  const noiseZ = rng.gaussian(0, 0.12);
  const sagFactor = Math.min(0.3, age * 0.0005 + massAboveKg * 0.02);

  // Per-plant sway: each plant rotates around its anchor at its own frequency
  // and phase, so two plants at the same height bend in different directions.
  const swayPhase = prevPos.y * sway.freq + sway.phase;
  const swayX = sway.amp * Math.cos(swayPhase);
  const swayZ = sway.amp * Math.sin(swayPhase);

  // Anchor restoring: pull the stem back toward the (anchor.x, anchor.z)
  // vertical line so the plant ends up "tied to a twine" — wanders, but stays
  // near vertical overall.
  const dx = prevPos.x - anchor.x;
  const dz = prevPos.z - anchor.z;

  // light = (0, 1, 0) approx noon sun direction (up). Phototropism weight 0.10.
  return normalize3({
    x: prevDir.x * 0.65 + noiseX + swayX - dx * STEM_RESTORE_K,
    y: prevDir.y * 0.65 + 0.25 + 0.10 + noiseY - sagFactor,
    z: prevDir.z * 0.65 + noiseZ + swayZ - dz * STEM_RESTORE_K,
  });
}

/**
 * Activate axillary buds across all axes. Each bud picks a side-shoot
 * direction (parent's growthDir rotated outward by branch angle) and
 * adds itself to plant.allAxes for the next growth tick to populate.
 *
 * Apical dominance: nodes near apex stay dormant; distance from apex
 * increases activation probability. Light exposure: upper nodes
 * activate faster. Pruning: cultivar.defoliationAggressiveness moves
 * activated buds to 'pruned' over time (real grower removes lateral
 * shoots — Tomimaru aggressiveness 0.32 ~ casual pruning).
 */
function activateAndPruneBuds(
  axes: StemAxis[],
  rng: SeededRandom,
  maxOrder: number,
): void {
  // v3.0 Phase 5 — all numeric thresholds come from the active training
  // spec (models/training/*.jsonc) so single-stem high-wire vs free-bush
  // produce visibly different canopies without a code change.
  const t = ACTIVE_TRAINING;
  const BASE_BUD_CHANCE = t.axillaryBud.baseActivationChance;
  const APICAL_DOMINANCE = t.axillaryBud.apicalDominance;
  const SIDE_SHOOT_DELAY = t.axillaryBud.delayDays;
  const LIGHT_FACTOR = t.axillaryBud.lightFactor;
  const PRUNE_DAILY = t.pruning.dailyPruneRate;

  for (const axis of axes) {
    if (axis.order >= maxOrder) continue;
    for (let i = 0; i < axis.nodes.length; i++) {
      const node = axis.nodes[i];
      if (node.budState === 'growing' && rng.next() < PRUNE_DAILY) {
        node.budState = 'pruned';
        continue;
      }
      if (node.budState !== 'dormant') continue;
      if (node.age < SIDE_SHOOT_DELAY) continue;
      if (node.sideShoot) continue;

      const distFromApex = axis.nodes.length - 1 - i;
      const dominanceFactor =
        distFromApex === 0 ? 0 : Math.max(0, 1 - APICAL_DOMINANCE / distFromApex);
      const lightExp = i / Math.max(1, axis.nodes.length);
      const activation =
        BASE_BUD_CHANCE * dominanceFactor * (1 + lightExp * LIGHT_FACTOR);

      if (rng.next() < activation) {
        node.budState = 'growing';
        const branchDeg = 35 + rng.gaussian(0, 8);
        node.sideShootAngleDeg = branchDeg;
        const branchAzimuth = (node.phyllotaxisAngle * Math.PI) / 180 + Math.PI / 2;
        node.sideShoot = {
          order: axis.order + 1,
          nodes: [],
          parentNodeIdx: i,
          parentAxisIdx: null,
          branchAzimuth,
        };
      }
    }
  }
}

/**
 * Build the starter chain of NodeStates for an activated side shoot.
 *
 * Each shoot node's leaf biology mirrors the main-axis model: leafMaturity
 * is a sigmoid of node age, leaf area/mass scale with leafSizeFactor², droop
 * accumulates from weight + age + senescence. Side-shoot leaves are *60%*
 * the size of main-axis leaves to reflect their secondary status.
 *
 * Internode length: 4-6 cm (real tomato side shoots are typically shorter
 * + wirier than main stem). Stem radius starts at 60% of parent's at that
 * node and tapers further toward the shoot tip.
 *
 * Plan 3c-1 — previously leafMaturity was hardcoded 0, leaving side shoots
 * visually as bare twigs in lush mode.
 */
function populateSideShootChain(
  parentNode: NodeState,
  shoot: StemAxis,
  allAxes: StemAxis[],
  genome: PlantGenome,
  cultivar: Cultivar,
  rng: SeededRandom,
  stress: { waterStress: number; diseaseLoad: number },
): void {
  const angleRad = ((parentNode.sideShootAngleDeg ?? 35) * Math.PI) / 180;
  const az = shoot.branchAzimuth;
  const startDir = normalize3({
    x: parentNode.growthDir.x * Math.cos(angleRad) + Math.cos(az) * Math.sin(angleRad),
    y: parentNode.growthDir.y * Math.cos(angleRad) + Math.sin(angleRad) * 0.3,
    z: parentNode.growthDir.z * Math.cos(angleRad) + Math.sin(az) * Math.sin(angleRad),
  });

  // Shoot age = parent age - lag for emergence. Younger shoots = fewer
  // nodes (apex hasn't grown that far yet).
  const shootAge = Math.max(0, parentNode.age - 5);
  const shootInternodes = Math.min(8, Math.floor(shootAge / 4));

  shoot.parentAxisIdx = 0;          // (currently only main has order=0)
  allAxes.push(shoot);

  // v3.0 Phase 5 — side-shoot leaf size + internode now from training JSONC.
  // Marcelis observation (~0.6 for single-stem high-wire) becomes the
  // default; free-bush retains ~0.7.
  const SHOOT_LEAF_SCALE = ACTIVE_TRAINING.sideShoot.leafScale;
  const SHOOT_INTERNODE_MU_M = ACTIVE_TRAINING.sideShoot.internodeLenCm.mu / 100;
  const SHOOT_INTERNODE_SIGMA_M = ACTIVE_TRAINING.sideShoot.internodeLenCm.sigma / 100;

  // Sigmoid params reused from main-axis biology.
  const leafExpK = genome.leafExpansionRate ?? 0.35;

  let pos = { ...parentNode.position };
  let dir = startDir;

  for (let k = 0; k < Math.max(1, shootInternodes); k++) {
    // Internode length — training-spec driven (Gaussian about cultivar mu).
    const internodeM = Math.max(
      0.02,
      SHOOT_INTERNODE_MU_M + (rng.next() - 0.5) * 2 * SHOOT_INTERNODE_SIGMA_M,
    );
    pos = {
      x: pos.x + dir.x * internodeM,
      y: pos.y + dir.y * internodeM,
      z: pos.z + dir.z * internodeM,
    };
    // Side shoots are out of scope for the Lever A' rework. Pass amp=0 and
    // anchor=pos so neither sway nor restoring kicks in — keeps pre-sway
    // shoot geometry byte-identical (modulo the new RNG calls in the genome).
    const nextDir = synthesizeGrowthDir(
      dir,
      pos,
      { x: pos.x, z: pos.z },
      shootAge,
      0,
      rng,
      { amp: 0, freq: 0, phase: 0 },
    );

    // Per-node age (older at base, younger at tip). Same biology as main.
    const nodeAge = Math.max(0, shootAge - k * 3);
    const leafExpansion = sigmoid(nodeAge, leafExpK, 9);
    const leafMaturity = Math.max(0.02, leafExpansion);

    // Position factor (peaks mid-shoot) — match main axis style.
    const nodeFrac = shootInternodes <= 1 ? 0.5 : k / (shootInternodes - 1);
    const positionFactor = Math.sin(nodeFrac * Math.PI);
    const potentialSize = (0.85 + 0.20 * positionFactor)
      * genome.leafSizeMultiplier * SHOOT_LEAF_SCALE;
    const leafSizeFactor = potentialSize * leafExpansion;

    // Leaf area / mass scale with leafSizeFactor² (same formula as main).
    const BASE_LEAF_AREA_CM2 = 880;
    const leafAreaCm2 = BASE_LEAF_AREA_CM2 * leafSizeFactor * leafSizeFactor;
    const leafMassG = 25 * leafSizeFactor * leafSizeFactor * leafMaturity;

    // Yellowing — side shoots typically don't reach senescence age before
    // pruning, but mirror the rule for completeness.
    const yellowing = nodeAge > 60 ? Math.min(1, (nodeAge - 60) / 30) : 0;

    // Droop — weight + age + senescence (water stress copies plant level).
    const armLenM = 0.18;             // shoot leaves stick out a bit shorter
    const DROOP_WEIGHT_COEFF = 6000;
    const weightDroop = (leafMassG / 1000) * armLenM * armLenM * DROOP_WEIGHT_COEFF;
    const ageDroop = nodeAge < 8
      ? 0
      : nodeAge < 20
        ? Math.min(25, (nodeAge - 8) * 1.2 * genome.leafDroopMultiplier)
        : Math.min(55, 15 + (nodeAge - 20) * 0.8 * genome.leafDroopMultiplier);
    const droopExtra = Math.min(120,
      weightDroop + ageDroop + stress.waterStress * 30 + yellowing * 25,
    );

    // Iter 29 Phase 0 — leafletCount path 통합.
    // 이전 bug: 5/7/9만 분기, EARLY_TRUE (1-3 leaflet) 단계 건너뜀.
    // fix: leafletCountFromMaturity 단일 source of truth 사용 → 1 → 3 → 5 → 7 → 9.
    const leafletCount = Math.round(
      leafletCountFromMaturity(leafMaturity, genome.leafletCountBias),
    );

    // Stem radius — pipe-model approx: parent radius × 0.6 base × taper.
    // Taper formula keeps tip ~0.6 × parent × 0.1 = 6% rather than 0.
    const stemRadiusMm = parentNode.stemRadiusMm * 0.6
      * Math.max(0.15, 1 - k / Math.max(1, shootInternodes));

    // v3.0 Phase 6 — side-shoot trusses are gated on ACTIVE_TRAINING
    // .sideShoot.fruitingEnabled. Single-stem high-wire keeps these off;
    // free-bush lets them form. Truss content is synthetic (a small
    // cluster of flowers) rather than wired to CoreModel — physiology
    // doesn't yet track per-axis trusses.
    let nodeTruss: TrussState | null = null;
    const ssCfg = ACTIVE_TRAINING.sideShoot;
    if (
      ssCfg.fruitingEnabled &&
      k >= ssCfg.firstTrussNodeIdx &&
      (k - ssCfg.firstTrussNodeIdx) % ssCfg.trussIntervalNodes === 0
    ) {
      const flowerCount = Math.max(
        3,
        Math.min(8, Math.round(cultivar.flowersPerTruss.mu * 0.6)),
      );
      const sideFlowers: FlowerState[] = [];
      for (let f = 0; f < flowerCount; f++) {
        sideFlowers.push({ index: f, bloomProgress: Math.min(1, nodeAge / 14) });
      }
      nodeTruss = { flowers: sideFlowers, fruits: [] };
    }

    shoot.nodes.push({
      index: k,
      heightCm: parentNode.heightCm + (pos.y - parentNode.position.y) * 100,
      phyllotaxisAngle: (k * GOLDEN_ANGLE) % 360,
      leafMaturity,
      leafSizeFactor,
      leafletCount,
      yellowing,
      droopExtra,
      truss: nodeTruss,
      age: nodeAge,
      emergence: 1,
      leafAreaCm2,
      leafMassG,
      internodeLenCm: internodeM * 100,
      massAboveKg: 0,
      stemRadiusMm,
      bendingMomentNm: 0,
      deflectionRad: 0,
      deflectionAzimuth: 0,
      waterStress: stress.waterStress,
      diseaseLoad: stress.diseaseLoad,
      position: { ...pos },
      growthDir: { ...nextDir },
      budState: 'dormant',
      sideShoot: null,
      sideShootAngleDeg: null,
    });
    dir = nextDir;
  }
}

export function computePlantState(
  day: number,
  genome: PlantGenome,
  stress: PlantStressInputs = {},
  cultivar: Cultivar = getCultivar('round-generic'),
  simContext?: SimulationContext,
): PlantState {
  const waterStress = Math.max(0, Math.min(1, stress.waterStress ?? 0));
  const diseaseLoad = Math.max(0, Math.min(1, stress.diseaseLoad ?? 0));
  // ============================================================
  // APEX-DRIVEN GROWTH MODEL — phyllochron / TT-driven (v3.0)
  // ============================================================
  // Real biology: shoot apical meristem (SAM) produces leaf primordia
  // on a strict thermal-time schedule (Heuvelink 1996). One phytomer
  // every cultivar.phyllochronGDD GDD above T_base. Leaves expand →
  // produce gibberellin (GA) → GA moves basipetally → internode BELOW
  // elongates. Plant height = Σ(internode lengths).
  // ============================================================

  // TT — from caller's SimulationContext when CoreModel is co-stepping,
  // otherwise approximated from day under default greenhouse climate.
  const TT = simContext?.TT ?? approximateTT(day, 23, cultivar);
  const rawNodeCount = phytomerCountFromTT(TT, cultivar);
  const intNodeCount = Math.min(Math.floor(rawNodeCount), 50);
  const newestEmergence = rawNodeCount > 0 ? rawNodeCount - Math.floor(rawNodeCount) : 1;

  // dailyGDD: average TT/day so far. Used to translate per-node
  // emergence TT back to a "calendar age" for downstream biology
  // (leaf expansion sigmoid, droop, senescence) that is still
  // formulated in days.
  const dailyGDD = day > 0 ? TT / day : 0;
  const org = ACTIVE_MODEL.organogenesis;
  const initialN = org.initialNodeCountAtTransplant;
  // Phase D: botanical reads (stem growth). Phase F will switch to
  // resolveBotanical(ACTIVE_BOTANICAL[crop], cultivar.botanicalOverride);
  // for now the default tomato botanical is byte-identical to the
  // previous hardcoded values.
  const bot = ACTIVE_BOTANICAL.tomato;
  const stem = bot.stemGrowth;
  const nodeDayOf = (i: number): number => {
    if (i < initialN) {
      // PROBE A.1 (2026-05-25): Initial transplant nodes were emerged
      // during the 4-week seedling phase BEFORE day 0 (transplant). Old
      // code returned 0 → age=0 at day 0 → elongation=0.01 → internodes
      // stuck at compressed primordia (Day 0 height = 0.15cm vs ref 15-25cm).
      // Fix: distribute initial N nodes evenly back through the 28-day
      // seedling period so they are fully elongated at day 0.
      return stem.initialStateOffsetDays + i * stem.initialStateSpread;
    }
    if (dailyGDD <= 0) return 0;
    const emergenceTT = (i - initialN) * cultivar.phyllochronGDD + org.TT_at_transplant;
    return emergenceTT / dailyGDD;
  };

  // Per-plant architecture sample — fixed first-truss index, truss
  // interval, and (transitional) fruit max diameter cap. Derived
  // deterministically from genome.seed + cultivar.
  const arch = samplePlantArchitecture(cultivar, genome.seed);

  // Legacy visual-sigmoid fruit parameters. Phase 3 deletes this whole
  // block when fruit visual becomes a direct projection of CoreModel's
  // FruitCohort. Phase 1 botanical migration: read from botanical layer
  // (fruitDevelopment.visualSigmoid + ripening).
  const FRUIT_SIGMOID_K = bot.fruitDevelopment.visualSigmoid.steepness;
  const FRUIT_SIGMOID_MID = bot.fruitDevelopment.visualSigmoid.midpointDays;
  const RIPEN_START_AGE = bot.fruitDevelopment.ripening.startAgeDays;
  const RIPEN_DURATION = bot.fruitDevelopment.ripening.durationDays;
  // Flowering (botanical-sourced). NOTE: setDelayDays is currently inactive
  // in the legacy fallback path (engine sets fruit at flowerAge - 12).
  const FLOWER_DELAY_PER_POS = bot.fruitDevelopment.flowering.delayPerPositionDays;
  const BLOOM_DURATION = bot.fruitDevelopment.flowering.bloomDurationDays;
  const SET_DELAY = bot.fruitDevelopment.flowering.setDelayDays;

  const baseInternode = genome.internodeLenCm ?? stem.matureInternode.lengthDistribution.mu;
  const leafExpK = genome.leafExpansionRate ?? 0.35;

  // Internode elongation parameters (GA-mediated delay) — botanical-sourced
  const elongDelay = genome.internodeElongDelay ?? stem.elongation.delayDays.mu;
  const elongMid = genome.internodeElongMid ?? stem.elongation.midpointDays.mu;
  const ELONG_K = stem.elongation.steepness;
  const PRE_ELONG = stem.elongation.preElongFactor;

  // Hypocotyl growth (botanical-sourced)
  const hypoEmergeDay = stem.hypocotyl.emergenceDay;
  const hypoMax = stem.hypocotyl.maxCm;
  const hypoRate = stem.hypocotyl.growthRateCmPerDay;

  // Seedling internode pattern (botanical-sourced)
  const seedFirstLen = stem.seedlingInternode.firstLenCm;
  const seedSlope = stem.seedlingInternode.slopePerNode;
  const seedCount = stem.seedlingInternode.count;

  // Mature internode vigor + taper (botanical-sourced)
  const vigorFloor = stem.matureInternode.vigorFloor;
  const vigorRange = stem.matureInternode.vigorRange;
  const taperStart = stem.matureInternode.taperStartFrac;
  const taperSlope = stem.matureInternode.taperSlope;

  // --- Pass 1: Compute final internode length + current elongation for each node ---
  // Hypocotyl: the stem below cotyledons (emerges day 5-7, reaches ~4cm)
  const hypocotylCm = day < hypoEmergeDay
    ? 0
    : Math.min(hypoMax, (day - hypoEmergeDay) * hypoRate);

  const internodeData: Array<{ finalLen: number; currentLen: number; elongation: number }> = [];

  for (let i = 0; i < intNodeCount; i++) {
    const nodeDay = nodeDayOf(i);
    const age = day - nodeDay;
    const nodeFrac = intNodeCount <= 1 ? 0 : i / (intNodeCount - 1);

    // Final (potential) internode length — same biology as before
    let finalLen: number;
    if (i === 0) {
      finalLen = seedFirstLen; // first internode very short
    } else if (i < seedCount) {
      finalLen = seedFirstLen + i * seedSlope; // seedling: 1.5, 2.3, 3.1, 3.9cm
    } else {
      // Growth vigor = derivative of sigmoid height curve at node creation time
      const S = sigmoid(nodeDay, genome.heightSigmoidK, genome.heightSigmoidMid);
      const vigor = 4 * S * (1 - S); // normalized 0-1, peak at sigmoid midpoint
      // Gap analysis P0 #1: vigor floor 0.75 so off-peak nodes still
      // elongate to ~75% of baseInternode. Real beefsteak indeterminate
      // keeps 6–10cm internodes nearly whole-season.
      finalLen = baseInternode * (vigorFloor + vigorRange * vigor);
      if (nodeFrac > taperStart) {
        finalLen *= 1.0 - (nodeFrac - taperStart) * taperSlope;
      }
    }

    // Internode elongation: delayed sigmoid
    // Leaf must expand first → produce GA → internode below elongates
    const elongAge = age - elongDelay;
    const elongation = elongAge <= 0
      ? PRE_ELONG  // pre-elongation: ~1% of final length (compressed primordium)
      : Math.max(PRE_ELONG, sigmoid(elongAge, ELONG_K, elongMid));

    const currentLen = finalLen * elongation;
    internodeData.push({ finalLen, currentLen, elongation });
  }

  // --- Pass 2: Accumulate height bottom-up from internodes ---
  // Node i sits at: hypocotyl + Σ(internode[0..i] current lengths)
  // (each node is at the TOP of its internode)
  const nodeHeights: number[] = [];
  let accHeight = hypocotylCm;
  for (let i = 0; i < intNodeCount; i++) {
    accHeight += internodeData[i].currentLen;
    nodeHeights.push(accHeight);
  }

  // Total plant height
  const heightCm = accHeight;

  // --- Pass 3: Build node states with all properties ---
  const nodes: NodeState[] = [];
  let trussCount = 0;
  let totalFruits = 0;
  let maxRipenStage = -1;

  for (let i = 0; i < intNodeCount; i++) {
    const nodeDay = nodeDayOf(i);
    const age = day - nodeDay;
    const isNewest = i === intNodeCount - 1 && intNodeCount > 0;
    const nodeFrac = intNodeCount <= 1 ? 0 : i / (intNodeCount - 1);

    const nodeHeightCm = nodeHeights[i];
    const internodeLenCm = internodeData[i].currentLen;

    // 3D phyllotaxis: golden angle spiral + per-plant jitter
    const phyllotaxisAngle = (i * GOLDEN_ANGLE + genome.phyllotaxisJitter * i * 0.3) % 360;

    // --- Leaf expansion model (science-based) ---
    const leafExpansion = sigmoid(age, leafExpK, 9);
    const leafMaturity = Math.max(0.02, leafExpansion);

    // --- Leaf size: position × expansion ---
    // Pushed further for visual lushness: positionFactor floor 0.70
    // → 0.85, so basal and apical leaves are nearly as large as the
    // canopy peak. With the relaxed pruning + senescence the bottom
    // of the plant retains leaves longer; making those leaves big
    // turns the canopy from "sparse skeleton" into "dense bush."
    const positionFactor = Math.sin(nodeFrac * Math.PI);
    const potentialSize = (0.85 + 0.20 * positionFactor) * genome.leafSizeMultiplier;
    // Iter 16 SSOT #169 — plant-wide juvenile leaf scale.
    // initialNodeCountAtTransplant=5 treats Day 0 plant as a 4-week seedling
    // with nodes "born" 28-30 days before transplant, so leafExpansion=1.0
    // makes every visible leaf full-size on Day 0. The user-visible result
    // contradicts the seedling expectation (떡잎+1-2 small true leaves).
    // Ramp 0.3 → 1.0 across the first 15 days so the canopy starts small
    // and grows in. Side-shoot path unaffected (covered separately).
    const plantJuvenileScale = day < 15 ? 0.3 + 0.7 * (day / 15) : 1.0;
    const leafSizeFactor = potentialSize * leafExpansion * plantJuvenileScale;

    // --- Leaf area & mass ---
    // 720 → 880 cm² — closer to the upper end of beefsteak compound
    // leaves (real mature outdoor leaves can hit 900–1000 cm²).
    const BASE_LEAF_AREA_CM2 = 880;
    const leafAreaCm2 = BASE_LEAF_AREA_CM2 * leafSizeFactor * leafSizeFactor;
    const leafMassG = 25 * leafSizeFactor * leafSizeFactor * leafMaturity;

    const yellowing = age > 60 ? Math.min(1, (age - 60) / 30) : 0;

    // --- Droop model: weight-based + age-based ---
    const armLenM = 0.22;
    const DROOP_WEIGHT_COEFF = 6000;
    const weightDroop = (leafMassG / 1000) * armLenM * armLenM * DROOP_WEIGHT_COEFF;
    const ageDroop = age < 8
      ? 0
      : age < 20
        ? Math.min(25, (age - 8) * 1.2 * genome.leafDroopMultiplier)
        : Math.min(55, 15 + (age - 20) * 0.8 * genome.leafDroopMultiplier);
    // Water-stress contribution (per user reference: leaf.droop += waterStress * ~30°)
    const waterStressDroop = waterStress * 30;
    // Senescence droop — yellowing leaves sag further from chlorophyll
    // breakdown + cell turgor loss (real biology + user reference §9).
    const senescenceDroop = yellowing * 25;
    const droopExtra = Math.min(
      120,
      weightDroop + ageDroop + waterStressDroop + senescenceDroop
    );

    // Iter 29 Phase 0 — leafletCount path 통합 (LeafStage와 동일).
    // 이전 bug: 5/7/9만 분기, EARLY_TRUE (1-3 leaflet) 단계 건너뜀.
    // fix: leafletCountFromMaturity 단일 source of truth → 1 → 3 → 5 → 7 → 9.
    const leafletCount = Math.round(
      leafletCountFromMaturity(leafMaturity, genome.leafletCountBias),
    );

    // Truss logic — v3.0 Phase 3.
    //
    // Truss SLOT positioning is structural (cultivar firstTrussNodeIdx +
    // trussIntervalNodes). Truss CONTENT (flowers, fruits, sizes,
    // ripening) comes from one of two paths:
    //   - hybridFspmMode + physiologyState present: physiology FruitCohort
    //     is the single source of truth — fruit count, mass, diameter,
    //     ripen stage all come from CoreModel.
    //   - legacyGrowthMode (or no physiologyState): sigmoid fallback
    //     for paths that don't co-step CoreModel.
    let truss: TrussState | null = null;
    const isTrussNode = i >= arch.firstTrussNodeIdx
      && (i - arch.firstTrussNodeIdx) % arch.trussIntervalNodes === 0;

    if (isTrussNode) {
      const structuralTrussIdx = Math.floor((i - arch.firstTrussNodeIdx) / arch.trussIntervalNodes);
      const physTruss =
        ACTIVE_ENGINE_MODE === 'hybridFspmMode' && simContext?.physiologyState
          ? simContext.physiologyState.trusses[structuralTrussIdx] ?? null
          : null;

      if (physTruss) {
        // Hybrid path — physiology drives everything.
        trussCount++;
        const flowers: FlowerState[] = [];
        const fruits: FruitState[] = [];
        for (let f = 0; f < physTruss.fruits.length; f++) {
          const phys = physTruss.fruits[f];
          // Pre-anthesis: render as flower, no fruit yet.
          if (phys.fertilizationTT < 0) {
            if (!phys.aborted) flowers.push({ index: f, bloomProgress: 0.5 });
            continue;
          }
          if (phys.aborted || phys.harvested) continue;
          const stageIdx = Math.max(0, Math.min(5, phys.ripenStage));
          const c1 = STAGE_COLORS[stageIdx];
          const c2 = STAGE_COLORS[Math.min(5, stageIdx + 1)];
          const color = lerpColor(c1, c2, phys.ripenFraction);
          fruits.push({
            index: f,
            diameterMm: phys.diameter,
            ripenStage: phys.ripenStage,
            ripenFraction: phys.ripenFraction,
            color,
            age: 0,
            cultivarGenome: phys.genome,
          });
          totalFruits++;
          if (phys.ripenStage > maxRipenStage) maxRipenStage = phys.ripenStage;
          // Recently-set fruits keep a fading flower next to them
          // (calyx/sepals visible for ~2 weeks after fruit set).
          const gddSinceFert = (simContext?.physiologyState?.TT ?? 0) - phys.fertilizationTT;
          if (gddSinceFert > 0 && gddSinceFert < 14 * 12) {
            const fadeProgress = 1 - gddSinceFert / (14 * 12);
            flowers.push({ index: f, bloomProgress: 0.5 * fadeProgress });
          }
        }
        truss = { flowers, fruits };
      } else {
        // Legacy fallback — sigmoid-driven fruit visual.
        const trussAge = age - 5;
        if (trussAge > 0) {
          trussCount++;
          const trussRng = new SeededRandom(
            (genome.seed * 7919 + i * 131 + 0x517a55) >>> 0,
          );
          trussRng.next(); trussRng.next(); trussRng.next();
          const flowerCount = Math.max(
            3,
            Math.round(
              cultivar.flowersPerTruss.mu +
                cultivar.flowersPerTruss.sigma *
                  Math.sqrt(-2 * Math.log(Math.max(1e-9, trussRng.next()))) *
                  Math.cos(2 * Math.PI * trussRng.next()),
            ),
          );
          const flowers: FlowerState[] = [];
          const fruits: FruitState[] = [];

          for (let f = 0; f < flowerCount; f++) {
            const flowerDelay = f * FLOWER_DELAY_PER_POS;
            const flowerAge = trussAge - flowerDelay;

            if (flowerAge > 0) {
              const bloomProgress = Math.min(1, flowerAge / BLOOM_DURATION);
              const fruitAge = flowerAge - SET_DELAY;

              if (fruitAge > 0) {
                const diameterMm = arch.fruitMaxDiameterMm
                  * sigmoid(fruitAge, FRUIT_SIGMOID_K, FRUIT_SIGMOID_MID);
                let ripenStage = 0;
                let ripenFraction = 0;

                if (fruitAge > RIPEN_START_AGE) {
                  const ripenProgress = (fruitAge - RIPEN_START_AGE) / RIPEN_DURATION;
                  const totalStageProgress = ripenProgress * 5;
                  ripenStage = Math.min(5, Math.floor(totalStageProgress));
                  ripenFraction = totalStageProgress - ripenStage;
                  if (ripenStage >= 5) ripenFraction = 1;
                }

                const c1 = STAGE_COLORS[ripenStage];
                const c2 = STAGE_COLORS[Math.min(5, ripenStage + 1)];
                const color = lerpColor(c1, c2, ripenFraction);

                const fruitGenomeRng = new SeededRandom(
                  genome.seed * 7919 + i * 131 + f * 31 + 0x9e377,
                );
                fruitGenomeRng.next(); fruitGenomeRng.next(); fruitGenomeRng.next();
                const cultivarSample = sampleCultivarGenome(cultivar, () => fruitGenomeRng.next());

                fruits.push({
                  index: f,
                  diameterMm,
                  ripenStage,
                  ripenFraction,
                  color,
                  age: fruitAge,
                  cultivarGenome: cultivarSample,
                });
                totalFruits++;
                if (ripenStage > maxRipenStage) maxRipenStage = ripenStage;

                if (fruitAge < 14) {
                  const fadeProgress = 1 - (fruitAge / 14);
                  flowers.push({ index: f, bloomProgress: bloomProgress * fadeProgress });
                }
              } else {
                flowers.push({ index: f, bloomProgress });
              }
            }
          }
          truss = { flowers, fruits };
        }
      }
    }

    nodes.push({
      index: i, heightCm: nodeHeightCm, phyllotaxisAngle,
      leafMaturity, leafSizeFactor, leafletCount,
      yellowing, droopExtra, truss, age,
      emergence: isNewest ? newestEmergence : 1,
      leafAreaCm2, leafMassG, internodeLenCm,
      massAboveKg: 0, stemRadiusMm: 10, bendingMomentNm: 0,
      deflectionRad: 0, deflectionAzimuth: 0,
      waterStress, diseaseLoad,
      // Skeleton fields populated below by walkSkeleton
      position: { x: 0, y: 0, z: 0 },
      growthDir: { x: 0, y: 1, z: 0 },
      budState: 'dormant',
      sideShoot: null,
      sideShootAngleDeg: null,
    });
  }

  // (v4.2: defoliation block moved below — needs walkSkeleton positions.)

  // Age-based senescence — leaves fade after age 80 and are fully
  // senesced by 115 days. Widened again to keep more low-canopy leaves
  // visible (user feedback: "무성해야돼" / should be lush). At day 92
  // the previous 65–95 window had zeroed all nodes with age > 88,
  // i.e. the lowest 6 nodes; the new 80–115 window only zeroes nodes
  // age > 115, which on a 16-week scenario means *none*.
  for (const node of nodes) {
    if (node.leafMaturity > 0 && node.age > 80) {
      const senFade = Math.min(1, (node.age - 80) / 35); // 0 → 1 over 80–115d
      if (senFade >= 1) node.leafMaturity = 0;
      else node.leafMaturity *= (1 - senFade * 0.45);
    }
  }

  const hasCotyledons = day >= 3 && day < 25;
  const cotyledonSize = day < 3 ? 0 : (day < 8 ? (day - 3) / 5 : (day < 25 ? Math.max(0, 1 - (day - 15) / 10) : 0));

  let currentStage: { name: string; dayStart: number; dayEnd: number } = GROWTH_STAGES[0];
  for (const s of GROWTH_STAGES) {
    if (day >= s.dayStart) currentStage = s;
  }

  // Physics pass: compute mass, stem radius, bending for all nodes
  computePhysics(nodes, genome);

  const leafCount = nodes.filter(n => n.leafMaturity > 0.2).length;

  // ── Skeleton walk (Plan 3a) ────────────────────────────────────────
  // Compute each node's 3D position by synthesizing growth direction
  // every step — never a straight line. RNG is per-plant deterministic
  // (same seed → identical wandering pattern across calls).
  const skeletonRng = new SeededRandom(genome.seed * 1009 + 0x515E1E);
  // warm up — discard first few low-quality LCG values.
  skeletonRng.next(); skeletonRng.next(); skeletonRng.next();

  // v3.0 Phase 5.5 — wire-compressed mode. Once cumulative height
  // reaches ACTIVE_TRAINING.maxPlantHeightCm the apex is "lowered":
  // new internodes redirect from vertical to horizontal-along-wire so
  // the visible plant doesn't pierce the roof. This is a coarse stand-in
  // for real leaning-and-lowering (a follow-up plan).
  const maxHeightM = ACTIVE_TRAINING.maxPlantHeightCm / 100;
  const HORIZONTAL_SLIDE_FRAC = 0.25; // fraction of internode length kept horizontally
  let wireCompressed = false;

  if (nodes.length > 0) {
    nodes[0].position = { x: 0, y: hypocotylCm / 100, z: 0 };

    // Anchor = the vertical line the plant should stay near. Take the base
    // node's horizontal position so the restoring force is in plant-local
    // space (works even if a future change shifts the base off origin).
    const anchor = { x: nodes[0].position.x, z: nodes[0].position.z };
    const sway = {
      amp: genome.swayAmplitude,
      freq: genome.swayFrequencyRadPerM,
      phase: genome.swayPhaseOffsetRad,
    };

    nodes[0].growthDir = synthesizeGrowthDir(
      { x: 0, y: 1, z: 0 },
      nodes[0].position,
      anchor,
      nodes[0].age,
      0,
      skeletonRng,
      sway,
    );

    // Lever D — once compressed, the stem slides along the overhead wire in
    // a per-plant azimuth sampled in the genome (uniform 0..2π) instead of
    // the old 17-bucket `seed % 17` formula.
    const wireAz = genome.wireSlideAzimuthRad;
    const wireDir = { x: Math.cos(wireAz), y: 0, z: Math.sin(wireAz) };

    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const internodeM = nodes[i].internodeLenCm / 100;
      const wouldExceed = prev.position.y >= maxHeightM;
      if (wouldExceed) {
        // Compressed: dump internode length into horizontal slide.
        wireCompressed = true;
        const slide = internodeM * HORIZONTAL_SLIDE_FRAC;
        nodes[i].position = {
          x: prev.position.x + wireDir.x * slide,
          y: maxHeightM, // pinned to wire height
          z: prev.position.z + wireDir.z * slide,
        };
        nodes[i].growthDir = wireDir;
      } else {
        nodes[i].position = {
          x: prev.position.x + prev.growthDir.x * internodeM,
          y: prev.position.y + prev.growthDir.y * internodeM,
          z: prev.position.z + prev.growthDir.z * internodeM,
        };
        nodes[i].growthDir = synthesizeGrowthDir(
          prev.growthDir,
          prev.position,
          anchor,
          nodes[i].age,
          nodes[i].massAboveKg,
          skeletonRng,
          sway,
        );
      }
    }
  }
  // Wire-compressed flag — pinned to PlantState below for snapshot
  // diagnostics. Renderers can ignore it.

  // v4.2 — defoliation (적엽). Runs AFTER walkSkeleton so node.position.y
  // is valid.
  //
  //  bottomUpHeight (default — Korean commercial practice):
  //    From `startDay` onward, leaves on stem nodes whose y ≤
  //    `removeBelowHeightM` and `age >= minLeafAgeDaysAtRemoval` are
  //    removed. Monotonic persistence lives in GrowthEngine.
  //
  //  ripeningAnchored (legacy v3.0):
  //    Topmost truss with any ripenStage ≥ 4 plus
  //    `keepTrussesAboveRedTopmost` trusses above it stays leafed.
  {
    const scenario = getScenario(cultivar);
    const defo = scenario.management.defoliation;
    if (defo.enabled) {
      const policy = defo.policy ?? 'bottomUpHeight';
      if (policy === 'bottomUpHeight') {
        if (day >= defo.startDay) {
          for (const node of nodes) {
            if (node.position.y <= defo.removeBelowHeightM &&
                node.age >= defo.minLeafAgeDaysAtRemoval) {
              node.leafMaturity = 0;
              node.leafAreaCm2 = 0;
            }
          }
        }
      } else if (policy === 'ripeningAnchored') {
        let redTopmostNodeIdx = -1;
        for (const node of nodes) {
          if (!node.truss) continue;
          for (const f of node.truss.fruits) {
            if (f.ripenStage >= 4 && node.index > redTopmostNodeIdx) {
              redTopmostNodeIdx = node.index;
            }
          }
        }
        if (redTopmostNodeIdx >= 0) {
          const keepWindowNodes = defo.keepTrussesAboveRedTopmost * arch.trussIntervalNodes;
          const keepBoundaryIdx = redTopmostNodeIdx + keepWindowNodes;
          for (const node of nodes) {
            if (node.index >= keepBoundaryIdx) continue;
            const distBelow = keepBoundaryIdx - node.index;
            const fadeT = Math.min(1, distBelow / Math.max(1, arch.trussIntervalNodes));
            const floorFrac = defo.keepLeavesPerTruss > 0 ? 0.3 : 0.0;
            node.leafMaturity *= Math.max(floorFrac, 1 - fadeT);
            if (node.leafMaturity < floorFrac) node.leafMaturity = floorFrac;
          }
        }
      }
    }
  }

  // ── Axis wrapping ──────────────────────────────────────────────────
  const mainAxis: StemAxis = {
    order: 0,
    nodes,
    parentNodeIdx: null,
    parentAxisIdx: null,
    branchAzimuth: 0,
  };
  const allAxes: StemAxis[] = [mainAxis];

  // ── Bud activation + pruning ──────────────────────────────────────
  // ACTIVE_TRAINING drives pruning rate (v3.0 Phase 5).
  const maxOrder = 2;
  for (let d = 0; d < Math.floor(day); d++) {
    activateAndPruneBuds(allAxes, skeletonRng, maxOrder);
  }

  // Populate side-shoot axes' nodes — starter chain per activated bud.
  // 곁가지 node 의 leaf biology 는 main axis 와 동일 sigmoid 모델로
  // (Plan 3c-1). 단 size 는 곁가지 특성 반영해서 main 대비 작게.
  for (let i = 0; i < mainAxis.nodes.length; i++) {
    const node = mainAxis.nodes[i];
    if (!node.sideShoot || node.budState !== 'growing') continue;
    if (node.sideShoot.nodes.length > 0) continue;

    populateSideShootChain(
      node,
      node.sideShoot,
      allAxes,
      genome,
      cultivar,
      skeletonRng,
      { waterStress, diseaseLoad },
    );
  }

  // ── Phase 3 hybrid: LAI-scaled leaf area + physiology heightCm ──
  // When CoreModel is co-stepping, the visual canopy density should
  // track physiology LAI (Heuvelink 1996 commercial cap = 3) rather
  // than whatever the apex-driven sigmoid produced. Same idea that
  // overlayPhysiologyFruits did externally — now in-line so callers
  // get a coherent state from one call.
  let effectiveHeightCm = heightCm;
  if (ACTIVE_ENGINE_MODE === 'hybridFspmMode' && simContext?.physiologyState) {
    const phys = simContext.physiologyState;

    // 1. Scale leaf area to physiology LAI.
    let currentLeafAreaCm2 = 0;
    for (const n of nodes) {
      if (!n.truss) currentLeafAreaCm2 += n.leafAreaCm2 * (1 - n.yellowing);
    }
    const targetLeafAreaCm2 = phys.LAI * ACTIVE_MODEL.photosynthesis.plantFootprintM2 * 10000;
    const areaScale = currentLeafAreaCm2 > 1
      ? targetLeafAreaCm2 / currentLeafAreaCm2
      : 1;
    const linearScale = Math.min(3.0, Math.max(0.5, Math.sqrt(areaScale)));
    if (Math.abs(linearScale - 1) > 0.01) {
      for (const n of nodes) {
        n.leafSizeFactor *= linearScale;
        n.leafAreaCm2 *= linearScale * linearScale;
      }
    }

    // 2. Height — use STRUCTURAL accHeight (botanical: hypocotyl +
    //    Σ internodes). Previously this used phys.heightCm which CoreModel
    //    populated via the magic formula `30 + trusses.length * 27` — that
    //    formula was botanically meaningless (height stepped 57→84→111 by
    //    truss count alone) and gapped reference by 18-39cm. Structural
    //    accHeight is already computed correctly from internode data
    //    (lines 668-678) using realistic hypocotyl + per-node internode
    //    elongation; we just let that value stand. Cap still applied below.
    //
    // Bug ref: growth-calibration audit 2026-05-25 — Day 0 sim 57cm vs ref
    //          15-25cm root cause traced to CoreModel.ts:467,682.
  }
  // Always cap structural height too — even when physiology isn't
  // present the legacy sigmoid path should not pierce the wire.
  if (effectiveHeightCm > ACTIVE_TRAINING.maxPlantHeightCm) {
    effectiveHeightCm = ACTIVE_TRAINING.maxPlantHeightCm;
    wireCompressed = true;
  }

  return {
    seed: genome.seed,
    day, heightCm: effectiveHeightCm, nodes, nodeCount: intNodeCount, leafCount, trussCount,
    totalFruits, maxRipenStage, currentStage,
    hasCotyledons, cotyledonSize: Math.max(0, Math.min(1, cotyledonSize)),
    waterStress, diseaseLoad,
    mainAxis,
    allAxes,
    geometryMode: wireCompressed ? 'wire_compressed' : 'free',
  };
}
