// Scientific growth model for tomato plant
// Per-plant parameterization via PlantGenome

import type { PlantGenome } from './PlantGenome';
import { computePhysics } from './PhysicsModel';

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
}

export interface FlowerState {
  index: number;
  bloomProgress: number;
}

export interface TrussState {
  flowers: FlowerState[];
  fruits: FruitState[];
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
  // Physics (populated by PhysicsModel)
  massAboveKg: number;
  stemRadiusMm: number;
  bendingMomentNm: number;
  deflectionRad: number;
  deflectionAzimuth: number;
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

export function computePlantState(day: number, genome: PlantGenome): PlantState {
  const heightCm = genome.heightMaxCm * sigmoid(day, genome.heightSigmoidK, genome.heightSigmoidMid);

  const rawNodeCount = day < genome.nodeStartDay
    ? 0
    : (day - genome.nodeStartDay) / genome.nodeInterval + 1;
  const intNodeCount = Math.min(Math.floor(rawNodeCount), 50);
  // Emergence fraction for the newest node (0 = just appearing, 1 = fully formed)
  const newestEmergence = rawNodeCount > 0 ? rawNodeCount - Math.floor(rawNodeCount) : 1;

  const nodes: NodeState[] = [];
  let trussCount = 0;
  let totalFruits = 0;
  let maxRipenStage = -1;

  for (let i = 0; i < intNodeCount; i++) {
    const nodeDay = genome.nodeStartDay + i * genome.nodeInterval;
    const age = day - nodeDay;
    const isNewest = i === intNodeCount - 1 && intNodeCount > 0;

    const nodeFrac = intNodeCount <= 1 ? 0 : i / (intNodeCount - 1);
    const nodeHeightCm = heightCm * (0.02 + 0.96 * nodeFrac);

    // 3D phyllotaxis: golden angle spiral + per-plant jitter
    const phyllotaxisAngle = (i * GOLDEN_ANGLE + genome.phyllotaxisJitter * i * 0.3) % 360;

    const leafMaturity = Math.min(1, age / 7);
    const positionFactor = Math.sin(nodeFrac * Math.PI);
    const leafSizeFactor = (0.55 + 0.45 * positionFactor) * genome.leafSizeMultiplier;
    const yellowing = age > 60 ? Math.min(1, (age - 60) / 30) : 0;
    // Gravity-aware droop: increases significantly with age
    // Young leaves (<15 days): nearly upright, 0 extra droop
    // Middle-aged (15-40 days): moderate sag, petiole arcs outward
    // Old (40+ days): heavy sag, petiole droops strongly, leaf hangs
    // Real tomato: young leaves ~15° from horizontal, mature leaves 60-90°+ droop
    const droopExtra = age < 10
      ? 0
      : age < 25
        ? Math.min(35, (age - 10) * 1.2 * genome.leafDroopMultiplier)
        : age < 50
          ? Math.min(65, 18 + (age - 25) * 1.2 * genome.leafDroopMultiplier)
          : Math.min(90, 48 + (age - 50) * 1.0 * genome.leafDroopMultiplier);

    // Leaflet count with genome bias
    let leafletCount: number;
    const biasedMaturity = leafMaturity + genome.leafletCountBias * 0.15;
    if (biasedMaturity < 0.3) leafletCount = 5;
    else if (biasedMaturity < 0.6) leafletCount = 7;
    else leafletCount = 9;

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

              fruits.push({ index: f, diameterMm, ripenStage, ripenFraction, color, age: fruitAge });
              totalFruits++;
              if (ripenStage > maxRipenStage) maxRipenStage = ripenStage;

              // Flower persists during early fruit formation (withering petals)
              // Fades out over first 8 days of fruit growth
              if (fruitAge < 8) {
                const fadeProgress = 1 - (fruitAge / 8);
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
      // Physics fields — populated by computePhysics() below
      massAboveKg: 0, stemRadiusMm: 10, bendingMomentNm: 0,
      deflectionRad: 0, deflectionAzimuth: 0,
    });
  }

  // Leaf pruning: remove leaves below lowest ripe truss (greenhouse practice)
  let pruneBelow = -1;
  for (const node of nodes) {
    if (node.truss) {
      const hasRipeFruit = node.truss.fruits.some(f => f.ripenStage >= 4);
      if (hasRipeFruit) {
        pruneBelow = node.index;
        break; // lowest ripe truss found
      }
    }
  }
  if (pruneBelow > 0) {
    for (const node of nodes) {
      if (node.index < pruneBelow) {
        node.leafMaturity = 0; // pruned
      }
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

  return {
    seed: genome.seed,
    day, heightCm, nodes, nodeCount: intNodeCount, leafCount, trussCount,
    totalFruits, maxRipenStage, currentStage,
    hasCotyledons, cotyledonSize: Math.max(0, Math.min(1, cotyledonSize)),
  };
}
