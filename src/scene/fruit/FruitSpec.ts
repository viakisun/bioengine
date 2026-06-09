// ★ Iter 39 Phase L7-A-1 (S61) — FruitSpec interface + Zod runtime validation.
//
// Leaf L4-L5 패턴 (LeafSpec) fruit 적용. 4-way 섹션 분리 (사용자 보완 #1):
//   morphologyRules — shape (vertex 위치 영향)
//   meshResolution  — LOD (segments/rings × high/low/ultraLow)
//   ripeningRules   — 숙도/색
//   materialRules   — PBR coefficients
//
// 책임 (원칙 #41-42, #50):
//   - Code = formula (FruitGenerator math)
//   - Data = botanical parameter (FruitSpec, loaded via src/data/fruit)
//   - Engine = plant-agnostic (이 파일 + FruitGenerator/Engine — 'tomato' 단어 0)
//
// Cultivar 우선순위 (audit Section 3, 보완 #4):
//   base FruitSpec → CultivarGenome → spec.cultivars[name] override

import { z } from 'zod';

// ─── Atomic primitives ─────────────────────────────────────────────────────

const Ratio01 = z.number().min(0).max(1);
const RatioPositive = z.number().positive();

// ─── Botanical primitives ──────────────────────────────────────────────────

/**
 * Morphology — shape (vertex 위치 영향).
 *
 * `ribAmp` / `asymmetryAmp`는 baseline. CultivarGenome.ribbingStrength /
 * asymmetryAmp가 _modulate_ (applyCultivarLayers).
 */
export const MorphologyRulesSchema = z.object({
  crownRecession: Ratio01,       // stem-end socket 깊이 (× radius)
  shoulderBulge: Ratio01,        // socket 아래 ring 바깥 swell
  ribAmp: Ratio01,               // radial ribbing baseline (cultivar modulated)
  asymmetryAmp: Ratio01,         // per-fruit asymmetry baseline
  coherentAsymmetryAmp: Ratio01.optional(),
  topDepressionRange: z.tuple([Ratio01, Ratio01]).optional(),
  shoulderFullnessRange: z.tuple([RatioPositive, RatioPositive]).optional(),
  bottomRoundness: Ratio01.optional(),
  visualHeightWidthClamp: z.tuple([RatioPositive, RatioPositive]).optional(),
  stemEndAnchorCos: Ratio01.optional(),
  depressionBand: z.tuple([Ratio01, Ratio01]).optional(),
  socketTintBand: z.tuple([Ratio01, Ratio01]).optional(),
  socketDarkeningStrength: Ratio01.optional(),
  socketTintStrength: Ratio01.optional(),
});

/**
 * Per-LOD level resolution. ★ 보완 #9 — cross-field refine 강화.
 */
const ResolutionLevelSchema = z.object({
  segments: z.number().int().min(6),
  rings: z.number().int().min(4),
});

/**
 * Mesh resolution (perf — LOD).
 * Cross-field: high > low > ultraLow (segments + rings 모두).
 */
export const MeshResolutionSchema = z.object({
  high: ResolutionLevelSchema,
  low: ResolutionLevelSchema,
  ultraLow: ResolutionLevelSchema,
})
  .refine(
    r => r.high.segments > r.low.segments && r.low.segments > r.ultraLow.segments,
    { message: 'meshResolution segments order: high > low > ultraLow' },
  )
  .refine(
    r => r.high.rings > r.low.rings && r.low.rings > r.ultraLow.rings,
    { message: 'meshResolution rings order: high > low > ultraLow' },
  );

/**
 * Ripening (숙도/색).
 *
 * `stageCount`는 _fixed 6_ — FruitGenerator stage 0~5 산식 가정.
 * 변경 시 산식도 갱신 필요 (별 phase).
 */
export const RipeningRulesSchema = z.object({
  stageCount: z.literal(6),
  blossomEndAdvanceFrac: Ratio01,
  shoulderRetentionFrac: Ratio01.optional(),
  blushStrength: Ratio01.optional(),
  mottleSigma: Ratio01.optional(),
  ripeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color string (#RRGGBB)').optional(),
});

/**
 * Subsurface translucency rules — stage trigger + intensity.
 * (Babylon `Color3.FromHexString` 호환 hex string)
 */
const SubsurfaceRulesSchema = z.object({
  fromStage: z.number().int().min(0).max(5),
  intensity: Ratio01,
  tintColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color string (#RRGGBB)'),
});

/**
 * Material (PBR coefficients). ★ 보완 #10 — 배열 길이 == stageCount refine
 * (top-level FruitSpecSchema에서 강제).
 */
export const MaterialRulesSchema = z.object({
  stageRoughness: z.array(Ratio01),
  stageClearcoatIntensity: z.array(Ratio01),
  stageClearcoatRoughness: z.array(Ratio01),
  microNormalTexture: z.string().optional(),
  microNormalStrength: Ratio01.optional(),
  roughnessTexture: z.string().optional(),
  subsurfaceTranslucency: SubsurfaceRulesSchema,
});

/**
 * Cultivar override (optional correction layer, Section 3 step 3).
 * 현재 schema only — 실 사용은 별 phase (L7 out of scope).
 */
export const FruitCultivarOverrideSchema = z.object({
  crownRecessionMultiplier: RatioPositive.optional(),
  shoulderBulgeMultiplier: RatioPositive.optional(),
  ribAmpMultiplier: RatioPositive.optional(),
  asymmetryAmpMultiplier: RatioPositive.optional(),
});

// ─── Taxonomy ──────────────────────────────────────────────────────────────

export const TaxonomySchema = z.object({
  family: z.string(),
  genus: z.string(),
  species: z.string(),
  commonName: z.string(),
});

// ─── Top-level FruitSpec ───────────────────────────────────────────────────

/**
 * FruitSpec schemaVersion '1.0'.
 *
 * Top-level cross-field refines (보완 #10): material array length === stageCount.
 */
export const FruitSpecSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    taxonomy: TaxonomySchema,
    morphologyRules: MorphologyRulesSchema,
    meshResolution: MeshResolutionSchema,
    ripeningRules: RipeningRulesSchema,
    materialRules: MaterialRulesSchema,
    cultivars: z.record(z.string(), FruitCultivarOverrideSchema).optional(),
  })
  .refine(
    s => s.materialRules.stageRoughness.length === s.ripeningRules.stageCount,
    { message: 'materialRules.stageRoughness.length must equal ripeningRules.stageCount' },
  )
  .refine(
    s => s.materialRules.stageClearcoatIntensity.length === s.ripeningRules.stageCount,
    { message: 'materialRules.stageClearcoatIntensity.length must equal ripeningRules.stageCount' },
  )
  .refine(
    s => s.materialRules.stageClearcoatRoughness.length === s.ripeningRules.stageCount,
    { message: 'materialRules.stageClearcoatRoughness.length must equal ripeningRules.stageCount' },
  );

