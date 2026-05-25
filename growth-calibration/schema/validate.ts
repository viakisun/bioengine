// Growth Calibration Platform — schema validator (dep-free).
//
// Replacement for Ajv (which is not installed in this repo). Performs
// structural validation against the schema family + key invariants:
//
//   - schemaVersion present + supported
//   - required fields present
//   - enum values valid (TrussStatus / FruitStatus / LeafStatus / ProvenanceSourceType etc.)
//   - numbers are finite
//   - arrays are arrays
//   - cross-field: visibleLeafCount ≥ expandedLeafCount, etc.
//
// Returns ValidationResult; never throws. CLI usage in `growth-calibration/
// scripts/validate-all.ts`.

import type {
  PlantObservation,
  ReferenceManifest,
  Experiment,
  EnvironmentSnapshot,
  ComparisonResult,
  ModelUpdateLog,
  TrussStatus,
  FruitStatus,
  LeafStatus,
  ProvenanceSourceType,
  ProvenanceConfidence,
  ReferenceRole,
  Crop,
  VegetativeStage,
  ReproductiveStage,
} from './types';

// ── Enum value sets ───────────────────────────────────────────────────

const CROPS: ReadonlySet<Crop> = new Set([
  'tomato', 'paprika', 'cucumber', 'strawberry', 'lettuce', 'eggplant',
]);

const PROV_SOURCE: ReadonlySet<ProvenanceSourceType> = new Set([
  'measured', 'user_target', 'literature_reference', 'synthetic_reference', 'simulation',
]);

const PROV_CONFIDENCE: ReadonlySet<ProvenanceConfidence> = new Set(['low', 'medium', 'high']);

const REF_ROLE: ReadonlySet<ReferenceRole> = new Set([
  'initial_calibration_target', 'measured_baseline', 'literature_consensus',
]);

const TRUSS_STATUSES: ReadonlySet<TrussStatus> = new Set([
  'not_visible', 'visible_bud', 'flowering', 'fruit_set',
  'small_green', 'green_expanding', 'fruit_expanding',
  'breaker', 'ripening', 'red',
  'harvest_ready', 'senescent',
]);

const FRUIT_STATUSES: ReadonlySet<FruitStatus> = new Set([
  'flower', 'fruit_set', 'small_green', 'green_expanding',
  'breaker', 'turning', 'red', 'overripe', 'harvested', 'aborted',
]);

const LEAF_STATUSES: ReadonlySet<LeafStatus> = new Set([
  'emerging', 'expanding', 'expanded', 'mature', 'senescing', 'shed',
]);

const VEG_STAGES: ReadonlySet<VegetativeStage> = new Set([
  'germination', 'seedling', 'juvenile', 'active_growth', 'mature',
]);

const REPRO_STAGES: ReadonlySet<ReproductiveStage> = new Set([
  'none', 'truss_initiation', 'flowering', 'fruit_set',
  'fruit_expansion', 'ripening', 'harvest', 'senescence',
]);

// ── Validation result ─────────────────────────────────────────────────

export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  schemaType: string;
  issues: ValidationIssue[];
}

// ── Helpers ───────────────────────────────────────────────────────────

class Ctx {
  issues: ValidationIssue[] = [];
  path: string[] = [];

  err(msg: string): void {
    this.issues.push({ path: this.path.join('.') || '$', message: msg, severity: 'error' });
  }
  warn(msg: string): void {
    this.issues.push({ path: this.path.join('.') || '$', message: msg, severity: 'warning' });
  }
  in<T>(seg: string | number, fn: () => T): T {
    this.path.push(String(seg));
    try { return fn(); } finally { this.path.pop(); }
  }
  required(obj: unknown, key: string): boolean {
    if (obj == null || (obj as Record<string, unknown>)[key] === undefined) {
      this.err(`missing required field '${key}'`);
      return false;
    }
    return true;
  }
  finite(value: unknown, label: string): boolean {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.err(`${label}: expected finite number, got ${typeof value} (${String(value)})`);
      return false;
    }
    return true;
  }
  enumOk<T extends string>(value: unknown, set: ReadonlySet<T>, label: string): boolean {
    if (typeof value !== 'string' || !set.has(value as T)) {
      this.err(`${label}: invalid enum value '${String(value)}'. Allowed: ${[...set].join(', ')}`);
      return false;
    }
    return true;
  }
}

function validateProvenance(ctx: Ctx, p: unknown): void {
  if (!p || typeof p !== 'object') { ctx.err('provenance: must be object'); return; }
  const prov = p as Record<string, unknown>;
  ctx.in('provenance', () => {
    if (ctx.required(prov, 'sourceType')) ctx.enumOk(prov.sourceType, PROV_SOURCE, 'sourceType');
    if (ctx.required(prov, 'confidence'))  ctx.enumOk(prov.confidence, PROV_CONFIDENCE, 'confidence');
    if (ctx.required(prov, 'sourceRefs') && !Array.isArray(prov.sourceRefs)) {
      ctx.err('sourceRefs: must be array');
    }
  });
}

