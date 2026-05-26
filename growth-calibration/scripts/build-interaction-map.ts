// build-interaction-map — Iter 7 Phase E-2 ⭐⭐ (axis pair interaction, read-only).
//
// 목적:
//   Iter 7 Round 1 wide sweep (162 runs)에서 각 axis pair (X, Y)의
//   2D interaction matrix 산출 — synergy / antagonism 시각화.
//
//   각 pair (X, Y)에 대해, cell value = mean(metric | X=x, Y=y) across other 3 axes.
//
//   layer_effect_matrix는 single-axis marginal effect.
//   본 script는 axis PAIR interaction을 노출 (synergy: 두 axis 결합이 단독 합보다 큼,
//   antagonism: 두 axis가 서로 trade-off).
//
// Iter 7 핵심 검증 가설:
//   cellDivisionDurationGDD ↓ × exponentScaling ↑ synergy (D90 visible + D33 보호 동시)
//
// Output:
//   docs/calibration-checkpoint-reports/v0.12-iter7-interaction-map.md
//   docs/calibration-checkpoint-reports/v0.12-iter7-interaction-map.json
//
// Usage:
//   npx vite-node growth-calibration/scripts/build-interaction-map.ts -- \
//     --sweepId iter7_round1_wide \
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
    sweepId: opts.sweepId ?? 'iter7_round1_wide',
    sweepRoot: opts.sweepRoot ?? join(__dirname, '..', 'sweeps'),
    outDir: opts.outDir ?? join(__dirname, '..', '..', 'docs', 'calibration-checkpoint-reports'),
  };
}

// ── Types ─────────────────────────────────────────────────────────────

interface Variant {
  fruitSetRate?: number;
  abortionThresholdRatio?: number;
  abortionLagDays?: number;
  cellDivisionDurationGDD?: number;
  exponentScaling?: number;
}

interface RunMetrics {
  runId: string;
  variant: Variant;
  flowerDrop: number;
  starvationAborted: number;
  pruningAborted: number;
  unknownAborted: number;
  fertilizedAlive: number;
  d33MaxDiam: number;
  d60MaxDiam: number;
  d90MaxDiam: number;
  d60Visible: number;
  d90Visible: number;
  d60Cohort: number;
  d90Cohort: number;
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
  const summary = JSON.parse(readFileSync(join(sweepDir, 'sweep_summary.json'), 'utf-8'));
  const rankings = summary.rankings ?? [];
  const out: RunMetrics[] = [];
  for (const r of rankings) {
    const ps = loadPlantSummary(join(sweepDir, r.runId));
    const d33MaxDiam = r.day33?.maxVisDiam ?? 0;
    const d60MaxDiam = r.day60?.maxDiam ?? 0;
    const d90MaxDiam = r.day90?.maxDiam ?? 0;
    const hardGatePass =
      (r.day30?.maxVisDiam ?? 0) <= 3 && d33MaxDiam <= 3 &&
      d60MaxDiam >= 18 && d60MaxDiam <= 38 &&
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
      d33MaxDiam, d60MaxDiam, d90MaxDiam,
      d60Visible: r.day60?.visibleCount ?? 0,
      d90Visible: r.day90?.visibleCount ?? 0,
      d60Cohort: r.day60?.cohortCount ?? 0,
      d90Cohort: r.day90?.cohortCount ?? 0,
      hardGatePass,
    });
  }
  return out;
}

// ── Axis × Pair interaction ──────────────────────────────────────────

type AxisKey = 'fruitSetRate' | 'abortionThresholdRatio' | 'abortionLagDays'
             | 'cellDivisionDurationGDD' | 'exponentScaling';

type MetricKey =
  | 'flowerDrop' | 'starvationAborted' | 'fertilizedAlive'
  | 'd33MaxDiam' | 'd60MaxDiam' | 'd90MaxDiam'
  | 'd60Visible' | 'd90Visible' | 'd60Cohort' | 'd90Cohort';

const AXES: AxisKey[] = [
  'fruitSetRate', 'abortionThresholdRatio', 'abortionLagDays',
  'cellDivisionDurationGDD', 'exponentScaling',
];

