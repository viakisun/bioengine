// dump-iter-audit — Iter audit summary generator.
//
// Reads two checkpoint dumps (baseline + candidate) + 220-comparison
// summaries, generates a 6-section markdown audit per user spec:
//   1. 핵심 지표 비교 (S, P_band, 진단 카운트)
//   2. Day별 생육 요약 (candidate dump의 user_summary.md 형식)
//   3. Fruit Mass Flow Audit (per-fruit Gompertz/cap 표)
//   4. Playwright closeups (저장 위치 + visual conclusion)
//   5. Pass / Fail 기준 충족 (Technical pass)
//   6. 최종 판단 (자동 추천: 채택/보류/재조정)
//
// Usage:
//   npx vite-node growth-calibration/scripts/dump-iter-audit.ts -- \
//     --baseline v0.9-fruit-timing \
//     --candidate v0.10-gompertz-sink \
//     --days 30,33,60,90 \
//     --seed 20260525

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface CliArgs {
  baseline: string;
  candidate: string;
  days: number[];
  seed: number;
  experimentRoot: string;
  checkpointRoot: string;
  auditRoot: string;
  /** Iter 6 — optional sweep id (Gompertz parameter sweep table 포함). */
  sweepId?: string;
  sweepRoot: string;
  /** Iter 6 — Reference Pack root (leaf size sanity 등 추가 데이터). */
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
  return {
    baseline: opts.baseline ?? 'v0.9-fruit-timing',
    candidate: opts.candidate ?? 'v0.10-gompertz-sink',
    days: opts.days
      ? opts.days.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0)
      : [30, 33, 60, 90],
    seed: opts.seed ? Number(opts.seed) : 20260525,
    experimentRoot: opts.experimentRoot
      ?? join(__dirname, '..', 'experiments', 'tomato_calibration_baseline'),
    checkpointRoot: opts.checkpointRoot ?? join(__dirname, '..', 'checkpoints'),
    auditRoot: opts.auditRoot ?? join(__dirname, '..', 'audits'),
    sweepId: opts.sweepId,
    sweepRoot: opts.sweepRoot ?? join(__dirname, '..', 'sweeps'),
    referenceBundle: opts.referenceBundle
      ?? 'growth-calibration/reference/tomato/tomato_tomimaru_reference_v0.1',
  };
}

// ── helpers ────────────────────────────────────────────────────────────

interface ComparisonSummary {
  meanOverallScore: number;
  meanPBand: number;
  diagnosisCountByRuleId: Record<string, number>;
}

