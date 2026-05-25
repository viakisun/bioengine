// dump-growth-checkpoints — Pre-refactor diagnostic snapshot.
//
// Iter 5 (fruit mass engine_logic refactor) 진입 전에, 현재 엔진의
// day-by-day 상태를 4개 카테고리 (plant / truss / fruit / leaf orientation)
// 로 분리해 dump. Reference Pack target과 자동 비교 + Case A/B/C/D 판정.
//
// Output:
//   growth-calibration/checkpoints/{modelVersion}/
//     plant_summary.csv
//     truss_summary.csv
//     fruit_summary.csv
//     leaf_orientation_summary.csv
//     summary.json          (전체 메타 + per-day plant + diagnosis)
//     diagnosis.json        (Case A/B/C/D + recommendedNextIter)
//     user_summary.md       (사람이 바로 읽는 요약)
//
// Usage:
//   npx vite-node growth-calibration/scripts/dump-growth-checkpoints.ts -- \
//     --days 30,33,60,90 \
//     --seed 20260525 \
//     --cultivar tomimaru-muchoo \
//     --modelVersion v0.9-fruit-timing \
//     --referenceBundle growth-calibration/reference/tomato/tomato_tomimaru_reference_v0.1

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { GrowthEngine } from '../../packages/tomato-engine/src/GrowthEngine';
import { getCultivar } from '../../packages/tomato-engine/src/Cultivar';
import { DEFAULT_CLIMATE } from '../../packages/tomato-engine/src/CoreModel';
import { computePlantGeometry } from '../../src/plant/PlantBase';
import {
  loadReferenceBundle,
  matchPercent,
  judgmentFor,
  type ReferenceBundle,
  type Band,
} from './lib/reference-band-loader';

const RAD_TO_DEG = 180 / Math.PI;

// ── CLI ───────────────────────────────────────────────────────────────

interface CliArgs {
  cultivar: string;
  seed: number;
  days: number[];
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
  return {
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    seed: opts.seed ? Number(opts.seed) : 20260525,
    days: opts.days
      ? opts.days.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0)
      : [30, 33, 60, 90],
    modelVersion: opts.modelVersion ?? 'current',
    referenceBundle: opts.referenceBundle
      ?? 'growth-calibration/reference/tomato/tomato_tomimaru_reference_v0.1',
    outRoot: opts.outRoot ?? join(__dirname, '..', 'checkpoints'),
  };
}

// ── Engine snapshot per day ───────────────────────────────────────────

interface DaySnapshot {
  day: number;
  cultivar: ReturnType<typeof getCultivar>;
  state: ReturnType<GrowthEngine['computeState']>;
  physiology: NonNullable<ReturnType<GrowthEngine['getPhysiologyState']>>;
  plantBase: ReturnType<typeof computePlantGeometry>;
}

function runEngineToDay(args: CliArgs, day: number): DaySnapshot {
  const cultivar = getCultivar(args.cultivar);
  const engine = new GrowthEngine();
  engine.setEnvironment({
    temperatureC: DEFAULT_CLIMATE.T_avg,
    lightHoursPerDay: DEFAULT_CLIMATE.daylight_hours,
    co2ppm: DEFAULT_CLIMATE.CO2_ppm,
  });
  engine.addPlant({ seed: args.seed, cultivarName: args.cultivar });
  engine.simulatePlantToHour(args.seed, day, 0, DEFAULT_CLIMATE);

  const physiology = engine.getPhysiologyState(args.seed)!;
  const state = engine.computeState(args.seed, day);
  const genome = engine.getGenome(args.seed)!;
  const plantBase = computePlantGeometry(state, { genome, cultivar, physiologyState: physiology });

  return { day, cultivar, state, physiology, plantBase };
}

// ── Plant overall (row + in-band) ─────────────────────────────────────

interface PlantOverall {
  day: number;
  heightCm: number;
  nodeCount: number;
  visibleLeafCount: number;
  expandedLeafCount: number;
  visibleTrussCount: number;
  floweringTrussCount: number;
  fruitingTrussCount: number;
  fruitCountTotal: number;
  maxFruitDiameterMm: number;
  totalFruitFreshMassG: number;
}