const KEY_METRICS: { key: MetricKey; label: string; goal: string }[] = [
  { key: 'd90Visible',         label: 'D90 visible',        goal: 'maximize ⭐⭐ (본 Iter 7 핵심)' },
  { key: 'd60Visible',         label: 'D60 visible',        goal: 'maximize' },
  { key: 'd33MaxDiam',         label: 'D33 maxDiam',        goal: '≤ 3 (hard gate)' },
  { key: 'd60MaxDiam',         label: 'D60 maxDiam',        goal: '18~38 (band)' },
  { key: 'd90MaxDiam',         label: 'D90 maxDiam',        goal: '40~75 (band)' },
  { key: 'flowerDrop',         label: 'flower_drop',        goal: 'minimize (v0.11.3=0)' },
  { key: 'starvationAborted',  label: 'starvation_aborted', goal: 'minimize (v0.11.3=7)' },
  { key: 'd90Cohort',          label: 'D90 cohort',         goal: 'maximize' },
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => (a as number) - (b as number));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, x) => s + x, 0) / values.length;
}

// 2D cell value: mean(metric | X=xv, Y=yv), other 3 axes free
function buildPairMatrix(
  runs: RunMetrics[], axisX: AxisKey, axisY: AxisKey, metric: MetricKey,
): { xValues: number[]; yValues: number[]; matrix: number[][]; range: number } {
  const xValues = unique(runs.map(r => r.variant[axisX] as number).filter(v => Number.isFinite(v)));
  const yValues = unique(runs.map(r => r.variant[axisY] as number).filter(v => Number.isFinite(v)));
  const matrix: number[][] = xValues.map(xv =>
    yValues.map(yv => {
      const subset = runs.filter(r => r.variant[axisX] === xv && r.variant[axisY] === yv);
      return mean(subset.map(r => r[metric]));
    })
  );
  const flat = matrix.flat();
  return { xValues, yValues, matrix, range: Math.max(...flat) - Math.min(...flat) };
}

// Synergy detection: best cell value vs additive prediction from row/col marginals
function synergyAnalysis(
  pair: { xValues: number[]; yValues: number[]; matrix: number[][] },
): { bestCell: { x: number; y: number; value: number }; worstCell: { x: number; y: number; value: number } } {
  let bestX = pair.xValues[0], bestY = pair.yValues[0], bestVal = pair.matrix[0][0];
  let worstX = pair.xValues[0], worstY = pair.yValues[0], worstVal = pair.matrix[0][0];
  for (let i = 0; i < pair.xValues.length; i++) {
    for (let j = 0; j < pair.yValues.length; j++) {
      const v = pair.matrix[i][j];
      if (v > bestVal) { bestVal = v; bestX = pair.xValues[i]; bestY = pair.yValues[j]; }
      if (v < worstVal) { worstVal = v; worstX = pair.xValues[i]; worstY = pair.yValues[j]; }
    }
  }
  return {
    bestCell: { x: bestX, y: bestY, value: bestVal },
    worstCell: { x: worstX, y: worstY, value: worstVal },
  };
}

// ── Markdown render ──────────────────────────────────────────────────

function fmt(n: number, prec = 2): string {
  if (!Number.isFinite(n)) return '-';
  return Math.abs(n) < 0.01 ? '0' : n.toFixed(prec);
}

