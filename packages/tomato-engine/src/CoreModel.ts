// CoreModel — Reduced TOMGRO 5-state mechanistic plant physiology.
//
// References (cited in plan a-drifting-wigderson.md):
//   - Jones, Kenig, Vallejos 1999, Trans. ASAE 42:255–265
//     (Reduced TOMGRO: N, LAI, W, W_f, W_m)
//   - Heuvelink 1996, Ann. Bot. 77:71–80 (TOMSIM, sink strength)
//   - Marcelis 1996, J. Exp. Bot. 47:1281 (sink-strength function)
//   - Gillaspy, Ben-David, Gruissem 1993, Plant Cell 5:1439
//     (3-phase fruit growth)
//   - Goudriaan & van Laar 1994 (canopy light integration)
//   - CROPGRO-Tomato, HortScience 2012 (T_base = 10°C)
//
// This model is daily-step. Inputs: cultivar (calibration), env (T_avg,
// PAR, day length, CO2). Outputs: full PlantPhysiologyState including
// per-fruit cohorts on each truss.
//
// Each fruit carries its own CultivarSample drawn from the cultivar
// distribution at the moment its truss appeared — so individuals
// within a plant differ in shape, mass, color variance, asymmetry,
// etc. This is the source of "per-fruit individuality" the visual
// layer reads from. The model never fakes shapes; the visual layer
// reads them.

import type { Cultivar, CultivarSample } from './Cultivar';
import { sampleCultivarGenome, getScenario, trussOrderRule } from './Cultivar';
import { SeededRandom } from './SeededRandom';
import { dailyNetDM, hourlyNetDM } from './Photosynthesis';
import { diurnalEnv, type HourlyClimate } from './DiurnalEnv';
import { ACTIVE_MODEL } from './ModelRegistry';
import { allocateDM } from './SinkAllocation';
import {
  acropetalGDDOffset, potentialDailyGrowthFW, updateAbortionTracker,
  potentialFreshMassG, potentialStepDryDemandG,
  type GompertzMassParams,
} from './FruitGrowth';
import { phytomerCountFromTT } from './SimulationContext';

// ─────────────────────────────────────────────────────────────────────
// Iter 5b — Gompertz sink demand helper (used by both stepDaily +
// stepMinutely). Returns per-truss-per-fruit MAX dry demand (g/step)
// in the same time unit as `stepGdd`.
// ─────────────────────────────────────────────────────────────────────
function gompertzParamsOf(cultivar: Cultivar): GompertzMassParams {
  // resolvedBotanical.gompertz는 Phase E에서 cultivar로부터 read하므로
  // 본 helper는 cultivar.gompertzRateB/InflectionC만 본다.
  // (cultivar.resolvedBotanical은 wire 후 통해서 채워짐)
  const exponentScaling = cultivar.resolvedBotanical.fruitDevelopment.gompertz.exponentScaling;
  return {
    rateB: cultivar.gompertzRateB,
    inflectionC: cultivar.gompertzInflectionC,
    exponentScaling,
    cellDivisionDurationGDD: cultivar.cellDivisionDurationGDD,
    cellExpansionDurationGDD: cultivar.cellExpansionDurationGDD,
  };
}

function computePerFruitGompertzDemand(
  state: PlantPhysiologyState,
  cultivar: Cultivar,
  stepGdd: number,
): number[][] {
  const gp = gompertzParamsOf(cultivar);
  const dryRatio = cultivar.resolvedBotanical.fruitDevelopment.massFlow.fruitDryMatterRatio;
  return state.trusses.map(t => t.fruits.map(f => {
    if (f.aborted || f.harvested || f.fertilizationTT < 0) return 0;
    return potentialStepDryDemandG(
      state.TT - f.fertilizationTT,    // gddSinceFertAtStepEnd
      stepGdd,                          // daily=T_eff_day, minutely=T_eff_per_min
      f.genome.potentialMassG,
      dryRatio,
      gp,
    );
  }));
}

// ---------------------------------------------------------------------------
// Environment input
// ---------------------------------------------------------------------------

export interface DailyClimate {
  /** Daily mean air temperature (°C). */
  T_avg: number;
  /** Daily integrated PAR at canopy top (mol photons m⁻² day⁻¹). Typical
   *  greenhouse winter ~5, summer ~25. */
  PAR_integral_mol: number;
  /** Day length (hours of sunlight). */
  daylight_hours: number;
  /** CO2 concentration (ppm). Tomato standard ~800 with enrichment, ~400 ambient. */
  CO2_ppm: number;
}

/** Default climate used when caller doesn't supply one. Tuned for a
 *  protected (greenhouse) culture with CO2 enrichment + some
 *  supplemental lighting — Korean smart-farm typical. */
