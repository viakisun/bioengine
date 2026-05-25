// BotanicalSpec — botanical.v1 schema (crop morphology + organ development).
//
// SSOT #26 (botanical layer separation): 모든 작물별 botanical/physiological
// hardcoded parameter는 models/botanical/{crop}.jsonc 에 거주.
// SSOT #27 (cultivar override pattern): cultivar는 partial override만.
// SSOT #29 (layer boundary): botanical은 stem geometry / internode / fruit
// growth curve / leaf morphology만. phenology(GDD) / canopy physiology(LUE,
// sink) / physics는 별도 layer (cultivar.phenology / tomgro-v1.jsonc).
// SSOT #30 (per-field enforcementStatus): inactive field도 spec에 포함 가능,
// 단 enforcementStatus: 'pending_engine_logic' 명시 필수.
//
// 본 모듈은 types + resolver + 5-step strict validation 정의.
// 실제 JSONC 로딩은 ModelRegistry.ts 에서 (Phase B).

// ── Provenance ────────────────────────────────────────────────────────

export type ProvenanceSourceLevel =
  | 'default'
  | 'estimated'
  | 'literature'
  | 'measured'
  | 'calibrated';

export type ProvenanceConfidence = 'low' | 'medium' | 'high';

export interface Provenance {
  sourceLevel: ProvenanceSourceLevel;
  confidence: ProvenanceConfidence;
  sourceRefs: string[];                          // 'Heuvelink 2018', 'Gillaspy 1993' 등
  notes: string;
  lastReviewed: string;                          // ISO date
}

// ── Distribution helpers ─────────────────────────────────────────────

export interface MuSigma {
  mu: number;
  sigma: number;
}

export interface ClampedMuSigma {
  mu: number;
  sigma: number;
  min: number;
  max: number;
}

// ── Schema family identifiers ─────────────────────────────────────────

export type BotanicalSchemaVersion = 'botanical.v1';

export type BotanicalCrop =
  | 'tomato'
  | 'paprika'
  | 'cucumber'
  | 'strawberry'
  | 'lettuce'
  | 'eggplant';

export type EnforcementStatus =
  | 'active'                                     // 엔진이 실제 사용 중
  | 'pending_engine_logic'                       // spec에만 존재, 엔진 enforcement 대기
  | 'deprecated';                                // 사용 중단, 후속 phase에서 제거

// ── Stem growth (Table 1, 17 values) ──────────────────────────────────

export interface StemGrowthSpec {
  hypocotyl: {
    emergenceDay: number;                        // 5 — 발아 후 신장 시작
    maxCm: number;                                // 4
    growthRateCmPerDay: number;                  // 0.8
  };
  seedlingInternode: {
    count: number;                                // 4 — 처음 N개 노드의 정해진 패턴
    firstLenCm: number;                           // 1.5
    slopePerNode: number;                         // 0.8 — i × 0.8cm 증가
  };
  matureInternode: {
    vigorFloor: number;                           // 0.75 — off-peak 노드도 75% elongation
    vigorRange: number;                           // 0.5
    taperStartFrac: number;                       // 0.8 — nodeFrac > 0.8 부터 taper 시작
    taperSlope: number;                           // 0.5
    lengthDistribution: ClampedMuSigma;          // {mu: 8.0, sigma: 0.8, min: 6.0, max: 10.5}
  };
  elongation: {
    steepness: number;                            // 0.4 — sigmoid k
    delayDays: ClampedMuSigma;                   // {mu: 4, sigma: 0.5, min: 3, max: 6}
    midpointDays: ClampedMuSigma;                // {mu: 8, sigma: 1.0, min: 6, max: 10}
    preElongFactor: number;                       // 0.01 — pre-elongation factor
  };
  heightCurve: {
    sigmoidK: MuSigma;                            // {mu: 0.07, sigma: 0.008}
    sigmoidMid: MuSigma;                          // {mu: 45, sigma: 4}
    maxCm: ClampedMuSigma;                       // {mu: 200, sigma: 15, min: 160, max: 240}
  };
  initialStateOffsetDays: number;                 // -30 — 정식묘 node 가짜 birth day
  initialStateSpread: number;                     // 0.5 — per-node spread
}

