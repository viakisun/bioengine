// dump-flower-fruit-phenology-audit — Iter 6e-3 parallel diagnostic audit.
//
// Causal audit, not calibration. Decomposes the funnel:
//   화방 발생 → 꽃눈 → 개화 → 착과 → 생존 → visible → 비대
// and assigns a causeLayer per (day, truss) cell so future calibration can
// target the actual broken stage instead of the surface metric.
//
// Plan: /Users/adminvia/.claude/plans/quizzical-snuggling-dahl.md
//
// Read-only. No model parameters are mutated. No engine code changed.
//
// Output:
//   growth-calibration/audits/flower-fruit-phenology/{modelVersion}/
//     day_truss_phenology.csv
//     truss_event_timeline.csv
//     flower_to_fruit_conversion.csv
//     cause_classification.csv
//     summary.md
//     summary.json
//
// Usage:
//   npx vite-node growth-calibration/scripts/dump-flower-fruit-phenology-audit.ts -- \
//     --modelVersion v0.11.1-stage-fixed \
//     --cultivar tomimaru-muchoo \
//     --seed 20260525 \
//     --days 30,33,40,50,60,70,80,90,100 \
//     --maxDay 100 \
//     --referenceBundle growth-calibration/reference/tomato/tomato_tomimaru_reference_v0.1

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GrowthEngine } from '../../packages/tomato-engine/src/GrowthEngine';
import { getCultivar } from '../../packages/tomato-engine/src/Cultivar';
import { DEFAULT_CLIMATE } from '../../packages/tomato-engine/src/CoreModel';
import { TRUSS_STATUS_ORDER } from '../schema/enums';

// ── CLI ───────────────────────────────────────────────────────────────

interface CliArgs {
  cultivar: string;
  seed: number;
  days: number[];
  maxDay: number;
  modelVersion: string;
  referenceBundle: string;
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
  const days = opts.days
    ? opts.days.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0)
    : [30, 33, 40, 50, 60, 70, 80, 90, 100];
  const maxDayDefault = Math.max(...days);
  return {
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    seed: opts.seed ? Number(opts.seed) : 20260525,
    days,
    maxDay: opts.maxDay ? Number(opts.maxDay) : maxDayDefault,
    modelVersion: opts.modelVersion ?? 'v0.11.1-stage-fixed',
    referenceBundle: opts.referenceBundle
      ?? 'growth-calibration/reference/tomato/tomato_tomimaru_reference_v0.1',
    outRoot: opts.outRoot ?? join(__dirname, '..', 'audits', 'flower-fruit-phenology'),
  };
}

// ── Reference loading ─────────────────────────────────────────────────

interface TrussTimelineTarget {
  trussIndex: number;
  visibleMin: number; visibleMax: number;
  flowerMin: number; flowerMax: number;
  fruitSetMin: number; fruitSetMax: number;
  visibleFruitMin: number; visibleFruitMax: number;
  expandingMin: number; expandingMax: number;
  breakerMin: number; breakerMax: number;
  attachedNodeMin: number; attachedNodeMax: number;
}

interface StatusByDayRow {
  day: number;
  trussIndex: number;
  allowedStatusMin: string;
  allowedStatusMax: string;
  expectedStatusNote: string;
  visibleFruitMin: number;
  visibleFruitMax: number;
  maxDiameterMmMin: number;
  maxDiameterMmMax: number;
}

function parseCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  return lines.map(l => l.split(','));
}

function loadTimelineTargets(bundlePath: string): TrussTimelineTarget[] {
  const text = readFileSync(join(bundlePath, '02_truss_timeline_target.csv'), 'utf8');
  const rows = parseCsv(text);
  const out: TrussTimelineTarget[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    out.push({
      trussIndex: Number(r[0]),
      visibleMin: Number(r[1]), visibleMax: Number(r[2]),
      flowerMin: Number(r[3]), flowerMax: Number(r[4]),
      fruitSetMin: Number(r[5]), fruitSetMax: Number(r[6]),
      visibleFruitMin: Number(r[7]), visibleFruitMax: Number(r[8]),
      expandingMin: Number(r[9]), expandingMax: Number(r[10]),
      breakerMin: Number(r[11]), breakerMax: Number(r[12]),
      attachedNodeMin: Number(r[13]), attachedNodeMax: Number(r[14]),
    });
  }
  return out;
}

function loadStatusByDay(bundlePath: string): StatusByDayRow[] {
  const text = readFileSync(join(bundlePath, '03_truss_status_by_day.csv'), 'utf8');
  const rows = parseCsv(text);
  const out: StatusByDayRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    out.push({
      day: Number(r[0]),
      trussIndex: Number(r[1]),
      allowedStatusMin: r[2],
      allowedStatusMax: r[3],
      expectedStatusNote: r[4],
      visibleFruitMin: Number(r[5]),
      visibleFruitMax: Number(r[6]),
      maxDiameterMmMin: Number(r[7]),
      maxDiameterMmMax: Number(r[8]),
    });
  }
  return out;
}

function lookupStatusByDay(
  matrix: StatusByDayRow[], day: number, trussIndex: number,
): StatusByDayRow | null {
  let best: StatusByDayRow | null = null;
  for (const r of matrix) {
    if (r.trussIndex !== trussIndex) continue;
    if (r.day === day) return r;
    if (r.day < day && (best === null || r.day > best.day)) best = r;
  }
  return best;
}

// ── Phenology helpers (replicated from extract-calibration-observations,
//   kept self-contained per plan D3) ──────────────────────────────────

type FruitPhase =
  | 'aborted' | 'pre_fertilization' | 'cell_division'
  | 'cell_expansion' | 'ripening_early' | 'ripening_late';

