// ModelRegistry — load the academic model spec (tomgro-v1.jsonc) and
// cultivar profiles from JSONC files. The rest of the engine reads
// `ACTIVE_MODEL` for parameters like LUE, k, Q10, T_base, abortion
// thresholds, etc. instead of hardcoding them.
//
// Tuning workflow:
//   1. Open packages/tomato-engine/models/tomgro-v1.jsonc in VS Code
//   2. Edit a value (e.g. LUE 3.5 → 4.0)
//   3. Save — Vite HMR reloads the raw text, ACTIVE_MODEL re-parses
//   4. Next simulatePlantToMinute() call uses the new value
//
// The shape of the spec is intentionally JSON-shaped (string keys,
// nested objects, numeric leaves). For the cultivar profile we mirror
// the existing Cultivar interface so downstream code (Cultivar.ts,
// CoreModel, FruitGenerator) doesn't need to change.

import { parse, type ParseError } from 'jsonc-parser';
import modelText from '../models/tomgro-v1.jsonc?raw';
import cherryText from '../models/cultivars/cherry-generic.jsonc?raw';
import roundText from '../models/cultivars/round-generic.jsonc?raw';
import beefsteakText from '../models/cultivars/beefsteak-generic.jsonc?raw';
import romaText from '../models/cultivars/roma-generic.jsonc?raw';
import tomimaruText from '../models/cultivars/tomimaru-muchoo.jsonc?raw';
import singleStemText from '../models/training/single-stem-high-wire.jsonc?raw';
import freeBushText from '../models/training/free-bush.jsonc?raw';
// Phase B: botanical layer (botanical.v1 family)
import tomatoBotanicalText from '../models/botanical/tomato.jsonc?raw';
import {
  loadBotanical,
  type BotanicalSpec,
  type BotanicalPartial,
  type BotanicalCrop,
} from './BotanicalSpec';

// ---------------------------------------------------------------------
// Types — strict shape so accidental missing fields fail at boot
// ---------------------------------------------------------------------

export interface ModelSpec {
  metadata: {
    id: string;
    version: string;
    description: string;
    references: string[];
  };
  photosynthesis: {
    LUE_gDM_per_mol_PAR: number;
    beerLambert_k: number;
    Q10: number;
    maintenance_m_ref_per_day: number;
    Cf_conversion_efficiency: number;
    plantFootprintM2: number;
  };
  thermalTime: {
    T_base_C: number;
    T_max_dev_C: number;
  };
  organogenesis: {
    phyllochronGDD: number;
    initialNodeCountAtTransplant: number;
    TT_at_transplant: number;
  };
  abortion: {
    threshold_ratio: number;
    lag_days: number;
  };
  fruitGrowth: {
    density_g_per_cm3: number;
    DM_percent: number;
  };
  trussAnatomy: {
    peduncle: {
      lengthM: number;
      radiusM: number;
      downAngleRad: number;
      stiffnessRelativeToStem: number;
    };
    rachis: {
      knuckleSpacingM: number;
      zigzagAmplitudeM: number;
      downTiltPerKnuckleM: number;
      phyllotacticAngleDeg: number;
      radiusBaseM: number;
      radiusTipM: number;
    };
    pedicel: {
      lengthM: number;
      downAngleRad: number;
      abscissionZoneFrac: number;
      radiusBaseM: number;
      radiusTipM: number;
    };
    fruit: {
      calyxOffsetFrac: number;
      calyxReflexDeg: number;
    };
    flower: {
      petalSpanM: number;
      petalCount: number;
      antherConeHeightM: number;
      petalColorRGB: [number, number, number];
    };
  };
  diurnal: {
    temp_amplitude_C: number;
    phase_offset_hours: number;
  };
  lai: {
    defoliation_cap_base: number;
    defoliation_aggressiveness_factor: number;
  };
  rngWarmup: {
    discard_first_n: number;
  };
}

// ---------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------

function parseJsonc<T>(text: string, label: string): T {
  const errors: ParseError[] = [];
  const parsed = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const summary = errors
      .slice(0, 3)
      .map((e) => `offset=${e.offset} error=${e.error}`)
      .join(' · ');
    throw new Error(`JSONC parse failed for "${label}": ${summary}`);
  }
  return parsed as T;
}

/** Parse the global model spec and validate that all required leaves
 *  exist. Throws if any are missing — fail loud at boot. */