// ── Fruit development (Table 3, 8 values + Iter 5b massFlow) ──────────

/** Iter 5b — 잉여 DM 처리 정책. clamp surplus를 어디로 보낼지. */
export type SurplusAssimilatePolicy =
  | 'unused_pool'                  // Iter 5b 기본값. 잉여 DM은 어디로도 안 흐름 (질량 보존 X, but fruit fix 단독 측정 가능).
  | 'redistribute_to_vegetative';  // 후속 옵션. Heuvelink hierarchy로 leaf → stem → root 흐름.

/** Iter 5b — fruit mass flow 정책. Gompertz curve가 sink demand에 영향을
 *  주는지 + cumulative cap 시간별 trajectory 적용 여부. */
export interface MassFlowSpec {
  /** 'legacy_sink_unlimited' fallback (Iter 5b 이전 동작 재현용).
   *  Iter 5b 도입값은 'gompertz_sink_limited'. */
  mode: 'legacy_sink_unlimited' | 'gompertz_sink_limited';
  /** Tomato fruit DM:FW ratio. Heuvelink 1996 ≈ 0.05-0.07. */
  fruitDryMatterRatio: number;
  /** visibleFruitCount 계산에만 사용. `visible = diameterMm >= this && !aborted && !harvested`.
   *  fruitCohortCount는 별도 metric. 0이면 모든 비-abort fruit가 visible.
   *  Iter 6 (growth_update_006): 2 → 3mm. SSOT #42 — calibration pass
   *  maxVisibleFruitDiameterMm 임계값도 동일 (혼선 방지). */
  minVisibleDiameterMm: number;
  /** Iter 6 신규 — `truss.status = 'fruit_expanding'` 판정 임계값.
   *  visibleFruitCount > 0 AND maxDiameter >= this AND any fruit phase ∈
   *  {cell_expansion, ripening_early, ripening_late} 조건 만족 시 expansion.
   *  diameter 단독이 아니라 phase도 함께 확인 (SSOT #6). 기본 10mm. */
  minExpandingDiameterMm: number;
  /** Iter 6h (SSOT #74) — fruit visibility gate mode (calibration-only, SSOT #76).
   *  diameter_only:   diameter >= minVisibleDiameterMm (현재 방식, 후방호환 default)
   *  phase:           + phase != cell_division
   *  phase_and_gdd:   + phase + gddSinceFruitSet >= minFruitAgeGDDForVisible */
  visibilityGateMode: 'diameter_only' | 'phase' | 'phase_and_gdd';
  /** Iter 6h (SSOT #74) — visibility gate에서 사용하는 GDD threshold.
   *  visibilityGateMode='phase_and_gdd'일 때만 활성. 기본 80 GDD. */
  minFruitAgeGDDForVisible: number;
  /** trajectory cap on/off. mode='gompertz_sink_limited'와 함께. */
  enableTrajectoryCap: boolean;
  /** per-fruit step demand clamp on/off (SinkAllocation 측). */
  enableStepDemandLimit: boolean;
  /** 잉여 DM 처리. Iter 5b 기본 'unused_pool'. */
  surplusPolicy: SurplusAssimilatePolicy;
  /** snapshot에 fruit debug fields 출력 on/off. */
  debug: boolean;
}

