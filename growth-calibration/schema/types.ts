// Growth Calibration Platform — schema types (Schema 0-8).
//
// Two schema families:
//   growthReference.v0.1  — Reference Pack (artifact #1)
//   growthCalibration.v1  — Experiment / Environment / PlantObservation
//                            / ComparisonResult / ModelUpdateLog (artifacts #2-#5)
//
// Imports: zero runtime deps. Pure types + Provenance + CropSpecificExtension.

// ── Common: Provenance ────────────────────────────────────────────────

export type ProvenanceSourceType =
  | 'measured'              // 실측 (현장 농가/연구소 측정, ground truth)
  | 'user_target'           // 사용자 제공 calibration target (Reference Pack v0.1)
  | 'literature_reference'  // 논문/표준 출처
  | 'synthetic_reference'   // user_target + literature 합성
  | 'simulation';           // 시뮬레이션 출력

export type ProvenanceConfidence = 'low' | 'medium' | 'high';

export interface Provenance {
  sourceType: ProvenanceSourceType;
  confidence: ProvenanceConfidence;
  sourceRefs: string[];     // citation strings / 측정자 / 논문 DOI
  notes?: string;
  measuredBy?: string;      // sourceType='measured'만
  measuredAt?: string;      // ISO timestamp
}

// ── Common: ThermalTime (calendar day ↔ GDD) ──────────────────────────

export interface ThermalTime {
  baseTemperatureC: number;       // typically 10 (CROPGRO tomato)
  dailyGdd: number;               // (T_avg − T_base) for the day, ≥0
  accumulatedGdd: number;         // sum from day 0
  method: 'simple_average' | 'hourly_integration' | 'provided';
}

// ── Schema 0 — ReferenceManifest (growthReference.v0.1) ───────────────

export type ReferencePackSchemaVersion = 'growthReference.v0.1';

export type ReferenceRole =
  | 'initial_calibration_target'
  | 'measured_baseline'
  | 'literature_consensus';

export type Crop =
  | 'tomato' | 'paprika' | 'cucumber' | 'strawberry' | 'lettuce' | 'eggplant';

export interface GrowthSystem {
  type: 'hydroponic' | 'soil' | 'rockwool' | 'coco';
  supportType: 'string_training' | 'cage' | 'stake' | 'free';
  spacingCm?: number;
  rowSpacingCm?: number;
}

export interface ReferenceManifestContentEntry {
  filename: string;
  type: 'csv' | 'json';
  role: string;
  description: string;
}

export interface ReferenceManifest {
  schemaVersion: ReferencePackSchemaVersion;
  referencePackId: string;
  crop: Crop;
  cultivar: string;
  growthSystem: GrowthSystem;
  referenceRole: ReferenceRole;
  sourceType: ProvenanceSourceType;
  confidence: ProvenanceConfidence;
  createdAt: string;
  createdBy: string;
  basis: string[];
  importantNotes: string[];
  measurementIntervalDays: number;
  targetDays: number[];
  primaryUse: string[];
  contents: ReferenceManifestContentEntry[];
}

// ── Schema 1 — Experiment Metadata ────────────────────────────────────

export type CalibrationSchemaVersion = 'growthCalibration.v1';

export interface Experiment {
  schemaVersion: CalibrationSchemaVersion;
  experimentId: string;
  crop: Crop;
  cultivar: string;
  location: string;
  startDate: string;
  growthSystem: GrowthSystem;
  measurementIntervalDays: number;
  observer: string;
  notes?: string;
}

// ── Schema 2 — Environment Snapshot ───────────────────────────────────

export interface EnvironmentSnapshot {
  schemaVersion: CalibrationSchemaVersion;
  provenance: Provenance;
  experimentId: string;
  day: number;
  timestamp: string;
  environment: {
    airTemperatureC: { dayAvg: number; nightAvg: number; min?: number; max?: number };
    humidityPercent: { avg: number };
    co2Ppm: { avg: number };
    light: { photoperiodHours: number; ppfdAvg: number; dli: number };
    nutrient: { ec: number; ph: number };
  };
  thermalTime: ThermalTime;
  qualityFlags?: { partialMeasurement: boolean; sensorIssues: string[] };
}