export function loadModelSpec(text: string): ModelSpec {
  const spec = parseJsonc<ModelSpec>(text, 'tomgro model');
  // Spot-check a handful of required leaves so a malformed JSON breaks
  // visibly at boot (rather than NaN-propagating into the simulation).
  const checks: Array<[string, unknown]> = [
    ['photosynthesis.LUE_gDM_per_mol_PAR', spec.photosynthesis?.LUE_gDM_per_mol_PAR],
    ['photosynthesis.beerLambert_k', spec.photosynthesis?.beerLambert_k],
    ['thermalTime.T_base_C', spec.thermalTime?.T_base_C],
    ['organogenesis.phyllochronGDD', spec.organogenesis?.phyllochronGDD],
    ['organogenesis.initialNodeCountAtTransplant', spec.organogenesis?.initialNodeCountAtTransplant],
    ['organogenesis.TT_at_transplant', spec.organogenesis?.TT_at_transplant],
    ['abortion.threshold_ratio', spec.abortion?.threshold_ratio],
    ['fruitGrowth.density_g_per_cm3', spec.fruitGrowth?.density_g_per_cm3],
    ['trussAnatomy.peduncle.radiusM', spec.trussAnatomy?.peduncle?.radiusM],
    ['trussAnatomy.peduncle.lengthM', spec.trussAnatomy?.peduncle?.lengthM],
    ['trussAnatomy.peduncle.downAngleRad', spec.trussAnatomy?.peduncle?.downAngleRad],
    ['trussAnatomy.rachis.knuckleSpacingM', spec.trussAnatomy?.rachis?.knuckleSpacingM],
    ['trussAnatomy.rachis.zigzagAmplitudeM', spec.trussAnatomy?.rachis?.zigzagAmplitudeM],
    ['trussAnatomy.rachis.phyllotacticAngleDeg', spec.trussAnatomy?.rachis?.phyllotacticAngleDeg],
    ['trussAnatomy.pedicel.lengthM', spec.trussAnatomy?.pedicel?.lengthM],
    ['trussAnatomy.pedicel.downAngleRad', spec.trussAnatomy?.pedicel?.downAngleRad],
    ['trussAnatomy.pedicel.abscissionZoneFrac', spec.trussAnatomy?.pedicel?.abscissionZoneFrac],
    ['trussAnatomy.fruit.calyxOffsetFrac', spec.trussAnatomy?.fruit?.calyxOffsetFrac],
    ['diurnal.temp_amplitude_C', spec.diurnal?.temp_amplitude_C],
    ['lai.defoliation_cap_base', spec.lai?.defoliation_cap_base],
  ];
  for (const [path, val] of checks) {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new Error(`Model spec missing or invalid: ${path} (got ${val})`);
    }
  }
  return spec;
}

// ---------------------------------------------------------------------
// Cultivar JSON — shape mirrors Cultivar.ts (legacy shape preserved
// so downstream code reads the same field names).
// ---------------------------------------------------------------------

export interface CultivarJson {
  metadata: {
    name: string;
    type: string;
    source: string;
    supplier?: string;
    references?: string[];
  };
  phenology: {
    GDD_to_first_flower: number;
    GDD_per_truss: number;
    GDD_flower_to_red: number;
    cellDivisionDurationGDD: number;
    cellExpansionDurationGDD: number;
    ripeningDurationGDD: number;
    trussRipeningSpreadGDD: number;
  };
  /** Optional per-cultivar phyllochron override (GDD/leaf). Falls back
   *  to ACTIVE_MODEL.organogenesis.phyllochronGDD if absent. */
  organogenesis?: {
    phyllochronGDD?: number;
  };
  flowersPerTruss: { mu: number; sigma: number };
  fruitSetRate: number;
  potentialFruitMassG: { mu: number; sigma: number };
  morphology: {
    // v3.0 Phase 2: per-plant phytomer position of the first truss,
    // and the leaf interval between successive trusses on the main
    // stem. Owned by cultivar, sampled per-plant.
    firstTrussNodeIdx: { mu: number; sigma: number };
    trussIntervalNodes: number;
    // Transitional (Phase 2 → Phase 3): cap diameter for legacy
    // visual sigmoid path. Phase 3 deletes its use as an authoritative
    // size source.
    fruitMaxDiameterMm: { mu: number; sigma: number };
    loculeCount: { mu: number; sigma: number };
    heightWidthRatio: { mu: number; sigma: number };
    ribbingStrength: { mu: number; sigma: number };
    asymmetryStrength: number;
    blossomEndAdvanceFrac: { mu: number; sigma: number };
  };
  color: {
    fullRipeRGB: [number, number, number];
    greenStageRGB: [number, number, number];
    hueVariance: number;
  };
  pruning: {
    defoliationAggressiveness: number;
    trussTargetFruitCount: number;
  };
  physiology: {
    SLA_m2_per_g: number;
    sinkStrength: { leaf: number; stem: number; root: number };
    // Iter 1B (commit eee6b67 + Iter 5b): gompertz는 botanical layer로
    // 이동됨. 본 fields는 deprecated — 엔진은 cultivar.resolvedBotanical
    // 에서 read. JSONC에 남아있어도 무시 (optional). 후속 plan에서 제거.
    gompertzRateB?: number;
    gompertzInflectionC?: number;
  };