function readComparison(experimentRoot: string, modelVersion: string): ComparisonSummary | null {
  const path = join(experimentRoot, 'comparison', `growthModel.tomato.${modelVersion}`, 'summary.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as ComparisonSummary;
}

interface CheckpointSummary {
  modelVersion: string;
  overalls: Array<{
    day: number;
    heightCm: number;
    nodeCount: number;
    visibleTrussCount: number;
    fruitCohortCount?: number;
    visibleFruitCount?: number;
    expandingFruitCount?: number;        // Iter 6
    maxVisibleFruitDiameterMm?: number;
    fruitCountTotal: number;
    maxFruitDiameterMm: number;
    visibleLeafCount?: number;
  }>;
  diagnosis: {
    cases: Record<string, { fired: boolean; reason: string }>;
    recommendedNextIter: string;
  };
}

function readCheckpoint(checkpointRoot: string, modelVersion: string): CheckpointSummary | null {
  const path = join(checkpointRoot, modelVersion, 'summary.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as CheckpointSummary;
}

function readUserSummary(checkpointRoot: string, modelVersion: string): string {
  const path = join(checkpointRoot, modelVersion, 'user_summary.md');
  if (!existsSync(path)) return '_(user_summary.md not found)_';
  return readFileSync(path, 'utf-8');
}

function readFruitSummaryCsv(checkpointRoot: string, modelVersion: string): string[][] {
  const path = join(checkpointRoot, modelVersion, 'fruit_summary.csv');
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8');
  return text.split('\n').filter(l => l.length > 0).map(l => l.split(','));
}

function formatDelta(baseline: number, candidate: number, digits = 3): string {
  const d = candidate - baseline;
  const sign = d >= 0 ? '+' : '';
  return `${sign}${d.toFixed(digits)}`;
}

// ── Pass / Fail criteria (Technical pass — Iter 5b 기준) ───────────────

interface PassCriterion {
  name: string;
  pass: boolean;
  detail: string;
}

function evaluateTechnicalPass(
  base: ComparisonSummary | null,
  cand: ComparisonSummary | null,
  candCheckpoint: CheckpointSummary | null,
  baseCheckpoint: CheckpointSummary | null,
): PassCriterion[] {
  const out: PassCriterion[] = [];
  const dx = (k: string): number => (cand?.diagnosisCountByRuleId[k] ?? 0);
  const dxBase = (k: string): number => (base?.diagnosisCountByRuleId[k] ?? 0);

  // Day 30/33 cap collapse removed
  const day30 = candCheckpoint?.overalls.find(o => o.day === 30);
  const day33 = candCheckpoint?.overalls.find(o => o.day === 33);
  const day60 = candCheckpoint?.overalls.find(o => o.day === 60);
  const day90 = candCheckpoint?.overalls.find(o => o.day === 90);

  const day30MaxDiam = day30?.maxFruitDiameterMm ?? Infinity;
  out.push({
    name: 'Day 30 max fruit cap 폭주 제거 (87.6mm → ≤30mm 임의)',
    pass: day30MaxDiam <= 30,
    detail: `day30 maxDiam=${day30MaxDiam.toFixed(1)}mm`,
  });

  const day33MaxDiam = day33?.maxFruitDiameterMm ?? Infinity;
  out.push({
    name: 'Day 33 max fruit cap 폭주 제거 (≤30mm)',
    pass: day33MaxDiam <= 30,
    detail: `day33 maxDiam=${day33MaxDiam.toFixed(1)}mm`,
  });

  out.push({
    name: 'fruit_too_early 감소',
    pass: dx('tomato_fruit_appears_too_early') < dxBase('tomato_fruit_appears_too_early'),
    detail: `${dxBase('tomato_fruit_appears_too_early')} → ${dx('tomato_fruit_appears_too_early')}`,
  });

  out.push({
    name: 'day33_fruit_too_early 감소',
    pass: dx('tomato_day33_fruit_too_early') < dxBase('tomato_day33_fruit_too_early'),
    detail: `${dxBase('tomato_day33_fruit_too_early')} → ${dx('tomato_day33_fruit_too_early')}`,
  });

  out.push({
    name: 'fruit_too_late 신규 급증 없음 (≤5회)',
    pass: dx('tomato_fruit_appears_too_late') <= 5,
    detail: `count=${dx('tomato_fruit_appears_too_late')}`,
  });

  // height/node/truss 부합률 ±5%p (Comparison S 기반 simplification)
  out.push({
    name: 'S overall 하락 없음 (≥ baseline)',
    pass: (cand?.meanOverallScore ?? 0) >= (base?.meanOverallScore ?? 0) - 0.005,
    detail: `S: ${base?.meanOverallScore.toFixed(3)} → ${cand?.meanOverallScore.toFixed(3)} (Δ ${formatDelta(base?.meanOverallScore ?? 0, cand?.meanOverallScore ?? 0)})`,
  });

  out.push({
    name: 'P_band 하락 없음 (≥ baseline)',
    pass: (cand?.meanPBand ?? 0) >= (base?.meanPBand ?? 0) - 0.005,
    detail: `P_band: ${base?.meanPBand.toFixed(3)} → ${cand?.meanPBand.toFixed(3)} (Δ ${formatDelta(base?.meanPBand ?? 0, cand?.meanPBand ?? 0)})`,
  });

  // Day 60/90 fruit 너무 작아짐 감지 (실패 조건)
  const day60MaxDiam = day60?.maxFruitDiameterMm ?? 0;
  out.push({
    name: 'Day 60 fruit size overcorrection 없음 (>5mm)',
    pass: day60MaxDiam > 5,
    detail: `day60 maxDiam=${day60MaxDiam.toFixed(1)}mm`,
  });

  const day90MaxDiam = day90?.maxFruitDiameterMm ?? 0;
  out.push({
    name: 'Day 90 fruit size overcorrection 없음 (>30mm)',
    pass: day90MaxDiam > 30,
    detail: `day90 maxDiam=${day90MaxDiam.toFixed(1)}mm`,
  });

  return out;
}

function recommendVerdict(criteria: PassCriterion[]): { verdict: '채택' | '보류' | '재조정'; reason: string } {
  const passes = criteria.filter(c => c.pass).length;
  const fails = criteria.length - passes;
  if (passes >= criteria.length - 1) return {
    verdict: '채택',
    reason: `${passes}/${criteria.length} Technical pass 충족. Iter 5b architectural fix 성공.`,
  };
  if (passes >= criteria.length - 3) return {
    verdict: '보류',
    reason: `${passes}/${criteria.length} Technical pass. 일부 metric 실패 — 조건부 채택 or 정상화 필요.`,
  };
  return {
    verdict: '재조정',
    reason: `${passes}/${criteria.length} Technical pass. Iter 5b가 부작용 큼 — Gompertz exponentScaling 또는 fruitDryMatterRatio 재조정 필요.`,
  };
}

// ── Fruit Mass Flow Audit table (per-fruit) ────────────────────────────

/**
 * Iter 6b — Pick representative fruit per day per SSOT #44:
 *   1. 모두 aborted면 first aborted fruit (그때만 aborted 표시)
 *   2. visible (diameter >= 3mm = minVisibleDiameterMm) 중 max diameter
 *   3. visible 없으면 cohort 중 max diameter (non-aborted)
 */
function pickRepresentativeFruit(
  rows: string[][],
  idx: (col: string) => number,
  day: number,
): string[] | null {
  const dayAll = rows.filter(r => r[idx('day')] === String(day));
  if (dayAll.length === 0) return null;
  const nonAborted = dayAll.filter(r => r[idx('aborted')] !== 'true');

  // 1. 모두 aborted
  if (nonAborted.length === 0) return dayAll[0];

  const diam = (r: string[]) => Number(r[idx('diameter_mm')]);

  // 2. visible (>= 3mm) 중 max
  const visible = nonAborted.filter(r => diam(r) >= 3);
  if (visible.length > 0) {
    return visible.reduce((max, r) => diam(r) > diam(max) ? r : max);
  }

  // 3. cohort 중 max (non-aborted)
  return nonAborted.reduce((max, r) => diam(r) > diam(max) ? r : max);
}

function buildFruitFlowTable(
  candCheckpoint: CheckpointSummary | null,
  fruitRows: string[][],
  days: number[],
): string {
  if (fruitRows.length === 0) return '_(fruit_summary.csv not found)_';
  const header = fruitRows[0];
  const idx = (col: string) => header.indexOf(col);

  const lines: string[] = [];
  lines.push('| day | fruit_id | phase | aborted | gdd_since_fert | fresh_mass_g | diameter_mm | gompertz_cap_fresh_g | gompertz_allowed_diameter_mm | demand_limited? | trajectory_capped? |');
  lines.push('|---:|---|---|---:|---:|---:|---:|---:|---:|---|---|');
  for (const day of days) {
    const r = pickRepresentativeFruit(fruitRows.slice(1), idx, day);
    if (!r) {
      lines.push(`| ${day} | _(no fruit)_ | - | - | - | - | - | - | - | - | - |`);
      continue;
    }
    lines.push(`| ${r[idx('day')]} | ${r[idx('fruit_id')]} | ${r[idx('phase')]} | ${r[idx('aborted')]} | ${r[idx('gdd_since_fert')]} | ${r[idx('fresh_mass_g')]} | ${r[idx('diameter_mm')]} | ${r[idx('gompertz_cap_fresh_g')]} | ${r[idx('gompertz_allowed_diameter_mm')]} | ${r[idx('demand_was_limited')]} | ${r[idx('cumulative_cap_was_applied')]} |`);
  }
  return lines.join('\n');
}

// ── Iter 6 — additional section builders ──────────────────────────────

function buildFruitVisibilityTable(
  baseCkpt: CheckpointSummary | null,
  candCkpt: CheckpointSummary | null,
  days: number[],
): string {
  const lines: string[] = [];
  lines.push('| Day | cohort (base) | visible (base) | expanding (base) | cohort (cand) | visible (cand) | expanding (cand) |');
  lines.push('|---:|---:|---:|---:|---:|---:|---:|');
  for (const day of days) {
    const b = baseCkpt?.overalls.find(o => o.day === day);
    const c = candCkpt?.overalls.find(o => o.day === day);
    lines.push(`| ${day} | ${b?.fruitCohortCount ?? '-'} | ${b?.visibleFruitCount ?? '-'} | ${b?.expandingFruitCount ?? '-'} | ${c?.fruitCohortCount ?? '-'} | ${c?.visibleFruitCount ?? '-'} | ${c?.expandingFruitCount ?? '-'} |`);
  }
  return lines.join('\n');
}

function buildFruitSizeTimeline(
  baseCkpt: CheckpointSummary | null,
  candCkpt: CheckpointSummary | null,
  days: number[],
): string {
  const targetByDay: Record<number, string> = {
    30: '0~3',   // visible threshold = 3mm
    33: '0~3',
    60: '22~32',
    90: '50~65',
  };
  const lines: string[] = [];
  lines.push('| Day | target | baseline | candidate | Δ | direction |');
  lines.push('|---:|---:|---:|---:|---:|---|');
  for (const day of days) {
    const b = baseCkpt?.overalls.find(o => o.day === day);
    const c = candCkpt?.overalls.find(o => o.day === day);
    const bv = b?.maxVisibleFruitDiameterMm ?? b?.maxFruitDiameterMm ?? 0;
    const cv = c?.maxVisibleFruitDiameterMm ?? c?.maxFruitDiameterMm ?? 0;
    const delta = cv - bv;
    const dir = day <= 33 ? (cv < bv ? '↓ improved' : '↑ worse') : (Math.abs(cv - (day === 60 ? 27 : 57)) < Math.abs(bv - (day === 60 ? 27 : 57)) ? '→ closer' : '× drift');
    lines.push(`| ${day} | ${targetByDay[day] ?? 'n/a'} | ${bv.toFixed(1)}mm | ${cv.toFixed(1)}mm | ${formatDelta(bv, cv, 1)}mm | ${dir} |`);
  }
  return lines.join('\n');
}

interface SweepSummary {
  sweepId: string;
  variantCount: number;
  best: {
    runId: string;
    variant: { inflectionC: number; rateB: number; exponentScaling: number };
    score: number;
    day30: { visibleCount: number; maxVisDiam: number };
    day33: { visibleCount: number; maxVisDiam: number };
    day60: { maxDiam: number };
    day90: { maxDiam: number };
  } | null;
  rankings: Array<{
    runId: string;
    variant: { inflectionC: number; rateB: number; exponentScaling: number };
    score: number;
    day30: { maxVisDiam: number };
    day33: { maxVisDiam: number };
    day60: { maxDiam: number };
    day90: { maxDiam: number };
  }>;
}

function buildSweepTable(sweepRoot: string, sweepId?: string): string {
  if (!sweepId) return '_(sweep 미실행 — `--sweepId` 옵션으로 sweep summary 포함 가능)_';
  const path = join(sweepRoot, sweepId, 'sweep_summary.json');
  if (!existsSync(path)) return `_(sweep_summary.json not found at ${path})_`;
  const s = JSON.parse(readFileSync(path, 'utf-8')) as SweepSummary;
  const lines: string[] = [];
  lines.push(`Sweep: **${s.sweepId}** (${s.variantCount} variants)`);
  lines.push('');
  if (s.best) {
    lines.push(`Best: **${s.best.runId}** (score ${s.best.score.toFixed(1)})`);
    lines.push(`- inflectionC=${s.best.variant.inflectionC}, rateB=${s.best.variant.rateB}, exponentScaling=${s.best.variant.exponentScaling}`);
    lines.push('');
  }
  lines.push('| Rank | runId | inflectionC | rateB | expScale | Score | Day30 maxD | Day33 maxD | Day60 maxD | Day90 maxD |');
  lines.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  const top = s.rankings.slice(0, 10);
  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    lines.push(`| ${i + 1} | ${r.runId} | ${r.variant.inflectionC} | ${r.variant.rateB} | ${r.variant.exponentScaling} | ${r.score.toFixed(1)} | ${r.day30.maxVisDiam.toFixed(1)} | ${r.day33.maxVisDiam.toFixed(1)} | ${r.day60.maxDiam.toFixed(1)} | ${r.day90.maxDiam.toFixed(1)} |`);
  }
  return lines.join('\n');
}

// ── Iter 6b — Eval summary (run-top-candidates-comparison.ts output) ──

interface EvalCandidate {
  runId: string;
  variant: { inflectionC: number; rateB: number; exponentScaling: number };
  S: number;
  PBand: number;
  diagnosis: Record<string, number>;
  day30?: { maxVisDiam: number; visibleCount: number };
  day33?: { maxVisDiam: number; visibleCount: number };
  day60?: { maxDiam: number; visibleCount: number };
  day90?: { maxDiam: number; visibleCount: number };
  rejectReason?: string | null;
  score?: number;
  isBaseline?: boolean;
}

interface EvalSummary {
  evalId: string;
  baselineRunId: string;
  candidates: EvalCandidate[];
  winner: { runId: string; reasoning: string };
}

function readEvalSummary(sweepRoot: string, sweepId?: string): EvalSummary | null {
  if (!sweepId) return null;
  const path = join(sweepRoot, sweepId, 'eval_summary.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as EvalSummary;
}

// Section 5b — Stage Recovery (baseline vs winner)
function buildStageRecoveryTable(evalSummary: EvalSummary | null): string {
  if (!evalSummary) return '_(eval_summary.json not found — run-top-candidates-comparison.ts 실행 후 표시)_';
  const baseline = evalSummary.candidates.find(c => c.isBaseline);
  const winner = evalSummary.candidates.find(c => c.runId === evalSummary.winner.runId);
  if (!baseline || !winner) return '_(baseline/winner not found in eval_summary)_';
  const dx = (k: string, c: EvalCandidate) => c.diagnosis[k] ?? 0;
  const fmt = (n?: number) => n == null ? '-' : n.toFixed(1);
  const ifmt = (n?: number) => n == null ? '-' : String(n);
  const delta = (a: number, b: number) => `${b >= a ? '+' : ''}${(b - a).toFixed(0)}`;
  const lines: string[] = [];
  lines.push('| Metric | v0.11 baseline | winner (' + winner.runId + ') | Δ | Target |');
  lines.push('|---|---:|---:|---:|---:|');
  const rows: Array<[string, number, number, string]> = [
    ['fruit_too_early', dx('tomato_fruit_appears_too_early', baseline), dx('tomato_fruit_appears_too_early', winner), '0 유지 (hard gate)'],
    ['day33_fruit_too_early', dx('tomato_day33_fruit_too_early', baseline), dx('tomato_day33_fruit_too_early', winner), '0 유지 (hard gate)'],
    ['truss_status_too_behind', dx('common_truss_status_too_behind', baseline), dx('common_truss_status_too_behind', winner), '감소'],
    ['truss_status_too_advanced', dx('common_truss_status_too_advanced', baseline), dx('common_truss_status_too_advanced', winner), '증가 허용'],
  ];
  for (const [name, b, c, target] of rows) {
    lines.push(`| ${name} | ${b} | ${c} | ${delta(b, c)} | ${target} |`);
  }
  lines.push(`| Day 60 visibleFruitCount | ${ifmt(baseline.day60?.visibleCount)} | ${ifmt(winner.day60?.visibleCount)} | ${winner.day60 && baseline.day60 ? delta(baseline.day60.visibleCount, winner.day60.visibleCount) : '-'} | 6~10 |`);
  lines.push(`| Day 90 visibleFruitCount | ${ifmt(baseline.day90?.visibleCount)} | ${ifmt(winner.day90?.visibleCount)} | ${winner.day90 && baseline.day90 ? delta(baseline.day90.visibleCount, winner.day90.visibleCount) : '-'} | 20~28 |`);
  lines.push(`| Day 60 maxVisibleDiameterMm | ${fmt(baseline.day60?.maxDiam)} | ${fmt(winner.day60?.maxDiam)} | - | 22~32 유지 (hard gate) |`);
  lines.push(`| Day 90 maxVisibleDiameterMm | ${fmt(baseline.day90?.maxDiam)} | ${fmt(winner.day90?.maxDiam)} | - | 50~65 유지 (hard gate) |`);
  return lines.join('\n');
}

// Iter 6c — Section 5c Cohort Sufficiency Check (SSOT #52)
function buildCohortSufficiencyTable(candCkpt: CheckpointSummary | null): string {
  if (!candCkpt) return '_(checkpoint not available)_';
  const lines: string[] = [];
  lines.push('| Day | target visible | candidate cohort | stage timing 으로 해결 가능? | 판정 |');
  lines.push('|---:|---:|---:|---|---|');
  const targets: Record<number, [number, number]> = {
    30: [0, 0],
    33: [0, 0],
    60: [6, 10],
    90: [20, 28],
  };
  for (const day of [30, 33, 60, 90]) {
    const o = candCkpt.overalls.find(x => x.day === day);
    if (!o) {
      lines.push(`| ${day} | - | - | - | _(no data)_ |`);
      continue;
    }
    const [tMin, tMax] = targets[day];
    const cohort = o.fruitCohortCount ?? 0;
    const possible = cohort >= tMin;
    const verdict = day <= 33
      ? '(Day 30/33은 visible = 0 목표, cohort 관계 없음)'
      : possible
        ? '✓ stage timing sweep으로 가능'
        : '✗ **fruit cohort generation 영역 필요** (truss flower count, fruit set rate, abortion)';
    lines.push(`| ${day} | ${tMin}~${tMax} | ${cohort} | ${day <= 33 ? '-' : (possible ? '✓' : '✗')} | ${verdict} |`);
  }
  return lines.join('\n');
}

// Section 10b — Top Candidate Re-score
function buildTopCandidateTable(evalSummary: EvalSummary | null): string {
  if (!evalSummary) return '_(eval_summary.json not found)_';
  const lines: string[] = [];
  lines.push('| Run | inflectionC | rateB | expScale | S | P_band | Day60 maxD | Day90 maxD | Day60 visible | Day90 visible | too_behind | gate | selected |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|');
  for (const c of evalSummary.candidates) {
    const tooBehind = c.diagnosis['common_truss_status_too_behind'] ?? 0;
    const gate = c.rejectReason ? `✗ ${c.rejectReason.slice(0, 30)}` : '✓';
    const selected = c.runId === evalSummary.winner.runId ? '⭐' : (c.isBaseline ? '_baseline_' : '');
    lines.push(`| ${c.runId}${c.isBaseline ? ' (v0.11)' : ''} | ${c.variant.inflectionC} | ${c.variant.rateB} | ${c.variant.exponentScaling} | ${c.S.toFixed(3)} | ${c.PBand.toFixed(3)} | ${(c.day60?.maxDiam ?? 0).toFixed(1)} | ${(c.day90?.maxDiam ?? 0).toFixed(1)} | ${c.day60?.visibleCount ?? '-'} | ${c.day90?.visibleCount ?? '-'} | ${tooBehind} | ${gate} | ${selected} |`);
  }
  lines.push('');
  lines.push(`**Winner**: ${evalSummary.winner.runId} — ${evalSummary.winner.reasoning}`);
  return lines.join('\n');
}

function buildStageTable(
  candCkpt: CheckpointSummary | null,
  truss_rows: string[][],
  fruit_rows: string[][],
  days: number[],
): string {
  if (truss_rows.length === 0) return '_(truss_summary.csv not found)_';
  const header = truss_rows[0];
  const idx = (col: string) => header.indexOf(col);

  // Iter 6b — fruit_summary로부터 per (day, truss) cohort/visible/expanding 분리 (SSOT #47)
  let fIdx: ((col: string) => number) | null = null;
  if (fruit_rows.length > 0) {
    const fh = fruit_rows[0];
    fIdx = (col: string) => fh.indexOf(col);
  }
  const cohortFor = (day: number, truss: string): { cohort: number; visible: number; expanding: number; maxVis: number; maxCoh: number } => {
    if (!fIdx) return { cohort: 0, visible: 0, expanding: 0, maxVis: 0, maxCoh: 0 };
    const rows = fruit_rows.slice(1).filter(r =>
      r[fIdx!('day')] === String(day) &&
      r[fIdx!('truss_index')] === truss &&
      r[fIdx!('aborted')] !== 'true',
    );
    let cohort = 0, visible = 0, expanding = 0, maxVis = 0, maxCoh = 0;
    for (const r of rows) {
      const d = Number(r[fIdx!('diameter_mm')]);
      if (Number(r[fIdx!('fertilization_tt')]) <= 0) continue;
      cohort++;
      if (d > maxCoh) maxCoh = d;
      if (d >= 3) {
        visible++;
        if (d > maxVis) maxVis = d;
      }
      // expansion: phase + diameter
      const phase = r[fIdx!('phase')];
      if (d >= 10 && (phase === 'cell_expansion' || phase === 'ripening_early' || phase === 'ripening_late')) {
        expanding++;
      }
    }
    return { cohort, visible, expanding, maxVis, maxCoh };
  };

  const lines: string[] = [];
  const targetByDay: Record<number, string> = {
    30: 'visible_bud ~ flowering',
    33: 'visible_bud ~ flowering',
    60: 'green_expanding',
    90: 'breaker ~ red',
  };
  // 사용자 검토 #2 — column label 분리 (cohort/visible/expanding 명시)
  lines.push('| Day | Truss | Target Stage | Sim Status | Cohort | Visible | Expanding | Max Visible mm | Max Cohort mm |');
  lines.push('|---:|---:|---|---|---:|---:|---:|---:|---:|');
  for (const day of days) {
    const matching = truss_rows.slice(1).filter(r => r[idx('day')] === String(day));
    if (matching.length === 0) {
      lines.push(`| ${day} | - | ${targetByDay[day] ?? '-'} | (no truss data) | - | - | - | - | - |`);
      continue;
    }
    for (let i = 0; i < Math.min(2, matching.length); i++) {
      const r = matching[i];
      const trussIdx = r[idx('truss_index')];
      const counts = cohortFor(day, trussIdx);
      lines.push(`| ${day} | T${trussIdx} | ${targetByDay[day] ?? '-'} | ${r[idx('status')]} | ${counts.cohort} | ${counts.visible} | ${counts.expanding} | ${counts.maxVis.toFixed(1)} | ${counts.maxCoh.toFixed(1)} |`);
    }
  }
  return lines.join('\n');
}

function readTrussSummaryCsv(checkpointRoot: string, modelVersion: string): string[][] {
  const path = join(checkpointRoot, modelVersion, 'truss_summary.csv');
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8');
  return text.split('\n').filter(l => l.length > 0).map(l => l.split(','));
}

function buildLeafSizeSanity(
  candCkpt: CheckpointSummary | null,
  days: number[],
): string {
  // Reference Pack leaf timeline targets (from 04_leaf_timeline_target.csv)
  const targets: Record<number, { leafLength: [number, number]; leafWidth: [number, number]; leafletCount: number; visibleLeaf: [number, number] }> = {
    30: { leafLength: [28, 36], leafWidth: [15, 21], leafletCount: 7, visibleLeaf: [9, 11] },
    60: { leafLength: [44, 52], leafWidth: [25, 31], leafletCount: 9, visibleLeaf: [15, 17] },
  };
  const lines: string[] = [];
  lines.push('| Day | Metric | Target | Sim | Match | Note |');
  lines.push('|---:|---|---:|---:|---:|---|');
  for (const day of [30, 60]) {
    const t = targets[day];
    const ovr = candCkpt?.overalls.find(o => o.day === day);
    if (!t || !ovr) continue;
    const vl = (ovr as any).visibleLeafCount ?? 0;
    const matched = vl >= t.visibleLeaf[0] && vl <= t.visibleLeaf[1];
    lines.push(`| ${day} | visible_leaf_count | ${t.visibleLeaf[0]}~${t.visibleLeaf[1]} | ${vl} | ${matched ? '✓' : '✗'} | report-only |`);
    lines.push(`| ${day} | leaf_length_cm | ${t.leafLength[0]}~${t.leafLength[1]} | n/a | _ | _data not yet exported (Iter 8 정식 구현 후)_ |`);
    lines.push(`| ${day} | leaf_width_cm | ${t.leafWidth[0]}~${t.leafWidth[1]} | n/a | _ | _data not yet exported_ |`);
    lines.push(`| ${day} | leafletCount | ${t.leafletCount} | n/a | _ | _data not yet exported_ |`);
  }
  return lines.join('\n');
}

// ── Main (Iter 6 — 11-section audit form) ─────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[dump-iter-audit] baseline=${args.baseline} candidate=${args.candidate}`);

  const baseComp = readComparison(args.experimentRoot, args.baseline);
  const candComp = readComparison(args.experimentRoot, args.candidate);
  const baseCkpt = readCheckpoint(args.checkpointRoot, args.baseline);
  const candCkpt = readCheckpoint(args.checkpointRoot, args.candidate);
  const candUserSummary = readUserSummary(args.checkpointRoot, args.candidate);
  const candFruitRows = readFruitSummaryCsv(args.checkpointRoot, args.candidate);
  const candTrussRows = readTrussSummaryCsv(args.checkpointRoot, args.candidate);

  const criteria = evaluateTechnicalPass(baseComp, candComp, candCkpt, baseCkpt);
  const verdict = recommendVerdict(criteria);

  const lines: string[] = [];
  lines.push(`# Iter Audit Result — ${args.candidate} vs ${args.baseline}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Seed: ${args.seed}`);
  lines.push(`Days: ${args.days.join(', ')}`);
  if (args.sweepId) lines.push(`Sweep: ${args.sweepId}`);
  lines.push('');

  // ── 1. Overall Score ──
  lines.push('## 1. Overall Score');
  lines.push('');
  lines.push('| Metric | baseline | candidate | Δ |');
  lines.push('|---|---:|---:|---:|');
  if (baseComp && candComp) {
    lines.push(`| S overall | ${baseComp.meanOverallScore.toFixed(3)} | ${candComp.meanOverallScore.toFixed(3)} | ${formatDelta(baseComp.meanOverallScore, candComp.meanOverallScore)} |`);
    lines.push(`| P_band | ${baseComp.meanPBand.toFixed(3)} | ${candComp.meanPBand.toFixed(3)} | ${formatDelta(baseComp.meanPBand, candComp.meanPBand)} |`);
  } else {
    lines.push(`| (comparison data missing) | | | |`);
  }
  lines.push('');

  // ── 2. Diagnosis Count ──
  lines.push('## 2. Diagnosis Count');
  lines.push('');
  lines.push('| Diagnosis | baseline | candidate | Δ |');
  lines.push('|---|---:|---:|---:|');
  if (baseComp && candComp) {
    const keys = new Set([
      ...Object.keys(baseComp.diagnosisCountByRuleId),
      ...Object.keys(candComp.diagnosisCountByRuleId),
    ]);
    for (const k of keys) {
      const b = baseComp.diagnosisCountByRuleId[k] ?? 0;
      const c = candComp.diagnosisCountByRuleId[k] ?? 0;
      lines.push(`| ${k} | ${b} | ${c} | ${formatDelta(b, c, 0)} |`);
    }
  }
  lines.push('');

  // ── 3. Day Checkpoint Summary ──
  lines.push('## 3. Day Checkpoint Summary (candidate)');
  lines.push('');
  const userSummaryLines = candUserSummary.split('\n').filter(l => !l.startsWith('# Growth Checkpoint'));
  lines.push(userSummaryLines.join('\n').trim());
  lines.push('');

  // ── 4. Fruit Visibility Audit (cohort vs visible vs expanding) ──
  lines.push('## 4. Fruit Visibility Audit');
  lines.push('');
  lines.push(buildFruitVisibilityTable(baseCkpt, candCkpt, args.days));
  lines.push('');
  lines.push('- `cohort`: 내부 fruit object 수 (fertilized, !aborted, !harvested)');
  lines.push('- `visible`: `diameter >= minVisibleDiameterMm` (Iter 6 = 3mm)');
  lines.push('- `expanding`: `diameter >= minExpandingDiameterMm AND phase ∈ {cell_expansion, ripening_*}`');
  lines.push('');

  // ── 5. Fruit Size Timeline ──
  lines.push('## 5. Fruit Size Timeline');
  lines.push('');
  lines.push(buildFruitSizeTimeline(baseCkpt, candCkpt, args.days));
  lines.push('');

  // ── 5b. Stage Recovery (Iter 6b — eval_summary.json 있을 때만) ──
  const evalSummary = readEvalSummary(args.sweepRoot, args.sweepId);
  if (evalSummary) {
    lines.push('## 5b. Stage Recovery (Iter 6b 목표 진단)');
    lines.push('');
    lines.push(buildStageRecoveryTable(evalSummary));
    lines.push('');
  }

  // ── 5c. Cohort Sufficiency Check (Iter 6c, SSOT #52) ──
  lines.push('## 5c. Cohort Sufficiency Check (sweep 가능 영역 확인)');
  lines.push('');
  lines.push(buildCohortSufficiencyTable(candCkpt));
  lines.push('');
  lines.push('- cohort < target_visible_min 이면 phenology sweep으로 해결 불가 → fruit cohort generation 영역 (Iter 6d 또는 후속).');
  lines.push('');

  // ── 6. Gompertz Parameter Sweep ──
  lines.push('## 6. Gompertz Parameter Sweep');
  lines.push('');
  lines.push(buildSweepTable(args.sweepRoot, args.sweepId));
  lines.push('');

  // ── 7. Truss / Fruit Stage Audit ──
  lines.push('## 7. Truss / Fruit Stage Audit');
  lines.push('');
  lines.push(buildStageTable(candCkpt, candTrussRows, candFruitRows, args.days));
  lines.push('');

  // ── 8. Fruit Mass Flow Audit ──
  lines.push('## 8. Fruit Mass Flow Audit (truss 1, fruit F1_1)');
  lines.push('');
  lines.push(buildFruitFlowTable(candCkpt, candFruitRows, args.days));
  lines.push('');
  lines.push('- `gompertz_cap_fresh_g` = `potentialFreshMassG(gddSinceFert, potentialMassG, params)` (fresh)');
  lines.push('- `gompertz_allowed_diameter_mm` = 200g→80mm 기준 ovate approx');
  lines.push('- `demand_limited?` = per-step Gompertz demand 로 raw sink demand 가 잘렸나');
  lines.push('- `trajectory_capped?` = cumulative W_dry 가 Gompertz trajectory cap 에 도달했나');
  lines.push('');

  // ── 9. Leaf Size Sanity Check (report-only) ──
  lines.push('## 9. Leaf Size Sanity Check (report-only — Iter 6 pass/fail 미반영)');
  lines.push('');
  lines.push(buildLeafSizeSanity(candCkpt, args.days));
  lines.push('');
  lines.push('- 사용자 검토 #7: leaf size sanity는 후속 Iter 8 (Leaf Module 정식 구현) 까지 report-only.');
  lines.push('- 20% 이상 초과/부족 시 후속 plan 후보로 기록.');
  lines.push('');

  // ── 10. Technical / Calibration Pass ──
  lines.push('## 10. Technical / Calibration Pass');
  lines.push('');
  lines.push('### Technical Pass');
  lines.push('');
  for (const c of criteria) {
    const mark = c.pass ? '✓' : '✗';
    lines.push(`- [${mark}] ${c.name} — ${c.detail}`);
  }
  lines.push('');
  lines.push('### Calibration Pass (사용자 검토 #1 — visible threshold = pass 기준 일치)');
  lines.push('');
  const d30 = candCkpt?.overalls.find(o => o.day === 30);
  const d33 = candCkpt?.overalls.find(o => o.day === 33);
  const d60 = candCkpt?.overalls.find(o => o.day === 60);
  const d90 = candCkpt?.overalls.find(o => o.day === 90);
  const cp = (cond: boolean, name: string, detail: string) =>
    lines.push(`- [${cond ? '✓' : '✗'}] ${name} — ${detail}`);
  if (d30) cp((d30.visibleFruitCount ?? d30.fruitCountTotal ?? 0) === 0, 'Day 30 visibleFruitCount = 0', `actual ${d30.visibleFruitCount ?? d30.fruitCountTotal ?? 0}`);
  if (d33) cp((d33.visibleFruitCount ?? d33.fruitCountTotal ?? 0) === 0, 'Day 33 visibleFruitCount = 0', `actual ${d33.visibleFruitCount ?? d33.fruitCountTotal ?? 0}`);
  if (d30) cp((d30.maxVisibleFruitDiameterMm ?? d30.maxFruitDiameterMm ?? 0) <= 3, 'Day 30 maxVisibleFruitDiameterMm ≤ 3mm', `actual ${(d30.maxVisibleFruitDiameterMm ?? d30.maxFruitDiameterMm ?? 0).toFixed(1)}mm`);
  if (d33) cp((d33.maxVisibleFruitDiameterMm ?? d33.maxFruitDiameterMm ?? 0) <= 3, 'Day 33 maxVisibleFruitDiameterMm ≤ 3mm', `actual ${(d33.maxVisibleFruitDiameterMm ?? d33.maxFruitDiameterMm ?? 0).toFixed(1)}mm`);
  if (d60) {
    const v = d60.maxVisibleFruitDiameterMm ?? d60.maxFruitDiameterMm ?? 0;
    cp(v >= 18 && v <= 36, 'Day 60 maxVisibleFruitDiameterMm in 18~36mm (target 22~32)', `actual ${v.toFixed(1)}mm`);
  }
  if (d90) {
    const v = d90.maxVisibleFruitDiameterMm ?? d90.maxFruitDiameterMm ?? 0;
    cp(v >= 40 && v <= 75, 'Day 90 maxVisibleFruitDiameterMm in 40~75mm (target 50~65)', `actual ${v.toFixed(1)}mm`);
  }
  lines.push('');

  // ── 10b. Top Candidate Re-score (Iter 6b — eval_summary.json 있을 때만) ──
  if (evalSummary) {
    lines.push('## 10b. Top Candidate Re-score');
    lines.push('');
    lines.push(buildTopCandidateTable(evalSummary));
    lines.push('');
  }

  // ── 11. Final Decision ──
  lines.push('## 11. Final Decision');
  lines.push('');
  lines.push(`- **채택 / 보류 / 재조정**: **${verdict.verdict}**`);
  lines.push(`- **이유**: ${verdict.reason}`);
  lines.push(`- **남은 문제**: (manual fill)`);
  lines.push(`- **다음 Iter 후보**: ${candCkpt?.diagnosis.recommendedNextIter ?? '(checkpoint 없음)'}`);
  lines.push('');

  if (!existsSync(args.auditRoot)) mkdirSync(args.auditRoot, { recursive: true });
  const auditPath = join(args.auditRoot, `${args.candidate}-vs-${args.baseline}.md`);
  writeFileSync(auditPath, lines.join('\n') + '\n');
  console.log(`\n[done] ${auditPath}`);

  console.log('');
  console.log('=== Pass / Fail ===');
  for (const c of criteria) {
    console.log(`  [${c.pass ? '✓' : '✗'}] ${c.name} — ${c.detail}`);
  }
  console.log(`\nVerdict: ${verdict.verdict}`);
  console.log(`  ${verdict.reason}`);
}

main();
