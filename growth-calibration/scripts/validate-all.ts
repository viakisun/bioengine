// validate-all — run schema validator across the calibration platform.
//
// Targets:
//   - Reference Pack manifest + 8 files
//   - 3 cross-crop examples (paprika / strawberry / lettuce)
//   - Any *.json under growth-calibration/experiments/.../observations/
//
// Usage:  npx tsx growth-calibration/scripts/validate-all.ts
//
// Exits 0 on all-valid, 1 on any error.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validateAny, validateReferenceManifest, validatePlantObservation } from '../schema/validate';

const ROOT = join(__dirname, '..');
const REPO_ROOT = join(ROOT, '..');

interface FileReport {
  file: string;
  schemaType: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  issues: Array<{ path: string; message: string; severity: 'error' | 'warning' }>;
}

const reports: FileReport[] = [];

function pushReport(absPath: string, kind: 'manifest' | 'observation' | 'any'): void {
  const rel = relative(REPO_ROOT, absPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch (e) {
    reports.push({
      file: rel, schemaType: 'parse_error', valid: false, errorCount: 1, warningCount: 0,
      issues: [{ path: '$', message: `JSON parse failed: ${(e as Error).message}`, severity: 'error' }],
    });
    return;
  }
  let result;
  if (kind === 'manifest') result = { type: 'ReferenceManifest', result: validateReferenceManifest(parsed) };
  else if (kind === 'observation') result = { type: 'PlantObservation', result: validatePlantObservation(parsed) };
  else result = validateAny(parsed);

  const r = result.result;
  reports.push({
    file: rel,
    schemaType: r.schemaType,
    valid: r.valid,
    errorCount: r.issues.filter(i => i.severity === 'error').length,
    warningCount: r.issues.filter(i => i.severity === 'warning').length,
    issues: r.issues,
  });
}

// ── Reference Pack manifest + 8 files ─────────────────────────────────
const refPack = join(ROOT, 'reference/tomato/tomato_tomimaru_reference_v0.1');
pushReport(join(refPack, '00_reference_manifest.json'), 'manifest');

// JSON sub-files (06, 07, 08) — schemaVersion=growthReference.v0.1 but NOT
// ReferenceManifest. They have their own structure (day33, growth model
// target, gdd mapping). We just JSON-parse them; full schema in v0.2.
for (const fn of ['06_day33_diagnostic_target.json', '07_initial_growth_model_target.json', '08_day_gdd_mapping.json']) {
  const fp = join(refPack, fn);
  try {
    const data = JSON.parse(readFileSync(fp, 'utf8'));
    const sv = (data as { schemaVersion?: unknown }).schemaVersion;
    reports.push({
      file: relative(REPO_ROOT, fp),
      schemaType: 'growthReference.v0.1 sub-file',
      valid: sv === 'growthReference.v0.1',
      errorCount: sv === 'growthReference.v0.1' ? 0 : 1,
      warningCount: 0,
      issues: sv === 'growthReference.v0.1'
        ? []
        : [{ path: '$.schemaVersion', message: `expected 'growthReference.v0.1', got '${String(sv)}'`, severity: 'error' }],
    });
  } catch (e) {
    reports.push({
      file: relative(REPO_ROOT, fp), schemaType: 'parse_error', valid: false,
      errorCount: 1, warningCount: 0,
      issues: [{ path: '$', message: `JSON parse failed: ${(e as Error).message}`, severity: 'error' }],
    });
  }
}

// ── Cross-crop examples (3) ───────────────────────────────────────────
for (const crop of ['paprika', 'strawberry', 'lettuce']) {
  const p = join(ROOT, `reference/${crop}/example.json`);
  if (existsSync(p)) pushReport(p, 'observation');
}

// ── Experiment observations (recursive *.json) ────────────────────────
const experimentsDir = join(ROOT, 'experiments');
function walk(d: string): void {
  if (!existsSync(d)) return;
  for (const entry of readdirSync(d)) {
    const fp = join(d, entry);
    const st = statSync(fp);
    if (st.isDirectory()) walk(fp);
    else if (entry.endsWith('.json')) pushReport(fp, 'any');
  }
}
walk(experimentsDir);

// ── Report ────────────────────────────────────────────────────────────
const okCount = reports.filter(r => r.valid).length;
const failCount = reports.filter(r => !r.valid).length;

process.stdout.write(`\n[validate-all] ${reports.length} files checked\n`);
for (const r of reports) {
  const mark = r.valid ? '✓' : '✗';
  const flags = `${r.errorCount}E ${r.warningCount}W`.padEnd(8);
  process.stdout.write(`  ${mark}  ${flags}  [${r.schemaType.padEnd(28)}]  ${r.file}\n`);
  if (!r.valid) {
    for (const i of r.issues.filter(i => i.severity === 'error')) {
      process.stdout.write(`        └─ ${i.path}: ${i.message}\n`);
    }
  } else if (r.warningCount > 0) {
    for (const i of r.issues.filter(i => i.severity === 'warning')) {
      process.stdout.write(`        ⚠  ${i.path}: ${i.message}\n`);
    }
  }
}

process.stdout.write(`\n[summary] valid=${okCount}  invalid=${failCount}\n`);
process.exit(failCount === 0 ? 0 : 1);
