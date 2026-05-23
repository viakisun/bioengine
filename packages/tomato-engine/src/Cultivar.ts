// Cultivar genome registry — calibration constants per tomato cultivar.
//
// Each Cultivar bundles TOMSIM / Reduced-TOMGRO calibration parameters
// (T_base, GDD thresholds, sink-strength ratios), 3-phase fruit growth
// constants (Gompertz a/b/c), morphology distributions (locule count,
// height-to-width ratio, ribbing, asymmetry), and the per-fruit color
// distributions used by the visual layer.
//
// All references are cited in plan a-drifting-wigderson.md. Key sources:
//   - Heuvelink 1996, 1995 (TOMSIM, sink strength)
//   - Jones, Kenig, Vallejos 1999 (Reduced TOMGRO 5-state)
//   - Gillaspy, Ben-David, Gruissem 1993 (3-phase fruit growth)
//   - Marcelis 1996 (sink strength)
//   - PMC10482247 (locule QTL fas/lc)
//
// Cultivar values without a peer-reviewed source are marked
// `source: 'vendor'` and may be recalibrated when real measurements are
// available. The point of the registry is calibration, not invention —
// each parameter should be replaceable from a measurement.

export type CultivarType = 'cherry' | 'round' | 'beefsteak' | 'roma';

/** Mean ± SD distribution sampler input. */
export interface GaussianDist {
  mu: number;
  sigma: number;
}

export interface Cultivar {
  name: string;
  type: CultivarType;
  /** Free-form note on data provenance — 'literature' | 'vendor' | 'estimated'. */
  source: 'literature' | 'vendor' | 'estimated';

  // --- Phenology (GDD-driven, CROPGRO-Tomato basis) ---
  /** Lower temperature threshold for GDD. Default 10°C. */
  T_base: number;
  /** GDD from transplant to first open flower. ~250 default. */
  GDD_to_first_flower: number;
  /** GDD from flower opening to red-ripe fruit. ~700-900. */
  GDD_flower_to_red: number;
  /** GDD between successive truss appearances. ~120 (about 1 truss/week at 20°C). */
  GDD_per_truss: number;

  // --- Reproductive output ---
  flowersPerTruss: GaussianDist;
  /** Fraction of flowers that set fruit. 0.5-0.7 typical. */
  fruitSetRate: number;
  /** Adult fruit mass distribution (g, fresh weight). Drives sink strength. */
  potentialFruitMassG: GaussianDist;

  // --- 3-phase fruit growth (Gillaspy 1993, Gompertz fit) ---
  /** GDD for the cell-division phase post-fertilization. ~150. */
  cellDivisionDurationGDD: number;
  /** GDD for the cell-expansion phase. ~500. */
  cellExpansionDurationGDD: number;
  /** GDD from color break to red. ~200. */
  ripeningDurationGDD: number;
  /** Gompertz growth rate parameter (per GDD). ~0.06. */
  gompertzRateB: number;
  /** Gompertz inflection ratio (0..1, fraction of expansion at max-rate). ~0.5. */
  gompertzInflectionC: number;

  // --- Morphology (cultivar mean; per-fruit sampled from this) ---
  /** Locule count distribution (discrete). cherry≈2, round≈4, beefsteak≈7. */
  loculeCount: GaussianDist;
  /** Height-to-width ratio. cherry≈1.0, round≈0.9, beefsteak≈0.7. */
  heightWidthRatio: GaussianDist;
  /** Ribbing intensity (0=smooth, 1=strongly grooved). */
  ribbingStrength: GaussianDist;
  /** Vertex-level asymmetry noise amplitude (0..0.15·radius). */
  asymmetryStrength: number;

  // --- Color (USDA-stage RGB + per-fruit variance) ---
  fullRipeRGB: [number, number, number];
  greenStageRGB: [number, number, number];
  /** Per-fruit chromaticity scatter at full ripe (0..0.1). */
  hueVariance: number;
  /** Blossom-end advance fraction (acropetal within-fruit ripening). */
  blossomEndAdvanceFrac: GaussianDist;