interface FruitLike {
  fertilizationTT: number;
  anthesisTT: number;
  ripenStage: number;
  aborted: boolean;
  harvested: boolean;
  diameter: number;
  // Iter 6i (SSOT #90) — abortion reason discriminator (OBSERVATION-ONLY)
  dropReason?: 'fruit_set_fail' | 'starvation' | 'pruning' | null;
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

interface CultivarLike {
  cellDivisionDurationGDD: number;
  cellExpansionDurationGDD: number;
  resolvedBotanical: {
    fruitDevelopment: {
      massFlow: {
        minVisibleDiameterMm: number;
        minExpandingDiameterMm: number;
        visibilityGateMode: 'diameter_only' | 'phase' | 'phase_and_gdd';
        minFruitAgeGDDForVisible: number;
      };
    };
  };
}

function fruitPhase(f: FruitLike, currentTT: number, cv: CultivarLike): {
  phase: FruitPhase; gddSinceFert: number;
} {
  const cellDiv = cv.cellDivisionDurationGDD;
  const ripenStart = cellDiv + cv.cellExpansionDurationGDD;
  const fertilized = f.fertilizationTT >= 0 && f.fertilizationTT > 0;
  const gddSinceFert = fertilized ? (currentTT - f.fertilizationTT) : 0;
  let phase: FruitPhase;
  if (f.aborted) phase = 'aborted';
  else if (!fertilized) phase = 'pre_fertilization';
  else if (gddSinceFert < cellDiv) phase = 'cell_division';
  else if (gddSinceFert < ripenStart) phase = 'cell_expansion';
  else if (f.ripenStage < 4) phase = 'ripening_early';
  else phase = 'ripening_late';
  return { phase, gddSinceFert };
}

function isVisibleFruit(f: FruitLike, currentTT: number, cv: CultivarLike): boolean {
  if (f.aborted || f.harvested) return false;
  if (f.fertilizationTT <= 0) return false;
  const mf = cv.resolvedBotanical.fruitDevelopment.massFlow;
  if (f.diameter < mf.minVisibleDiameterMm) return false;
  if (mf.visibilityGateMode === 'diameter_only') return true;
  const p = fruitPhase(f, currentTT, cv);
  if (p.phase === 'cell_division' || p.phase === 'pre_fertilization' || p.phase === 'aborted') return false;
  if (mf.visibilityGateMode === 'phase_and_gdd' && p.gddSinceFert < mf.minFruitAgeGDDForVisible) return false;
  return true;
}

function isExpandingFruit(f: FruitLike, currentTT: number, cv: CultivarLike): boolean {
  if (f.aborted || f.harvested || f.fertilizationTT <= 0) return false;
  const mf = cv.resolvedBotanical.fruitDevelopment.massFlow;
  if (f.diameter < mf.minExpandingDiameterMm) return false;
  const p = fruitPhase(f, currentTT, cv);
  return p.phase === 'cell_expansion' || p.phase === 'ripening_early' || p.phase === 'ripening_late';
}

function mapTrussStatus(t: TrussLike, currentTT: number, cv: CultivarLike): string {
  if (currentTT < t.emergenceTT) return 'not_visible';
  const live = t.fruits.filter(f => !f.aborted && !f.harvested);
  if (live.length === 0) return 'visible_bud';
  const maxStage = Math.max(...live.map(f => f.ripenStage));
  const hasFruit = live.some(f => f.fertilizationTT > 0);
  if (!hasFruit) return 'flowering';
  if (maxStage >= 5) return 'harvest_ready';
  if (maxStage >= 4) return 'red';
  if (maxStage >= 2) return 'breaker';
  const minExpand = cv.resolvedBotanical.fruitDevelopment.massFlow.minExpandingDiameterMm;
  const maxDiam = Math.max(...live.map(f => f.diameter));
  if (maxDiam >= minExpand) {
    const anyExpanding = live.some(f => isExpandingFruit(f, currentTT, cv));
    if (anyExpanding) return 'green_expanding';
    return 'small_green';
  }
  return 'fruit_set';
}

function statusIndex(s: string): number {
  const i = TRUSS_STATUS_ORDER.indexOf(s as typeof TRUSS_STATUS_ORDER[number]);
  return i < 0 ? -1 : i;
}

// ── Timeline event tracker ────────────────────────────────────────────

interface TrussTimeline {
  trussIndex: number;
  visibleTrussDay: number | null;
  firstBudDay: number | null;
  firstOpenFlowerDay: number | null;
  firstFertilizedDay: number | null;
  firstFruitCohortDay: number | null;
  firstVisibleFruitDay: number | null;
  firstExpandingFruitDay: number | null;
  firstRipeningDay: number | null;
}

function newTimeline(trussIndex: number): TrussTimeline {
  return {
    trussIndex,
    visibleTrussDay: null,
    firstBudDay: null,
    firstOpenFlowerDay: null,
    firstFertilizedDay: null,
    firstFruitCohortDay: null,
    firstVisibleFruitDay: null,
    firstExpandingFruitDay: null,
    firstRipeningDay: null,
  };
}

function updateTimeline(
  tl: TrussTimeline, t: TrussLike, currentTT: number, cv: CultivarLike, day: number,
): void {
  if (tl.visibleTrussDay === null && currentTT >= t.emergenceTT) tl.visibleTrussDay = day;
  if (tl.firstBudDay === null && t.flowerCount > 0) tl.firstBudDay = day;
  if (tl.firstOpenFlowerDay === null
      && t.fruits.some(f => f.fertilizationTT <= 0 && !f.aborted)) {
    tl.firstOpenFlowerDay = day;
  }
  if (tl.firstFertilizedDay === null
      && t.fruits.some(f => f.fertilizationTT > 0)) {
    tl.firstFertilizedDay = day;
  }
  if (tl.firstFruitCohortDay === null
      && t.fruits.some(f => f.fertilizationTT > 0 && !f.aborted && !f.harvested)) {
    tl.firstFruitCohortDay = day;
  }
  if (tl.firstVisibleFruitDay === null
      && t.fruits.some(f => isVisibleFruit(f, currentTT, cv))) {
    tl.firstVisibleFruitDay = day;
  }
  if (tl.firstExpandingFruitDay === null
      && t.fruits.some(f => isExpandingFruit(f, currentTT, cv))) {
    tl.firstExpandingFruitDay = day;
  }
  if (tl.firstRipeningDay === null
      && t.fruits.some(f => !f.aborted && !f.harvested && f.ripenStage >= 1)) {
    tl.firstRipeningDay = day;
  }
}

// ── Per-day-per-truss snapshot row ────────────────────────────────────

interface PhenologyRow {
  day: number;
  trussIndex: number;
  trussStatus: string;
  expectedStatusNote: string;
  allowedStatusMin: string;
  allowedStatusMax: string;
  flowerBudCount: number;
  /** @deprecated Iter 6i (SSOT #92) — 실제 의미는 pre-anthesis bud. flowerBudCount 사용. */
  openFlowerCount: number;
  fertilizedCount: number;       // backward-compat (= fertilizedTotal)
  fruitCohortCount: number;
  abortedCount: number;          // backward-compat (= drop + starve + prune + unknown)
  nonAbortedCohortCount: number;
  visibleFruitCount: number;
  expandingFruitCount: number;
  ripeningFruitCount: number;
  maxVisibleDiameterMm: number;
  stageDelta: number; // sim - expected_midpoint, negative = behind
  causeLayer: string;
  // Iter 6i (SSOT #90/#91/#93) — 7-state lifecycle + abortion reason 분리
  openFlowerTransientCount: number;  // 1-tick state (현재 engine 0)
  flowerDropCount: number;           // dropReason 'fruit_set_fail'
  fertilizedTotalCount: number;      // alive + starve_aborted + prune_aborted + harvested
  fertilizedAliveCount: number;      // current cohort (= nonAbortedCohortCount when fertilizationTT > 0)
  starvationAbortedCount: number;
  pruningAbortedCount: number;
  harvestedCount: number;
  unknownAbortedCount: number;       // aborted && dropReason === null (invariant 감시)
}

function buildPhenologyRow(
  day: number, trussIndex0: number, physiology: PhysiologyLike, cv: CultivarLike,
  targets: TrussTimelineTarget[], statusMatrix: StatusByDayRow[],
): PhenologyRow {
  const t = physiology.trusses[trussIndex0];
  const trussIndex = trussIndex0 + 1;
  const target = targets.find(x => x.trussIndex === trussIndex) ?? null;
  const sb = lookupStatusByDay(statusMatrix, day, trussIndex);

  const fertilized = t.fruits.filter(f => f.fertilizationTT > 0);
  const aborted = t.fruits.filter(f => f.aborted).length;
  const harvested = t.fruits.filter(f => f.harvested).length;
  const nonAbortedCohort = fertilized.filter(f => !f.aborted && !f.harvested).length;
  const fruitCohort = nonAbortedCohort; // alias per plan
  // Iter 6i (SSOT #92) — openFlower deprecated. Pre-anthesis bud vs post-anthesis transient 분리.
  const flowerBudCnt = t.fruits.filter(f => f.fertilizationTT <= 0 && !f.aborted && physiology.TT < f.anthesisTT).length;
  const openFlowerTransient = t.fruits.filter(f => f.fertilizationTT <= 0 && !f.aborted && physiology.TT >= f.anthesisTT).length;
  const openFlower = flowerBudCnt + openFlowerTransient;  // backward-compat union
  // Iter 6i (SSOT #90) — abortion reason 분리
  const flowerDrop = t.fruits.filter(f => f.aborted && f.dropReason === 'fruit_set_fail').length;
  const starvationAborted = t.fruits.filter(f => f.aborted && f.dropReason === 'starvation').length;
  const pruningAborted = t.fruits.filter(f => f.aborted && f.dropReason === 'pruning').length;
  const unknownAborted = t.fruits.filter(f => f.aborted && (f.dropReason ?? null) === null).length;
  const visible = t.fruits.filter(f => isVisibleFruit(f, physiology.TT, cv));
  const expanding = t.fruits.filter(f => isExpandingFruit(f, physiology.TT, cv)).length;
  const ripening = t.fruits.filter(f => !f.aborted && !f.harvested && f.ripenStage >= 1).length;
  const maxDiam = visible.length > 0 ? Math.max(...visible.map(f => f.diameter)) : 0;

  const simStatus = mapTrussStatus(t, physiology.TT, cv);
  let stageDelta = 0;
  if (sb) {
    const minIdx = statusIndex(sb.allowedStatusMin);
    const maxIdx = statusIndex(sb.allowedStatusMax);
    const expectedMid = (minIdx + maxIdx) / 2;
    const simIdx = statusIndex(simStatus);
    stageDelta = simIdx - expectedMid;
  }

  const causeLayer = classifyCause({
    day, trussIndex, target, sb,
    simStatus, stageDelta,
    flowerBud: t.flowerCount,
    openFlower, fertilized: fertilized.length,
    nonAbortedCohort, visible: visible.length, expanding,
    maxDiameterMm: maxDiam,
    physiology, cv,
    // Iter 6i additions
    flowerDrop, starvationAborted, pruningAborted, unknownAborted,
  });

  return {
    day, trussIndex,
    trussStatus: simStatus,
    expectedStatusNote: sb?.expectedStatusNote ?? '',
    allowedStatusMin: sb?.allowedStatusMin ?? '',
    allowedStatusMax: sb?.allowedStatusMax ?? '',
    flowerBudCount: flowerBudCnt,                  // Iter 6i — pre-anthesis bud (실제 의미, SSOT #92)
    openFlowerCount: openFlower,                   // backward-compat
    fertilizedCount: fertilized.length,            // backward-compat (= fertilizedTotal)
    fruitCohortCount: fruitCohort,
    abortedCount: aborted,                         // backward-compat (= sum of 4 reason categories)
    nonAbortedCohortCount: nonAbortedCohort,
    visibleFruitCount: visible.length,
    expandingFruitCount: expanding,
    ripeningFruitCount: ripening,
    maxVisibleDiameterMm: maxDiam,
    stageDelta,
    causeLayer,
    // Iter 6i additions
    openFlowerTransientCount: openFlowerTransient,
    flowerDropCount: flowerDrop,
    fertilizedTotalCount: fertilized.length,
    fertilizedAliveCount: nonAbortedCohort,
    starvationAbortedCount: starvationAborted,
    pruningAbortedCount: pruningAborted,
    harvestedCount: harvested,
    unknownAbortedCount: unknownAborted,
  };
}

// ── Cause classification (plan D4) ────────────────────────────────────

interface ClassifyInput {
  day: number;
  trussIndex: number;
  target: TrussTimelineTarget | null;
  sb: StatusByDayRow | null;
  simStatus: string;
  stageDelta: number;
  flowerBud: number;
  openFlower: number;
  fertilized: number;
  nonAbortedCohort: number;
  visible: number;
  expanding: number;
  maxDiameterMm: number;
  physiology: PhysiologyLike;
  cv: CultivarLike;
  // Iter 6i (SSOT #90) — abortion reason split
  flowerDrop: number;
  starvationAborted: number;
  pruningAborted: number;
  unknownAborted: number;
}

function classifyCause(c: ClassifyInput): string {
  // No target for this (day, truss) — cannot classify.
  if (!c.sb) return 'no_target';

  // In-band: sim status ∈ [allowedStatusMin, allowedStatusMax] AND visible/diameter in band.
  const simIdx = statusIndex(c.simStatus);
  const minIdx = statusIndex(c.sb.allowedStatusMin);
  const maxIdx = statusIndex(c.sb.allowedStatusMax);
  const statusInBand = simIdx >= minIdx && simIdx <= maxIdx;
  const visibleInBand = c.visible >= c.sb.visibleFruitMin && c.visible <= c.sb.visibleFruitMax;
  const diamInBand = c.sb.maxDiameterMmMax === 0
    ? c.maxDiameterMm === 0
    : (c.maxDiameterMm >= c.sb.maxDiameterMmMin && c.maxDiameterMm <= c.sb.maxDiameterMmMax);
  if (statusInBand && visibleInBand && diamInBand) return 'no_issue';

  // Target expects 'not_visible' but sim already emerged — early, but not a regression.
  if (c.sb.allowedStatusMax === 'not_visible') {
    return c.simStatus === 'not_visible' ? 'no_issue' : 'truss_emergence_early';
  }

  // Sim not yet emerged but target expects ≥ visible_bud.
  if (c.simStatus === 'not_visible') return 'truss_emergence_timing';

  // Flower generation: very few flowerBuds (compare to flowersPerTruss expected mu, fallback heuristic 4).
  // We don't have explicit target for flowerBudCount in reference, so use a heuristic:
  // expect ≥ 4 buds once truss is past visible_bud, else flag.
  const expectingFlowering = maxIdx >= statusIndex('flowering');
  if (expectingFlowering && c.flowerBud < 4) return 'flower_generation';

  // Flowering timing: buds exist but no open flowers and we're past flowering window.
  if (expectingFlowering && c.flowerBud > 0 && c.openFlower === 0 && c.fertilized === 0) {
    return 'flowering_timing';
  }

  // Fertilization / fruit set: flowers opened but few fertilized.
  const expectingFruitSet = maxIdx >= statusIndex('fruit_set');
  if (expectingFruitSet && c.openFlower + c.fertilized > 0 && c.fertilized < Math.max(1, c.sb.visibleFruitMin)) {
    return 'fertilization_or_fruit_set';
  }

  // Iter 6i (SSOT #90) — abortion 분리:
  // unknown_aborted (dropReason === null) 가 있으면 빨간 경고 (legacy aborted path 발견)
  if (c.unknownAborted > 0) {
    return 'unknown_aborted_warn';
  }
  // post-fertilization survival 부족: starvation OR pruning dominant 분리
  if (c.fertilized > 0 && c.nonAbortedCohort < c.fertilized * 0.5
      && c.nonAbortedCohort < Math.max(1, c.sb.visibleFruitMin)) {
    // 어느 reason이 dominant 인지 분류
    if (c.starvationAborted > c.pruningAborted) {
      return 'post_fert_starvation_abortion';
    } else if (c.pruningAborted > 0) {
      return 'pruning_to_target';
    } else {
      return 'post_fert_starvation_abortion';
    }
  }
  // pre-anthesis flower drop (fruitSetRate fail dominant)
  if (c.flowerDrop > Math.max(1, c.fertilized * 0.5)) {
    return 'pre_anthesis_flower_drop';
  }

  // Visibility transition: cohort exists but visible far below cohort / target.
  if (c.nonAbortedCohort > 0 && c.visible < c.sb.visibleFruitMin
      && c.nonAbortedCohort >= c.sb.visibleFruitMin) {
    return 'visibility_transition';
  }

  // Fruit expansion rate: visible count in band but diameter behind, or stage behind.
  if (c.visible >= c.sb.visibleFruitMin
      && (c.maxDiameterMm < c.sb.maxDiameterMmMin || c.stageDelta < 0)) {
    return 'fruit_expansion_rate';
  }

  // Catch-all (sim behind but funnel passes earlier checks).
  return 'unclassified_behind';
}

function explainCause(r: PhenologyRow): string {
  switch (r.causeLayer) {
    case 'no_issue': return 'in-band';
    case 'no_target': return 'no reference target for this (day, truss)';
    case 'truss_emergence_timing': return `truss not yet emerged (sim=${r.trussStatus}, expected ${r.allowedStatusMin}~${r.allowedStatusMax})`;
    case 'truss_emergence_early': return `truss emerged earlier than reference (sim=${r.trussStatus}, expected ${r.allowedStatusMax})`;
    case 'flower_generation': return `flowerBud=${r.flowerBudCount} below heuristic min=4`;
    case 'flowering_timing': return `buds=${r.flowerBudCount} but openFlower=0, fertilized=0`;
    case 'fertilization_or_fruit_set': return `openFlower=${r.openFlowerCount}, fertilized=${r.fertilizedCount} below visibleFruitMin`;
    // Iter 6i (SSOT #90) — abortion 분리 신규 cause layers
    case 'pre_anthesis_flower_drop': return `flowerDrop=${r.flowerDropCount} > fertilized * 0.5 (anthesis fruitSetRate fail dominant — Iter 6j lever)`;
    case 'post_fert_starvation_abortion': return `fertilized=${r.fertilizedTotalCount} starvation=${r.starvationAbortedCount} > pruning=${r.pruningAbortedCount} (Marcelis abortion dominant — Iter 6f-revisit lever)`;
    case 'pruning_to_target': return `pruning=${r.pruningAbortedCount} dominant (horticultural — trussTargetFruitCount, not biology)`;
    case 'unknown_aborted_warn': return `⚠ unknown_aborted=${r.unknownAbortedCount} (aborted=true but dropReason=null — engine 어딘가 dropReason 미설정 path 존재)`;
    case 'abortion_or_survival': return `fertilized=${r.fertilizedCount} but nonAbortedCohort=${r.nonAbortedCohortCount} (aborted=${r.abortedCount}) — deprecated, use pre_anthesis_flower_drop / post_fert_starvation_abortion / pruning_to_target`;
    case 'visibility_transition': return `cohort=${r.nonAbortedCohortCount} but visible=${r.visibleFruitCount}`;
    case 'fruit_expansion_rate': return `visible=${r.visibleFruitCount}, maxDiam=${r.maxVisibleDiameterMm.toFixed(1)}mm, stageDelta=${r.stageDelta.toFixed(1)}`;
    case 'unclassified_behind': return `behind reference but funnel above passes`;
    default: return '';
  }
}

// ── Conversion funnel (per truss, end-of-run snapshot) ────────────────

interface ConversionRow {
  trussIndex: number;
  flowerBudCount: number;            // Iter 6i — pre-anthesis bud (SSOT #92)
  openFlowerTransientCount: number;  // Iter 6i — post-anthesis, pre-set (1-tick, SSOT #92)
  flowerDropCount: number;           // Iter 6i — dropReason 'fruit_set_fail' (SSOT #90)
  fertilizedTotalCount: number;      // Iter 6i — alive + starve + prune + harvested (SSOT #93)
  fertilizedAliveCount: number;      // Iter 6i — current cohort (SSOT #93)
  starvationAbortedCount: number;    // Iter 6i — dropReason 'starvation' (SSOT #90)
  pruningAbortedCount: number;       // Iter 6i — dropReason 'pruning' (SSOT #90)
  harvestedCount: number;
  unknownAbortedCount: number;       // Iter 6i — invariant 감시 (사용자 검토 #3)
  visibleFruitCount: number;
  expandingFruitCount: number;
  // 비율 (Iter 6i 분리)
  fruitSetRateObserved: number;      // fertilized_total / (fertilized_total + flower_drop)
  postFertAbortionRate: number;      // starvation_aborted / fertilized_total
  pruningRate: number;               // pruning_aborted / fertilized_total
  survivalRate: number;              // fertilized_alive / fertilized_total
  visibleRate: number;               // visible / fertilized_alive
  expandingRate: number;             // expanding / fertilized_alive
}

function buildConversion(physiology: PhysiologyLike, cv: CultivarLike): ConversionRow[] {
  const out: ConversionRow[] = [];
  for (let i = 0; i < physiology.trusses.length; i++) {
    const t = physiology.trusses[i];
    // Iter 6i (SSOT #91) — 7-state breakdown
    const flowerBud = t.fruits.filter(f => f.fertilizationTT <= 0 && !f.aborted && physiology.TT < f.anthesisTT).length;
    const openFlowerTr = t.fruits.filter(f => f.fertilizationTT <= 0 && !f.aborted && physiology.TT >= f.anthesisTT).length;
    const flowerDrop = t.fruits.filter(f => f.aborted && f.dropReason === 'fruit_set_fail').length;
    const starvationAb = t.fruits.filter(f => f.aborted && f.dropReason === 'starvation').length;
    const pruningAb = t.fruits.filter(f => f.aborted && f.dropReason === 'pruning').length;
    const unknownAb = t.fruits.filter(f => f.aborted && (f.dropReason ?? null) === null).length;
    const fertilizedTotal = t.fruits.filter(f => f.fertilizationTT > 0).length;
    const fertilizedAlive = t.fruits.filter(f => f.fertilizationTT > 0 && !f.aborted && !f.harvested).length;
    const harvested = t.fruits.filter(f => f.harvested).length;
    const visible = t.fruits.filter(f => isVisibleFruit(f, physiology.TT, cv)).length;
    const expanding = t.fruits.filter(f => isExpandingFruit(f, physiology.TT, cv)).length;
    out.push({
      trussIndex: i + 1,
      flowerBudCount: flowerBud,
      openFlowerTransientCount: openFlowerTr,
      flowerDropCount: flowerDrop,
      fertilizedTotalCount: fertilizedTotal,
      fertilizedAliveCount: fertilizedAlive,
      starvationAbortedCount: starvationAb,
      pruningAbortedCount: pruningAb,
      harvestedCount: harvested,
      unknownAbortedCount: unknownAb,
      visibleFruitCount: visible,
      expandingFruitCount: expanding,
      fruitSetRateObserved: (fertilizedTotal + flowerDrop) > 0 ? fertilizedTotal / (fertilizedTotal + flowerDrop) : 0,
      postFertAbortionRate: fertilizedTotal > 0 ? starvationAb / fertilizedTotal : 0,
      pruningRate: fertilizedTotal > 0 ? pruningAb / fertilizedTotal : 0,
      survivalRate: fertilizedTotal > 0 ? fertilizedAlive / fertilizedTotal : 0,
      visibleRate: fertilizedAlive > 0 ? visible / fertilizedAlive : 0,
      expandingRate: fertilizedAlive > 0 ? expanding / fertilizedAlive : 0,
    });
  }
  return out;
}

// ── CSV writers ───────────────────────────────────────────────────────

function csvRow(values: Array<string | number | null | boolean>): string {
  return values.map(v => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
    const s = String(v);
    return s.includes(',') ? `"${s}"` : s;
  }).join(',');
}

