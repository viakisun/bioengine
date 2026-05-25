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
    maxVisibleFruitDiameterMm?: number;
    fruitCountTotal: number;
    maxFruitDiameterMm: number;
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

function buildFruitFlowTable(
  candCheckpoint: CheckpointSummary | null,
  fruitRows: string[][],
): string {
  if (fruitRows.length === 0) return '_(fruit_summary.csv not found)_';

  // header → index map
  const header = fruitRows[0];
  const idx = (col: string) => header.indexOf(col);

  // 각 day별로 truss 1, fruit F1_1만 추출 (요약 목적)
  const filterRows = fruitRows.slice(1).filter(r =>
    r[idx('truss_index')] === '1' && r[idx('fruit_id')] === 'F1_1');

  const lines: string[] = [];
  lines.push('| day | phase | gdd_since_fert | fresh_mass_g | diameter_mm | gompertz_cap_fresh_g | gompertz_allowed_diameter_mm | demand_limited? | trajectory_capped? |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of filterRows) {
    lines.push(`| ${r[idx('day')]} | ${r[idx('phase')]} | ${r[idx('gdd_since_fert')]} | ${r[idx('fresh_mass_g')]} | ${r[idx('diameter_mm')]} | ${r[idx('gompertz_cap_fresh_g')]} | ${r[idx('gompertz_allowed_diameter_mm')]} | ${r[idx('demand_was_limited')]} | ${r[idx('cumulative_cap_was_applied')]} |`);
  }
  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[dump-iter-audit] baseline=${args.baseline} candidate=${args.candidate}`);

  const baseComp = readComparison(args.experimentRoot, args.baseline);
  const candComp = readComparison(args.experimentRoot, args.candidate);
  const baseCkpt = readCheckpoint(args.checkpointRoot, args.baseline);
  const candCkpt = readCheckpoint(args.checkpointRoot, args.candidate);
  const candUserSummary = readUserSummary(args.checkpointRoot, args.candidate);
  const candFruitRows = readFruitSummaryCsv(args.checkpointRoot, args.candidate);

  const criteria = evaluateTechnicalPass(baseComp, candComp, candCkpt, baseCkpt);
  const verdict = recommendVerdict(criteria);

  const lines: string[] = [];
  lines.push(`# Iter Audit Result — ${args.candidate} vs ${args.baseline}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Seed: ${args.seed}`);
  lines.push(`Days: ${args.days.join(', ')}`);
  lines.push('');

  // ── 1. 핵심 지표 비교 ──
  lines.push('## 1. 핵심 지표 비교');
  lines.push('');
  lines.push('| 지표 | baseline | candidate | Δ |');
  lines.push('|---|---|---|---|');
  if (baseComp && candComp) {
    lines.push(`| S overall | ${baseComp.meanOverallScore.toFixed(3)} | ${candComp.meanOverallScore.toFixed(3)} | ${formatDelta(baseComp.meanOverallScore, candComp.meanOverallScore)} |`);
    lines.push(`| P_band | ${baseComp.meanPBand.toFixed(3)} | ${candComp.meanPBand.toFixed(3)} | ${formatDelta(baseComp.meanPBand, candComp.meanPBand)} |`);
    const keys = new Set([
      ...Object.keys(baseComp.diagnosisCountByRuleId),
      ...Object.keys(candComp.diagnosisCountByRuleId),
    ]);
    for (const k of keys) {
      const b = baseComp.diagnosisCountByRuleId[k] ?? 0;
      const c = candComp.diagnosisCountByRuleId[k] ?? 0;
      lines.push(`| ${k} | ${b} | ${c} | ${formatDelta(b, c, 0)} |`);
    }
  } else {
    lines.push(`| (comparison data missing for ${!baseComp ? 'baseline' : 'candidate'}) | | | |`);
  }
  lines.push('');

  // ── 2. Day별 생육 요약 (candidate user_summary.md 그대로) ──
  lines.push('## 2. Day별 생육 요약 (candidate)');
  lines.push('');
  // user_summary.md 시작 라인 (# 헤더) 제거 후 inline
  const userSummaryLines = candUserSummary.split('\n').filter(l => !l.startsWith('# Growth Checkpoint'));
  lines.push(userSummaryLines.join('\n').trim());
  lines.push('');

  // ── 3. Fruit Mass Flow Audit ──
  lines.push('## 3. Fruit Mass Flow Audit (truss 1, fruit F1_1)');
  lines.push('');
  lines.push(buildFruitFlowTable(candCkpt, candFruitRows));
  lines.push('');
  lines.push('- `gompertz_cap_fresh_g` = `potentialFreshMassG(gddSinceFert, potentialMassG, params)` (fresh)');
  lines.push('- `gompertz_allowed_diameter_mm` = 200g→80mm 기준 ovate approx');
  lines.push('- `demand_limited?` = per-step Gompertz daily demand로 raw sink demand가 잘렸나');
  lines.push('- `trajectory_capped?` = cumulative W_dry가 Gompertz trajectory cap에 도달했나');
  lines.push('');

  // ── 4. Playwright closeups ──
  lines.push('## 4. Playwright closeups');
  lines.push('');
  lines.push(`- 위치: \`test-results/plant-calibration/\` (regenerable via \`npx playwright test\`)`);
  lines.push(`- baseline (v0.9): \`test-results/plant-calibration/baseline-v0.8/\` + \`tuned-v0.9/\` (prior commit)`);
  lines.push(`- candidate (${args.candidate}): re-capture pending`);
  lines.push('');
  lines.push('Visual conclusion: (manual review after playwright re-capture)');
  lines.push('- Day 30 large fruit disappeared? _(check day30_truss.png)_');
  lines.push('- Day 33 large fruit disappeared? _(check day33 if captured)_');
  lines.push('- Day 60 fruit size still plausible? _(check day60_truss.png)_');
  lines.push('- Day 90 fruit size still plausible? _(check day90_truss.png)_');
  lines.push('');

  // ── 5. Pass / Fail 기준 충족 ──
  lines.push('## 5. Pass / Fail 기준 충족 (Technical pass)');
  lines.push('');
  for (const c of criteria) {
    const mark = c.pass ? '✓' : '✗';
    lines.push(`- [${mark}] ${c.name} — ${c.detail}`);
  }
  lines.push('');

  // ── 6. 최종 판단 ──
  lines.push('## 6. 최종 판단');
  lines.push('');
  lines.push(`- **채택 / 보류 / 재조정**: **${verdict.verdict}**`);
  lines.push(`- **이유**: ${verdict.reason}`);
  lines.push(`- **남은 문제**: (manual fill — Calibration pass 미충족 항목들)`);
  lines.push(`- **다음 Iter 후보**: ${candCkpt?.diagnosis.recommendedNextIter ?? '(checkpoint 없음)'}`);
  lines.push('');

  if (!existsSync(args.auditRoot)) mkdirSync(args.auditRoot, { recursive: true });
  const auditPath = join(args.auditRoot, `${args.candidate}-vs-${args.baseline}.md`);
  writeFileSync(auditPath, lines.join('\n') + '\n');
  console.log(`\n[done] ${auditPath}`);

  // Console summary
  console.log('');
  console.log('=== Pass / Fail ===');
  for (const c of criteria) {
    console.log(`  [${c.pass ? '✓' : '✗'}] ${c.name} — ${c.detail}`);
  }
  console.log(`\nVerdict: ${verdict.verdict}`);
  console.log(`  ${verdict.reason}`);
}

main();
