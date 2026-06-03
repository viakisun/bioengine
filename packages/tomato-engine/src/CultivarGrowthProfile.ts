// Iter 29 Phase 1-Pre — CultivarGrowthProfile schema (TT-based growth model).
//
// Cultivar-level biological growth parameters. v1 canonical Thermal Time
// (TT/GDD) driven. Replaces the following hardcoded constants:
//   - BASE_LEAF_AREA_CM2 = 880  (GrowthModel.ts:512, 815) → maxLeafAreaCm2
//   - leafletCountFromMaturity implicit max = 9             → maxLeafletCount
//
// ★ Module boundary note (Phase 1-Pre):
//   This file is intentionally _independent_ — no imports from ModelRegistry
//   or any module that pulls in Vite's `?raw` JSONC loader. That lets
//   architecture invariant tests (Playwright Node loader) import the schema
//   and helpers directly without triggering the full cultivar JSON load
//   chain. The full Cultivar interface (in Cultivar.ts) re-exports from
//   this file so consumers still have a single public surface.
//
// References:
//   - Heuvelink 1996 TOMSIM (phyllochron = 38 GDD/leaf, T_base = 10°C)
//   - Marcelis 1996 (sink strength)
//   - Plan §1-Pre, §6 (sleepy-growing-pretzel.md)

export interface CultivarGrowthProfile {
  /**
   * Visible leaf (phytomer) appearance interval in Thermal Time (GDD).
   * v1 canonical time unit — `node.initiationTT` is a multiple of phyllochronTT.
   * Heuvelink 1996: 38 GDD/leaf for tomato (range 32–45).
   */
  phyllochronTT: number;

  /**
   * Leaf primordium initiation interval at the shoot apical meristem (GDD).
   * v1 UNUSED (declared for future use). Modeled when primordium-visible
   * delay is added in Phase 2+.
   */
  plastochronTT: number;

  /**
   * Reference internode length (cm) at mid-shoot, before vigor/temperature
   * factors. Greenhouse indeterminate tomato typical 6–8 cm.
   */
  baseInternodeLengthCm: number;

  /**
   * Cultivar potential maximum leaf area (cm²) at peak position, fully expanded.
   * cherry ≈ 450–650 / medium ≈ 600–800 / beefsteak ≈ 750–950.
   * ★ Replaces hardcoded BASE_LEAF_AREA_CM2 = 880 (GrowthModel.ts:512, 815).
   */
  maxLeafAreaCm2: number;

  /**
   * Maximum leaflet count at COMPOUND_MATURE stage.
   * cherry/early ≈ 7 / standard ≈ 9 / beefsteak ≈ 11.
   * ★ Replaces hardcoded `5 + t * 4` implicit max in LeafStage.ts:72.
   */
  maxLeafletCount: 7 | 9 | 11;

  /**
   * Leaf expansion duration from primordium-visible to fully expanded (GDD).
   * Marcelis 1996 typical ~400 GDD.
   */
  leafExpansionDurationTT: number;

  /**
   * Leaf lifespan from primordium-visible to senescence-end (GDD).
   * ~1200 GDD (≈60 days at 20°C). Used to compute senescenceStartTT.
   */
  leafLifespanTT: number;

  /**
   * Phytomer index (0-based) of the first truss on the main axis.
   * Indeterminate tomato typically 8–10.
   */
  firstTrussNodeIndex: number;

  /**
   * Leaves between successive trusses on the main stem.
   * 3 for 3-leaf phyllotaxis (most commercial cultivars).
   */
  trussIntervalNodes: number;

  /**
   * Reference stem radius (mm) at the main-axis mid-shoot, mature plant.
   * Greenhouse indeterminate ~8 mm.
   */
  baseStemRadiusMm: number;

  /**
   * Source-sink sensitivity coefficient — multiplier on the supply/demand
   * ratio when computing sourceSinkProxyV1. Higher = stronger leaf size
   * response to assimilate availability. Marcelis 1996 sink-strength leaf
   * ≈ 0.35 (relative to fruit=1.0).
   */
  sourceSinkSensitivity: number;

