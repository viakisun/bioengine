// compare-real-vs-sim — Comparison engine (Artifact #4).
//
// Reads:
//   - reference observation bundle:
//       growth-calibration/reference/tomato/tomimaru-muchoo_22C_reference.json
//     (or experiments/{expId}/observations/ for measured)
//   - simulation outputs:
//       growth-calibration/experiments/{expId}/simulation/{modelVersion}/
//         day_{NNN}/sim_*.json
//
// Writes:
//   growth-calibration/experiments/{expId}/comparison/{modelVersion}/
//     day_{NNN}/compare_*.json     (per-comparison ComparisonResult)
//     summary.json                  (aggregate score across all days/plants)
//
// Comparison engine flow:
//   1. Pair (reference observation at day D) × (each sim ensemble at day D)
//   2. For each metric path, compute error + similarity score (zero-band defense)
//   3. For status enums, compute stageDelta + score
//   4. Apply diagnostic rules (common + crop + cultivar_day_specific)
//   5. Emit ComparisonResult with overall S + pBand + diagnosis array
//
// Usage:
//   npx vite-node growth-calibration/scripts/compare-real-vs-sim.ts \
//     --experimentId tomato_calibration_baseline \
//     --modelVersion growthModel.tomato.baseline \
//     --referenceBundle growth-calibration/reference/tomato/tomimaru-muchoo_22C_reference.json

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';

import type {
  PlantObservation,
  ComparisonResult,
  TrussObservation,
  FruitObservation,
  LeafObservation,
  MetricTolerance,
} from '../schema/types';
import {
  TRUSS_STATUS_ORDER, FRUIT_STATUS_ORDER, LEAF_STATUS_ORDER,
  stageDelta, stageDeltaSeverity, stageDeltaScore,
} from '../schema/enums';

// ── CLI ───────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');

interface CliArgs {
  experimentId: string;
  modelVersion: string;
  referenceBundle: string;
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
    experimentId: opts.experimentId ?? 'tomato_calibration_baseline',
    modelVersion: opts.modelVersion ?? 'growthModel.tomato.baseline',
    referenceBundle: opts.referenceBundle ?? join(ROOT, 'reference/tomato/tomimaru-muchoo_22C_reference.json'),
    outRoot: opts.outRoot ?? join(ROOT, 'experiments'),
  };
}

// ── Schema 7 (metric_tolerance) loader ────────────────────────────────

interface MetricToleranceTable {
  metricTolerances: Record<string, MetricTolerance>;
}

function loadMetricTolerance(): MetricToleranceTable {
  const text = readFileSync(join(ROOT, 'schema/metric_tolerance.jsonc'), 'utf8');
  return parseJsonc(text, [], { allowTrailingComma: true }) as MetricToleranceTable;
}

function getTolerance(table: MetricToleranceTable, path: string): MetricTolerance {
  // exact match first
  if (table.metricTolerances[path]) return table.metricTolerances[path];
  // try [*] wildcard match — replace [N] with [*]
  const wildcard = path.replace(/\[\d+\]/g, '[*]');
  return table.metricTolerances[wildcard] ?? {};
}

function effectiveHalfBand(refMin: number, refMax: number, tol: MetricTolerance): number {
  const refHalfBand = (refMax - refMin) / 2;
  const refMid = (refMin + refMax) / 2;
  return Math.max(
    refHalfBand,
    tol.minHalfBand ?? 0,
    tol.absoluteTolerance ?? 0,
    (tol.relativeTolerance ?? 0) * Math.abs(refMid),
  );
}

// ── Diagnostic rules loader ───────────────────────────────────────────

interface RuleDef {
  ruleId: string;
  scope?: { crop?: string | null; cultivar?: string; dayRange?: [number, number]; growthSystem?: string };
  if: string;
  diagnosis: string;
  severity: 'low' | 'medium' | 'high';
  target: string;
  suggestedParameters: string[];
  suggestedChangeType: string;
  message: string;
}

interface RuleFile { rules: RuleDef[]; }

function loadRulesIn(dir: string): RuleDef[] {
  const rules: RuleDef[] = [];
  if (!existsSync(dir)) return rules;
  for (const fn of readdirSync(dir)) {
    if (!fn.endsWith('.jsonc') && !fn.endsWith('.json')) continue;
    const text = readFileSync(join(dir, fn), 'utf8');
    const parsed = parseJsonc(text, [], { allowTrailingComma: true }) as RuleFile;
    if (Array.isArray(parsed.rules)) rules.push(...parsed.rules);
  }
  return rules;
}

