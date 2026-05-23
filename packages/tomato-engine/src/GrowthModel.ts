// Scientific growth model for tomato plant
// Per-plant parameterization via PlantGenome

import type { PlantGenome } from './PlantGenome';
import { computePhysics } from './PhysicsModel';
import type { Cultivar } from './Cultivar';
import { sampleCultivarGenome, getCultivar } from './Cultivar';
import { SeededRandom } from './SeededRandom';

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

    // Map physiology fruits → FruitState. Filter out aborted fruits.
    const liveFruits = physTruss.fruits.filter((f) => !f.aborted && f.fertilizationTT > 0);
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

function synthesizeGrowthDir(
  prevDir: { x: number; y: number; z: number },
  age: number,
  massAboveKg: number,
  rng: SeededRandom,
): { x: number; y: number; z: number } {
  const noiseX = rng.gaussian(0, 0.12);
  const noiseY = rng.gaussian(0, 0.04);
  const noiseZ = rng.gaussian(0, 0.12);
  const sagFactor = Math.min(0.3, age * 0.0005 + massAboveKg * 0.02);
  // light = (0, 1, 0) approx noon sun direction (up). Phototropism weight 0.10.
  return normalize3({
    x: prevDir.x * 0.65 + noiseX,
    y: prevDir.y * 0.65 + 0.25 + 0.10 + noiseY - sagFactor,
    z: prevDir.z * 0.65 + noiseZ,
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
  defoliationAggressiveness: number,
  maxOrder: number,
): void {
  // baseline params — should live in branching JSON eventually.
  const BASE_BUD_CHANCE = 0.04;
  const APICAL_DOMINANCE = 0.5;
  const SIDE_SHOOT_DELAY = 5;
  const LIGHT_FACTOR = 0.4;
  const PRUNE_DAILY = defoliationAggressiveness * 0.03;

  for (const axis of axes) {
    if (axis.order >= maxOrder) continue;
    for (let i = 0; i < axis.nodes.length; i++) {
      const node = axis.nodes[i];
      // Pruning: removes growing buds over time. Pruned ones stay dead.
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

export function computePlantState(
  day: number,
  genome: PlantGenome,
  stress: PlantStressInputs = {},
  cultivar: Cultivar = getCultivar('round-generic'),
): PlantState {
  const waterStress = Math.max(0, Math.min(1, stress.waterStress ?? 0));
  const diseaseLoad = Math.max(0, Math.min(1, stress.diseaseLoad ?? 0));
  // ============================================================
  // APEX-DRIVEN GROWTH MODEL
  // ============================================================
  // Real biology: shoot apical meristem (SAM) produces leaf primordia.
  // Leaves expand → produce gibberellin (GA) → GA moves basipetally →
  // internode BELOW the leaf elongates. Plant height = Σ(internode lengths).
  //
  // Result: early seedling is a rosette (compressed nodes, leaves stacked),
  // visible stem appears only after internodes begin elongating (~day 20+).
  // ============================================================

  const rawNodeCount = day < genome.nodeStartDay
    ? 0
    : (day - genome.nodeStartDay) / genome.nodeInterval + 1;
  const intNodeCount = Math.min(Math.floor(rawNodeCount), 50);
  const newestEmergence = rawNodeCount > 0 ? rawNodeCount - Math.floor(rawNodeCount) : 1;

  const baseInternode = genome.internodeLenCm ?? 6.5;
  const leafExpK = genome.leafExpansionRate ?? 0.35;

  // Internode elongation parameters (GA-mediated delay)
  const elongDelay = genome.internodeElongDelay ?? 4;
  const elongMid = genome.internodeElongMid ?? 8;
  const ELONG_K = 0.4; // sigmoid steepness for internode elongation

  // --- Pass 1: Compute final internode length + current elongation for each node ---
  // Hypocotyl: the stem below cotyledons (emerges day 5-7, reaches ~4cm)
  const hypocotylCm = day < 5 ? 0 : Math.min(4, (day - 5) * 0.8);

  const internodeData: Array<{ finalLen: number; currentLen: number; elongation: number }> = [];

  for (let i = 0; i < intNodeCount; i++) {
    const nodeDay = genome.nodeStartDay + i * genome.nodeInterval;
    const age = day - nodeDay;
    const nodeFrac = intNodeCount <= 1 ? 0 : i / (intNodeCount - 1);

    // Final (potential) internode length — same biology as before
    let finalLen: number;
    if (i === 0) {
      finalLen = 1.5; // first internode very short
    } else if (i < 4) {
      finalLen = 1.5 + i * 0.8; // seedling: 1.5, 2.3, 3.1, 3.9cm
    } else {
      // Growth vigor = derivative of sigmoid height curve at node creation time
      const S = sigmoid(nodeDay, genome.heightSigmoidK, genome.heightSigmoidMid);
      const vigor = 4 * S * (1 - S); // normalized 0-1, peak at sigmoid midpoint
      // Gap analysis P0 #1: floor 0.5 → 0.75 so off-peak nodes still
      // elongate to ~75% of baseInternode (was dropping to 50%).
      // Real beefsteak indeterminate keeps 6–10cm internodes nearly
      // whole-season; old curve produced ~3.25cm extremes.
      finalLen = baseInternode * (0.75 + 0.5 * vigor);
      if (nodeFrac > 0.8) {
        finalLen *= 1.0 - (nodeFrac - 0.8) * 0.5;
      }
    }

    // Internode elongation: delayed sigmoid
    // Leaf must expand first → produce GA → internode below elongates
    const elongAge = age - elongDelay;
    const elongation = elongAge <= 0
      ? 0.01  // pre-elongation: ~1% of final length (compressed primordium)
      : Math.max(0.01, sigmoid(elongAge, ELONG_K, elongMid));

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
    const nodeDay = genome.nodeStartDay + i * genome.nodeInterval;
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
    const leafSizeFactor = potentialSize * leafExpansion;

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

    // Leaflet count with genome bias
    let leafletCount: number;
    const biasedMaturity = leafMaturity + genome.leafletCountBias * 0.15;
    if (biasedMaturity < 0.3) leafletCount = 5;
    else if (biasedMaturity < 0.6) leafletCount = 7;
    else leafletCount = 9;

    // Truss logic (unchanged)
    let truss: TrussState | null = null;
    const isTrussNode = i >= genome.trussStartNode
      && (i - genome.trussStartNode) % genome.trussInterval === 0;

    if (isTrussNode) {
      const trussAge = age - 5;
      if (trussAge > 0) {
        trussCount++;
        const flowerCount = genome.flowersPerTruss;
        const flowers: FlowerState[] = [];
        const fruits: FruitState[] = [];

        for (let f = 0; f < flowerCount; f++) {
          const flowerDelay = f * 2;
          const flowerAge = trussAge - flowerDelay;

          if (flowerAge > 0) {
            const bloomProgress = Math.min(1, flowerAge / 5);
            const fruitAge = flowerAge - 12;

            if (fruitAge > 0) {
              const diameterMm = genome.fruitMaxDiameterMm
                * sigmoid(fruitAge, genome.fruitSigmoidK, genome.fruitSigmoidMid);
              let ripenStage = 0;
              let ripenFraction = 0;

              if (fruitAge > genome.ripenStartAge) {
                const ripenProgress = (fruitAge - genome.ripenStartAge) / genome.ripenDuration;
                const totalStageProgress = ripenProgress * 5;
                ripenStage = Math.min(5, Math.floor(totalStageProgress));
                ripenFraction = totalStageProgress - ripenStage;
                if (ripenStage >= 5) ripenFraction = 1;
              }

              const c1 = STAGE_COLORS[ripenStage];
              const c2 = STAGE_COLORS[Math.min(5, ripenStage + 1)];
              const color = lerpColor(c1, c2, ripenFraction);

              // Per-fruit cultivar sample (deterministic from genome.seed
              // + truss node index + fruit index). This is what
              // FruitGenerator reads to individualize geometry/color.
              const fruitGenomeRng = new SeededRandom(
                genome.seed * 7919 + i * 131 + f * 31 + 0x9e377,
              );
              // warm up
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

              // Gap analysis P1 #4: 8d → 14d. Real flowers + sepals
              // remain visible (yellowing) for ~2 weeks after fruit set,
              // overlapping with young green fruit on the same truss.
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

  // Leaf pruning — smooth, ripening-progress-tracked.
  //
  // Earlier implementation triggered binary on/off pruning the moment
  // any truss hit ripenStage >= 4: ~9 leaves disappeared in one frame
  // per plant, and because each plant had a different plantingDayOffset
  // the discrete jumps happened at different days (79, 84, 85, 88, 90…)
  // which made the canopy flicker as the user scrubbed the timeline.
  //
  // New rule, matching real grower practice BUT skewed for visual
  // lushness (operator/demo use case):
  //   • Trigger only at ripenStage >= 4 (담적색기 / 거의 완숙) instead of
  //     the earlier >= 2 — much less aggressive. The earlier window
  //     was biologically accurate but left the visible canopy too thin.
  //   • Fade scales with ripening progress (0 at stage 4, 1 at stage 5).
  //   • Distance-graduated over only 3 nodes (down from 5) so the prune
  //     "shadow" is narrower and most of the stem keeps its leaves.
  let highestRipenIdx = -1;
  let highestRipenProgress = 0;
  for (const node of nodes) {
    if (!node.truss) continue;
    for (const f of node.truss.fruits) {
      if (f.ripenStage >= 4) {
        const stageFrac = Math.max(0, Math.min(1, (f.ripenStage + f.ripenFraction - 4) / 1));
        if (node.index > highestRipenIdx) {
          highestRipenIdx = node.index;
          highestRipenProgress = stageFrac;
        } else if (node.index === highestRipenIdx && stageFrac > highestRipenProgress) {
          highestRipenProgress = stageFrac;
        }
      }
    }
  }
  if (highestRipenIdx > 0 && highestRipenProgress > 0) {
    const FADE_NODE_RANGE = 3;
    for (const node of nodes) {
      const distBelow = highestRipenIdx - node.index;
      if (distBelow <= 0) continue;
      const localFade = Math.min(1, distBelow / FADE_NODE_RANGE) * highestRipenProgress;
      node.leafMaturity *= Math.max(0, 1 - localFade);
    }
  }
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

  if (nodes.length > 0) {
    // First node: at hypocotyl top, direction straight up + tiny noise.
    nodes[0].position = { x: 0, y: hypocotylCm / 100, z: 0 };
    nodes[0].growthDir = synthesizeGrowthDir(
      { x: 0, y: 1, z: 0 },
      nodes[0].age,
      0,
      skeletonRng,
    );

    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const internodeM = nodes[i].internodeLenCm / 100;
      nodes[i].position = {
        x: prev.position.x + prev.growthDir.x * internodeM,
        y: prev.position.y + prev.growthDir.y * internodeM,
        z: prev.position.z + prev.growthDir.z * internodeM,
      };
      nodes[i].growthDir = synthesizeGrowthDir(
        prev.growthDir,
        nodes[i].age,
        nodes[i].massAboveKg,
        skeletonRng,
      );
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
  // cultivar.pruning.defoliationAggressiveness drives pruning rate.
  const defAgg = cultivar.defoliationAggressiveness ?? 0.3;
  const maxOrder = 2;
  for (let d = 0; d < Math.floor(day); d++) {
    activateAndPruneBuds(allAxes, skeletonRng, defAgg, maxOrder);
  }

  // Populate side-shoot axes' nodes — short starter chain per activated
  // bud, anchored at parent node's position with branch direction.
  for (let i = 0; i < mainAxis.nodes.length; i++) {
    const node = mainAxis.nodes[i];
    if (!node.sideShoot || node.budState !== 'growing') continue;
    if (node.sideShoot.nodes.length > 0) continue;

    const angleRad = ((node.sideShootAngleDeg ?? 35) * Math.PI) / 180;
    const az = node.sideShoot.branchAzimuth;
    const startDir = normalize3({
      x: node.growthDir.x * Math.cos(angleRad) + Math.cos(az) * Math.sin(angleRad),
      y: node.growthDir.y * Math.cos(angleRad) + Math.sin(angleRad) * 0.3,
      z: node.growthDir.z * Math.cos(angleRad) + Math.sin(az) * Math.sin(angleRad),
    });
    const shootAge = Math.max(0, node.age - 5);
    const shootInternodes = Math.min(8, Math.floor(shootAge / 4));
    node.sideShoot.parentAxisIdx = 0;
    allAxes.push(node.sideShoot);

    let pos = { ...node.position };
    let dir = startDir;
    for (let k = 0; k < Math.max(1, shootInternodes); k++) {
      const internodeM = 0.04 + skeletonRng.next() * 0.02;
      pos = {
        x: pos.x + dir.x * internodeM,
        y: pos.y + dir.y * internodeM,
        z: pos.z + dir.z * internodeM,
      };
      const nextDir = synthesizeGrowthDir(dir, shootAge, 0, skeletonRng);
      node.sideShoot.nodes.push({
        index: k,
        heightCm: node.heightCm + (pos.y - node.position.y) * 100,
        phyllotaxisAngle: (k * GOLDEN_ANGLE) % 360,
        leafMaturity: 0,
        leafSizeFactor: 0.4,
        leafletCount: 5,
        yellowing: 0,
        droopExtra: 0,
        truss: null,
        age: Math.max(0, shootAge - k * 3),
        emergence: 1,
        leafAreaCm2: 100,
        leafMassG: 3,
        internodeLenCm: internodeM * 100,
        massAboveKg: 0,
        stemRadiusMm: node.stemRadiusMm * 0.6 * (1 - k / 10),
        bendingMomentNm: 0,
        deflectionRad: 0,
        deflectionAzimuth: 0,
        waterStress,
        diseaseLoad,
        position: { ...pos },
        growthDir: { ...nextDir },
        budState: 'dormant',
        sideShoot: null,
        sideShootAngleDeg: null,
      });
      dir = nextDir;
    }
  }

  return {
    seed: genome.seed,
    day, heightCm, nodes, nodeCount: intNodeCount, leafCount, trussCount,
    totalFruits, maxRipenStage, currentStage,
    hasCotyledons, cotyledonSize: Math.max(0, Math.min(1, cotyledonSize)),
    waterStress, diseaseLoad,
    mainAxis,
    allAxes,
  };
}