  /**
   * Iter 30 Phase 4 — Side-shoot potential (0.0-1.0). Side-shoot leaf
   * allocation factor에 곱해져 측지 leaf 크기 제한. 클수록 측지 활발.
   * Default 0.4 (가벼운 억제). Indeterminate 강한 측지 cultivar 0.6+.
   *
   * Backward compat: optional ?:.
   */
  sideShootPotential?: number;

  // ───────────────────────────────────────────────────────────────────
  // Iter 31 Phase 2 (R5 fix) — Geometry projection reference parameters.
  //
  // Skin은 _절대_ 크기 기반 length scale을 위해 cultivar reference를 사용.
  // current/target ratio (Iter 29 결함)가 아니라 current/reference ratio.
  // ───────────────────────────────────────────────────────────────────

  /**
   * Reference leaf area for geometry length normalization (cm²).
   * Mature average leaf area for this cultivar — sqrt(current/reference)가
   * leaf의 _절대_ linear dimension scale을 결정.
   *
   * Default: maxLeafAreaCm2 (= 700 medium standard).
   * Cherry: ~500 / Beefsteak: ~900.
   *
   * Backward compat: optional, default = maxLeafAreaCm2.
   */
  referenceLeafAreaCm2?: number;

  /**
   * Reference rachis length at mature leaf (m). Iter 30 Phase 5 정의됨,
   * Iter 31 Phase 2.B에서 leafChunk.ts hardcoded 0.32m 대체.
   *
   * Default: 0.30 medium. Cherry: 0.20 / Beefsteak: 0.35.
   */
  referenceRachisLengthM?: number;

  /**
   * Reference petiole length at mature leaf (m). Iter 31 Phase 2 신규.
   * leafChunk.ts에서 cultivar-independent visualGenome.leafPetioleLength
   * fallback 대체.
   *
   * Default: 0.10 medium. Cherry: 0.07 / Beefsteak: 0.12.
   */
  referencePetioleLengthM?: number;

  /**
   * Iter 31 Phase 2.C — Leaf _length_ expansion duration (GDD).
   * Botanical fact: leaf length는 area보다 _먼저_ 완성 (≈ 50% of area duration).
   *
   * Default: leafExpansionDurationTT × 0.5. cultivar override 가능.
   */
  leafLengthExpansionDurationTT?: number;

  /**
   * Iter 32 — Leaf mesh gravity droop sensitivity multiplier.
   *
   * `computeGravityDroopDeg(LeafPostureModel)`의 sensitivity input. _mesh
   * deformation 강도_만 영향 — anchor.rotation / petioleCurve 무변경.
   *
   * Cherry (rigid petiole): 0.7
   * Round (default): 1.0
   * Beefsteak (heavy blade): 1.4
   *
   * Default: 1.0 (backward compat).
   */
  droopSensitivity?: number;

  // ───────────────────────────────────────────────────────────────────
  // Iter 36 v5 Phase F — Compound leaf age preset distribution.
  //
  // 사용자 botanical reference §7 (5 age presets) — 각 cultivar별 _사용 비율_.
  // Sum = 1.0 (validator 검증). Rendering engine (leaf)이 leaf instance
  // 의 ageTT + complexity seed에 따라 distribution sampling.
  // ───────────────────────────────────────────────────────────────────

  /**
   * 5 age presets 사용 비율 (사용자 §7). 합 = 1.0.
   *
   * Cultivar별 차이 예시:
   *   - cherry: young 30%, mature 60%, old 5%, complex 5%
   *   - round: young 20%, mature 65%, old 10%, complex 5%
   *   - beef: young 15%, mature 50%, old 20%, complex 15%
   *   - tomimaru: young 15%, mature 60%, old 15%, complex 10%
   *
   * Default: round-generic 분포 (mature 65%).
   * Backward compat: optional ?:.
   */
  leafPresetDistribution?: {
    young: number;
    mature: number;
    old: number;
    complex: number;
    'potato-leaf': number;
  };