function validateThermalTime(ctx: Ctx, t: unknown, optional = false): void {
  if (t == null) { if (!optional) ctx.err('thermalTime: required'); return; }
  if (typeof t !== 'object') { ctx.err('thermalTime: must be object'); return; }
  const tt = t as Record<string, unknown>;
  ctx.in('thermalTime', () => {
    if (ctx.required(tt, 'baseTemperatureC')) ctx.finite(tt.baseTemperatureC, 'baseTemperatureC');
    if (ctx.required(tt, 'dailyGdd'))         ctx.finite(tt.dailyGdd, 'dailyGdd');
    if (ctx.required(tt, 'accumulatedGdd'))   ctx.finite(tt.accumulatedGdd, 'accumulatedGdd');
    if (ctx.required(tt, 'method')) {
      const m = tt.method;
      if (m !== 'simple_average' && m !== 'hourly_integration' && m !== 'provided') {
        ctx.err(`method: invalid value '${String(m)}'`);
      }
    }
  });
}

// ── Schema 0 — ReferenceManifest ──────────────────────────────────────

export function validateReferenceManifest(obj: unknown): ValidationResult {
  const ctx = new Ctx();
  const schemaType = 'ReferenceManifest';
  if (!obj || typeof obj !== 'object') {
    ctx.err('must be object');
    return { valid: false, schemaType, issues: ctx.issues };
  }
  const m = obj as Record<string, unknown>;

  if (m.schemaVersion !== 'growthReference.v0.1') {
    ctx.err(`schemaVersion: expected 'growthReference.v0.1', got '${String(m.schemaVersion)}'`);
  }
  ctx.required(m, 'referencePackId');
  if (ctx.required(m, 'crop'))           ctx.enumOk(m.crop, CROPS, 'crop');
  ctx.required(m, 'cultivar');
  ctx.required(m, 'growthSystem');
  if (ctx.required(m, 'referenceRole'))  ctx.enumOk(m.referenceRole, REF_ROLE, 'referenceRole');
  if (ctx.required(m, 'sourceType'))     ctx.enumOk(m.sourceType, PROV_SOURCE, 'sourceType');
  if (ctx.required(m, 'confidence'))     ctx.enumOk(m.confidence, PROV_CONFIDENCE, 'confidence');
  ctx.required(m, 'createdAt');
  ctx.required(m, 'createdBy');
  if (ctx.required(m, 'basis') && !Array.isArray(m.basis)) ctx.err('basis: must be array');
  if (ctx.required(m, 'importantNotes') && !Array.isArray(m.importantNotes)) ctx.err('importantNotes: must be array');
  if (ctx.required(m, 'measurementIntervalDays')) ctx.finite(m.measurementIntervalDays, 'measurementIntervalDays');
  if (ctx.required(m, 'targetDays') && !Array.isArray(m.targetDays)) ctx.err('targetDays: must be array');
  if (ctx.required(m, 'primaryUse') && !Array.isArray(m.primaryUse)) ctx.err('primaryUse: must be array');
  if (ctx.required(m, 'contents') && Array.isArray(m.contents)) {
    (m.contents as unknown[]).forEach((c, i) => ctx.in(`contents[${i}]`, () => {
      const ce = c as Record<string, unknown>;
      ctx.required(ce, 'filename');
      ctx.required(ce, 'type');
      ctx.required(ce, 'role');
      ctx.required(ce, 'description');
    }));
  }

  return { valid: !ctx.issues.some(i => i.severity === 'error'), schemaType, issues: ctx.issues };
}

// ── Schema 3 — PlantObservation ───────────────────────────────────────