export const DEFAULT_CLIMATE: DailyClimate = {
  T_avg: 22,
  PAR_integral_mol: 20,    // 20 mol m⁻² day⁻¹ — winter w/ HPS or sunny day
  daylight_hours: 14,
  CO2_ppm: 800,
};

// ---------------------------------------------------------------------------
// Cohort types — per-truss / per-fruit, as in TOMGRO
// ---------------------------------------------------------------------------

/** USDA ripening stage 0..5: green / breaker / turning / pink / light-red / red. */
export type RipenStage = 0 | 1 | 2 | 3 | 4 | 5;

export interface FruitCohort {
  /** 0 = basal (nearest to peduncle), trussFruitCount-1 = distal. */
  index: number;
  /** TT at which this fruit's flower opened. */
  anthesisTT: number;
  /** TT at which fruit set (Phase I → II) occurred. */
  fertilizationTT: number;
  /** Cell-division → expansion transition. */
  cellDivisionEndTT: number;
  /** TT at color break (USDA 0→1). */
  ripenStartTT: number;

  /** Current dry weight (g). */
  W_fruit_dry: number;
  /** Current fresh weight (g) — derived from dry × cultivar DM%. */
  W_fruit_fresh: number;
  /** Current equatorial diameter (mm). */
  diameter: number;

  /** USDA stage 0..5. */
  ripenStage: RipenStage;
  /** Continuous fraction within current stage, 0..1. */
  ripenFraction: number;

  /** Per-fruit morphology sample (locule count, H:W, ribbing, …). */
  genome: CultivarSample;

  /** True if this fruit was aborted (assimilate competition). */
  aborted: boolean;

  /** True if this fruit was picked off the truss (scenario.management
   *  .harvest). Harvested fruit no longer grow and are hidden from the
   *  visual. v3.0 Phase 4C. */
  harvested: boolean;

  /** Rolling count of days the fruit failed to meet 25% of potential
   *  growth (Marcelis 1996 abortion threshold). Aborts when this hits
   *  ABORTION_LAG_DAYS. */
  starvedDays: number;

  /** Iter 5b debug fields — populated when massFlow.debug=true. Snapshot
   *  scripts read these for audit (raw demand vs Gompertz limit vs
   *  trajectory cap). Optional + last-step-only (overwritten each step). */
  debug?: {
    rawSinkDemandG: number;
    maxStepDemandG: number;
    demandWasLimited: boolean;
    dryMassBeforeCapG: number;
    cumulativeDryCapG: number;
    cumulativeCapWasApplied: boolean;
    allocatedDryGrowthG: number;
    finalDryMassG: number;
  };
}

export interface TrussCohort {
  /** 0-based truss index along the stem. */
  index: number;
  /** TT when this truss emerged from the apex. */
  emergenceTT: number;
  /** Mean anthesis TT (about emergence + 50 GDD). */
  anthesisTT: number;
  /** Position along the main stem (m above bed top). */
  stemHeight_m: number;
  /** Initial flower count (drawn from cultivar.flowersPerTruss). */
  flowerCount: number;
  /** Live fruit count (after natural set + abortion + pruning). */
  fruitCount: number;
  /** Per-fruit cohorts. */
  fruits: FruitCohort[];
}

// ---------------------------------------------------------------------------
// Plant-level state — Reduced TOMGRO 5-state + cohorts
// ---------------------------------------------------------------------------

export interface PlantPhysiologyState {
  /** Plant seed (deterministic). */
  seed: number;
  /** Days since transplant. */
  day: number;
  /** Accumulated GDD (°C·day, T_base subtracted). */
  TT: number;

  // Reduced TOMGRO 5-state
  N: number;          // node count
  LAI: number;        // leaf area index (m²/m²) per plant footprint
  W: number;          // total plant dry matter (g)
  W_f: number;        // total fruit dry matter (g)
  W_m: number;        // mature (red) fruit dry matter (g)

