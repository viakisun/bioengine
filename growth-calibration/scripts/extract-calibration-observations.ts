// extract-calibration-observations — Simulation Output (Artifact #3)
// adapter that produces PlantObservation-shaped JSONs from the live engine.
//
// Different from `packages/tomato-engine/diagnostics/snapshot.ts`:
//   - snapshot.ts: legacy PlantSnapshot format (preserved untouched).
//   - this file:   PlantObservation (growthCalibration.v1) — directly
//                   comparable to Reference Pack observations.
//
// Output:
//   growth-calibration/experiments/{experimentId}/simulation/{modelVersion}/
//     day_{NNN}/sim_{plantId}.json
//
// Usage:
//   npx vite-node growth-calibration/scripts/extract-calibration-observations.ts \
//     --cultivar tomimaru-muchoo \
//     --experimentId tomato_calibration_baseline \
//     --modelVersion growthModel.tomato.baseline \
//     --ensemble 20 \
//     --baseSeed 20260520 \
//     --days 0,10,20,30,40,50,60,70,80,90,100,110,120,130,140,150
//
// Each (seed, day) cell → 1 PlantObservation file. Ensemble of N=20 covers
// gaussian genome variation per cultivar (same approach as
// scripts/extract-weekly-metrics.ts).

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { GrowthEngine } from '../../packages/tomato-engine/src/GrowthEngine';
import { getCultivar } from '../../packages/tomato-engine/src/Cultivar';
import { DEFAULT_CLIMATE } from '../../packages/tomato-engine/src/CoreModel';
import { ACTIVE_ENGINE_MODE } from '../../packages/tomato-engine/src/EngineMode';
import { computePlantGeometry } from '../../src/plant/PlantBase';
import type {
  PlantObservation,
  TrussObservation,
  LeafObservation,
  FruitObservation,
  TrussStatus,
  FruitStatus,
  Provenance,
} from '../schema/types';

// ── CLI ───────────────────────────────────────────────────────────────

const DEFAULT_DAYS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];

interface CliArgs {
  cultivar: string;
  experimentId: string;
  modelVersion: string;
  ensemble: number;
  baseSeed: number;
  days: number[];
  outRoot: string;
}

function parseArgs(argv: string[]): CliArgs {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith('--')) opts[key] = 'true';
      else { opts[key] = val; i++; }
    }
  }
  return {
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    experimentId: opts.experimentId ?? 'tomato_calibration_baseline',
    modelVersion: opts.modelVersion ?? 'growthModel.tomato.baseline',
    ensemble: opts.ensemble ? Number(opts.ensemble) : 20,
    baseSeed: opts.baseSeed ? Number(opts.baseSeed) : 20260520,
    days: opts.days
      ? opts.days.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0)
      : DEFAULT_DAYS,
    outRoot: opts.outRoot ?? join(__dirname, '..', 'experiments'),
  };
}

// ── Status mapping (engine → schema enum) ─────────────────────────────

/**
 * Map a physiology TrussCohort to TrussStatus.
 * Heuristic — uses physiology phase + per-fruit ripenStage to decide.
 */
function mapTrussStatus(
  t: { emergenceTT: number; fruits: ReadonlyArray<{ fertilizationTT: number; ripenStage: number; aborted: boolean; harvested: boolean; diameter: number }> },
  currentTT: number,
): TrussStatus {
  if (t.emergenceTT > currentTT) return 'not_visible';
  const liveFruits = t.fruits.filter(f => !f.aborted && !f.harvested);
  if (liveFruits.length === 0) {
    // No fruit yet — either bud or flowering
    return currentTT - t.emergenceTT < 50 ? 'visible_bud' : 'flowering';
  }
  // Has fruit — find dominant ripen stage
  const setCount = liveFruits.filter(f => f.fertilizationTT > 0 && f.diameter < 10).length;
  const expandingCount = liveFruits.filter(f => f.diameter >= 10 && f.ripenStage === 0).length;
  const breakerCount = liveFruits.filter(f => f.ripenStage >= 1 && f.ripenStage < 4).length;
  const redCount = liveFruits.filter(f => f.ripenStage >= 4).length;
  const allHarvested = liveFruits.length === 0 && t.fruits.some(f => f.harvested);

  if (allHarvested) return 'senescent';
  if (redCount > liveFruits.length / 2) return 'red';
  if (breakerCount > liveFruits.length / 2) return 'breaker';
  if (expandingCount > liveFruits.length / 2) return 'green_expanding';
  if (setCount > liveFruits.length / 2) return 'fruit_set';
  return 'flowering';
}

/**
 * Map a single PhysiologyFruit to FruitStatus.
 */
function mapFruitStatus(
  f: { fertilizationTT: number; ripenStage: number; aborted: boolean; harvested: boolean; diameter: number },
): FruitStatus {
  if (f.harvested) return 'harvested';
  if (f.aborted) return 'aborted';
  if (f.fertilizationTT <= 0) return 'flower';
  if (f.ripenStage >= 4) return 'red';
  if (f.ripenStage >= 3) return 'turning';
  if (f.ripenStage >= 1) return 'breaker';
  if (f.diameter >= 30) return 'green_expanding';
  if (f.diameter >= 5)  return 'small_green';
  return 'fruit_set';
}