  /**
   * Iter 38 S4 — Cultivar shape multiplier (★ 사용자 cultivar 시각 차이 강화).
   *
   * leafPresetDistribution _위에_ multiplier를 적용해 _same preset_도
   * cultivar별로 차이 — cherry _더 둥글고 작음_, beef _더 길쭉_.
   *
   * Cultivar별 예시:
   *   - cherry-generic: aspectRatioMultiplier 0.85 (둥근), baseShapeBias +0.05 (wedge ↑)
   *   - beefsteak-generic: aspectRatioMultiplier 1.15 (길쭉), baseShapeBias -0.05 (heart ↑)
   *   - roma-generic: aspectRatioMultiplier 1.25 (가장 길쭉)
   *   - round/tomimaru: 기본 (override 없음)
   *
   * 효과: aspectRatioBaseline × multiplier → cultivar 시각 명확 차이.
   * Optional ?:. 부재 시 multiplier=1.0 (변화 없음).
   */
  leafShapeOverride?: {
    /** aspectRatio multiplier — 1.0 baseline / cherry 0.85 / beef 1.15. */
    aspectRatioMultiplier?: number;
    /** baseShape bias (덧셈) — cherry +0.05 (wedge ↑) / beef -0.05 (heart ↑). */
    baseShapeBias?: number;
    /** tipSharpness multiplier — beef 1.1 (더 뾰족) / cherry 0.95 (더 둥근). */
    tipSharpnessMultiplier?: number;
  };
}

/**
 * Phase 1-Pre default profile (literature-based medium tomato).
 * Used as fallback when cultivar JSONC omits growthProfile or specific fields.
 */
export const DEFAULT_CULTIVAR_GROWTH_PROFILE: CultivarGrowthProfile = {
  phyllochronTT: 38,              // Heuvelink 1996
  plastochronTT: 30,               // v1 unused placeholder
  baseInternodeLengthCm: 7,
  maxLeafAreaCm2: 800,             // medium standard
  maxLeafletCount: 9,
  leafExpansionDurationTT: 400,
  leafLifespanTT: 1200,            // ~60d at 20°C
  firstTrussNodeIndex: 9,
  trussIntervalNodes: 3,
  baseStemRadiusMm: 8,
  sourceSinkSensitivity: 0.35,     // Marcelis 1996 sink leaf
  // Iter 31 Phase 2 defaults (optional, all backward compat)
  referenceLeafAreaCm2: 700,                  // medium standard mature ref
  referenceRachisLengthM: 0.30,               // medium
  referencePetioleLengthM: 0.10,              // medium
  leafLengthExpansionDurationTT: 200,         // = areaDuration × 0.5
  droopSensitivity: 1.0,                       // Iter 32 — medium default
  sideShootPotential: 0.4,         // Iter 30 Phase 4 — medium suppression
  // Iter 36 v5 Phase F — round-generic baseline (사용자 §7).
  leafPresetDistribution: {
    young: 0.20,
    mature: 0.65,
    old: 0.10,
    complex: 0.05,
    'potato-leaf': 0,
  },
};

/** Partial JSON shape — every field optional, defaults from
 *  DEFAULT_CULTIVAR_GROWTH_PROFILE. */
export type CultivarGrowthProfileJson = Partial<CultivarGrowthProfile>;

/**
 * Resolve a CultivarGrowthProfile from optional JSON, falling back to
 * DEFAULT_CULTIVAR_GROWTH_PROFILE field-by-field. Validates maxLeafletCount
 * is one of the allowed discrete values.
 */
