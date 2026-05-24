// Diagnostic snapshot — captures a deterministic plant state at one or
// more days under a fixed cultivar / scenario / training / engine mode.
// Output is per-day JSON files that act as regression baselines for the
// v3.0 hybrid FSPM migration (see plan-tomato-truss-anatomy-magical-pancake.md).
//
// Usage:
//   npm run tomato:snapshot -- --cultivar tomimaru-muchoo --seed 42
//   npm run tomato:snapshot -- --cultivar tomimaru-muchoo --seed 42 --days 30,60,90,100,120
//
// Output:
//   packages/tomato-engine/diagnostics/snapshots/
//     {cultivar}-{scenario}-{training}-seed{n}-day{d}.json
//
// Scenario / training are recorded in the JSON but are placeholder
// "current" values until Phase 4/5 introduce real scenarios.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GrowthEngine } from '../src/GrowthEngine';
import { ACTIVE_ENGINE_MODE } from '../src/EngineMode';
import {
  type PlantPhysiologyState,
  type DailyClimate,
  DEFAULT_CLIMATE,
} from '../src/CoreModel';
import { getCultivar, getScenario } from '../src/Cultivar';
import {
  ACTIVE_SCENARIO,
  setActiveScenario,
  ACTIVE_TRAINING,
  setActiveTraining,
} from '../src/ModelRegistry';
import type { PlantState } from '../src/GrowthModel';

const DEFAULT_DAYS = [30, 45, 60, 75, 90, 100, 120];
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(SCRIPT_DIR, 'snapshots');

interface CliArgs {
  cultivar: string;
  seed: number;
  days: number[];
  scenario: string;
  training: string;
  climate: DailyClimate;
}

function parseArgs(argv: string[]): CliArgs {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith('--')) {
        opts[key] = 'true';
      } else {
        opts[key] = val;
        i++;
      }
    }
  }
  return {
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    seed: opts.seed ? Number(opts.seed) : 42,
    days: opts.days
      ? opts.days.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
      : DEFAULT_DAYS,
    scenario: opts.scenario ?? 'current',
    training: opts.training ?? 'current',
    climate: DEFAULT_CLIMATE,
  };
}

interface TrussSnapshot {
  order: number;
  emergenceTT: number;
  flowerCount: number;
  liveFruitCount: number;
  abortedCount: number;
  harvestedCount: number;
  meanFreshMassG: number;
  meanDiameterMm: number;
  ripenStageHistogram: number[]; // length 6
}

interface PlantSnapshot {
  day: number;
  TT: number;
  cultivarId: string;
  scenarioId: string;
  trainingId: string;
  engineMode: string;
  seed: number;

  // From CoreModel
  N: number;
  LAI: number;
  W_g: number;
  W_f_g: number;
  W_m_g: number;
  heightCm_physiology: number;
  trussCountPhysiology: number;

  // From GrowthModel structural view
  heightCm_structural: number;
  nodeCount_structural: number;
  mainAxisNodeCount: number;
  firstTrussNodeIdx: number | null;
  trussCount_structural: number;
  totalFruits_structural: number;
  axesCount: number;
  sideShootCount: number;
  sideShootWithTrussCount: number;
  geometryMode: 'free' | 'wire_compressed';

  // Per-physiology-truss detail
  trusses: TrussSnapshot[];
}

function summariseTrusses(physiology: PlantPhysiologyState): TrussSnapshot[] {
  return physiology.trusses.map((t) => {
    const live = t.fruits.filter((f) => !f.aborted && !f.harvested && f.fertilizationTT > 0);
    const aborted = t.fruits.filter((f) => f.aborted).length;
    const harvested = t.fruits.filter((f) => f.harvested).length;
    const meanMass =
      live.length > 0 ? live.reduce((s, f) => s + f.W_fruit_fresh, 0) / live.length : 0;
    const meanDiam =
      live.length > 0 ? live.reduce((s, f) => s + f.diameter, 0) / live.length : 0;
    const histo = [0, 0, 0, 0, 0, 0];
    for (const f of live) histo[Math.max(0, Math.min(5, f.ripenStage))] += 1;
    return {
      order: t.index + 1,
      emergenceTT: round(t.emergenceTT, 1),
      flowerCount: t.flowerCount,
      liveFruitCount: live.length,
      abortedCount: aborted,
      harvestedCount: harvested,
      meanFreshMassG: round(meanMass, 2),
      meanDiameterMm: round(meanDiam, 2),
      ripenStageHistogram: histo,
    };
  });
}