function scopeMatches(rule: RuleDef, ctx: { crop: string; cultivar?: string; day: number; growthSystem?: string }): boolean {
  const s = rule.scope;
  if (!s) return true;
  if (s.crop != null && s.crop !== ctx.crop) return false;
  if (s.cultivar != null && s.cultivar !== ctx.cultivar) return false;
  if (s.growthSystem != null && s.growthSystem !== ctx.growthSystem) return false;
  if (s.dayRange) {
    const [lo, hi] = s.dayRange;
    if (ctx.day < lo || ctx.day > hi) return false;
  }
  return true;
}

// ── Metric weight classification ──────────────────────────────────────

const CRITICAL_METRICS = new Set([
  'overall.fruitCountTotal',
  'overall.visibleTrussCount',
  'overall.floweringTrussCount',
  'overall.visibleLeafCount',
  'overall.maxFruitDiameterMm',
  'leaves[*].orientation.lateralSpreadDeg',
  'leaves[*].orientation.droopAngleDeg',
]);
const IMPORTANT_METRICS = new Set([
  'overall.heightCm',
  'overall.nodeCount',
  'overall.expandedLeafCount',
  'overall.fruitingTrussCount',
  'overall.laiCanopy',
]);

function weightOf(metricPath: string): number {
  const wild = metricPath.replace(/\[\d+\]/g, '[*]');
  if (CRITICAL_METRICS.has(wild)) return 3;
  if (IMPORTANT_METRICS.has(wild)) return 2;
  return 1;
}

// ── Comparison core ───────────────────────────────────────────────────

interface CompareInput {
  reference: PlantObservation;
  simulation: PlantObservation;
  crop: string;
  cultivar?: string;
  rules: RuleDef[];
  tolerance: MetricToleranceTable;
}

interface MetricCompareEntry {
  path: string;
  actual: number | null;
  simulated: number | null;
  error: number;
  relativeError: number;
  inBand: boolean;
  score: number;
  weight: number;
  toleranceUsed: number;
}

function compareNumeric(
  path: string, refVal: number, simVal: number, refMin: number, refMax: number,
  tol: MetricToleranceTable,
): MetricCompareEntry {
  const t = getTolerance(tol, path);
  const halfBand = effectiveHalfBand(refMin, refMax, t);
  const refMid = (refMin + refMax) / 2;
  const inBand = simVal >= refMin && simVal <= refMax;
  const distOutsideBand = Math.max(0, Math.abs(simVal - refMid) - halfBand);
  const normDist = halfBand > 0 ? distOutsideBand / halfBand : (inBand ? 0 : 99);
  const score = Math.exp(-normDist);
  const err = simVal - refVal;
  const relErr = Math.abs(refVal) > 1e-9 ? err / Math.abs(refVal) : (err === 0 ? 0 : Number.POSITIVE_INFINITY);
  return {
    path, actual: refVal, simulated: simVal,
    error: err, relativeError: relErr, inBand,
    score, weight: weightOf(path), toleranceUsed: halfBand,
  };
}

