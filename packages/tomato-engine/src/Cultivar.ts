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

// ---------------------------------------------------------------------------
// Iter 29 Phase 1-Pre — CultivarGrowthProfile re-export.
//
// Schema, default, and resolver live in CultivarGrowthProfile.ts (an
// independent module with no JSONC-loader dependency, so architecture
// invariant tests can import directly via the Playwright Node loader).
// ---------------------------------------------------------------------------

export {
  type CultivarGrowthProfile,
  type CultivarGrowthProfileJson,
  DEFAULT_CULTIVAR_GROWTH_PROFILE,
  resolveCultivarGrowthProfile,
  defaultGrowthProfileForType,
} from './CultivarGrowthProfile';

import {
  type CultivarGrowthProfile,
  type CultivarGrowthProfileJson,
  resolveCultivarGrowthProfile,
  defaultGrowthProfileForType,
} from './CultivarGrowthProfile';

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
  /** GDD between successive phytomers (= one leaf + internode + bud).
   *  Heuvelink 1996: 38 GDD/leaf for tomato; range 32-45. Loaded from
   *  cultivar override or ACTIVE_MODEL.organogenesis.phyllochronGDD. */
  phyllochronGDD: number;

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

  // --- Architecture (cultivar mean; per-plant sampled) ---
  /** Phytomer index of the first inflorescence (truss). 0-based on
   *  the main axis. Indeterminate tomato typically ~9 ± 1. */
  firstTrussNodeIdx: GaussianDist;
  /** Leaves between successive trusses on the main stem (3 for
   *  3-leaf phyllotaxis, which most commercial tomato cultivars use). */
  trussIntervalNodes: number;
  /** Transitional (Phase 2 → Phase 3): cap diameter for the legacy
   *  visual sigmoid path. Phase 3 deletes its use as authoritative. */
  fruitMaxDiameterMm: GaussianDist;

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

  // --- Iter 6f (SSOT #61): Abortion / starvation thresholds (cultivar-level) ---
  /** Marcelis 1996 trigger: starvedDays++ if actualDM/potentialDM < this.
   *  Tomato default ~0.25. Lower = more lenient (cohort↑, sink 분산 위험). */
  abortionThresholdRatio: number;
  /** Abort fires when starvedDays ≥ this. Tomato default ~4 days.
   *  Higher = abortion 더 늦게 결정됨 (회복 기회↑). */
  abortionLagDays: number;

  // --- Iter 29 Phase 1-Pre: cultivar growth profile (TT-based) ---
  //
  // Cultivar-level biological growth parameters. v1 canonical Thermal Time
  // driven. See CultivarGrowthProfile (above) for field descriptions.
  // Phase 5 will deprecate flat aliases (phyllochronGDD, firstTrussNodeIdx,
  // trussIntervalNodes) in favor of growthProfile.* canonical path.
  growthProfile: CultivarGrowthProfile;

  // --- v3.0 Phase 4: reproductive truss-order profile + scenarios ---
  reproductive: ReproductiveBundle;
  scenarios: Record<string, CultivarScenario>;

  // --- v0.8 botanical layer (botanical.v1) -----------------------------
  // Resolved at adapt time = base ACTIVE_BOTANICAL[crop] deep-merged with
  // any cultivar.botanicalOverride from the JSONC. Phase 1: declared but
  // not yet consumed by GrowthModel / FruitGrowth (those still read from
  // hardcoded-equivalent paths). Phase 2+ engine_logic plans switch the
  // consumers over (e.g. FruitGrowth → resolvedBotanical.fruitDevelopment.
  // gompertz instead of cultivar.gompertzRateB/InflectionC).
  resolvedBotanical: BotanicalSpec;
}

export type { TrussOrderRule } from './ModelRegistry';

export interface ReproductiveBundle {
  trussOrderProfile: TrussOrderRule[];
}

