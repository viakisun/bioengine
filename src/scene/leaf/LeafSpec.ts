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
 * ★ L5-5 (S43) — `pitch/roll/twistNoiseRange` → `pitch/roll/twistNoiseRangeRad`
 *   (rad unit 명시). `applyLeafletPose` 내부 사용.
 */
export const PoseRulesSchema = z.object({
  foldDroopDegBase: z.number(),                            // current: -5 (deg)
  foldDroopDegSlope: z.number(),                           // current: 15 (deg)
  leafletJitterPercent: z.number().min(0).max(100),        // current: 5 (±5%)
  pitchNoiseRangeRad: z.number().min(0),                   // current: 0.1 (rad)
  rollNoiseRangeRad: z.number().min(0),                    // current: 0.2 (rad)
  twistNoiseRangeRad: z.number().min(0),                   // current: 0.15 (rad)
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

// ─── L5 (Phase v1.1) new sections — full parameterization ─────────────────

/**
 * Single sine wave for lobe noise synthesis.
 *
 * Formula: `freq = baseFrequency + (seed * seedMultiplier) % seedFrequencyMod`
 *          `phase = (seed * phaseMultiplier) % (2π)`
 *          `out = sin(2π * freq * u + phase) * weight`
 *
 * L4 (S33) 후 코드 hardcoded 3 waves → L5-3 (S41) spec migration.
 */
export const LobeNoiseWaveSchema = z.object({
  baseFrequency: z.number().positive(),
  seedFrequencyMod: z.number().positive(),
  seedMultiplier: z.number(),              // current: 1, 7, 13
  phaseMultiplier: z.number(),             // current: 0.7, 1.3, 2.1
  weight: z.number().min(0).max(1),        // current: 0.5, 0.3, 0.2
});

/**
 * Lobe noise — 잎 outline에 추가될 큰 결각 (낮은 빈도, 큰 진폭).
 * Multi-wave Fourier synthesis (sin 합성). `positiveOnly: true`면 [0, amp]
 * 클램프 (outline 항상 _바깥쪽으로_).
 */
export const LobeNoiseRulesSchema = z.object({
  positiveOnly: z.boolean(),                // current: true
  waves: z.array(LobeNoiseWaveSchema).min(1),
});

/**
 * Per-leaf macro variation range (baseline + ±range/2, deterministic seed).
 *
 * ★ L6-A-6 (S51) — leaf-level macro variation 신규 도입 (L5에서 4 dead fields
 *   제거 후 재도입). 각 entry는 _multiplier 또는 offset_ — mesh path는 step 2 (S52)에서 연결.
 *
 * Formula:
 *   value = baseline + signed(seed) * range
 *   (signed = -1 ~ +1, hash 기반 deterministic per-leaf)
 */
export const LeafMacroRangeSchema = z.object({
  baseline: z.number(),
  range: z.number().min(0),
});

/**
 * Leaf-instance macro variation rules.
 *
 * ★ L5-4 (S42) — L4 후 `computeLeafInstanceProfile` 6 fields 중 5 dead.
 *   Live 1 field만 (leftRightImbalance). L5에서 function 분해 →
 *   `computeLeftRightImbalance(spec.leafInstanceRules, ...)`.
 *
 * ★ L6-A-6 (S51) — macro variation 재도입:
 *   - curlMultiplier: leaf 전체 curl 비율 (baseline=1.0, range=0.1 → 0.9~1.1)
 *   - opennessOffset: leaf openness factor offset (baseline=0, range=0.05 → ±0.05)
 *   - rachisCurvatureBias: leaf rachis 곡률 bias (baseline=0, range=0.1 → ±0.1, _reserved_ — bone path 영향, L7+)
 *
 * Step 1 (S51): spec + computeLeafMacroState 산출만 — mesh path _미연결_
 * Step 2 (S52): buildLeafShapeDescriptor에 주입
 * Step 3 (S53): 값 조정
 */
export const LeafInstanceRulesSchema = z.object({
  // L5-4 existing (skeleton size factor 영향)
  leftRightImbalanceRange: z.number().min(0),  // current: 0.20
  apexImbalanceThreshold: Ratio01,             // current: 0.85
  apexImbalanceBoost: z.number().positive(),   // current: 1.3

  // L6-A-6 macro variation (mesh path 영향 — S52에서 연결)
  curlMultiplier: LeafMacroRangeSchema,        // baseline 1.0, range 0.1
  opennessOffset: LeafMacroRangeSchema,        // baseline 0, range 0.05
  rachisCurvatureBias: LeafMacroRangeSchema,   // baseline 0, range 0 (reserved)
});

/**
 * Shape profile + maturity envelope + cultivar clamp + senescence weight.
 *
 * ★ L5-6a/6b 분리:
 *   L5-6a: baseTransitionEndU / cultivar clamps / senescenceCurlWeight
 *   L5-6b: maturityEnvelope* / opennessBase*
 */
export const ShapeProfileRulesSchema = z.object({
  // L5-6a: base wedge transition (buildShapeProfile)
  baseTransitionEndU: Ratio01,                 // current: 0.2

  // L5-6a: cultivar override clamps (buildLeafShapeDescriptor)
  baseShapeClamp: z
    .tuple([z.number(), z.number()])
    .refine(([min, max]) => min <= max, 'baseShapeClamp min <= max'),
                                                // current: [0.7, 1.0]
  tipSharpnessClamp: z
    .tuple([z.number(), z.number()])
    .refine(([min, max]) => min <= max, 'tipSharpnessClamp min <= max'),
                                                // current: [1.0, 2.0]

  // L5-6a: senescence curl weight (buildLeafShapeDescriptor)
  senescenceCurlWeight: z.number().min(0).max(1),  // current: 0.5

  // L5-6b: maturity envelope (Phase F5 smoothstep)
  maturityEnvelopeStart: Ratio01,              // current: 0.2
  maturityEnvelopeEnd: Ratio01,                // current: 0.8

  // L5-6b: openness factor base range
  opennessBaseMin: Ratio01,                    // current: 0.2
  opennessBaseMax: Ratio01,                    // current: 1.0

  // ★ L6-A-1 (S46) — serration taper floor (base/tip 톱니 보존).
  //   lobe는 full taper (sin πt), serration은 max(serrationTaperMin, sin πt).
  //   serrationTaperMin: 0 = 완전 taper (L5 이전 동일), 1 = no taper (끝까지 톱니).
  //   0.35 권장 — 끝부분 톱니 35% 가시.
  serrationTaperMin: Ratio01,                  // current: 0.35 (L6-A-1)
}).refine(
  r => r.maturityEnvelopeStart <= r.maturityEnvelopeEnd,
  { message: 'maturityEnvelopeStart must be <= maturityEnvelopeEnd' },
).refine(
  r => r.opennessBaseMin <= r.opennessBaseMax,
  { message: 'opennessBaseMin must be <= opennessBaseMax' },
);

/**
 * Edge asymmetry weights — left/right lobe + serration application.
 *
 * L5-6b: `halfWidthLeft += lobe * leftLobeWeight + teeth * leftSerrationWeight`
 *        `halfWidthRight += lobe * rightLobeWeight + teeth * rightSerrationWeight`
 */
export const EdgeAsymmetryRulesSchema = z.object({
  leftLobeWeight: z.number().min(0),         // current: 1.0
  leftSerrationWeight: z.number().min(0),    // current: 1.0
  rightLobeWeight: z.number().min(0),        // current: 0.85
  rightSerrationWeight: z.number().min(0),   // current: 1.1
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

/**
 * ★ schemaVersion '1.1' (L5) — '1.0' deprecated.
 *   - 1.0: L4 초기 (agePresets/profileByPosition/correlation/poseRules basic)
 *   - 1.1: L5 (lobeNoise/leafInstance/shapeProfile/edgeAsymmetry sections 추가
 *          + poseRules pitch/roll/twistNoiseRange → ...Rad rename)
 *
 * L5 이후 runtime은 _1.1만 허용_ (z.literal('1.1')). 1.0 spec은 deprecated —
 * tomato.json은 동시 갱신. 별도 migration 함수 없음 (수동 — 단일 spec 환경).
 */
export const LeafSpecSchema = z.object({
  schemaVersion: z.literal('1.1'),
  taxonomy: TaxonomySchema,
  extends: SpecExtendsSchema,
  agePresets: z.record(z.string(), AgePresetSchema),
  profileByPosition: ProfileByPositionSchema,
  correlationRules: CorrelationRulesSchema,
  poseRules: PoseRulesSchema,
  // L5 (Phase v1.1) — new sections
  lobeNoiseRules: LobeNoiseRulesSchema,
  leafInstanceRules: LeafInstanceRulesSchema,
  shapeProfileRules: ShapeProfileRulesSchema,
  edgeAsymmetryRules: EdgeAsymmetryRulesSchema,
  cultivars: z.record(z.string(), CultivarOverrideSchema).optional(),
});

export type LeafSpec = z.infer<typeof LeafSpecSchema>;
export type AgePresetParams = z.infer<typeof AgePresetSchema>;
export type LeafletShapeProfile = z.infer<typeof PositionProfileSchema>;
export type LobeNoiseWave = z.infer<typeof LobeNoiseWaveSchema>;
export type LobeNoiseRules = z.infer<typeof LobeNoiseRulesSchema>;
export type LeafMacroRange = z.infer<typeof LeafMacroRangeSchema>;
export type LeafInstanceRules = z.infer<typeof LeafInstanceRulesSchema>;
export type ShapeProfileRules = z.infer<typeof ShapeProfileRulesSchema>;
export type EdgeAsymmetryRules = z.infer<typeof EdgeAsymmetryRulesSchema>;
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