const FRUITING_STATUSES = new Set([
  'fruit_set', 'small_green', 'green_expanding', 'breaker', 'red', 'harvest_ready',
]);

function mapTrussStatus(
  t: { emergenceTT: number; fruits: ReadonlyArray<{ fertilizationTT: number; ripenStage: number; aborted: boolean; harvested: boolean; diameter: number }> },
  currentTT: number,
): string {
  const live = t.fruits.filter(f => !f.aborted && !f.harvested);
  if (currentTT < t.emergenceTT) return 'not_visible';
  if (live.length === 0) return t.fruits.length > 0 ? 'visible_bud' : 'visible_bud';
  const maxStage = Math.max(...live.map(f => f.ripenStage));
  const hasFruit = live.some(f => f.fertilizationTT > 0);
  if (!hasFruit) return 'flowering';
  if (maxStage >= 5) return 'harvest_ready';
  if (maxStage >= 4) return 'red';
  if (maxStage >= 2) return 'breaker';
  // expansion-by-diameter
  const maxDiam = Math.max(...live.map(f => f.diameter));
  if (maxDiam >= 30) return 'green_expanding';
  if (maxDiam >= 10) return 'small_green';
  return 'fruit_set';
}

function plantOverall(snap: DaySnapshot): PlantOverall {
  const { day, state, physiology, plantBase } = snap;

  // Leaves — from PlantBase (matches extract script)
  const allAxes = [plantBase.mainAxis, ...plantBase.sideShoots];
  let visibleLeaf = 0;
  let expandedLeaf = 0;
  for (const axis of allAxes) {
    for (const leaf of axis.leaves) {
      if (!leaf.visibility.visible) continue;
      visibleLeaf++;
      // expanded heuristic: sizeFactor >= 0.5 and not senescing
      if (leaf.sizeFactor >= 0.5 && leaf.yellowing <= 0.5) expandedLeaf++;
    }
  }

  // Trusses — from physiology (CoreModel)
  let flowering = 0;
  let fruiting = 0;
  let fruitCount = 0;
  let maxDiam = 0;
  let totalFresh = 0;
  for (const t of physiology.trusses) {
    const status = mapTrussStatus(t, physiology.TT);
    if (status === 'flowering') flowering++;
    if (FRUITING_STATUSES.has(status)) fruiting++;
    for (const f of t.fruits) {
      if (f.aborted || f.harvested) continue;
      if (f.fertilizationTT <= 0) continue;
      fruitCount++;
      if (f.diameter > maxDiam) maxDiam = f.diameter;
      totalFresh += f.W_fruit_fresh;
    }
  }

  return {
    day,
    heightCm: state.heightCm,
    nodeCount: state.nodes.length,
    visibleLeafCount: visibleLeaf,
    expandedLeafCount: expandedLeaf,
    visibleTrussCount: physiology.trusses.length,
    floweringTrussCount: flowering,
    fruitingTrussCount: fruiting,
    fruitCountTotal: fruitCount,
    maxFruitDiameterMm: maxDiam,
    totalFruitFreshMassG: totalFresh,
  };
}

// ── Phase derivation (FruitCohort → semantic phase) ───────────────────

type FruitPhase =
  | 'aborted' | 'pre_fertilization' | 'cell_division'
  | 'cell_expansion' | 'ripening_early' | 'ripening_late';

function fruitPhase(
  f: { aborted: boolean; fertilizationTT: number; ripenStage: number },
  currentTT: number,
  cultivar: ReturnType<typeof getCultivar>,
): { phase: FruitPhase; gddSinceFert: number; cellDivisionDurationGDD: number; ripenStartGDD: number } {
  const cellDivisionDurationGDD = cultivar.cellDivisionDurationGDD;
  const ripenStartGDD = cellDivisionDurationGDD + cultivar.cellExpansionDurationGDD;
  const fertilized = f.fertilizationTT >= 0;
  const gddSinceFert = fertilized ? (currentTT - f.fertilizationTT) : 0;

  let phase: FruitPhase;
  if (f.aborted) phase = 'aborted';
  else if (!fertilized) phase = 'pre_fertilization';
  else if (gddSinceFert < cellDivisionDurationGDD) phase = 'cell_division';
  else if (gddSinceFert < ripenStartGDD) phase = 'cell_expansion';
  else if (f.ripenStage < 4) phase = 'ripening_early';
  else phase = 'ripening_late';

  return { phase, gddSinceFert, cellDivisionDurationGDD, ripenStartGDD };
}