export function validatePlantObservation(obj: unknown): ValidationResult {
  const ctx = new Ctx();
  const schemaType = 'PlantObservation';
  if (!obj || typeof obj !== 'object') {
    ctx.err('must be object');
    return { valid: false, schemaType, issues: ctx.issues };
  }
  const o = obj as Record<string, unknown>;

  if (o.schemaVersion !== 'growthCalibration.v1') {
    ctx.err(`schemaVersion: expected 'growthCalibration.v1', got '${String(o.schemaVersion)}'`);
  }
  if (ctx.required(o, 'provenance'))  validateProvenance(ctx, o.provenance);
  ctx.required(o, 'experimentId');
  ctx.required(o, 'plantId');
  if (ctx.required(o, 'day'))           ctx.finite(o.day, 'day');
  ctx.required(o, 'observationDate');
  if (ctx.required(o, 'plantAgeDays'))  ctx.finite(o.plantAgeDays, 'plantAgeDays');
  if (o.thermalTime !== undefined)      validateThermalTime(ctx, o.thermalTime, true);

  // overall
  if (ctx.required(o, 'overall')) {
    const ov = o.overall as Record<string, unknown>;
    ctx.in('overall', () => {
      for (const k of [
        'heightCm', 'mainStemLengthCm', 'mainStemDiameterMm',
        'nodeCount', 'visibleLeafCount', 'expandedLeafCount',
        'visibleTrussCount', 'floweringTrussCount', 'fruitingTrussCount',
        'fruitCountTotal',
      ]) {
        if (ctx.required(ov, k)) ctx.finite(ov[k], k);
      }
      // Cross-field invariants
      const vl = ov.visibleLeafCount as number | undefined;
      const el = ov.expandedLeafCount as number | undefined;
      if (typeof vl === 'number' && typeof el === 'number' && el > vl) {
        ctx.warn(`expandedLeafCount(${el}) > visibleLeafCount(${vl}) — usually expanded ≤ visible`);
      }
      const ft = ov.fruitingTrussCount as number | undefined;
      const vt = ov.visibleTrussCount as number | undefined;
      if (typeof ft === 'number' && typeof vt === 'number' && ft > vt) {
        ctx.err(`fruitingTrussCount(${ft}) > visibleTrussCount(${vt})`);
      }
    });
  }

  // phenology
  if (ctx.required(o, 'phenology')) {
    const ph = o.phenology as Record<string, unknown>;
    ctx.in('phenology', () => {
      if (ctx.required(ph, 'vegetativeStage'))   ctx.enumOk(ph.vegetativeStage, VEG_STAGES, 'vegetativeStage');
      if (ctx.required(ph, 'reproductiveStage')) ctx.enumOk(ph.reproductiveStage, REPRO_STAGES, 'reproductiveStage');
      for (const k of [
        'firstVisibleTrussDay','firstFlowerOpenDay','firstFruitSetDay',
        'firstFruitVisibleDay','firstRipeFruitDay',
      ]) {
        const v = ph[k];
        if (v !== null && v !== undefined && typeof v !== 'number') {
          ctx.err(`${k}: must be number or null`);
        }
      }
    });
  }

  // nodes / leaves / trusses / fruits — must be arrays
  for (const k of ['nodes', 'leaves', 'trusses', 'fruits']) {
    if (!Array.isArray(o[k])) ctx.err(`${k}: must be array (empty array OK)`);
  }

  // Per-leaf validation (orientation + status enum)
  if (Array.isArray(o.leaves)) {
    (o.leaves as unknown[]).forEach((l, i) => ctx.in(`leaves[${i}]`, () => {
      const lf = l as Record<string, unknown>;
      ctx.required(lf, 'leafId');
      if (ctx.required(lf, 'status')) ctx.enumOk(lf.status, LEAF_STATUSES, 'status');
      if (ctx.required(lf, 'leafletCount')) ctx.finite(lf.leafletCount, 'leafletCount');
      if (lf.orientation && typeof lf.orientation === 'object') {
        const or = lf.orientation as Record<string, unknown>;
        ctx.in('orientation', () => {
          for (const k of ['azimuthDeg','elevationDeg','droopAngleDeg','rollDeg']) {
            if (ctx.required(or, k)) ctx.finite(or[k], k);
          }
        });
      }
    }));
  }

  // Per-truss status enum
  if (Array.isArray(o.trusses)) {
    (o.trusses as unknown[]).forEach((t, i) => ctx.in(`trusses[${i}]`, () => {
      const tr = t as Record<string, unknown>;
      ctx.required(tr, 'trussId');
      if (ctx.required(tr, 'status')) ctx.enumOk(tr.status, TRUSS_STATUSES, 'status');
    }));
  }

  // Per-fruit status enum
  if (Array.isArray(o.fruits)) {
    (o.fruits as unknown[]).forEach((f, i) => ctx.in(`fruits[${i}]`, () => {
      const fr = f as Record<string, unknown>;
      ctx.required(fr, 'fruitId');
      if (ctx.required(fr, 'status')) ctx.enumOk(fr.status, FRUIT_STATUSES, 'status');
    }));
  }

  return { valid: !ctx.issues.some(i => i.severity === 'error'), schemaType, issues: ctx.issues };
}

// ── Combined dispatch by schemaVersion + heuristics ───────────────────

export function validateAny(obj: unknown):
  | { type: 'ReferenceManifest'; result: ValidationResult }
  | { type: 'PlantObservation';  result: ValidationResult }
  | { type: 'unknown';           result: ValidationResult }
{
  if (!obj || typeof obj !== 'object') {
    return { type: 'unknown', result: { valid: false, schemaType: 'unknown', issues: [{ path: '$', message: 'not an object', severity: 'error' }] } };
  }
  const o = obj as Record<string, unknown>;

  if (o.schemaVersion === 'growthReference.v0.1' && o.referencePackId !== undefined) {
    return { type: 'ReferenceManifest', result: validateReferenceManifest(obj) };
  }
  if (o.schemaVersion === 'growthCalibration.v1' && o.plantId !== undefined) {
    return { type: 'PlantObservation', result: validatePlantObservation(obj) };
  }
  return {
    type: 'unknown',
    result: { valid: false, schemaType: 'unknown',
      issues: [{ path: '$', message: `unable to identify schema (schemaVersion=${String(o.schemaVersion)})`, severity: 'error' }] },
  };
}

// Re-export for symmetry
export type {
  PlantObservation, ReferenceManifest, Experiment, EnvironmentSnapshot,
  ComparisonResult, ModelUpdateLog,
};