export function resolveCultivarGrowthProfile(
  partial?: CultivarGrowthProfileJson,
): CultivarGrowthProfile {
  const p = partial ?? {};
  const maxLeafletRaw = p.maxLeafletCount ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.maxLeafletCount;
  // Validate discrete enum: 7 | 9 | 11
  const maxLeafletCount: 7 | 9 | 11 = (
    maxLeafletRaw === 7 || maxLeafletRaw === 9 || maxLeafletRaw === 11
  )
    ? maxLeafletRaw
    : DEFAULT_CULTIVAR_GROWTH_PROFILE.maxLeafletCount;
  return {
    phyllochronTT: p.phyllochronTT ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.phyllochronTT,
    plastochronTT: p.plastochronTT ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.plastochronTT,
    baseInternodeLengthCm:
      p.baseInternodeLengthCm ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.baseInternodeLengthCm,
    maxLeafAreaCm2: p.maxLeafAreaCm2 ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.maxLeafAreaCm2,
    maxLeafletCount,
    leafExpansionDurationTT:
      p.leafExpansionDurationTT ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.leafExpansionDurationTT,
    leafLifespanTT: p.leafLifespanTT ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.leafLifespanTT,
    firstTrussNodeIndex:
      p.firstTrussNodeIndex ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.firstTrussNodeIndex,
    trussIntervalNodes:
      p.trussIntervalNodes ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.trussIntervalNodes,
    baseStemRadiusMm: p.baseStemRadiusMm ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.baseStemRadiusMm,
    sourceSinkSensitivity:
      p.sourceSinkSensitivity ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.sourceSinkSensitivity,
    // Iter 30 Phase 4 — optional side-shoot allocation potential.
    sideShootPotential:
      p.sideShootPotential ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.sideShootPotential,
    // Iter 31 Phase 2 — geometry projection reference parameters.
    referenceLeafAreaCm2:
      p.referenceLeafAreaCm2
      ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.referenceLeafAreaCm2,
    referenceRachisLengthM:
      p.referenceRachisLengthM
      ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.referenceRachisLengthM,
    referencePetioleLengthM:
      p.referencePetioleLengthM
      ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.referencePetioleLengthM,
    leafLengthExpansionDurationTT:
      p.leafLengthExpansionDurationTT
      ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.leafLengthExpansionDurationTT,
    // Iter 32 — mesh gravity droop sensitivity.
    droopSensitivity:
      p.droopSensitivity ?? DEFAULT_CULTIVAR_GROWTH_PROFILE.droopSensitivity,
  };
}

// ---------------------------------------------------------------------------
// Iter 29 Phase 5 — Provenance metadata per growth-profile field.
//
// Plan PROVENANCE-01: 모든 growth parameter는 source/range/default/confidence를 가진다.
//
// Each field of CultivarGrowthProfile has a parallel CultivarGrowthProfileFieldMeta
// entry. JSONC files may extend with cultivar-specific sourceRefs / range overrides
// for empirical calibration tracking.
// ---------------------------------------------------------------------------

export type CultivarGrowthProfileSource =
  | 'literature'
  | 'vendor'
  | 'estimated'
  | 'measured'
  | 'calibrated';

export type CultivarGrowthProfileConfidence = 'low' | 'medium' | 'high';

export interface CultivarGrowthProfileFieldMeta {
  /** Where this default was sourced. */
  source: CultivarGrowthProfileSource;
  /** Acceptable measured range for this parameter. */
  range?: [number, number];
  /** Default value (matches DEFAULT_CULTIVAR_GROWTH_PROFILE). */
  default: number;
  /** Confidence on the default value. */
  confidence: CultivarGrowthProfileConfidence;
  /** Citation list (paper / breeder spec). */
  sourceRefs?: string[];
}

export type CultivarGrowthProfileProvenance = {
  readonly [K in keyof CultivarGrowthProfile]: CultivarGrowthProfileFieldMeta;
};

/**
 * Default provenance for all 11 fields. Cultivar JSONC files may override
 * any subset via `growthProfileProvenance`.
 */