function comparePlant(input: CompareInput): ComparisonResult {
  const { reference: ref, simulation: sim, crop, cultivar, rules, tolerance } = input;
  const entries: MetricCompareEntry[] = [];
  const stageDeltas: NonNullable<ComparisonResult['stageDeltas']> = [];
  const diagnoses: ComparisonResult['diagnosis'] = [];

  // Overall numeric metrics — use simulated value as both ref and band-mid
  // (ref bundle stores midpoints; we don't have explicit min/max here, so
  // we synthesize a tolerance-driven band from metric_tolerance.jsonc).
  const ov_ref = ref.overall as unknown as Record<string, number>;
  const ov_sim = sim.overall as unknown as Record<string, number>;
  for (const key of [
    'heightCm', 'nodeCount', 'visibleLeafCount', 'expandedLeafCount',
    'visibleTrussCount', 'floweringTrussCount', 'fruitingTrussCount',
    'fruitCountTotal', 'mainStemDiameterMm',
  ]) {
    if (typeof ov_ref[key] === 'number' && typeof ov_sim[key] === 'number') {
      const refVal = ov_ref[key];
      const tol = getTolerance(tolerance, `overall.${key}`);
      const halfBand = effectiveHalfBand(refVal, refVal, tol);
      entries.push(compareNumeric(
        `overall.${key}`, refVal, ov_sim[key],
        refVal - halfBand, refVal + halfBand, tolerance,
      ));
    }
  }
  if (typeof (ov_ref as { maxFruitDiameterMm?: number }).maxFruitDiameterMm === 'number') {
    const ref_v = (ov_ref as { maxFruitDiameterMm: number }).maxFruitDiameterMm;
    const sim_v = (ov_sim as { maxFruitDiameterMm?: number }).maxFruitDiameterMm ?? 0;
    const tol = getTolerance(tolerance, 'overall.maxFruitDiameterMm');
    const halfBand = effectiveHalfBand(ref_v, ref_v, tol);
    entries.push(compareNumeric(
      'overall.maxFruitDiameterMm', ref_v, sim_v,
      ref_v - halfBand, ref_v + halfBand, tolerance,
    ));
  }

  // Truss stageDelta — pair by trussIndex
  for (const refT of ref.trusses) {
    const simT = sim.trusses.find(t => t.trussIndex === refT.trussIndex);
    if (!simT) continue;
    const d = stageDelta(TRUSS_STATUS_ORDER, refT.status, simT.status);
    if (!Number.isNaN(d)) {
      stageDeltas.push({
        target: `trusses[${refT.trussIndex}].status`,
        actualStatus: refT.status,
        simulatedStatus: simT.status,
        stageDelta: d,
        severity: stageDeltaSeverity(d),
      });
    }
  }

  // Fruit stageDelta — pair by fruitId or by (trussIndex, positionInTruss)
  for (const refF of ref.fruits) {
    const simF = sim.fruits.find(f =>
      (f.trussIndex === refF.trussIndex && f.positionInTruss === refF.positionInTruss),
    );
    if (!simF) continue;
    const d = stageDelta(FRUIT_STATUS_ORDER, refF.status, simF.status);
    if (!Number.isNaN(d)) {
      stageDeltas.push({
        target: `fruits[${refF.fruitId}].status`,
        actualStatus: refF.status,
        simulatedStatus: simF.status,
        stageDelta: d,
        severity: stageDeltaSeverity(d),
      });
    }
  }

  // Leaf orientation aggregation — mean lateralSpread / droop / elevation
  const leafMeans = (leaves: LeafObservation[]) => {
    if (leaves.length === 0) return null;
    const mean = (vals: number[]) => vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return {
      // Lateral spread ≈ range of azimuthDeg (rough proxy for canopy width)
      // Reference uses absolute target (45-90°); sim uses (max - min) azimuth deg.
      lateralSpreadDeg: (() => {
        const azis = leaves.map(l => l.orientation.azimuthDeg);
        if (azis.length === 0) return 0;
        return Math.max(...azis) - Math.min(...azis);
      })(),
      droopAngleDeg: mean(leaves.map(l => l.orientation.droopAngleDeg)),
      elevationDeg: mean(leaves.map(l => l.orientation.elevationDeg)),
    };
  };
  const refL = leafMeans(ref.leaves);
  const simL = leafMeans(sim.leaves);
  if (refL && simL) {
    for (const key of ['lateralSpreadDeg', 'droopAngleDeg', 'elevationDeg'] as const) {
      const refVal = refL[key];
      const tol = getTolerance(tolerance, `leaves[*].orientation.${key}`);
      const halfBand = effectiveHalfBand(refVal, refVal, tol);
      entries.push(compareNumeric(
        `leaves[*].orientation.${key}`, refVal, simL[key],
        refVal - halfBand, refVal + halfBand, tolerance,
      ));
    }
  }

  // ── Apply diagnostic rules ────────────────────────────────────────
  const ctx = { crop, cultivar, day: sim.day, growthSystem: 'string_training' };
  for (const rule of rules) {
    if (!scopeMatches(rule, ctx)) continue;
    if (evalRule(rule, sim, stageDeltas)) {
      diagnoses.push({
        ruleId: rule.ruleId,
        type: rule.diagnosis as ComparisonResult['diagnosis'][number]['type'],
        target: rule.target,
        severity: rule.severity,
        message: rule.message,
        suggestedParameters: rule.suggestedParameters,
        suggestedChangeType: (rule.suggestedChangeType as ComparisonResult['diagnosis'][number]['suggestedChangeType']),
      });
    }
  }

  // ── Aggregate scores ──────────────────────────────────────────────
  const numericContrib = entries.reduce((acc, e) => ({ wsum: acc.wsum + e.weight * e.score, w: acc.w + e.weight }),
    { wsum: 0, w: 0 });
  const stageContrib = stageDeltas.reduce((acc, sd) => {
    const wild = sd.target.startsWith('trusses') ? 'trusses[*].status' : 'fruits[*].status';
    const w = weightOf(wild);
    return { wsum: acc.wsum + w * stageDeltaScore(sd.stageDelta), w: acc.w + w };
  }, { wsum: 0, w: 0 });

  const totalW = numericContrib.w + stageContrib.w;
  const S = totalW > 0 ? (numericContrib.wsum + stageContrib.wsum) / totalW : 0;

  const inBandCount = entries.filter(e => e.inBand).length + stageDeltas.filter(sd => Math.abs(sd.stageDelta) <= 1).length;
  const totalCells = entries.length + stageDeltas.length;
  const pBand = totalCells > 0 ? inBandCount / totalCells : 0;

  // Sub-scores (rough partition)
  const vegEntries = entries.filter(e => /heightCm|nodeCount|visibleLeafCount|expandedLeafCount|laiCanopy/.test(e.path));
  const reproEntries = entries.filter(e => /Truss|Fruit/.test(e.path));
  const geomEntries = entries.filter(e => /orientation|height/.test(e.path));
  const vegScore = avgScore(vegEntries);
  const reproScore = (avgScore(reproEntries) + (stageContrib.w > 0 ? stageContrib.wsum / stageContrib.w : 0)) / 2;
  const geomScore = avgScore(geomEntries);
  const phenoScore = stageContrib.w > 0 ? stageContrib.wsum / stageContrib.w : 0;

  // Map entries → errors record
  const errors: ComparisonResult['errors'] = {};
  for (const e of entries) {
    errors[e.path] = {
      actual: e.actual,
      simulated: e.simulated,
      error: e.error,
      relativeError: e.relativeError,
      inBand: e.inBand,
    };
  }

  return {
    schemaVersion: 'growthCalibration.v1',
    comparisonId: `cmp_day${sim.day.toString().padStart(3, '0')}_${sim.plantId}_vs_${ref.plantId}`,
    experimentId: sim.experimentId,
    simulationRunId: sim.modelVersion ?? 'unknown',
    comparisonLevel: 'plant_pair',
    realPlantId: ref.plantId,
    simPlantId: sim.plantId,
    day: sim.day,
    accumulatedGdd: sim.thermalTime?.accumulatedGdd,
    comparisonAxis: 'calendar_day',
    summary: {
      overallScore: S,
      vegetativeScore: vegScore,
      reproductiveScore: reproScore,
      geometryScore: geomScore,
      phenologyScore: phenoScore,
      pBand,
    },
    errors,
    stageDeltas,
    diagnosis: diagnoses,
  };
}

