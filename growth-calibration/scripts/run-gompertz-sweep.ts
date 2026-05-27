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
  /** Iter 15 (SSOT #156) — Truss emergence interval sweep axis (cultivar.GDD_per_truss). */
  gddPerTruss?: number[];
  /** Iter 6d — cohort generation sweep axes (optional, SSOT #53). */
  flowersPerTrussMu?: number[];
  fruitSetRate?: number[];
  /** Iter 6f — abortion sweep axes (optional, SSOT #61). */
  abortionThresholdRatio?: number[];
  abortionLagDays?: number[];
  /** Iter 6g (SSOT #73) — abortion pair-list. e.g. "0.18:7,0.18:10,0.10:10".
   *  If set, overrides abortionThresholdRatio/abortionLagDays cross-product. */
  abortionPairs?: Array<{ thresh: number; lag: number }>;
  /** Iter 6h (SSOT #74) — visibility gate sweep axes (optional). */
  visibilityGateMode?: Array<'diameter_only' | 'phase' | 'phase_and_gdd'>;
  minFruitAgeGDDForVisible?: number[];
  /** Iter 6e (SSOT #78) — surplusPolicy sweep axis (optional). Iter 6e-2 — fruit_priority_limited 추가. */
  surplusPolicy?: Array<'unused_pool' | 'redistribute_to_vegetative' | 'fruit_priority_limited'>;
  /** Iter 6e-2 (SSOT #85) — fruit_priority_limited 정책 강도 sweep (0..1). */
  fruitPriorityFraction?: number[];
  /** Iter 6e-3 (SSOT #87) — phase-aware cap pair-list. e.g. "1.25:1.0,1.50:1.0,1.50:1.25,2.00:1.25".
   *  Format: "cellExpansion:ripening,...". cellDivision은 항상 1.0 (Day 30/33 보호, SSOT #88). */
  capRelaxPairs?: Array<{ cellExpansion: number; ripening: number }>;
  /** Iter 7b (SSOT #103) — phaseAwareMassGrowth.divisionPhaseMassFraction sweep (0..1). */
  phaseAwareDivisionFraction?: number[];
  /** Iter 7b (SSOT #103) — phaseAwareMassGrowth.expansionPhaseGrowthMultiplier sweep (>0). */
  phaseAwareExpansionMultiplier?: number[];
  /** Iter 7c (SSOT #106/#107) — phaseAwareMassGrowth.expansionClockMode sweep. */
  phaseAwareExpansionClockMode?: Array<'fertilization_based' | 'expansion_start_based'>;
  /** Iter 9 (SSOT #116) — phaseAwareMassGrowth.cellDivisionStepDemandFraction sweep (0,1]. */
  phaseAwareCellDivStepDemandFraction?: number[];
  /** Iter 10 (SSOT #123) — phaseAwareMassGrowth.transitionZoneGDD sweep (>= 0). */
  phaseAwareTransitionZoneGDD?: number[];
  /** Iter 11 (SSOT #129) — phaseAwareMassGrowth.cumulativeCapTransitionZoneGDD sweep (>= 0). */
  phaseAwareCumulativeCapTransitionZoneGDD?: number[];
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

/** Iter 6g (SSOT #73) — parse "0.18:7,0.18:10,0.10:10" → [{thresh, lag}, ...] */
function parsePairList(s: string | undefined): Array<{ thresh: number; lag: number }> | undefined {
  if (!s) return undefined;
  const out: Array<{ thresh: number; lag: number }> = [];
  for (const pair of s.split(',')) {
    const [t, l] = pair.split(':').map(x => Number(x.trim()));
    if (Number.isFinite(t) && Number.isFinite(l)) out.push({ thresh: t, lag: l });
  }
  return out.length > 0 ? out : undefined;
}

/** Iter 6e-3 (SSOT #87) — parse "1.25:1.0,1.50:1.0,1.50:1.25" → [{cellExpansion, ripening}, ...].
 *  cellDivision은 sweep 안 함 (Day 30/33 보호, SSOT #88). */
