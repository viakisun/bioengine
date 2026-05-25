// parse_csv_to_observation — CSV → PlantObservation transformer.
//
// Consumes csv_mapping_rules.jsonc + field CSV (plant + truss + leaf + fruit
// snapshots) and produces typed PlantObservation JSON.
//
// CSV authoring rules (binding):
//   - String range cells like "-5 to -20" are FORBIDDEN. Use _min / _max
//     paired columns instead.
//   - Empty cell → JSON null.
//   - Enum cells must match exact enum string.
//   - Float: "." decimal only.
//
// Usage:
//   node growth-calibration/scripts/import-csv.ts \
//     --plant-csv path/to/plant.csv \
//     --truss-csv path/to/truss.csv \
//     --leaf-csv path/to/leaf.csv \
//     --fruit-csv path/to/fruit.csv \
//     --out path/to/observation.json

import type {
  PlantObservation,
  TrussObservation,
  LeafObservation,
  FruitObservation,
  Provenance,
} from '../types';

// ── Minimal CSV parser (handles quoted fields + comma-in-quotes) ──────

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = fields[j] ?? '';
    rows.push(row);
  }
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// ── Value coercion + forbidden pattern guard ──────────────────────────

const FORBIDDEN_RANGE_PATTERN = /^\s*-?\d+(\.\d+)?\s*to\s*-?\d+(\.\d+)?\s*$/i;

export function coerceNumber(raw: string, label: string): number | null {
  if (raw === '' || raw == null) return null;
  if (FORBIDDEN_RANGE_PATTERN.test(raw)) {
    throw new Error(
      `[csv-import] ${label}: string range '${raw}' is FORBIDDEN. Use _min / _max paired columns instead.`,
    );
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`[csv-import] ${label}: '${raw}' is not a number`);
  }
  return n;
}

export function coerceInteger(raw: string, label: string): number | null {
  const n = coerceNumber(raw, label);
  if (n === null) return null;
  if (!Number.isInteger(n)) throw new Error(`[csv-import] ${label}: '${raw}' is not an integer`);
  return n;
}

export function coerceEnum<T extends string>(
  raw: string, allowed: readonly T[], label: string,
): T | null {
  if (raw === '' || raw == null) return null;
  if (!allowed.includes(raw as T)) {
    throw new Error(
      `[csv-import] ${label}: '${raw}' not in allowed enum {${allowed.join(', ')}}`,
    );
  }
  return raw as T;
}

// ── Build PlantObservation from row groups ────────────────────────────

export interface ImportInputs {
  plantCsv: string;                                // plant_snapshot.csv content
  trussCsv?: string;
  leafCsv?: string;
  fruitCsv?: string;
  provenance: Provenance;                          // 호출자가 명시 (measured/user_target/...)
}

export interface ImportResult {
  observations: PlantObservation[];                // (plant_id × day) 별 1개
  warnings: string[];
}

export function importCsvToObservations(input: ImportInputs): ImportResult {
  const warnings: string[] = [];

  const plantRows = parseCsv(input.plantCsv).rows;
  const trussRows = input.trussCsv ? parseCsv(input.trussCsv).rows : [];
  const leafRows  = input.leafCsv  ? parseCsv(input.leafCsv).rows  : [];
  const fruitRows = input.fruitCsv ? parseCsv(input.fruitCsv).rows : [];

  const observations: PlantObservation[] = [];

  for (const pr of plantRows) {
    const plantId = pr.plant_id;
    const day = coerceInteger(pr.day, `plant_id=${plantId} day`);
    if (day === null) throw new Error(`plant row missing day: ${JSON.stringify(pr)}`);

    // Filter sub-rows by (plant_id, day)
    const trussSubset = trussRows.filter(r => r.plant_id === plantId && Number(r.day) === day);
    const leafSubset  = leafRows.filter(r => r.plant_id === plantId && Number(r.day) === day);
    const fruitSubset = fruitRows.filter(r => r.plant_id === plantId && Number(r.day) === day);

    const trusses: TrussObservation[] = trussSubset.map(tr => buildTruss(tr));
    const leaves: LeafObservation[] = leafSubset.map(lr => buildLeaf(lr));
    const fruits: FruitObservation[] = fruitSubset.map(fr => buildFruit(fr));

    const obs: PlantObservation = {
      schemaVersion: 'growthCalibration.v1',
      provenance: input.provenance,
      experimentId: pr.experiment_id ?? '',
      plantId,
      day,
      observationDate: pr.observation_date ?? '',
      plantAgeDays: day,
      overall: {
        heightCm:               coerceNumber(pr.height_cm, 'height_cm') ?? 0,
        mainStemLengthCm:       coerceNumber(pr.height_cm, 'mainStemLengthCm') ?? 0,
        mainStemDiameterMm:     coerceNumber(pr.stem_diameter_mm, 'stem_diameter_mm') ?? 0,
        nodeCount:              coerceInteger(pr.node_count, 'node_count') ?? 0,
        visibleLeafCount:       coerceInteger(pr.visible_leaf_count, 'visible_leaf_count') ?? 0,
        expandedLeafCount:      coerceInteger(pr.expanded_leaf_count, 'expanded_leaf_count') ?? 0,
        visibleTrussCount:      coerceInteger(pr.visible_truss_count, 'visible_truss_count') ?? 0,
        floweringTrussCount:    coerceInteger(pr.flowering_truss_count, 'flowering_truss_count') ?? 0,
        fruitingTrussCount:     coerceInteger(pr.fruiting_truss_count, 'fruiting_truss_count') ?? 0,
        fruitCountTotal:        coerceInteger(pr.fruit_count_total, 'fruit_count_total') ?? 0,
      },
      phenology: {
        vegetativeStage: 'active_growth',          // CSV에 없으면 default. 후속 컬럼 추가 가능.
        reproductiveStage: trusses.length === 0 ? 'none' : 'truss_initiation',
        firstVisibleTrussDay: null,
        firstFlowerOpenDay: null,
        firstFruitSetDay: null,
        firstFruitVisibleDay: null,
        firstRipeFruitDay: null,
      },
      nodes: [],
      leaves,
      trusses,
      fruits,
      qualityFlags: { missingMeasurement: false, occludedOrgans: false, imageQuality: 'normal' },
    };
    observations.push(obs);
  }

  return { observations, warnings };
}