function avgScore(entries: MetricCompareEntry[]): number {
  if (entries.length === 0) return 0;
  const w = entries.reduce((a, e) => a + e.weight, 0);
  const ws = entries.reduce((a, e) => a + e.weight * e.score, 0);
  return w > 0 ? ws / w : 0;
}

// ── Rule evaluator (subset of conditions used in our rule files) ──────

function evalRule(
  rule: RuleDef,
  sim: PlantObservation,
  stageDeltas: NonNullable<ComparisonResult['stageDeltas']>,
): boolean {
  const cond = rule.if.trim();
  const ov = sim.overall as unknown as Record<string, number>;

  // Pattern: 'overall.X > N'
  let m = cond.match(/^overall\.(\w+)\s*([><=]+)\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const v = ov[m[1]];
    const n = Number(m[3]);
    return cmp(v, m[2], n);
  }
  // Pattern: 'overall.X > N AND day < M'
  m = cond.match(/^overall\.(\w+)\s*([><=]+)\s*(-?\d+(?:\.\d+)?)\s+AND\s+day\s*([><=]+)\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    return cmp(ov[m[1]], m[2], Number(m[3])) && cmp(sim.day, m[4], Number(m[5]));
  }
  // Pattern: 'overall.X > N OR overall.Y > M'
  m = cond.match(/^overall\.(\w+)\s*([><=]+)\s*(-?\d+(?:\.\d+)?)\s+OR\s+overall\.(\w+)\s*([><=]+)\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    return cmp(ov[m[1]], m[2], Number(m[3])) || cmp(ov[m[4]], m[5], Number(m[6]));
  }
  // Pattern: 'leaves[*].orientation.lateralSpreadDeg.mean > N'
  m = cond.match(/^leaves\[\*\]\.orientation\.lateralSpreadDeg\.mean\s*([><=]+)\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const azis = sim.leaves.map(l => l.orientation.azimuthDeg);
    if (azis.length === 0) return false;
    const spread = Math.max(...azis) - Math.min(...azis);
    return cmp(spread, m[1], Number(m[2]));
  }
  // Pattern: 'trusses[*].stageDelta >= N'
  m = cond.match(/^trusses\[\*\]\.stageDelta\s*([><=]+)\s*(-?\d+)$/);
  if (m) {
    const op = m[1], n = Number(m[2]);
    return stageDeltas.some(sd => sd.target.startsWith('trusses') && cmp(sd.stageDelta, op, n));
  }
  m = cond.match(/^fruits\[\*\]\.stageDelta\s*([><=]+)\s*(-?\d+)$/);
  if (m) {
    const op = m[1], n = Number(m[2]);
    return stageDeltas.some(sd => sd.target.startsWith('fruits') && cmp(sd.stageDelta, op, n));
  }
  return false;  // unknown rule pattern — silently skip
}

