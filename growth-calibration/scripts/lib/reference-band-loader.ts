// reference-band-loader — Reference Pack CSV/JSON 파싱 + per-day band lookup.
//
// Used by: dump-growth-checkpoints.ts
//
// Loads:
//   - 01_plant_timeline_target.csv         → per-day plant overall bands
//   - 02_truss_timeline_target.csv         → per-truss timeline (visible_day,
//                                            flower_day, ...)
//   - 04_leaf_timeline_target.csv          → per-day leaf bands
//                                            (lateral_spread, droop,
//                                            elevation, etc.)
//   - 05_fruit_timeline_target.csv         → per (day, truss) fruit bands
//                                            (visible_fruit, max_diameter,
//                                            allowed_stage)
//   - 06_day33_diagnostic_target.json      → special day 33 expected bundle
//                                            (overall + trusses + leafOrientation)
//
// API:
//   const bundle = loadReferenceBundle(referencePackDir);
//   bundle.plantBandFor(day)                → { height: [min,max] | null, ... } | null
//   bundle.leafBandFor(day)                 → { lateralSpread: [min,max] | null, ... } | null
//   bundle.fruitBandFor(day, trussIndex)    → { visibleFruit: [min,max] | null, ... } | null
//   bundle.trussTimeline(trussIndex)        → { visibleDay: [min,max], ... } | null
//   bundle.day33Bundle()                    → full 06_day33_diagnostic_target.json contents
//
// All bands are [min, max] inclusive. null means "no target row found".

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Band = [number, number];

export interface PlantBand {
  height: Band | null;
  nodeCount: Band | null;
  visibleLeaf: Band | null;
  expandedLeaf: Band | null;
  visibleTruss: Band | null;
  floweringTruss: Band | null;
  fruitingTruss: Band | null;
  fruitCount: Band | null;
  maxFruitDiameter: Band | null;
  expectedStage: string | null;
}

export interface LeafBand {
  visibleLeaf: Band | null;
  expandedLeaf: Band | null;
  leafletCount: Band | null;
  petioleLengthCm: Band | null;
  rachisLengthCm: Band | null;
  leafLengthCm: Band | null;
  leafWidthCm: Band | null;
  droopAngleDeg: Band | null;
  lateralSpreadDeg: Band | null;
  elevationDeg: Band | null;
}

export interface FruitBand {
  allowedStageMin: string | null;
  allowedStageMax: string | null;
  visibleFruit: Band | null;
  maxDiameterMm: Band | null;
  diagnosticNote: string | null;
}

export interface TrussTimeline {
  trussIndex: number;
  visibleDay: Band | null;
  flowerDay: Band | null;
  fruitSetDay: Band | null;
  visibleFruitDay: Band | null;
  expandingDay: Band | null;
  breakerDay: Band | null;
  attachedNode: Band | null;
}

export interface Day33Bundle {
  expected: {
    overall: Record<string, { min: number; max: number }>;
    trusses: Array<{
      trussIndex: number;
      allowedStatus: string[];
      disallowedStatus: string[];
      maxVisibleFruitCount: number;
      maxFruitDiameterMm: number;
    }>;
    leafOrientation: {
      lateralSpreadDeg: { min: number; max: number };
      elevationDeg: { min: number; max: number };
      droopAngleDeg: { min: number; max: number };
    };
  };
}

export interface ReferenceBundle {
  plantBandFor(day: number): PlantBand | null;
  leafBandFor(day: number): LeafBand | null;
  fruitBandFor(day: number, trussIndex: number): FruitBand | null;
  trussTimeline(trussIndex: number): TrussTimeline | null;
  day33Bundle(): Day33Bundle | null;
}

// ── CSV parsing (minimal, no dependencies) ────────────────────────────

function parseCsv(text: string): { header: string[]; rows: Record<string, string>[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(',');
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const row: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = cells[c] ?? '';
    }
    rows.push(row);
  }
  return { header, rows };
}

