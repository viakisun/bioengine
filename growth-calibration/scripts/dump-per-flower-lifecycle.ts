// dump-per-flower-lifecycle — Iter 6i Phase A (per-flower lifecycle audit, read-only).
//
// 목적:
//   매 flower instance별 lifecycle event timeline + 6-state aggregate 분류로
//   T1/T6/T7 abortion anomaly의 진짜 reason (flower drop vs starvation) 분리 진단.
//
// 본 script는 진단 전용 — 어떠한 model 파라미터도 mutation 하지 않음.
// dropReason 필드는 Iter 6i Phase B에서 engine에 추가됨; 본 script는 아직 derive만.
//
// 6-state aggregate (SSOT #91):
//   harvested === true                              → 'harvested'
//   aborted === true && fertilizationTT < 0         → 'flower_drop'           (dropReason 'fruit_set_fail')
//   aborted === true && fertilizationTT > 0         → 'starvation_aborted'    (dropReason 'starvation')
//   fertilizationTT > 0 && !aborted && !harvested   → 'fertilized_alive'
//   fertilizationTT < 0 && state.TT < anthesisTT    → 'flower_bud'
//   fertilizationTT < 0 && state.TT >= anthesisTT   → 'open_flower_transient'  (현재 engine 1-tick)
//
// Output:
//   growth-calibration/audits/per-flower-lifecycle/{modelVersion}/
//     per_flower_lifecycle.csv          (한 row = 한 fruit instance)
//     per_truss_conversion_funnel.csv   (truss 단위 6-state 집계 + 비율)
//     summary.md                        (anomaly auto-detection + 해석)
//     summary.json
//
// Usage:
//   npx vite-node growth-calibration/scripts/dump-per-flower-lifecycle.ts -- \
//     --modelVersion v0.11.1-stage-fixed \
//     --cultivar tomimaru-muchoo \
//     --seed 20260525 \
//     --maxDay 100

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { GrowthEngine } from '../../packages/tomato-engine/src/GrowthEngine';
import { getCultivar } from '../../packages/tomato-engine/src/Cultivar';
import { DEFAULT_CLIMATE } from '../../packages/tomato-engine/src/CoreModel';

// ── CLI ───────────────────────────────────────────────────────────────

interface CliArgs {
  cultivar: string;
  seed: number;
  maxDay: number;
  modelVersion: string;
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
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    seed: opts.seed ? Number(opts.seed) : 20260525,
    maxDay: opts.maxDay ? Number(opts.maxDay) : 100,
    modelVersion: opts.modelVersion ?? 'v0.11.1-stage-fixed',
    outRoot: opts.outRoot ?? join(__dirname, '..', 'audits', 'per-flower-lifecycle'),
  };
}

// ── Lifecycle types ───────────────────────────────────────────────────

type LifecycleState =
  | 'flower_bud'
  | 'open_flower_transient'
  | 'flower_drop'
  | 'fertilized_alive'
  | 'starvation_aborted'
  | 'pruning_aborted'        // Iter 6i Phase B 발견 — scenario.management.fruitPruning (horticultural)
  | 'harvested'
  | 'unknown_aborted';       // aborted && dropReason === null (invariant 감시)

type DropReason = 'fruit_set_fail' | 'starvation' | 'pruning' | null;

interface PerFruitEvent {
  trussIndex: number;        // 1-based
  flowerIndex: number;       // 0-based within truss
  createdDay: number;
  createdTT: number;
  anthesisTT: number;        // pre-set per FruitCohort
  anthesisDay: number | null;       // first day state.TT >= anthesisTT
  fertilizationTT: number;          // -1 if never
  fertilizationDay: number | null;
  cellDivisionEndTT: number;
  cellDivisionEndDay: number | null;
  ripenStartTT: number;
  ripenStartDay: number | null;
  abortedDay: number | null;        // first day fruit.aborted observed
  abortedAtTT: number | null;       // state.TT at first observed abortion
  harvestedDay: number | null;
  // derived at maxDay:
  finalState: LifecycleState;
  finalDropReason: DropReason;
  gddSinceFertAtMaxDay: number;
  diameterAtMaxDay: number;
  potentialMassG: number;
}