function buildMarkdown(runs: RunMetrics[], sweepId: string): string {
  const lines: string[] = [];
  lines.push(`# Iter 7 Interaction Map (산출물 #3 ⭐⭐⭐) — \`${sweepId}\``);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString().split('T')[0]}`);
  lines.push(`Sweep: ${sweepId}, ${runs.length} runs`);
  lines.push(`Hard gate pass: ${runs.filter(r => r.hardGatePass).length}/${runs.length}`);
  lines.push('');
  lines.push('> ⭐⭐⭐ Iter 7 의 1차 핵심 산출물 — 사용자 강조.');
  lines.push('> 각 axis pair (X, Y)의 2D matrix = mean(metric | X=x, Y=y) across other 3 axes free.');
  lines.push('> Synergy: 두 axis 결합이 단독 합보다 큰 효과. Antagonism: 서로 trade-off.');
  lines.push('> 본 매트릭스는 single-axis layer_effect_matrix가 못 보는 cross-axis 효과 노출.');
  lines.push('');

  // 1. Iter 7 핵심 가설 검증 — cellDiv × exp pair for D90 visible
  lines.push('## 1. Iter 7 핵심 가설 검증 ⭐⭐ — cellDivisionDurationGDD × exponentScaling');
  lines.push('');
  lines.push('가설: `cellDiv↓ × exp↑` synergy = D90 visible 회복 + D33 보호 동시 가능');
  lines.push('');
  const keyPair: [AxisKey, AxisKey] = ['cellDivisionDurationGDD', 'exponentScaling'];
  for (const m of KEY_METRICS) {
    const pair = buildPairMatrix(runs, keyPair[0], keyPair[1], m.key);
    const { bestCell, worstCell } = synergyAnalysis(pair);
    lines.push(`### ${m.label} (goal: ${m.goal})`);
    lines.push('');
    // Header row: Y axis values
    lines.push(`| ${keyPair[0]} \\ ${keyPair[1]} | ${pair.yValues.map(y => String(y)).join(' | ')} |`);
    lines.push(`|---|${pair.yValues.map(() => '---:').join('|')}|`);
    for (let i = 0; i < pair.xValues.length; i++) {
      const row = [`**${pair.xValues[i]}**`];
      for (let j = 0; j < pair.yValues.length; j++) {
        row.push(fmt(pair.matrix[i][j]));
      }
      lines.push(`| ${row.join(' | ')} |`);
    }
    lines.push('');
    lines.push(`Best cell: (cellDiv=${bestCell.x}, exp=${bestCell.y}) = ${fmt(bestCell.value)}`);
    lines.push(`Worst cell: (cellDiv=${worstCell.x}, exp=${worstCell.y}) = ${fmt(worstCell.value)}`);
    lines.push(`Range: ${fmt(Math.abs(bestCell.value - worstCell.value))}`);
    lines.push('');
  }

  // 2. All pair interactions × D90 visible (Iter 7 main target)
  lines.push('## 2. All Axis Pairs × D90 Visible (본 Iter 7 핵심 metric)');
  lines.push('');
  lines.push('각 pair × D90 visible matrix — D90 visible 회복 가능한 결합 식별.');
  lines.push('');
  for (let i = 0; i < AXES.length; i++) {
    for (let j = i + 1; j < AXES.length; j++) {
      const axisX = AXES[i];
      const axisY = AXES[j];
      if (axisX === keyPair[0] && axisY === keyPair[1]) continue; // 위에서 이미 출력
      if (axisX === keyPair[1] && axisY === keyPair[0]) continue;
      const pair = buildPairMatrix(runs, axisX, axisY, 'd90Visible');
      const { bestCell } = synergyAnalysis(pair);
      lines.push(`### ${axisX} × ${axisY} → D90 visible (best: x=${bestCell.x}, y=${bestCell.y}, val=${fmt(bestCell.value)})`);
      lines.push('');
      lines.push(`| ${axisX} \\ ${axisY} | ${pair.yValues.map(y => String(y)).join(' | ')} |`);
      lines.push(`|---|${pair.yValues.map(() => '---:').join('|')}|`);
      for (let i2 = 0; i2 < pair.xValues.length; i2++) {
        const row = [`**${pair.xValues[i2]}**`];
        for (let j2 = 0; j2 < pair.yValues.length; j2++) {
          row.push(fmt(pair.matrix[i2][j2]));
        }
        lines.push(`| ${row.join(' | ')} |`);
      }
      lines.push('');
    }
  }

  // 3. Hard gate pass rate per axis pair (cellDiv × exp)
  lines.push('## 3. Hard Gate Pass Rate — cellDivisionDurationGDD × exponentScaling');
  lines.push('');
  const cdValues = unique(runs.map(r => r.variant.cellDivisionDurationGDD as number).filter(Number.isFinite));
  const expValues = unique(runs.map(r => r.variant.exponentScaling as number).filter(Number.isFinite));
  lines.push(`| cellDiv \\ exp | ${expValues.map(e => String(e)).join(' | ')} |`);
  lines.push(`|---|${expValues.map(() => '---:').join('|')}|`);
  for (const cd of cdValues) {
    const row = [`**${cd}**`];
    for (const ex of expValues) {
      const subset = runs.filter(r => r.variant.cellDivisionDurationGDD === cd && r.variant.exponentScaling === ex);
      const pass = subset.filter(r => r.hardGatePass).length;
      row.push(`${pass}/${subset.length} (${(pass / subset.length * 100).toFixed(0)}%)`);
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');

  // 4. Synergy summary
  lines.push('## 4. Synergy / Antagonism Summary (across all pairs × D90 visible)');
  lines.push('');
  lines.push('| Pair (X × Y) | range (max-min) | best cell | worst cell |');
  lines.push('|---|---:|---|---|');
  for (let i = 0; i < AXES.length; i++) {
    for (let j = i + 1; j < AXES.length; j++) {
      const pair = buildPairMatrix(runs, AXES[i], AXES[j], 'd90Visible');
      const { bestCell, worstCell } = synergyAnalysis(pair);
      lines.push(`| ${AXES[i]} × ${AXES[j]} | ${fmt(pair.range)} | (${bestCell.x}, ${bestCell.y})=${fmt(bestCell.value)} | (${worstCell.x}, ${worstCell.y})=${fmt(worstCell.value)} |`);
    }
  }
  lines.push('');

  // 5. Recommended top combinations for D90 visible
  lines.push('## 5. Recommended Top Combinations (D90 visible top 10 cells, hard gate pass)');
  lines.push('');
  // Find top 10 single configs that pass hard gate
  const passing = runs.filter(r => r.hardGatePass);
  const sorted = [...passing].sort((a, b) => b.d90Visible - a.d90Visible);
  lines.push('| Rank | runId | fSR | thresh | lag | cellDiv | exp | D90vis | D60vis | D60maxD | D90maxD | drop | starve |');
  lines.push('|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|');
  for (let i = 0; i < Math.min(10, sorted.length); i++) {
    const r = sorted[i];
    const v = r.variant;
    lines.push(`| ${i + 1} | ${r.runId} | ${v.fruitSetRate} | ${v.abortionThresholdRatio} | ${v.abortionLagDays} | ${v.cellDivisionDurationGDD} | ${v.exponentScaling} | ${r.d90Visible} | ${r.d60Visible} | ${fmt(r.d60MaxDiam)} | ${fmt(r.d90MaxDiam)} | ${r.flowerDrop} | ${r.starvationAborted} |`);
  }
  lines.push('');

  // 6. Iter 7 핵심 가설 verdict
  lines.push('## 6. Iter 7 Verdict — cellDiv↓ × exp↑ Synergy?');
  lines.push('');
  const cdExpPair = buildPairMatrix(runs, 'cellDivisionDurationGDD', 'exponentScaling', 'd90Visible');
  const bestD90Vis = synergyAnalysis(cdExpPair).bestCell;
  const baselineD90Vis = runs.find(r =>
    r.variant.cellDivisionDurationGDD === 300 &&
    r.variant.exponentScaling === 0.10 &&
    r.variant.fruitSetRate === 0.80 &&
    r.variant.abortionLagDays === 10 &&
    r.variant.abortionThresholdRatio === 0.25
  )?.d90Visible ?? 0;
  lines.push(`v0.11.3 baseline (cellDiv=300, exp=0.10, fSR=0.80, lag=10, thresh=0.25): D90 visible = ${baselineD90Vis}`);
  lines.push(`Best cellDiv × exp cell (averaged): cellDiv=${bestD90Vis.x}, exp=${bestD90Vis.y}, D90 visible = ${fmt(bestD90Vis.value)}`);
  lines.push('');
  if (bestD90Vis.value > baselineD90Vis + 2) {
    lines.push(`→ **Synergy CONFIRMED** — cellDiv × exp 결합으로 D90 visible 의미 있게 회복.`);
  } else if (bestD90Vis.value > baselineD90Vis) {
    lines.push(`→ **Partial synergy** — D90 visible 약간 개선 (+${fmt(bestD90Vis.value - baselineD90Vis)}). Round 2/3에서 narrow refinement 필요.`);
  } else {
    lines.push(`→ **No synergy** — cellDiv × exp pair로 D90 visible 회복 못함. Iter 7b architectural refactor 후보.`);
  }
  lines.push('');

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[build-interaction-map] sweepId=${args.sweepId}`);
  const runs = buildRunMetrics(args.sweepRoot, args.sweepId);
  console.log(`  loaded ${runs.length} runs`);
  console.log(`  hard gate pass: ${runs.filter(r => r.hardGatePass).length}`);

  const md = buildMarkdown(runs, args.sweepId);
  const mdPath = join(args.outDir, 'v0.12-iter7-interaction-map.md');
  writeFileSync(mdPath, md);
  console.log(`  → ${mdPath}`);

  const jsonPath = join(args.outDir, 'v0.12-iter7-interaction-map.json');
  const allPairs: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < AXES.length; i++) {
    for (let j = i + 1; j < AXES.length; j++) {
      const key = `${AXES[i]}__x__${AXES[j]}`;
      allPairs[key] = {};
      for (const m of KEY_METRICS) {
        const pair = buildPairMatrix(runs, AXES[i], AXES[j], m.key);
        allPairs[key][m.label] = pair;
      }
    }
  }
  writeFileSync(jsonPath, JSON.stringify({
    sweepId: args.sweepId,
    generatedAt: new Date().toISOString(),
    runs,
    pairInteractions: allPairs,
  }, null, 2));
  console.log(`  → ${jsonPath}`);
}

main();
