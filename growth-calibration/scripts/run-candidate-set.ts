// run-candidate-set — Iter 8 hit-oriented candidate harness (SSOT #108/#109).
//
// run-gompertz-sweep와 다른 점: cross-product axis generator 대신 명시적인
// candidate set (id + label + candidateType + flags map)을 JSON으로 입력
// 받아 그대로 한 candidate = 한 child process로 실행한다. HIT-1~10 + Group
// A-F 같은 named, group-balanced experiment에 적합.
//
// flags map 키는 dump-growth-checkpoints의 --override* CLI 이름과 동일하다
// (overrideGompertz / overridePhenology / overrideCohort / overrideAbortion
// / overrideVisibility / overrideMassFlow / overrideSource / overrideCanopy).
// 값은 그 CLI가 받는 동일한 "k=v,k=v" 문자열.
//
// candidateType (SSOT #110): biology | sink_balance | canopy
//   | observation_diagnostic | mixed_biology_observation.
//   Strong Promote (v0.12) 후보는 biology only — 본 harness는 tag만 통과시키고
//   해석은 후속 audit에서 한다.
//
// Output:
//   growth-calibration/sweeps/{setId}/
//     {candidate-id}/                   ← per-candidate dump output (모든 CSV/JSON)
//     candidate_set_summary.json        ← aggregated table
//     candidate_set_summary.md          ← readable summary (group-balanced layout)
//
// Usage:
//   npx vite-node growth-calibration/scripts/run-candidate-set.ts -- \
//     --setId iter8_round1_signal_finding \
//     --config growth-calibration/configs/iter8_candidates.json \
//     --seed 20260525 --days 30,33,60,90,100 \
//     --cultivar tomimaru-muchoo
//
// Filtering / smoke testing (Phase A3 — 사용자 검토 #6):
//   --onlyIds HIT-3,HIT-5         ← run only these candidates
//   --includeBaseline             ← also run the "baseline" entry (default off)

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Config schema ────────────────────────────────────────────────────

type CandidateType =
  | 'biology'
  | 'sink_balance'
  | 'canopy'
  | 'observation_diagnostic'
  | 'mixed_biology_observation';

interface CandidateDef {
  id: string;
  label: string;
  candidateType: CandidateType;
  flags: Record<string, string>;
  /** If present, candidate is skipped at Round 1 (recorded with skip status). */
  skipReason?: string;
}

interface CandidateConfig {
  schemaVersion: string;
  iter: string;
  comment?: string;
  baseline: CandidateDef;
  candidates: CandidateDef[];
}

// ── CLI ──────────────────────────────────────────────────────────────

interface CliArgs {
  setId: string;
  configPath: string;
  seed: number;
  days: number[];
  cultivar: string;
  sweepRoot: string;
  repoRoot: string;
  onlyIds?: Set<string>;
  includeBaseline: boolean;
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
    setId: opts.setId ?? 'iter8_candidate_set',
    configPath: opts.config ?? 'growth-calibration/configs/iter8_candidates.json',
    seed: opts.seed ? Number(opts.seed) : 20260525,
    days: opts.days
      ? opts.days.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0)
      : [30, 33, 60, 90, 100],
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    sweepRoot: opts.sweepRoot ?? join(__dirname, '..', 'sweeps'),
    repoRoot,
    onlyIds: opts.onlyIds
      ? new Set(opts.onlyIds.split(',').map(s => s.trim()).filter(s => s.length > 0))
      : undefined,
    includeBaseline: opts.includeBaseline === 'true',
  };
}

// ── Child invocation ─────────────────────────────────────────────────