  // --- Sink-strength ratios (relative; fruit truss = 1.0) ---
  sinkStrengthLeaf: number;   // ~0.35 (Heuvelink 1995)
  sinkStrengthStem: number;   // ~0.15
  sinkStrengthRoot: number;   // ~0.07

  // --- Pruning baseline (한국 농가 권장 관행) ---
  /** 0..1 — how aggressively leaves below ripening trusses senesce. */
  defoliationAggressiveness: number;
  /** After natural set + abortion, retain this many fruits per truss. */
  trussTargetFruitCount: number;

  // --- Misc physiology ---
  /** Specific Leaf Area (m²/g DM). ~0.025-0.030 for tomato. */
  SLA: number;
  /** Time within a truss (in GDD) between basal and distal fruit ripening. */
  trussRipeningSpreadGDD: number;
}

// ---------------------------------------------------------------------------
// Baseline cultivars — loaded from JSONC files in models/cultivars/.
//
// Phase 0 of plan a-drifting-wigderson.md: replace hardcoded 5-entry
// registry with a JSON-driven loader. Coefficients are now editable in
// the model spec sheet (models/<cultivar>.jsonc); this module just
// adapts the nested JSON shape to the flat Cultivar interface that the
// engine + visual layer already consume.
// ---------------------------------------------------------------------------

import { CULTIVAR_JSONS, ACTIVE_MODEL, type CultivarJson } from './ModelRegistry';

function adaptCultivar(j: CultivarJson): Cultivar {
  return {
    name: j.metadata.name,
    type: j.metadata.type as CultivarType,
    source: j.metadata.source as Cultivar['source'],

    // Phenology
    T_base: ACTIVE_MODEL.thermalTime.T_base_C,
    GDD_to_first_flower: j.phenology.GDD_to_first_flower,
    GDD_flower_to_red: j.phenology.GDD_flower_to_red,
    GDD_per_truss: j.phenology.GDD_per_truss,
    cellDivisionDurationGDD: j.phenology.cellDivisionDurationGDD,
    cellExpansionDurationGDD: j.phenology.cellExpansionDurationGDD,
    ripeningDurationGDD: j.phenology.ripeningDurationGDD,
    trussRipeningSpreadGDD: j.phenology.trussRipeningSpreadGDD,

    // Reproductive
    flowersPerTruss: j.flowersPerTruss,
    fruitSetRate: j.fruitSetRate,
    potentialFruitMassG: j.potentialFruitMassG,

    // Gompertz (still on cultivar.physiology in JSON)
    gompertzRateB: j.physiology.gompertzRateB,
    gompertzInflectionC: j.physiology.gompertzInflectionC,

    // Morphology
    loculeCount: j.morphology.loculeCount,
    heightWidthRatio: j.morphology.heightWidthRatio,
    ribbingStrength: j.morphology.ribbingStrength,
    asymmetryStrength: j.morphology.asymmetryStrength,
    blossomEndAdvanceFrac: j.morphology.blossomEndAdvanceFrac,

    // Color
    fullRipeRGB: j.color.fullRipeRGB,
    greenStageRGB: j.color.greenStageRGB,
    hueVariance: j.color.hueVariance,

    // Sink strength (Marcelis 1996; fruit=1.0 baseline)
    sinkStrengthLeaf: j.physiology.sinkStrength.leaf,
    sinkStrengthStem: j.physiology.sinkStrength.stem,
    sinkStrengthRoot: j.physiology.sinkStrength.root,

    // Pruning baseline
    defoliationAggressiveness: j.pruning.defoliationAggressiveness,
    trussTargetFruitCount: j.pruning.trussTargetFruitCount,

    // Misc
    SLA: j.physiology.SLA_m2_per_g,
  };
}