export const DEFAULT_GROWTH_PROFILE_PROVENANCE: CultivarGrowthProfileProvenance = {
  phyllochronTT: {
    source: 'literature', default: 38, range: [32, 45], confidence: 'high',
    sourceRefs: ['Heuvelink 1996 TOMSIM (38 GDD/leaf for tomato)'],
  },
  plastochronTT: {
    source: 'estimated', default: 30, range: [25, 38], confidence: 'low',
    sourceRefs: ['placeholder — v1 미사용; Phase 2+ primordium-visible delay 모델링 시 활용'],
  },
  baseInternodeLengthCm: {
    source: 'literature', default: 7, range: [4, 10], confidence: 'medium',
    sourceRefs: ['greenhouse indeterminate cultivar 6-8 cm typical'],
  },
  maxLeafAreaCm2: {
    source: 'literature', default: 800, range: [450, 950], confidence: 'medium',
    sourceRefs: ['cherry 450-650 / medium 600-800 / beefsteak 750-950 cm²'],
  },
  maxLeafletCount: {
    source: 'literature', default: 9, range: [7, 11], confidence: 'high',
    sourceRefs: ['compound mature leaflets: cherry 7 / standard 9 / beefsteak 11'],
  },
  leafExpansionDurationTT: {
    source: 'literature', default: 400, range: [350, 500], confidence: 'medium',
    sourceRefs: ['Marcelis 1996 typical ~400 GDD'],
  },
  leafLifespanTT: {
    source: 'estimated', default: 1200, range: [1000, 1400], confidence: 'medium',
    sourceRefs: ['~60 days at 20°C → ~1200 GDD'],
  },
  firstTrussNodeIndex: {
    source: 'literature', default: 9, range: [7, 11], confidence: 'high',
    sourceRefs: ['indeterminate tomato typically 8-10'],
  },
  trussIntervalNodes: {
    source: 'literature', default: 3, range: [2, 4], confidence: 'high',
    sourceRefs: ['3-leaf phyllotaxis (most commercial cultivars)'],
  },
  baseStemRadiusMm: {
    source: 'literature', default: 8, range: [5, 12], confidence: 'medium',
    sourceRefs: ['greenhouse indeterminate ~8 mm mature mid-shoot'],
  },
  sourceSinkSensitivity: {
    source: 'literature', default: 0.35, range: [0.25, 0.45], confidence: 'medium',
    sourceRefs: ['Marcelis 1996 sink strength leaf ~0.35 (vs fruit=1.0)'],
  },
};

/**
 * Type-specific growth profile defaults (Iter 29 Phase 1-Pre).
 *
 * Used as cultivar-type baseline when JSONC omits growthProfile or specific
 * fields. Cherry leaves are smaller and have fewer leaflets, beefsteak
 * larger with more leaflets, etc.
 */
export function defaultGrowthProfileForType(
  type: 'cherry' | 'round' | 'beefsteak' | 'roma',
): CultivarGrowthProfile {
  switch (type) {
    case 'cherry':
      return { ...DEFAULT_CULTIVAR_GROWTH_PROFILE,
        maxLeafAreaCm2: 550,           // 450-650 cm² range
        maxLeafletCount: 7,            // cherry tends fewer
        baseInternodeLengthCm: 5,      // shorter internodes
        baseStemRadiusMm: 6,
        // Iter 31 Phase 2 — cherry는 작은 잎 + 짧은 axis
        referenceLeafAreaCm2: 500,
        referenceRachisLengthM: 0.20,
        referencePetioleLengthM: 0.07,
      };
    case 'beefsteak':
      return { ...DEFAULT_CULTIVAR_GROWTH_PROFILE,
        maxLeafAreaCm2: 850,           // 750-950 cm² range
        maxLeafletCount: 11,           // beefsteak more leaflets
        baseInternodeLengthCm: 8,
        baseStemRadiusMm: 10,
        // Iter 31 Phase 2 — beefsteak 큰 잎 + 긴 axis
        referenceLeafAreaCm2: 900,
        referenceRachisLengthM: 0.35,
        referencePetioleLengthM: 0.12,
      };
    case 'roma':
      return { ...DEFAULT_CULTIVAR_GROWTH_PROFILE,
        maxLeafAreaCm2: 650,           // determinate, mid
        maxLeafletCount: 9,
        baseInternodeLengthCm: 6,
        firstTrussNodeIndex: 7,        // determinate trusses earlier
        // Iter 31 Phase 2 — roma medium
        referenceLeafAreaCm2: 650,
      };
    case 'round':
    default:
      return { ...DEFAULT_CULTIVAR_GROWTH_PROFILE };
  }
}
