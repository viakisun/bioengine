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
import { sampleCultivarGenome } from './Cultivar';
import { SeededRandom } from './SeededRandom';

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

/** Default climate used by Phase 1 stub when caller doesn't supply one. */
export const DEFAULT_CLIMATE: DailyClimate = {
  T_avg: 22,
  PAR_integral_mol: 15,
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
  return {
    seed,
    day: 0,
    TT: 0,
    N: 1,
    LAI: 0.05,
    W: 0.5,            // ~0.5 g DM at transplant (seedling)
    W_f: 0,
    W_m: 0,
    heightCm: 8,       // ~8 cm at transplant
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
  const rng = trussRng(state.seed, trussIdx);

  // Flower count — Gaussian draw, clamped to ≥3
  const flowerCount = Math.max(
    3,
    Math.round(cultivar.flowersPerTruss.mu + cultivar.flowersPerTruss.sigma * gaussian(rng)),
  );

  // Stem height of this truss — internode ≈ 25 cm at peak, so each truss
  // sits ~25cm × (every 3 leaves) above the previous one.
  const stemHeight_m = 0.4 + trussIdx * 0.27;

  // Anthesis happens ~50 GDD after truss emergence (rough approximation).
  const anthesisTT = state.TT + 50;

  // Pre-allocate flower slots as fruits "in waiting"; only the ones that
  // set fruit get a real CultivarSample drawn at fertilization TT.
  const fruits: FruitCohort[] = [];
  for (let i = 0; i < flowerCount; i++) {
    // Apply per-fruit acropetal anthesis spread (basal opens first).
    const positionFrac = flowerCount > 1 ? i / (flowerCount - 1) : 0;
    const flowerAnthesisTT = anthesisTT + positionFrac * (cultivar.trussRipeningSpreadGDD * 0.3);

    fruits.push({
      index: i,
      anthesisTT: flowerAnthesisTT,
      fertilizationTT: -1,    // not yet set
      cellDivisionEndTT: -1,
      ripenStartTT: -1,
      W_fruit_dry: 0,
      W_fruit_fresh: 0,
      diameter: 0,
      ripenStage: 0,
      ripenFraction: 0,
      genome: sampleCultivarGenome(cultivar, rng), // sampled per-fruit, deterministic by truss RNG
      aborted: false,
    });
  }

  state.trusses.push({
    index: trussIdx,
    emergenceTT: state.TT,
    anthesisTT,
    stemHeight_m,
    flowerCount,
    fruitCount: 0,    // becomes nonzero after fertilization step
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
export function stepDaily(
  state: PlantPhysiologyState,
  cultivar: Cultivar,
  env: DailyClimate = DEFAULT_CLIMATE,
): void {
  state.day += 1;

  // 1. Thermal time (T_base capped, T_max ceiling 32°C — beyond this no
  // additional development per CROPGRO).
  const T_eff = Math.max(0, Math.min(32, env.T_avg) - cultivar.T_base);
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

      // 3a. Fruit fresh-weight growth — Phase-1 placeholder Gompertz on
      //     fresh weight directly. (Phase 3 will replace with proper
      //     dry-weight driven Gompertz from sink allocation.)
      const a = fruit.genome.potentialMassG; // asymptote
      const b = cultivar.gompertzRateB * fruit.genome.ripeningSpeedFactor;
      const c = cultivar.gompertzInflectionC;
      const gddSinceFert = Math.max(0, state.TT - fruit.fertilizationTT);
      const totalGrowthGDD = cultivar.cellDivisionDurationGDD + cultivar.cellExpansionDurationGDD;
      const tau = totalGrowthGDD * c; // inflection point in GDD
      // Gompertz: W(t) = a · exp(-exp(-b·(t - τ)))
      const W_fresh = a * Math.exp(-Math.exp(-b * (gddSinceFert - tau) * 0.01));
      fruit.W_fruit_fresh = W_fresh;
      fruit.W_fruit_dry = W_fresh * 0.06; // ~6% DM typical
      fruit.diameter = freshMassToDiameter(W_fresh, fruit.genome);

      // 3b. Ripening (USDA stage progression) — linear in GDD after
      //     ripenStartTT, modulated by per-fruit ripeningSpeedFactor.
      if (fruit.ripenStartTT > 0) {
        const gddRipening = (state.TT - fruit.ripenStartTT) * fruit.genome.ripeningSpeedFactor;
        const stagesPerGDD = 5 / cultivar.ripeningDurationGDD;
        const continuous = Math.min(5, gddRipening * stagesPerGDD);
        fruit.ripenStage = Math.min(5, Math.floor(continuous)) as RipenStage;
        fruit.ripenFraction = continuous - Math.floor(continuous);
      }
    }

    // Update live fruit count
    truss.fruitCount = truss.fruits.filter((f) => !f.aborted && f.fertilizationTT > 0).length;
  }

  // 4. Plant-level totals — Phase 1 placeholder (will be replaced by
  //    sink-allocation in Phase 2).
  let totalFruitDry = 0;
  let matureFruitDry = 0;
  for (const truss of state.trusses) {
    for (const fruit of truss.fruits) {
      if (fruit.aborted) continue;
      totalFruitDry += fruit.W_fruit_dry;
      if (fruit.ripenStage >= 4) matureFruitDry += fruit.W_fruit_dry;
    }
  }
  state.W_f = totalFruitDry;
  state.W_m = matureFruitDry;
  // W (total plant DM) grows with truss count as a stand-in until Phase 2
  state.W = 50 + state.trusses.length * 60 + totalFruitDry;

  // 5. Node count + LAI placeholder (Phase 2 will compute LAI from
  //    leaf-DM and SLA). Rough: 3 nodes per truss + initial 6.
  state.N = 6 + state.trusses.length * 3;
  state.LAI = Math.min(3.5, 0.05 + state.N * 0.04);

  // 6. Height — placeholder
  state.heightCm = 30 + state.trusses.length * 27;
}

/** Convert fresh mass (g) to equatorial diameter (mm) under H:W constraint. */
function freshMassToDiameter(massG: number, genome: CultivarSample): number {
  // Approximate fruit as oblate spheroid with semi-axes (a, a, c) where
  // c = a × heightWidthRatio. Volume = (4/3)π a²c. Density ~ 1.04 g/cm³.
  const density = 1.04; // g/cm³ — water-rich fruit
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