// ── CSV writers ───────────────────────────────────────────────────────

function csvRow(values: Array<string | number | null | boolean>): string {
  return values.map(v => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
    // Strings with comma → quote
    const s = String(v);
    return s.includes(',') ? `"${s}"` : s;
  }).join(',');
}

function bandStr(b: Band | null): string {
  return b === null ? '' : `${b[0]}-${b[1]}`;
}

function inBandFlag(actual: number, b: Band | null): string {
  if (b === null) return 'no_target';
  return (actual >= b[0] && actual <= b[1]) ? '1' : '0';
}

function buildPlantSummaryCsv(rows: PlantOverall[], bundle: ReferenceBundle): string {
  const header = [
    'day', 'height_cm', 'node_count', 'visible_leaf_count', 'expanded_leaf_count',
    'visible_truss_count', 'flowering_truss_count', 'fruiting_truss_count',
    'fruit_count_total', 'max_fruit_diameter_mm', 'total_fruit_fresh_mass_g',
    'height_band', 'height_in_band',
    'node_band', 'node_in_band',
    'truss_band', 'truss_in_band',
    'fruit_count_band', 'fruit_count_in_band',
    'max_diam_band', 'max_diam_in_band',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    const pb = bundle.plantBandFor(r.day);
    lines.push(csvRow([
      r.day, r.heightCm, r.nodeCount, r.visibleLeafCount, r.expandedLeafCount,
      r.visibleTrussCount, r.floweringTrussCount, r.fruitingTrussCount,
      r.fruitCountTotal, r.maxFruitDiameterMm, r.totalFruitFreshMassG,
      bandStr(pb?.height ?? null), pb?.height ? inBandFlag(r.heightCm, pb.height) : 'no_target',
      bandStr(pb?.nodeCount ?? null), pb?.nodeCount ? inBandFlag(r.nodeCount, pb.nodeCount) : 'no_target',
      bandStr(pb?.visibleTruss ?? null), pb?.visibleTruss ? inBandFlag(r.visibleTrussCount, pb.visibleTruss) : 'no_target',
      bandStr(pb?.fruitCount ?? null), pb?.fruitCount ? inBandFlag(r.fruitCountTotal, pb.fruitCount) : 'no_target',
      bandStr(pb?.maxFruitDiameter ?? null), pb?.maxFruitDiameter ? inBandFlag(r.maxFruitDiameterMm, pb.maxFruitDiameter) : 'no_target',
    ]));
  }
  return lines.join('\n') + '\n';
}

function buildTrussSummaryCsv(snapshots: DaySnapshot[]): string {
  const header = [
    'day', 'truss_index', 'status', 'emergence_tt', 'flower_bud_count',
    'open_flower_count', 'fruit_set_count', 'visible_fruit_count',
    'max_fruit_diameter_mm',
  ];
  const lines = [header.join(',')];
  for (const snap of snapshots) {
    for (let i = 0; i < snap.physiology.trusses.length; i++) {
      const t = snap.physiology.trusses[i];
      const live = t.fruits.filter(f => !f.aborted && !f.harvested);
      const visible = live.filter(f => f.fertilizationTT > 0);
      const maxDiam = visible.length > 0 ? Math.max(...visible.map(f => f.diameter)) : 0;
      lines.push(csvRow([
        snap.day, i + 1, mapTrussStatus(t, snap.physiology.TT), t.emergenceTT,
        t.flowerCount,
        t.fruits.filter(f => f.fertilizationTT <= 0 && !f.aborted).length,
        t.fruits.filter(f => f.fertilizationTT > 0 && !f.aborted).length,
        visible.length, maxDiam,
      ]));
    }
  }
  return lines.join('\n') + '\n';
}

