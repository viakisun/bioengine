// replay-vs-forward — Phase F utility.
//
// Splits an existing comparison output into:
//   - replay days   (typically the days used to motivate the calibration)
//   - forward days  (held-out future days — generalization check)
//
// Reports S + P_band per split. Healthy update = forward ΔS ≥ 0.5 × replay
// ΔS (SSOT #12). Overfit if forward regresses while replay improves.
//
// Usage:
//   npx vite-node growth-calibration/scripts/replay-vs-forward.ts \
//     --modelVersion growthModel.tomato.v0.4-iter1a \
//     --replayDays 0,10,20,30,40,50 \
//     --forwardDays 60,70,80,90,100
//
// Optional --baseline modelVersion lets it report ΔS between two model
// versions (e.g. baseline vs iter1a) per split.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ComparisonResult } from '../schema/types';

const ROOT = join(__dirname, '..');

interface CliArgs {
  experimentId: string;
  modelVersion: string;
  baselineModelVersion?: string;
  replayDays: number[];
  forwardDays: number[];
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
    modelVersion: opts.modelVersion ?? 'growthModel.tomato.v0.4-iter1a',
    baselineModelVersion: opts.baseline ?? undefined,
    replayDays: (opts.replayDays ?? '0,10,20,30,40,50').split(',').map(s => Number(s.trim())),
    forwardDays: (opts.forwardDays ?? '60,70,80,90,100').split(',').map(s => Number(s.trim())),
    outRoot: opts.outRoot ?? join(ROOT, 'experiments'),
  };
}

interface SplitStats {
  count: number;
  meanS: number;
  meanPBand: number;
  diagnosesByRuleId: Record<string, number>;
}

function aggregate(cmps: ComparisonResult[]): SplitStats {
  if (cmps.length === 0) {
    return { count: 0, meanS: 0, meanPBand: 0, diagnosesByRuleId: {} };
  }
  const sumS = cmps.reduce((a, c) => a + c.summary.overallScore, 0);
  const sumP = cmps.reduce((a, c) => a + c.summary.pBand, 0);
  const diag: Record<string, number> = {};
  for (const c of cmps) {
    for (const d of c.diagnosis) diag[d.ruleId] = (diag[d.ruleId] ?? 0) + 1;
  }
  return {
    count: cmps.length,
    meanS: sumS / cmps.length,
    meanPBand: sumP / cmps.length,
    diagnosesByRuleId: diag,
  };
}

function loadComparisons(experimentId: string, modelVersion: string, outRoot: string): ComparisonResult[] {
  const cmpRoot = join(outRoot, experimentId, 'comparison', modelVersion);
  if (!existsSync(cmpRoot)) return [];
  const all: ComparisonResult[] = [];
  for (const dayDir of readdirSync(cmpRoot).sort()) {
    if (!dayDir.startsWith('day_')) continue;
    const dayPath = join(cmpRoot, dayDir);
    for (const fn of readdirSync(dayPath)) {
      if (!fn.endsWith('.json') || fn === 'summary.json') continue;
      const data = JSON.parse(readFileSync(join(dayPath, fn), 'utf8')) as ComparisonResult;
      all.push(data);
    }
  }
  return all;
}