export interface FruitDevelopmentSpec {
  visualSigmoid: {
    steepness: number;                            // 0.12 — FRUIT_SIGMOID_K
    midpointDays: number;                         // 18 — FRUIT_SIGMOID_MID
  };
  ripening: {
    startAgeDays: number;                         // 25 — RIPEN_START_AGE
    durationDays: number;                         // 18 — RIPEN_DURATION
  };
  flowering: {
    delayPerPositionDays: number;                 // 2 — 같은 truss 안 꽃 간격
    bloomDurationDays: number;                    // 5
    // NOTE: setDelayDays(12)는 현재 엔진(CoreModel.ts:320-327)이 anthesis 즉시
    // set 처리. inactive 값. Phase 1은 location migration만, 실제 enforcement는
    // 별도 Iter 1B engine_logic plan에서. enforcementStatus: 'pending_engine_logic'.
    setDelayDays: number;                         // 12 — bloom 후 fruit set (currently inactive)
  };
  gompertz: {
    rateB: MuSigma;                               // {mu: 0.06, sigma: 0.01}
    inflectionC: MuSigma;                         // {mu: 0.45, sigma: 0.05}
    exponentScaling: number;                      // 0.01 — FruitGrowth.ts:51
  };
  /** Iter 5b: fruit sink + W_dry trajectory cap 정책. */
  massFlow: MassFlowSpec;
}

// ── BotanicalSpec (full) ─────────────────────────────────────────────

export interface BotanicalSpec {
  schemaVersion: BotanicalSchemaVersion;
  crop: BotanicalCrop;
  provenance: Provenance;
  stemGrowth: StemGrowthSpec;
  fruitDevelopment: FruitDevelopmentSpec;
  // 사용자 검토 #4 (lite field-level provenance)
  parameterNotes?: Record<string, string>;
  // 사용자 검토 #2 (per-field enforcement status)
  enforcementStatus?: Record<string, EnforcementStatus>;
}

// ── DeepPartial type (override 용) ────────────────────────────────────

type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type BotanicalPartial = DeepPartial<
  Omit<BotanicalSpec, 'schemaVersion' | 'crop'>
> & {
  schemaVersion?: BotanicalSchemaVersion;
};

// ── Errors ────────────────────────────────────────────────────────────

export class BotanicalValidationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(`[botanical] ${message}`);
    this.name = 'BotanicalValidationError';
  }
}

// ── Confidence ranking (warn 용) ──────────────────────────────────────

const CONFIDENCE_RANK: Record<ProvenanceConfidence, number> = {
  low: 0, medium: 1, high: 2,
};

// ── Supported versions ────────────────────────────────────────────────

const SUPPORTED_VERSIONS: ReadonlySet<BotanicalSchemaVersion> = new Set([
  'botanical.v1',
]);

// ── 5-step strict validation (SSOT #27 + 사용자 검토 #5, #7, #8) ───

/**
 * Resolve cultivar's botanicalOverride against the crop-level base spec.
 *
 * 5 steps:
 *   1. base full schema validate (boot 시 1회, cached 가능)
 *   2. override partial schema validate with additionalProperties:false
 *   3. unknown key reject + parameterNotes/enforcementStatus path whitelist
 *      (잘못된 override는 merge 전 차단)
 *   4. deep merge
 *   5. final resolved botanical schema validate
 */
export function resolveBotanical(
  base: BotanicalSpec,
  override: BotanicalPartial | undefined,
): BotanicalSpec {
  // Step 1
  validateFull(base);

  if (!override) return cloneBotanical(base);

  // Step 2
  validatePartial(override);

  // Step 3 — unknown key reject (오타 차단) + path whitelist
  rejectUnknownKeys(override as Record<string, unknown>, base as unknown as Record<string, unknown>, '');
  validatePathWhitelist(base.parameterNotes ?? {}, base, 'parameterNotes');
  validatePathWhitelist(base.enforcementStatus ?? {}, base, 'enforcementStatus');

  // Provenance confidence warn (LeafShape 패턴)
  if (override.provenance && override.provenance.confidence) {
    const overrideRank = CONFIDENCE_RANK[override.provenance.confidence];
    const defaultRank = CONFIDENCE_RANK[base.provenance.confidence];
    if (overrideRank < defaultRank) {
      // eslint-disable-next-line no-console
      console.warn(
        `[botanical] override confidence '${override.provenance.confidence}' < default '${base.provenance.confidence}'. Verify cultivar JSONC.`,
      );
    }
  }

  // Step 4
  const merged = deepMergeBotanical(base, override);

  // Step 5
  validateFull(merged);

  return merged;
}

