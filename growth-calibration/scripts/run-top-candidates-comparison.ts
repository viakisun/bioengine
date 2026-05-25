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
  // Iter 6d — cohort generation (optional, SSOT #53)
  flowersPerTrussMu?: number;
  fruitSetRate?: number;
  // Iter 6f — abortion (optional, SSOT #61)
  abortionThresholdRatio?: number;
  abortionLagDays?: number;
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
  day30?: { maxVisDiam: number; visibleCount: number; cohortCount?: number; aborted?: number; fertilized?: number };
  day33?: { maxVisDiam: number; visibleCount: number; cohortCount?: number; aborted?: number; fertilized?: number };
  day60?: { maxDiam: number; visibleCount: number; cohortCount?: number; aborted?: number; fertilized?: number };
  day90?: { maxDiam: number; visibleCount: number; cohortCount?: number; aborted?: number; fertilized?: number };
  /** Iter 6c SSOT #52 — cohort sufficiency: target visible 가능한가? */
  cohortSufficiency?: { day60: 'ok' | 'insufficient'; day90: 'ok' | 'insufficient' };
  rejectReason?: string | null;
  /** Iter 6d (SSOT #57) — reject reason 카테고리. null이면 통과. */
  rejectCategory?:
    | 'fruit_too_early_returned'
    | 'day60_maxDiam_below_lower_bound'
    | 'day60_maxDiam_above_upper_bound'
    | 'day90_maxDiam_below_lower_bound'
    | 'day90_maxDiam_above_upper_bound'
    | 'sp_band_dropped'
    | 'visible_count_did_not_improve'
    | 'cohort_increased_but_size_collapsed'
    | 'cohort_did_not_increase'
    | 'cohort_insufficient'
    | 'composite_margin_insufficient'
    | 'abortion_rate_insufficient'  // Iter 6f (SSOT #64)
    | 'process_failed'
    | null;
  /** Iter 6d (SSOT #60) — promote/conditional 후보 risk 표식. */
  riskReasons?: string[];
  /** Iter 6d — 극단값 winner 분기 verdict 자체. */
  promoteVerdict?: 'promote' | 'conditional_promote';
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
  // Iter 6d — cohort override (if variant has cohort fields)
  const cohortStr = (v.flowersPerTrussMu !== undefined || v.fruitSetRate !== undefined)
    ? [
        v.flowersPerTrussMu !== undefined ? `flowersPerTrussMu=${v.flowersPerTrussMu}` : '',
        v.fruitSetRate !== undefined ? `fruitSetRate=${v.fruitSetRate}` : '',
      ].filter(Boolean).join(',')
    : undefined;
  // Iter 6f — abortion override (if variant has abortion fields)
  const abortionStr = (v.abortionThresholdRatio !== undefined || v.abortionLagDays !== undefined)
    ? [
        v.abortionThresholdRatio !== undefined ? `thresholdRatio=${v.abortionThresholdRatio}` : '',
        v.abortionLagDays !== undefined ? `lagDays=${v.abortionLagDays}` : '',
      ].filter(Boolean).join(',')
    : undefined;
  const extraOverride = [
    ...(phenologyStr ? ['--overridePhenology', phenologyStr] : []),
    ...(cohortStr ? ['--overrideCohort', cohortStr] : []),
    ...(abortionStr ? ['--overrideAbortion', abortionStr] : []),
  ];

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
    return { runId, variant: v, S: 0, PBand: 0, diagnosis: {}, rejectReason: 'extract failed', rejectCategory: 'process_failed' };
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
    return { runId, variant: v, S: 0, PBand: 0, diagnosis: {}, rejectReason: 'compare failed', rejectCategory: 'process_failed' };
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
    return { runId, variant: v, S: 0, PBand: 0, diagnosis: {}, rejectReason: 'summary.json missing', rejectCategory: 'process_failed' };
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
      // Iter 6f (SSOT #64) — abortionRate 계산용
      aborted: o.abortedTotal ?? 0,
      fertilized: o.fertilizedTotal ?? 0,
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

interface HardGateResult {
  reason: string | null;
  category: EvalCandidate['rejectCategory'];
}

