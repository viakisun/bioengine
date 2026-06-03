// ★ Iter 39 Phase L4-3 (S31) — LeafSpec interface + Zod runtime validation.
//
// 책임 (원칙 #41-44):
//   - Code = formula (LeafMeshBuilder math)
//   - Data = botanical parameter (LeafSpec, loaded via src/data/leaf)
//   - Engine = plant-agnostic (이 파일 + LeafMeshBuilder/Engine — "tomato" 단어 0)
//   - Multi-crop ready — Taxonomy + cultivar map. 미래 plant 추가 시 JSON만 추가.
//
// 연구자가 src/data/leaf/specs/*.json을 _코드 변경 없이_ 조정하면 실험 설계 가능.
// runtime Zod validation으로 JSON mistake catch.

import { z } from 'zod';

// ─── Atomic primitives ─────────────────────────────────────────────────────

/** [min, max] tuple with min <= max guarantee. */
const Range2 = z
  .tuple([z.number(), z.number()])
  .refine(([min, max]) => min <= max, {
    message: 'range tuple must satisfy min <= max',
  });

/** 0-1 inclusive ratio. */
const Ratio01 = z.number().min(0).max(1);

/** Strictly positive multiplier or scaling factor. */
const RatioPositive = z.number().positive();

// ─── Botanical primitives ──────────────────────────────────────────────────

/**
 * Age preset — leaf morphology range bundle for a phenological age class.
 * Researcher tweaks: leaf size, leaflet count, serration depth, etc.
 */
export const AgePresetSchema = z.object({
  leafLengthCmRange: Range2,
  majorLeafletPairsRange: Range2,
  intercalaryRange: Range2,
  secondaryRange: Range2.optional(),
  aspectRatioRange: Range2,
  serrationAmpRange: Range2,
  lobeDepthRange: Range2,
  poseDroopDegRange: Range2,
  color: z.enum(['bright-light-green', 'green', 'green-with-yellowing']),
  curl: z.number().optional(),
  asymmetry: Ratio01.optional(),
  smoothMargin: z.boolean().optional(),
  // Hybrid baseline anchors (Iter 38 S3) — preset-mean for sampleHybrid.
  leafLengthFactor: RatioPositive.optional(),
  leafletCountFactor: RatioPositive.optional(),
  aspectRatioBaseline: RatioPositive.optional(),
  baseShapeBaseline: Ratio01.optional(),
  tipSharpnessBaseline: RatioPositive.optional(),
});

/**
 * Per-leaflet shape profile (terminal / primary / intercalary / secondary).
 * Differentiates leaflet morphology by position on the compound leaf rachis.
 */
export const PositionProfileSchema = z.object({
  widthRatio: RatioPositive.max(2),
  lobeDepth: Ratio01,
  serrationAmp: Ratio01,
  serrationFreq: z.number().positive(),
  tipSharpness: RatioPositive,
  baseTaper: Ratio01,
});

/**
 * Profile bundle by position. Cross-field rule: terminal > intercalary in
 * lobeDepth — botanical observation (terminal is the most elaborate leaflet).
 */
export const ProfileByPositionSchema = z
  .object({
    terminal: PositionProfileSchema,
    primary: PositionProfileSchema,
    intercalary: PositionProfileSchema,
    secondary: PositionProfileSchema,
  })
  .refine(p => p.terminal.lobeDepth >= p.intercalary.lobeDepth, {
    message: 'terminal.lobeDepth must be >= intercalary.lobeDepth (botanical model)',
  });

/**
 * §8 correlation rules — leaf complexity (c) → resolved morphology mapping.
 * All formulas live in LeafMeshBuilder; this schema parameterizes the
 * coefficients only.
 */
export const CorrelationRulesSchema = z.object({
  intercalaryComplexityExponent: z.number().positive(), // current: 2 (c^2)
  serrationFreqBase: z.number().positive(),              // current: 10
  serrationFreqSlope: z.number().positive(),             // current: 18
  asymmetryBase: Ratio01,                                 // current: 0.02
  asymmetrySlope: Ratio01,                                // current: 0.06
  correlationJitterScale: Ratio01,                        // current: 0.10
});

