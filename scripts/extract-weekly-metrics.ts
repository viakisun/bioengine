// scripts/extract-weekly-metrics.ts
//
// Drives our @farmsim/tomato-engine across days 7, 14, ... 112 (16 weeks)
// for N=20 seeded plants and emits per-week averages of:
//   • heightCm                       — total plant height
//   • nodeCount / leafCount          — node and unpruned-leaf totals
//   • avgInternodeCm                 — mean elongated internode length
//     (excludes hypocotyl and any node still in initial 1% pre-elongation)
//   • stemBaseDiameterMm             — diameter at base, computed by physics
//   • leafAreaCm2 (per-plant total)  — sum across unpruned leaves
//   • LAI (leaf area index)          — leafArea / plant footprint (0.6m × 0.4m)
//   • trussCount / flowersTotal / fruitsTotal
//   • maxRipenStage                  — 0 = green, 5 = full red
//   • fruitMassG / kgPerPlant        — derived from diameter (sphere × 0.65 g/cm³)
//
// Run with:  npx tsx scripts/extract-weekly-metrics.ts > /tmp/weekly.json
// We import directly from packages/tomato-engine/src (it's TS source, our
// model.main = src/index.ts so tsx resolves it natively).

import { GrowthEngine, type PlantState, type NodeState } from '../packages/tomato-engine/src';

const SAMPLE_SIZE = 20;
const SEED_BASE = 20260520;
const WEEKS = 16;
const PLANTING_FOOTPRINT_M2 = 0.6 * 0.4; // typical greenhouse row spacing

interface WeeklyMetrics {
  week: number;
  day: number;
  heightCm: number;
  nodeCount: number;
  leafCount: number;
  avgInternodeCm: number;
  stemBaseDiameterMm: number;
  leafAreaCm2: number;
  lai: number;
  trussCount: number;
  flowersTotal: number;
  fruitsTotal: number;
  ripeFruitsTotal: number; // ripenStage >= 4
  maxRipenStage: number;
  largestFruitMm: number;
  meanFruitMm: number;
  fruitMassGTotal: number;
  kgPerPlant: number;
}

function elongatedInternodeMean(nodes: NodeState[]): number {
  const ok = nodes.filter((n) => n.internodeLenCm > 0.5); // exclude hypocotyl + barely-elongated
  if (!ok.length) return 0;
  return ok.reduce((s, n) => s + n.internodeLenCm, 0) / ok.length;
}

function metricsForPlant(s: PlantState): Omit<WeeklyMetrics, 'week' | 'day'> {
  const stemBase = s.nodes[0]?.stemRadiusMm ? s.nodes[0].stemRadiusMm * 2 : 0;

  // Sum leaf area only over non-pruned leaves (leafMaturity > 0.2 = our leafCount threshold)
  const leafAreaCm2 = s.nodes
    .filter((n) => n.leafMaturity > 0.2)
    .reduce((sum, n) => sum + n.leafAreaCm2, 0);
  const lai = leafAreaCm2 / (PLANTING_FOOTPRINT_M2 * 10000); // cm²/m² → m²/m²

  let flowersTotal = 0;
  let fruitsTotal = 0;
  let ripeFruitsTotal = 0;
  let largestFruitMm = 0;
  let fruitDiamSum = 0;
  let fruitDiamCount = 0;
  let fruitMassGTotal = 0;

  for (const n of s.nodes) {
    if (!n.truss) continue;
    flowersTotal += n.truss.flowers.length;
    for (const f of n.truss.fruits) {
      fruitsTotal++;
      if (f.ripenStage >= 4) ripeFruitsTotal++;
      if (f.diameterMm > largestFruitMm) largestFruitMm = f.diameterMm;
      fruitDiamSum += f.diameterMm;
      fruitDiamCount++;
      // Fresh weight: spherical volume × tomato fresh density ~0.65 g/cm³
      const radiusCm = f.diameterMm / 20;
      const volCm3 = (4 / 3) * Math.PI * radiusCm * radiusCm * radiusCm;
      fruitMassGTotal += volCm3 * 0.65;
    }
  }

  return {
    heightCm: s.heightCm,
    nodeCount: s.nodeCount,
    leafCount: s.leafCount,
    avgInternodeCm: elongatedInternodeMean(s.nodes),
    stemBaseDiameterMm: stemBase,
    leafAreaCm2,
    lai,
    trussCount: s.trussCount,
    flowersTotal,
    fruitsTotal,
    ripeFruitsTotal,
    maxRipenStage: s.maxRipenStage,
    largestFruitMm,
    meanFruitMm: fruitDiamCount ? fruitDiamSum / fruitDiamCount : 0,
    fruitMassGTotal,
    kgPerPlant: fruitMassGTotal / 1000,
  };
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function aggregateWeek(states: PlantState[]): Omit<WeeklyMetrics, 'week' | 'day'> {
  const ms = states.map(metricsForPlant);
  return {
    heightCm: mean(ms.map((m) => m.heightCm)),
    nodeCount: mean(ms.map((m) => m.nodeCount)),
    leafCount: mean(ms.map((m) => m.leafCount)),
    avgInternodeCm: mean(ms.map((m) => m.avgInternodeCm)),
    stemBaseDiameterMm: mean(ms.map((m) => m.stemBaseDiameterMm)),
    leafAreaCm2: mean(ms.map((m) => m.leafAreaCm2)),
    lai: mean(ms.map((m) => m.lai)),
    trussCount: mean(ms.map((m) => m.trussCount)),
    flowersTotal: mean(ms.map((m) => m.flowersTotal)),
    fruitsTotal: mean(ms.map((m) => m.fruitsTotal)),
    ripeFruitsTotal: mean(ms.map((m) => m.ripeFruitsTotal)),
    maxRipenStage: mean(ms.map((m) => m.maxRipenStage)),
    largestFruitMm: mean(ms.map((m) => m.largestFruitMm)),
    meanFruitMm: mean(ms.map((m) => m.meanFruitMm)),
    fruitMassGTotal: mean(ms.map((m) => m.fruitMassGTotal)),
    kgPerPlant: mean(ms.map((m) => m.kgPerPlant)),
  };
}

const engine = new GrowthEngine();
engine.setEnvironment({
  temperatureC: 23,
  humidity: 0.7,
  lightHoursPerDay: 14,
  co2ppm: 800,
  substrateWater: 0.6,
  nutrientEC: 3.0,
});
for (let i = 0; i < SAMPLE_SIZE; i++) {
  engine.addPlant({ seed: SEED_BASE + i });
}

const weekly: WeeklyMetrics[] = [];
for (let week = 1; week <= WEEKS; week++) {
  const day = week * 7;
  const states: PlantState[] = [];
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    states.push(engine.computeState(SEED_BASE + i, day));
  }
  const agg = aggregateWeek(states);
  weekly.push({ week, day, ...agg });
}

console.log(JSON.stringify(weekly, null, 2));