// ── Schema 3 — PlantObservation + nested organs ───────────────────────

export interface PlantObservation {
  schemaVersion: CalibrationSchemaVersion;
  provenance: Provenance;
  experimentId: string;
  plantId: string;                                // 'P001' or 'SIM_P001'
  modelVersion?: string;                          // simulation only
  parameterSetId?: string;                        // simulation only
  seed?: number;
  day: number;                                    // calendar day from transplant
  observationDate: string;
  plantAgeDays: number;
  thermalTime?: ThermalTime;

  overall: PlantOverall;
  phenology: PlantPhenology;
  nodes: NodeObservation[];
  leaves: LeafObservation[];
  trusses: TrussObservation[];                    // 빈 [] 허용 (lettuce 등)
  fruits: FruitObservation[];                     // 빈 [] 허용

  cropSpecific?: CropSpecificExtension;
  qualityFlags?: QualityFlags;
}

export interface PlantOverall {
  heightCm: number;
  mainStemLengthCm: number;
  mainStemDiameterMm: number;
  nodeCount: number;
  visibleLeafCount: number;
  expandedLeafCount: number;
  visibleTrussCount: number;
  floweringTrussCount: number;
  fruitingTrussCount: number;
  /** SSOT #40 — visible 기준 fruit count (= visibleFruitCount alias).
   *  Reference Pack 비교 metric path. */
  fruitCountTotal: number;
  /** Iter 6 신규 — visible fruit 중 최대 직경 (mm). Reference Pack
   *  diagnostic rule (`tomato_day33_fruit_too_early`)이 read. */
  maxFruitDiameterMm?: number;
  /** Iter 6 신규 — internal fruit object 수 (aborted/harvested 제외, fertilized only).
   *  진단/audit 보조 정보, Reference Pack 비교는 fruitCountTotal 사용. */
  fruitCohortCount?: number;
  /** Iter 6 신규 — expansion/ripening 단계 fruit 수.
   *  visibleFruitCount > 0 AND maxDiameter >= minExpandingDiameterMm AND
   *  any fruit phase ∈ {cell_expansion, ripening_early, ripening_late}. */
  expandingFruitCount?: number;
  laiCanopy?: number;
}

export type VegetativeStage =
  | 'germination' | 'seedling' | 'juvenile' | 'active_growth' | 'mature';

export type ReproductiveStage =
  | 'none' | 'truss_initiation' | 'flowering' | 'fruit_set'
  | 'fruit_expansion' | 'ripening' | 'harvest' | 'senescence';

export interface PlantPhenology {
  vegetativeStage: VegetativeStage;
  reproductiveStage: ReproductiveStage;
  firstVisibleTrussDay: number | null;
  firstFlowerOpenDay: number | null;
  firstFruitSetDay: number | null;
  firstFruitVisibleDay: number | null;
  firstRipeFruitDay: number | null;
}

export interface NodeObservation {
  nodeIndex: number;
  heightFromBaseCm: number;
  internodeLengthCm: number;
  stemDiameterMm: number;
  leafId: string | null;
  trussId: string | null;
}

export type LeafStatus =
  | 'emerging' | 'expanding' | 'expanded' | 'mature' | 'senescing' | 'shed';