// ── Validators ────────────────────────────────────────────────────────

export function validateFull(spec: BotanicalSpec): void {
  if (!spec || typeof spec !== 'object') {
    throw new BotanicalValidationError('spec must be object');
  }
  if (!SUPPORTED_VERSIONS.has(spec.schemaVersion)) {
    throw new BotanicalValidationError(
      `unsupported schemaVersion '${String(spec.schemaVersion)}'. Supported: ${[...SUPPORTED_VERSIONS].join(', ')}`,
    );
  }
  if (typeof spec.crop !== 'string') {
    throw new BotanicalValidationError('crop must be string');
  }
  requireObject(spec.provenance, 'provenance');
  requireObject(spec.stemGrowth, 'stemGrowth');
  requireObject(spec.fruitDevelopment, 'fruitDevelopment');

  // stemGrowth deep checks (대표 필드만 — 전체 walking 비용 회피)
  const sg = spec.stemGrowth;
  requireObject(sg.hypocotyl, 'stemGrowth.hypocotyl');
  requireFiniteNumber(sg.hypocotyl.emergenceDay, 'stemGrowth.hypocotyl.emergenceDay');
  requireFiniteNumber(sg.hypocotyl.maxCm, 'stemGrowth.hypocotyl.maxCm');
  requireFiniteNumber(sg.hypocotyl.growthRateCmPerDay, 'stemGrowth.hypocotyl.growthRateCmPerDay');
  requireObject(sg.seedlingInternode, 'stemGrowth.seedlingInternode');
  requireObject(sg.matureInternode, 'stemGrowth.matureInternode');
  requireClampedMuSigma(sg.matureInternode.lengthDistribution, 'stemGrowth.matureInternode.lengthDistribution');
  requireObject(sg.elongation, 'stemGrowth.elongation');
  requireClampedMuSigma(sg.elongation.delayDays, 'stemGrowth.elongation.delayDays');
  requireClampedMuSigma(sg.elongation.midpointDays, 'stemGrowth.elongation.midpointDays');
  requireObject(sg.heightCurve, 'stemGrowth.heightCurve');
  requireMuSigma(sg.heightCurve.sigmoidK, 'stemGrowth.heightCurve.sigmoidK');
  requireMuSigma(sg.heightCurve.sigmoidMid, 'stemGrowth.heightCurve.sigmoidMid');
  requireClampedMuSigma(sg.heightCurve.maxCm, 'stemGrowth.heightCurve.maxCm');

  // fruitDevelopment deep checks
  const fd = spec.fruitDevelopment;
  requireObject(fd.visualSigmoid, 'fruitDevelopment.visualSigmoid');
  requireObject(fd.ripening, 'fruitDevelopment.ripening');
  requireObject(fd.flowering, 'fruitDevelopment.flowering');
  requireObject(fd.gompertz, 'fruitDevelopment.gompertz');
  requireMuSigma(fd.gompertz.rateB, 'fruitDevelopment.gompertz.rateB');
  requireMuSigma(fd.gompertz.inflectionC, 'fruitDevelopment.gompertz.inflectionC');
  requireFiniteNumber(fd.gompertz.exponentScaling, 'fruitDevelopment.gompertz.exponentScaling');
  // Iter 5b — massFlow block
  requireObject(fd.massFlow, 'fruitDevelopment.massFlow');
  if (fd.massFlow.mode !== 'legacy_sink_unlimited' && fd.massFlow.mode !== 'gompertz_sink_limited') {
    throw new BotanicalValidationError(
      `fruitDevelopment.massFlow.mode invalid: ${String(fd.massFlow.mode)}`,
    );
  }
  requireFiniteNumber(fd.massFlow.fruitDryMatterRatio, 'fruitDevelopment.massFlow.fruitDryMatterRatio');
  requireFiniteNumber(fd.massFlow.minVisibleDiameterMm, 'fruitDevelopment.massFlow.minVisibleDiameterMm');
  requireFiniteNumber(fd.massFlow.minExpandingDiameterMm, 'fruitDevelopment.massFlow.minExpandingDiameterMm');
  if (typeof fd.massFlow.enableTrajectoryCap !== 'boolean'
   || typeof fd.massFlow.enableStepDemandLimit !== 'boolean'
   || typeof fd.massFlow.debug !== 'boolean') {
    throw new BotanicalValidationError('fruitDevelopment.massFlow flags must be boolean');
  }
  if (fd.massFlow.surplusPolicy !== 'unused_pool'
   && fd.massFlow.surplusPolicy !== 'redistribute_to_vegetative') {
    throw new BotanicalValidationError(
      `fruitDevelopment.massFlow.surplusPolicy invalid: ${String(fd.massFlow.surplusPolicy)}`,
    );
  }
  // Iter 6h — visibility gate validators (SSOT #74)
  if (fd.massFlow.visibilityGateMode !== 'diameter_only'
   && fd.massFlow.visibilityGateMode !== 'phase'
   && fd.massFlow.visibilityGateMode !== 'phase_and_gdd') {
    throw new BotanicalValidationError(
      `fruitDevelopment.massFlow.visibilityGateMode invalid: ${String(fd.massFlow.visibilityGateMode)}`,
    );
  }
  requireFiniteNumber(fd.massFlow.minFruitAgeGDDForVisible, 'fruitDevelopment.massFlow.minFruitAgeGDDForVisible');
}

