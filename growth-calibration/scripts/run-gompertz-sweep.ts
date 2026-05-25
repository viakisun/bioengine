// run-gompertz-sweep — Iter 6 Gompertz curve calibration sweep harness.
//
// Iter 5b가 architectural fix는 성공했으나 Day 30/33 fruit 28.4mm vs target
// 0~2mm 남음. 본 script는 Gompertz 3 parameters (inflectionC × rateB ×
// exponentScaling) 를 grid sweep해서 Day 30/33/60/90 fruit size를 target
// timeline에 맞춤.
//
// Architecture (사용자 검토 #3):
//   각 run을 독립 child process로 실행 (in-process mutation 위험 방지).
//   sweep script → spawn vite-node dump-growth-checkpoints --overrideGompertz=...
//                → child가 ACTIVE_BOTANICAL + CULTIVARS mutate 후 dump 생성
//                → sweep script가 결과 read + ranking
//
// Usage:
//   npx vite-node growth-calibration/scripts/run-gompertz-sweep.ts -- \
//     --sweepId iter6_gompertz_sweep_1 \
//     --inflectionC 0.55,0.60,0.65,0.70 \
//     --rateB 0.04,0.05,0.06,0.07 \
//     --exponentScaling 0.010 \
//     --seed 20260525 \
//     --days 30,33,60,90

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── CLI ───────────────────────────────────────────────────────────────

interface CliArgs {
  sweepId: string;
  inflectionC: number[];
  rateB: number[];
  exponentScaling: number[];
  /** Iter 6c — phenology sweep axes (optional). */
  cellDivisionDurationGDD?: number[];
  cellExpansionDurationGDD?: number[];
  /** Iter 6d — cohort generation sweep axes (optional, SSOT #53). */
  flowersPerTrussMu?: number[];
  fruitSetRate?: number[];
  /** Iter 6f — abortion sweep axes (optional, SSOT #61). */
  abortionThresholdRatio?: number[];
  abortionLagDays?: number[];
  seed: number;
  days: number[];
  cultivar: string;
  sweepRoot: string;
  repoRoot: string;
}

function parseList(s: string | undefined, fallback: number[]): number[] {
  if (!s) return fallback;
  return s.split(',').map(x => Number(x.trim())).filter(n => Number.isFinite(n));
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
  const repoRoot = join(__dirname, '..', '..');
  return {
    sweepId: opts.sweepId ?? 'iter6_gompertz_sweep_1',
    inflectionC: parseList(opts.inflectionC, [0.55, 0.60, 0.65, 0.70]),
    rateB: parseList(opts.rateB, [0.04, 0.05, 0.06, 0.07]),
    exponentScaling: parseList(opts.exponentScaling, [0.010]),
    cellDivisionDurationGDD: opts.cellDivisionDurationGDD ? parseList(opts.cellDivisionDurationGDD, []) : undefined,
    cellExpansionDurationGDD: opts.cellExpansionDurationGDD ? parseList(opts.cellExpansionDurationGDD, []) : undefined,
    flowersPerTrussMu: opts.flowersPerTrussMu ? parseList(opts.flowersPerTrussMu, []) : undefined,
    fruitSetRate: opts.fruitSetRate ? parseList(opts.fruitSetRate, []) : undefined,
    abortionThresholdRatio: opts.abortionThresholdRatio ? parseList(opts.abortionThresholdRatio, []) : undefined,
    abortionLagDays: opts.abortionLagDays ? parseList(opts.abortionLagDays, []) : undefined,
    seed: opts.seed ? Number(opts.seed) : 20260525,
    days: parseList(opts.days, [30, 33, 60, 90]),
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    sweepRoot: opts.sweepRoot ?? join(__dirname, '..', 'sweeps'),
    repoRoot,
  };
}

// ── Variant generation ───────────────────────────────────────────────

interface Variant {
  inflectionC: number;
  rateB: number;
  exponentScaling: number;
  // Iter 6c — phenology (optional)
  cellDivisionDurationGDD?: number;
  cellExpansionDurationGDD?: number;
  // Iter 6d — cohort generation (optional)
  flowersPerTrussMu?: number;
  fruitSetRate?: number;
  // Iter 6f — abortion (optional)
  abortionThresholdRatio?: number;
  abortionLagDays?: number;
}