function buildFruitSummaryCsv(snapshots: DaySnapshot[]): string {
  const header = [
    'day', 'truss_index', 'fruit_id', 'aborted', 'harvested',
    'diameter_mm', 'fresh_mass_g', 'dry_mass_g',
    'fertilization_tt', 'cell_division_end_tt', 'ripen_start_tt',
    'gdd_since_fert', 'cell_division_duration_gdd', 'ripen_start_gdd',
    'phase', 'ripen_stage', 'starved_days', 'diameter_source',
  ];
  const lines = [header.join(',')];
  for (const snap of snapshots) {
    for (let i = 0; i < snap.physiology.trusses.length; i++) {
      const t = snap.physiology.trusses[i];
      for (let j = 0; j < t.fruits.length; j++) {
        const f = t.fruits[j];
        const p = fruitPhase(f, snap.physiology.TT, snap.cultivar);
        lines.push(csvRow([
          snap.day, i + 1, `F${i + 1}_${j + 1}`, f.aborted, f.harvested,
          f.diameter, f.W_fruit_fresh, f.W_fruit_dry,
          f.fertilizationTT, f.cellDivisionEndTT, f.ripenStartTT,
          p.gddSinceFert, p.cellDivisionDurationGDD, p.ripenStartGDD,
          p.phase, f.ripenStage, f.starvedDays,
          'sink_allocation_mass_curve',
        ]));
      }
    }
  }
  return lines.join('\n') + '\n';
}

function buildLeafOrientationCsv(snapshots: DaySnapshot[]): string {
  const header = [
    'day', 'axis_index', 'leaf_id', 'node_index', 'visible',
    'leaflet_count', 'size_factor', 'yellowing',
    'azimuth_deg', 'droop_angle_deg', 'lateral_spread_deg', 'elevation_deg',
    'lateral_spread_source', 'elevation_source',
  ];
  const lines = [header.join(',')];
  for (const snap of snapshots) {
    const allAxes = [snap.plantBase.mainAxis, ...snap.plantBase.sideShoots];
    for (let ai = 0; ai < allAxes.length; ai++) {
      for (const leaf of allAxes[ai].leaves) {
        lines.push(csvRow([
          snap.day, ai, `L_a${ai}_n${leaf.nodeIdx}`, leaf.nodeIdx,
          leaf.visibility.visible,
          leaf.leafletCount, leaf.sizeFactor, leaf.yellowing,
          leaf.azimuthRad * RAD_TO_DEG,
          leaf.droopRad * RAD_TO_DEG,
          leaf.lateralSpreadDeg, leaf.elevationDeg,
          leaf.lateralSpreadSource, leaf.elevationSource,
        ]));
      }
    }
  }
  return lines.join('\n') + '\n';
}

// ── Case A/B/C/D diagnosis ────────────────────────────────────────────

interface CaseResult {
  fired: boolean;
  reason: string;
}

interface Diagnosis {
  modelVersion: string;
  seed: number;
  cases: {
    A_early_fruit_only: CaseResult;
    B_fruit_all_days: CaseResult;
    C_truss_overcount: CaseResult;
    D_stem_off: CaseResult;
  };
  recommendedNextIter: string;
}

function fruitOOB(overall: PlantOverall, b: ReturnType<ReferenceBundle['plantBandFor']>): boolean {
  if (!b?.fruitCount || !b?.maxFruitDiameter) return false;
  return overall.fruitCountTotal < b.fruitCount[0]
      || overall.fruitCountTotal > b.fruitCount[1]
      || overall.maxFruitDiameterMm < b.maxFruitDiameter[0]
      || overall.maxFruitDiameterMm > b.maxFruitDiameter[1];
}

function stemOOB(overall: PlantOverall, b: ReturnType<ReferenceBundle['plantBandFor']>): boolean {
  if (!b) return false;
  const heightOOB = b.height
    ? (overall.heightCm < b.height[0] || overall.heightCm > b.height[1])
    : false;
  const nodeOOB = b.nodeCount
    ? (overall.nodeCount < b.nodeCount[0] || overall.nodeCount > b.nodeCount[1])
    : false;
  return heightOOB || nodeOOB;
}