interface FruitLike {
  fertilizationTT: number;
  anthesisTT: number;
  cellDivisionEndTT: number;
  ripenStartTT: number;
  aborted: boolean;
  // Iter 6i (SSOT #90) — dropReason discriminator, optional for safety (engine may have legacy paths)
  dropReason?: 'fruit_set_fail' | 'starvation' | 'pruning' | null;
  harvested: boolean;
  diameter: number;
  genome: { potentialMassG: number };
}

interface TrussLike {
  emergenceTT: number;
  flowerCount: number;
  fruits: ReadonlyArray<FruitLike>;
}

interface PhysiologyLike {
  TT: number;
  trusses: ReadonlyArray<TrussLike>;
}

// ── Per-flower tracker (stable identity = trussIndex × flowerIndex) ──

function trackerKey(trussIndex: number, flowerIndex: number): string {
  return `${trussIndex}:${flowerIndex}`;
}

function newEvent(trussIndex: number, flowerIndex: number, day: number, tt: number, f: FruitLike): PerFruitEvent {
  return {
    trussIndex, flowerIndex,
    createdDay: day, createdTT: tt,
    anthesisTT: f.anthesisTT,
    anthesisDay: null,
    fertilizationTT: -1,
    fertilizationDay: null,
    cellDivisionEndTT: -1,
    cellDivisionEndDay: null,
    ripenStartTT: -1,
    ripenStartDay: null,
    abortedDay: null,
    abortedAtTT: null,
    harvestedDay: null,
    finalState: 'flower_bud',
    finalDropReason: null,
    gddSinceFertAtMaxDay: 0,
    diameterAtMaxDay: 0,
    potentialMassG: f.genome.potentialMassG,
  };
}

function updateEvent(e: PerFruitEvent, f: FruitLike, day: number, tt: number): void {
  if (e.anthesisDay === null && tt >= f.anthesisTT) {
    e.anthesisDay = day;
  }
  if (e.fertilizationDay === null && f.fertilizationTT > 0) {
    e.fertilizationDay = day;
    e.fertilizationTT = f.fertilizationTT;
  }
  if (e.cellDivisionEndDay === null && f.cellDivisionEndTT > 0) {
    e.cellDivisionEndDay = day;
    e.cellDivisionEndTT = f.cellDivisionEndTT;
  }
  if (e.ripenStartDay === null && f.ripenStartTT > 0) {
    e.ripenStartDay = day;
    e.ripenStartTT = f.ripenStartTT;
  }
  if (e.abortedDay === null && f.aborted) {
    e.abortedDay = day;
    e.abortedAtTT = tt;
  }
  if (e.harvestedDay === null && f.harvested) {
    e.harvestedDay = day;
  }
}

function deriveFinalState(f: FruitLike, tt: number): { state: LifecycleState; dropReason: DropReason } {
  // Iter 6i Phase B: dropReason 필드 사용 (SSOT #90). aborted=true && dropReason=null이면 unknown_aborted.
  if (f.harvested) return { state: 'harvested', dropReason: null };
  if (f.aborted) {
    const dr = f.dropReason ?? null;
    if (dr === 'fruit_set_fail') return { state: 'flower_drop', dropReason: 'fruit_set_fail' };
    if (dr === 'starvation') return { state: 'starvation_aborted', dropReason: 'starvation' };
    if (dr === 'pruning') return { state: 'pruning_aborted', dropReason: 'pruning' };
    return { state: 'unknown_aborted', dropReason: null };
  }
  if (f.fertilizationTT > 0) return { state: 'fertilized_alive', dropReason: null };
  if (tt < f.anthesisTT) return { state: 'flower_bud', dropReason: null };
  return { state: 'open_flower_transient', dropReason: null };
}

// ── Per-truss conversion funnel ───────────────────────────────────────