  // ── v3.0 Phase 4: reproductive truss-order profile + scenarios ──
  reproductive?: {
    trussOrderProfile: TrussOrderRule[];
  };
  scenarios?: Record<string, ScenarioJson>;

  // ── Plant Morphology Engine — Leaf Module v0.1 (leafShape.v1) ──────
  // Optional. Missing fields fall back to DEFAULT_TOMATO_LEAF_SHAPE via
  // src/plant/leaf/LeafShapeSchema.ts → resolveLeafShape(). Structural
  // interface kept here to avoid cross-package import; the leaf module
  // validates schemaVersion + provenance at resolve time.
  leafShape?: LeafShapeJson;

  // ── Botanical layer override (botanical.v1) ────────────────────────
  // Optional partial override of crop botanical defaults. Resolver is
  // resolveBotanical(base, override) — 5-step strict validation
  // (additionalProperties:false on each merge step). Missing → use
  // ACTIVE_BOTANICAL[crop] as-is.
  botanicalOverride?: BotanicalPartial;
}

/** Structural mirror of LeafShapePartial (src/plant/leaf/LeafShapeSchema.ts).
 *  Kept inline to avoid src/ → packages/ coupling. */
export interface LeafShapeJson {
  schemaVersion?: 'leafShape.v1';
  provenance?: {
    sourceLevel?: 'default' | 'estimated' | 'literature' | 'measured' | 'calibrated';
    confidence?: 'low' | 'medium' | 'high';
    sourceRefs?: string[];
    notes?: string;
    lastReviewed?: string;
  };
  leafletCount?: { early?: number; developing?: number; mature?: number };
  widthProfile?: {
    mode?: 'beta' | 'bezier' | 'sampled';
    peakHalfWidthM?: number;
    peakT?: number;
    sharpness?: number;
    asymmetry?: number;
  };
  marginProfile?: {
    serrationDepth?: number;
    serrationFrequency?: number;
    lobeDepth?: number;
    waviness?: number;
  };
  surfaceProfile?: {
    cupAmount?: number;
    twistAmount?: number;
    droopAmount?: number;
    edgeCurlAmount?: number;
  };
  petioleLengthM?: number;
  rachisLengthM?: number;
  rachisDroopFactor?: number;
  leafletAspect?: number;
  variance?: {
    lengthScaleStd?: number;
    widthScaleStd?: number;
    asymmetryStd?: number;
    droopStd?: number;
  };
}

/** One row in a cultivar's reproductive.trussOrderProfile. minOrder /
 *  maxOrder are 1-based truss positions along the main stem; first
 *  matching row wins. maxOrder=null means "and above". */
export interface TrussOrderRule {
  minOrder: number;
  maxOrder: number | null;
  flowersPerTruss: { mu: number; sigma: number };
  targetFruitCount: number;
  potentialMassMultiplier: number;
}

export interface ScenarioJson {
  metadata?: {
    label?: string;
    intendedUse?: 'production_like' | 'visual_validation_only' | 'comparison_baseline';
    notForYieldPrediction?: boolean;
    targetDays?: number[];
  };
  reproductive?: { trussOrderProfile: TrussOrderRule[] };
  management?: {
    fruitPruning?: { enabled: boolean };
    defoliation?: {
      enabled: boolean;
      /** v4.2: 'bottomUpHeight' (Korean lower-leaf pruning) | 'ripeningAnchored' (legacy). */
      policy?: 'bottomUpHeight' | 'ripeningAnchored';
      // ── bottomUpHeight policy (Korean commercial practice) ──────────
      /** First day on which defoliation activates. Before this day all leaves stay. */
      startDay?: number;
      /** Stem nodes with position.y ≤ this height (m) are defoliation candidates. */
      removeBelowHeightM?: number;
      /** Safety floor — only leaves at least this old (days) get defoliated. */
      minLeafAgeDaysAtRemoval?: number;
      // ── ripeningAnchored policy (legacy v3.0) ──────────────────────
      /** Topmost truss carrying any ripenStage ≥ 4 fruit, plus this
       *  many trusses above, are kept leafed. Below: defoliated. */
      keepTrussesAboveRedTopmost?: number;
      /** Leaves retained on each kept truss-bearing node. */
      keepLeavesPerTruss?: number;
    };
    harvest?: { enabled: boolean; atRipenStage?: 0 | 1 | 2 | 3 | 4 | 5 };
  };
}