// ── PlantObservation builder ──────────────────────────────────────────

const TWO_PI = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

function rad2deg(rad: number): number {
  return ((rad % TWO_PI) + TWO_PI) % TWO_PI * RAD_TO_DEG;
}

interface BuildArgs {
  experimentId: string;
  modelVersion: string;
  cultivarName: string;
  seed: number;
  day: number;
}

function buildObservation(args: BuildArgs): PlantObservation {
  const cultivar = getCultivar(args.cultivarName);
  const engine = new GrowthEngine();
  engine.setEnvironment({
    temperatureC: DEFAULT_CLIMATE.T_avg,
    lightHoursPerDay: DEFAULT_CLIMATE.daylight_hours,
    co2ppm: DEFAULT_CLIMATE.CO2_ppm,
  });
  engine.addPlant({ seed: args.seed, cultivarName: args.cultivarName });
  engine.simulatePlantToHour(args.seed, args.day, 0, DEFAULT_CLIMATE);

  const physiology = engine.getPhysiologyState(args.seed)!;
  const state = engine.computeState(args.seed, args.day);
  const genome = engine.getGenome(args.seed)!;
  const plantBase = computePlantGeometry(state, { genome, cultivar, physiologyState: physiology });

  // ── Truss + Fruit observation building ──────────────────────────
  const trusses: TrussObservation[] = [];
  const fruits: FruitObservation[] = [];
  for (let i = 0; i < physiology.trusses.length; i++) {
    const t = physiology.trusses[i];
    const live = t.fruits.filter(f => !f.aborted && !f.harvested && f.fertilizationTT > 0);
    const largestDiam = live.length > 0 ? Math.max(...live.map(f => f.diameter)) : 0;
    const trussId = `T${i + 1}`;

    trusses.push({
      trussId,
      trussIndex: i + 1,
      attachedNodeIndex: 0,                          // not directly available — TODO Phase C
      status: mapTrussStatus(t, physiology.TT),
      ageDays: physiology.TT > t.emergenceTT ? (physiology.TT - t.emergenceTT) / 12 : 0,
      peduncleLengthCm: 0,
      rachisLengthCm: 0,
      flowerBudCount: t.flowerCount,
      openFlowerCount: t.fruits.filter(f => f.fertilizationTT <= 0).length,
      fruitSetCount: t.fruits.filter(f => f.fertilizationTT > 0 && !f.aborted).length,
      visibleFruitCount: live.length,
      largestFruitDiameterMm: largestDiam,
      orientation: { azimuthDeg: 0, elevationDeg: -10, droopAngleDeg: 15 },
      phenology: {
        visibleDay: null, firstFlowerOpenDay: null, firstFruitSetDay: null,
        firstFruitVisibleDay: null, firstRipeDay: null,
      },
    });

    // Per-fruit observations
    for (let j = 0; j < t.fruits.length; j++) {
      const f = t.fruits[j];
      fruits.push({
        fruitId: `F${i + 1}_${j + 1}`,
        trussId,
        trussIndex: i + 1,
        positionInTruss: j + 1,
        status: mapFruitStatus(f),
        diameterMm: f.diameter,
        heightMm: f.diameter * 0.95,                 // crude — Phase C 보강
        estimatedWeightG: f.W_fruit_fresh,
        colorStage: f.ripenStage >= 4 ? 'red' : f.ripenStage >= 1 ? 'turning' : 'green',
        visibility: { visible: !f.aborted && !f.harvested, occlusionRatio: 0 },
        phenology: {
          flowerOpenDay: null, fruitSetDay: null, visibleFruitDay: null,
          breakerDay: null, ripeDay: null,
        },
      });
    }
  }

  // ── Leaf observation building (from plantBase) ──────────────────
  const leaves: LeafObservation[] = [];
  const allAxes = [plantBase.mainAxis, ...plantBase.sideShoots];
  for (let axisIdx = 0; axisIdx < allAxes.length; axisIdx++) {
    const axis = allAxes[axisIdx];
    for (const leaf of axis.leaves) {
      if (!leaf.visibility.visible) continue;
      leaves.push({
        leafId: `L_a${axisIdx}_n${leaf.nodeIdx}`,
        nodeIndex: leaf.nodeIdx,
        status: leaf.yellowing > 0.5 ? 'senescing' : leaf.sizeFactor < 0.5 ? 'expanding' : 'expanded',
        ageDays: 0,                                  // not directly available
        compoundLeaf: leaf.leafletCount > 1,
        leafletCount: leaf.leafletCount,
        petioleLengthCm: leaf.petioleLengthM * 100,
        rachisLengthCm: 0,                           // not in PlantBase.LeafBase directly
        leafLengthCm: 0,                             // TODO derive
        leafWidthCm: 0,
        leafAreaCm2: 0,                              // TODO derive from sizeFactor
        orientation: {
          azimuthDeg: rad2deg(leaf.azimuthRad),
          elevationDeg: 0,                           // TODO
          droopAngleDeg: leaf.droopRad * RAD_TO_DEG,
          rollDeg: 0,
        },
        shape: { averageLeafletAspect: 1.8, serrationLevel: 'medium', curlLevel: 'low' },
        health: {
          colorStage: leaf.yellowing > 0.5 ? 'yellowing' : 'green',
          senescence: leaf.yellowing,
          damageRatio: leaf.diseaseLoad,
        },
      });
    }
  }

  // ── Plant overall ───────────────────────────────────────────────
  const allLeavesActive = leaves.filter(l => l.status !== 'senescing' && l.status !== 'shed');
  const leavesExpanded = leaves.filter(l => l.status === 'expanded' || l.status === 'mature');
  const trussesFlowering = trusses.filter(t => t.status === 'flowering').length;
  const trussesFruiting = trusses.filter(t => ['fruit_set','small_green','green_expanding','fruit_expanding','breaker','ripening','red','harvest_ready'].includes(t.status)).length;
  const fruitsVisible = fruits.filter(f => f.visibility.visible && !['flower'].includes(f.status));
  const maxFruitDiamMm = fruitsVisible.length > 0 ? Math.max(...fruitsVisible.map(f => f.diameterMm)) : 0;

  const provenance: Provenance = {
    sourceType: 'simulation',
    confidence: 'high',                              // engine deterministic per seed
    sourceRefs: [`engineMode:${ACTIVE_ENGINE_MODE}`],
    notes: `Generated by GrowthEngine for cultivar=${args.cultivarName} seed=${args.seed} day=${args.day}`,
  };

  const accumulatedGdd = physiology.TT;
  const dailyGdd = args.day > 0 ? accumulatedGdd / args.day : 12;

  return {
    schemaVersion: 'growthCalibration.v1',
    provenance,
    experimentId: args.experimentId,
    plantId: `SIM_seed${args.seed}`,
    modelVersion: args.modelVersion,
    parameterSetId: args.cultivarName,
    seed: args.seed,
    day: args.day,
    observationDate: `simulated_day_${args.day}`,
    plantAgeDays: args.day,
    thermalTime: {
      baseTemperatureC: 10,
      dailyGdd,
      accumulatedGdd,
      method: 'simple_average',
    },
    overall: {
      heightCm: state.heightCm,
      mainStemLengthCm: state.heightCm,
      mainStemDiameterMm: 0,                          // not directly available
      nodeCount: state.nodeCount,
      visibleLeafCount: allLeavesActive.length,
      expandedLeafCount: leavesExpanded.length,
      visibleTrussCount: trusses.filter(t => t.status !== 'not_visible').length,
      floweringTrussCount: trussesFlowering,
      fruitingTrussCount: trussesFruiting,
      fruitCountTotal: fruitsVisible.length,
      maxFruitDiameterMm: maxFruitDiamMm,
      laiCanopy: physiology.LAI,
    } as PlantObservation['overall'] & { maxFruitDiameterMm: number },
    phenology: {
      vegetativeStage: args.day < 10 ? 'germination' : args.day < 30 ? 'juvenile' : args.day < 90 ? 'active_growth' : 'mature',
      reproductiveStage: trussesFruiting > 0 ? 'fruit_expansion' : trussesFlowering > 0 ? 'flowering' : trusses.length > 0 ? 'truss_initiation' : 'none',
      firstVisibleTrussDay: null,
      firstFlowerOpenDay: null,
      firstFruitSetDay: null,
      firstFruitVisibleDay: null,
      firstRipeFruitDay: null,
    },
    nodes: [],
    leaves,
    trusses,
    fruits,
    qualityFlags: { missingMeasurement: false, occludedOrgans: false, imageQuality: 'good' },
  };
}

