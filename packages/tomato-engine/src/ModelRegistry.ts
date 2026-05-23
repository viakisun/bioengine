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
  abortion: {
    threshold_ratio: number;
    lag_days: number;
  };
  fruitGrowth: {
    density_g_per_cm3: number;
    DM_percent: number;
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
    ['abortion.threshold_ratio', spec.abortion?.threshold_ratio],
    ['fruitGrowth.density_g_per_cm3', spec.fruitGrowth?.density_g_per_cm3],
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
  flowersPerTruss: { mu: number; sigma: number };
  fruitSetRate: number;
  potentialFruitMassG: { mu: number; sigma: number };
  morphology: {
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
    gompertzRateB: number;
    gompertzInflectionC: number;
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