/**
 * Pose rules — leaflet orientation noise + L0-D-1 fold droop.
 * All noise ranges are radians except foldDroopDeg{Base,Slope} (degrees).
 */
export const PoseRulesSchema = z.object({
  foldDroopDegBase: z.number(),                           // current: -5
  foldDroopDegSlope: z.number(),                          // current: 15
  leafletJitterPercent: z.number().min(0).max(100),       // current: 5 (±5%)
  pitchNoiseRange: z.number().min(0),                     // rad
  rollNoiseRange: z.number().min(0),                      // rad
  twistNoiseRange: z.number().min(0),                     // rad
});

/**
 * Cultivar override — multiplier/bias on resolved morphology fields.
 * Lookup via spec.cultivars[name] in CreateLeafOptions.cultivar.
 */
export const CultivarOverrideSchema = z.object({
  aspectRatioMultiplier: RatioPositive.optional(),
  baseShapeBias: z.number().min(-0.3).max(0.3).optional(),
  tipSharpnessMultiplier: RatioPositive.optional(),
});

// ─── Taxonomy (정교화 ★, 원칙 #44 — multi-crop) ────────────────────────────

/**
 * Botanical classification. Used for runtime identification + future
 * multi-crop routing (e.g. cucumber spec uses different mesh strategy).
 */
export const TaxonomySchema = z.object({
  family: z.string(),       // e.g. 'Solanaceae'
  genus: z.string(),        // e.g. 'Solanum'
  species: z.string(),      // e.g. 'lycopersicum'
  commonName: z.string(),   // e.g. 'tomato'
});

/**
 * Spec inheritance hook — future base spec composition.
 * Currently structural only (single spec per crop). Reserved for L5+.
 */
export const SpecExtendsSchema = z
  .object({
    baseSpec: z.string().optional(),
  })
  .optional();

// ─── Top-level LeafSpec ────────────────────────────────────────────────────

export const LeafSpecSchema = z.object({
  schemaVersion: z.literal('1.0'),
  taxonomy: TaxonomySchema,
  extends: SpecExtendsSchema,
  agePresets: z.record(z.string(), AgePresetSchema),
  profileByPosition: ProfileByPositionSchema,
  correlationRules: CorrelationRulesSchema,
  poseRules: PoseRulesSchema,
  cultivars: z.record(z.string(), CultivarOverrideSchema).optional(),
});

export type LeafSpec = z.infer<typeof LeafSpecSchema>;
export type AgePresetParams = z.infer<typeof AgePresetSchema>;
export type LeafletShapeProfile = z.infer<typeof PositionProfileSchema>;
export type ProfileByPosition = z.infer<typeof ProfileByPositionSchema>;
export type CorrelationRules = z.infer<typeof CorrelationRulesSchema>;
export type PoseRules = z.infer<typeof PoseRulesSchema>;
export type CultivarOverride = z.infer<typeof CultivarOverrideSchema>;
export type Taxonomy = z.infer<typeof TaxonomySchema>;

// ─── Parser (engine layer, registry는 data layer 책임) ─────────────────────

/**
 * Parse + validate raw JSON data into a typed LeafSpec.
 * Throws ZodError on schema mismatch — registry layer typically catches +
 * re-throws with a context message.
 */
export function parseLeafSpec(raw: unknown): LeafSpec {
  return LeafSpecSchema.parse(raw);
}

/**
 * Resolve a cultivar key against a spec, returning undefined for no key,
 * the matching override for a known key, or throwing for unknown keys.
 */
export function resolveCultivar(
  spec: LeafSpec,
  key: string | undefined,
): CultivarOverride | undefined {
  if (!key) return undefined;
  const cultivar = spec.cultivars?.[key];
  if (!cultivar) {
    const available = Object.keys(spec.cultivars ?? {}).join(', ') || '(none)';
    throw new Error(
      `Unknown leaf cultivar '${key}' for ${spec.taxonomy.commonName}. Available: ${available}`,
    );
  }
  return cultivar;
}
