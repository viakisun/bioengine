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
import { getCultivar, CULTIVARS } from '../../packages/tomato-engine/src/Cultivar';
import { DEFAULT_CLIMATE } from '../../packages/tomato-engine/src/CoreModel';
import { potentialFreshMassG } from '../../packages/tomato-engine/src/FruitGrowth';
import { ACTIVE_BOTANICAL } from '../../packages/tomato-engine/src/ModelRegistry';
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
  /** Iter 6 — sweep harness가 child-process로 호출할 때 Gompertz parameter
   *  override. format: "inflectionC=0.60,rateB=0.05,exponentScaling=0.01".
   *  Process-local mutation (다음 child에 안 새어나감). */
  overrideGompertz?: { inflectionC?: number; rateB?: number; exponentScaling?: number };
  /** Iter 6c — cultivar phenology override (cellDivision/Expansion).
   *  format: "cellDivisionDurationGDD=200,cellExpansionDurationGDD=400".
   *  Target cultivar (args.cultivar)만 mutate (SSOT #49). */
  overridePhenology?: { cellDivisionDurationGDD?: number; cellExpansionDurationGDD?: number };
}

function parseOverride(s?: string): CliArgs['overrideGompertz'] {
  if (!s) return undefined;
  const out: { inflectionC?: number; rateB?: number; exponentScaling?: number } = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === 'inflectionC') out.inflectionC = n;
    else if (k === 'rateB') out.rateB = n;
    else if (k === 'exponentScaling') out.exponentScaling = n;
  }
  return out;
}

function parseOverridePhenology(s?: string): CliArgs['overridePhenology'] {
  if (!s) return undefined;
  const out: { cellDivisionDurationGDD?: number; cellExpansionDurationGDD?: number } = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === 'cellDivisionDurationGDD') out.cellDivisionDurationGDD = n;
    else if (k === 'cellExpansionDurationGDD') out.cellExpansionDurationGDD = n;
  }
  return out;
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
    overrideGompertz: parseOverride(opts.overrideGompertz),
    overridePhenology: parseOverridePhenology(opts.overridePhenology),
  };
}

/** Iter 6 — process-local mutation. child process 안에서만 살아있음.
 *  주의: tomimaru의 `botanicalOverride.fruitDevelopment.gompertz`가 base
 *  mutation을 덮어쓰므로 (resolveBotanical merge에서 override 이김),
 *  base만 mutate하면 효과 없음. cultivar의 derived field도 직접 mutate. */
function applyOverrideGompertz(args: CliArgs): void {
  const ov = args.overrideGompertz;
  if (!ov) return;
  // 1. ACTIVE_BOTANICAL.tomato base mutate
  const fg = ACTIVE_BOTANICAL.tomato.fruitDevelopment.gompertz;
  if (ov.inflectionC !== undefined) fg.inflectionC.mu = ov.inflectionC;
  if (ov.rateB !== undefined) fg.rateB.mu = ov.rateB;
  if (ov.exponentScaling !== undefined) fg.exponentScaling = ov.exponentScaling;

  // 2. 모든 cultivar의 derived field 직접 mutate — cultivar.botanicalOverride
  //    이 base를 덮어쓰는 것을 sweep 동안은 무력화. CULTIVARS[name] 객체
  //    참조는 유지 (consumer가 이미 잡고 있음).
  for (const c of Object.values(CULTIVARS)) {
    if (ov.inflectionC !== undefined) {
      c.gompertzInflectionC = ov.inflectionC;
      c.resolvedBotanical.fruitDevelopment.gompertz.inflectionC.mu = ov.inflectionC;
    }
    if (ov.rateB !== undefined) {
      c.gompertzRateB = ov.rateB;
      c.resolvedBotanical.fruitDevelopment.gompertz.rateB.mu = ov.rateB;
    }
    if (ov.exponentScaling !== undefined) {
      c.resolvedBotanical.fruitDevelopment.gompertz.exponentScaling = ov.exponentScaling;
    }
  }
  console.log(`[override] gompertz: inflectionC=${ov.inflectionC ?? '-'}, rateB=${ov.rateB ?? '-'}, exponentScaling=${ov.exponentScaling ?? '-'}`);
}

/** Iter 6c — phenology override. cultivar.phenology field 직접 mutate (SSOT #49).
 *  Target cultivar (args.cultivar)만 mutate — cross-cultivar smoke test 안전. */
