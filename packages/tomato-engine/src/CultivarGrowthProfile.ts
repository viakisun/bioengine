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
  };
}

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
      };
    case 'beefsteak':
      return { ...DEFAULT_CULTIVAR_GROWTH_PROFILE,
        maxLeafAreaCm2: 850,           // 750-950 cm² range
        maxLeafletCount: 11,           // beefsteak more leaflets
        baseInternodeLengthCm: 8,
        baseStemRadiusMm: 10,
      };
    case 'roma':
      return { ...DEFAULT_CULTIVAR_GROWTH_PROFILE,
        maxLeafAreaCm2: 650,           // determinate, mid
        maxLeafletCount: 9,
        baseInternodeLengthCm: 6,
        firstTrussNodeIndex: 7,        // determinate trusses earlier
      };
    case 'round':
    default:
      return { ...DEFAULT_CULTIVAR_GROWTH_PROFILE };
  }
}
