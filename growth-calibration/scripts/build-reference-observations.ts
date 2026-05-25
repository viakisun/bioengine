// build-reference-observations — convert Reference Pack v0.1 to
// PlantObservation form for the comparison engine.
//
// Reads:
//   growth-calibration/reference/tomato/tomato_tomimaru_reference_v0.1/
//     01_plant_timeline_target.csv  (per-day overall metrics, _min/_max)
//     03_truss_status_by_day.csv    (per-day per-truss status)
//     04_leaf_timeline_target.csv   (per-day leaf metrics incl. orientation)
//     05_fruit_timeline_target.csv  (per-day per-truss fruit stage)
//
// Writes:
//   growth-calibration/reference/tomato/tomimaru-muchoo_22C_reference.json
//   — one bundle with `provenance.sourceType: 'synthetic_reference'`,
//     containing 11 PlantObservation records (day 0, 10, ..., 100).
//
// Each observation uses range mid-values (e.g. heightCm = (min + max) / 2)
// so the comparison engine can compare scalar sim values against bands
// derived from the pack.
//
// Run:  npx vite-node growth-calibration/scripts/build-reference-observations.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  PlantObservation,
  TrussObservation,
  LeafObservation,
  TrussStatus,
  FruitStatus,
  Provenance,
} from '../schema/types';

const ROOT = join(__dirname, '..');
const PACK = join(ROOT, 'reference/tomato/tomato_tomimaru_reference_v0.1');
const OUT = join(ROOT, 'reference/tomato/tomimaru-muchoo_22C_reference.json');

const PROV: Provenance = {
  sourceType: 'synthetic_reference',
  confidence: 'low',
  sourceRefs: ['tomato_tomimaru_reference_v0.1'],
  notes: 'Auto-generated from Reference Pack v0.1 via build-reference-observations.ts. ' +
         'Range midpoints used for scalar fields. Replace with measured PlantObservations when available.',
};

// ── CSV parser (same as csv-import) ───────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const fields = line.split(',').map(f => f.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = fields[i] ?? ''; });
    return row;
  });
}

const num = (s: string): number => Number(s);
const mid = (lo: string, hi: string): number => (Number(lo) + Number(hi)) / 2;

// ── Load source CSVs ──────────────────────────────────────────────────

const plantRows = parseCsv(readFileSync(join(PACK, '01_plant_timeline_target.csv'), 'utf8'));
const trussRows = parseCsv(readFileSync(join(PACK, '03_truss_status_by_day.csv'), 'utf8'));
const leafRows  = parseCsv(readFileSync(join(PACK, '04_leaf_timeline_target.csv'), 'utf8'));

// 02 (truss_timeline_target) is used for attached_node_index lookup
const trussTimelineRows = parseCsv(readFileSync(join(PACK, '02_truss_timeline_target.csv'), 'utf8'));
function attachedNodeForTruss(trussIndex: number): number {
  const r = trussTimelineRows.find(row => Number(row.truss_index) === trussIndex);
  if (!r) return 0;
  return Math.round(mid(r.attached_node_min, r.attached_node_max));
}

// ── Phenology day inference (from plant timeline expected_stage) ──────