function hardGateReject(e: EvalCandidate, baseline: { S: number; PBand: number }): HardGateResult {
  if ((e.diagnosis['tomato_fruit_appears_too_early'] ?? 0) > 0)
    return { reason: 'fruit_too_early 재발화', category: 'fruit_too_early_returned' };
  if ((e.diagnosis['tomato_day33_fruit_too_early'] ?? 0) > 0)
    return { reason: 'day33_fruit_too_early 재발화', category: 'fruit_too_early_returned' };
  if ((e.day30?.maxVisDiam ?? 0) > 3)
    return { reason: `Day 30 maxVisDiam ${e.day30?.maxVisDiam.toFixed(1)}mm > 3mm`, category: 'fruit_too_early_returned' };
  if ((e.day33?.maxVisDiam ?? 0) > 3)
    return { reason: `Day 33 maxVisDiam ${e.day33?.maxVisDiam.toFixed(1)}mm > 3mm`, category: 'fruit_too_early_returned' };
  const d60 = e.day60?.maxDiam ?? 0;
  if (d60 < 18)
    return { reason: `Day 60 maxDiam ${d60.toFixed(1)}mm < 18 (lower bound)`, category: 'day60_maxDiam_below_lower_bound' };
  if (d60 > 36)
    return { reason: `Day 60 maxDiam ${d60.toFixed(1)}mm > 36 (upper bound)`, category: 'day60_maxDiam_above_upper_bound' };
  const d90 = e.day90?.maxDiam ?? 0;
  if (d90 < 40)
    return { reason: `Day 90 maxDiam ${d90.toFixed(1)}mm < 40 (lower bound)`, category: 'day90_maxDiam_below_lower_bound' };
  if (d90 > 75)
    return { reason: `Day 90 maxDiam ${d90.toFixed(1)}mm > 75 (upper bound)`, category: 'day90_maxDiam_above_upper_bound' };
  if (e.S < baseline.S - 0.02)
    return { reason: `S ${e.S.toFixed(3)} drop > 0.02`, category: 'sp_band_dropped' };
  if (e.PBand < baseline.PBand - 0.02)
    return { reason: `P_band ${e.PBand.toFixed(3)} drop > 0.02`, category: 'sp_band_dropped' };
  // Iter 6f (SSOT #64) — abortion rate hard gate (Iter 6f 후보만)
  const isAbortionVariant = e.variant.abortionThresholdRatio !== undefined || e.variant.abortionLagDays !== undefined;
  if (isAbortionVariant) {
    const fert90 = e.day90?.fertilized ?? 0;
    const abort90 = e.day90?.aborted ?? 0;
    const abortRate = fert90 > 0 ? abort90 / fert90 : 1;
    if (abortRate > 0.60) {
      return { reason: `Day 90 abortionRate ${(abortRate * 100).toFixed(0)}% > 60% (baseline 72% → target ≤60%)`, category: 'abortion_rate_insufficient' };
    }
  }
  return { reason: null, category: null };
}

/** Iter 6d (SSOT #55) — cohort sufficiency 필수조건.
 *  Day 60 cohort ≥ 6 + Day 90 cohort ≥ 20. 미달 시 reject. */