// ── Run ───────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const simRoot = join(args.outRoot, args.experimentId, 'simulation', args.modelVersion);

  process.stdout.write(
    `[extract-calibration-observations] cultivar=${args.cultivar} ensemble=${args.ensemble} ` +
    `baseSeed=${args.baseSeed} days=${args.days.length} → ${simRoot}\n`,
  );

  let wrote = 0;
  for (let n = 0; n < args.ensemble; n++) {
    const seed = args.baseSeed + n;
    for (const day of args.days) {
      const dayDir = join(simRoot, `day_${day.toString().padStart(3, '0')}`);
      ensureDir(dayDir);
      try {
        const obs = buildObservation({
          experimentId: args.experimentId,
          modelVersion: args.modelVersion,
          cultivarName: args.cultivar,
          seed,
          day,
        });
        const outFile = join(dayDir, `sim_SIM_seed${seed}.json`);
        writeFileSync(outFile, JSON.stringify(obs, null, 2));
        wrote++;
      } catch (e) {
        process.stdout.write(`  ✗ seed=${seed} day=${day}: ${(e as Error).message}\n`);
      }
    }
    if ((n + 1) % 5 === 0) process.stdout.write(`  seed ${n + 1}/${args.ensemble} done\n`);
  }

  process.stdout.write(`\n[done] wrote ${wrote} observation files\n`);
}

main();
