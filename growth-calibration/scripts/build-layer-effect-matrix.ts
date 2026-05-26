// build-layer-effect-matrix — Iter 6k Phase E-1 (axis × metric marginal effect, read-only).
//
// 목적:
//   Iter 6k Round 1 wide sweep (81 runs)에서 각 axis (fruitSetRate, abortionThresholdRatio,
//   abortionLagDays, exponentScaling)가 각 lifecycle metric (flower_drop, starvation_aborted,
//   visible D60/D90, maxDiam D30/D33/D60/D90 등)에 미치는 marginal effect 정량 계산.
//
//   각 axis에 대해:
//     effect_on_metric[axis] =
//       mean(metric | axis=max) - mean(metric | axis=min)
//       (averaged over all other axes — marginal effect)
//
//   per-run plant_summary.csv 의 Iter 6i 신규 컬럼 직접 read
//   (flower_drop_count, starvation_aborted_count, pruning_aborted_count, etc.).
//
// Output:
//   docs/calibration-checkpoint-reports/v0.12-iter6k-layer-effect-matrix.md
//   docs/calibration-checkpoint-reports/v0.12-iter6k-layer-effect-matrix.json
//
// Usage:
//   npx vite-node growth-calibration/scripts/build-layer-effect-matrix.ts -- \
//     --sweepId iter6k_round1_wide \
//     --outDir docs/calibration-checkpoint-reports

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── CLI ───────────────────────────────────────────────────────────────

interface CliArgs {
  sweepId: string;
  sweepRoot: string;
  outDir: string;
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
    sweepId: opts.sweepId ?? 'iter6k_round1_wide',
    sweepRoot: opts.sweepRoot ?? join(__dirname, '..', 'sweeps'),
    outDir: opts.outDir ?? join(__dirname, '..', '..', 'docs', 'calibration-checkpoint-reports'),
  };
}

// ── Types ─────────────────────────────────────────────────────────────

interface Variant {
  fruitSetRate?: number;
  abortionThresholdRatio?: number;
  abortionLagDays?: number;
  exponentScaling?: number;
  inflectionC?: number;
  rateB?: number;
}

interface RunMetrics {
  runId: string;
  variant: Variant;
  // from plant_summary.csv day=100
  flowerDrop: number;
  starvationAborted: number;
  pruningAborted: number;
  unknownAborted: number;
  fertilizedAlive: number;
  fertilizedTotal: number;
  // from sweep_summary (day snapshots)
  d30MaxDiam: number;
  d33MaxDiam: number;
  d60MaxDiam: number;
  d90MaxDiam: number;
  d60Visible: number;
  d90Visible: number;
  d60Cohort: number;
  d90Cohort: number;
  // hard gate
  hardGatePass: boolean;
}

// ── Loaders ───────────────────────────────────────────────────────────

function loadPlantSummary(runDir: string): Record<string, number> {
  const csvPath = join(runDir, 'plant_summary.csv');
  if (!existsSync(csvPath)) return {};
  const text = readFileSync(csvPath, 'utf-8');
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return {};
  const header = lines[0].split(',');
  // find day=100 row
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row[0] === '100') {
      const out: Record<string, number> = {};
      for (let j = 0; j < header.length; j++) {
        const n = Number(row[j]);
        if (Number.isFinite(n)) out[header[j]] = n;
      }
      return out;
    }
  }
  return {};
}