interface ConversionRow {
  trussIndex: number;
  flowerBudCount: number;
  openFlowerTransientCount: number;
  flowerDropCount: number;
  fertilizedTotalCount: number;       // fertilizationTT > 0 (alive + aborted + harvested)
  fertilizedAliveCount: number;       // fertilizationTT > 0 && !aborted && !harvested
  starvationAbortedCount: number;
  pruningAbortedCount: number;        // Iter 6i Phase B 발견 (horticultural pruning)
  harvestedCount: number;
  unknownAbortedCount: number;        // 사용자 검토 #3 — invariant 감시 (정상이면 0)
  sumTotal: number;                   // 7-state sum == fruits.length
  fruitsLength: number;               // for conservation check
  fruitSetRateObserved: number;       // fertilized_total / (fertilized_total + flower_drop)
  postFertAbortionRate: number;       // starvation_aborted / fertilized_total
  pruningRate: number;                // pruning_aborted / fertilized_total
  survivalRate: number;               // fertilized_alive / fertilized_total
}

function buildConversion(physiology: PhysiologyLike): ConversionRow[] {
  const out: ConversionRow[] = [];
  for (let i = 0; i < physiology.trusses.length; i++) {
    const t = physiology.trusses[i];
    let bud = 0, openTr = 0, drop = 0, alive = 0, starve = 0, prune = 0, harvested = 0, unknown = 0, fertilizedTotal = 0;
    for (const f of t.fruits) {
      const { state } = deriveFinalState(f, physiology.TT);
      if (state === 'flower_bud') bud++;
      else if (state === 'open_flower_transient') openTr++;
      else if (state === 'flower_drop') drop++;
      else if (state === 'fertilized_alive') alive++;
      else if (state === 'starvation_aborted') starve++;
      else if (state === 'pruning_aborted') prune++;
      else if (state === 'harvested') harvested++;
      else if (state === 'unknown_aborted') unknown++;
      if (f.fertilizationTT > 0) fertilizedTotal++;
    }
    const sum = bud + openTr + drop + alive + starve + prune + harvested + unknown;
    out.push({
      trussIndex: i + 1,
      flowerBudCount: bud,
      openFlowerTransientCount: openTr,
      flowerDropCount: drop,
      fertilizedTotalCount: fertilizedTotal,
      fertilizedAliveCount: alive,
      starvationAbortedCount: starve,
      pruningAbortedCount: prune,
      harvestedCount: harvested,
      unknownAbortedCount: unknown,
      sumTotal: sum,
      fruitsLength: t.fruits.length,
      fruitSetRateObserved: (fertilizedTotal + drop) > 0 ? fertilizedTotal / (fertilizedTotal + drop) : 0,
      postFertAbortionRate: fertilizedTotal > 0 ? starve / fertilizedTotal : 0,
      pruningRate: fertilizedTotal > 0 ? prune / fertilizedTotal : 0,
      survivalRate: fertilizedTotal > 0 ? alive / fertilizedTotal : 0,
    });
  }
  return out;
}

// ── CSV writers ───────────────────────────────────────────────────────

function csvRow(values: Array<string | number | null>): string {
  return values.map(v => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
    return String(v);
  }).join(',');
}

function buildPerFruitCsv(events: PerFruitEvent[]): string {
  const header = [
    'truss_index', 'flower_index',
    'created_day', 'created_TT', 'anthesis_TT', 'anthesis_day',
    'fertilization_TT', 'fertilization_day',
    'cell_division_end_TT', 'cell_division_end_day',
    'ripen_start_TT', 'ripen_start_day',
    'aborted_day', 'aborted_at_TT', 'harvested_day',
    'final_state', 'final_drop_reason',
    'gdd_since_fert_at_maxDay', 'diameter_at_maxDay_mm', 'potential_mass_g',
  ];
  const lines = [header.join(',')];
  for (const e of events) {
    lines.push(csvRow([
      e.trussIndex, e.flowerIndex,
      e.createdDay, e.createdTT, e.anthesisTT, e.anthesisDay,
      e.fertilizationTT, e.fertilizationDay,
      e.cellDivisionEndTT, e.cellDivisionEndDay,
      e.ripenStartTT, e.ripenStartDay,
      e.abortedDay, e.abortedAtTT, e.harvestedDay,
      e.finalState, e.finalDropReason,
      e.gddSinceFertAtMaxDay, e.diameterAtMaxDay, e.potentialMassG,
    ]));
  }
  return lines.join('\n') + '\n';
}