// ── Sub-row builders ──────────────────────────────────────────────────

const TRUSS_STATUSES = ['not_visible','visible_bud','flowering','fruit_set','small_green','green_expanding','fruit_expanding','breaker','ripening','red','harvest_ready','senescent'] as const;
const LEAF_STATUSES  = ['emerging','expanding','expanded','mature','senescing','shed'] as const;
const FRUIT_STATUSES = ['flower','fruit_set','small_green','green_expanding','breaker','turning','red','overripe','harvested','aborted'] as const;
const COLOR_STAGES   = ['green','green_yellow','turning','red','dark_red'] as const;

function buildTruss(r: Record<string, string>): TrussObservation {
  const status = coerceEnum(r.status, TRUSS_STATUSES, `truss[${r.truss_id}].status`);
  if (!status) throw new Error(`truss ${r.truss_id} missing status`);
  return {
    trussId: r.truss_id,
    trussIndex: coerceInteger(r.truss_index, 'truss_index') ?? 0,
    attachedNodeIndex: coerceInteger(r.attached_node_index, 'attached_node_index') ?? 0,
    status,
    ageDays: 0,
    peduncleLengthCm: 0,
    rachisLengthCm: 0,
    flowerBudCount: coerceInteger(r.flower_bud_count, 'flower_bud_count') ?? 0,
    openFlowerCount: coerceInteger(r.open_flower_count, 'open_flower_count') ?? 0,
    fruitSetCount: coerceInteger(r.fruit_set_count, 'fruit_set_count') ?? 0,
    visibleFruitCount: coerceInteger(r.visible_fruit_count, 'visible_fruit_count') ?? 0,
    largestFruitDiameterMm: coerceNumber(r.largest_fruit_diameter_mm, 'largest_fruit_diameter_mm') ?? 0,
    orientation: { azimuthDeg: 0, elevationDeg: 0, droopAngleDeg: 0 },
    phenology: {
      visibleDay: null, firstFlowerOpenDay: null, firstFruitSetDay: null,
      firstFruitVisibleDay: null, firstRipeDay: null,
    },
  };
}

function buildLeaf(r: Record<string, string>): LeafObservation {
  const status = coerceEnum(r.status, LEAF_STATUSES, `leaf[${r.leaf_id}].status`);
  if (!status) throw new Error(`leaf ${r.leaf_id} missing status`);
  return {
    leafId: r.leaf_id,
    nodeIndex: coerceInteger(r.node_index, 'node_index') ?? 0,
    status,
    ageDays: 0,
    compoundLeaf: true,
    leafletCount: coerceInteger(r.leaflet_count, 'leaflet_count') ?? 1,
    petioleLengthCm: coerceNumber(r.petiole_length_cm, 'petiole_length_cm') ?? 0,
    rachisLengthCm: coerceNumber(r.rachis_length_cm, 'rachis_length_cm') ?? 0,
    leafLengthCm: coerceNumber(r.leaf_length_cm, 'leaf_length_cm') ?? 0,
    leafWidthCm: coerceNumber(r.leaf_width_cm, 'leaf_width_cm') ?? 0,
    leafAreaCm2: coerceNumber(r.leaf_area_cm2, 'leaf_area_cm2') ?? 0,
    orientation: {
      azimuthDeg: coerceNumber(r.azimuth_deg, 'azimuth_deg') ?? 0,
      elevationDeg: coerceNumber(r.elevation_deg, 'elevation_deg') ?? 0,
      droopAngleDeg: coerceNumber(r.droop_angle_deg, 'droop_angle_deg') ?? 0,
      rollDeg: 0,
    },
    shape: { averageLeafletAspect: 0, serrationLevel: 'none', curlLevel: 'none' },
    health: { colorStage: 'green', senescence: 0, damageRatio: 0 },
  };
}

function buildFruit(r: Record<string, string>): FruitObservation {
  const status = coerceEnum(r.status, FRUIT_STATUSES, `fruit[${r.fruit_id}].status`);
  if (!status) throw new Error(`fruit ${r.fruit_id} missing status`);
  return {
    fruitId: r.fruit_id,
    trussId: r.truss_id,
    trussIndex: coerceInteger(r.truss_index, 'truss_index') ?? 0,
    positionInTruss: coerceInteger(r.position_in_truss, 'position_in_truss') ?? 0,
    status,
    diameterMm: coerceNumber(r.diameter_mm, 'diameter_mm') ?? 0,
    heightMm: coerceNumber(r.height_mm, 'height_mm') ?? 0,
    estimatedWeightG: 0,
    colorStage: coerceEnum(r.color_stage, COLOR_STAGES, `fruit[${r.fruit_id}].color_stage`) ?? 'green',
    visibility: { visible: true, occlusionRatio: 0 },
    phenology: {
      flowerOpenDay: null, fruitSetDay: null, visibleFruitDay: null,
      breakerDay: null, ripeDay: null,
    },
  };
}