  // Derived
  /** Plant height (cm), tracked separately because internode lengths matter for visualization. */
  heightCm: number;
  /** Active trusses (a truss is removed only after final harvest). */
  trusses: TrussCohort[];
  /** RNG state for deterministic per-truss sampling. */
  rngCounter: number;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function createPlant(seed: number): PlantPhysiologyState {
  // Commercial K-smartfarm transplants are 4-6 week old seedlings with
  // 5-7 true leaves — they already carry meaningful biomass when planted
  // out. These initial values reflect that.
  return {
    seed,
    day: 0,
    TT: 0,
    N: 5,
    LAI: 0.3,          // a 4-week seedling already has ~0.3 m² leaf area / m² footprint
    W: 15,             // ~15 g DM (cotyledons + 5-7 true leaves + stem + root)
    W_f: 0,
    W_m: 0,
    heightCm: 25,      // ~25 cm at transplant
    trusses: [],
    rngCounter: 1,
  };
}

/** Draw a deterministic per-truss RNG seeded by (plantSeed, trussIndex).
 *  Mixes the inputs with two Knuth multiplicative constants so adjacent
 *  indices produce well-separated first outputs (LCG's first .next() is
 *  poorly distributed for nearby seeds). */
function trussRng(plantSeed: number, trussIndex: number): () => number {
  const mixed = ((plantSeed * 2654435761) ^ (trussIndex * 0x9E3779B9)) >>> 0;
  const rng = new SeededRandom((mixed % 2147483646) + 1);
  // Discard the first few outputs — Lehmer LCG warm-up.
  rng.next(); rng.next(); rng.next();
  return () => rng.next();
}

function emergeTruss(
  state: PlantPhysiologyState,
  cultivar: Cultivar,
): void {
  const trussIdx = state.trusses.length;
  const order1 = trussIdx + 1;
  const rng = trussRng(state.seed, trussIdx);

  // v3.0 Phase 4B — flower count comes from the active scenario's
  // trussOrderProfile rule for this truss order; falls back to the
  // cultivar baseline if no profile match.
  const scenario = getScenario(cultivar);
  const rule = trussOrderRule(scenario, order1);
  const flowersDist = rule?.flowersPerTruss ?? cultivar.flowersPerTruss;
  const flowerCount = Math.max(
    3,
    Math.round(flowersDist.mu + flowersDist.sigma * gaussian(rng)),
  );

  // Stem height of this truss — internode ≈ 25 cm at peak.
  const stemHeight_m = 0.4 + trussIdx * 0.27;

  // Anthesis happens ~50 GDD after truss emergence (rough approximation).
  const anthesisTT = state.TT + 50;

  // Per-truss potential mass multiplier (scenario-driven).
  const massMul = rule?.potentialMassMultiplier ?? 1.0;

  const fruits: FruitCohort[] = [];
  for (let i = 0; i < flowerCount; i++) {
    const positionFrac = flowerCount > 1 ? i / (flowerCount - 1) : 0;
    const flowerAnthesisTT = anthesisTT + positionFrac * (cultivar.trussRipeningSpreadGDD * 0.3);
    const fruitGenome = sampleCultivarGenome(cultivar, rng);
    fruitGenome.potentialMassG = fruitGenome.potentialMassG * massMul;

    fruits.push({
      index: i,
      anthesisTT: flowerAnthesisTT,
      fertilizationTT: -1,
      cellDivisionEndTT: -1,
      ripenStartTT: -1,
      W_fruit_dry: 0,
      W_fruit_fresh: 0,
      diameter: 0,
      ripenStage: 0,
      ripenFraction: 0,
      genome: fruitGenome,
      aborted: false,
      harvested: false,
      starvedDays: 0,
    });
  }

  state.trusses.push({
    index: trussIdx,
    emergenceTT: state.TT,
    anthesisTT,
    stemHeight_m,
    flowerCount,
    fruitCount: 0,
    fruits,
  });

  state.rngCounter += 1;
}

function gaussian(rng: () => number): number {
  // Box-Muller standard normal
  const u1 = Math.max(1e-9, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ---------------------------------------------------------------------------
// Daily integration step
// ---------------------------------------------------------------------------

/**
 * Advance the plant by one day under the given climate. Phase-1 scope:
 *   - GDD accumulation (CROPGRO standard)
 *   - Truss emergence at GDD_per_truss intervals
 *   - Fruit set (Phase I → II) when anthesis TT reached
 *   - Ripening (USDA stage progression via GDD)
 *
 * Photosynthesis / sink-strength carbon allocation arrive in Phase 2.
 * For Phase 1, fruit dry weight grows along a placeholder Gompertz
 * curve calibrated to cultivar.potentialFruitMassG.
 */
/**
 * Single-minute integration step — the finest-grain building block.
 *
 * dtDays = 1/1440. Every time-proportional quantity (GDD, photo-
 * synthesis, allocation, maintenance respiration, abortion-tracker
 * decay) scales by dtDays. Event-based logic (truss emergence, fruit
 * set decision, pruning, phase transitions, ripening stage) is
 * TT-threshold driven and fires the moment the threshold is crossed,
 * so the time resolution doesn't change the event sequence.
 *
 * `env.hour` is the *fractional* hour of the day (e.g. 14.5 = 14:30),
 * which is what `diurnalEnv` produces when given a non-integer hour.
 */
export function stepMinutely(
  state: PlantPhysiologyState,
  cultivar: Cultivar,
  env: HourlyClimate,
): void {
  const dtDays = 1 / 1440;
  const HOURS_TO_MIN = 1 / 60;
  // Advance the day counter only at the very first minute of the day
  // (env.hour === 0 within a small epsilon to absorb fractional drift).
  const isDayStart = env.hour < 1 / 60;
  if (isDayStart) state.day += 1;

  // 1. Thermal time — per-minute share.
  const T_eff_per_min = (Math.max(0, Math.min(ACTIVE_MODEL.thermalTime.T_max_dev_C, env.T_now) - cultivar.T_base)) / 1440;
  state.TT += T_eff_per_min;

  // 2. Truss emergence — TT-threshold based, fires the first minute TT
  // crosses the threshold (event semantics preserved).
  const expectedTrussCount = Math.floor(
    Math.max(0, (state.TT - cultivar.GDD_to_first_flower) / cultivar.GDD_per_truss) + 1,
  );
  while (state.trusses.length < expectedTrussCount && state.trusses.length < 30) {
    emergeTruss(state, cultivar);
  }

  // 3. Per-truss processing — fruit set / phase boundaries / ripening
  for (const truss of state.trusses) {
    for (const fruit of truss.fruits) {
      if (fruit.aborted || fruit.harvested) continue;

      // Fruit set (Phase I → II) at anthesis + a short lag
      if (fruit.fertilizationTT < 0 && state.TT >= fruit.anthesisTT) {
        const setRng = trussRng(state.seed, truss.index + 10_000 + fruit.index);
        if (setRng() < cultivar.fruitSetRate) {
          fruit.fertilizationTT = state.TT;
        } else {
          fruit.aborted = true;
          continue;
        }
      }
      if (fruit.fertilizationTT < 0) continue;

      // Phase boundaries
      if (fruit.cellDivisionEndTT < 0 && state.TT - fruit.fertilizationTT >= cultivar.cellDivisionDurationGDD) {
        fruit.cellDivisionEndTT = state.TT;
      }
      const expansionEndTT =
        fruit.cellDivisionEndTT > 0
          ? fruit.cellDivisionEndTT + cultivar.cellExpansionDurationGDD
          : -1;
      if (fruit.ripenStartTT < 0 && expansionEndTT > 0 && state.TT >= expansionEndTT) {
        fruit.ripenStartTT = state.TT;
      }

      // 3b. Ripening (continuous in TT — fine to update each hour)
      if (fruit.ripenStartTT > 0) {
        const acropetal = acropetalGDDOffset(fruit, truss, cultivar);
        const gddRipening =
          (state.TT - fruit.ripenStartTT - acropetal) * fruit.genome.ripeningSpeedFactor;
        const stagesPerGDD = 5 / cultivar.ripeningDurationGDD;
        const continuous = Math.max(0, Math.min(5, gddRipening * stagesPerGDD));
        fruit.ripenStage = Math.min(5, Math.floor(continuous)) as RipenStage;
        fruit.ripenFraction = continuous - Math.floor(continuous);
      }
    }

    // Pruning (적과) — fires once per truss when all flowers decided.
    // Idempotent: once excess fruits are marked aborted, subsequent hours
    // don't add anything.
    const allDecided = truss.fruits.every(
      (f) => f.aborted || f.fertilizationTT > 0,
    );
    if (allDecided) {
      // v3.0 Phase 4B — fruit pruning is scenario- and order-aware.
      // The active scenario's trussOrderProfile gives a per-order
      // targetFruitCount; if management.fruitPruning.enabled is false
      // we skip pruning entirely so only natural abortion regulates set.
      const scenario = getScenario(cultivar);
      if (scenario.management.fruitPruning.enabled) {
        const rule = trussOrderRule(scenario, truss.index + 1);
        const target = rule?.targetFruitCount ?? cultivar.trussTargetFruitCount;
        if (target > 0) {
          const live = truss.fruits.filter((f) => !f.aborted);
          if (live.length > target) {
            live.sort((a, b) => a.index - b.index);
            for (let k = target; k < live.length; k++) live[k].aborted = true;
          }
        }
      }
    }

    truss.fruitCount = truss.fruits.filter(
      (f) => !f.aborted && !f.harvested && f.fertilizationTT > 0,
    ).length;
  }

  // 3b. Harvest (v3.0 Phase 4C) — scenario-driven. Once a fruit hits
  // the configured ripenStage we mark it harvested; downstream steps
  // (allocation, abortion tracker, visual layer) treat it as gone.
  {
    const scenario = getScenario(cultivar);
    if (scenario.management.harvest.enabled) {
      const stageThreshold = scenario.management.harvest.atRipenStage;
      for (const truss of state.trusses) {
        for (const fruit of truss.fruits) {
          if (fruit.aborted || fruit.harvested) continue;
          if (fruit.fertilizationTT < 0) continue;
          if (fruit.ripenStage >= stageThreshold) {
            fruit.harvested = true;
          }
        }
      }
    }
  }

  // 4. Photosynthesis → net new DM for this minute (= 1/60 of hourly).
  const newDM_min = hourlyNetDM(env, state.LAI, state.W) * HOURS_TO_MIN;

  // 5. Sink-driven allocation — distribute the minute's DM across organs
  if (newDM_min > 0) {
    // Iter 5b — Gompertz sink demand limit (per-step, per-fruit).
    //   stepGdd here = T_eff_per_min (this minute's GDD increment)
    const massFlow = cultivar.resolvedBotanical.fruitDevelopment.massFlow;
    const perFruitMaxMin = massFlow.enableStepDemandLimit
      ? computePerFruitGompertzDemand(state, cultivar, T_eff_per_min)
      : undefined;
    const alloc = allocateDM(newDM_min, state, cultivar, {
      perFruitMaxDemandG: perFruitMaxMin,
      surplusPolicy: massFlow.surplusPolicy,
    });
    const gp = gompertzParamsOf(cultivar);

    for (let ti = 0; ti < state.trusses.length; ti++) {
      const truss = state.trusses[ti];
      for (let fi = 0; fi < truss.fruits.length; fi++) {
        const fruit = truss.fruits[fi];
        if (fruit.aborted || fruit.harvested || fruit.fertilizationTT < 0) continue;
        const allocatedStep = alloc.trussFruitsG[ti][fi];

        // Abortion tracker — time-resolution-invariant: starvedDays
        // counter advances by dtDays each step where actual/potential
        // ratio is below the threshold, decays at the same rate when
        // feeding recovers. Abort fires when starvedDays >= 4.
        const T_eff_day_equiv = T_eff_per_min * 1440;
        const gddSinceFert = state.TT - fruit.fertilizationTT;
        const potentialFW_day = potentialDailyGrowthFW(gddSinceFert, T_eff_day_equiv, fruit.genome, cultivar);
        const potentialDM_step = (potentialFW_day * ACTIVE_MODEL.fruitGrowth.DM_percent) * dtDays;
        const tracker = updateAbortionTracker(allocatedStep, potentialDM_step, fruit.starvedDays, dtDays);
        fruit.starvedDays = tracker.starvedDays;
        if (tracker.abort) {
          fruit.aborted = true;
          continue;
        }

        // Iter 5b — debug fields (pre-cap)
        const rawSinkDemandG = alloc.trussFruitsGRaw?.[ti]?.[fi] ?? allocatedStep;
        const maxStepDemandG = perFruitMaxMin?.[ti]?.[fi] ?? Number.POSITIVE_INFINITY;
        const demandWasLimited = rawSinkDemandG > maxStepDemandG;

        // Apply allocation
        fruit.W_fruit_dry += allocatedStep;
        const dryMassBeforeCapG = fruit.W_fruit_dry;

        // Cap — trajectory or legacy depending on massFlow
        let cumulativeDryCapG = Number.POSITIVE_INFINITY;
        let cumulativeCapWasApplied = false;
        if (massFlow.enableTrajectoryCap) {
          cumulativeDryCapG = potentialFreshMassG(
            gddSinceFert, fruit.genome.potentialMassG, gp,
          ) * massFlow.fruitDryMatterRatio;
          if (fruit.W_fruit_dry > cumulativeDryCapG) {
            fruit.W_fruit_dry = cumulativeDryCapG;
            cumulativeCapWasApplied = true;
          }
        } else {
          const W_dry_cap = fruit.genome.potentialMassG * ACTIVE_MODEL.fruitGrowth.DM_percent;
          if (fruit.W_fruit_dry > W_dry_cap) fruit.W_fruit_dry = W_dry_cap;
        }
        fruit.W_fruit_fresh = fruit.W_fruit_dry / ACTIVE_MODEL.fruitGrowth.DM_percent;
        fruit.diameter = freshMassToDiameter(fruit.W_fruit_fresh, fruit.genome);

        if (massFlow.debug) {
          fruit.debug = {
            rawSinkDemandG,
            maxStepDemandG,
            demandWasLimited,
            dryMassBeforeCapG,
            cumulativeDryCapG,
            cumulativeCapWasApplied,
            allocatedDryGrowthG: allocatedStep,
            finalDryMassG: fruit.W_fruit_dry,
          };
        }
      }
    }

    state.W += newDM_min;
    const laiCap = ACTIVE_MODEL.lai.defoliation_cap_base -
      cultivar.defoliationAggressiveness * ACTIVE_MODEL.lai.defoliation_aggressiveness_factor;
    state.LAI = Math.min(laiCap, state.LAI + alloc.leafG * cultivar.SLA);
  }

  // 6. Plant-level fruit DM roll-up
  let totalFruitDry = 0;
  let matureFruitDry = 0;
  for (const truss of state.trusses) {
    for (const fruit of truss.fruits) {
      if (fruit.aborted || fruit.harvested) continue;
      totalFruitDry += fruit.W_fruit_dry;
      if (fruit.ripenStage >= 4) matureFruitDry += fruit.W_fruit_dry;
    }
  }
  state.W_f = totalFruitDry;
  state.W_m = matureFruitDry;

  // 7. Node count — phyllochron-driven (Heuvelink 1996). N is the
  // running phytomer count; it advances independently of how many
  // trusses have emerged so non-truss-bearing internodes are counted too.
  state.N = Math.min(50, Math.floor(phytomerCountFromTT(state.TT, cultivar)));

  // 8. Height — DEPRECATED magic formula removed (was: 30 + trusses*27,
  //    botanically meaningless, produced 57cm at day 0 vs reference 15-25cm).
  //    Real height now derived from structural accHeight in GrowthModel.ts
  //    (hypocotyl + Σ internodes). phys.heightCm is no longer read by any
  //    consumer; left for backward-compat init only.
  //    Bug ref: growth-calibration audit 2026-05-25.
  // state.heightCm = 30 + state.trusses.length * 27;   // removed
}

/**
 * Hourly integration step — 60× stepMinutely. Each minute samples its
 * own (sub-hour) PAR + temperature via `diurnalEnv(env, hour + m/60)`.
 * Kept as a public API for `stepDaily` and back-compat with the Phase
 * B unit tests; new callers should prefer stepMinutely directly for
 * the finest-grain control.
 */
export function stepHourly(
  state: PlantPhysiologyState,
  cultivar: Cultivar,
  env: HourlyClimate,
): void {
  // env.hour might already be fractional; use it as the base.
  const baseHour = env.hour;
  // We need a daily-climate reference to re-derive sub-hour diurnal
  // samples. The HourlyClimate is a strict superset, so we can pass it
  // back through diurnalEnv with the desired fractional hour.
  for (let m = 0; m < 60; m++) {
    const fracHour = baseHour + m / 60;
    stepMinutely(state, cultivar, diurnalEnv(env, fracHour));
  }
}

/**
 * Daily integration step — 24× stepHourly = 1440× stepMinutely.
 * Equivalence verified by test-hourly-equivalence.ts to within float
 * rounding (PAR + T integrals are preserved exactly).
 */
export function stepDaily(
  state: PlantPhysiologyState,
  cultivar: Cultivar,
  env: DailyClimate = DEFAULT_CLIMATE,
): void {
  for (let h = 0; h < 24; h++) {
    stepHourly(state, cultivar, diurnalEnv(env, h));
  }
}

// ---------------------------------------------------------------------------
// Legacy monolithic stepDaily kept here for reference + diff bisection
// during the Phase B refactor. Not exported, can be deleted once Phase E
// validation confirms numerical parity within the literature tolerances.
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-unused-vars */
function _legacyStepDaily(
  state: PlantPhysiologyState,
  cultivar: Cultivar,
  env: DailyClimate = DEFAULT_CLIMATE,
): void {
  state.day += 1;

  // 1. Thermal time (T_base capped, T_max ceiling 32°C — beyond this no
  // additional development per CROPGRO).
  const T_eff = Math.max(0, Math.min(ACTIVE_MODEL.thermalTime.T_max_dev_C, env.T_avg) - cultivar.T_base);
  state.TT += T_eff;

  // 2. Truss emergence — every GDD_per_truss after the first
  const expectedTrussCount = Math.floor(
    Math.max(0, (state.TT - cultivar.GDD_to_first_flower) / cultivar.GDD_per_truss) + 1,
  );
  while (state.trusses.length < expectedTrussCount && state.trusses.length < 30) {
    emergeTruss(state, cultivar);
  }

  // 3. Per-truss processing
  for (const truss of state.trusses) {
    for (const fruit of truss.fruits) {
      if (fruit.aborted) continue;

      // Fruit set (Phase I → II) at anthesis + a short lag
      if (fruit.fertilizationTT < 0 && state.TT >= fruit.anthesisTT) {
        // Stochastic set — fail with prob (1 - fruitSetRate)
        const setRng = trussRng(state.seed, truss.index + 10_000 + fruit.index);
        if (setRng() < cultivar.fruitSetRate) {
          fruit.fertilizationTT = state.TT;
        } else {
          fruit.aborted = true;
          continue;
        }
      }

      // Until fertilization, the fruit is just a flower bud — no growth.
      if (fruit.fertilizationTT < 0) continue;

      // Phase boundaries
      if (fruit.cellDivisionEndTT < 0 && state.TT - fruit.fertilizationTT >= cultivar.cellDivisionDurationGDD) {
        fruit.cellDivisionEndTT = state.TT;
      }
      const expansionEndTT =
        fruit.cellDivisionEndTT > 0
          ? fruit.cellDivisionEndTT + cultivar.cellExpansionDurationGDD
          : -1;
      if (fruit.ripenStartTT < 0 && expansionEndTT > 0 && state.TT >= expansionEndTT) {
        fruit.ripenStartTT = state.TT;
      }

      // 3a. Phase-3 placeholder — proper Gompertz from sink allocation
      //     happens below; until allocation runs we just leave the
      //     existing weights. The actual fruit weight update is done
      //     in the sink-allocation pass after this loop.

      // 3b. Ripening (USDA stage progression) — linear in GDD after
      //     ripenStartTT, modulated by per-fruit ripeningSpeedFactor
      //     and the basal-to-distal acropetal offset.
      if (fruit.ripenStartTT > 0) {
        const acropetal = acropetalGDDOffset(fruit, truss, cultivar);
        // basal (index 0) gets head-start (negative offset shifts
        // the ripening clock forward).
        const gddRipening =
          (state.TT - fruit.ripenStartTT - acropetal) * fruit.genome.ripeningSpeedFactor;
        const stagesPerGDD = 5 / cultivar.ripeningDurationGDD;
        const continuous = Math.max(0, Math.min(5, gddRipening * stagesPerGDD));
        fruit.ripenStage = Math.min(5, Math.floor(continuous)) as RipenStage;
        fruit.ripenFraction = continuous - Math.floor(continuous);
      }
    }

    // Pruning baseline — fruit thinning (적과).
    //
    // Commercial practice: once natural set + abortion are complete
    // (signalled here by all flowers having a fertilization decision),
    // distal fruits are removed to leave `trussTargetFruitCount` basal
    // ones. Basal-first survival is consistent with Heuvelink 1996
    // (TOMSIM) and Korean greenhouse extension guidance.
    const allDecided = truss.fruits.every(
      (f) => f.aborted || f.fertilizationTT > 0,
    );
    if (allDecided && cultivar.trussTargetFruitCount > 0) {
      const live = truss.fruits.filter((f) => !f.aborted);
      if (live.length > cultivar.trussTargetFruitCount) {
        // sort by basal-first (lowest index wins)
        live.sort((a, b) => a.index - b.index);
        for (let k = cultivar.trussTargetFruitCount; k < live.length; k++) {
          live[k].aborted = true;
        }
      }
    }

    // Update live fruit count
    truss.fruitCount = truss.fruits.filter((f) => !f.aborted && f.fertilizationTT > 0).length;
  }

  // 4. Photosynthesis → net new DM (Phase 2)
  const newDM = dailyNetDM(env, state.LAI, state.W);

  // 5. Sink-driven allocation across organs + per-truss/per-fruit
  //    (Marcelis 1996 / Heuvelink 1996 with TOMSIM saturation cap).
  //    Iter 5b: Gompertz sink demand limit + trajectory cap.
  if (newDM > 0) {
    const massFlow = cultivar.resolvedBotanical.fruitDevelopment.massFlow;
    const perFruitMaxDaily = massFlow.enableStepDemandLimit
      ? computePerFruitGompertzDemand(state, cultivar, T_eff)
      : undefined;
    const alloc = allocateDM(newDM, state, cultivar, {
      perFruitMaxDemandG: perFruitMaxDaily,
      surplusPolicy: massFlow.surplusPolicy,
    });
    const gp = gompertzParamsOf(cultivar);

    // Increment per-fruit dry weight, then derive fresh & diameter +
    // abortion tracker (Marcelis 1996, Frontiers 2015).
    for (let ti = 0; ti < state.trusses.length; ti++) {
      const truss = state.trusses[ti];
      for (let fi = 0; fi < truss.fruits.length; fi++) {
        const fruit = truss.fruits[fi];
        if (fruit.aborted || fruit.harvested || fruit.fertilizationTT < 0) continue;
        const allocatedToday = alloc.trussFruitsG[ti][fi];

        // Compute potential daily growth (Gompertz) for abortion check
        const gddSinceFert = state.TT - fruit.fertilizationTT;
        const potentialFW = potentialDailyGrowthFW(gddSinceFert, T_eff, fruit.genome, cultivar);
        const potentialDM = potentialFW * ACTIVE_MODEL.fruitGrowth.DM_percent;

        // Update abortion tracker — abort if persistently starved
        const tracker = updateAbortionTracker(allocatedToday, potentialDM, fruit.starvedDays);
        fruit.starvedDays = tracker.starvedDays;
        if (tracker.abort) {
          fruit.aborted = true;
          continue;
        }

        // Iter 5b — debug fields (pre-cap)
        const rawSinkDemandG = alloc.trussFruitsGRaw?.[ti]?.[fi] ?? allocatedToday;
        const maxStepDemandG = perFruitMaxDaily?.[ti]?.[fi] ?? Number.POSITIVE_INFINITY;
        const demandWasLimited = rawSinkDemandG > maxStepDemandG;

        // Apply allocation
        fruit.W_fruit_dry += allocatedToday;
        const dryMassBeforeCapG = fruit.W_fruit_dry;

        // Cap — trajectory (Iter 5b) or legacy
        let cumulativeDryCapG = Number.POSITIVE_INFINITY;
        let cumulativeCapWasApplied = false;
        if (massFlow.enableTrajectoryCap) {
          cumulativeDryCapG = potentialFreshMassG(
            gddSinceFert, fruit.genome.potentialMassG, gp,
          ) * massFlow.fruitDryMatterRatio;
          if (fruit.W_fruit_dry > cumulativeDryCapG) {
            fruit.W_fruit_dry = cumulativeDryCapG;
            cumulativeCapWasApplied = true;
          }
        } else {
          const W_dry_cap = fruit.genome.potentialMassG * ACTIVE_MODEL.fruitGrowth.DM_percent;
          if (fruit.W_fruit_dry > W_dry_cap) fruit.W_fruit_dry = W_dry_cap;
        }
        // Fresh = dry / DM%
        fruit.W_fruit_fresh = fruit.W_fruit_dry / ACTIVE_MODEL.fruitGrowth.DM_percent;
        fruit.diameter = freshMassToDiameter(fruit.W_fruit_fresh, fruit.genome);

        if (massFlow.debug) {
          fruit.debug = {
            rawSinkDemandG,
            maxStepDemandG,
            demandWasLimited,
            dryMassBeforeCapG,
            cumulativeDryCapG,
            cumulativeCapWasApplied,
            allocatedDryGrowthG: allocatedToday,
            finalDryMassG: fruit.W_fruit_dry,
          };
        }
      }
    }

    // Update plant compartments
    state.W += newDM;
    // LAI grows from leaf DM via cultivar.SLA (m²/g DM).
    // Pruning baseline (적엽) caps mature canopy density: more
    // aggressive defoliation → lower steady-state LAI. Commercial
    // greenhouse target is ~3 (Heuvelink 1996); cultivar.defoliation
    // -Aggressiveness 0..1 maps to a 3.6 → 2.4 ceiling.
    const laiCap = ACTIVE_MODEL.lai.defoliation_cap_base -
      cultivar.defoliationAggressiveness * ACTIVE_MODEL.lai.defoliation_aggressiveness_factor;
    state.LAI = Math.min(laiCap, state.LAI + alloc.leafG * cultivar.SLA);
  }

  // 6. Plant-level fruit DM roll-up
  let totalFruitDry = 0;
  let matureFruitDry = 0;
  for (const truss of state.trusses) {
    for (const fruit of truss.fruits) {
      if (fruit.aborted || fruit.harvested) continue;
      totalFruitDry += fruit.W_fruit_dry;
      if (fruit.ripenStage >= 4) matureFruitDry += fruit.W_fruit_dry;
    }
  }
  state.W_f = totalFruitDry;
  state.W_m = matureFruitDry;

  // 7. Node count — phyllochron-driven (Heuvelink 1996).
  state.N = Math.min(50, Math.floor(phytomerCountFromTT(state.TT, cultivar)));

  // 8. Height — internode ~25cm with ~3 internodes per truss + base
  state.heightCm = 30 + state.trusses.length * 27;
}

/** Convert fresh mass (g) to equatorial diameter (mm) under H:W constraint. */
function freshMassToDiameter(massG: number, genome: CultivarSample): number {
  // Approximate fruit as oblate spheroid with semi-axes (a, a, c) where
  // c = a × heightWidthRatio. Volume = (4/3)π a²c. Density sourced from
  // ACTIVE_MODEL.fruitGrowth.density_g_per_cm3 (Gould 1992 default 1.04).
  const density = ACTIVE_MODEL.fruitGrowth.density_g_per_cm3;
  const volumeCm3 = massG / density;
  // V = (4/3)π a² c, c = a · h, so V = (4/3)π a³ h → a = (3V / (4π h))^(1/3)
  const h = genome.heightWidthRatio;
  const aCm = Math.cbrt((3 * volumeCm3) / (4 * Math.PI * h));
  return 2 * aCm * 10; // diameter in mm
}

// ---------------------------------------------------------------------------
// Convenience: replay full lifecycle deterministically
// ---------------------------------------------------------------------------

/**
 * Run the model from day 0 to targetDay under a constant climate.
 * Returns the state at targetDay. Useful for previews and tests.
 */
export function simulateToDay(
  seed: number,
  cultivar: Cultivar,
  targetDay: number,
  env: DailyClimate = DEFAULT_CLIMATE,
): PlantPhysiologyState {
  const state = createPlant(seed);
  for (let d = 0; d < targetDay; d++) {
    stepDaily(state, cultivar, env);
  }
  return state;
}
