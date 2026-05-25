// run-top-candidates-comparison — Iter 6b top sweep candidate re-evaluation.
//
// SSOT #48 — child-process per candidate isolation. 각 후보를 독립 process로:
//   extract 220 → compare 220 → dump single-seed checkpoint → summary
//
// Hard gate (SSOT #46) → composite score ranking. baseline (v0.11) 자동 포함.
//
// Usage:
//   npx vite-node growth-calibration/scripts/run-top-candidates-comparison.ts -- \
//     --sweepId iter6_sweep2 \
//     --candidates run_003,run_005,run_006,run_008 \
//     --cultivar tomimaru-muchoo \
//     --seedSingle 20260525 \
//     --ensembleBaseSeed 20260520 \
//     --ensemble 20 \
//     --days 0,10,20,30,40,50,60,70,80,90,100

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface CliArgs {
  sweepId: string;
  candidates: string[];
  cultivar: string;
  seedSingle: number;
  ensembleBaseSeed: number;
  ensemble: number;
  days: number[];
  sweepRoot: string;
  experimentRoot: string;
  repoRoot: string;
  referenceBundle: string;
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
    sweepId: opts.sweepId ?? 'iter6_sweep2',
    candidates: (opts.candidates ?? 'run_003,run_005,run_006,run_008').split(',').map(s => s.trim()),
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    seedSingle: opts.seedSingle ? Number(opts.seedSingle) : 20260525,
    ensembleBaseSeed: opts.ensembleBaseSeed ? Number(opts.ensembleBaseSeed) : 20260520,
    ensemble: opts.ensemble ? Number(opts.ensemble) : 20,
    days: opts.days
      ? opts.days.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0)
      : [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    sweepRoot: opts.sweepRoot ?? join(__dirname, '..', 'sweeps'),
    experimentRoot: opts.experimentRoot ?? join(__dirname, '..', 'experiments', 'tomato_calibration_baseline'),
    repoRoot,
    referenceBundle: opts.referenceBundle
      ?? 'growth-calibration/reference/tomato/tomimaru-muchoo_22C_reference.json',
  };
}

// ── Types ─────────────────────────────────────────────────────────────

interface SweepVariant {
  inflectionC: number;
  rateB: number;
  exponentScaling: number;
  // Iter 6c — phenology (optional)
  cellDivisionDurationGDD?: number;
  cellExpansionDurationGDD?: number;
}

interface SweepRanking {
  runId: string;
  variant: SweepVariant;
}

interface EvalCandidate {
  runId: string;
  variant: SweepVariant;
  S: number;
  PBand: number;
  diagnosis: Record<string, number>;
  day30?: { maxVisDiam: number; visibleCount: number; cohortCount?: number };
  day33?: { maxVisDiam: number; visibleCount: number; cohortCount?: number };
  day60?: { maxDiam: number; visibleCount: number; cohortCount?: number };
  day90?: { maxDiam: number; visibleCount: number; cohortCount?: number };
  /** Iter 6c SSOT #52 — cohort sufficiency: target visible 가능한가? */
  cohortSufficiency?: { day60: 'ok' | 'insufficient'; day90: 'ok' | 'insufficient' };
  rejectReason?: string | null;
  score?: number;
  isBaseline?: boolean;
}

// ── Per-candidate evaluation (3 child processes) ─────────────────────