// CULTIVARS map — derived from JSONC at module load.
// Adapter converts the JSON shape to the flat Cultivar interface that
// downstream code (CoreModel, FruitGenerator, GrowthEngine) consumes.
export const CULTIVARS: Record<string, Cultivar> = Object.fromEntries(
  Object.entries(CULTIVAR_JSONS).map(([name, json]) => [name, adaptCultivar(json)]),
);

export const DEFAULT_CULTIVAR_NAME = 'round-generic';

export function getCultivar(name: string): Cultivar {
  const c = CULTIVARS[name];
  if (c) return c;
  return CULTIVARS[DEFAULT_CULTIVAR_NAME];
}

// ---------------------------------------------------------------------------
// Per-fruit genome sample (drawn from Cultivar at fruit-set time)
// ---------------------------------------------------------------------------

export interface CultivarSample {
  /** Per-fruit potential mass (g, fresh weight) — drives sink strength. */
  potentialMassG: number;
  /** Discrete locule count. 2..10. */
  loculeCount: number;
  /** H:W ratio. */
  heightWidthRatio: number;
  /** Ribbing strength (0..1). */
  ribbingStrength: number;
  /** Per-fruit vertex-noise RNG seed (deterministic asymmetry). */
  asymmetrySeed: number;
  /** Per-fruit surface-color RNG seed (mottling/streaks). */
  mottleSeed: number;
  /** Per-fruit timescale multiplier on Gompertz expansion. */
  ripeningSpeedFactor: number;
  /** Blossom-end advance strength for this individual. */
  blossomEndAdvanceFrac: number;
  /** Per-fruit asymmetry amplitude — Gaussian σ on vertex displacement (0..0.2). */
  asymmetryAmp: number;
}

/** Deterministic Gaussian draw using the linear-congruential SeededRandom. */
function gaussian(rng: () => number, mu: number, sigma: number): number {
  // Box-Muller. Two uniform draws → standard normal → shift+scale.
  const u1 = Math.max(1e-9, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

/**
 * Sample a per-fruit genome from the cultivar distribution.
 * `rngNext` should be a function returning a uniform 0..1 (e.g. SeededRandom.next).
 */
export function sampleCultivarGenome(
  cultivar: Cultivar,
  rngNext: () => number,
): CultivarSample {
  const mass = Math.max(5, gaussian(rngNext, cultivar.potentialFruitMassG.mu, cultivar.potentialFruitMassG.sigma));
  const locule = Math.max(2, Math.min(12, Math.round(gaussian(rngNext, cultivar.loculeCount.mu, cultivar.loculeCount.sigma))));
  const hw = Math.max(0.4, Math.min(2.0, gaussian(rngNext, cultivar.heightWidthRatio.mu, cultivar.heightWidthRatio.sigma)));
  const rib = Math.max(0, Math.min(1, gaussian(rngNext, cultivar.ribbingStrength.mu, cultivar.ribbingStrength.sigma)));
  const blossom = Math.max(0, Math.min(0.7, gaussian(rngNext, cultivar.blossomEndAdvanceFrac.mu, cultivar.blossomEndAdvanceFrac.sigma)));
  const ripeFactor = Math.max(0.7, Math.min(1.3, 1 + (rngNext() - 0.5) * 0.3));

  // Per-fruit asymmetry amplitude — half the cultivar's baseline plus
  // a Gaussian jitter (so fruits inside the same cultivar still vary).
  const asymAmp = Math.max(
    0.01,
    Math.min(0.2, cultivar.asymmetryStrength * (0.6 + 0.8 * rngNext())),
  );

  return {
    potentialMassG: mass,
    loculeCount: locule,
    heightWidthRatio: hw,
    ribbingStrength: rib,
    asymmetrySeed: Math.floor(rngNext() * 2 ** 30),
    mottleSeed: Math.floor(rngNext() * 2 ** 30),
    ripeningSpeedFactor: ripeFactor,
    blossomEndAdvanceFrac: blossom,
    asymmetryAmp: asymAmp,
  };
}