function summarize(label: string, stats: SplitStats): void {
  process.stdout.write(`  [${label}] n=${stats.count}  S=${stats.meanS.toFixed(3)}  P_band=${stats.meanPBand.toFixed(3)}\n`);
  if (Object.keys(stats.diagnosesByRuleId).length > 0) {
    const top = Object.entries(stats.diagnosesByRuleId).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [id, n] of top) {
      process.stdout.write(`      ${id.padEnd(45)} ${n}\n`);
    }
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cmps = loadComparisons(args.experimentId, args.modelVersion, args.outRoot);
  if (cmps.length === 0) {
    process.stderr.write(`[error] no comparisons found for ${args.modelVersion}\n`);
    process.exit(1);
  }

  const replaySet = new Set(args.replayDays);
  const forwardSet = new Set(args.forwardDays);
  const replayCmps = cmps.filter(c => replaySet.has(c.day));
  const forwardCmps = cmps.filter(c => forwardSet.has(c.day));
  const otherCmps = cmps.filter(c => !replaySet.has(c.day) && !forwardSet.has(c.day));

  process.stdout.write(`\n[replay-vs-forward] modelVersion=${args.modelVersion}\n`);
  process.stdout.write(`  total comparisons: ${cmps.length}  (replay=${replayCmps.length}, forward=${forwardCmps.length}, other=${otherCmps.length})\n`);
  process.stdout.write(`  replayDays: [${args.replayDays.join(',')}]\n`);
  process.stdout.write(`  forwardDays: [${args.forwardDays.join(',')}]\n\n`);

  const replayStats = aggregate(replayCmps);
  const forwardStats = aggregate(forwardCmps);
  const overallStats = aggregate(cmps);

  summarize('overall ', overallStats);
  summarize('replay  ', replayStats);
  summarize('forward ', forwardStats);

  // ── Delta vs baseline ────────────────────────────────────────────
  if (args.baselineModelVersion) {
    const bcmps = loadComparisons(args.experimentId, args.baselineModelVersion, args.outRoot);
    if (bcmps.length === 0) {
      process.stderr.write(`\n[warn] baseline ${args.baselineModelVersion} has no comparisons — skipping delta\n`);
    } else {
      const bReplay = aggregate(bcmps.filter(c => replaySet.has(c.day)));
      const bForward = aggregate(bcmps.filter(c => forwardSet.has(c.day)));
      const bOverall = aggregate(bcmps);

      process.stdout.write(`\n  Δ vs ${args.baselineModelVersion}\n`);
      const dS_replay = replayStats.meanS - bReplay.meanS;
      const dS_forward = forwardStats.meanS - bForward.meanS;
      const dS_overall = overallStats.meanS - bOverall.meanS;
      const dP_replay = replayStats.meanPBand - bReplay.meanPBand;
      const dP_forward = forwardStats.meanPBand - bForward.meanPBand;
      process.stdout.write(`    overall:  ΔS=${signedFixed(dS_overall, 3)}  ΔP=${signedFixed(overallStats.meanPBand - bOverall.meanPBand, 3)}\n`);
      process.stdout.write(`    replay:   ΔS=${signedFixed(dS_replay, 3)}  ΔP=${signedFixed(dP_replay, 3)}\n`);
      process.stdout.write(`    forward:  ΔS=${signedFixed(dS_forward, 3)}  ΔP=${signedFixed(dP_forward, 3)}\n`);

      // SSOT #12 verdict
      process.stdout.write(`\n  [SSOT #12 verdict]\n`);
      if (dS_replay > 0 && dS_forward > 0) {
        const ratio = dS_replay > 0 ? dS_forward / dS_replay : 0;
        if (ratio >= 0.5) {
          process.stdout.write(`    ✓ HEALTHY: forward gain ${signedFixed(dS_forward, 3)} ≥ 0.5 × replay gain ${signedFixed(dS_replay, 3)} (ratio ${ratio.toFixed(2)})\n`);
        } else {
          process.stdout.write(`    ⚠ POSSIBLE OVERFIT: forward gain ${signedFixed(dS_forward, 3)} < 0.5 × replay gain ${signedFixed(dS_replay, 3)} (ratio ${ratio.toFixed(2)})\n`);
        }
      } else if (dS_replay < 0 && dS_forward < 0) {
        process.stdout.write(`    ✗ SYSTEMIC REGRESSION: both replay and forward worse — rollback recommended\n`);
      } else if (dS_replay > 0 && dS_forward < 0) {
        process.stdout.write(`    ✗ OVERFIT: replay improves but forward regresses — rollback recommended\n`);
      } else {
        process.stdout.write(`    ? MIXED: replay regresses but forward improves (unusual) — investigate\n`);
      }
    }
  }
}

function signedFixed(n: number, digits: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(digits);
}

main();