function evalCandidate(args: CliArgs, runId: string, v: SweepVariant): EvalCandidate {
  const evalModelVersion = `v0.11-eval-${runId}`;
  const overrideStr = `inflectionC=${v.inflectionC},rateB=${v.rateB},exponentScaling=${v.exponentScaling}`;
  // Iter 6c — phenology override (if variant has phenology fields)
  const phenologyStr = (v.cellDivisionDurationGDD !== undefined || v.cellExpansionDurationGDD !== undefined)
    ? [
        v.cellDivisionDurationGDD !== undefined ? `cellDivisionDurationGDD=${v.cellDivisionDurationGDD}` : '',
        v.cellExpansionDurationGDD !== undefined ? `cellExpansionDurationGDD=${v.cellExpansionDurationGDD}` : '',
      ].filter(Boolean).join(',')
    : undefined;
  const extraOverride = phenologyStr ? ['--overridePhenology', phenologyStr] : [];

  // 1. extract 220 (child process)
  console.log(`    extract...`);
  const r1 = spawnSync('npx', ['vite-node',
    'growth-calibration/scripts/extract-calibration-observations.ts', '--',
    '--cultivar', args.cultivar,
    '--modelVersion', `growthModel.tomato.${evalModelVersion}`,
    '--ensemble', String(args.ensemble),
    '--baseSeed', String(args.ensembleBaseSeed),
    '--days', args.days.join(','),
    '--overrideGompertz', overrideStr,
    ...extraOverride,
  ], { cwd: args.repoRoot, stdio: 'pipe', encoding: 'utf-8' });
  if (r1.status !== 0) {
    console.error(`    extract FAILED: ${r1.stderr?.slice(0, 200)}`);
    return { runId, variant: v, S: 0, PBand: 0, diagnosis: {}, rejectReason: 'extract failed' };
  }

  // 2. compare 220
  console.log(`    compare...`);
  const r2 = spawnSync('npx', ['vite-node',
    'growth-calibration/scripts/compare-real-vs-sim.ts', '--',
    '--experimentId', 'tomato_calibration_baseline',
    '--modelVersion', `growthModel.tomato.${evalModelVersion}`,
    '--referenceBundle', args.referenceBundle,
  ], { cwd: args.repoRoot, stdio: 'pipe', encoding: 'utf-8' });
  if (r2.status !== 0) {
    console.error(`    compare FAILED: ${r2.stderr?.slice(0, 200)}`);
    return { runId, variant: v, S: 0, PBand: 0, diagnosis: {}, rejectReason: 'compare failed' };
  }

  // 3. dump single-seed checkpoint (audit용)
  console.log(`    dump checkpoint...`);
  const dumpOutRoot = join(args.sweepRoot, args.sweepId, 'eval');
  const r3 = spawnSync('npx', ['vite-node',
    'growth-calibration/scripts/dump-growth-checkpoints.ts', '--',
    '--cultivar', args.cultivar,
    '--modelVersion', `eval_${runId}`,
    '--outRoot', dumpOutRoot,
    '--seed', String(args.seedSingle),
    '--days', '30,33,60,90',
    '--overrideGompertz', overrideStr,
    ...extraOverride,
  ], { cwd: args.repoRoot, stdio: 'pipe', encoding: 'utf-8' });
  if (r3.status !== 0) {
    console.error(`    dump FAILED: ${r3.stderr?.slice(0, 200)}`);
  }

  // 4. read summary + checkpoint
  const summaryPath = join(args.experimentRoot, 'comparison', `growthModel.tomato.${evalModelVersion}`, 'summary.json');
  if (!existsSync(summaryPath)) {
    return { runId, variant: v, S: 0, PBand: 0, diagnosis: {}, rejectReason: 'summary.json missing' };
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));

  const ckptPath = join(dumpOutRoot, `eval_${runId}`, 'summary.json');
  let ckpt: any = null;
  if (existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf-8'));
  }
  const dayMetric = (day: number) => {
    if (!ckpt) return undefined;
    const o = (ckpt.overalls ?? []).find((x: any) => x.day === day);
    if (!o) return undefined;
    return {
      maxDiam: o.maxVisibleFruitDiameterMm ?? o.maxFruitDiameterMm ?? 0,
      maxVisDiam: o.maxVisibleFruitDiameterMm ?? o.maxFruitDiameterMm ?? 0,
      visibleCount: o.visibleFruitCount ?? o.fruitCountTotal ?? 0,
      cohortCount: o.fruitCohortCount ?? 0,
    };
  };

  return {
    runId,
    variant: v,
    S: summary.meanOverallScore,
    PBand: summary.meanPBand,
    diagnosis: summary.diagnosisCountByRuleId ?? {},
    day30: dayMetric(30),
    day33: dayMetric(33),
    day60: dayMetric(60),
    day90: dayMetric(90),
    // Iter 6c SSOT #52 — cohort sufficiency check
    cohortSufficiency: {
      day60: (dayMetric(60)?.cohortCount ?? 0) >= 6 ? 'ok' : 'insufficient',
      day90: (dayMetric(90)?.cohortCount ?? 0) >= 20 ? 'ok' : 'insufficient',
    },
  };
}