function inferPhenology(rowsBefore: typeof plantRows): PlantObservation['phenology'] {
  // Walk rows to find first day where each milestone happens
  let firstVisibleTrussDay: number | null = null;
  let firstFlowerOpenDay: number | null = null;
  let firstFruitSetDay: number | null = null;
  let firstFruitVisibleDay: number | null = null;
  let firstRipeFruitDay: number | null = null;

  for (const r of plantRows) {
    const d = Number(r.day);
    if (firstVisibleTrussDay === null && Number(r.visible_truss_max) >= 1) firstVisibleTrussDay = d;
    if (firstFlowerOpenDay === null && Number(r.flowering_truss_max) >= 1) firstFlowerOpenDay = d;
    if (firstFruitSetDay === null && Number(r.fruiting_truss_max) >= 1) firstFruitSetDay = d;
    if (firstFruitVisibleDay === null && Number(r.fruit_count_max) >= 1) firstFruitVisibleDay = d;
  }

  const last = rowsBefore[rowsBefore.length - 1];
  const lastStage = last?.expected_stage ?? '';
  const veg: PlantObservation['phenology']['vegetativeStage'] =
    Number(last?.day ?? 0) === 0   ? 'germination' :
    Number(last?.day ?? 0) <= 10   ? 'seedling' :
    Number(last?.day ?? 0) <= 30   ? 'juvenile' :
    Number(last?.day ?? 0) <= 90   ? 'active_growth' : 'mature';

  let repro: PlantObservation['phenology']['reproductiveStage'] = 'none';
  if (lastStage.includes('harvest')) repro = 'harvest';
  else if (lastStage.includes('ripening') || lastStage.includes('breaker')) repro = 'ripening';
  else if (lastStage.includes('expanding')) repro = 'fruit_expansion';
  else if (lastStage.includes('fruit_set')) repro = 'fruit_set';
  else if (lastStage.includes('flowering')) repro = 'flowering';
  else if (lastStage.includes('truss')) repro = 'truss_initiation';

  return {
    vegetativeStage: veg,
    reproductiveStage: repro,
    firstVisibleTrussDay,
    firstFlowerOpenDay,
    firstFruitSetDay,
    firstFruitVisibleDay,
    firstRipeFruitDay,
  };
}

// ── Build per-day PlantObservation ────────────────────────────────────