export type FruitSpec = z.infer<typeof FruitSpecSchema>;
export type MorphologyRules = z.infer<typeof MorphologyRulesSchema>;
export type MeshResolution = z.infer<typeof MeshResolutionSchema>;
export type ResolutionLevel = z.infer<typeof ResolutionLevelSchema>;
export type RipeningRules = z.infer<typeof RipeningRulesSchema>;
export type MaterialRules = z.infer<typeof MaterialRulesSchema>;
export type FruitCultivarOverride = z.infer<typeof FruitCultivarOverrideSchema>;
export type FruitTaxonomy = z.infer<typeof TaxonomySchema>;

// ─── Parser ────────────────────────────────────────────────────────────────

export function parseFruitSpec(raw: unknown): FruitSpec {
  return FruitSpecSchema.parse(raw);
}

/**
 * Resolve cultivar override key against a spec.
 * Returns undefined for no key, the matching override for a known key,
 * throws for unknown keys.
 */
export function resolveFruitCultivar(
  spec: FruitSpec,
  key: string | undefined,
): FruitCultivarOverride | undefined {
  if (!key) return undefined;
  const cultivar = spec.cultivars?.[key];
  if (!cultivar) {
    const available = Object.keys(spec.cultivars ?? {}).join(', ') || '(none)';
    throw new Error(
      `Unknown fruit cultivar '${key}' for ${spec.taxonomy.commonName}. Available: ${available}`,
    );
  }
  return cultivar;
}

// ─── LOD distance-based quality (★ L7-B-1 S66, leaf 일관) ──────────────────

/**
 * Distance-based fruit LOD quality selection.
 *
 * Threshold (leaf 일관, 원칙 #51):
 *   < 5m  → 'high'      (near hero plant)
 *   < 15m → 'low'       (mid distance, production default)
 *   ≥ 15m → 'ultraLow' (far background plant)
 *
 * fruit는 'ultraLow' (camelCase) 사용 (FruitSpec.meshResolution key 일관).
 *
 * @param distanceM  camera ↔ plant root world distance (meters)
 */
export function qualityFromFruitDistance(distanceM: number): 'high' | 'low' | 'ultraLow' {
  if (distanceM < 5) return 'high';
  if (distanceM < 15) return 'low';
  return 'ultraLow';
}

// ─── Cultivar layered application (audit Section 3) ────────────────────────

/**
 * Effective morphology after cultivar layers applied.
 *
 * 적용 순서:
 *   1. base spec.morphologyRules
 *   2. CultivarGenome (tomato-engine 산출 — ribbingStrength, asymmetryAmp 등)
 *   3. spec.cultivars[name] override (optional multiplier)
 */
export interface EffectiveFruitMorphology {
  crownRecession: number;
  shoulderBulge: number;
  ribAmp: number;
  asymmetryAmp: number;
}

/**
 * Apply cultivar layers in order: base → genome → override.
 *
 * `genome`은 partial CultivarGenome subset:
 *   - ribbingStrength: number — base ribAmp 배수 (default 1.0)
 *   - asymmetryAmp: number — base asymmetryAmp 배수 (default 1.0)
 *
 * @param base       spec.morphologyRules
 * @param genome     tomato-engine 산출 (per-fruit deterministic)
 * @param override   spec.cultivars[name] (선택)
 */
export function applyCultivarLayers(
  base: MorphologyRules,
  genome: { ribbingStrength?: number; asymmetryAmp?: number },
  override?: FruitCultivarOverride,
): EffectiveFruitMorphology {
  // 1 + 2: base × genome
  let crownRecession = base.crownRecession;
  let shoulderBulge = base.shoulderBulge;
  let ribAmp = base.ribAmp * (genome.ribbingStrength ?? 1.0);
  let asymmetryAmp = base.asymmetryAmp * (genome.asymmetryAmp ?? 1.0);

  // 3: override (선택)
  if (override) {
    if (override.crownRecessionMultiplier != null) {
      crownRecession *= override.crownRecessionMultiplier;
    }
    if (override.shoulderBulgeMultiplier != null) {
      shoulderBulge *= override.shoulderBulgeMultiplier;
    }
    if (override.ribAmpMultiplier != null) {
      ribAmp *= override.ribAmpMultiplier;
    }
    if (override.asymmetryAmpMultiplier != null) {
      asymmetryAmp *= override.asymmetryAmpMultiplier;
    }
  }

  return { crownRecession, shoulderBulge, ribAmp, asymmetryAmp };
}