function buildRunMetrics(sweepRoot: string, sweepId: string): RunMetrics[] {
  const sweepDir = join(sweepRoot, sweepId);
  const summaryPath = join(sweepDir, 'sweep_summary.json');
  const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
  const rankings = summary.rankings ?? [];
  const out: RunMetrics[] = [];
  for (const r of rankings) {
    const runDir = join(sweepDir, r.runId);
    const ps = loadPlantSummary(runDir);
    const d30MaxDiam = r.day30?.maxVisDiam ?? 0;
    const d33MaxDiam = r.day33?.maxVisDiam ?? 0;
    const d60MaxDiam = r.day60?.maxDiam ?? 0;
    const d90MaxDiam = r.day90?.maxDiam ?? 0;
    const hardGatePass =
      d30MaxDiam <= 3 && d33MaxDiam <= 3 &&
      d60MaxDiam >= 18 && d60MaxDiam <= 36 &&
      d90MaxDiam >= 40 && d90MaxDiam <= 75 &&
      (ps['unknown_aborted_count'] ?? 0) === 0;
    out.push({
      runId: r.runId,
      variant: r.variant,
      flowerDrop: ps['flower_drop_count'] ?? 0,
      starvationAborted: ps['starvation_aborted_count'] ?? 0,
      pruningAborted: ps['pruning_aborted_count'] ?? 0,
      unknownAborted: ps['unknown_aborted_count'] ?? 0,
      fertilizedAlive: ps['fertilized_alive_count'] ?? 0,
      fertilizedTotal: ps['fertilized_total_count'] ?? 0,
      d30MaxDiam, d33MaxDiam, d60MaxDiam, d90MaxDiam,
      d60Visible: r.day60?.visibleCount ?? 0,
      d90Visible: r.day90?.visibleCount ?? 0,
      d60Cohort: r.day60?.cohortCount ?? 0,
      d90Cohort: r.day90?.cohortCount ?? 0,
      hardGatePass,
    });
  }
  return out;
}

// ── Marginal effect calculation ──────────────────────────────────────

type AxisKey = 'fruitSetRate' | 'abortionThresholdRatio' | 'abortionLagDays' | 'exponentScaling';
type MetricKey =
  | 'flowerDrop' | 'starvationAborted' | 'pruningAborted'
  | 'fertilizedAlive' | 'fertilizedTotal'
  | 'd30MaxDiam' | 'd33MaxDiam' | 'd60MaxDiam' | 'd90MaxDiam'
  | 'd60Visible' | 'd90Visible' | 'd60Cohort' | 'd90Cohort';

const AXES: AxisKey[] = ['fruitSetRate', 'abortionThresholdRatio', 'abortionLagDays', 'exponentScaling'];
const METRICS: { key: MetricKey; label: string; primaryAxes?: AxisKey[] }[] = [
  { key: 'flowerDrop', label: 'flower_drop', primaryAxes: ['fruitSetRate'] },
  { key: 'starvationAborted', label: 'starvation_aborted', primaryAxes: ['abortionThresholdRatio', 'abortionLagDays'] },
  { key: 'pruningAborted', label: 'pruning_aborted' },
  { key: 'fertilizedAlive', label: 'fertilized_alive' },
  { key: 'fertilizedTotal', label: 'fertilized_total' },
  { key: 'd30MaxDiam', label: 'D30_maxDiam' },
  { key: 'd33MaxDiam', label: 'D33_maxDiam' },
  { key: 'd60MaxDiam', label: 'D60_maxDiam', primaryAxes: ['exponentScaling'] },
  { key: 'd90MaxDiam', label: 'D90_maxDiam' },
  { key: 'd60Visible', label: 'D60_visible' },
  { key: 'd90Visible', label: 'D90_visible' },
  { key: 'd60Cohort', label: 'D60_cohort' },
  { key: 'd90Cohort', label: 'D90_cohort' },
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => (a as number) - (b as number));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, x) => s + x, 0) / values.length;
}

function marginalEffect(runs: RunMetrics[], axis: AxisKey, metric: MetricKey): {
  values: number[];
  byAxisValue: Record<string, number>;
  range: number;
  trend: '↑' | '↓' | '·';
} {
  const axisValues = unique(runs.map(r => (r.variant[axis] as number)).filter(v => Number.isFinite(v)));
  const byAxisValue: Record<string, number> = {};
  for (const v of axisValues) {
    const subset = runs.filter(r => r.variant[axis] === v);
    byAxisValue[String(v)] = mean(subset.map(r => r[metric]));
  }
  const valArr = axisValues.map(v => byAxisValue[String(v)]);
  const range = Math.max(...valArr) - Math.min(...valArr);
  const trend = (() => {
    if (Math.abs(range) < 0.05) return '·' as const;
    const last = byAxisValue[String(axisValues[axisValues.length - 1])];
    const first = byAxisValue[String(axisValues[0])];
    return last > first ? '↑' as const : '↓' as const;
  })();
  return { values: valArr, byAxisValue, range, trend };
}