function buildPhenologyCsv(rows: PhenologyRow[]): string {
  const header = [
    'day', 'truss_index', 'truss_status', 'expected_status_min', 'expected_status_max',
    'expected_status_note', 'flower_bud_count', 'open_flower_count', 'fertilized_count',
    'fruit_cohort_count', 'aborted_count', 'non_aborted_cohort_count',
    'visible_fruit_count', 'expanding_fruit_count', 'ripening_fruit_count',
    'max_visible_diameter_mm', 'stage_delta', 'cause_layer',
    // Iter 6i (SSOT #90/#91/#93) — 7-state lifecycle + abortion reason split
    'open_flower_transient_count', 'flower_drop_count',
    'fertilized_total_count', 'fertilized_alive_count',
    'starvation_aborted_count', 'pruning_aborted_count', 'harvested_count',
    'unknown_aborted_count',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(csvRow([
      r.day, r.trussIndex, r.trussStatus, r.allowedStatusMin, r.allowedStatusMax,
      r.expectedStatusNote, r.flowerBudCount, r.openFlowerCount, r.fertilizedCount,
      r.fruitCohortCount, r.abortedCount, r.nonAbortedCohortCount,
      r.visibleFruitCount, r.expandingFruitCount, r.ripeningFruitCount,
      r.maxVisibleDiameterMm, r.stageDelta, r.causeLayer,
      r.openFlowerTransientCount, r.flowerDropCount,
      r.fertilizedTotalCount, r.fertilizedAliveCount,
      r.starvationAbortedCount, r.pruningAbortedCount, r.harvestedCount,
      r.unknownAbortedCount,
    ]));
  }
  return lines.join('\n') + '\n';
}