function band(row: Record<string, string>, minKey: string, maxKey: string): Band | null {
  const min = parseFloat(row[minKey]);
  const max = parseFloat(row[maxKey]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return [min, max];
}

// ── Loader ────────────────────────────────────────────────────────────

export function loadReferenceBundle(referencePackDir: string): ReferenceBundle {
  const plantText = readFileSync(join(referencePackDir, '01_plant_timeline_target.csv'), 'utf-8');
  const trussText = readFileSync(join(referencePackDir, '02_truss_timeline_target.csv'), 'utf-8');
  const leafText = readFileSync(join(referencePackDir, '04_leaf_timeline_target.csv'), 'utf-8');
  const fruitText = readFileSync(join(referencePackDir, '05_fruit_timeline_target.csv'), 'utf-8');

  const plantRows = parseCsv(plantText).rows;
  const trussRows = parseCsv(trussText).rows;
  const leafRows = parseCsv(leafText).rows;
  const fruitRows = parseCsv(fruitText).rows;

  // day 33 special bundle (optional)
  let day33: Day33Bundle | null = null;
  try {
    const txt = readFileSync(join(referencePackDir, '06_day33_diagnostic_target.json'), 'utf-8');
    day33 = JSON.parse(txt) as Day33Bundle;
  } catch {
    day33 = null;
  }

  // Pre-index by day for O(1) lookup
  const plantByDay = new Map<number, PlantBand>();
  for (const row of plantRows) {
    const day = parseInt(row.day, 10);
    if (!Number.isFinite(day)) continue;
    plantByDay.set(day, {
      height: band(row, 'height_cm_min', 'height_cm_max'),
      nodeCount: band(row, 'node_count_min', 'node_count_max'),
      visibleLeaf: band(row, 'visible_leaf_min', 'visible_leaf_max'),
      expandedLeaf: band(row, 'expanded_leaf_min', 'expanded_leaf_max'),
      visibleTruss: band(row, 'visible_truss_min', 'visible_truss_max'),
      floweringTruss: band(row, 'flowering_truss_min', 'flowering_truss_max'),
      fruitingTruss: band(row, 'fruiting_truss_min', 'fruiting_truss_max'),
      fruitCount: band(row, 'fruit_count_min', 'fruit_count_max'),
      maxFruitDiameter: band(row, 'max_fruit_diameter_mm_min', 'max_fruit_diameter_mm_max'),
      expectedStage: row.expected_stage ?? null,
    });
  }

  const leafByDay = new Map<number, LeafBand>();
  for (const row of leafRows) {
    const day = parseInt(row.day, 10);
    if (!Number.isFinite(day)) continue;
    leafByDay.set(day, {
      visibleLeaf: band(row, 'visible_leaf_min', 'visible_leaf_max'),
      expandedLeaf: band(row, 'expanded_leaf_min', 'expanded_leaf_max'),
      leafletCount: band(row, 'leaflet_count_min', 'leaflet_count_max'),
      petioleLengthCm: band(row, 'petiole_length_cm_min', 'petiole_length_cm_max'),
      rachisLengthCm: band(row, 'rachis_length_cm_min', 'rachis_length_cm_max'),
      leafLengthCm: band(row, 'leaf_length_cm_min', 'leaf_length_cm_max'),
      leafWidthCm: band(row, 'leaf_width_cm_min', 'leaf_width_cm_max'),
      droopAngleDeg: band(row, 'droop_angle_deg_min', 'droop_angle_deg_max'),
      lateralSpreadDeg: band(row, 'lateral_spread_deg_min', 'lateral_spread_deg_max'),
      elevationDeg: band(row, 'elevation_deg_min', 'elevation_deg_max'),
    });
  }

  // Fruit table is per (day, truss_index)
  const fruitByDayTruss = new Map<string, FruitBand>();
  for (const row of fruitRows) {
    const day = parseInt(row.day, 10);
    const ti = parseInt(row.truss_index, 10);
    if (!Number.isFinite(day) || !Number.isFinite(ti)) continue;
    fruitByDayTruss.set(`${day}:${ti}`, {
      allowedStageMin: row.allowed_stage_min ?? null,
      allowedStageMax: row.allowed_stage_max ?? null,
      visibleFruit: band(row, 'visible_fruit_min', 'visible_fruit_max'),
      maxDiameterMm: band(row, 'max_diameter_mm_min', 'max_diameter_mm_max'),
      diagnosticNote: row.diagnostic_note ?? null,
    });
  }

  const trussByIndex = new Map<number, TrussTimeline>();
  for (const row of trussRows) {
    const ti = parseInt(row.truss_index, 10);
    if (!Number.isFinite(ti)) continue;
    trussByIndex.set(ti, {
      trussIndex: ti,
      visibleDay: band(row, 'visible_day_min', 'visible_day_max'),
      flowerDay: band(row, 'flower_day_min', 'flower_day_max'),
      fruitSetDay: band(row, 'fruit_set_day_min', 'fruit_set_day_max'),
      visibleFruitDay: band(row, 'visible_fruit_day_min', 'visible_fruit_day_max'),
      expandingDay: band(row, 'expanding_day_min', 'expanding_day_max'),
      breakerDay: band(row, 'breaker_day_min', 'breaker_day_max'),
      attachedNode: band(row, 'attached_node_min', 'attached_node_max'),
    });
  }

  return {
    plantBandFor: (day) => plantByDay.get(day) ?? null,
    leafBandFor: (day) => leafByDay.get(day) ?? null,
    fruitBandFor: (day, trussIndex) => fruitByDayTruss.get(`${day}:${trussIndex}`) ?? null,
    trussTimeline: (trussIndex) => trussByIndex.get(trussIndex) ?? null,
    day33Bundle: () => day33,
  };
}

// ── Match % calculation ───────────────────────────────────────────────

/**
 * Per-field match % for the user-summary.md report.
 * - [min, max] band: 100 if actual ∈ band; else linear falloff from boundary
 * - zero-band [0, 0] && actual > 0: returns 0 (e.g. "fruit at day 30")
 * - null band: returns null (no target)
 */
export function matchPercent(actual: number | null, band: Band | null): number | null {
  if (actual === null) return null;
  if (!band) return null;
  const [min, max] = band;
  if (actual >= min && actual <= max) return 100;
  if (min === 0 && max === 0 && actual > 0) return 0;
  if (actual < min) {
    const denom = min === 0 ? 1 : Math.abs(min);
    return Math.max(0, 100 - (Math.abs(min - actual) / denom) * 100);
  }
  // actual > max
  const denom = max === 0 ? 1 : Math.abs(max);
  return Math.max(0, 100 - (Math.abs(actual - max) / denom) * 100);
}

export function judgmentFor(actual: number | null, band: Band | null): string {
  if (actual === null || !band) return 'no_target';
  const [min, max] = band;
  if (min === 0 && max === 0 && actual > 0) return '발생 안 했어야';
  const pct = matchPercent(actual, band);
  if (pct === null) return 'no_target';
  if (pct === 100) return '정상';
  if (pct >= 90) return '거의 정상';
  if (pct >= 70) return actual < min ? '약간 낮음' : '약간 높음';
  return actual < min ? '심각하게 낮음' : '심각하게 높음';
}
