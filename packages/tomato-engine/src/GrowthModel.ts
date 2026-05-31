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
// Iter 29 Phase 1 — extracted growth modules (function boundary; SSOT for
// thermal time + phytomer TT helpers + InternodeState).
import {
  computeNodeInitiationTT,
  computeNodeVisibleTT,
  computeNodeAgeTT,
  type PhytomerStatus,
} from './growth/PhytomerModel';
import {
  type InternodeState,
  makeInternodeState,
} from './growth/InternodeGrowthModel';
// Iter 29 Phase 2A — LeafOrganState / TrussOrganState / SideShootState +
// helpers. PlantBase computes _everything_ here; Skeleton/Skin consume.
import {
  type LeafOrganState,
  type LeafPostureState,
  type LeafMorphologyState,
  type TrussOrganState,
  type SideShootState,
  type LeafAllocationState,
  type LeafGeometryProjectionState,
  computeLeafExpansionProgress,
  computeLeafGeometryProjection,
  makeLeafOrganStateFromFlat,
  applyMorphologyVariance,
  composeLeafAllocation,
} from './growth/LeafGrowthModel';
import {
  computeSenescenceStartTT,
  computeSenescenceProgress,
  makeSenescenceState,
} from './growth/SenescenceModel';
// Iter 29 Phase 2B — Source-Sink Proxy v1 (lightweight; NOT a full TOMSIM/
// TOMGRO carbon partition). Applied multiplicatively to leaf.targetAreaCm2.
// Iter 30 Phase 3 — per-axis variant.
import {
  computeSourceSinkProxyV1FromPlant,
  computeAxisSourceSinkProxyV1,
} from './growth/SourceSinkProxyV1';
// Iter 30 Phase 1-Pre — NodeGrowthContext minimum schema (5 fields).
import {
  type NodeGrowthContext,
  makeMainAxisGrowthContext,
  makeSideShootGrowthContext,
} from './growth/NodeGrowthContext';
// Iter 30 Phase 1 — Axis Capacity Model (structural capacity proxy).
import {
  computeAxisStructuralCapacity,
  computeAxisCapacityFactor,
  computeAxisOrganDemand,
  computeAxisMeanStemRadius,
  computeAxisLengthCm,
} from './growth/AxisCapacityModel';
// Iter 30 Phase 4 — Side-shoot Allocation Factor (parent vigor × apex × light).
import {
  computeSideShootAllocationFactor,
  computeApexDominanceReleaseFactor,
  DEFAULT_CULTIVAR_SIDE_SHOOT_POTENTIAL,
  DEFAULT_LIGHT_FACTOR,
} from './growth/SideShootAllocation';
// Iter 30 Phase 5 — Leaf Posture Composition (light-facing + gravity droop 분리).
import {
  computeGravityDroopDeg,
  computePetioleBaseElevationDeg,
  computeWaterStressDroopDeg,
  composePosture,
} from './growth/LeafPostureModel';

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

  // ── Iter 29 Phase 1 — Thermal Time (TT) canonical fields ─────────
  // Plan §3 (sleepy-growing-pretzel.md):
  //   node.initiationTT = transplantOffsetTT + node.index × phyllochronTT
  //   node.ageTT        = currentTT - node.initiationTT
  //
  // Phase 1: populated alongside legacy `age` (days) — both coexist.
  // Phase 2A: `age` becomes _legacy alias_ derived from ageTT/dailyGDD.
  // Phase 5+: `age` removed; canonical is `ageTT` only.
  /** TT (GDD) at which this phytomer was initiated. */
  initiationTT: number;
  /** TT (GDD) at which this phytomer's leaf became visible. Phase 1:
   *  equal to initiationTT (no primordium-visible delay yet). */
  visibleTT: number;
  /** TT (GDD) since phytomer initiation = currentTT - initiationTT. */
  ageTT: number;

  // ── Iter 29 Phase 1 — InternodeState (canonical) ─────────────────
  // Plan §4 + Phase 1 INTERNODE-STATE-01: target/current/expansion 분리.
  // Phase 1: populated from existing internodeData computation; existing
  // flat `internodeLenCm` retained as legacy alias (= internode.currentLengthCm).
  internode: InternodeState;

  // ── Iter 29 Phase 1 — Phytomer status (lifecycle) ────────────────
  // Plan §1: phytomer 전체의 lifecycle. LeafOrganState.stage와 _독립_.
  // Phase 1: derived simply from ageTT relative to leafLifespanTT.
  // Phase 2A: refined per organ state independence (node may be mature
  //           while leaf is senescent, etc.).
  status: PhytomerStatus;

  // ── Iter 29 Phase 2A — Organ state shells ────────────────────────
  // Plan §5 + §2A: PhytomerNode.leaf is canonical structured state.
  // Phase 2A: populated alongside legacy flat fields (leafMaturity,
  //   leafSizeFactor, leafAreaCm2, leafletCount, yellowing, droopExtra)
  //   which remain as backward-compat aliases. Phase 5+ deprecates flat.
  //
  // Plan LEAF-SENESCENCE-PLANTBASE-01: senescence colorDullness /
  //   visibleAreaFactor / curl / droopDeg are _computed here_ — Skin must
  //   apply, NOT re-derive.
  leaf: LeafOrganState;

  // Plan PHYTOMER-ORGAN-SHELL-01 — Phase 2A: state shell only. Full
  // flowering/fruiting/ripening biology stays in `truss` (TrussState).
  // `trussOrgan` carries TT-based lifecycle indicator for canonical path.
  trussOrgan?: TrussOrganState;

  // Plan PHYTOMER-ORGAN-SHELL-01 — Phase 2A: state shell only. Recursive
  // sub-axis remains in existing `sideShoot` (StemAxis).
  sideShootOrgan?: SideShootState;

  // ── Iter 30 Phase 1-Pre — NodeGrowthContext (5 fields) ────────────
  // Plan §2 — PhytomerNode가 자기 axis context를 알게 함.
  //   axisId / localStemRadiusMm / axisCapacityFactor / isSideShoot / parentVigorFactor
  // Phase 1+ 확장 후보: nodeVigorFactor, sourceSinkFactor 등 (점진).
  // Backward compat: 미설정 시 DEFAULT_NODE_GROWTH_CONTEXT (optional ?:).
  growthContext?: NodeGrowthContext;
}

