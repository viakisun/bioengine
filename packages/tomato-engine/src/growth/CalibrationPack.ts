// Iter 29 Phase 6 — CalibrationPack module.
//
// Plan §6 (sleepy-growing-pretzel.md):
//   1. Compile-time schema validation — TypeScript interface + JSONC parser
//   2. Runtime sanity check — assertWithinCalibrationBand emits CalibrationWarning
//      (NOT throw — warning + diagnostic dump)
//   3. 진단 dump 도구 — tests/architecture/*-calibration-band.spec.ts
//
// ★ Dependency-free boundary: no ModelRegistry import, no Vite `?raw` chain.
// Loader accepts the JSONC text string from caller (which CAN read via
// ModelRegistry — Phase 6 wire-in is at the consumer side).

export type CalibrationSource =
  | 'literature'
  | 'vendor'
  | 'estimated'
  | 'measured'
  | 'calibrated';

export type CalibrationConfidence = 'low' | 'medium' | 'high';

/** TT-based or day-based check point. */
export interface CalibrationCheckpointTT {
  tt: number;
  min: number;
  max: number;
}

export interface CalibrationCheckpointDay {
  d: number;
  min: number;
  max: number;
}

export interface CalibrationParameter {
  /** Either ageTT-based or day-based checkpoints (one of). */
  ageTT?: CalibrationCheckpointTT[];
  day?: CalibrationCheckpointDay[];
  source: string;
  sourceRefs?: string[];
}

export interface CalibrationPackSpec {
  schemaVersion: 'calibrationPack.v0.1';
  metadata: {
    name: string;
    crop: string;
    source: string;
    lastReviewed: string;
    confidence: CalibrationConfidence;
  };
  leaf?: {
    targetAreaCm2?: CalibrationParameter;
    leafletCount?: CalibrationParameter;
    senescenceProgress?: CalibrationParameter;
  };
  plant?: {
    heightCm?: CalibrationParameter;
    nodeCount?: CalibrationParameter;
  };
  stem?: {
    baseRadiusMm?: CalibrationParameter;
  };
}

/**
 * Plan CALIBRATION-WARNING-01 — structured calibration warning.
 *
 * Emitted (NOT thrown) when an observed value falls outside the expected
 * calibration band. Includes provenance so callers can identify which
 * node, organ, and parameter drifted.
 */
export interface CalibrationWarning {
  nodeId: string;
  organKind: 'leaf' | 'truss' | 'fruit' | 'flower' | 'calyx' | 'stem' | 'internode' | 'plant';
  parameterName: string;
  observed: number;
  expectedRange: [number, number];
  source: string;
  severity: 'info' | 'warn' | 'error';
}

/**
 * Parse a JSONC-stripped CalibrationPackSpec text. Strips both `//` line
 * comments and `/* ... *​/` block comments before JSON.parse.
 *
 * Caller supplies the file content (no FS coupling). Returns `null` on
 * parse failure.
 */
export function parseCalibrationPack(jsonc: string): CalibrationPackSpec | null {
  const stripped = jsonc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  try {
    return JSON.parse(stripped) as CalibrationPackSpec;
  } catch {
    return null;
  }
}

/**
 * Validate basic schema invariants on a parsed pack. Returns a list of
 * issue strings (empty array = valid).
 */