// ── Markdown render ──────────────────────────────────────────────────

function fmt(n: number, prec = 2): string {
  if (!Number.isFinite(n)) return '-';
  return Math.abs(n) < 0.01 ? '0' : n.toFixed(prec);
}

function buildMarkdown(runs: RunMetrics[], sweepId: string): string {
  const lines: string[] = [];
  lines.push(`# Iter 6k Layer Effect Matrix (산출물 #2 ⭐) — \`${sweepId}\``);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString().split('T')[0]}`);
  lines.push(`Sweep: ${sweepId}, ${runs.length} runs`);
  lines.push(`Hard gate pass: ${runs.filter(r => r.hardGatePass).length}/${runs.length}`);
  lines.push('');
  lines.push('> Iter 6i dropReason 분리 인프라가 가능하게 한 wide sweep 결과 분석.');
  lines.push('> 각 axis 의 marginal effect = mean(metric | axis=max) − mean(metric | axis=min),');
  lines.push('> 다른 3 axes 27 runs 평균. 예상 primary effect는 PRIMARY 표시.');
  lines.push('');

  // 1. Hard gate pass distribution per axis value
  lines.push('## 1. Hard Gate Pass Distribution');
  lines.push('');
  for (const axis of AXES) {
    const axisValues = unique(runs.map(r => (r.variant[axis] as number)).filter(v => Number.isFinite(v)));
    const stats = axisValues.map(v => {
      const subset = runs.filter(r => r.variant[axis] === v);
      const pass = subset.filter(r => r.hardGatePass).length;
      return { v, pass, total: subset.length, pct: (pass / subset.length * 100).toFixed(0) };
    });
    lines.push(`**${axis}**: ` + stats.map(s => `${s.v}→${s.pass}/${s.total}(${s.pct}%)`).join(', '));
  }
  lines.push('');

  // 2. Marginal effect matrix
  lines.push('## 2. Marginal Effect Matrix (axis → metric)');
  lines.push('');
  lines.push('각 셀: `trend axis_min→axis_max (Δ)` 형태. trend ↑/↓/· (no change).');
  lines.push('');
  // Header
  const metricHeaders = METRICS.map(m => m.label).join(' | ');
  lines.push(`| Axis (min→max) | ${metricHeaders} |`);
  lines.push(`|---|${METRICS.map(() => '---').join('|')}|`);
  for (const axis of AXES) {
    const axisValues = unique(runs.map(r => (r.variant[axis] as number)).filter(v => Number.isFinite(v)));
    const minV = axisValues[0];
    const maxV = axisValues[axisValues.length - 1];
    const row: string[] = [`**${axis}** (${minV}→${maxV})`];
    for (const m of METRICS) {
      const eff = marginalEffect(runs, axis, m.key);
      const primary = m.primaryAxes?.includes(axis);
      const mark = primary ? '⭐' : '';
      const minVal = eff.byAxisValue[String(minV)];
      const maxVal = eff.byAxisValue[String(maxV)];
      const delta = maxVal - minVal;
      row.push(`${eff.trend} ${fmt(minVal)}→${fmt(maxVal)} (${delta >= 0 ? '+' : ''}${fmt(delta)})${mark}`);
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');

  // 3. Detailed per-axis sweep table
  lines.push('## 3. Per-Axis Sweep Detail (mean across 27 runs at each axis value)');
  lines.push('');
  for (const axis of AXES) {
    const axisValues = unique(runs.map(r => (r.variant[axis] as number)).filter(v => Number.isFinite(v)));
    lines.push(`### ${axis}`);
    lines.push('');
    lines.push(`| ${axis} value | ${METRICS.map(m => m.label).join(' | ')} | hard_gate% |`);
    lines.push(`|---|${METRICS.map(() => '---:').join('|')}|---:|`);
    for (const v of axisValues) {
      const subset = runs.filter(r => r.variant[axis] === v);
      const cells: string[] = [`${v}`];
      for (const m of METRICS) cells.push(fmt(mean(subset.map(r => r[m.key]))));
      const pass = subset.filter(r => r.hardGatePass).length;
      cells.push(`${(pass / subset.length * 100).toFixed(0)}%`);
      lines.push(`| ${cells.join(' | ')} |`);
    }
    lines.push('');
  }

  // 4. Cross-contamination check (Iter 6i invariant)
  lines.push('## 4. Iter 6i Invariant Check (pruning_aborted, unknown_aborted)');
  lines.push('');
  const allUnknownZero = runs.every(r => r.unknownAborted === 0);
  lines.push(`- unknown_aborted_count == 0 모든 run: ${allUnknownZero ? '✓ PASS' : '✗ FAIL'}`);
  // pruning variation per fruitSetRate
  const pruningByFruitSet: Record<string, number[]> = {};
  for (const r of runs) {
    const key = String(r.variant.fruitSetRate ?? '?');
    if (!pruningByFruitSet[key]) pruningByFruitSet[key] = [];
    pruningByFruitSet[key].push(r.pruningAborted);
  }
  lines.push('');
  lines.push('pruning_aborted_count by fruitSetRate (사용자 검토 #4 — stage timing 영향 분리):');
  for (const [k, vals] of Object.entries(pruningByFruitSet)) {
    const m = mean(vals);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    lines.push(`- fruitSetRate=${k}: mean=${fmt(m)}, min=${min}, max=${max} (n=${vals.length})`);
  }
  lines.push('');

  // 5. Recommended axis interpretation
  lines.push('## 5. Recommended Axis Interpretation');
  lines.push('');
  for (const axis of AXES) {
    const flowerDropEff = marginalEffect(runs, axis, 'flowerDrop');
    const starveEff = marginalEffect(runs, axis, 'starvationAborted');
    const d33Eff = marginalEffect(runs, axis, 'd33MaxDiam');
    const d60Eff = marginalEffect(runs, axis, 'd60MaxDiam');
    const d90VisEff = marginalEffect(runs, axis, 'd90Visible');
    lines.push(`### ${axis}`);
    lines.push(`- flower_drop: ${flowerDropEff.trend} ${fmt(flowerDropEff.range)}`);
    lines.push(`- starvation_aborted: ${starveEff.trend} ${fmt(starveEff.range)}`);
    lines.push(`- D33 maxDiam (fruit_too_early risk): ${d33Eff.trend} ${fmt(d33Eff.range)}`);
    lines.push(`- D60 maxDiam: ${d60Eff.trend} ${fmt(d60Eff.range)}`);
    lines.push(`- D90 visible: ${d90VisEff.trend} ${fmt(d90VisEff.range)}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[build-layer-effect-matrix] sweepId=${args.sweepId}`);
  const runs = buildRunMetrics(args.sweepRoot, args.sweepId);
  console.log(`  loaded ${runs.length} runs`);
  console.log(`  hard gate pass: ${runs.filter(r => r.hardGatePass).length}`);

  const md = buildMarkdown(runs, args.sweepId);
  const mdPath = join(args.outDir, 'v0.12-iter6k-layer-effect-matrix.md');
  writeFileSync(mdPath, md);
  console.log(`  → ${mdPath}`);

  // Also export json with full run-by-run data for tradeoff_map + Round 2 selection
  const jsonPath = join(args.outDir, 'v0.12-iter6k-layer-effect-matrix.json');
  writeFileSync(jsonPath, JSON.stringify({
    sweepId: args.sweepId,
    generatedAt: new Date().toISOString(),
    runs,
    marginalEffects: AXES.reduce((acc, axis) => {
      acc[axis] = METRICS.reduce((mAcc, m) => {
        mAcc[m.label] = marginalEffect(runs, axis, m.key);
        return mAcc;
      }, {} as Record<string, unknown>);
      return acc;
    }, {} as Record<string, unknown>),
  }, null, 2));
  console.log(`  → ${jsonPath}`);
}

main();