function trussOver(overall: PlantOverall, b: ReturnType<ReferenceBundle['plantBandFor']>): boolean {
  if (!b?.visibleTruss) return false;
  return overall.visibleTrussCount > b.visibleTruss[1];
}

function diagnose(overalls: PlantOverall[], bundle: ReferenceBundle, args: CliArgs): Diagnosis {
  const day30 = overalls.find(o => o.day === 30);
  const day33 = overalls.find(o => o.day === 33);
  const day60 = overalls.find(o => o.day === 60);
  const day90 = overalls.find(o => o.day === 90);

  const day30Band = day30 ? bundle.plantBandFor(30) : null;
  const day33Band = day33 ? bundle.plantBandFor(33) : null;
  const day60Band = day60 ? bundle.plantBandFor(60) : null;
  const day90Band = day90 ? bundle.plantBandFor(90) : null;

  // For day 33, fallback to day 33 special bundle's overall.
  let day33FruitBand: Band | null = null;
  let day33MaxDiamBand: Band | null = null;
  const day33Special = bundle.day33Bundle();
  if (day33Special && !day33Band) {
    const o = day33Special.expected.overall;
    if (o.fruitCountTotal) day33FruitBand = [o.fruitCountTotal.min, o.fruitCountTotal.max];
    if (o.maxFruitDiameterMm) day33MaxDiamBand = [o.maxFruitDiameterMm.min, o.maxFruitDiameterMm.max];
  }

  const day30FruitOOB = day30 && fruitOOB(day30, day30Band);
  const day33FruitOOBStandard = day33 && fruitOOB(day33, day33Band);
  const day33FruitOOBSpecial = day33 && day33FruitBand && day33MaxDiamBand
    ? (day33.fruitCountTotal < day33FruitBand[0] || day33.fruitCountTotal > day33FruitBand[1]
       || day33.maxFruitDiameterMm < day33MaxDiamBand[0] || day33.maxFruitDiameterMm > day33MaxDiamBand[1])
    : false;
  const day33FruitOOBFinal = !!(day33FruitOOBStandard || day33FruitOOBSpecial);
  const day60FruitOOB = day60 && fruitOOB(day60, day60Band);
  const day90FruitOOB = day90 && fruitOOB(day90, day90Band);

  const A = (!!day30FruitOOB || day33FruitOOBFinal) && !day60FruitOOB && !day90FruitOOB;
  const B = (!!day30FruitOOB || day33FruitOOBFinal) && (!!day60FruitOOB || !!day90FruitOOB);
  const C = (day30 ? trussOver(day30, day30Band) : false) || (day33 ? trussOver(day33, day33Band) : false);
  const D = overalls.some(o => {
    const b = bundle.plantBandFor(o.day);
    return stemOOB(o, b);
  });

  const reasonFor = (o: PlantOverall | undefined, b: ReturnType<ReferenceBundle['plantBandFor']>, fruitBand: Band | null = null, diamBand: Band | null = null): string => {
    if (!o) return 'no_data';
    const fBand = fruitBand ?? b?.fruitCount ?? null;
    const dBand = diamBand ?? b?.maxFruitDiameter ?? null;
    const fStr = fBand ? `${fBand[0]}-${fBand[1]}` : 'no_band';
    const dStr = dBand ? `${dBand[0]}-${dBand[1]}` : 'no_band';
    const fOOB = fBand && (o.fruitCountTotal < fBand[0] || o.fruitCountTotal > fBand[1]);
    const dOOB = dBand && (o.maxFruitDiameterMm < dBand[0] || o.maxFruitDiameterMm > dBand[1]);
    return `day${o.day} fruit=${o.fruitCountTotal} ${fOOB ? 'OOB' : 'IB'} (band ${fStr}); maxDiam=${o.maxFruitDiameterMm.toFixed(1)}mm ${dOOB ? 'OOB' : 'IB'} (band ${dStr})`;
  };

  const stemReasonFor = (o: PlantOverall | undefined, b: ReturnType<ReferenceBundle['plantBandFor']>): string => {
    if (!o) return 'no_data';
    const hStr = b?.height ? `${b.height[0]}-${b.height[1]}` : 'no_band';
    const nStr = b?.nodeCount ? `${b.nodeCount[0]}-${b.nodeCount[1]}` : 'no_band';
    const hOOB = b?.height && (o.heightCm < b.height[0] || o.heightCm > b.height[1]);
    const nOOB = b?.nodeCount && (o.nodeCount < b.nodeCount[0] || o.nodeCount > b.nodeCount[1]);
    return `day${o.day} height=${o.heightCm.toFixed(0)}cm ${hOOB ? 'OOB' : 'IB'} (${hStr}); node=${o.nodeCount} ${nOOB ? 'OOB' : 'IB'} (${nStr})`;
  };

  const reasons = {
    A_early_fruit_only: [day30, day33, day60, day90]
      .map((o, i) => reasonFor(o, [day30Band, day33Band, day60Band, day90Band][i],
        i === 1 ? day33FruitBand : null, i === 1 ? day33MaxDiamBand : null))
      .filter(s => s !== 'no_data').join(' | '),
    B_fruit_all_days: [day30, day60, day90].map((o, i) =>
      reasonFor(o, [day30Band, day60Band, day90Band][i])).filter(s => s !== 'no_data').join(' | '),
    C_truss_overcount: [day30, day33].map((o, i) =>
      o ? `day${o.day} visibleTrussCount=${o.visibleTrussCount} band ${(([day30Band, day33Band][i])?.visibleTruss ?? 'no_band')}` : 'no_data').filter(s => s !== 'no_data').join(' | '),
    D_stem_off: overalls.map(o => stemReasonFor(o, bundle.plantBandFor(o.day))).join(' | '),
  };

  // Recommended next iter
  let recommendation = 'No fix needed — all metrics in-band.';
  if (A && !B) recommendation = 'Iter 5a: phase-gated visible mass (Case A primary)';
  else if (B) recommendation = 'Iter 5b: Gompertz sink request 연결 (Case B — fruit OOB at multiple days)';
  if (C) recommendation += ' + phenology truss emergence 조정 (Case C)';
  if (D) recommendation += (recommendation === 'No fix needed — all metrics in-band.' ? 'Iter 5c: ' : ' + ') + 'stem growth/phyllochron 조정 (Case D)';

  return {
    modelVersion: args.modelVersion,
    seed: args.seed,
    cases: {
      A_early_fruit_only: { fired: A, reason: reasons.A_early_fruit_only },
      B_fruit_all_days:   { fired: B, reason: reasons.B_fruit_all_days },
      C_truss_overcount:  { fired: C, reason: reasons.C_truss_overcount },
      D_stem_off:         { fired: D, reason: reasons.D_stem_off },
    },
    recommendedNextIter: recommendation,
  };
}