function buildTimelineCsv(
  timelines: Map<number, TrussTimeline>, targets: TrussTimelineTarget[],
): string {
  const header = [
    'truss_index',
    'visible_truss_day', 'target_visible_min', 'target_visible_max', 'delta_visible_days',
    'first_bud_day',
    'first_open_flower_day', 'target_flower_min', 'target_flower_max', 'delta_flower_days',
    'first_fertilized_day', 'target_fruit_set_min', 'target_fruit_set_max', 'delta_fruit_set_days',
    'first_fruit_cohort_day',
    'first_visible_fruit_day', 'target_visible_fruit_min', 'target_visible_fruit_max', 'delta_visible_fruit_days',
    'first_expanding_fruit_day', 'target_expanding_min', 'target_expanding_max', 'delta_expanding_days',
    'first_ripening_day', 'target_breaker_min', 'target_breaker_max', 'delta_breaker_days',
  ];
  const lines = [header.join(',')];
  const indexes = [...timelines.keys()].sort((a, b) => a - b);
  for (const idx of indexes) {
    const tl = timelines.get(idx)!;
    const tg = targets.find(x => x.trussIndex === idx) ?? null;
    const deltaFromMidpoint = (actual: number | null, min: number | undefined, max: number | undefined): number | null => {
      if (actual === null || min === undefined || max === undefined) return null;
      return actual - (min + max) / 2;
    };
    lines.push(csvRow([
      idx,
      tl.visibleTrussDay, tg?.visibleMin ?? null, tg?.visibleMax ?? null,
      deltaFromMidpoint(tl.visibleTrussDay, tg?.visibleMin, tg?.visibleMax),
      tl.firstBudDay,
      tl.firstOpenFlowerDay, tg?.flowerMin ?? null, tg?.flowerMax ?? null,
      deltaFromMidpoint(tl.firstOpenFlowerDay, tg?.flowerMin, tg?.flowerMax),
      tl.firstFertilizedDay, tg?.fruitSetMin ?? null, tg?.fruitSetMax ?? null,
      deltaFromMidpoint(tl.firstFertilizedDay, tg?.fruitSetMin, tg?.fruitSetMax),
      tl.firstFruitCohortDay,
      tl.firstVisibleFruitDay, tg?.visibleFruitMin ?? null, tg?.visibleFruitMax ?? null,
      deltaFromMidpoint(tl.firstVisibleFruitDay, tg?.visibleFruitMin, tg?.visibleFruitMax),
      tl.firstExpandingFruitDay, tg?.expandingMin ?? null, tg?.expandingMax ?? null,
      deltaFromMidpoint(tl.firstExpandingFruitDay, tg?.expandingMin, tg?.expandingMax),
      tl.firstRipeningDay, tg?.breakerMin ?? null, tg?.breakerMax ?? null,
      deltaFromMidpoint(tl.firstRipeningDay, tg?.breakerMin, tg?.breakerMax),
    ]));
  }
  return lines.join('\n') + '\n';
}