function buildObservation(day: number, dayIdx: number): PlantObservation {
  const plant = plantRows.find(r => Number(r.day) === day);
  if (!plant) throw new Error(`plant_timeline missing day ${day}`);

  const leafRow = leafRows.find(r => Number(r.day) === day);
  const trussRowsForDay = trussRows.filter(r => Number(r.day) === day);

  // Build TrussObservation for each truss row at this day
  const trusses: TrussObservation[] = trussRowsForDay.map(tr => {
    const trussIndex = Number(tr.truss_index);
    return {
      trussId: `T_ref_${trussIndex}`,
      trussIndex,
      attachedNodeIndex: attachedNodeForTruss(trussIndex),
      status: tr.allowed_status_max as TrussStatus,   // 사용자 표 범위 상한을 reference로
      ageDays: 0,
      peduncleLengthCm: 0,
      rachisLengthCm: 0,
      flowerBudCount: 0,
      openFlowerCount: 0,
      fruitSetCount: 0,
      visibleFruitCount: Math.round(mid(tr.visible_fruit_min, tr.visible_fruit_max)),
      largestFruitDiameterMm: mid(tr.max_fruit_diameter_mm_min, tr.max_fruit_diameter_mm_max),
      orientation: { azimuthDeg: 0, elevationDeg: -10, droopAngleDeg: 12 },
      phenology: { visibleDay: null, firstFlowerOpenDay: null, firstFruitSetDay: null,
                   firstFruitVisibleDay: null, firstRipeDay: null },
    };
  });

  // One representative LeafObservation per day (the pack defines per-day
  // bands, not per-leaf observations; a single mid-band leaf is enough for
  // sim comparison via leaves[*] aggregation).
  const leaves: LeafObservation[] = leafRow ? [{
    leafId: `L_ref_day${day}`,
    nodeIndex: Math.round(mid(plant.node_count_min, plant.node_count_max)),
    status: day < 20 ? 'expanding' : 'expanded',
    ageDays: 8,
    compoundLeaf: true,
    leafletCount: Math.round(mid(leafRow.leaflet_count_min, leafRow.leaflet_count_max)),
    petioleLengthCm: mid(leafRow.petiole_length_cm_min, leafRow.petiole_length_cm_max),
    rachisLengthCm: mid(leafRow.rachis_length_cm_min, leafRow.rachis_length_cm_max),
    leafLengthCm: mid(leafRow.leaf_length_cm_min, leafRow.leaf_length_cm_max),
    leafWidthCm: mid(leafRow.leaf_width_cm_min, leafRow.leaf_width_cm_max),
    leafAreaCm2: 0,                                   // 명시 없음, 후속 계산
    orientation: {
      azimuthDeg: 90,                                 // mid of [0, 180]
      elevationDeg: mid(leafRow.elevation_deg_min, leafRow.elevation_deg_max),
      droopAngleDeg: mid(leafRow.droop_angle_deg_min, leafRow.droop_angle_deg_max),
      rollDeg: 0,
    },
    shape: { averageLeafletAspect: 1.8, serrationLevel: 'medium', curlLevel: 'low' },
    health: { colorStage: 'green', senescence: 0, damageRatio: 0 },
  }] : [];

  return {
    schemaVersion: 'growthCalibration.v1',
    provenance: PROV,
    experimentId: 'tomato_tomimaru_reference_v0.1',
    plantId: `REF_P_day${day.toString().padStart(3, '0')}`,
    day,
    observationDate: `2026-06-01_+day${day}`,        // 출발일 from manifest createdAt
    plantAgeDays: day,
    thermalTime: {
      baseTemperatureC: 10,
      dailyGdd: 12,
      accumulatedGdd: day * 12,
      method: 'simple_average',
    },
    overall: {
      heightCm:            mid(plant.height_cm_min, plant.height_cm_max),
      mainStemLengthCm:    mid(plant.height_cm_min, plant.height_cm_max),
      mainStemDiameterMm:  4 + day * 0.15,            // crude estimate; pack lacks stem diam
      nodeCount:           Math.round(mid(plant.node_count_min, plant.node_count_max)),
      visibleLeafCount:    Math.round(mid(plant.visible_leaf_min, plant.visible_leaf_max)),
      expandedLeafCount:   Math.round(mid(plant.expanded_leaf_min, plant.expanded_leaf_max)),
      visibleTrussCount:   Math.round(mid(plant.visible_truss_min, plant.visible_truss_max)),
      floweringTrussCount: Math.round(mid(plant.flowering_truss_min, plant.flowering_truss_max)),
      fruitingTrussCount:  Math.round(mid(plant.fruiting_truss_min, plant.fruiting_truss_max)),
      fruitCountTotal:     Math.round(mid(plant.fruit_count_min, plant.fruit_count_max)),
    },
    phenology: inferPhenology(plantRows.slice(0, dayIdx + 1)),
    nodes: [],
    leaves,
    trusses,
    fruits: [],                                       // packed in trusses[].visibleFruitCount; per-fruit detail not in v0.1
    qualityFlags: { missingMeasurement: false, occludedOrgans: false, imageQuality: 'good' },
  };
}

// ── Generate bundle ───────────────────────────────────────────────────

const targetDays = plantRows.map(r => Number(r.day));
const observations: PlantObservation[] = targetDays.map((d, i) => buildObservation(d, i));

interface ReferenceObservationBundle {
  schemaVersion: 'growthCalibration.v1';
  bundleSchemaVersion: 'referenceObservationBundle.v0.1';
  referencePackId: string;
  generatedAt: string;
  observationCount: number;
  observations: PlantObservation[];
}

const bundle: ReferenceObservationBundle = {
  schemaVersion: 'growthCalibration.v1',
  bundleSchemaVersion: 'referenceObservationBundle.v0.1',
  referencePackId: 'tomato_tomimaru_reference_v0.1',
  generatedAt: new Date().toISOString(),
  observationCount: observations.length,
  observations,
};

writeFileSync(OUT, JSON.stringify(bundle, null, 2));
process.stdout.write(`[build-reference-observations] wrote ${observations.length} observations → ${OUT}\n`);
process.stdout.write(`  days: ${targetDays.join(', ')}\n`);