// ── Hard gate (SSOT #46) ─────────────────────────────────────────────

function hardGateReject(e: EvalCandidate, baseline: { S: number; PBand: number }): string | null {
  if ((e.diagnosis['tomato_fruit_appears_too_early'] ?? 0) > 0) return 'fruit_too_early 재발화';
  if ((e.diagnosis['tomato_day33_fruit_too_early'] ?? 0) > 0) return 'day33_fruit_too_early 재발화';
  if ((e.day30?.maxVisDiam ?? 0) > 3) return `Day 30 maxVisDiam ${e.day30?.maxVisDiam.toFixed(1)}mm > 3mm`;
  if ((e.day33?.maxVisDiam ?? 0) > 3) return `Day 33 maxVisDiam ${e.day33?.maxVisDiam.toFixed(1)}mm > 3mm`;
  const d60 = e.day60?.maxDiam ?? 0;
  if (d60 < 18 || d60 > 36) return `Day 60 maxDiam ${d60.toFixed(1)}mm out of 18~36`;
  const d90 = e.day90?.maxDiam ?? 0;
  if (d90 < 40 || d90 > 75) return `Day 90 maxDiam ${d90.toFixed(1)}mm out of 40~75`;
  if (e.S < baseline.S - 0.02) return `S ${e.S.toFixed(3)} drop > 0.02`;
  if (e.PBand < baseline.PBand - 0.02) return `P_band ${e.PBand.toFixed(3)} drop > 0.02`;
  return null;
}

// ── Composite scoring (after gate) ───────────────────────────────────

function compositeScore(e: EvalCandidate, baseline: { S: number; PBand: number }): number {
  return (
    -(e.diagnosis['common_truss_status_too_behind'] ?? 0) * 1.0 +
    ((e.day60?.visibleCount ?? 0) >= 6 && (e.day60?.visibleCount ?? 0) <= 10 ? 30 :
     (e.day60?.visibleCount ?? 0) >= 4 ? 15 : 0) +
    ((e.day90?.visibleCount ?? 0) >= 20 && (e.day90?.visibleCount ?? 0) <= 28 ? 30 :
     (e.day90?.visibleCount ?? 0) >= 12 ? 15 : 0) +
    (e.S >= baseline.S ? 20 : 0) +
    (e.PBand >= baseline.PBand ? 10 : 0)
  );
}