function summariseStructure(plant: PlantState) {
  const mainNodes = plant.mainAxis?.nodes ?? plant.nodes;
  const firstTrussIdx = mainNodes.findIndex((n) => n.truss !== null);
  const sideAxes = plant.allAxes.filter((a) => a.order > 0);
  const sideShootWithTruss = sideAxes.filter((a) =>
    a.nodes.some((n) => n.truss !== null),
  ).length;
  return {
    heightCm_structural: round(plant.heightCm, 2),
    nodeCount_structural: plant.nodeCount,
    mainAxisNodeCount: mainNodes.length,
    firstTrussNodeIdx: firstTrussIdx >= 0 ? firstTrussIdx : null,
    trussCount_structural: plant.trussCount,
    totalFruits_structural: plant.totalFruits,
    axesCount: plant.allAxes.length,
    sideShootCount: sideAxes.length,
    sideShootWithTrussCount: sideShootWithTruss,
    geometryMode: plant.geometryMode,
  };
}

function round(x: number, places: number): number {
  const k = 10 ** places;
  return Math.round(x * k) / k;
}

function snapshotAt(
  day: number,
  seed: number,
  cultivarName: string,
  scenarioId: string,
  trainingId: string,
  climate: DailyClimate,
): PlantSnapshot {
  const cultivar = getCultivar(cultivarName);

  // Single engine drives both physiology and structural paths so
  // computeState() picks up the live physiology via SimulationContext
  // (Phase 3 hybrid path).
  const engine = new GrowthEngine();
  engine.setEnvironment({
    temperatureC: climate.T_avg,
    lightHoursPerDay: climate.daylight_hours,
    co2ppm: climate.CO2_ppm,
  });
  engine.addPlant({ seed, cultivarName });

  // Hour-stepping CoreModel — populates entry.physiology in the engine.
  engine.simulatePlantToHour(seed, day, 0, climate);
  const physiology = engine.getPhysiologyState(seed)!;

  const plant = engine.computeState(seed, day);

  return {
    day,
    TT: round(physiology.TT, 2),
    cultivarId: cultivarName,
    scenarioId,
    trainingId,
    engineMode: ACTIVE_ENGINE_MODE,
    seed,
    N: physiology.N,
    LAI: round(physiology.LAI, 3),
    W_g: round(physiology.W, 2),
    W_f_g: round(physiology.W_f, 2),
    W_m_g: round(physiology.W_m, 2),
    heightCm_physiology: round(physiology.heightCm, 2),
    trussCountPhysiology: physiology.trusses.length,
    ...summariseStructure(plant),
    trusses: summariseTrusses(physiology),
  };
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDir(SNAPSHOT_DIR);

  // Apply scenario as engine-global before any simulation starts.
  // Snapshot stamp uses the actual scenario the engine will run with.
  if (args.scenario !== 'current') {
    setActiveScenario(args.scenario);
  }
  if (args.training !== 'current') {
    setActiveTraining(args.training);
  }

  const activeScenarioName = ACTIVE_SCENARIO;
  const activeTrainingId = ACTIVE_TRAINING.metadata.id;
  const stamp = `${args.cultivar}-${activeScenarioName}-${activeTrainingId}-seed${args.seed}`;
  console.log(
    `[snapshot] cultivar=${args.cultivar} seed=${args.seed} scenario=${activeScenarioName} training=${activeTrainingId} days=${args.days.join(',')} mode=${ACTIVE_ENGINE_MODE}`,
  );

  for (const d of args.days) {
    const snap = snapshotAt(
      d,
      args.seed,
      args.cultivar,
      activeScenarioName,
      activeTrainingId,
      args.climate,
    );
    const outPath = join(SNAPSHOT_DIR, `${stamp}-day${d}.json`);
    writeFileSync(outPath, JSON.stringify(snap, null, 2) + '\n');
    const live = snap.trusses.reduce((s, t) => s + t.liveFruitCount, 0);
    console.log(
      `  day ${d.toString().padStart(3)}  TT=${snap.TT.toString().padStart(7)} ` +
        `trusses=${snap.trusses.length} liveFruits=${live} ` +
        `LAI=${snap.LAI} height=${snap.heightCm_physiology}cm`,
    );
  }
  console.log(`[snapshot] wrote ${args.days.length} files to ${SNAPSHOT_DIR}`);
}

main();