function applyOverridePhenology(args: CliArgs): void {
  const ov = args.overridePhenology;
  if (!ov) return;
  const c = CULTIVARS[args.cultivar];
  if (!c) {
    console.warn(`[override phenology] cultivar ${args.cultivar} not found — skip`);
    return;
  }
  if (ov.cellDivisionDurationGDD !== undefined) c.cellDivisionDurationGDD = ov.cellDivisionDurationGDD;
  if (ov.cellExpansionDurationGDD !== undefined) c.cellExpansionDurationGDD = ov.cellExpansionDurationGDD;
  console.log(`[override] phenology: cultivar=${args.cultivar} cellDiv=${ov.cellDivisionDurationGDD ?? '-'}, cellExp=${ov.cellExpansionDurationGDD ?? '-'}`);
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
  // Iter 5b — visible vs cohort 분리
  fruitCohortCount: number;            // internal fruit objects (aborted/harvested 제외, fertilized only)
  visibleFruitCount: number;           // diameterMm >= massFlow.minVisibleDiameterMm
  maxVisibleFruitDiameterMm: number;   // visible fruits 중 최대 (없으면 0)
  // Iter 6 — expansion 단계 fruit count (diameter + phase 둘 다 확인)
  expandingFruitCount: number;
  // Backward-compat aliases (= visible 기준)
  fruitCountTotal: number;             // = visibleFruitCount
  maxFruitDiameterMm: number;          // = maxVisibleFruitDiameterMm
  totalFruitFreshMassG: number;
}

const FRUITING_STATUSES = new Set([
  'fruit_set', 'small_green', 'green_expanding', 'breaker', 'red', 'harvest_ready',
]);