function parseCapRelaxPairs(s: string | undefined): Array<{ cellExpansion: number; ripening: number }> | undefined {
  if (!s) return undefined;
  const out: Array<{ cellExpansion: number; ripening: number }> = [];
  for (const pair of s.split(',')) {
    const [e, r] = pair.split(':').map(x => Number(x.trim()));
    if (Number.isFinite(e) && e > 0 && Number.isFinite(r) && r > 0) out.push({ cellExpansion: e, ripening: r });
  }
  return out.length > 0 ? out : undefined;
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
    gddPerTruss: opts.gddPerTruss ? parseList(opts.gddPerTruss, []) : undefined,
    flowersPerTrussMu: opts.flowersPerTrussMu ? parseList(opts.flowersPerTrussMu, []) : undefined,
    fruitSetRate: opts.fruitSetRate ? parseList(opts.fruitSetRate, []) : undefined,
    abortionThresholdRatio: opts.abortionThresholdRatio ? parseList(opts.abortionThresholdRatio, []) : undefined,
    abortionLagDays: opts.abortionLagDays ? parseList(opts.abortionLagDays, []) : undefined,
    abortionPairs: parsePairList(opts.abortionPairs),
    visibilityGateMode: opts.visibilityGateMode
      ? (opts.visibilityGateMode.split(',').map(s => s.trim()).filter(s => s === 'diameter_only' || s === 'phase' || s === 'phase_and_gdd') as Array<'diameter_only' | 'phase' | 'phase_and_gdd'>)
      : undefined,
    minFruitAgeGDDForVisible: opts.minFruitAgeGDDForVisible ? parseList(opts.minFruitAgeGDDForVisible, []) : undefined,
    surplusPolicy: opts.surplusPolicy
      ? (opts.surplusPolicy.split(',').map(s => s.trim()).filter(s => s === 'unused_pool' || s === 'redistribute_to_vegetative' || s === 'fruit_priority_limited') as Array<'unused_pool' | 'redistribute_to_vegetative' | 'fruit_priority_limited'>)
      : undefined,
    fruitPriorityFraction: opts.fruitPriorityFraction ? parseList(opts.fruitPriorityFraction, []) : undefined,
    capRelaxPairs: parseCapRelaxPairs(opts.capRelaxPairs),
    phaseAwareDivisionFraction: opts.phaseAwareDivisionFraction ? parseList(opts.phaseAwareDivisionFraction, []) : undefined,
    phaseAwareExpansionMultiplier: opts.phaseAwareExpansionMultiplier ? parseList(opts.phaseAwareExpansionMultiplier, []) : undefined,
    phaseAwareExpansionClockMode: opts.phaseAwareExpansionClockMode
      ? (opts.phaseAwareExpansionClockMode.split(',').map(s => s.trim()).filter(s => s === 'fertilization_based' || s === 'expansion_start_based') as Array<'fertilization_based' | 'expansion_start_based'>)
      : undefined,
    phaseAwareCellDivStepDemandFraction: opts.phaseAwareCellDivStepDemandFraction ? parseList(opts.phaseAwareCellDivStepDemandFraction, []) : undefined,
    phaseAwareTransitionZoneGDD: opts.phaseAwareTransitionZoneGDD ? parseList(opts.phaseAwareTransitionZoneGDD, []) : undefined,
    phaseAwareCumulativeCapTransitionZoneGDD: opts.phaseAwareCumulativeCapTransitionZoneGDD ? parseList(opts.phaseAwareCumulativeCapTransitionZoneGDD, []) : undefined,
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
  // Iter 15 (SSOT #156)
  gddPerTruss?: number;
  // Iter 6d — cohort generation (optional)
  flowersPerTrussMu?: number;
  fruitSetRate?: number;
  // Iter 6f — abortion (optional)
  abortionThresholdRatio?: number;
  abortionLagDays?: number;
  // Iter 6h — visibility gate (optional)
  visibilityGateMode?: 'diameter_only' | 'phase' | 'phase_and_gdd';
  minFruitAgeGDDForVisible?: number;
  // Iter 6e — surplusPolicy (optional). Iter 6e-2 — fruit_priority_limited 추가.
  surplusPolicy?: 'unused_pool' | 'redistribute_to_vegetative' | 'fruit_priority_limited';
  // Iter 6e-2 — fruit_priority_limited 강도 (0..1)
  fruitPriorityFraction?: number;
  // Iter 6e-3 (SSOT #87) — phase-aware cap multiplier (cellDivision은 1.0 고정, sweep 안 함)
  capCellExpansionRelax?: number;
  capRipeningRelax?: number;
  // Iter 7b (SSOT #103) — phaseAwareMassGrowth
  phaseAwareDivisionFraction?: number;
  phaseAwareExpansionMultiplier?: number;
  // Iter 7c (SSOT #106/#107) — expansionClockMode
  phaseAwareClockMode?: 'fertilization_based' | 'expansion_start_based';
  // Iter 9 (SSOT #116) — cellDivisionStepDemandFraction (0,1]
  phaseAwareCellDivStepDemandFraction?: number;
  // Iter 10 (SSOT #123) — transitionZoneGDD (>= 0)
  phaseAwareTransitionZoneGDD?: number;
  // Iter 11 (SSOT #129) — cumulativeCapTransitionZoneGDD (>= 0)
  phaseAwareCumulativeCapTransitionZoneGDD?: number;
}