interface RunResult {
  candidate: CandidateDef;
  ok: boolean;
  skipped: boolean;
  /** Per-day rows from summary.json `overalls`. Only the fields we care about. */
  overalls: Array<{
    day: number;
    visibleFruitCount?: number;
    expandingFruitCount?: number;
    maxVisibleFruitDiameterMm?: number;
    fruitCohortCount?: number;
    flowerBudTotal?: number;
    fertilizedTotal?: number;
    fertilizedAliveCount?: number;
    flowerDropCount?: number;
    starvationAbortedCount?: number;
    pruningAbortedCount?: number;
    unknownAbortedCount?: number;
    cumulativeSourceG?: number;
    cumulativeRawFruitDemandG?: number;
    cumulativeLimitedFruitDemandG?: number;
    cumulativeVegetativeAllocatedG?: number;
    visibleTrussCount?: number;
    heightCm?: number;
  }>;
  diagnosisCases: Record<string, { fired: boolean }>;
  childStderrTail?: string;
}

function runCandidate(args: CliArgs, c: CandidateDef): RunResult {
  if (c.skipReason) {
    return { candidate: c, ok: false, skipped: true, overalls: [], diagnosisCases: {} };
  }
  const outRoot = join(args.sweepRoot, args.setId);
  const cliArgs: string[] = [
    'vite-node',
    'growth-calibration/scripts/dump-growth-checkpoints.ts', '--',
    '--days', args.days.join(','),
    '--seed', String(args.seed),
    '--cultivar', args.cultivar,
    '--modelVersion', c.id,
    '--outRoot', outRoot,
  ];
  for (const [k, v] of Object.entries(c.flags)) {
    if (typeof v !== 'string' || v.length === 0) continue;
    cliArgs.push(`--${k}`, v);
  }
  const res = spawnSync('npx', cliArgs, { cwd: args.repoRoot, stdio: 'pipe', encoding: 'utf-8' });
  if (res.status !== 0) {
    return {
      candidate: c, ok: false, skipped: false, overalls: [], diagnosisCases: {},
      childStderrTail: (res.stderr ?? '').slice(-600),
    };
  }
  const summaryPath = join(outRoot, c.id, 'summary.json');
  if (!existsSync(summaryPath)) {
    return { candidate: c, ok: false, skipped: false, overalls: [], diagnosisCases: {} };
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
  return {
    candidate: c,
    ok: true,
    skipped: false,
    overalls: summary.overalls ?? [],
    diagnosisCases: summary.diagnosis?.cases ?? {},
  };
}

// ── Hard gate evaluation (Iter 8) ────────────────────────────────────

interface HardGateResult {
  pass: boolean;
  fails: string[];
}

function evaluateHardGate(r: RunResult): HardGateResult {
  const fails: string[] = [];
  const get = (day: number) => r.overalls.find(o => o.day === day);
  const d30 = get(30);
  const d33 = get(33);
  const d60 = get(60);
  const d90 = get(90);
  if (d30) {
    const vis = d30.visibleFruitCount ?? 0;
    const mx = d30.maxVisibleFruitDiameterMm ?? 0;
    if (vis !== 0) fails.push(`D30.visible=${vis}!=0`);
    if (mx > 3) fails.push(`D30.maxDiam=${mx.toFixed(2)}>3`);
  }
  if (d33) {
    const vis = d33.visibleFruitCount ?? 0;
    const mx = d33.maxVisibleFruitDiameterMm ?? 0;
    if (vis !== 0) fails.push(`D33.visible=${vis}!=0`);
    if (mx > 3) fails.push(`D33.maxDiam=${mx.toFixed(2)}>3`);
  }
  if (d60) {
    const mx = d60.maxVisibleFruitDiameterMm ?? 0;
    if (mx < 18 || mx > 40) fails.push(`D60.maxDiam=${mx.toFixed(2)}∉[18,40]`);
  }
  if (d90) {
    const mx = d90.maxVisibleFruitDiameterMm ?? 0;
    if (mx < 40 || mx > 75) fails.push(`D90.maxDiam=${mx.toFixed(2)}∉[40,75]`);
  }
  let unknownTotal = 0;
  for (const o of r.overalls) unknownTotal += o.unknownAbortedCount ?? 0;
  if (unknownTotal > 0) fails.push(`unknown_aborted_total=${unknownTotal}`);
  return { pass: fails.length === 0, fails };
}

// ── Output ───────────────────────────────────────────────────────────

interface CandidateSummaryRow {
  id: string;
  label: string;
  candidateType: CandidateType;
  status: 'ok' | 'skipped' | 'failed';
  hardGatePass: boolean;
  hardGateFails: string[];
  d30: { vis: number; maxD: number };
  d33: { vis: number; maxD: number };
  d60: { vis: number; expanding: number; maxD: number; cohort: number };
  d90: { vis: number; expanding: number; maxD: number; cohort: number };
  cumSourceG_d90: number;
  cumVegetativeG_d90: number;
  cumLimitedFruitDemandG_d90: number;
  flowerDrop_d90: number;
  starvation_d90: number;
  pruning_d90: number;
  unknownAborted_total: number;
}

function summarizeRow(r: RunResult): CandidateSummaryRow {
  const status: CandidateSummaryRow['status'] =
    r.skipped ? 'skipped' : r.ok ? 'ok' : 'failed';
  const get = (day: number) => r.overalls.find(o => o.day === day);
  const d30 = get(30);
  const d33 = get(33);
  const d60 = get(60);
  const d90 = get(90);
  const hg = evaluateHardGate(r);
  let unknownTotal = 0;
  for (const o of r.overalls) unknownTotal += o.unknownAbortedCount ?? 0;
  return {
    id: r.candidate.id,
    label: r.candidate.label,
    candidateType: r.candidate.candidateType,
    status,
    hardGatePass: status === 'ok' ? hg.pass : false,
    hardGateFails: status === 'ok' ? hg.fails : [r.skipped ? (r.candidate.skipReason ?? 'skipped') : 'child_failed'],
    d30: { vis: d30?.visibleFruitCount ?? 0, maxD: d30?.maxVisibleFruitDiameterMm ?? 0 },
    d33: { vis: d33?.visibleFruitCount ?? 0, maxD: d33?.maxVisibleFruitDiameterMm ?? 0 },
    d60: {
      vis: d60?.visibleFruitCount ?? 0,
      expanding: d60?.expandingFruitCount ?? 0,
      maxD: d60?.maxVisibleFruitDiameterMm ?? 0,
      cohort: d60?.fruitCohortCount ?? 0,
    },
    d90: {
      vis: d90?.visibleFruitCount ?? 0,
      expanding: d90?.expandingFruitCount ?? 0,
      maxD: d90?.maxVisibleFruitDiameterMm ?? 0,
      cohort: d90?.fruitCohortCount ?? 0,
    },
    cumSourceG_d90: d90?.cumulativeSourceG ?? 0,
    cumVegetativeG_d90: d90?.cumulativeVegetativeAllocatedG ?? 0,
    cumLimitedFruitDemandG_d90: d90?.cumulativeLimitedFruitDemandG ?? 0,
    flowerDrop_d90: d90?.flowerDropCount ?? 0,
    starvation_d90: d90?.starvationAbortedCount ?? 0,
    pruning_d90: d90?.pruningAbortedCount ?? 0,
    unknownAborted_total: unknownTotal,
  };
}

function writeSummary(
  args: CliArgs, config: CandidateConfig, results: RunResult[],
): void {
  const outDir = join(args.sweepRoot, args.setId);
  const rows = results.map(summarizeRow);

  const groupOf = (id: string): string => {
    if (id === 'baseline') return 'baseline';
    if (id.startsWith('HIT-')) return 'H';
    return id.charAt(0).toUpperCase();
  };

  const summary = {
    setId: args.setId,
    seed: args.seed,
    days: args.days,
    cultivar: args.cultivar,
    configPath: args.configPath,
    iter: config.iter,
    timestamp: new Date().toISOString(),
    candidateCount: rows.length,
    okCount: rows.filter(r => r.status === 'ok').length,
    skippedCount: rows.filter(r => r.status === 'skipped').length,
    failedCount: rows.filter(r => r.status === 'failed').length,
    hardGatePassCount: rows.filter(r => r.hardGatePass).length,
    rows,
  };
  writeFileSync(join(outDir, 'candidate_set_summary.json'), JSON.stringify(summary, null, 2) + '\n');

  // Markdown summary — group-balanced layout (사용자 검토 #5)
  const lines: string[] = [];
  lines.push(`# Candidate Set Summary — ${args.setId} (${config.iter})`);
  lines.push('');
  lines.push(`Generated: ${summary.timestamp}`);
  lines.push(`Cultivar: ${args.cultivar} | Seed: ${args.seed} | Days: ${args.days.join(', ')}`);
  lines.push(`Candidates: ${rows.length} (ok=${summary.okCount}, skipped=${summary.skippedCount}, failed=${summary.failedCount}, hard-gate PASS=${summary.hardGatePassCount})`);
  lines.push('');

  const byGroup = new Map<string, CandidateSummaryRow[]>();
  for (const row of rows) {
    const g = groupOf(row.id);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(row);
  }

  const header = '| id | type | HG | D30 vis/mx | D33 vis/mx | D60 vis/exp/mx/coh | D90 vis/exp/mx/coh | drop/starv/prune | source g | hard-gate fails |';
  const sep = '|---|---|---|---|---|---|---|---|---:|---|';
  for (const g of ['baseline', 'H', 'A', 'B', 'C', 'D', 'E', 'F']) {
    const list = byGroup.get(g);
    if (!list || list.length === 0) continue;
    const titleMap: Record<string, string> = {
      baseline: 'Baseline (v0.11.3)',
      H: 'Group H — HIT-oriented (signal recovery, 10)',
      A: 'Group A — Source Capacity (3)',
      B: 'Group B — Sink Balance (3)',
      C: 'Group C — Survival Refine (3)',
      D: 'Group D — Mass Growth Alt (3)',
      E: 'Group E — Canopy alone (2)',
      F: 'Group F — Observation Diagnostic (3, promote 제외)',
    };
    lines.push(`## ${titleMap[g] ?? g}`);
    lines.push('');
    lines.push(header);
    lines.push(sep);
    for (const r of list) {
      const failStr = r.hardGateFails.length === 0
        ? ''
        : (r.hardGateFails.join('; ').slice(0, 80) + (r.hardGateFails.join('; ').length > 80 ? '…' : ''));
      lines.push(`| ${r.id} | ${r.candidateType} | ${r.hardGatePass ? '✓' : '✗'} | ${r.d30.vis}/${r.d30.maxD.toFixed(1)} | ${r.d33.vis}/${r.d33.maxD.toFixed(1)} | ${r.d60.vis}/${r.d60.expanding}/${r.d60.maxD.toFixed(1)}/${r.d60.cohort} | ${r.d90.vis}/${r.d90.expanding}/${r.d90.maxD.toFixed(1)}/${r.d90.cohort} | ${r.flowerDrop_d90}/${r.starvation_d90}/${r.pruning_d90} | ${r.cumSourceG_d90.toFixed(1)} | ${failStr} |`);
    }
    lines.push('');
    lines.push(`(D# vis/exp/mx/coh = visibleFruitCount / expandingFruitCount / maxVisibleFruitDiameter / fruitCohortCount; drop/starv/prune = D90 7-state aggregate counts.)`);
    lines.push('');
  }

  // Pool classification (Iter 8 SSOT #109 — hit-oriented).
  // Pool 1: hard gate PASS + D90 visible ≥ 9 (Strong promote candidates).
  // Pool 2: hard gate FAIL but D90 visible ≥ 9 (signal rescue candidates — Round 2 guard).
  // Pool 3: source / canopy / sink balance reaction candidates (signal layer ID).
  const okRows = rows.filter(r => r.status === 'ok');
  const pool1 = okRows.filter(r => r.hardGatePass && r.d90.vis >= 9);
  const pool2 = okRows.filter(r => !r.hardGatePass && r.d90.vis >= 9);
  const baselineRow = rows.find(r => r.id === 'baseline');
  const baselineSource = baselineRow?.cumSourceG_d90 ?? 0;
  const baselineVeg = baselineRow?.cumVegetativeG_d90 ?? 0;
  const pool3 = okRows.filter(r =>
    (r.candidateType === 'sink_balance' || r.candidateType === 'canopy' || r.id === 'A1' || r.id === 'A2' || r.id === 'A3')
    && (Math.abs(r.cumSourceG_d90 - baselineSource) > 0.5 || Math.abs(r.cumVegetativeG_d90 - baselineVeg) > 0.5)
  );

  lines.push('## Pool Classification (Iter 8 SSOT #109)');
  lines.push('');
  lines.push(`- **Pool 1** (hard gate PASS + D90 visible ≥ 9, Strong promote candidates): ${pool1.length} → ${pool1.map(r => r.id).join(', ') || '(none)'}`);
  lines.push(`- **Pool 2** (hard gate FAIL + D90 visible ≥ 9, Signal rescue → Round 2 guard combine): ${pool2.length} → ${pool2.map(r => r.id).join(', ') || '(none)'}`);
  lines.push(`- **Pool 3** (source/sink/canopy 반응, signal layer ID): ${pool3.length} → ${pool3.map(r => r.id).join(', ') || '(none)'}`);
  lines.push('');
  lines.push(`Baseline reference (D90): source=${baselineSource.toFixed(1)}g, vegetative=${baselineVeg.toFixed(1)}g, visible=${baselineRow?.d90.vis ?? '-'}`);
  lines.push('');

  writeFileSync(join(outDir, 'candidate_set_summary.md'), lines.join('\n') + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const configAbs = join(args.repoRoot, args.configPath);
  if (!existsSync(configAbs)) {
    console.error(`[run-candidate-set] config not found: ${configAbs}`);
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(configAbs, 'utf-8')) as CandidateConfig;

  const queue: CandidateDef[] = [];
  if (args.includeBaseline) queue.push(config.baseline);
  for (const c of config.candidates) queue.push(c);
  const runList = args.onlyIds
    ? queue.filter(c => args.onlyIds!.has(c.id))
    : queue;

  console.log(`[run-candidate-set] setId=${args.setId}`);
  console.log(`  config: ${args.configPath} (iter=${config.iter})`);
  console.log(`  cultivar=${args.cultivar} seed=${args.seed} days=[${args.days.join(',')}]`);
  console.log(`  candidates: ${runList.length}/${queue.length}` + (args.onlyIds ? ` (filter onlyIds=${[...args.onlyIds].join(',')})` : ''));
  console.log(`  output: ${join(args.sweepRoot, args.setId)}`);

  const outDir = join(args.sweepRoot, args.setId);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const results: RunResult[] = [];
  for (let i = 0; i < runList.length; i++) {
    const c = runList[i];
    process.stdout.write(`  [${i + 1}/${runList.length}] ${c.id.padEnd(12)} (${c.candidateType.padEnd(28)}) ... `);
    const r = runCandidate(args, c);
    results.push(r);
    if (r.skipped) {
      console.log(`SKIPPED (${c.skipReason})`);
    } else if (!r.ok) {
      console.log(`✗ FAILED`);
      if (r.childStderrTail) console.log(`    stderr tail: ${r.childStderrTail.split('\n').slice(-3).join(' | ')}`);
    } else {
      const row = summarizeRow(r);
      console.log(`✓ HG=${row.hardGatePass ? 'PASS' : 'FAIL'} D60 vis=${row.d60.vis} mx=${row.d60.maxD.toFixed(1)} | D90 vis=${row.d90.vis} mx=${row.d90.maxD.toFixed(1)}`);
    }
  }

  writeSummary(args, config, results);
  console.log(`\n[done] ${results.length} candidates → ${join(outDir, 'candidate_set_summary.md')}`);
}

main();