export interface LeafObservation {
  leafId: string;
  nodeIndex: number;
  status: LeafStatus;
  ageDays: number;
  compoundLeaf: boolean;
  leafletCount: number;
  petioleLengthCm: number;
  rachisLengthCm: number;
  leafLengthCm: number;
  leafWidthCm: number;
  leafAreaCm2: number;
  orientation: {
    azimuthDeg: number;                           // 0..360
    elevationDeg: number;                         // -90..+90
    droopAngleDeg: number;                        // cantilever sag
    rollDeg: number;
    /** Compound leaf 좌우 leaflet pair 사이 추정 각도. Iter 5 prep —
     *  PlantBase ESTIMATE proxy (`leaflet_count_estimate`).
     *  Optional for backward compat; populated by extract script when
     *  PlantBase.LeafBase.lateralSpreadDeg is available. */
    lateralSpreadDeg?: number;
  };
  shape: {
    averageLeafletAspect: number;
    serrationLevel: 'none' | 'low' | 'medium' | 'high';
    curlLevel: 'none' | 'low' | 'medium' | 'high';
  };
  health: {
    colorStage: 'pale' | 'green' | 'dark_green' | 'yellowing' | 'brown';
    senescence: number;                           // 0..1
    damageRatio: number;
  };
}

// TrussStatus — union of abstract truss stages AND fruit-stage descriptors
// that commercial growers commonly use for "what the truss looks like."
// Reference Pack CSV (03_truss_status_by_day) uses the finer-grained
// fruit-stage values (small_green / breaker / red) interchangeably with
// the abstract ones; we accept both. stageDelta uses a single ordered list.
export type TrussStatus =
  | 'not_visible' | 'visible_bud' | 'flowering' | 'fruit_set'
  | 'small_green' | 'green_expanding' | 'fruit_expanding'
  | 'breaker' | 'ripening' | 'red'
  | 'harvest_ready' | 'senescent';

export interface TrussObservation {
  trussId: string;
  trussIndex: number;
  attachedNodeIndex: number;
  status: TrussStatus;
  ageDays: number;
  peduncleLengthCm: number;
  rachisLengthCm: number;
  flowerBudCount: number;
  openFlowerCount: number;
  fruitSetCount: number;
  visibleFruitCount: number;
  largestFruitDiameterMm: number;
  orientation: {
    azimuthDeg: number;
    elevationDeg: number;
    droopAngleDeg: number;
  };
  phenology: {
    visibleDay: number | null;
    firstFlowerOpenDay: number | null;
    firstFruitSetDay: number | null;
    firstFruitVisibleDay: number | null;
    firstRipeDay: number | null;
  };
}

export type FruitStatus =
  | 'flower' | 'fruit_set' | 'small_green' | 'green_expanding'
  | 'breaker' | 'turning' | 'red' | 'overripe' | 'harvested' | 'aborted';

export type FruitColorStage =
  | 'green' | 'green_yellow' | 'turning' | 'red' | 'dark_red';

export interface FruitObservation {
  fruitId: string;
  trussId: string;
  trussIndex: number;
  positionInTruss: number;                        // 1-based
  status: FruitStatus;
  diameterMm: number;
  heightMm: number;
  estimatedWeightG: number;
  colorStage: FruitColorStage;
  visibility: { visible: boolean; occlusionRatio: number };
  phenology: {
    flowerOpenDay: number | null;
    fruitSetDay: number | null;
    visibleFruitDay: number | null;
    breakerDay: number | null;
    ripeDay: number | null;
  };
}

export interface QualityFlags {
  missingMeasurement: boolean;
  occludedOrgans: boolean;
  imageQuality: 'good' | 'normal' | 'poor';
}

// ── Crop-specific extensions (#20 — extensibility) ───────────────────

export interface CropSpecificExtension {
  strawberry?: {
    crownCount?: number;
    runnerCount?: number;
    flowerClusterCount?: number;
    runners?: Array<{ id: string; lengthCm: number; daughterPlantCount: number }>;
  };
  lettuce?: {
    headDiameterCm?: number;
    rosetteLeafCount?: number;
    freshWeightG?: number;
    headStage?: 'forming' | 'closed' | 'mature' | 'bolting';
  };
  cucumber?: {
    flowerSexRatio?: { male: number; female: number };
    parthenocarpicSetCount?: number;
  };
  paprika?: {
    fruitsPerNode?: number[];                     // 노드별 과실 수 (truss 없음)
  };
  eggplant?: {
    fruitsPerNode?: number[];
  };
}