function buildConversionCsv(rows: ConversionRow[]): string {
  const header = [
    'truss_index',
    // Iter 6i (SSOT #90/#91/#93) — 7-state aggregate
    'flower_bud_count', 'open_flower_transient_count', 'flower_drop_count',
    'fertilized_total_count', 'fertilized_alive_count',
    'starvation_aborted_count', 'pruning_aborted_count', 'harvested_count',
    'unknown_aborted_count',
    'visible_fruit_count', 'expanding_fruit_count',
    // 비율 — abortion 분리 (SSOT #93)
    'fruit_set_rate_observed', 'post_fert_abortion_rate', 'pruning_rate',
    'survival_rate', 'visible_rate', 'expanding_rate',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(csvRow([
      r.trussIndex,
      r.flowerBudCount, r.openFlowerTransientCount, r.flowerDropCount,
      r.fertilizedTotalCount, r.fertilizedAliveCount,
      r.starvationAbortedCount, r.pruningAbortedCount, r.harvestedCount,
      r.unknownAbortedCount,
      r.visibleFruitCount, r.expandingFruitCount,
      r.fruitSetRateObserved, r.postFertAbortionRate, r.pruningRate,
      r.survivalRate, r.visibleRate, r.expandingRate,
    ]));
  }
  return lines.join('\n') + '\n';
}