function cmp(a: number, op: string, b: number): boolean {
  switch (op) {
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '==': return a === b;
    case '=': return a === b;
    default: return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────

function ensureDir(d: string): void { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  // Load reference bundle
  const bundle = JSON.parse(readFileSync(args.referenceBundle, 'utf8')) as {
    observations: PlantObservation[];
  };
  const refByDay = new Map<number, PlantObservation>();
  for (const obs of bundle.observations) refByDay.set(obs.day, obs);

  // Load diagnostic rules
  const rulesDir = join(ROOT, 'schema/diagnostic_rules');
  const rules = loadRulesIn(rulesDir);

  // Load metric tolerance
  const tolerance = loadMetricTolerance();

  // Walk simulation dir
  const simRoot = join(args.outRoot, args.experimentId, 'simulation', args.modelVersion);
  if (!existsSync(simRoot)) {
    process.stderr.write(`[error] simulation dir not found: ${simRoot}\n`);
    process.exit(1);
  }
  const cmpRoot = join(args.outRoot, args.experimentId, 'comparison', args.modelVersion);
  ensureDir(cmpRoot);

  let count = 0;
  let totalS = 0;
  let totalP = 0;
  const allDiagnoses: Array<{ day: number; plantId: string; ruleId: string; severity: string }> = [];

  for (const dayDir of readdirSync(simRoot).sort()) {
    const dayMatch = dayDir.match(/^day_(\d+)$/);
    if (!dayMatch) continue;
    const day = Number(dayMatch[1]);
    const ref = refByDay.get(day);
    if (!ref) {
      process.stdout.write(`  ⚠  day ${day}: no reference observation\n`);
      continue;
    }

    const dayPath = join(simRoot, dayDir);
    const outDayPath = join(cmpRoot, dayDir);
    ensureDir(outDayPath);

    for (const fn of readdirSync(dayPath)) {
      if (!fn.endsWith('.json')) continue;
      const sim = JSON.parse(readFileSync(join(dayPath, fn), 'utf8')) as PlantObservation;
      const cmp = comparePlant({
        reference: ref, simulation: sim,
        crop: 'tomato', cultivar: 'tomimaru-muchoo',
        rules, tolerance,
      });
      writeFileSync(join(outDayPath, `compare_${sim.plantId}_vs_reference.json`), JSON.stringify(cmp, null, 2));
      count++;
      totalS += cmp.summary.overallScore;
      totalP += cmp.summary.pBand;
      for (const d of cmp.diagnosis) {
        allDiagnoses.push({ day, plantId: sim.plantId, ruleId: d.ruleId, severity: d.severity });
      }
    }
  }

  const meanS = count > 0 ? totalS / count : 0;
  const meanP = count > 0 ? totalP / count : 0;

  // Summary file
  const summary = {
    experimentId: args.experimentId,
    modelVersion: args.modelVersion,
    comparisonCount: count,
    meanOverallScore: meanS,
    meanPBand: meanP,
    diagnosisCountByRuleId: countBy(allDiagnoses, d => d.ruleId),
    diagnosisCountBySeverity: countBy(allDiagnoses, d => d.severity),
    diagnosisByDay: groupByDay(allDiagnoses),
  };
  writeFileSync(join(cmpRoot, 'summary.json'), JSON.stringify(summary, null, 2));

  process.stdout.write(`\n[compare-real-vs-sim] ${count} comparisons → ${cmpRoot}\n`);
  process.stdout.write(`  S (mean overall score): ${meanS.toFixed(3)}\n`);
  process.stdout.write(`  P_band (mean):          ${meanP.toFixed(3)}\n`);
  process.stdout.write(`  diagnoses by ruleId:\n`);
  for (const [id, n] of Object.entries(summary.diagnosisCountByRuleId).sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`    ${id.padEnd(50)} ${n}\n`);
  }
}

function countBy<T>(arr: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) {
    const k = key(x);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function groupByDay(arr: Array<{ day: number; ruleId: string }>): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const x of arr) {
    const k = `day_${x.day.toString().padStart(3, '0')}`;
    if (!out[k]) out[k] = new Set();
    out[k].add(x.ruleId);
  }
  const ret: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(out)) ret[k] = [...v].sort();
  return ret;
}

main();