// ── Schema 4 — ComparisonResult ───────────────────────────────────────

export type ComparisonLevel =
  | 'plant_pair' | 'plant_vs_ensemble' | 'experiment_summary';

export type ComparisonAxis = 'calendar_day' | 'accumulated_gdd';

export type DiagnosisType =
  | 'phenology_too_fast' | 'phenology_too_slow'
  | 'truss_count_overestimated' | 'truss_count_underestimated'
  | 'fruit_too_early' | 'fruit_too_late'
  | 'fruit_size_too_large' | 'fruit_size_too_small'
  | 'leaf_count_overestimated' | 'leaf_count_underestimated'
  | 'leaf_lateral_spread_too_wide' | 'leaf_lateral_spread_too_narrow'
  | 'leaf_droop_too_much' | 'leaf_droop_too_little'
  | 'stem_height_overestimated' | 'stem_height_underestimated'
  | 'internode_too_long' | 'internode_too_short'
  | 'lower_canopy_too_dense' | 'lower_canopy_too_sparse';

export type SuggestedChangeType =
  | 'jsonc_parameter'                             // JSONC 값만 변경
  | 'engine_logic'                                // 엔진 코드 escalation
  | 'schema_only'                                 // schema field만 도입 (forward-compat)
  | 'engine_logic_or_jsonc_parameter'             // 둘 다 후보
  | 'refactor';                                   // SSOT #33 — value/meaning 불변, location/loading path만 이동. functional no-op.

export interface ComparisonResult {
  schemaVersion: CalibrationSchemaVersion;
  comparisonId: string;
  experimentId: string;
  simulationRunId: string;
  comparisonLevel: ComparisonLevel;
  realPlantId?: string;
  realPlantIds?: string[];
  simPlantId?: string;
  simPlantIds?: string[];
  aggregation?: {
    method: 'mean_std' | 'median_iqr' | 'distribution';
    n: number;
  };
  day: number;
  accumulatedGdd?: number;
  comparisonAxis: ComparisonAxis;
  summary: {
    overallScore: number;                         // S, 0..1
    vegetativeScore: number;
    reproductiveScore: number;
    geometryScore: number;
    phenologyScore: number;
    pBand: number;                                // in-band cell 비율
  };
  errors: Record<string, {
    actual: number | null;
    simulated: number | null;
    simulatedStd?: number;                        // ensemble만
    error: number;
    relativeError: number;
    inBand: boolean;
    issue?: string;
  }>;
  stageDeltas?: Array<{
    target: string;
    actualStatus: string;
    simulatedStatus: string;
    stageDelta: number;
    severity: 'low' | 'medium' | 'high';
  }>;
  diagnosis: Array<{
    ruleId: string;                               // #25 — 모든 rule unique id
    type: DiagnosisType;
    target: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestedParameters: string[];
    suggestedChangeType: SuggestedChangeType;
  }>;
}

// ── Schema 5 — ModelUpdateLog ─────────────────────────────────────────

export interface ParameterChange {
  parameter: string;
  file: string;
  oldValue: number | string | null;               // null if newly introduced
  newValue: number | string;
  unit: string;
  citation: string;
  reason: string;
  changeType: SuggestedChangeType;
  enforcementStatus?: 'active' | 'pending_engine_change' | 'spec_only';
}

export interface ModelUpdateLog {
  schemaVersion: CalibrationSchemaVersion;
  updateId: string;                               // 'growth_update_004'
  previousModelVersion: string;                   // 'growthModel.tomato.v0.3'
  newModelVersion: string;                        // 'growthModel.tomato.v0.4'
  date: string;
  triggerComparisons: string[];                   // comparisonIds
  triggerRuleIds?: string[];                      // #25 — rule traceability
  reason: string[];
  parameterChanges: ParameterChange[];
  expectedEffect: Record<string, string>;
  validationPlan: {
    replayDays: number[];
    forwardDays: number[];
    targetMetrics: string[];
  };
  outcome?: {
    runDate: string;
    replayScoreDelta: number;
    forwardScoreDelta: number;
    notes: string;
  };
}