// ── User summary (Markdown) ───────────────────────────────────────────

function userSummaryMd(
  overalls: PlantOverall[],
  bundle: ReferenceBundle,
  snapshots: DaySnapshot[],
  diagnosis: Diagnosis,
  args: CliArgs,
): string {
  const lines: string[] = [];
  lines.push(`# Growth Checkpoint Summary: ${args.modelVersion} / seed ${args.seed}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Cultivar: ${args.cultivar}`);
  lines.push(`Days analyzed: ${args.days.join(', ')}`);
  lines.push('');

  for (const o of overalls) {
    const b = bundle.plantBandFor(o.day);
    const leafBand = bundle.leafBandFor(o.day);

    // For day 33, supplement with special bundle if normal CSV band absent
    // (plant CSV is 10-day step; day 33 lives in 06_day33_diagnostic_target.json)
    let heightBand: Band | null = b?.height ?? null;
    let nodeBand: Band | null = b?.nodeCount ?? null;
    let trussBand: Band | null = b?.visibleTruss ?? null;
    let fruitBand: Band | null = b?.fruitCount ?? null;
    let maxDiamBand: Band | null = b?.maxFruitDiameter ?? null;
    let leafSpreadBand: Band | null = leafBand?.lateralSpreadDeg ?? null;
    if (o.day === 33) {
      const sp = bundle.day33Bundle();
      if (sp) {
        const ov = sp.expected.overall;
        if (!heightBand && ov.heightCm) heightBand = [ov.heightCm.min, ov.heightCm.max];
        if (!nodeBand && ov.nodeCount) nodeBand = [ov.nodeCount.min, ov.nodeCount.max];
        if (!trussBand && ov.visibleTrussCount) trussBand = [ov.visibleTrussCount.min, ov.visibleTrussCount.max];
        if (!fruitBand && ov.fruitCountTotal) fruitBand = [ov.fruitCountTotal.min, ov.fruitCountTotal.max];
        if (!maxDiamBand && ov.maxFruitDiameterMm) maxDiamBand = [ov.maxFruitDiameterMm.min, ov.maxFruitDiameterMm.max];
        if (!leafSpreadBand) leafSpreadBand = [sp.expected.leafOrientation.lateralSpreadDeg.min, sp.expected.leafOrientation.lateralSpreadDeg.max];
      }
    }

    // Per-metric match
    const heightPct = matchPercent(o.heightCm, heightBand);
    const nodePct = matchPercent(o.nodeCount, nodeBand);
    const trussPct = matchPercent(o.visibleTrussCount, trussBand);
    const fruitPct = matchPercent(o.fruitCountTotal, fruitBand);
    const diamPct = matchPercent(o.maxFruitDiameterMm, maxDiamBand);

    // Leaf orientation — mean lateralSpreadDeg across visible leaves
    const snap = snapshots.find(s => s.day === o.day);
    let leafSpreadMean = 0;
    let leafSpreadCount = 0;
    if (snap) {
      const allAxes = [snap.plantBase.mainAxis, ...snap.plantBase.sideShoots];
      for (const axis of allAxes) {
        for (const leaf of axis.leaves) {
          if (!leaf.visibility.visible) continue;
          leafSpreadMean += leaf.lateralSpreadDeg;
          leafSpreadCount++;
        }
      }
      if (leafSpreadCount > 0) leafSpreadMean /= leafSpreadCount;
    }
    const leafSpreadPct = matchPercent(leafSpreadMean, leafSpreadBand);

    // Overall match %
    const pcts = [heightPct, nodePct, trussPct, fruitPct, diamPct, leafSpreadPct].filter(p => p !== null) as number[];
    const overall = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;

    const heightStr = heightBand ? `${heightBand[0]}~${heightBand[1]}cm` : '목표 없음';
    const nodeStr = nodeBand ? `${nodeBand[0]}~${nodeBand[1]}` : '목표 없음';
    const trussStr = trussBand ? `${trussBand[0]}~${trussBand[1]}` : '목표 없음';
    const fruitStr = fruitBand ? `${fruitBand[0]}~${fruitBand[1]}` : '목표 없음';
    const diamStr = maxDiamBand ? `${maxDiamBand[0]}~${maxDiamBand[1]}mm` : '목표 없음';
    const spreadStr = leafSpreadBand
      ? `${leafSpreadBand[0]}~${leafSpreadBand[1]}°`
      : '목표 없음';

    lines.push(`## Day ${o.day} — ${overall.toFixed(0)}% 부합`);
    lines.push(`- 키: ${o.heightCm.toFixed(1)}cm / 목표 ${heightStr} → ${heightPct?.toFixed(0) ?? 'N/A'}%, ${judgmentFor(o.heightCm, heightBand)}`);
    lines.push(`- 마디 수: ${o.nodeCount} / 목표 ${nodeStr} → ${nodePct?.toFixed(0) ?? 'N/A'}%, ${judgmentFor(o.nodeCount, nodeBand)}`);
    lines.push(`- 화방 수: ${o.visibleTrussCount} / 목표 ${trussStr} → ${trussPct?.toFixed(0) ?? 'N/A'}%, ${judgmentFor(o.visibleTrussCount, trussBand)}`);
    lines.push(`- 과실 수: ${o.fruitCountTotal} / 목표 ${fruitStr} → ${fruitPct?.toFixed(0) ?? 'N/A'}%, ${judgmentFor(o.fruitCountTotal, fruitBand)}`);
    lines.push(`- 최대 과실: ${o.maxFruitDiameterMm.toFixed(1)}mm / 목표 ${diamStr} → ${diamPct?.toFixed(0) ?? 'N/A'}%, ${judgmentFor(o.maxFruitDiameterMm, maxDiamBand)}`);
    lines.push(`- 잎 펼침 (mean): ${leafSpreadMean.toFixed(1)}° / 목표 ${spreadStr} → ${leafSpreadPct?.toFixed(0) ?? 'N/A'}%, ${judgmentFor(leafSpreadMean, leafSpreadBand)} *(leaflet_count_estimate)*`);

    // One-line decision
    const fruitFail = (fruitPct ?? 100) < 50;
    const stemFail = (heightPct ?? 100) < 80 || (nodePct ?? 100) < 80;
    const trussOver = trussBand && o.visibleTrussCount > trussBand[1];
    let decision = '대부분 정상';
    if (fruitFail && stemFail) decision = '과실 + 줄기 모두 문제';
    else if (fruitFail) decision = '과실 비대 로직이 문제 (화방/줄기는 무관)';
    else if (stemFail) decision = '줄기 진행이 OOB';
    else if (trussOver) decision = '화방 수 과다';
    lines.push(`- **판단**: ${decision}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## 결론');
  lines.push('');
  const firedCases = Object.entries(diagnosis.cases).filter(([_, v]) => v.fired).map(([k]) => k);
  if (firedCases.length === 0) {
    lines.push('- 모든 metric in-band. fix 불필요.');
  } else {
    lines.push(`- 발화된 Case: **${firedCases.join(', ')}**`);
    lines.push(`- 추천 Iter 5 방향: **${diagnosis.recommendedNextIter}**`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 주의 (estimate 값)');
  lines.push('');
  lines.push('- `lateral_spread_deg`은 leafletCount 기반 ESTIMATE (`leaflet_count_estimate`).');
  lines.push('  실제 compound leaf geometry (SkinMeshPlant)에서 도출하는 정식 구현은');
  lines.push('  별도 후속 plan. 본 값은 clamp(30 + (count-1)*10, 0, 90).');
  lines.push('- `elevation_deg`은 droopRad에서 단순 도출한 proxy (`droop_rad_proxy`).');

  return lines.join('\n') + '\n';
}

// ── Main ──────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[dump-growth-checkpoints] cultivar=${args.cultivar} seed=${args.seed} days=[${args.days.join(',')}] model=${args.modelVersion}`);

  const bundle = loadReferenceBundle(args.referenceBundle);

  const snapshots: DaySnapshot[] = [];
  const overalls: PlantOverall[] = [];
  for (const day of args.days) {
    const snap = runEngineToDay(args, day);
    snapshots.push(snap);
    overalls.push(plantOverall(snap));
    console.log(`  day ${day} ✓`);
  }

  const diagnosis = diagnose(overalls, bundle, args);

  const outDir = join(args.outRoot, args.modelVersion);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, 'plant_summary.csv'), buildPlantSummaryCsv(overalls, bundle));
  writeFileSync(join(outDir, 'truss_summary.csv'), buildTrussSummaryCsv(snapshots));
  writeFileSync(join(outDir, 'fruit_summary.csv'), buildFruitSummaryCsv(snapshots));
  writeFileSync(join(outDir, 'leaf_orientation_summary.csv'), buildLeafOrientationCsv(snapshots));
  writeFileSync(join(outDir, 'diagnosis.json'), JSON.stringify(diagnosis, null, 2) + '\n');

  const summary = {
    modelVersion: args.modelVersion,
    seed: args.seed,
    cultivar: args.cultivar,
    days: args.days,
    referenceBundle: args.referenceBundle,
    timestamp: new Date().toISOString(),
    overalls,
    diagnosis,
  };
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

  const userMd = userSummaryMd(overalls, bundle, snapshots, diagnosis, args);
  writeFileSync(join(outDir, 'user_summary.md'), userMd);

  console.log(`\n[done] 4 CSV + summary.json + diagnosis.json + user_summary.md`);
  console.log(`  → ${outDir}/`);
  console.log('');
  console.log('=== diagnosis ===');
  for (const [name, c] of Object.entries(diagnosis.cases)) {
    console.log(`  ${name}: ${c.fired ? 'FIRED' : '----'}`);
  }
  console.log(`  recommendation: ${diagnosis.recommendedNextIter}`);
}

main();