export function validatePartial(override: BotanicalPartial): void {
  if (override === undefined || override === null) return;
  if (typeof override !== 'object') {
    throw new BotanicalValidationError('override must be object');
  }
  if (override.schemaVersion && !SUPPORTED_VERSIONS.has(override.schemaVersion)) {
    throw new BotanicalValidationError(
      `override schemaVersion '${String(override.schemaVersion)}' unsupported`,
    );
  }
  // 부분 검증은 unknown key reject (Step 3)에서 추가로 잡힘
}

/**
 * Walk override object — if any key is not present in base, throw.
 * 오타로 인한 silent merge 방지 (예: 'lenghtDistribution' → reject).
 */
export function rejectUnknownKeys(
  override: Record<string, unknown>,
  base: Record<string, unknown>,
  path: string,
): void {
  for (const key of Object.keys(override)) {
    // Allow optional top-level fields not always in base
    if (path === '' && (key === 'parameterNotes' || key === 'enforcementStatus' || key === 'provenance' || key === 'schemaVersion')) {
      continue;
    }
    if (!(key in base)) {
      throw new BotanicalValidationError(
        `unknown key '${path ? path + '.' + key : key}' in override (typo? not in base spec)`,
      );
    }
    const ov = override[key];
    const bs = base[key];
    if (isPlainObject(ov) && isPlainObject(bs)) {
      rejectUnknownKeys(ov, bs, path ? path + '.' + key : key);
    }
  }
}

/**
 * Verify that each key in `notes` is a valid dot-path in `base`.
 * parameterNotes / enforcementStatus 키 오타 차단.
 */
export function validatePathWhitelist(
  notes: Record<string, unknown>,
  base: BotanicalSpec,
  label: string,
): void {
  const validPaths = collectAllPaths(base as unknown as Record<string, unknown>, '');
  for (const path of Object.keys(notes)) {
    if (!validPaths.has(path)) {
      throw new BotanicalValidationError(
        `${label} path '${path}' is not a valid BotanicalSpec path. ` +
        `Got '${path}', closest valid: ${suggestClosest(path, validPaths) ?? '(none)'}`,
      );
    }
  }
}

function collectAllPaths(obj: Record<string, unknown>, prefix: string): Set<string> {
  const out = new Set<string>();
  for (const key of Object.keys(obj)) {
    // skip meta fields
    if (prefix === '' && (key === 'parameterNotes' || key === 'enforcementStatus' || key === 'schemaVersion' || key === 'crop' || key === 'provenance')) {
      continue;
    }
    const fullPath = prefix ? prefix + '.' + key : key;
    out.add(fullPath);
    const v = obj[key];
    if (isPlainObject(v)) {
      for (const sub of collectAllPaths(v, fullPath)) out.add(sub);
    }
  }
  return out;
}