function genVariants(args: CliArgs): Variant[] {
  const out: Variant[] = [];
  const cddList = args.cellDivisionDurationGDD ?? [undefined];
  const cedList = args.cellExpansionDurationGDD ?? [undefined];
  const fptList = args.flowersPerTrussMu ?? [undefined];
  const fsrList = args.fruitSetRate ?? [undefined];
  const atrList = args.abortionThresholdRatio ?? [undefined];
  const aldList = args.abortionLagDays ?? [undefined];
  for (const ic of args.inflectionC) {
    for (const rb of args.rateB) {
      for (const exp of args.exponentScaling) {
        for (const cdd of cddList) {
          for (const ced of cedList) {
            for (const fpt of fptList) {
              for (const fsr of fsrList) {
                for (const atr of atrList) {
                  for (const ald of aldList) {
                    out.push({
                      inflectionC: ic, rateB: rb, exponentScaling: exp,
                      cellDivisionDurationGDD: cdd, cellExpansionDurationGDD: ced,
                      flowersPerTrussMu: fpt, fruitSetRate: fsr,
                      abortionThresholdRatio: atr, abortionLagDays: ald,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return out;
}

// ── Child process invocation ─────────────────────────────────────────

interface RunOutput {
  runId: string;
  variant: Variant;
  overalls: Array<{
    day: number;
    fruitCohortCount?: number;
    visibleFruitCount?: number;
    expandingFruitCount?: number;
    maxVisibleFruitDiameterMm?: number;
    fruitCountTotal?: number;
    maxFruitDiameterMm?: number;
    heightCm?: number;
    nodeCount?: number;
    visibleTrussCount?: number;
  }>;
  diagnosisCases: Record<string, { fired: boolean }>;
  ok: boolean;
}

function runVariant(args: CliArgs, runId: string, v: Variant): RunOutput {
  const outRoot = join(args.sweepRoot, args.sweepId);
  const overrideStr = `inflectionC=${v.inflectionC},rateB=${v.rateB},exponentScaling=${v.exponentScaling}`;
  const cliArgs = [
    'vite-node',
    'growth-calibration/scripts/dump-growth-checkpoints.ts', '--',
    '--days', args.days.join(','),
    '--seed', String(args.seed),
    '--cultivar', args.cultivar,
    '--modelVersion', runId,
    '--outRoot', outRoot,
    '--overrideGompertz', overrideStr,
  ];
  // Iter 6c — phenology override (if variant has phenology fields)
  if (v.cellDivisionDurationGDD !== undefined || v.cellExpansionDurationGDD !== undefined) {
    const parts: string[] = [];
    if (v.cellDivisionDurationGDD !== undefined) parts.push(`cellDivisionDurationGDD=${v.cellDivisionDurationGDD}`);
    if (v.cellExpansionDurationGDD !== undefined) parts.push(`cellExpansionDurationGDD=${v.cellExpansionDurationGDD}`);
    cliArgs.push('--overridePhenology', parts.join(','));
  }
  // Iter 6d — cohort override (if variant has cohort fields)
  if (v.flowersPerTrussMu !== undefined || v.fruitSetRate !== undefined) {
    const parts: string[] = [];
    if (v.flowersPerTrussMu !== undefined) parts.push(`flowersPerTrussMu=${v.flowersPerTrussMu}`);
    if (v.fruitSetRate !== undefined) parts.push(`fruitSetRate=${v.fruitSetRate}`);
    cliArgs.push('--overrideCohort', parts.join(','));
  }
  // Iter 6f — abortion override (if variant has abortion fields)
  if (v.abortionThresholdRatio !== undefined || v.abortionLagDays !== undefined) {
    const parts: string[] = [];
    if (v.abortionThresholdRatio !== undefined) parts.push(`thresholdRatio=${v.abortionThresholdRatio}`);
    if (v.abortionLagDays !== undefined) parts.push(`lagDays=${v.abortionLagDays}`);
    cliArgs.push('--overrideAbortion', parts.join(','));
  }
  const res = spawnSync('npx', cliArgs, { cwd: args.repoRoot, stdio: 'pipe', encoding: 'utf-8' });

  if (res.status !== 0) {
    console.error(`  ${runId} FAILED:`, res.stderr?.slice(0, 500));
    return { runId, variant: v, overalls: [], diagnosisCases: {}, ok: false };
  }

  const summaryPath = join(outRoot, runId, 'summary.json');
  if (!existsSync(summaryPath)) {
    return { runId, variant: v, overalls: [], diagnosisCases: {}, ok: false };
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
  return {
    runId,
    variant: v,
    overalls: summary.overalls ?? [],
    diagnosisCases: summary.diagnosis?.cases ?? {},
    ok: true,
  };
}

// ── Ranking ──────────────────────────────────────────────────────────

interface RankedRun extends RunOutput {
  score: number;
  scoreBreakdown: Record<string, number>;
  day30: { visibleCount: number; maxVisDiam: number; cohortCount: number };
  day33: { visibleCount: number; maxVisDiam: number; cohortCount: number };
  day60: { maxDiam: number; visibleCount: number; cohortCount: number };
  day90: { maxDiam: number; visibleCount: number; cohortCount: number };
}

function rankRuns(runs: RunOutput[]): RankedRun[] {
  return runs.map(r => {
    if (!r.ok) {
      const emp = { visibleCount: -1, maxVisDiam: -1, cohortCount: -1 };
      return { ...r, score: -Infinity, scoreBreakdown: {}, day30: emp, day33: emp, day60: { maxDiam: -1, visibleCount: -1, cohortCount: -1 }, day90: { maxDiam: -1, visibleCount: -1, cohortCount: -1 } };
    }
    const get = (day: number) => r.overalls.find(o => o.day === day);
    const d30 = get(30);
    const d33 = get(33);
    const d60 = get(60);
    const d90 = get(90);
    const day30 = { visibleCount: d30?.visibleFruitCount ?? d30?.fruitCountTotal ?? 0, maxVisDiam: d30?.maxVisibleFruitDiameterMm ?? d30?.maxFruitDiameterMm ?? 0, cohortCount: d30?.fruitCohortCount ?? 0 };
    const day33 = { visibleCount: d33?.visibleFruitCount ?? d33?.fruitCountTotal ?? 0, maxVisDiam: d33?.maxVisibleFruitDiameterMm ?? d33?.maxFruitDiameterMm ?? 0, cohortCount: d33?.fruitCohortCount ?? 0 };
    const day60 = { maxDiam: d60?.maxVisibleFruitDiameterMm ?? d60?.maxFruitDiameterMm ?? 0, visibleCount: d60?.visibleFruitCount ?? 0, cohortCount: d60?.fruitCohortCount ?? 0 };
    const day90 = { maxDiam: d90?.maxVisibleFruitDiameterMm ?? d90?.maxFruitDiameterMm ?? 0, visibleCount: d90?.visibleFruitCount ?? 0, cohortCount: d90?.fruitCohortCount ?? 0 };

    // Multi-criteria scoring
    const breakdown: Record<string, number> = {};
    // Day 30/33 visible fruit 0 보너스 (target = 0)
    breakdown.day30_visible_zero = day30.visibleCount === 0 ? 30 : Math.max(0, 30 - day30.visibleCount * 5);
    breakdown.day33_visible_zero = day33.visibleCount === 0 ? 30 : Math.max(0, 30 - day33.visibleCount * 5);
    // Day 30 max visible diameter <= 3mm 보너스 (= minVisibleDiameterMm)
    breakdown.day30_diam_small = day30.maxVisDiam <= 3 ? 20 : Math.max(0, 20 - day30.maxVisDiam);
    // Day 60 target [22, 32] band
    breakdown.day60_band = day60.maxDiam >= 22 && day60.maxDiam <= 32 ? 20
      : (day60.maxDiam >= 18 && day60.maxDiam <= 36 ? 10 : 0);
    // Day 90 target [50, 65] band
    breakdown.day90_band = day90.maxDiam >= 50 && day90.maxDiam <= 65 ? 20
      : (day90.maxDiam >= 40 && day90.maxDiam <= 75 ? 10 : 0);
    // Overcorrection penalty
    if (day60.maxDiam < 5) breakdown.day60_overcorrection = -30;
    if (day90.maxDiam < 30) breakdown.day90_overcorrection = -30;

    // Iter 6b — visible count target band 보너스 (single-seed trend only)
    // Day 60 target 6~10, Day 90 target 20~28
    breakdown.day60_visible_band =
      day60.visibleCount >= 6 && day60.visibleCount <= 10 ? 15 :
      day60.visibleCount >= 4 && day60.visibleCount <= 12 ? 7 : 0;
    breakdown.day90_visible_band =
      day90.visibleCount >= 20 && day90.visibleCount <= 28 ? 15 :
      day90.visibleCount >= 16 && day90.visibleCount <= 32 ? 7 : 0;

    // Iter 6d — cohort sufficiency 보너스 (SSOT #52 — 필요조건)
    // Day 60 cohort ≥ 6, Day 90 cohort ≥ 20
    breakdown.day60_cohort_sufficient = day60.cohortCount >= 6 ? 10 : 0;
    breakdown.day90_cohort_sufficient = day90.cohortCount >= 20 ? 15 : 0;

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { ...r, score, scoreBreakdown: breakdown, day30, day33, day60, day90 };
  }).sort((a, b) => b.score - a.score);
}

// ── Output ───────────────────────────────────────────────────────────

function writeSweepSummary(args: CliArgs, ranked: RankedRun[]): void {
  const outRoot = join(args.sweepRoot, args.sweepId);
  const best = ranked[0];
  const summary = {
    sweepId: args.sweepId,
    seed: args.seed,
    days: args.days,
    cultivar: args.cultivar,
    timestamp: new Date().toISOString(),
    variantCount: ranked.length,
    best: best ? {
      runId: best.runId,
      variant: best.variant,
      score: best.score,
      scoreBreakdown: best.scoreBreakdown,
      day30: best.day30, day33: best.day33, day60: best.day60, day90: best.day90,
    } : null,
    rankings: ranked.map(r => ({
      runId: r.runId,
      variant: r.variant,
      score: r.score,
      day30: r.day30, day33: r.day33, day60: r.day60, day90: r.day90,
    })),
  };
  writeFileSync(join(outRoot, 'sweep_summary.json'), JSON.stringify(summary, null, 2) + '\n');

  // md report
  const lines: string[] = [];
  lines.push(`# Gompertz Sweep Summary — ${args.sweepId}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Cultivar: ${args.cultivar}, Seed: ${args.seed}, Days: ${args.days.join(', ')}`);
  lines.push(`Variants: ${ranked.length}`);
  lines.push('');
  if (best) {
    lines.push(`## Best Run: ${best.runId}`);
    lines.push('');
    lines.push(`- inflectionC: **${best.variant.inflectionC}**`);
    lines.push(`- rateB: **${best.variant.rateB}**`);
    lines.push(`- exponentScaling: **${best.variant.exponentScaling}**`);
    if (best.variant.flowersPerTrussMu !== undefined) lines.push(`- flowersPerTrussMu: **${best.variant.flowersPerTrussMu}**`);
    if (best.variant.fruitSetRate !== undefined) lines.push(`- fruitSetRate: **${best.variant.fruitSetRate}**`);
    if (best.variant.abortionThresholdRatio !== undefined) lines.push(`- abortionThresholdRatio: **${best.variant.abortionThresholdRatio}**`);
    if (best.variant.abortionLagDays !== undefined) lines.push(`- abortionLagDays: **${best.variant.abortionLagDays}**`);
    lines.push(`- Score: ${best.score.toFixed(1)}`);
    lines.push(`- Day 30: visible=${best.day30.visibleCount}, maxDiam=${best.day30.maxVisDiam.toFixed(1)}mm`);
    lines.push(`- Day 33: visible=${best.day33.visibleCount}, maxDiam=${best.day33.maxVisDiam.toFixed(1)}mm`);
    lines.push(`- Day 60: maxDiam=${best.day60.maxDiam.toFixed(1)}mm (target 22-32), cohort=${best.day60.cohortCount} (target ≥6), visible=${best.day60.visibleCount}`);
    lines.push(`- Day 90: maxDiam=${best.day90.maxDiam.toFixed(1)}mm (target 50-65), cohort=${best.day90.cohortCount} (target ≥20), visible=${best.day90.visibleCount}`);
    lines.push('');
  }
  lines.push(`## Full Ranking (top 10)`);
  lines.push('');
  lines.push('| Rank | runId | iC | rB | exp | fMu | fSR | aThr | aLag | Score | Day60 maxD | D60 cohort | D60 vis | Day90 maxD | D90 cohort | D90 vis |');
  lines.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (let i = 0; i < Math.min(10, ranked.length); i++) {
    const r = ranked[i];
    lines.push(`| ${i + 1} | ${r.runId} | ${r.variant.inflectionC} | ${r.variant.rateB} | ${r.variant.exponentScaling} | ${r.variant.flowersPerTrussMu ?? '-'} | ${r.variant.fruitSetRate ?? '-'} | ${r.variant.abortionThresholdRatio ?? '-'} | ${r.variant.abortionLagDays ?? '-'} | ${r.score.toFixed(1)} | ${r.day60.maxDiam.toFixed(1)} | ${r.day60.cohortCount} | ${r.day60.visibleCount} | ${r.day90.maxDiam.toFixed(1)} | ${r.day90.cohortCount} | ${r.day90.visibleCount} |`);
  }
  writeFileSync(join(outRoot, 'sweep_summary.md'), lines.join('\n') + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const variants = genVariants(args);

  console.log(`[run-gompertz-sweep] sweepId=${args.sweepId}`);
  const axes: string[] = [
    `inflectionC=${args.inflectionC.length}`,
    `rateB=${args.rateB.length}`,
    `exp=${args.exponentScaling.length}`,
  ];
  if (args.cellDivisionDurationGDD) axes.push(`cellDiv=${args.cellDivisionDurationGDD.length}`);
  if (args.cellExpansionDurationGDD) axes.push(`cellExp=${args.cellExpansionDurationGDD.length}`);
  if (args.flowersPerTrussMu) axes.push(`flowersMu=${args.flowersPerTrussMu.length}`);
  if (args.fruitSetRate) axes.push(`fruitSetRate=${args.fruitSetRate.length}`);
  if (args.abortionThresholdRatio) axes.push(`abortThresh=${args.abortionThresholdRatio.length}`);
  if (args.abortionLagDays) axes.push(`abortLag=${args.abortionLagDays.length}`);
  console.log(`  variants: ${variants.length} (${axes.join(' × ')})`);
  console.log(`  output: ${join(args.sweepRoot, args.sweepId)}`);

  const sweepDir = join(args.sweepRoot, args.sweepId);
  if (!existsSync(sweepDir)) mkdirSync(sweepDir, { recursive: true });

  const runs: RunOutput[] = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const runId = `run_${String(i + 1).padStart(3, '0')}`;
    const phStr = (v.cellDivisionDurationGDD !== undefined || v.cellExpansionDurationGDD !== undefined)
      ? ` cellDiv=${v.cellDivisionDurationGDD ?? '-'} cellExp=${v.cellExpansionDurationGDD ?? '-'}` : '';
    const coStr = (v.flowersPerTrussMu !== undefined || v.fruitSetRate !== undefined)
      ? ` flowersMu=${v.flowersPerTrussMu ?? '-'} fsr=${v.fruitSetRate ?? '-'}` : '';
    const abStr = (v.abortionThresholdRatio !== undefined || v.abortionLagDays !== undefined)
      ? ` abortThresh=${v.abortionThresholdRatio ?? '-'} abortLag=${v.abortionLagDays ?? '-'}` : '';
    process.stdout.write(`  [${i + 1}/${variants.length}] ${runId} inflectionC=${v.inflectionC} rateB=${v.rateB} exp=${v.exponentScaling}${phStr}${coStr}${abStr} ... `);
    const out = runVariant(args, runId, v);
    runs.push(out);
    console.log(out.ok ? '✓' : '✗');
  }

  const ranked = rankRuns(runs);
  writeSweepSummary(args, ranked);

  console.log('\n=== Top 3 ===');
  for (let i = 0; i < Math.min(3, ranked.length); i++) {
    const r = ranked[i];
    console.log(`  #${i + 1} ${r.runId} (score=${r.score.toFixed(1)}): inflectionC=${r.variant.inflectionC}, rateB=${r.variant.rateB}, exp=${r.variant.exponentScaling}`);
    console.log(`      Day 30 maxDiam=${r.day30.maxVisDiam.toFixed(1)}mm | Day 60=${r.day60.maxDiam.toFixed(1)} | Day 90=${r.day90.maxDiam.toFixed(1)}`);
  }
  console.log(`\nFull report: ${join(sweepDir, 'sweep_summary.md')}`);
}

main();