function cohortSufficiencyReject(e: EvalCandidate, baseline: EvalCandidate | null): HardGateResult {
  const d60c = e.day60?.cohortCount ?? 0;
  const d90c = e.day90?.cohortCount ?? 0;
  if (d60c < 6 || d90c < 20) {
    // Iter 6d 후보 (cohort axis 있음)에서 baseline 대비 cohort 변화 0인지 추가 판별
    const isCohortVariant = e.variant.flowersPerTrussMu !== undefined || e.variant.fruitSetRate !== undefined;
    if (isCohortVariant && baseline) {
      const baseD90c = baseline.day90?.cohortCount ?? 0;
      if (d90c <= baseD90c) {
        return { reason: `Day 90 cohort ${d90c} ≤ baseline ${baseD90c} (cohort 변화 없음)`, category: 'cohort_did_not_increase' };
      }
    }
    return { reason: `cohort 부족: Day 60=${d60c} (need ≥6), Day 90=${d90c} (need ≥20)`, category: 'cohort_insufficient' };
  }
  return { reason: null, category: null };
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
    const extraStr = [
      v.flowersPerTrussMu !== undefined ? `fMu=${v.flowersPerTrussMu}` : '',
      v.fruitSetRate !== undefined ? `fSR=${v.fruitSetRate}` : '',
      v.abortionThresholdRatio !== undefined ? `aThr=${v.abortionThresholdRatio}` : '',
      v.abortionLagDays !== undefined ? `aLag=${v.abortionLagDays}` : '',
    ].filter(Boolean).join(' ');
    console.log(`  [eval] ${runId} (inflectionC=${v.inflectionC}, rateB=${v.rateB}, exp=${v.exponentScaling}${extraStr ? ' ' + extraStr : ''})`);
    const result = evalCandidate(args, runId, v);
    results.push(result);
  }

  // Identify baseline (first candidate is conventionally the v0.11 baseline)
  // Per plan: --candidates first entry is baseline. Mark it.
  if (results.length > 0) results[0].isBaseline = true;
  const baseline = results.find(r => r.isBaseline) ?? results[0];
  if (!baseline) throw new Error('no baseline found');

  // ── Stage 1: Hard gate (Iter 5b/6/6b/6c 그대로) ────────────────────
  // baseline은 항상 통과 (자기 자신 기준). 다른 후보만 reject 분류.
  for (const e of results) {
    if (e.isBaseline) {
      e.score = compositeScore(e, { S: baseline.S, PBand: baseline.PBand });
      continue;
    }
    const gate = hardGateReject(e, { S: baseline.S, PBand: baseline.PBand });
    if (gate.reason) {
      e.rejectReason = gate.reason;
      e.rejectCategory = gate.category;
      continue;
    }
    // Iter 6d (SSOT #55) — cohort sufficiency 필수조건
    const cohortGate = cohortSufficiencyReject(e, baseline);
    if (cohortGate.reason) {
      e.rejectReason = cohortGate.reason;
      e.rejectCategory = cohortGate.category;
      continue;
    }
    e.score = compositeScore(e, { S: baseline.S, PBand: baseline.PBand });
  }

  const survivors = results.filter(r => !r.rejectReason && !r.isBaseline);
  let winner: EvalCandidate;
  let reasoning: string;
  let promoteVerdict: 'promote' | 'conditional_promote' | 'reject' = 'reject';

  if (survivors.length === 0) {
    winner = baseline;
    reasoning = '모든 candidate가 hard gate / cohort sufficiency 탈락 → baseline 유지';
  } else {
    const ranked = [...survivors].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = ranked[0];
    const baselineScore = baseline.score ?? -Infinity;
    const margin = (top.score ?? 0) - baselineScore;

    // 채택조건 (SSOT #55): improvement-condition (Iter 6c와 동일)
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

    if (margin < 5) {
      winner = baseline;
      top.rejectReason = `composite margin ${margin.toFixed(1)} < 5`;
      top.rejectCategory = 'composite_margin_insufficient';
      reasoning = `top 후보 ${top.runId} composite margin ${margin.toFixed(1)} < 5 → baseline 유지`;
    } else if (!meaningfulImprovement) {
      winner = baseline;
      top.rejectReason = `visible/stage 채택조건 미달 (truss Δ=${tb_base - tb_top}, D60vis Δ=${d60v_top - d60v_base}, D90vis Δ=${d90v_top - d90v_base})`;
      top.rejectCategory = 'visible_count_did_not_improve';
      reasoning = `${top.runId} composite margin=${margin.toFixed(1)} 통과지만 채택조건 미달 → baseline 유지`;
    } else {
      winner = top;
      // Iter 6d / 6f (SSOT #58) — 극단값 winner는 conditional_promote (lever별 정의)
      const fsr = top.variant.fruitSetRate ?? 0;
      const fmu = top.variant.flowersPerTrussMu ?? 0;
      const atr = top.variant.abortionThresholdRatio ?? Infinity;
      const ald = top.variant.abortionLagDays ?? 0;
      const extremeFsr = fsr >= 0.9;
      const extremeFmu = fmu >= 9;
      // Iter 6f boundary: <= 0.10 OR >= 10 (등호 포함, 사용자 검토)
      const extremeAtr = atr <= 0.10;
      const extremeAld = ald >= 10;
      promoteVerdict = (extremeFsr || extremeFmu || extremeAtr || extremeAld) ? 'conditional_promote' : 'promote';
      top.promoteVerdict = promoteVerdict;

      // riskReasons 채우기 (SSOT #60)
      const risks: string[] = [];
      if (extremeFsr) risks.push('high_fruit_set_rate');
      if (extremeFmu) risks.push('high_flowers_per_truss');
      // Iter 6f abortion risk reasons
      if (extremeAtr) risks.push('low_abortion_threshold');
      if (extremeAld) risks.push('high_abortion_lag');
      const d60d = top.day60?.maxDiam ?? 0;
      const d90d = top.day90?.maxDiam ?? 0;
      if (d60d > 0 && (d60d - 18) / 18 <= 0.05) risks.push('maxDiam_near_lower_bound');
      if (d90d > 0 && (d90d - 40) / 40 <= 0.05) risks.push('maxDiam_near_lower_bound');
      const conditionCount = [trussImproved, d60Improved, d90Improved].filter(Boolean).length;
      if (conditionCount === 1) risks.push('cohort_increased_but_visible_marginal');
      const sDrop = baseline.S - top.S;
      if (sDrop >= 0.015) risks.push('sp_band_marginal');
      const pDrop = baseline.PBand - top.PBand;
      if (pDrop >= 0.015) risks.push('sp_band_marginal');
      top.riskReasons = risks;

      const reasons = [
        trussImproved ? `truss_too_behind ${tb_base}→${tb_top} (-${tb_base - tb_top})` : '',
        d60Improved ? `Day 60 visible ${d60v_base}→${d60v_top}` : '',
        d90Improved ? `Day 90 visible ${d90v_base}→${d90v_top}` : '',
      ].filter(Boolean).join(', ');
      const verdictTag = promoteVerdict === 'conditional_promote' ? ' [CONDITIONAL — 사용자 검토 필요]' : '';
      reasoning = `${winner.runId} (${promoteVerdict})${verdictTag}: ${reasons}, composite margin=${margin.toFixed(1)}` +
        (risks.length > 0 ? ` | risk: ${risks.join(',')}` : '');
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
    winner: {
      runId: winner.runId,
      reasoning,
      promoteVerdict: winner.isBaseline ? 'reject' : promoteVerdict,
      riskReasons: winner.riskReasons ?? [],
    },
    timestamp: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'eval_summary.json'), JSON.stringify(summary, null, 2) + '\n');

  // Console summary
  console.log('\n=== Eval Results ===');
  for (const r of results) {
    const gate = r.rejectReason ? `✗ ${r.rejectCategory ?? '?'}: ${r.rejectReason}` : `✓ score=${(r.score ?? 0).toFixed(1)}`;
    const baseline_tag = r.isBaseline ? ' (baseline)' : '';
    const f90 = r.day90?.fertilized ?? 0;
    const a90 = r.day90?.aborted ?? 0;
    const aRate90 = f90 > 0 ? `${((a90 / f90) * 100).toFixed(0)}%` : '-';
    console.log(`  ${r.runId}${baseline_tag}: S=${r.S.toFixed(3)} P=${r.PBand.toFixed(3)} too_behind=${r.diagnosis['common_truss_status_too_behind'] ?? 0} D60vis=${r.day60?.visibleCount ?? '-'} D90vis=${r.day90?.visibleCount ?? '-'} D60coh=${r.day60?.cohortCount ?? '-'} D90coh=${r.day90?.cohortCount ?? '-'} D90abortRate=${aRate90} | ${gate}`);
  }
  console.log(`\nWinner: ${winner.runId} (verdict: ${winner.isBaseline ? 'reject' : promoteVerdict})`);
  console.log(`  ${reasoning}`);
  if ((winner.riskReasons?.length ?? 0) > 0) console.log(`  risks: ${winner.riskReasons?.join(', ')}`);
  console.log(`\nOutput: ${join(outDir, 'eval_summary.json')}`);
}

main();