function suggestClosest(target: string, candidates: Set<string>): string | null {
  // Trivial substring match — Levenshtein 등 도입은 후속
  for (const c of candidates) {
    if (c.includes(target) || target.includes(c)) return c;
  }
  return null;
}

// ── Type guards & helpers ─────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function requireObject(v: unknown, label: string): void {
  if (!isPlainObject(v)) {
    throw new BotanicalValidationError(`${label} must be object`);
  }
}

function requireFiniteNumber(v: unknown, label: string): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new BotanicalValidationError(`${label} must be finite number (got ${typeof v} ${String(v)})`);
  }
}

function requireMuSigma(v: unknown, label: string): void {
  requireObject(v, label);
  const o = v as Record<string, unknown>;
  requireFiniteNumber(o.mu, `${label}.mu`);
  requireFiniteNumber(o.sigma, `${label}.sigma`);
}

function requireClampedMuSigma(v: unknown, label: string): void {
  requireMuSigma(v, label);
  const o = v as Record<string, unknown>;
  requireFiniteNumber(o.min, `${label}.min`);
  requireFiniteNumber(o.max, `${label}.max`);
}

// ── Deep merge (typed, no shared references) ──────────────────────────

export function deepMergeBotanical(
  base: BotanicalSpec,
  override: BotanicalPartial,
): BotanicalSpec {
  const out = cloneBotanical(base);
  if (override.schemaVersion) out.schemaVersion = override.schemaVersion;
  if (override.provenance) {
    out.provenance = { ...out.provenance, ...override.provenance, sourceRefs: [
      ...(override.provenance.sourceRefs ?? out.provenance.sourceRefs),
    ] };
  }
  if (override.stemGrowth) {
    out.stemGrowth = mergeStemGrowth(out.stemGrowth, override.stemGrowth);
  }
  if (override.fruitDevelopment) {
    out.fruitDevelopment = mergeFruitDevelopment(out.fruitDevelopment, override.fruitDevelopment);
  }
  if (override.parameterNotes) {
    const mergedNotes: Record<string, string> = { ...(out.parameterNotes ?? {}) };
    for (const [k, v] of Object.entries(override.parameterNotes)) {
      if (typeof v === 'string') mergedNotes[k] = v;
    }
    out.parameterNotes = mergedNotes;
  }
  if (override.enforcementStatus) {
    const mergedStatus: Record<string, EnforcementStatus> = { ...(out.enforcementStatus ?? {}) };
    for (const [k, v] of Object.entries(override.enforcementStatus)) {
      if (v != null) mergedStatus[k] = v as EnforcementStatus;
    }
    out.enforcementStatus = mergedStatus;
  }
  return out;
}

function mergeStemGrowth(base: StemGrowthSpec, ov: DeepPartial<StemGrowthSpec>): StemGrowthSpec {
  return {
    hypocotyl: { ...base.hypocotyl, ...(ov.hypocotyl ?? {}) },
    seedlingInternode: { ...base.seedlingInternode, ...(ov.seedlingInternode ?? {}) },
    matureInternode: {
      ...base.matureInternode,
      ...(ov.matureInternode ?? {}),
      lengthDistribution: { ...base.matureInternode.lengthDistribution, ...(ov.matureInternode?.lengthDistribution ?? {}) },
    },
    elongation: {
      ...base.elongation,
      ...(ov.elongation ?? {}),
      delayDays: { ...base.elongation.delayDays, ...(ov.elongation?.delayDays ?? {}) },
      midpointDays: { ...base.elongation.midpointDays, ...(ov.elongation?.midpointDays ?? {}) },
    },
    heightCurve: {
      sigmoidK: { ...base.heightCurve.sigmoidK, ...(ov.heightCurve?.sigmoidK ?? {}) },
      sigmoidMid: { ...base.heightCurve.sigmoidMid, ...(ov.heightCurve?.sigmoidMid ?? {}) },
      maxCm: { ...base.heightCurve.maxCm, ...(ov.heightCurve?.maxCm ?? {}) },
    },
    initialStateOffsetDays: ov.initialStateOffsetDays ?? base.initialStateOffsetDays,
    initialStateSpread: ov.initialStateSpread ?? base.initialStateSpread,
  };
}