// ── Main ─────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[run-top-candidates-comparison] sweepId=${args.sweepId} candidates=${args.candidates.join(',')}`);

  // Read sweep_summary.json for variant lookup
  const sweepSummaryPath = join(args.sweepRoot, args.sweepId, 'sweep_summary.json');
  if (!existsSync(sweepSummaryPath)) {
    throw new Error(`sweep_summary.json not found at ${sweepSummaryPath}`);
  }
  const sweepSummary = JSON.parse(readFileSync(sweepSummaryPath, 'utf-8'));
  const variantByRunId: Record<string, SweepVariant> = {};
  for (const r of sweepSummary.rankings ?? []) {
    variantByRunId[r.runId] = r.variant;
  }

  // Evaluate each candidate (child-process per candidate)
  const results: EvalCandidate[] = [];
  for (const runId of args.candidates) {
    const v = variantByRunId[runId];
    if (!v) {
      console.error(`  ${runId}: variant not found in sweep_summary`);
      continue;
    }
    console.log(`  [eval] ${runId} (inflectionC=${v.inflectionC}, rateB=${v.rateB}, exp=${v.exponentScaling})`);
    const result = evalCandidate(args, runId, v);
    results.push(result);
  }

  // Identify baseline (first candidate is conventionally the v0.11 baseline)
  // Per plan: --candidates first entry is baseline. Mark it.
  if (results.length > 0) results[0].isBaseline = true;
  const baseline = results.find(r => r.isBaseline) ?? results[0];
  if (!baseline) throw new Error('no baseline found');

  // Hard gate + composite score
  for (const e of results) {
    e.rejectReason = hardGateReject(e, { S: baseline.S, PBand: baseline.PBand });
    if (!e.rejectReason) {
      e.score = compositeScore(e, { S: baseline.S, PBand: baseline.PBand });
    }
  }

  const survivors = results.filter(r => !r.rejectReason);
  let winner: EvalCandidate;
  let reasoning: string;

  if (survivors.length === 0) {
    winner = baseline;
    reasoning = '모든 candidate가 hard gate 탈락 → baseline (v0.11) 유지';
  } else {
    const ranked = [...survivors].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = ranked[0];
    const baselineScore = baseline.score ?? -Infinity;
    const margin = (top.score ?? 0) - baselineScore;

    // Iter 6c — additional improvement-condition gate (SSOT, 사용자 검토 #5):
    // promote 하려면 다음 중 최소 하나 만족해야 함:
    //   - truss_status_too_behind: baseline 대비 ≥ 7 감소 (87 → ≤ 80)
    //   - Day 60 visibleFruitCount: baseline 대비 ≥ 2 증가
    //   - Day 90 visibleFruitCount: baseline 대비 ≥ 4 증가
    const tb_base = baseline.diagnosis['common_truss_status_too_behind'] ?? 0;
    const tb_top = top.diagnosis['common_truss_status_too_behind'] ?? 0;
    const d60v_base = baseline.day60?.visibleCount ?? 0;
    const d60v_top = top.day60?.visibleCount ?? 0;
    const d90v_base = baseline.day90?.visibleCount ?? 0;
    const d90v_top = top.day90?.visibleCount ?? 0;
    const trussImproved = (tb_base - tb_top) >= 7;
    const d60Improved = (d60v_top - d60v_base) >= 2;
    const d90Improved = (d90v_top - d90v_base) >= 4;
    const meaningfulImprovement = trussImproved || d60Improved || d90Improved;

    if (top.runId === baseline.runId || margin < 5) {
      winner = baseline;
      reasoning = `baseline (${baseline.runId}) 대비 composite margin ${margin.toFixed(1)} < 5 → 유지`;
    } else if (!meaningfulImprovement) {
      winner = baseline;
      reasoning = `${top.runId} composite margin=${margin.toFixed(1)}이지만 improvement-condition 미달 (truss_too_behind Δ=${tb_base - tb_top}, D60vis Δ=${d60v_top - d60v_base}, D90vis Δ=${d90v_top - d90v_base}) → baseline 유지`;
    } else {
      winner = top;
      const reasons = [
        trussImproved ? `truss_too_behind ${tb_base}→${tb_top} (-${tb_base - tb_top})` : '',
        d60Improved ? `Day 60 visible ${d60v_base}→${d60v_top}` : '',
        d90Improved ? `Day 90 visible ${d90v_base}→${d90v_top}` : '',
      ].filter(Boolean).join(', ');
      reasoning = `${winner.runId}: ${reasons}, composite margin=${margin.toFixed(1)}`;
    }
  }

  // Output
  const outDir = join(args.sweepRoot, args.sweepId);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const summary = {
    evalId: `eval_${args.sweepId}`,
    sweepId: args.sweepId,
    baselineRunId: baseline.runId,
    candidates: results,
    winner: { runId: winner.runId, reasoning },
    timestamp: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'eval_summary.json'), JSON.stringify(summary, null, 2) + '\n');

  // Console summary
  console.log('\n=== Eval Results ===');
  for (const r of results) {
    const gate = r.rejectReason ? `✗ ${r.rejectReason}` : `✓ score=${(r.score ?? 0).toFixed(1)}`;
    const baseline_tag = r.isBaseline ? ' (baseline)' : '';
    console.log(`  ${r.runId}${baseline_tag}: S=${r.S.toFixed(3)} P=${r.PBand.toFixed(3)} too_behind=${r.diagnosis['common_truss_status_too_behind'] ?? 0} D60vis=${r.day60?.visibleCount ?? '-'} D90vis=${r.day90?.visibleCount ?? '-'} | ${gate}`);
  }
  console.log(`\nWinner: ${winner.runId}`);
  console.log(`  ${reasoning}`);
  console.log(`\nOutput: ${join(outDir, 'eval_summary.json')}`);
}

main();