// ── Schema 6 — Status enum ordinality (enums.ts에서 import) ──────────
// (TRUSS_STATUS_ORDER / FRUIT_STATUS_ORDER / LEAF_STATUS_ORDER + stageDelta)

// ── Schema 7 — Metric Tolerance (zero-band defense) ───────────────────

export interface MetricTolerance {
  absoluteTolerance?: number;
  relativeTolerance?: number;                     // 0..1
  minHalfBand?: number;                           // ref_half_band이 0일 때 강제 최소
}

// ── Schema 8 — CSV ↔ JSON Import Mapping ──────────────────────────────

export type CsvColumnType = 'number' | 'integer' | 'string' | 'enum' | 'range';

export interface CsvMappingRule {
  csvColumn: string;
  jsonPath: string;
  type: CsvColumnType;
  pairedColumn?: string;                          // type='range' 시 _max 컬럼
  enumValues?: string[];                          // type='enum'
  required: boolean;
  nullable: boolean;
  unit?: string;
}

// ── Reference Pack file row types (parsed from CSVs) ──────────────────

export interface PlantTimelineRow {
  day: number;
  height_cm_min: number; height_cm_max: number;
  node_count_min: number; node_count_max: number;
  visible_leaf_min: number; visible_leaf_max: number;
  expanded_leaf_min: number; expanded_leaf_max: number;
  visible_truss_min: number; visible_truss_max: number;
  flowering_truss_min: number; flowering_truss_max: number;
  fruiting_truss_min: number; fruiting_truss_max: number;
  fruit_count_min: number; fruit_count_max: number;
  max_fruit_diameter_mm_min: number; max_fruit_diameter_mm_max: number;
  expected_stage: string;
}

export interface TrussTimelineRow {
  truss_index: number;
  visible_day_min: number; visible_day_max: number;
  flower_day_min: number; flower_day_max: number;
  fruit_set_day_min: number; fruit_set_day_max: number;
  visible_fruit_day_min: number; visible_fruit_day_max: number;
  expanding_day_min: number; expanding_day_max: number;
  breaker_day_min: number; breaker_day_max: number;
  attached_node_min: number; attached_node_max: number;
}

export interface TrussStatusByDayRow {
  day: number;
  truss_index: number;
  allowed_status_min: TrussStatus;
  allowed_status_max: TrussStatus;
  expected_status_note: string;
  visible_fruit_min: number; visible_fruit_max: number;
  max_fruit_diameter_mm_min: number; max_fruit_diameter_mm_max: number;
}

export interface LeafTimelineRow {
  day: number;
  visible_leaf_min: number; visible_leaf_max: number;
  expanded_leaf_min: number; expanded_leaf_max: number;
  leaflet_count_min: number; leaflet_count_max: number;
  petiole_length_cm_min: number; petiole_length_cm_max: number;
  rachis_length_cm_min: number; rachis_length_cm_max: number;
  leaf_length_cm_min: number; leaf_length_cm_max: number;
  leaf_width_cm_min: number; leaf_width_cm_max: number;
  droop_angle_deg_min: number; droop_angle_deg_max: number;
  lateral_spread_deg_min: number; lateral_spread_deg_max: number;
  elevation_deg_min: number; elevation_deg_max: number;
}

export interface FruitTimelineRow {
  day: number;
  truss_index: number;
  allowed_stage_min: FruitStatus;
  allowed_stage_max: FruitStatus;
  visible_fruit_min: number; visible_fruit_max: number;
  max_diameter_mm_min: number; max_diameter_mm_max: number;
  diagnostic_note: string;
}