function mergeFruitDevelopment(
  base: FruitDevelopmentSpec,
  ov: DeepPartial<FruitDevelopmentSpec>,
): FruitDevelopmentSpec {
  return {
    visualSigmoid: { ...base.visualSigmoid, ...(ov.visualSigmoid ?? {}) },
    ripening: { ...base.ripening, ...(ov.ripening ?? {}) },
    flowering: { ...base.flowering, ...(ov.flowering ?? {}) },
    gompertz: {
      ...base.gompertz,
      ...(ov.gompertz ?? {}),
      rateB: { ...base.gompertz.rateB, ...(ov.gompertz?.rateB ?? {}) },
      inflectionC: { ...base.gompertz.inflectionC, ...(ov.gompertz?.inflectionC ?? {}) },
    },
    massFlow: { ...base.massFlow, ...(ov.massFlow ?? {}) },
  };
}

// ── Clone (no shared references) ──────────────────────────────────────

export function cloneBotanical(src: BotanicalSpec): BotanicalSpec {
  return {
    schemaVersion: src.schemaVersion,
    crop: src.crop,
    provenance: { ...src.provenance, sourceRefs: [...src.provenance.sourceRefs] },
    stemGrowth: {
      hypocotyl: { ...src.stemGrowth.hypocotyl },
      seedlingInternode: { ...src.stemGrowth.seedlingInternode },
      matureInternode: {
        ...src.stemGrowth.matureInternode,
        lengthDistribution: { ...src.stemGrowth.matureInternode.lengthDistribution },
      },
      elongation: {
        ...src.stemGrowth.elongation,
        delayDays: { ...src.stemGrowth.elongation.delayDays },
        midpointDays: { ...src.stemGrowth.elongation.midpointDays },
      },
      heightCurve: {
        sigmoidK: { ...src.stemGrowth.heightCurve.sigmoidK },
        sigmoidMid: { ...src.stemGrowth.heightCurve.sigmoidMid },
        maxCm: { ...src.stemGrowth.heightCurve.maxCm },
      },
      initialStateOffsetDays: src.stemGrowth.initialStateOffsetDays,
      initialStateSpread: src.stemGrowth.initialStateSpread,
    },
    fruitDevelopment: {
      visualSigmoid: { ...src.fruitDevelopment.visualSigmoid },
      ripening: { ...src.fruitDevelopment.ripening },
      flowering: { ...src.fruitDevelopment.flowering },
      gompertz: {
        ...src.fruitDevelopment.gompertz,
        rateB: { ...src.fruitDevelopment.gompertz.rateB },
        inflectionC: { ...src.fruitDevelopment.gompertz.inflectionC },
      },
      massFlow: { ...src.fruitDevelopment.massFlow },
    },
    parameterNotes: src.parameterNotes ? { ...src.parameterNotes } : undefined,
    enforcementStatus: src.enforcementStatus ? { ...src.enforcementStatus } : undefined,
  };
}

// ── Loader API (실제 import은 ModelRegistry.ts in Phase B) ──────────

/**
 * Parse a JSONC text into a validated BotanicalSpec.
 * ModelRegistry.ts calls this with `import tomatoText from '../models/botanical/tomato.jsonc?raw'`.
 *
 * Throws BotanicalValidationError on schema mismatch.
 */
export function loadBotanical(parsed: unknown, label: string): BotanicalSpec {
  if (!isPlainObject(parsed)) {
    throw new BotanicalValidationError(`${label}: parsed JSONC is not an object`);
  }
  validateFull(parsed as unknown as BotanicalSpec);
  return cloneBotanical(parsed as unknown as BotanicalSpec);
}