function genVariants(args: CliArgs): Variant[] {
  const out: Variant[] = [];
  const cddList = args.cellDivisionDurationGDD ?? [undefined];
  const cedList = args.cellExpansionDurationGDD ?? [undefined];
  const gptList = args.gddPerTruss ?? [undefined];
  const fptList = args.flowersPerTrussMu ?? [undefined];
  const fsrList = args.fruitSetRate ?? [undefined];
  // Iter 6g (SSOT #73): abortionPairs가 있으면 pair-list 사용, 없으면 cross-product
  const abortionCombos: Array<{ thresh?: number; lag?: number }> =
    args.abortionPairs && args.abortionPairs.length > 0
      ? args.abortionPairs.map(p => ({ thresh: p.thresh, lag: p.lag }))
      : (() => {
          const atrList = args.abortionThresholdRatio ?? [undefined];
          const aldList = args.abortionLagDays ?? [undefined];
          const combos: Array<{ thresh?: number; lag?: number }> = [];
          for (const t of atrList) for (const l of aldList) combos.push({ thresh: t, lag: l });
          return combos;
        })();
  // Iter 6h (SSOT #74): visibility axes
  const vgmList = args.visibilityGateMode ?? [undefined];
  const vagList = args.minFruitAgeGDDForVisible ?? [undefined];
  // Iter 6e (SSOT #78): surplusPolicy axis
  const spList = args.surplusPolicy ?? [undefined];
  // Iter 6e-2 (SSOT #85): fruitPriorityFraction axis
  const fpfList = args.fruitPriorityFraction ?? [undefined];
  // Iter 6e-3 (SSOT #87): capRelaxPairs (cellExpansion:ripening pair-list, SSOT #73 패턴 재사용)
  const crpList: Array<{ cellExpansion?: number; ripening?: number }> =
    args.capRelaxPairs && args.capRelaxPairs.length > 0
      ? args.capRelaxPairs.map(p => ({ cellExpansion: p.cellExpansion, ripening: p.ripening }))
      : [{ cellExpansion: undefined, ripening: undefined }];
  // Iter 7b (SSOT #103): phaseAware axes
  const padfList = args.phaseAwareDivisionFraction ?? [undefined];
  const paemList = args.phaseAwareExpansionMultiplier ?? [undefined];
  // Iter 7c (SSOT #106/#107): expansionClockMode axis
  const pacmList: Array<'fertilization_based' | 'expansion_start_based' | undefined> =
    args.phaseAwareExpansionClockMode ?? [undefined];
  // Iter 9 (SSOT #116): cellDivisionStepDemandFraction axis
  const cdsfList = args.phaseAwareCellDivStepDemandFraction ?? [undefined];
  // Iter 10 (SSOT #123): transitionZoneGDD axis
  const tzgList = args.phaseAwareTransitionZoneGDD ?? [undefined];
  // Iter 11 (SSOT #129): cumulativeCapTransitionZoneGDD axis
  const cctzgList = args.phaseAwareCumulativeCapTransitionZoneGDD ?? [undefined];
  for (const ic of args.inflectionC) {
    for (const rb of args.rateB) {
      for (const exp of args.exponentScaling) {
        for (const cdd of cddList) {
          for (const ced of cedList) {
            for (const gpt of gptList) {
            for (const fpt of fptList) {
              for (const fsr of fsrList) {
                for (const ab of abortionCombos) {
                  for (const vgm of vgmList) {
                    for (const vag of vagList) {
                      for (const sp of spList) {
                        for (const fpf of fpfList) {
                          for (const crp of crpList) {
                            for (const padf of padfList) {
                              for (const paem of paemList) {
                                for (const pacm of pacmList) {
                                  for (const cdsf of cdsfList) {
                                    for (const tzg of tzgList) {
                                      for (const cctzg of cctzgList) {
                                        out.push({
                                          inflectionC: ic, rateB: rb, exponentScaling: exp,
                                          cellDivisionDurationGDD: cdd, cellExpansionDurationGDD: ced,
                                          flowersPerTrussMu: fpt, fruitSetRate: fsr,
                                          abortionThresholdRatio: ab.thresh, abortionLagDays: ab.lag,
                                          visibilityGateMode: vgm, minFruitAgeGDDForVisible: vag,
                                          surplusPolicy: sp,
                                          fruitPriorityFraction: fpf,
                                          capCellExpansionRelax: crp.cellExpansion,
                                          capRipeningRelax: crp.ripening,
                                          phaseAwareDivisionFraction: padf,
                                          phaseAwareExpansionMultiplier: paem,
                                          phaseAwareClockMode: pacm,
                                          phaseAwareCellDivStepDemandFraction: cdsf,
                                          phaseAwareTransitionZoneGDD: tzg,
                                          phaseAwareCumulativeCapTransitionZoneGDD: cctzg,
                                          gddPerTruss: gpt,
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
                    }
                  }
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
  // Iter 15 (SSOT #156) — gddPerTruss 추가
  if (v.cellDivisionDurationGDD !== undefined || v.cellExpansionDurationGDD !== undefined || v.gddPerTruss !== undefined) {
    const parts: string[] = [];
    if (v.cellDivisionDurationGDD !== undefined) parts.push(`cellDivisionDurationGDD=${v.cellDivisionDurationGDD}`);
    if (v.cellExpansionDurationGDD !== undefined) parts.push(`cellExpansionDurationGDD=${v.cellExpansionDurationGDD}`);
    if (v.gddPerTruss !== undefined) parts.push(`gddPerTruss=${v.gddPerTruss}`);
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
  // Iter 6h — visibility gate override (if variant has visibility fields)
  if (v.visibilityGateMode !== undefined || v.minFruitAgeGDDForVisible !== undefined) {
    const parts: string[] = [];
    if (v.visibilityGateMode !== undefined) parts.push(`gateMode=${v.visibilityGateMode}`);
    if (v.minFruitAgeGDDForVisible !== undefined) parts.push(`minFruitAgeGDDForVisible=${v.minFruitAgeGDDForVisible}`);
    cliArgs.push('--overrideVisibility', parts.join(','));
  }
  // Iter 6e — massFlow surplusPolicy override. Iter 6e-2 — fruitPriorityFraction 추가.
  // Iter 6e-3 (SSOT #87) — phase-aware cap multiplier (capCellExpansionRelax/capRipeningRelax).
  // Iter 7b (SSOT #103) — phaseAwareMassGrowth (divisionFraction + expansionMultiplier).
  if (v.surplusPolicy !== undefined
   || v.fruitPriorityFraction !== undefined
   || v.capCellExpansionRelax !== undefined
   || v.capRipeningRelax !== undefined
   || v.phaseAwareDivisionFraction !== undefined
   || v.phaseAwareExpansionMultiplier !== undefined
   || v.phaseAwareCellDivStepDemandFraction !== undefined
   || v.phaseAwareTransitionZoneGDD !== undefined
   || v.phaseAwareCumulativeCapTransitionZoneGDD !== undefined) {
    const parts: string[] = [];
    if (v.surplusPolicy !== undefined) parts.push(`surplusPolicy=${v.surplusPolicy}`);
    if (v.fruitPriorityFraction !== undefined) parts.push(`fruitPriorityRedistributionFraction=${v.fruitPriorityFraction}`);
    if (v.capCellExpansionRelax !== undefined) parts.push(`cellExpansionRelax=${v.capCellExpansionRelax}`);
    if (v.capRipeningRelax !== undefined) parts.push(`ripeningRelax=${v.capRipeningRelax}`);
    if (v.phaseAwareDivisionFraction !== undefined
     || v.phaseAwareCellDivStepDemandFraction !== undefined
     || v.phaseAwareTransitionZoneGDD !== undefined
     || v.phaseAwareCumulativeCapTransitionZoneGDD !== undefined) {
      parts.push(`phaseAwareEnabled=true`);
    }
    if (v.phaseAwareDivisionFraction !== undefined) parts.push(`phaseAwareDivisionFraction=${v.phaseAwareDivisionFraction}`);
    if (v.phaseAwareExpansionMultiplier !== undefined) parts.push(`phaseAwareExpansionMultiplier=${v.phaseAwareExpansionMultiplier}`);
    if (v.phaseAwareClockMode !== undefined) parts.push(`phaseAwareClockMode=${v.phaseAwareClockMode}`);
    if (v.phaseAwareCellDivStepDemandFraction !== undefined) parts.push(`phaseAwareCellDivStepDemandFraction=${v.phaseAwareCellDivStepDemandFraction}`);
    if (v.phaseAwareTransitionZoneGDD !== undefined) parts.push(`phaseAwareTransitionZoneGDD=${v.phaseAwareTransitionZoneGDD}`);
    if (v.phaseAwareCumulativeCapTransitionZoneGDD !== undefined) parts.push(`phaseAwareCumulativeCapTransitionZoneGDD=${v.phaseAwareCumulativeCapTransitionZoneGDD}`);
    cliArgs.push('--overrideMassFlow', parts.join(','));
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
  if (args.gddPerTruss) axes.push(`gddPerTruss=${args.gddPerTruss.length}`);
  if (args.flowersPerTrussMu) axes.push(`flowersMu=${args.flowersPerTrussMu.length}`);
  if (args.fruitSetRate) axes.push(`fruitSetRate=${args.fruitSetRate.length}`);
  if (args.abortionPairs) {
    axes.push(`abortPairs=${args.abortionPairs.length}`);
  } else {
    if (args.abortionThresholdRatio) axes.push(`abortThresh=${args.abortionThresholdRatio.length}`);
    if (args.abortionLagDays) axes.push(`abortLag=${args.abortionLagDays.length}`);
  }
  if (args.visibilityGateMode) axes.push(`visGateMode=${args.visibilityGateMode.length}`);
  if (args.minFruitAgeGDDForVisible) axes.push(`visGDD=${args.minFruitAgeGDDForVisible.length}`);
  if (args.surplusPolicy) axes.push(`surplus=${args.surplusPolicy.length}`);
  if (args.fruitPriorityFraction) axes.push(`fpf=${args.fruitPriorityFraction.length}`);
  if (args.capRelaxPairs) axes.push(`capRelaxPairs=${args.capRelaxPairs.length}`);
  if (args.phaseAwareDivisionFraction) axes.push(`phaseAwareDivFrac=${args.phaseAwareDivisionFraction.length}`);
  if (args.phaseAwareExpansionMultiplier) axes.push(`phaseAwareExpMul=${args.phaseAwareExpansionMultiplier.length}`);
  if (args.phaseAwareExpansionClockMode) axes.push(`phaseAwareClockMode=${args.phaseAwareExpansionClockMode.length}`);
  if (args.phaseAwareCellDivStepDemandFraction) axes.push(`phaseAwareCellDivStepDemandFraction=${args.phaseAwareCellDivStepDemandFraction.length}`);
  if (args.phaseAwareTransitionZoneGDD) axes.push(`phaseAwareTransitionZoneGDD=${args.phaseAwareTransitionZoneGDD.length}`);
  if (args.phaseAwareCumulativeCapTransitionZoneGDD) axes.push(`phaseAwareCumulativeCapTransitionZoneGDD=${args.phaseAwareCumulativeCapTransitionZoneGDD.length}`);
  console.log(`  variants: ${variants.length} (${axes.join(' × ')})`);
  console.log(`  output: ${join(args.sweepRoot, args.sweepId)}`);

  const sweepDir = join(args.sweepRoot, args.sweepId);
  if (!existsSync(sweepDir)) mkdirSync(sweepDir, { recursive: true });

  const runs: RunOutput[] = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const runId = `run_${String(i + 1).padStart(3, '0')}`;
    const phStr = (v.cellDivisionDurationGDD !== undefined || v.cellExpansionDurationGDD !== undefined || v.gddPerTruss !== undefined)
      ? ` cellDiv=${v.cellDivisionDurationGDD ?? '-'} cellExp=${v.cellExpansionDurationGDD ?? '-'} gpt=${v.gddPerTruss ?? '-'}` : '';
    const coStr = (v.flowersPerTrussMu !== undefined || v.fruitSetRate !== undefined)
      ? ` flowersMu=${v.flowersPerTrussMu ?? '-'} fsr=${v.fruitSetRate ?? '-'}` : '';
    const abStr = (v.abortionThresholdRatio !== undefined || v.abortionLagDays !== undefined)
      ? ` abortThresh=${v.abortionThresholdRatio ?? '-'} abortLag=${v.abortionLagDays ?? '-'}` : '';
    const viStr = (v.visibilityGateMode !== undefined || v.minFruitAgeGDDForVisible !== undefined)
      ? ` visMode=${v.visibilityGateMode ?? '-'} visGDD=${v.minFruitAgeGDDForVisible ?? '-'}` : '';
    const spStr = (v.surplusPolicy !== undefined || v.fruitPriorityFraction !== undefined)
      ? ` surplus=${v.surplusPolicy ?? '-'} fpf=${v.fruitPriorityFraction ?? '-'}` : '';
    const crStr = (v.capCellExpansionRelax !== undefined || v.capRipeningRelax !== undefined)
      ? ` capExp=${v.capCellExpansionRelax ?? '-'} capRip=${v.capRipeningRelax ?? '-'}` : '';
    const paStr = (v.phaseAwareDivisionFraction !== undefined || v.phaseAwareExpansionMultiplier !== undefined || v.phaseAwareClockMode !== undefined || v.phaseAwareCellDivStepDemandFraction !== undefined || v.phaseAwareTransitionZoneGDD !== undefined || v.phaseAwareCumulativeCapTransitionZoneGDD !== undefined)
      ? ` pa.divFrac=${v.phaseAwareDivisionFraction ?? '-'} pa.expMul=${v.phaseAwareExpansionMultiplier ?? '-'} pa.clock=${v.phaseAwareClockMode ?? '-'} pa.cdsFrac=${v.phaseAwareCellDivStepDemandFraction ?? '-'} pa.tzg=${v.phaseAwareTransitionZoneGDD ?? '-'} pa.cctzg=${v.phaseAwareCumulativeCapTransitionZoneGDD ?? '-'}` : '';
    process.stdout.write(`  [${i + 1}/${variants.length}] ${runId} inflectionC=${v.inflectionC} rateB=${v.rateB} exp=${v.exponentScaling}${phStr}${coStr}${abStr}${viStr}${spStr}${crStr}${paStr} ... `);
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