function buildConversionCsv(rows: ConversionRow[]): string {
  const header = [
    'truss_index',
    'flower_bud_count', 'open_flower_transient_count', 'flower_drop_count',
    'fertilized_total_count', 'fertilized_alive_count',
    'starvation_aborted_count', 'pruning_aborted_count', 'harvested_count',
    'unknown_aborted_count',
    'sum_total', 'fruits_length',
    'fruit_set_rate_observed', 'post_fert_abortion_rate', 'pruning_rate', 'survival_rate',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(csvRow([
      r.trussIndex,
      r.flowerBudCount, r.openFlowerTransientCount, r.flowerDropCount,
      r.fertilizedTotalCount, r.fertilizedAliveCount,
      r.starvationAbortedCount, r.pruningAbortedCount, r.harvestedCount,
      r.unknownAbortedCount,
      r.sumTotal, r.fruitsLength,
      r.fruitSetRateObserved, r.postFertAbortionRate, r.pruningRate, r.survivalRate,
    ]));
  }
  return lines.join('\n') + '\n';
}

// ── Anomaly auto-detection ────────────────────────────────────────────

function buildSummary(args: CliArgs, events: PerFruitEvent[], conversion: ConversionRow[]): string {
  const lines: string[] = [];
  lines.push(`# Per-Flower Lifecycle Audit — ${args.modelVersion}`);
  lines.push('');
  lines.push(`- cultivar: \`${args.cultivar}\``);
  lines.push(`- seed: ${args.seed}`);
  lines.push(`- maxDay: ${args.maxDay}`);
  lines.push(`- trusses observed: ${conversion.length}`);
  lines.push(`- total fruit instances: ${events.length}`);
  lines.push('');
  lines.push('> 본 audit은 진단 전용 — 어떠한 model 파라미터도 수정하지 않았습니다.');
  lines.push('> 6-state aggregate 분류 (SSOT #91): flower_bud, open_flower_transient,');
  lines.push('> flower_drop, fertilized_alive, starvation_aborted, harvested.');
  lines.push('');

  // 1. Per-truss conversion funnel (Iter 6i Phase B — 7-state)
  lines.push('## 1. Per-Truss Conversion Funnel (7-state aggregate, end of day ' + args.maxDay + ')');
  lines.push('');
  lines.push('| Truss | bud | open(tr) | drop | fert_total | fert_alive | starve | prune | harv | unk | sum | fruits.length | conservation | fruitSet% | postFertAbort% | prune% | survival% |');
  lines.push('|-------|----:|---------:|-----:|-----------:|-----------:|-------:|------:|-----:|----:|----:|--------------:|:------------:|----------:|---------------:|-------:|----------:|');
  for (const c of conversion) {
    const pct = (x: number): string => (x * 100).toFixed(1);
    const conservation = c.sumTotal === c.fruitsLength ? '✓' : '✗ BROKEN';
    lines.push(`| T${c.trussIndex} | ${c.flowerBudCount} | ${c.openFlowerTransientCount} | ${c.flowerDropCount} | ${c.fertilizedTotalCount} | ${c.fertilizedAliveCount} | ${c.starvationAbortedCount} | ${c.pruningAbortedCount} | ${c.harvestedCount} | ${c.unknownAbortedCount} | ${c.sumTotal} | ${c.fruitsLength} | ${conservation} | ${pct(c.fruitSetRateObserved)} | ${pct(c.postFertAbortionRate)} | ${pct(c.pruningRate)} | ${pct(c.survivalRate)} |`);
  }
  lines.push('');

  // 2. Conservation check
  const broken = conversion.filter(c => c.sumTotal !== c.fruitsLength);
  lines.push('## 2. Conservation Invariant Check');
  lines.push('');
  if (broken.length === 0) {
    lines.push(`✓ All ${conversion.length} trusses: 6-state sum == fruits.length (conservation 성립).`);
  } else {
    lines.push(`✗ ${broken.length} trusses with broken conservation:`);
    for (const c of broken) {
      lines.push(`  - T${c.trussIndex}: sum=${c.sumTotal} vs fruits.length=${c.fruitsLength} (diff=${c.sumTotal - c.fruitsLength})`);
    }
  }
  lines.push('');

  // 3. Anomaly auto-detection
  lines.push('## 3. Anomaly Auto-Detection');
  lines.push('');
  const anomalies: string[] = [];

  // 3a. 4-way abortion reason distribution (drop / starve / prune / unknown)
  const totalDrop = conversion.reduce((s, c) => s + c.flowerDropCount, 0);
  const totalStarve = conversion.reduce((s, c) => s + c.starvationAbortedCount, 0);
  const totalPrune = conversion.reduce((s, c) => s + c.pruningAbortedCount, 0);
  const totalUnknown = conversion.reduce((s, c) => s + c.unknownAbortedCount, 0);
  const totalAbortedAny = totalDrop + totalStarve + totalPrune + totalUnknown;
  if (totalAbortedAny > 0) {
    const pct = (n: number): string => (n / totalAbortedAny * 100).toFixed(1);
    anomalies.push(`⚙ **Aborted total ${totalAbortedAny}** = flower_drop ${totalDrop} (${pct(totalDrop)}%) + starvation_aborted ${totalStarve} (${pct(totalStarve)}%) + pruning_aborted ${totalPrune} (${pct(totalPrune)}%) + unknown ${totalUnknown} (${pct(totalUnknown)}%). 기존 audit의 "aborted"는 이 4종이 섞여 있음 — 진단 noise confirmed.`);
  }

  // 3a-bis. unknown_aborted invariant 감시 (사용자 검토 #3)
  if (totalUnknown > 0) {
    anomalies.push(`⚠⚠ **unknown_aborted ${totalUnknown}** > 0 — engine 어딘가 dropReason 미설정 abortion path 존재. Phase B 즉시 디버그 필요 (invariant 깨짐).`);
  }

  // 3b. T1 abortion 100% — reason 명확화
  const t1 = conversion.find(c => c.trussIndex === 1);
  if (t1) {
    const t1AbortedTotal = t1.flowerDropCount + t1.starvationAbortedCount + t1.pruningAbortedCount + t1.unknownAbortedCount;
    const t1AbortRate = t1.fruitsLength > 0 ? (t1AbortedTotal / t1.fruitsLength * 100) : 0;
    if (t1AbortRate >= 80) {
      const dominant = Math.max(t1.flowerDropCount, t1.starvationAbortedCount, t1.pruningAbortedCount);
      let reason: string;
      if (dominant === t1.starvationAbortedCount) {
        reason = `**starvation_aborted** (${t1.starvationAbortedCount}/${t1AbortedTotal}) — post-fert Marcelis abortion이 dominant. abortionThreshold lever 후보 (Iter 6f-revisit).`;
      } else if (dominant === t1.flowerDropCount) {
        reason = `**flower_drop** (${t1.flowerDropCount}/${t1AbortedTotal}) — anthesis fruitSetRate fail이 dominant. fruitSetRate / setDelayDays lever (Iter 6j).`;
      } else {
        reason = `**pruning_aborted** (${t1.pruningAbortedCount}/${t1AbortedTotal}) — horticultural pruning이 dominant. trussTargetFruitCount 검토.`;
      }
      anomalies.push(`⚠ **T1 abortion rate ${t1AbortRate.toFixed(0)}%** (${t1AbortedTotal}/${t1.fruitsLength}) → ${reason}`);
    }
  }

  // 3c. flower_drop > fertilized_total per truss
  for (const c of conversion) {
    if (c.flowerDropCount > c.fertilizedTotalCount && c.flowerDropCount > 0) {
      anomalies.push(`⚠ T${c.trussIndex}: flower_drop ${c.flowerDropCount} > fertilized_total ${c.fertilizedTotalCount} → fruitSetRate 매우 낮음 또는 anthesis 직후 fail dominant.`);
    }
  }

  // 3d. fertilization timing (first per truss)
  for (const c of conversion) {
    const t_events = events.filter(e => e.trussIndex === c.trussIndex);
    const fertEvents = t_events.filter(e => e.fertilizationDay !== null);
    const anthEvents = t_events.filter(e => e.anthesisDay !== null);
    if (anthEvents.length > 0) {
      const firstAnth = Math.min(...anthEvents.map(e => e.anthesisDay!));
      const firstFert = fertEvents.length > 0 ? Math.min(...fertEvents.map(e => e.fertilizationDay!)) : null;
      const delay = firstFert !== null ? firstFert - firstAnth : null;
      if (delay !== null && delay > 1) {
        anomalies.push(`⚠ T${c.trussIndex}: anthesis day ${firstAnth} → fertilization day ${firstFert} (delay ${delay}d) — 현재 engine은 instant fertilization 인데 delay > 0 (Iter 6j setDelayDays 활성화 후 의미 있음)`);
      }
    }
  }

  // 3e. open_flower_transient persistence — 거의 0이어야 정상 (현재 engine)
  const totalOpenTr = conversion.reduce((s, c) => s + c.openFlowerTransientCount, 0);
  if (totalOpenTr > 0) {
    anomalies.push(`⚙ **open_flower_transient total ${totalOpenTr}** (현재 engine 1-tick 만 존재 예상 → snapshot 시점에 우연히 잡힌 fruit). Iter 6j setDelayDays 활성화 시 persistent.`);
  }

  if (anomalies.length === 0) {
    lines.push('No anomalies detected.');
  } else {
    for (const a of anomalies) lines.push(`- ${a}`);
  }
  lines.push('');

  // 4. Final state distribution
  lines.push('## 4. Final State Distribution (all fruit instances)');
  lines.push('');
  const stateCount: Record<string, number> = {};
  for (const e of events) {
    stateCount[e.finalState] = (stateCount[e.finalState] ?? 0) + 1;
  }
  lines.push('| State | Count | % |');
  lines.push('|-------|------:|--:|');
  const stateOrder: LifecycleState[] = [
    'flower_bud', 'open_flower_transient', 'flower_drop',
    'fertilized_alive', 'starvation_aborted', 'pruning_aborted',
    'harvested', 'unknown_aborted',
  ];
  for (const s of stateOrder) {
    const cnt = stateCount[s] ?? 0;
    lines.push(`| \`${s}\` | ${cnt} | ${(cnt / events.length * 100).toFixed(1)} |`);
  }
  lines.push('');

  // 5. Phase B decision hint (Iter 6f-revisit / 6j 분기, 4-way)
  lines.push('## 5. Next Iter Decision Hint');
  lines.push('');
  const maxAbort = Math.max(totalDrop, totalStarve, totalPrune);
  if (totalAbortedAny === 0) {
    lines.push('- abortion 없음 — 다른 layer (cohort generation / phenology) 검토.');
  } else if (totalUnknown > 0) {
    lines.push(`- ⚠ unknown_aborted ${totalUnknown} 존재 — 다음 lever 결정 전에 invariant 깨짐 수정 필요.`);
  } else if (maxAbort === totalStarve) {
    lines.push(`- **starvation_aborted dominant** (${totalStarve} vs drop ${totalDrop}, prune ${totalPrune}) → Iter 6f-revisit (abortionThreshold / lagDays, starvation-only target) 가 다음 lever.`);
  } else if (maxAbort === totalDrop) {
    lines.push(`- **flower_drop dominant** (${totalDrop} vs starvation ${totalStarve}, prune ${totalPrune}) → Iter 6j (fruitSetRate / setDelayDays 활성화 / distal truss timing) 가 다음 lever.`);
  } else {
    lines.push(`- **pruning_aborted dominant** (${totalPrune} vs drop ${totalDrop}, starvation ${totalStarve}) → horticultural pruning 영역. trussTargetFruitCount 검토 (biology lever 아님).`);
  }
  lines.push('');

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const engine = new GrowthEngine();
  engine.setEnvironment({
    temperatureC: DEFAULT_CLIMATE.T_avg,
    lightHoursPerDay: DEFAULT_CLIMATE.daylight_hours,
    co2ppm: DEFAULT_CLIMATE.CO2_ppm,
  });
  engine.addPlant({ seed: args.seed, cultivarName: args.cultivar });

  const trackers = new Map<string, PerFruitEvent>();
  let lastPhysiology: PhysiologyLike | null = null;

  console.log(`[per-flower-lifecycle] ${args.cultivar} seed=${args.seed} day=1..${args.maxDay}`);
  for (let day = 1; day <= args.maxDay; day++) {
    engine.simulatePlantToHour(args.seed, day, 0, DEFAULT_CLIMATE);
    const physiology = engine.getPhysiologyState(args.seed)! as unknown as PhysiologyLike;
    lastPhysiology = physiology;
    for (let ti = 0; ti < physiology.trusses.length; ti++) {
      const t = physiology.trusses[ti];
      const trussIndex = ti + 1;
      for (let fi = 0; fi < t.fruits.length; fi++) {
        const key = trackerKey(trussIndex, fi);
        const f = t.fruits[fi];
        let e = trackers.get(key);
        if (!e) {
          e = newEvent(trussIndex, fi, day, physiology.TT, f);
          trackers.set(key, e);
        }
        updateEvent(e, f, day, physiology.TT);
      }
    }
  }

  if (!lastPhysiology) throw new Error('no physiology state captured');

  // Finalize each event with final state + diameter + gddSinceFert
  for (const t of lastPhysiology.trusses) {
    const ti = lastPhysiology.trusses.indexOf(t) + 1;
    for (let fi = 0; fi < t.fruits.length; fi++) {
      const key = trackerKey(ti, fi);
      const e = trackers.get(key);
      if (!e) continue;
      const f = t.fruits[fi];
      const { state, dropReason } = deriveFinalState(f, lastPhysiology.TT);
      e.finalState = state;
      e.finalDropReason = dropReason;
      e.gddSinceFertAtMaxDay = f.fertilizationTT > 0 ? lastPhysiology.TT - f.fertilizationTT : 0;
      e.diameterAtMaxDay = f.diameter;
    }
  }

  const events = [...trackers.values()].sort((a, b) =>
    a.trussIndex - b.trussIndex || a.flowerIndex - b.flowerIndex);
  const conversion = buildConversion(lastPhysiology);

  const outDir = join(args.outRoot, args.modelVersion);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'per_flower_lifecycle.csv'), buildPerFruitCsv(events));
  writeFileSync(join(outDir, 'per_truss_conversion_funnel.csv'), buildConversionCsv(conversion));
  writeFileSync(join(outDir, 'summary.md'), buildSummary(args, events, conversion));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({
    modelVersion: args.modelVersion,
    cultivar: args.cultivar,
    seed: args.seed,
    maxDay: args.maxDay,
    generatedAt: new Date().toISOString(),
    fruitInstanceCount: events.length,
    trussCount: conversion.length,
    conservationOk: conversion.every(c => c.sumTotal === c.fruitsLength),
  }, null, 2));

  console.log(`[per-flower-lifecycle] wrote ${outDir}`);
  console.log(`  - per_flower_lifecycle.csv (${events.length} fruit instances)`);
  console.log(`  - per_truss_conversion_funnel.csv (${conversion.length} trusses)`);
  console.log(`  - summary.md, summary.json`);
}

main().catch(e => {
  console.error('[per-flower-lifecycle] failed:', e);
  process.exit(1);
});