/**
 * Iter 29 Phase 1 — Canonical phytomer node name.
 *
 * Plan §1 (sleepy-growing-pretzel.md): "기존 NodeState를 PhytomerNode로
 * rename + 구조화". 본 alias는 새 code path의 canonical name; 기존
 * NodeState 이름은 backward compat alias로 유지 (Phase 5에서 _alias_
 * deprecate; Phase 6에서 _removal_).
 *
 * Note: Type 자체는 identical — 데이터/필드 변경 없음. Phase 2A에서
 * `leaf: LeafOrganState` nested struct 추가 시 본 alias가 canonical을
 * 가리킨다 (호출처 점진 마이그레이션).
 */
export type PhytomerNode = NodeState;

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

  // ── Iter 29 Phase 1 — currentTT canonical growth time ────────────
  // Plan §2 (sleepy-growing-pretzel.md): "PlantState.currentTT는 진단
  // cache가 아니다. PlantBase 생장 모델의 canonical time state다."
  //
  // All node.initiationTT / node.ageTT / leaf.ageTT / senescenceProgress
  // 는 currentTT에서 파생. `day`는 _legacy diagnostic field_ — Phase 5에서
  // alias-only로 강등, Phase 6에서 제거 검토.
  currentTT: number;

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
  // Iter 29 Phase 1 — TT propagation. Allows side-shoot nodes to populate
  // canonical TT fields (initiationTT/visibleTT/ageTT) derived from parent
  // TT + per-node phyllochron offset. Phase 2A makes side-shoot biology
  // fully TT-driven (currently it remains day-based by approximation).
  currentTT: number = 0,
  dailyGDD: number = 0,
  // Iter 29 Phase 2B — Source-Sink Proxy v1 multiplier (plant-wide; clamped
  // to [0.65, 1.15]). NOT a TOMSIM carbon partition; lightweight proxy.
  sideSourceSinkProxyV1: number = 1.0,
  // Iter 30 Phase 1-Pre — side-shoot ordinal index for NodeGrowthContext.axisId.
  // 'side:0' = first side-shoot in traversal order, etc.
  sideShootIndex: number = 0,
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

    // Iter 30 Phase 0.A + Phase 2 — Linear Product 4-Stage + Allocation.
    //
    //   potential = max × position × SHOOT_LEAF_SCALE
    //   allocation 4-factor: plantSource × axisCapacity × sideShoot × stress
    //     - sideShootAllocationFactor는 SHOOT_LEAF_SCALE을 imitating
    //       (Phase 4에서 parent vigor × apex release × light로 정밀화)
    //     - axisCapacityFactor: Pass 3 후 side axis 계산값으로 _덮어쓰기_
    //   target = potential × allocation
    //   current = target × leafExpansion
    const sidePotentialAreaCm2 =
      cultivar.growthProfile.maxLeafAreaCm2 * (0.85 + 0.20 * positionFactor);
    const sideStressFactor =
      Math.max(0.3, Math.min(1.0, 1 - stress.waterStress * 0.5 - stress.diseaseLoad * 0.3));
    const sideAllocationPhase2: LeafAllocationState = composeLeafAllocation({
      plantSourceFactor: sideSourceSinkProxyV1,
      axisCapacityFactor: 1.0,  // Pass 3 후 side axis 계산값으로 덮어쓰기
      sideShootAllocationFactor: SHOOT_LEAF_SCALE,  // Phase 4에서 정밀화
      stressFactor: sideStressFactor,
    });
    const sideTargetAreaCm2_linear = sidePotentialAreaCm2 * sideAllocationPhase2.finalAllocationFactor;
    const sideCurrentAreaCm2_linear = sideTargetAreaCm2_linear * leafExpansion;

    // Legacy alias for downstream consumers (leafAreaCm2 = currentAreaCm2)
    const leafAreaCm2 = sideCurrentAreaCm2_linear;
    const leafMassG = 25 * (sideCurrentAreaCm2_linear / Math.max(1, cultivar.growthProfile.maxLeafAreaCm2)) * leafMaturity;

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

    // Iter 29 Phase 0 + Phase 1-Pre — leafletCount cultivar-driven.
    // 이전 bug: 5/7/9만 분기, EARLY_TRUE (1-3 leaflet) 단계 건너뜀.
    // fix P0: leafletCountFromMaturity 단일 source of truth → 1 → 3 → 5 → 7 → max.
    // fix P1-Pre: max cultivar-driven (cherry 7 / standard 9 / beefsteak 11).
    const leafletCount = Math.round(
      leafletCountFromMaturity(
        leafMaturity,
        genome.leafletCountBias,
        cultivar.growthProfile.maxLeafletCount,
      ),
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

    // Iter 29 Phase 1 — TT-based fields (Phase 1 approximation for side shoots).
    // Phase 2A makes side-shoot biology fully TT-driven; currently
    // initiationTT is derived from parent's initiationTT + k × phyllochronTT,
    // giving a plausible monotonic TT progression up the side-shoot chain.
    const phyllo = cultivar.growthProfile.phyllochronTT;
    const sideInitiationTT = parentNode.initiationTT + (k + 1) * phyllo;
    const sideVisibleTT = sideInitiationTT;
    const sideAgeTT = Math.max(0, currentTT - sideInitiationTT);
    void dailyGDD;  // reserved for Phase 2A precise approximation
    const internodeLenCm = internodeM * 100;
    const internodeState = makeInternodeState(internodeLenCm, internodeLenCm);
    const sideStatus: PhytomerStatus =
      sideAgeTT <= 0 ? 'primordium'
      : leafMaturity < 0.4 ? 'visible'
      : leafMaturity < 0.95 ? 'expanding'
      : yellowing > 0.3 ? 'senescent' : 'mature';

    // Iter 29 Phase 2A — LeafOrganState on side-shoot node.
    const sideLifespanTT = cultivar.growthProfile.leafLifespanTT;
    const sideExpDurTT = cultivar.growthProfile.leafExpansionDurationTT;
    const sideSenOffsetTT = sideLifespanTT * 0.7;
    const sideCanonSen = computeSenescenceProgress(
      sideAgeTT, sideSenOffsetTT, sideLifespanTT - sideSenOffsetTT,
    );
    const sideBlendedSen = Math.max(sideCanonSen, yellowing);
    const sideSenescenceState = makeSenescenceState(sideBlendedSen);
    // Iter 30 Phase 5 — side-shoot LeafPostureState 9-필드 composition.
    const SIDE_GOLDEN_DEG = 137.508;
    const sideAzimuth = (k * SIDE_GOLDEN_DEG) % 360;
    const sideAgeFactor = Math.max(1.0, Math.min(1.5, 1 + sideAgeTT / 1000));
    const sideRawGravityDroop = computeGravityDroopDeg({
      currentAreaCm2: sideCurrentAreaCm2_linear,
      referenceAreaCm2: cultivar.growthProfile.maxLeafAreaCm2,
      ageFactor: sideAgeFactor,
      // Iter 32 — cultivar droopSensitivity
      droopSensitivity: cultivar.growthProfile.droopSensitivity ?? 1.0,
    });
    // ★ Iter 32 (사용자 통찰) — petiole이 _이미 처진 만큼_ 차감 (main과 동일).
    const sideGravityDroop = Math.max(0, sideRawGravityDroop - droopExtra);
    const sidePetioleBase = computePetioleBaseElevationDeg({
      expansionProgress: leafMaturity,
    });
    const sideWaterStressDroop = computeWaterStressDroopDeg(stress.waterStress);
    const sidePosture: LeafPostureState = composePosture({
      lightSeekingBladePlaneTiltDeg: 0,
      petioleBaseElevationDeg: sidePetioleBase,
      gravityDroopDeg: sideGravityDroop,
      senescenceDroopDeg: sideSenescenceState.droopDeg,
      waterStressDroopDeg: sideWaterStressDroop,
      // Iter 31 Phase 9.4 (R16 fix) — base curl 0.12 → 0.30.
      // 사용자 결함: "잎의 메시가 빳빳하다, bending이 전혀 구현 안 됨".
      // 0.12 base는 _9mm cup_ for 4.5cm leaflet (11% — 시각상 거의 안 보임).
      // 0.30 base = 27% cup (시각상 명확 transverse arc).
      curl: 0.30 + yellowing * 0.20,
    });
    // Iter 29 Phase 5 — side-shoot morphology with per-node variance.
    const sideBaseMorphology: LeafMorphologyState = {
      serrationDepth: genome.leafSerrationDepth ?? 0.12,
      lobeDepth: genome.leafLobeDepth ?? 0.05,
      // ★ Iter 33 V3 — cultivar reference (이전 0.22 hardcoded).
      petioleLengthM: cultivar.growthProfile.referencePetioleLengthM ?? 0.22,
      variationSeed: ((genome.seed >>> 0) ^ (k * 2654435761 >>> 0)) >>> 0,
    };
    const sideMorphology: LeafMorphologyState = applyMorphologyVariance(sideBaseMorphology, 0.15);
    const sideCanonExp = computeLeafExpansionProgress(sideAgeTT, sideExpDurTT, 0.015);
    const sideExpSafe = Math.max(0.01, leafExpansion);
    // Iter 29 Phase 2B — side shoots inherit the plant-level proxy from the
    // parent's PlantState computation. populateSideShootChain runs _after_
    // computePlantState has already wrapped the proxy into main-axis leaf
    // states, but the proxy itself lives in a closure-captured scalar.
    // Phase 2A's side-shoot population currently runs from main-axis caller
    // context where sourceSinkProxyV1 was computed — but populateSideShoot
    // does not receive that scalar. For Phase 2B we add an explicit param.
    const sideTargetAreaCm2 =
      (leafAreaCm2 / (sideExpSafe * sideExpSafe)) * sideSourceSinkProxyV1;
    const sideCurrentAreaCm2 = Math.min(leafAreaCm2, sideTargetAreaCm2);
    // Iter 31 Phase 2 (R5) — side-shoot leaf geometry projection.
    // ★ side-shoot도 동일 PlantBase 산식. Skin은 적용만.
    const sideLeafGeometryProjection = computeLeafGeometryProjection({
      currentAreaCm2: sideCurrentAreaCm2,
      ageTT: sideAgeTT,
      referenceLeafAreaCm2: cultivar.growthProfile.referenceLeafAreaCm2
        ?? cultivar.growthProfile.maxLeafAreaCm2,
      referenceRachisLengthM: cultivar.growthProfile.referenceRachisLengthM ?? 0.30,
      referencePetioleLengthM: cultivar.growthProfile.referencePetioleLengthM ?? 0.10,
      leafExpansionDurationTT: cultivar.growthProfile.leafExpansionDurationTT,
      leafLengthExpansionDurationTT:
        cultivar.growthProfile.leafLengthExpansionDurationTT,
      leafSizeMultiplier: genome.leafSizeMultiplier,
    });

    const sideLeafOrgan: LeafOrganState = makeLeafOrganStateFromFlat({
      nodeIndex: k,
      initiationTT: sideInitiationTT,
      visibleTT: sideVisibleTT,
      ageTT: sideAgeTT,
      // Iter 30 Phase 2 — pre-allocation potential + allocation trace
      potentialAreaCm2: sidePotentialAreaCm2,
      targetAreaCm2: sideTargetAreaCm2,
      currentAreaCm2: sideCurrentAreaCm2,
      expansionProgress: Math.max(sideCanonExp, leafMaturity),
      leafletCount,
      posture: sidePosture,
      morphology: sideMorphology,
      senescence: sideSenescenceState,
      // Phase 2 allocation 4-factor
      allocation: sideAllocationPhase2,
      // Iter 31 Phase 2 (R5) — geometry projection
      geometryProjection: sideLeafGeometryProjection,
    });
    let sideTrussOrgan: TrussOrganState | undefined;
    if (nodeTruss !== null) {
      sideTrussOrgan = {
        initiationTT: sideInitiationTT,
        ageTT: sideAgeTT,
        state: nodeTruss.fruits.length === 0 ? 'flowering' : 'fruiting',
      };
    }

    // Iter 30 Phase 1-Pre — side-shoot growthContext (axisId='side:N').
    // Phase 1 Axis Capacity Model에서 axisCapacityFactor 갱신,
    // Phase 4 Side-shoot Allocation에서 parentVigorFactor 정밀화.
    const sideGrowthContext = makeSideShootGrowthContext({
      sideShootIndex,
      localStemRadiusMm: stemRadiusMm,
      axisCapacityFactor: 1.0,
      parentVigorFactor: 1.0,
    });

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
      internodeLenCm,
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
      // Iter 29 Phase 1 — canonical TT + internode state + status
      initiationTT: sideInitiationTT,
      visibleTT: sideVisibleTT,
      ageTT: sideAgeTT,
      internode: internodeState,
      status: sideStatus,
      // Iter 29 Phase 2A — canonical organ state shells
      leaf: sideLeafOrgan,
      trussOrgan: sideTrussOrgan,
      // Iter 30 Phase 1-Pre — NodeGrowthContext (side-shoot)
      growthContext: sideGrowthContext,
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

  // Iter 29 Phase 2B — Source-Sink Proxy v1 (plant-wide, computed once).
  //
  // ★ 정직 표기: This is NOT a full TOMSIM/TOMGRO carbon partition model.
  //   It is a lightweight proxy modulating leaf.targetAreaCm2 multiplicatively.
  //   Clamp [0.65, 1.15] narrows extreme regime; Phase 5 calibration may widen.
  //
  // Approximated truss count (full Pass 3 count not yet available — uses
  // architecture rule + node count). Average leaf target area uses cultivar
  // potential × position factor 0.7 (mid-shoot mean).
  const approxTrussCount = intNodeCount > arch.firstTrussNodeIdx
    ? Math.floor((intNodeCount - arch.firstTrussNodeIdx) / arch.trussIntervalNodes) + 1
    : 0;
  const stressFactor = Math.max(0, Math.min(1, waterStress * 0.7 + diseaseLoad * 0.3));
  // Iter 30 Phase 3 — sourceSinkSensitivity wire-in (SOURCESINK-SENSITIVITY-USED-01).
  // cultivar.growthProfile.sourceSinkSensitivity (0.35~0.40)가 demand 가중치
  // 보정에 반영 — beefsteak (0.40)는 더 큰 sink draw → proxy 낮아짐 → leaf 작아짐.
  const sourceSinkProxyV1 = computeSourceSinkProxyV1FromPlant({
    nodeCount: intNodeCount,
    averageLeafTargetAreaCm2: cultivar.growthProfile.maxLeafAreaCm2 * 0.7,
    trussCount: approxTrussCount,
    trussSinkStrength: 1.0,
    heightCm,
    stressFactor,
    sourceSinkSensitivity: cultivar.growthProfile.sourceSinkSensitivity,
  });

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
    // Iter 29 Phase 3 — Stem-leaf vigor coupling (lightweight proxy).
    //
    // Plant height is used as a practical vigor proxy for leaf scaling. This
    // is NOT a full carbon partition model — it's a lightweight approximation
    // inspired by source-sink growth concepts (Marcelis 1996 sink strength;
    // Heuvelink 1996 TOMSIM carbon partition). The sqrt scaling and
    // [0.5, 1.5] clamp are calibration parameters, not biological constants.
    //
    // 본 구현은 TOMSIM 수준의 탄소 분배 모델이 아니라, 식물 높이를 생육
    // 세력의 대리 변수로 사용해 잎 크기를 보정하는 경량 근사 모델이다.
    //
    // Effect: 작은 plant (height < 50cm) → vigor < 1.0 → 잎 작게.
    //         큰 plant (height > 50cm) → vigor > 1.0 → 잎 크게.
    //         clamp [0.5, 1.5]로 극단치 방지.
    const VIGOR_REFERENCE_HEIGHT_CM = 50;
    const stemVigorFactor = Math.max(0.5, Math.min(1.5,
      Math.pow(Math.max(1, heightCm) / VIGOR_REFERENCE_HEIGHT_CM, 0.5),
    ));
    const leafSizeFactor = potentialSize * leafExpansion * plantJuvenileScale * stemVigorFactor;

    // --- Leaf area & mass (Iter 30 Phase 0.A + Phase 2 Allocation) ---
    //
    // Phase 0.A 4-stage linear product (R1 quadratic fix):
    //   potential / allocation / target / current.
    //
    // Phase 2 (this) — allocationFactor를 _LeafAllocationState_의 4-factor로
    // 분해 (plantSource × axisCapacity × sideShoot × stress).
    // Main axis: sideShoot=1.0 (Phase 4 변별), axisCapacity는 _Pass 3 후_
    // 갱신되므로 여기서는 1.0 placeholder (Pass 3 후 leaf.allocation 재계산).
    const potentialAreaCm2 =
      cultivar.growthProfile.maxLeafAreaCm2 * potentialSize * stemVigorFactor;
    const stressFactor =
      Math.max(0.3, Math.min(1.0, 1 - waterStress * 0.5 - diseaseLoad * 0.3));
    // Phase 2: axisCapacityFactor=1.0 placeholder; Pass 3 후 axis 계산값으로 갱신
    const allocationPhase2: LeafAllocationState = composeLeafAllocation({
      plantSourceFactor: sourceSinkProxyV1,
      axisCapacityFactor: 1.0,  // Pass 3 후 axis-level 계산값으로 _덮어쓰기_
      sideShootAllocationFactor: 1.0,  // main axis
      stressFactor,
    });
    const targetAreaCm2_linear = potentialAreaCm2 * allocationPhase2.finalAllocationFactor;
    const currentAreaCm2_linear = targetAreaCm2_linear * leafExpansion * plantJuvenileScale;

    // Legacy alias — currentAreaCm2 = 기존 leafAreaCm2 이름. Skin은 currentAreaCm2를 읽음.
    const leafAreaCm2 = currentAreaCm2_linear;
    // leafMassG: g per (currentArea / 100 cm² × 25)에 가까운 선형 — quadratic 제거.
    const leafMassG = 25 * (currentAreaCm2_linear / Math.max(1, cultivar.growthProfile.maxLeafAreaCm2)) * leafMaturity;

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

    // Iter 29 Phase 0 + Phase 1-Pre — leafletCount cultivar-driven (LeafStage와 동일).
    // 이전 bug: 5/7/9만 분기, EARLY_TRUE (1-3 leaflet) 단계 건너뜀.
    // fix P0: leafletCountFromMaturity 단일 source of truth → 1 → 3 → 5 → 7 → max.
    // fix P1-Pre: max cultivar-driven (cherry 7 / standard 9 / beefsteak 11).
    const leafletCount = Math.round(
      leafletCountFromMaturity(
        leafMaturity,
        genome.leafletCountBias,
        cultivar.growthProfile.maxLeafletCount,
      ),
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

    // Iter 29 Phase 1 — TT-based fields (canonical).
    // Plan §3: node.initiationTT = transplantOffsetTT + node.index × phyllochronTT
    //          node.ageTT        = currentTT - node.initiationTT
    const orgCfg = {
      initialNodeCountAtTransplant: org.initialNodeCountAtTransplant,
      TT_at_transplant: org.TT_at_transplant,
    };
    const initiationTT = computeNodeInitiationTT(i, cultivar, orgCfg);
    const visibleTT = computeNodeVisibleTT(i, cultivar, orgCfg);
    const ageTT = computeNodeAgeTT(initiationTT, TT);

    // Iter 29 Phase 1 — InternodeState shell. Phase 1 INTERNODE-STATE-01.
    const finalLenCm = internodeData[i].finalLen;
    const currentLenCm = internodeData[i].currentLen;
    const internodeState = makeInternodeState(finalLenCm, currentLenCm);

    // Iter 29 Phase 1 — Phytomer status (lifecycle). Phase 2A refines.
    const status: PhytomerStatus =
      ageTT <= 0 ? 'primordium'
      : leafMaturity < 0.4 ? 'visible'
      : leafMaturity < 0.95 ? 'expanding'
      : yellowing > 0.3 ? 'senescent' : 'mature';

    // Iter 29 Phase 2A — LeafOrganState (canonical).
    //
    // Plan LEAF-SENESCENCE-PLANTBASE-01 — _PlantBase_가 senescence
    //   colorDullness / visibleAreaFactor / curl / droopDeg를 모두 계산.
    //   Phase 2A: canonical path = TT-based senescence. Legacy day-based
    //   `yellowing` 필드는 alias로 _retained_ (Phase 5에서 deprecate).
    const lifespanTT = cultivar.growthProfile.leafLifespanTT;
    const expDurTT = cultivar.growthProfile.leafExpansionDurationTT;
    const senStartOffsetTT = lifespanTT * 0.7;  // senescenceStartTT - initiationTT
    const canonicalSenescenceProgress = computeSenescenceProgress(
      ageTT, senStartOffsetTT, lifespanTT - senStartOffsetTT,
    );
    // Bridge — at Phase 2A, blend canonical TT-based senescence with the
    // existing day-based yellowing so visual regression stays bounded.
    // Phase 5에서 day-based 제거 후 canonical만 사용.
    const blendedProgress = Math.max(canonicalSenescenceProgress, yellowing);
    const senescenceState = makeSenescenceState(blendedProgress);

    // Iter 30 Phase 5 — LeafPostureState 9-필드 composition.
    // light-facing + gravity droop + senescence + water stress 분리.
    // 상부광 = 0° (blade plane ground-parallel target).
    const GOLDEN_ANGLE_DEG = 137.508;
    const azimuthDeg = (i * GOLDEN_ANGLE_DEG + genome.phyllotaxisJitter * i * 0.3) % 360;
    const ageFactor = Math.max(1.0, Math.min(1.5, 1 + ageTT / 1000));
    const rawGravityDroop = computeGravityDroopDeg({
      currentAreaCm2: currentAreaCm2_linear,
      referenceAreaCm2: cultivar.growthProfile.maxLeafAreaCm2,
      ageFactor,
      // Iter 32 — cultivar droopSensitivity (cherry 0.7 / round 1.0 / beefsteak 1.4).
      droopSensitivity: cultivar.growthProfile.droopSensitivity ?? 1.0,
    });
    // ★ Iter 32 (사용자 통찰) — petiole이 _이미 처진 만큼_ 차감.
    //   petioleCurve의 마지막 tangent가 지면 향하면 (droopExtra °) leaf 본체는
    //   이미 그만큼 down. mesh additional droop은 _순_ 추가량만.
    //   double droop 방지 — mature large leaf (petiole 30° + mesh 20°)가
    //   _총 50° down_ 부자연 시각 방지.
    const gravityDroop = Math.max(0, rawGravityDroop - droopExtra);
    const petioleBaseElevation = computePetioleBaseElevationDeg({
      expansionProgress: leafMaturity,
    });
    const waterStressDroopPhase5 = computeWaterStressDroopDeg(waterStress);
    const posture: LeafPostureState = composePosture({
      lightSeekingBladePlaneTiltDeg: 0,  // 상부광 default
      petioleBaseElevationDeg: petioleBaseElevation,
      gravityDroopDeg: gravityDroop,
      senescenceDroopDeg: senescenceState.droopDeg,
      waterStressDroopDeg: waterStressDroopPhase5,
      // Iter 31 Phase 9.4 (R16 fix) — base curl 0.12 → 0.30.
      // 사용자 결함: "잎의 메시가 빳빳하다, bending이 전혀 구현 안 됨".
      // 0.12 base는 _9mm cup_ for 4.5cm leaflet (11% — 시각상 거의 안 보임).
      // 0.30 base = 27% cup (시각상 명확 transverse arc).
      curl: 0.30 + yellowing * 0.20,
    });

    // Iter 29 Phase 5 — morphology with per-node deterministic variance
    //   (VARIANCE-01 / VARIANCE-CLAMP-01). Baseline values flow from genome
    //   (which itself accepts cultivar leaf-shape distribution in Phase 5
    //   via generateGenome({ cultivar })). Per-node ±15% perturbation
    //   keeps every leaf inside the same plant slightly different.
    const baseMorphology: LeafMorphologyState = {
      serrationDepth: genome.leafSerrationDepth ?? 0.12,
      lobeDepth: genome.leafLobeDepth ?? 0.05,
      // ★ Iter 33 V3 — cultivar reference (이전 0.30 hardcoded).
      petioleLengthM: cultivar.growthProfile.referencePetioleLengthM ?? 0.30,
      variationSeed: ((genome.seed >>> 0) ^ (i * 2654435761 >>> 0)) >>> 0,
    };
    const morphology: LeafMorphologyState = applyMorphologyVariance(baseMorphology, 0.15);

    // Target/current area + expansion progress.
    const canonicalExpansionProgress =
      computeLeafExpansionProgress(ageTT, expDurTT, 0.015);
    // Iter 30 Phase 0.A — Linear Product 4-Stage (R1 quadratic fix).
    //
    // 이전 (quadratic 잔차):
    //   targetAreaCm2 = (leafAreaCm2 / leafExpansion²) × sourceSinkProxyV1
    //   = max × (position × juvenile × vigor)² × proxy   ← Plan §6 violation
    //
    // 신규 (Plan §6 linear product, 위 4-stage 값 재사용):
    //   targetAreaCm2 = potentialAreaCm2 × allocationFactor
    //                 = max × position × vigor × proxy × stress
    //   currentAreaCm2 = targetAreaCm2 × leafExpansion × plantJuvenileScale
    //
    // POTENTIAL-TARGET-CURRENT-01: potential ≥ target ≥ current 항등식.
    const targetAreaCm2 = targetAreaCm2_linear;
    const currentAreaCm2 = Math.min(targetAreaCm2, currentAreaCm2_linear);

    // Iter 31 Phase 2 — Leaf geometry projection (PlantBase 산식).
    //
    // ★ Skin은 _읽고 곱하기만_. 모든 ageTT × cultivar × sigmoid 계산은 여기서 끝남.
    // sqrt(current/reference) + cultivar reference rachis/petiole + lengthMaturity ×
    // apicalYouthFactor (어린 leaf axis gate, R5 fix).
    const mainLeafGeometryProjection = computeLeafGeometryProjection({
      currentAreaCm2,
      ageTT,
      referenceLeafAreaCm2: cultivar.growthProfile.referenceLeafAreaCm2
        ?? cultivar.growthProfile.maxLeafAreaCm2,
      referenceRachisLengthM: cultivar.growthProfile.referenceRachisLengthM ?? 0.30,
      referencePetioleLengthM: cultivar.growthProfile.referencePetioleLengthM ?? 0.10,
      leafExpansionDurationTT: cultivar.growthProfile.leafExpansionDurationTT,
      leafLengthExpansionDurationTT:
        cultivar.growthProfile.leafLengthExpansionDurationTT,
      leafSizeMultiplier: genome.leafSizeMultiplier,
    });

    const leafOrgan: LeafOrganState = makeLeafOrganStateFromFlat({
      nodeIndex: i,
      initiationTT,
      visibleTT,
      ageTT,
      // Iter 30 Phase 2 — pre-allocation potential + allocation trace
      potentialAreaCm2,
      targetAreaCm2,
      currentAreaCm2,
      expansionProgress: Math.max(canonicalExpansionProgress, leafMaturity),
      leafletCount,
      posture,
      morphology,
      senescence: senescenceState,
      // Phase 2 allocation 4-factor (axisCapacityFactor는 Pass 3 후 갱신)
      allocation: allocationPhase2,
      // Iter 31 Phase 2 (R5) — geometry projection (PlantBase 계산, Skin 적용만)
      geometryProjection: mainLeafGeometryProjection,
    });

    // Iter 29 Phase 2A — Truss/SideShoot state shell (PHYTOMER-ORGAN-SHELL-01)
    let trussOrgan: TrussOrganState | undefined;
    if (truss !== null) {
      const trussState: TrussOrganState['state'] = truss.fruits.length === 0
        ? 'flowering'
        : truss.fruits.some((f) => f.ripenStage >= 5)
          ? 'ripening'
          : 'fruiting';
      trussOrgan = {
        initiationTT,
        ageTT,
        state: trussState,
      };
    }

    // Iter 30 Phase 1-Pre — growthContext (main axis = 'main').
    // Phase 1 Axis Capacity Model에서 axisCapacityFactor 계산 후 갱신 예정.
    // Phase 1-Pre 기본 1.0; localStemRadiusMm는 Pass 3 default 10mm (physics
    // pass에서 정확값 계산).
    const mainGrowthContext = makeMainAxisGrowthContext({
      localStemRadiusMm: 10,
      axisCapacityFactor: 1.0,
    });

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
      // Iter 29 Phase 1 — canonical TT + internode state + status
      initiationTT,
      visibleTT,
      ageTT,
      internode: internodeState,
      status,
      // Iter 29 Phase 2A — canonical organ state shells.
      leaf: leafOrgan,
      trussOrgan,
      // Iter 30 Phase 1-Pre — NodeGrowthContext (main axis)
      growthContext: mainGrowthContext,
    });
  }

  // ── Iter 30 Phase 1 — Main-axis capacity factor (post-Pass 3 update) ──
  //
  // Plan §3 — axis structural capacity proxy를 계산해서 각 node.growthContext
  // 에 전파. 약한 axis는 0.35~1.0 factor로 leaf demand 제한.
  // 단 Phase 0.A의 4-stage 산식은 _Pass 3 안에서_ targetArea 계산하므로,
  // 본 factor는 Phase 1에서 _growthContext에만 기록_하고, Phase 2 LeafAllocationState
  // 에서 실제 allocation 산식 wire-in (LEAF-TARGET-INCLUDES-AXIS-CAP-01).
  //
  // 약한 axis 시각 회복 효과는 Phase 2 commit 이후 측정.
  if (nodes.length > 0) {
    const mainPotentialAreas = nodes.map((n) => n.leaf?.targetAreaCm2 ?? 0);
    const mainNodeRadii = nodes.map((n) => n.stemRadiusMm);
    const mainNodeHeights = nodes.map((n) => n.heightCm);
    const mainMeanR = computeAxisMeanStemRadius({ nodeRadiiMm: mainNodeRadii });
    const mainLengthCm = computeAxisLengthCm({ nodeHeightsCm: mainNodeHeights });
    const mainCapacity = computeAxisStructuralCapacity({
      meanStemRadiusMm: mainMeanR,
      axisLengthCm: mainLengthCm,
      structuralCapacityCoeff: 1.0,
    });
    const mainDemand = computeAxisOrganDemand({
      leafPotentialAreasCm2: mainPotentialAreas,
    });
    const mainFactor = computeAxisCapacityFactor({
      axisStructuralCapacity: mainCapacity,
      axisOrganDemand: mainDemand,
    });
    for (const n of nodes) {
      if (n.growthContext) {
        n.growthContext = { ...n.growthContext, axisCapacityFactor: mainFactor };
      }
      // Phase 2 — leaf.allocation 재계산 (axisCapacityFactor 실제값 반영)
      // LEAF-TARGET-INCLUDES-AXIS-CAP-01 strict 실현.
      const leaf = n.leaf;
      if (leaf?.allocation && leaf.potentialAreaCm2 !== undefined) {
        const newAlloc = composeLeafAllocation({
          plantSourceFactor: leaf.allocation.plantSourceFactor,
          axisCapacityFactor: mainFactor,
          sideShootAllocationFactor: leaf.allocation.sideShootAllocationFactor,
          stressFactor: leaf.allocation.stressFactor,
        });
        leaf.allocation = newAlloc;
        // targetArea = potential × final
        leaf.targetAreaCm2 = leaf.potentialAreaCm2 * newAlloc.finalAllocationFactor;
        // currentArea ≤ targetArea (clamp)
        if (leaf.currentAreaCm2 > leaf.targetAreaCm2) {
          leaf.currentAreaCm2 = leaf.targetAreaCm2;
        }
      }
    }
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
          // Iter 31 Phase 1 (R6 fix) — sway phase + anchor restoring force는
          // _현재_ node 위치 기준이어야 in-phase. prev.position을 전달하면
          // phase lag 누적 → apex 마지막 internode Δy ≈ 0.06cm collapse.
          // (Phase 0 baseline: D=20~D=90 모든 시점 evidence.)
          nodes[i].position,
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
  //
  // Iter 30 Phase 1-Pre: sideShootIndex = traversal-order ordinal (0-based)
  // 이 axisId='side:0' 'side:1' 등으로 매핑됨.
  let sideShootOrdinal = 0;
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
      // Iter 29 Phase 1 — TT propagation to side-shoot chain.
      TT,
      dailyGDD,
      // Iter 29 Phase 2B — Source-Sink Proxy v1 multiplier (plant-wide).
      sourceSinkProxyV1,
      // Iter 30 Phase 1-Pre — side-shoot ordinal index for axisId.
      sideShootOrdinal,
    );
    sideShootOrdinal++;
  }

  // ── Iter 30 Phase 1 — Side-shoot axis capacity (post-populate update) ──
  //
  // 각 side-shoot axis별 capacity proxy 계산 + node growthContext 갱신.
  // 측지는 main 대비 _얇은 stem_이라 capacity가 작음 → demand 비율 ↑ →
  // axisCapacityFactor ↓ → 약한 axis 자동 억제 (Phase 2 wire-in 후).
  for (const axis of allAxes) {
    if (axis.order === 0) continue;  // main axis 이미 처리
    if (axis.nodes.length === 0) continue;
    const sidePotentialAreas = axis.nodes.map((n) => n.leaf?.targetAreaCm2 ?? 0);
    const sideNodeRadii = axis.nodes.map((n) => n.stemRadiusMm);
    const sideNodeHeights = axis.nodes.map((n) => n.heightCm);
    const sideMeanR = computeAxisMeanStemRadius({ nodeRadiiMm: sideNodeRadii });
    const sideLengthCm = computeAxisLengthCm({ nodeHeightsCm: sideNodeHeights });
    const sideCapacity = computeAxisStructuralCapacity({
      meanStemRadiusMm: sideMeanR,
      axisLengthCm: sideLengthCm,
      structuralCapacityCoeff: 1.0,
    });
    const sideDemand = computeAxisOrganDemand({
      leafPotentialAreasCm2: sidePotentialAreas,
    });
    const sideFactor = computeAxisCapacityFactor({
      axisStructuralCapacity: sideCapacity,
      axisOrganDemand: sideDemand,
    });
    // Iter 30 Phase 3 — per-axis SourceSinkProxy.
    // Iter 30 Phase 4 — Side-shoot Allocation Factor (parent vigor × apex × light).
    //   axisSupply = stem-volume × parentVigorFactor
    //   parentVigorFactor 근사: parent (main-axis) node의 stemVigorFactor.
    //     axis.parentNodeIdx로 main-axis node 참조 가능.
    const parentMainNode = axis.parentNodeIdx != null
      ? mainAxis.nodes[axis.parentNodeIdx]
      : undefined;
    // parent vigor ≈ stemVigorFactor evaluated at parent's height
    const parentHeightCm = parentMainNode?.heightCm ?? heightCm;
    const parentVigor = Math.max(0.5, Math.min(1.5,
      Math.pow(Math.max(1, parentHeightCm) / 50, 0.5),
    ));
    // Apex dominance: parent node fraction from apex (0 = apex, 1 = basal)
    const parentNodeFracFromApex = mainAxis.nodes.length > 0 && axis.parentNodeIdx != null
      ? Math.max(0, Math.min(1, (mainAxis.nodes.length - 1 - axis.parentNodeIdx) / Math.max(1, mainAxis.nodes.length - 1)))
      : 0.5;
    const apexRelease = computeApexDominanceReleaseFactor({ parentNodeFracFromApex });

    const sideShootAllocFactor = computeSideShootAllocationFactor({
      parentNodeVigor: parentVigor,
      cultivarSideShootPotential:
        cultivar.growthProfile.sideShootPotential ?? DEFAULT_CULTIVAR_SIDE_SHOOT_POTENTIAL,
      apexDominanceReleaseFactor: apexRelease,
      lightFactor: DEFAULT_LIGHT_FACTOR,
    });

    const sideAxisAvgLeafTarget = sidePotentialAreas.length > 0
      ? sidePotentialAreas.reduce((s, a) => s + a, 0) / sidePotentialAreas.length
      : 0;
    const sideAxisSourceProxy = computeAxisSourceSinkProxyV1({
      axisLeafCount: axis.nodes.length,
      axisAvgLeafTargetAreaCm2: sideAxisAvgLeafTarget,
      axisTrussCount: 0,
      axisMeanStemRadiusMm: sideMeanR,
      axisLengthCm: sideLengthCm,
      parentVigorFactor: parentVigor,  // ★ Phase 4 정밀화
      sourceSinkSensitivity: cultivar.growthProfile.sourceSinkSensitivity,
    });

    for (const n of axis.nodes) {
      if (n.growthContext) {
        n.growthContext = {
          ...n.growthContext,
          axisCapacityFactor: sideFactor,
          parentVigorFactor: parentVigor,  // ★ Phase 4 propagate
        };
      }
      // Phase 2 + 3 + 4 — side-shoot leaf.allocation 재계산
      const leaf = n.leaf;
      if (leaf?.allocation && leaf.potentialAreaCm2 !== undefined) {
        const newAlloc = composeLeafAllocation({
          plantSourceFactor: leaf.allocation.plantSourceFactor,
          axisSourceFactor: sideAxisSourceProxy,
          axisCapacityFactor: sideFactor,
          sideShootAllocationFactor: sideShootAllocFactor,  // ★ Phase 4 정밀화
          stressFactor: leaf.allocation.stressFactor,
        });
        leaf.allocation = newAlloc;
        leaf.targetAreaCm2 = leaf.potentialAreaCm2 * newAlloc.finalAllocationFactor;
        if (leaf.currentAreaCm2 > leaf.targetAreaCm2) {
          leaf.currentAreaCm2 = leaf.targetAreaCm2;
        }
      }
    }
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
    // Iter 29 Phase 1 — currentTT canonical growth time (GROWTH-CLOCK-01).
    // TT is computed at the top of computePlantState from simContext.TT or
    // approximateTT(day, 23, cultivar). All per-node initiationTT/ageTT are
    // derived from this value.
    currentTT: TT,
    mainAxis,
    allAxes,
    geometryMode: wireCompressed ? 'wire_compressed' : 'free',
  };
}