export function loadCultivarJson(text: string, label: string): CultivarJson {
  const j = parseJsonc<CultivarJson>(text, label);
  if (typeof j.metadata?.name !== 'string') {
    throw new Error(`Cultivar JSON ${label} missing metadata.name`);
  }
  if (typeof j.morphology?.heightWidthRatio?.mu !== 'number') {
    throw new Error(`Cultivar JSON ${label} missing morphology.heightWidthRatio.mu`);
  }
  return j;
}

// ---------------------------------------------------------------------
// Static initialisation — parse everything at module load. Vite HMR
// re-imports the raw text on file edit → this module re-runs →
// ACTIVE_MODEL silently picks up new values.
// ---------------------------------------------------------------------

export const ACTIVE_MODEL: ModelSpec = loadModelSpec(modelText);

export const CULTIVAR_JSONS: Record<string, CultivarJson> = {
  'cherry-generic': loadCultivarJson(cherryText, 'cherry-generic'),
  'round-generic': loadCultivarJson(roundText, 'round-generic'),
  'beefsteak-generic': loadCultivarJson(beefsteakText, 'beefsteak-generic'),
  'roma-generic': loadCultivarJson(romaText, 'roma-generic'),
  'tomimaru-muchoo': loadCultivarJson(tomimaruText, 'tomimaru-muchoo'),
};

// ---------------------------------------------------------------------
// ACTIVE_BOTANICAL — botanical.v1 defaults per crop.
// Parsed + validated at module load. Cultivar overrides merge via
// resolveBotanical(base, cultivar.botanicalOverride).
// ---------------------------------------------------------------------

export const ACTIVE_BOTANICAL: Record<BotanicalCrop, BotanicalSpec> = {
  tomato: loadBotanical(parseJsonc<unknown>(tomatoBotanicalText, 'botanical/tomato'), 'tomato'),
} as Record<BotanicalCrop, BotanicalSpec>;

export type { BotanicalSpec, BotanicalPartial, BotanicalCrop };

// ---------------------------------------------------------------------
// ACTIVE_SCENARIO — pick one scenario name to use across the engine.
// v3.0 Phase 4 default 'commercial-standard'. Override via
// setActiveScenario(name) for snapshots / dev tooling.
// ---------------------------------------------------------------------

export let ACTIVE_SCENARIO = 'commercial-standard';

export function setActiveScenario(name: string): void {
  ACTIVE_SCENARIO = name;
}

// ---------------------------------------------------------------------
// Training spec (v3.0 Phase 5) — drives axillary bud activation,
// pruning rate, side-shoot biology, and apex height cap.
// ---------------------------------------------------------------------

export interface TrainingSpec {
  metadata: { id: string; label: string; description?: string };
  axillaryBud: {
    baseActivationChance: number;
    apicalDominance: number;
    delayDays: number;
    lightFactor: number;
  };
  pruning: {
    dailyPruneRate: number;
    manualPruneToLength: number;
  };
  sideShoot: {
    leafScale: number;
    internodeLenCm: { mu: number; sigma: number };
    firstTrussNodeIdx: number;
    trussIntervalNodes: number;
    fruitingEnabled: boolean;
  };
  maxPlantHeightCm: number;
}

function loadTrainingSpec(text: string, label: string): TrainingSpec {
  const spec = parseJsonc<TrainingSpec>(text, label);
  const checks: Array<[string, unknown]> = [
    ['metadata.id', spec.metadata?.id],
    ['axillaryBud.baseActivationChance', spec.axillaryBud?.baseActivationChance],
    ['pruning.dailyPruneRate', spec.pruning?.dailyPruneRate],
    ['sideShoot.leafScale', spec.sideShoot?.leafScale],
    ['maxPlantHeightCm', spec.maxPlantHeightCm],
  ];
  for (const [path, val] of checks) {
    if (val == null || (typeof val === 'number' && !Number.isFinite(val))) {
      throw new Error(`Training spec ${label} missing/invalid: ${path}`);
    }
  }
  return spec;
}

export const TRAINING_SPECS: Record<string, TrainingSpec> = {
  'single-stem-high-wire': loadTrainingSpec(singleStemText, 'single-stem-high-wire'),
  'free-bush': loadTrainingSpec(freeBushText, 'free-bush'),
};

export let ACTIVE_TRAINING: TrainingSpec = TRAINING_SPECS['single-stem-high-wire'];

export function setActiveTraining(id: string): void {
  const next = TRAINING_SPECS[id];
  if (!next) throw new Error(`Unknown training spec: ${id}`);
  ACTIVE_TRAINING = next;
}