function buildCauseCsv(rows: PhenologyRow[]): string {
  const header = [
    'day', 'truss_index', 'cause_layer', 'sim_status',
    'expected_status_min', 'expected_status_max', 'reason',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(csvRow([
      r.day, r.trussIndex, r.causeLayer, r.trussStatus,
      r.allowedStatusMin, r.allowedStatusMax, explainCause(r),
    ]));
  }
  return lines.join('\n') + '\n';
}

// ── Summary.md sketch (plan D5: numbers only, no lever recommendation) ─

function buildSummary(
  args: CliArgs, timelines: Map<number, TrussTimeline>,
  phenologyRows: PhenologyRow[], conversion: ConversionRow[],
): string {
  const lines: string[] = [];
  lines.push(`# Flower → Fruit Phenology Audit — ${args.modelVersion}`);
  lines.push('');
  lines.push(`- cultivar: \`${args.cultivar}\``);
  lines.push(`- seed: ${args.seed}`);
  lines.push(`- daily-step range: day 1..${args.maxDay}`);
  lines.push(`- sampling days: ${args.days.join(', ')}`);
  lines.push(`- reference: \`${args.referenceBundle}\``);
  lines.push('');
  lines.push('> 본 audit은 진단 전용입니다. 어떠한 파라미터도 수정하지 않았습니다.');
  lines.push('> "Recommended Next Lever"는 의도적으로 비워둡니다 — CSV를 보고 사람이 판단하세요.');
  lines.push('');

  // 1. Truss Event Timeline summary
  lines.push('## 1. Truss Event Timeline');
  lines.push('');
  lines.push('| Truss | visible | first bud | first openFlower | first fertilized | first cohort | first visible fruit | first expanding | first ripening |');
  lines.push('|-------|---------|-----------|------------------|------------------|--------------|---------------------|-----------------|----------------|');
  const indexes = [...timelines.keys()].sort((a, b) => a - b);
  for (const idx of indexes) {
    const tl = timelines.get(idx)!;
    lines.push(`| T${idx} | ${tl.visibleTrussDay ?? '-'} | ${tl.firstBudDay ?? '-'} | ${tl.firstOpenFlowerDay ?? '-'} | ${tl.firstFertilizedDay ?? '-'} | ${tl.firstFruitCohortDay ?? '-'} | ${tl.firstVisibleFruitDay ?? '-'} | ${tl.firstExpandingFruitDay ?? '-'} | ${tl.firstRipeningDay ?? '-'} |`);
  }
  lines.push('');

  // 2. Conversion funnel (per truss, end-of-run, Iter 6i 7-state)
  lines.push(`## 2. Conversion Funnel (end of day ${args.maxDay}, Iter 6i 7-state + abortion reason split)`);
  lines.push('');
  lines.push('| Truss | bud | open(tr) | drop | fertTotal | fertAlive | starve | prune | harv | unk | visible | exp | fruitSet% | postFertAbort% | prune% | survive% |');
  lines.push('|-------|----:|---------:|-----:|----------:|----------:|-------:|------:|-----:|----:|--------:|----:|----------:|---------------:|-------:|---------:|');
  for (const c of conversion) {
    const pct = (x: number): string => (x * 100).toFixed(1);
    lines.push(`| T${c.trussIndex} | ${c.flowerBudCount} | ${c.openFlowerTransientCount} | ${c.flowerDropCount} | ${c.fertilizedTotalCount} | ${c.fertilizedAliveCount} | ${c.starvationAbortedCount} | ${c.pruningAbortedCount} | ${c.harvestedCount} | ${c.unknownAbortedCount} | ${c.visibleFruitCount} | ${c.expandingFruitCount} | ${pct(c.fruitSetRateObserved)} | ${pct(c.postFertAbortionRate)} | ${pct(c.pruningRate)} | ${pct(c.survivalRate)} |`);
  }
  lines.push('');

  // 3. Cause layer distribution across all sampling rows
  lines.push('## 3. Cause Layer Distribution');
  lines.push('');
  const causeCount: Record<string, number> = {};
  for (const r of phenologyRows) {
    causeCount[r.causeLayer] = (causeCount[r.causeLayer] ?? 0) + 1;
  }
  const total = phenologyRows.length;
  const sortedCauses = Object.entries(causeCount).sort((a, b) => b[1] - a[1]);
  lines.push('| Cause Layer | Count | % |');
  lines.push('|-------------|-------|---|');
  for (const [k, v] of sortedCauses) {
    lines.push(`| \`${k}\` | ${v} | ${(v / total * 100).toFixed(1)} |`);
  }
  lines.push('');
  const topCause = sortedCauses.find(([k]) => k !== 'no_issue' && k !== 'no_target');
  lines.push('## 4. Top Bottleneck');
  lines.push('');
  if (topCause) {
    lines.push(`Most frequent non-trivial cause layer: \`${topCause[0]}\` (${topCause[1]}/${total} rows).`);
  } else {
    lines.push('No non-trivial cause layer detected (all in-band or no-target).');
  }
  lines.push('');

  // 5. Recommended Next Lever — intentionally left blank (plan D5)
  lines.push('## 5. Recommended Next Lever');
  lines.push('');
  lines.push('_(left blank — see CSV files and the bottleneck above; human/LLM analysis required)_');
  lines.push('');

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cultivar = getCultivar(args.cultivar) as unknown as CultivarLike;
  const targets = loadTimelineTargets(args.referenceBundle);
  const statusMatrix = loadStatusByDay(args.referenceBundle);

  const engine = new GrowthEngine();
  engine.setEnvironment({
    temperatureC: DEFAULT_CLIMATE.T_avg,
    lightHoursPerDay: DEFAULT_CLIMATE.daylight_hours,
    co2ppm: DEFAULT_CLIMATE.CO2_ppm,
  });
  engine.addPlant({ seed: args.seed, cultivarName: args.cultivar });

  const timelines = new Map<number, TrussTimeline>();
  const phenologyRows: PhenologyRow[] = [];
  const samplingDays = new Set(args.days);
  let lastPhysiology: PhysiologyLike | null = null;

  console.log(`[audit] daily-step ${args.cultivar} seed=${args.seed} day=1..${args.maxDay}`);
  for (let day = 1; day <= args.maxDay; day++) {
    engine.simulatePlantToHour(args.seed, day, 0, DEFAULT_CLIMATE);
    const physiology = engine.getPhysiologyState(args.seed)! as unknown as PhysiologyLike;
    lastPhysiology = physiology;
    for (let i = 0; i < physiology.trusses.length; i++) {
      const trussIndex = i + 1;
      if (!timelines.has(trussIndex)) timelines.set(trussIndex, newTimeline(trussIndex));
      updateTimeline(timelines.get(trussIndex)!, physiology.trusses[i], physiology.TT, cultivar, day);
    }
    if (samplingDays.has(day)) {
      for (let i = 0; i < physiology.trusses.length; i++) {
        phenologyRows.push(buildPhenologyRow(day, i, physiology, cultivar, targets, statusMatrix));
      }
    }
  }

  if (!lastPhysiology) throw new Error('no physiology state captured');
  const conversion = buildConversion(lastPhysiology, cultivar);

  const outDir = join(args.outRoot, args.modelVersion);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'day_truss_phenology.csv'), buildPhenologyCsv(phenologyRows));
  writeFileSync(join(outDir, 'truss_event_timeline.csv'), buildTimelineCsv(timelines, targets));
  writeFileSync(join(outDir, 'flower_to_fruit_conversion.csv'), buildConversionCsv(conversion));
  writeFileSync(join(outDir, 'cause_classification.csv'), buildCauseCsv(phenologyRows));
  writeFileSync(join(outDir, 'summary.md'), buildSummary(args, timelines, phenologyRows, conversion));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({
    modelVersion: args.modelVersion,
    cultivar: args.cultivar,
    seed: args.seed,
    samplingDays: args.days,
    maxDay: args.maxDay,
    referenceBundle: args.referenceBundle,
    generatedAt: new Date().toISOString(),
    rowCount: phenologyRows.length,
    trussCount: timelines.size,
  }, null, 2));

  console.log(`[audit] wrote ${outDir}`);
  console.log(`  - day_truss_phenology.csv (${phenologyRows.length} rows)`);
  console.log(`  - truss_event_timeline.csv (${timelines.size} trusses)`);
  console.log(`  - flower_to_fruit_conversion.csv (${conversion.length} trusses)`);
  console.log(`  - cause_classification.csv (${phenologyRows.length} rows)`);
  console.log(`  - summary.md, summary.json`);
}

main().catch(e => {
  console.error('[audit] failed:', e);
  process.exit(1);
});