export function validateCalibrationPack(spec: CalibrationPackSpec): string[] {
  const issues: string[] = [];
  if (spec.schemaVersion !== 'calibrationPack.v0.1') {
    issues.push(`schemaVersion expected calibrationPack.v0.1, got ${spec.schemaVersion}`);
  }
  if (!spec.metadata?.name) issues.push('metadata.name missing');
  if (!spec.metadata?.crop) issues.push('metadata.crop missing');

  const validateParam = (label: string, param?: CalibrationParameter): void => {
    if (!param) return;
    const hasTT = param.ageTT && param.ageTT.length > 0;
    const hasDay = param.day && param.day.length > 0;
    if (!hasTT && !hasDay) {
      issues.push(`${label}: must have at least one of ageTT/day checkpoints`);
    }
    if (!param.source) issues.push(`${label}: source missing`);
    // checkpoints monotonic + min ≤ max
    if (hasTT) {
      let prev = -Infinity;
      for (const cp of param.ageTT!) {
        if (cp.tt < prev) issues.push(`${label} ageTT not monotonic at tt=${cp.tt}`);
        if (cp.min > cp.max) issues.push(`${label} ageTT[${cp.tt}] min > max`);
        prev = cp.tt;
      }
    }
    if (hasDay) {
      let prev = -Infinity;
      for (const cp of param.day!) {
        if (cp.d < prev) issues.push(`${label} day not monotonic at d=${cp.d}`);
        if (cp.min > cp.max) issues.push(`${label} day[${cp.d}] min > max`);
        prev = cp.d;
      }
    }
  };

  validateParam('leaf.targetAreaCm2', spec.leaf?.targetAreaCm2);
  validateParam('leaf.leafletCount', spec.leaf?.leafletCount);
  validateParam('leaf.senescenceProgress', spec.leaf?.senescenceProgress);
  validateParam('plant.heightCm', spec.plant?.heightCm);
  validateParam('plant.nodeCount', spec.plant?.nodeCount);
  validateParam('stem.baseRadiusMm', spec.stem?.baseRadiusMm);

  return issues;
}

/**
 * Linear-interpolate the (min, max) band for a TT-based parameter at the
 * given ageTT. Returns `null` when checkpoints are missing or ageTT is
 * out of range.
 */
export function bandAtTT(param: CalibrationParameter, ageTT: number): [number, number] | null {
  if (!param.ageTT || param.ageTT.length === 0) return null;
  const cps = param.ageTT;
  if (ageTT <= cps[0].tt) return [cps[0].min, cps[0].max];
  if (ageTT >= cps[cps.length - 1].tt) {
    const last = cps[cps.length - 1];
    return [last.min, last.max];
  }
  for (let i = 1; i < cps.length; i++) {
    const lo = cps[i - 1];
    const hi = cps[i];
    if (ageTT >= lo.tt && ageTT <= hi.tt) {
      const t = (ageTT - lo.tt) / Math.max(1e-9, hi.tt - lo.tt);
      return [
        lo.min + (hi.min - lo.min) * t,
        lo.max + (hi.max - lo.max) * t,
      ];
    }
  }
  return null;
}

/**
 * Linear-interpolate the (min, max) band for a day-based parameter at the
 * given day.
 */
export function bandAtDay(param: CalibrationParameter, day: number): [number, number] | null {
  if (!param.day || param.day.length === 0) return null;
  const cps = param.day;
  if (day <= cps[0].d) return [cps[0].min, cps[0].max];
  if (day >= cps[cps.length - 1].d) {
    const last = cps[cps.length - 1];
    return [last.min, last.max];
  }
  for (let i = 1; i < cps.length; i++) {
    const lo = cps[i - 1];
    const hi = cps[i];
    if (day >= lo.d && day <= hi.d) {
      const t = (day - lo.d) / Math.max(1e-9, hi.d - lo.d);
      return [
        lo.min + (hi.min - lo.min) * t,
        lo.max + (hi.max - lo.max) * t,
      ];
    }
  }
  return null;
}

/**
 * Plan CALIBRATION-WARNING-01 / -02 — dev-only assertion.
 *
 * Returns a CalibrationWarning when the observed value falls outside the
 * expected band. Returns `null` when within band or band missing.
 * NEVER throws — caller decides whether to log/dump.
 *
 * Production build can strip the call site via a build-time DEV flag.
 */
export function assertWithinCalibrationBand(input: {
  observed: number;
  expectedRange: [number, number];
  nodeId: string;
  organKind: CalibrationWarning['organKind'];
  parameterName: string;
  source: string;
}): CalibrationWarning | null {
  const [min, max] = input.expectedRange;
  if (input.observed >= min && input.observed <= max) return null;
  const severity: CalibrationWarning['severity'] =
    input.observed < min * 0.5 || input.observed > max * 1.5 ? 'error' : 'warn';
  return {
    nodeId: input.nodeId,
    organKind: input.organKind,
    parameterName: input.parameterName,
    observed: input.observed,
    expectedRange: [min, max],
    source: input.source,
    severity,
  };
}