// Iter 6 — minExpandingDiameterMm from botanical + phase-aware
function mapTrussStatus(
  t: { emergenceTT: number; fruits: ReadonlyArray<{ fertilizationTT: number; ripenStage: number; aborted: boolean; harvested: boolean; diameter: number }> },
  currentTT: number,
  cultivar: ReturnType<typeof getCultivar>,
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

  // Iter 6 — botanical-driven expansion threshold + phase check
  const minExpand = cultivar.resolvedBotanical.fruitDevelopment.massFlow.minExpandingDiameterMm;
  const maxDiam = Math.max(...live.map(f => f.diameter));
  if (maxDiam >= minExpand) {
    // expansion 후보 — phase 확인 (cell_expansion 이상이어야)
    const expandingLive = live.filter(f => {
      const p = fruitPhase(f, currentTT, cultivar);
      return p.phase === 'cell_expansion' || p.phase === 'ripening_early' || p.phase === 'ripening_late';
    });
    if (expandingLive.length > 0) return 'green_expanding';
  }
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
  let cohortCount = 0;
  let visibleCount = 0;
  let expandingCount = 0;
  let maxVisibleDiam = 0;
  let totalFresh = 0;
  // Iter 5b — minVisibleDiameterMm from massFlow (default 0 if missing)
  const minVisibleDiameterMm =
    snap.cultivar.resolvedBotanical?.fruitDevelopment.massFlow.minVisibleDiameterMm ?? 0;
  // Iter 6 — minExpandingDiameterMm from massFlow
  const minExpandingDiameterMm =
    snap.cultivar.resolvedBotanical?.fruitDevelopment.massFlow.minExpandingDiameterMm ?? 10;

  for (const t of physiology.trusses) {
    const status = mapTrussStatus(t, physiology.TT, snap.cultivar);
    if (status === 'flowering') flowering++;
    if (FRUITING_STATUSES.has(status)) fruiting++;
    for (const f of t.fruits) {
      if (f.aborted || f.harvested) continue;
      if (f.fertilizationTT <= 0) continue;
      cohortCount++;
      totalFresh += f.W_fruit_fresh;
      if (f.diameter >= minVisibleDiameterMm) {
        visibleCount++;
        if (f.diameter > maxVisibleDiam) maxVisibleDiam = f.diameter;
      }
      // Iter 6 — expansion: diameter + phase 둘 다
      if (f.diameter >= minExpandingDiameterMm) {
        const p = fruitPhase(f, physiology.TT, snap.cultivar);
        if (p.phase === 'cell_expansion' || p.phase === 'ripening_early' || p.phase === 'ripening_late') {
          expandingCount++;
        }
      }
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
    fruitCohortCount: cohortCount,
    visibleFruitCount: visibleCount,
    maxVisibleFruitDiameterMm: maxVisibleDiam,
    expandingFruitCount: expandingCount,
    // Backward-compat aliases (= visible 기준 — Reference Pack과 비교)
    fruitCountTotal: visibleCount,
    maxFruitDiameterMm: maxVisibleDiam,
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
    'fruit_cohort_count', 'visible_fruit_count', 'expanding_fruit_count',  // Iter 6
    'max_visible_fruit_diameter_mm',
    'fruit_count_total', 'max_fruit_diameter_mm',  // aliases (= visible)
    'total_fruit_fresh_mass_g',
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
      r.fruitCohortCount, r.visibleFruitCount, r.expandingFruitCount,
      r.maxVisibleFruitDiameterMm,
      r.fruitCountTotal, r.maxFruitDiameterMm,
      r.totalFruitFreshMassG,
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
        snap.day, i + 1, mapTrussStatus(t, snap.physiology.TT, snap.cultivar), t.emergenceTT,
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
    'gdd_since_fert', 'cell_division_duration_gdd',
    'cell_expansion_duration_gdd', 'ripen_start_gdd',
    'phase', 'ripen_stage', 'starved_days',
    // Iter 5b — debug fields (massFlow.debug=true 일 때만 채워짐)
    'raw_sink_demand_g', 'max_step_demand_g', 'demand_was_limited',
    'dry_mass_before_cap_g', 'cumulative_dry_cap_g', 'cumulative_cap_was_applied',
    'allocated_dry_growth_g',
    // Iter 5b — Gompertz fresh mass + allowed diameter (fresh, audit table용)
    'gompertz_cap_fresh_g', 'gompertz_allowed_diameter_mm',
    'diameter_source',
  ];
  const lines = [header.join(',')];
  for (const snap of snapshots) {
    const massFlow = snap.cultivar.resolvedBotanical?.fruitDevelopment.massFlow;
    const dryRatio = massFlow?.fruitDryMatterRatio ?? 0.06;
    for (let i = 0; i < snap.physiology.trusses.length; i++) {
      const t = snap.physiology.trusses[i];
      for (let j = 0; j < t.fruits.length; j++) {
        const f = t.fruits[j];
        const p = fruitPhase(f, snap.physiology.TT, snap.cultivar);
        // Gompertz fresh cap @ current gddSinceFert
        const gp = {
          rateB: snap.cultivar.gompertzRateB,
          inflectionC: snap.cultivar.gompertzInflectionC,
          exponentScaling: snap.cultivar.resolvedBotanical?.fruitDevelopment.gompertz.exponentScaling ?? 0.01,
          cellDivisionDurationGDD: snap.cultivar.cellDivisionDurationGDD,
          cellExpansionDurationGDD: snap.cultivar.cellExpansionDurationGDD,
        };
        const gompertzFreshCap = potentialFreshMassG(p.gddSinceFert, f.genome.potentialMassG, gp);
        const gompertzAllowedDiamMm = freshMassToDiameterApprox(gompertzFreshCap);
        const d = f.debug;
        lines.push(csvRow([
          snap.day, i + 1, `F${i + 1}_${j + 1}`, f.aborted, f.harvested,
          f.diameter, f.W_fruit_fresh, f.W_fruit_dry,
          f.fertilizationTT, f.cellDivisionEndTT, f.ripenStartTT,
          p.gddSinceFert, p.cellDivisionDurationGDD,
          snap.cultivar.cellExpansionDurationGDD, p.ripenStartGDD,
          p.phase, f.ripenStage, f.starvedDays,
          d?.rawSinkDemandG ?? null,
          d ? (Number.isFinite(d.maxStepDemandG) ? d.maxStepDemandG : 'inf') : null,
          d?.demandWasLimited ?? null,
          d?.dryMassBeforeCapG ?? null,
          d ? (Number.isFinite(d.cumulativeDryCapG) ? d.cumulativeDryCapG : 'inf') : null,
          d?.cumulativeCapWasApplied ?? null,
          d?.allocatedDryGrowthG ?? null,
          gompertzFreshCap, gompertzAllowedDiamMm,
          massFlow?.mode ?? 'sink_allocation_mass_curve',
        ]));
      }
    }
  }
  return lines.join('\n') + '\n';
}

// Simple ovate approx: 200g ≈ 80mm fruit (Tomimaru beefsteak baseline).
// For audit table only — not used by engine. d = (m/k)^(1/3) where k=200/80³.
function freshMassToDiameterApprox(massG: number): number {
  if (massG <= 0) return 0;
  const k = 200 / Math.pow(80, 3);  // ≈ 3.91e-4
  return Math.pow(massG / k, 1 / 3);
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
    // Iter 6c (SSOT #50) — visible count vs max diameter 분리해서 판단
    const visibleCountFail = (fruitPct ?? 100) < 50;     // fruit count target 미달
    const maxDiamFail = (diamPct ?? 100) < 50;            // max diameter target 미달
    const stemFail = (heightPct ?? 100) < 80 || (nodePct ?? 100) < 80;
    const trussOver = trussBand && o.visibleTrussCount > trussBand[1];
    let decision = '대부분 정상';
    if (visibleCountFail && maxDiamFail && stemFail) decision = '과실 + 줄기 모두 문제';
    else if (visibleCountFail && maxDiamFail) decision = '과실 비대 + visible count 둘 다 문제';
    else if (visibleCountFail && !maxDiamFail) decision = 'visible fruit count 부족 (stage progression 문제, max diameter는 정상)';
    else if (maxDiamFail && !visibleCountFail) decision = '과실 비대 크기가 문제';
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

  // Iter 6 — apply Gompertz override (child-process sweep harness가 호출)
  applyOverrideGompertz(args);
  applyOverridePhenology(args);  // Iter 6c

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