export interface ManagementPolicy {
  fruitPruning: { enabled: boolean };
  defoliation: {
    enabled: boolean;
    /** v4.2 — 'bottomUpHeight' (default, Korean lower-leaf pruning) or 'ripeningAnchored' (legacy). */
    policy: 'bottomUpHeight' | 'ripeningAnchored';
    // bottomUpHeight policy fields
    startDay: number;
    removeBelowHeightM: number;
    minLeafAgeDaysAtRemoval: number;
    // ripeningAnchored legacy fields
    keepTrussesAboveRedTopmost: number;
    keepLeavesPerTruss: number;
  };
  harvest: { enabled: boolean; atRipenStage: 0 | 1 | 2 | 3 | 4 | 5 };
}

export interface CultivarScenario {
  label: string;
  intendedUse: 'production_like' | 'visual_validation_only' | 'comparison_baseline';
  notForYieldPrediction: boolean;
  reproductive: ReproductiveBundle;
  management: ManagementPolicy;
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

import {
  CULTIVAR_JSONS,
  ACTIVE_MODEL,
  ACTIVE_SCENARIO,
  ACTIVE_BOTANICAL,
  type CultivarJson,
  type TrussOrderRule,
} from './ModelRegistry';
import { resolveBotanical, type BotanicalSpec } from './BotanicalSpec';
import { SeededRandom } from './SeededRandom';

function adaptCultivar(j: CultivarJson): Cultivar {
  // Iter 5b/1B — resolve botanical FIRST so gompertz can be wired through.
  // tomimaru의 botanicalOverride.fruitDevelopment.gompertz가 이미
  // base와 정합된 값(0.05/0.55)이라 functional no-op이지만, 본 plan
  // 이후 physiology.gompertz* JSONC field는 deprecated.
  const resolvedBotanical = resolveBotanical(ACTIVE_BOTANICAL.tomato, j.botanicalOverride);
  const resolvedGompertz = resolvedBotanical.fruitDevelopment.gompertz;

  // Iter 29 Phase 1-Pre — growthProfile: type-specific default + JSONC override.
  // Each field independently overridable; missing fields fall back to the
  // type-default, which itself falls back to DEFAULT_CULTIVAR_GROWTH_PROFILE.
  const typeDefault = defaultGrowthProfileForType(j.metadata.type as CultivarType);
  const growthProfile: CultivarGrowthProfile = resolveCultivarGrowthProfile({
    ...typeDefault,
    ...(j.growthProfile ?? {}),
  });

  return {
    name: j.metadata.name,
    type: j.metadata.type as CultivarType,
    source: j.metadata.source as Cultivar['source'],

    // Phenology
    T_base: ACTIVE_MODEL.thermalTime.T_base_C,
    GDD_to_first_flower: j.phenology.GDD_to_first_flower,
    GDD_flower_to_red: j.phenology.GDD_flower_to_red,
    GDD_per_truss: j.phenology.GDD_per_truss,
    phyllochronGDD: j.organogenesis?.phyllochronGDD ?? ACTIVE_MODEL.organogenesis.phyllochronGDD,
    cellDivisionDurationGDD: j.phenology.cellDivisionDurationGDD,
    cellExpansionDurationGDD: j.phenology.cellExpansionDurationGDD,
    ripeningDurationGDD: j.phenology.ripeningDurationGDD,
    trussRipeningSpreadGDD: j.phenology.trussRipeningSpreadGDD,

    // Reproductive
    flowersPerTruss: j.flowersPerTruss,
    fruitSetRate: j.fruitSetRate,
    potentialFruitMassG: j.potentialFruitMassG,

    // Iter 1B — Gompertz from cultivar.resolvedBotanical (was: j.physiology.gompertz*).
    // tomimaru: 0.05/0.55 (botanicalOverride). Generic: 0.06/0.45 (base).
    // physiology.gompertz* fallback 제거됨 (cultivar JSONC도 정리 예정).
    gompertzRateB: resolvedGompertz.rateB.mu,
    gompertzInflectionC: resolvedGompertz.inflectionC.mu,

    // Architecture (v3.0 Phase 2)
    firstTrussNodeIdx: j.morphology.firstTrussNodeIdx,
    trussIntervalNodes: j.morphology.trussIntervalNodes,
    fruitMaxDiameterMm: j.morphology.fruitMaxDiameterMm,

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

    // Iter 6f (SSOT #61): abortion cultivar-level override with global fallback
    abortionThresholdRatio: j.abortion?.thresholdRatio ?? ACTIVE_MODEL.abortion.threshold_ratio,
    abortionLagDays: j.abortion?.lagDays ?? ACTIVE_MODEL.abortion.lag_days,

    // Iter 29 Phase 1-Pre — cultivar growth profile (TT-based).
    growthProfile,

    // v3.0 Phase 4: reproductive profile + scenarios
    reproductive: j.reproductive
      ? { trussOrderProfile: j.reproductive.trussOrderProfile }
      : {
          // Fallback for cultivars without an explicit profile —
          // synthesize a single uniform rule from existing fields.
          trussOrderProfile: [
            {
              minOrder: 1,
              maxOrder: null,
              flowersPerTruss: j.flowersPerTruss,
              targetFruitCount: j.pruning.trussTargetFruitCount,
              potentialMassMultiplier: 1.0,
            },
          ],
        },
    scenarios: adaptScenarios(j),

    // Iter 1B (commit eee6b67 + 본 plan): resolvedBotanical은 함수
    // 상단에서 한 번만 계산 (gompertz 등 다른 field가 read 가능하도록).
    resolvedBotanical,
  };
}

function adaptScenarios(j: CultivarJson): Record<string, CultivarScenario> {
  const baseReproductive: ReproductiveBundle = j.reproductive
    ? { trussOrderProfile: j.reproductive.trussOrderProfile }
    : {
        trussOrderProfile: [
          {
            minOrder: 1,
            maxOrder: null,
            flowersPerTruss: j.flowersPerTruss,
            targetFruitCount: j.pruning.trussTargetFruitCount,
            potentialMassMultiplier: 1.0,
          },
        ],
      };

  const out: Record<string, CultivarScenario> = {};
  const rawScenarios = j.scenarios ?? {};
  for (const [key, raw] of Object.entries(rawScenarios)) {
    out[key] = {
      label: raw.metadata?.label ?? key,
      intendedUse: raw.metadata?.intendedUse ?? 'production_like',
      notForYieldPrediction: raw.metadata?.notForYieldPrediction ?? false,
      reproductive: raw.reproductive
        ? { trussOrderProfile: raw.reproductive.trussOrderProfile }
        : baseReproductive,
      management: {
        fruitPruning: { enabled: raw.management?.fruitPruning?.enabled ?? true },
        defoliation: {
          enabled: raw.management?.defoliation?.enabled ?? true,
          policy: raw.management?.defoliation?.policy ?? 'bottomUpHeight',
          startDay: raw.management?.defoliation?.startDay ?? 80,
          removeBelowHeightM: raw.management?.defoliation?.removeBelowHeightM ?? 0.50,
          minLeafAgeDaysAtRemoval: raw.management?.defoliation?.minLeafAgeDaysAtRemoval ?? 30,
          keepTrussesAboveRedTopmost: raw.management?.defoliation?.keepTrussesAboveRedTopmost ?? 3,
          keepLeavesPerTruss: raw.management?.defoliation?.keepLeavesPerTruss ?? 0,
        },
        harvest: {
          enabled: raw.management?.harvest?.enabled ?? true,
          atRipenStage: raw.management?.harvest?.atRipenStage ?? 5,
        },
      },
    };
  }

  // Always ensure a 'commercial-standard' scenario exists as a safe fallback.
  if (!out['commercial-standard']) {
    out['commercial-standard'] = {
      label: 'Commercial standard (default)',
      intendedUse: 'production_like',
      notForYieldPrediction: false,
      reproductive: baseReproductive,
      management: {
        fruitPruning: { enabled: true },
        defoliation: {
          enabled: true,
          policy: 'bottomUpHeight',
          startDay: 80,
          removeBelowHeightM: 0.50,
          minLeafAgeDaysAtRemoval: 30,
          keepTrussesAboveRedTopmost: 3,
          keepLeavesPerTruss: 0,
        },
        harvest: { enabled: true, atRipenStage: 5 },
      },
    };
  }
  return out;
}

/** Resolve the active scenario for a cultivar. Falls back to
 *  'commercial-standard' if the requested key is missing. */
export function getScenario(cultivar: Cultivar, key: string = ACTIVE_SCENARIO): CultivarScenario {
  return cultivar.scenarios[key] ?? cultivar.scenarios['commercial-standard'];
}

/** Pick the trussOrderProfile rule applicable to the given 1-based
 *  truss order (1 = basal). First matching rule wins; null if none. */
export function trussOrderRule(
  scenario: CultivarScenario,
  order1Based: number,
): TrussOrderRule | null {
  for (const rule of scenario.reproductive.trussOrderProfile) {
    const okMin = rule.minOrder <= order1Based;
    const okMax = rule.maxOrder == null || order1Based <= rule.maxOrder;
    if (okMin && okMax) return rule;
  }
  return null;
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

/** Iter 6 — re-adapt all cultivars after ACTIVE_BOTANICAL mutation.
 *  Sweep harness (child-process per run)에서 dump-growth-checkpoints가
 *  --overrideGompertz로 ACTIVE_BOTANICAL.tomato.fruitDevelopment.gompertz를
 *  mutate한 후 호출 → cultivar.resolvedBotanical + gompertzRateB/InflectionC
 *  값이 새 base로 재계산됨. CULTIVARS object는 그대로 (consumer 참조 보존). */
export function reAdaptAllCultivars(): void {
  for (const [name, json] of Object.entries(CULTIVAR_JSONS)) {
    const updated = adaptCultivar(json);
    // In-place replacement (참조 유지)
    Object.assign(CULTIVARS[name], updated);
  }
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

// ---------------------------------------------------------------------------
// Per-plant architecture sample (v3.0 Phase 2)
// ---------------------------------------------------------------------------

/** Per-plant architectural draw from the cultivar distribution. Same
 *  seed produces the same sample — used to anchor the visible truss
 *  layout to a specific plant instance. */
export interface PlantArchitectureSample {
  /** Phytomer index (0-based) of the first inflorescence on the main axis. */
  firstTrussNodeIdx: number;
  /** Leaves between successive trusses on the main stem. */
  trussIntervalNodes: number;
  /** Transitional (Phase 2 → Phase 3): cap diameter for the legacy
   *  visual sigmoid path. Phase 3 deletes the consumer. */
  fruitMaxDiameterMm: number;
}

export function samplePlantArchitecture(
  cultivar: Cultivar,
  seed: number,
): PlantArchitectureSample {
  const rng = new SeededRandom((seed * 2879 + 0xa55a5a) >>> 0);
  rng.next(); rng.next(); rng.next(); // warmup (Lehmer LCG quirk)
  const draw = (mu: number, sigma: number) => mu + sigma * boxMuller(rng);
  const firstTrussF = draw(cultivar.firstTrussNodeIdx.mu, cultivar.firstTrussNodeIdx.sigma);
  const firstTruss = Math.max(
    Math.max(2, Math.round(cultivar.firstTrussNodeIdx.mu - 2 * cultivar.firstTrussNodeIdx.sigma)),
    Math.min(
      Math.round(cultivar.firstTrussNodeIdx.mu + 2 * cultivar.firstTrussNodeIdx.sigma),
      Math.round(firstTrussF),
    ),
  );
  const fruitDiamMm = Math.max(
    cultivar.fruitMaxDiameterMm.mu * 0.65,
    Math.min(
      cultivar.fruitMaxDiameterMm.mu * 1.35,
      draw(cultivar.fruitMaxDiameterMm.mu, cultivar.fruitMaxDiameterMm.sigma),
    ),
  );
  return {
    firstTrussNodeIdx: firstTruss,
    trussIntervalNodes: cultivar.trussIntervalNodes,
    fruitMaxDiameterMm: fruitDiamMm,
  };
}

function boxMuller(rng: SeededRandom): number {
  const u1 = Math.max(1e-9, rng.next());
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
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
