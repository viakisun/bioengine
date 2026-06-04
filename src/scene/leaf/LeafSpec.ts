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
 *
 * Researcher tweaks: leaf size, leaflet count, serration depth, etc.
 *
 * ★ Tomato age preset keys (tomato.json `agePresets`):
 *   - 'young', 'mature', 'old', 'complex' — 토마토 잎 성숙도/복잡도 단계
 *   - **'potato-leaf'** — _토마토_ cultivar 중 **smooth-margin variant**
 *     (UC ANR 학명). ★ 감자 잎이 아닙니다 — 'regular leaf tomato'
 *     (scalloped)와 대비되는 토마토 leaf type 분류. 실 cultivars:
 *     Brandywine, Pruden's Purple, Mortgage Lifter.
 *     참조: docs/architecture/LEAF_PRESETS.md §E
 *
 * ★ L8-5 (S74) — dead field 명시 (사용자 보완 #2):
 *   `aspectRatioRange` / `serrationAmpRange` / `lobeDepthRange` /
 *   `aspectRatioBaseline` / `tipSharpnessBaseline` field는 `applyCorrelation`
 *   산출에는 사용되나, 이후 `applyPositionProfile`이 _profileByPosition_으로
 *   _완전 덮어쓰기_ → mesh 산식에 **영향 0**.
 *
 *   값 변경해도 mesh 변화 없음. 실제 mesh 영향은 `profileByPosition.*`
 *   값에서. L9 multiplier refactor 후 의미 부활 예정 (preset range가
 *   position profile에 _multiplier_로 작용하도록).
 */
export const AgePresetSchema = z.object({
  leafLengthCmRange: Range2,
  majorLeafletPairsRange: Range2,
  intercalaryRange: Range2,
  secondaryRange: Range2.optional(),
  /** @deprecated L8-5 — applyPositionProfile override로 mesh 영향 0. L9 multiplier refactor 예정. */
  aspectRatioRange: Range2,
  /** @deprecated L8-5 — applyPositionProfile override로 mesh 영향 0. L9 multiplier refactor 예정. */
  serrationAmpRange: Range2,
  /** @deprecated L8-5 — applyPositionProfile override로 mesh 영향 0. L9 multiplier refactor 예정. */
  lobeDepthRange: Range2,
  poseDroopDegRange: Range2,
  color: z.enum(['bright-light-green', 'green', 'green-with-yellowing']),
  curl: z.number().optional(),
  asymmetry: Ratio01.optional(),
  smoothMargin: z.boolean().optional(),
  // Hybrid baseline anchors (Iter 38 S3) — preset-mean for sampleHybrid.
  leafLengthFactor: RatioPositive.optional(),
  leafletCountFactor: RatioPositive.optional(),
  /** @deprecated L8-5 — applyPositionProfile override로 mesh 영향 0. L9 multiplier refactor 예정. */
  aspectRatioBaseline: RatioPositive.optional(),
  baseShapeBaseline: Ratio01.optional(),
  /** @deprecated L8-5 — applyPositionProfile override로 mesh 영향 0. L9 multiplier refactor 예정. */
  tipSharpnessBaseline: RatioPositive.optional(),
});

/**
 * Per-leaflet shape profile (terminal / primary / intercalary / secondary).
 * Differentiates leaflet morphology by position on the compound leaf rachis.
 */
/**
 * ★ L9-D V2 S88 — V2 outline structure fields (옵셔널, V1은 무시).
 *
 * Outward shoulder lobe (Gaussian bump) — Self-contained schema for
 * positionally _structured_ shoulder lobes (단순 noise가 아닌 정해진 위치).
 *
 * 단위:
 *   - `u`: rachis 따라 0=base, 1=tip (rachis 길이 비율)
 *   - `depth`: `halfWidthBase` 비율 (★ meter 아님! 0.18 = halfWidth의 18%)
 *   - `sigma`: u-domain Gaussian 폭 (rachis 길이 비율, default 0.06)
 *
 * V2 산식: `bump(u) = Σ depth_i × exp(-(u - u_i)² / (2σ_i²))`
 */
export const ShoulderLobeSchema = z.object({
  u: Ratio01,
  depth: Ratio01,
  sigma: Ratio01.optional(),
});

/**
 * ★ L9-D V2 S88 — Inward sinus notch (Gaussian dent, lobe 사이 안쪽 파임).
 *
 * 단위는 `ShoulderLobeSchema`와 동일. 자연 토마토 outline의 _깊은 갈라짐_
 * 표현 — outward lobe만으로 부족. 산식에서 `(base + outward - inward)` 형태로
 * 감산 적용.
 */
export const SinusNotchSchema = z.object({
  u: Ratio01,
  depth: Ratio01,                  // ★ halfWidthBase 비율 (감산)
  sigma: Ratio01.optional(),       // default 0.04 (lobe보다 좁음)
});

export const PositionProfileSchema = z.object({
  widthRatio: RatioPositive.max(2),
  lobeDepth: Ratio01,
  serrationAmp: Ratio01,
  serrationFreq: z.number().positive(),
  tipSharpness: RatioPositive,
  baseTaper: Ratio01,

  // ★ L9-D V2 S88 — V2 outline structure fields (옵셔널).
  //   V1은 무시 (PositionProfileSchema parse는 .optional()을 통과시킴).
  //   V2 (S90+) 산식이 활성. 단위 주의: depth/sigma는 _halfWidthBase 비율_과
  //   _u-domain normalized_ — README/JSDoc 참조.

  /** Outward shoulder lobe array (Gaussian bump, halfWidthBase 비율). */
  shoulderLobes: z.array(ShoulderLobeSchema).optional(),

  /** Inward sinus notch array (Gaussian dent, lobe 사이 안쪽 파임). */
  sinusNotches: z.array(SinusNotchSchema).optional(),

  /** Drip tip apex acuminate 시작 u (default 0.85). */
  dripTipUStart: Ratio01.optional(),

  /** Drip tip apex 폭 감소율 (halfWidth 비율, default 0.6). */
  dripTipDepth: Ratio01.optional(),

  /** V2 LOD samples override (default LEAF_MESH_RESOLUTION_V2 적용). */
  samplesV2: z.number().int().min(12).max(48).optional(),
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
 * Multi-wave Fourier synthesis (sin 합성).
 *
 * ★ L8-3a (S71) — `mode` field 신규 (사용자 보완 #5):
 *   - 'positive' (default, backward compat): [0, amp] clamp — outline 바깥쪽만
 *   - 'signed': [-amp, amp] — outline 안쪽/바깥쪽 둘 다 (깊은 갈라짐 표현)
 *
 * @deprecated `positiveOnly` field — 'positive' mode와 동일 (backward compat 유지).
 *   미래 phase에서 제거 + `mode`만 사용 권장.
 */
export const LobeNoiseRulesSchema = z.object({
  // ★ L8-3a (S71) — mode field 신규 (default 'positive', visual change 0).
  mode: z.enum(['positive', 'signed']).optional(),
  positiveOnly: z.boolean(),                // @deprecated, 'positive' mode와 동일
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

  // ★ L8-4 (S73) — endpoint guard (사용자 보완 #3+#11): u<guardU/u>(1-guardU)
  //   에서 serration 0 강제. cap topology safety (작은 톱니 vertex 가시 방지).
  //   0.03 권장 = 양 끝 3% 영역 guard.
  serrationEndpointGuardU: Ratio01,            // current: 0.03 (L8-4)
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

// ─── Mesh resolution config (★ S142) ──────────────────────────────────────

/**
 * ★ S142 — Per-quality sample counts.
 *   `ultra-low / low / high` 명칭은 LeafMeshQuality와 동일 — distance LOD에서 선택.
 *   값은 `shape profile samples` (V1) 또는 `BGT internal samples` (V2).
 */
const MeshSampleLevelSchema = z.object({
  ultraLowSamples: z.number().int().positive(),
  lowSamples: z.number().int().positive(),
  highSamples: z.number().int().positive(),
});

/**
 * ★ S142 — 단일 leaf mesh tuning preset.
 *   - `v1` = legacy `LeafletProfile` sampler (bell-curve outline, `?leafBuilder=v1` 시).
 *   - `v2` = BGT (Beta × Gaussian × Triangle) sampler — production default.
 *   - `cols` = V2 BGT cross-section column count (S95에서 hardcoded 17).
 *             V1 (legacy)은 자체 `LEAFLET_PLANE_COLS=9` 유지 — preset 영향 없음.
 */
export const MeshConfigPresetSchema = z.object({
  v1: MeshSampleLevelSchema,
  v2: MeshSampleLevelSchema,
  cols: z.number().int().positive(),
});

/** ★ S142 — preset key 고정 enum (typo 방어). */
export const MeshPresetKeySchema = z.enum(['baseline', 'lite', 'aggressive']);

/**
 * ★ S142 — Mesh tuning 전체 config.
 *   `default` 는 URL/override 없을 시 사용. `distanceThresholds` 는 LOD 거리 분기.
 */
export const MeshConfigSchema = z.object({
  default: MeshPresetKeySchema,
  distanceThresholds: z.object({
    highMaxM: z.number().positive(),
    lowMaxM: z.number().positive(),
  }),
  presets: z.object({
    baseline: MeshConfigPresetSchema,
    lite: MeshConfigPresetSchema,
    aggressive: MeshConfigPresetSchema,
  }),
}).refine(
  (cfg) => cfg.distanceThresholds.highMaxM < cfg.distanceThresholds.lowMaxM,
  { message: 'highMaxM must be smaller than lowMaxM' },
);

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
  // ★ S142 — Mesh tuning config (samples / cols / distance thresholds SSOT).
  meshConfig: MeshConfigSchema,
});

export type LeafSpec = z.infer<typeof LeafSpecSchema>;
export type AgePresetParams = z.infer<typeof AgePresetSchema>;
export type LeafletShapeProfile = z.infer<typeof PositionProfileSchema>;
export type ShoulderLobe = z.infer<typeof ShoulderLobeSchema>;
export type SinusNotch = z.infer<typeof SinusNotchSchema>;
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
// ★ S142 — mesh tuning config types.
export type MeshConfigPreset = z.infer<typeof MeshConfigPresetSchema>;
export type MeshPresetKey = z.infer<typeof MeshPresetKeySchema>;
export type MeshConfig = z.infer<typeof MeshConfigSchema>;

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
