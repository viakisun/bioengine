// Iter 29 Phase 2A — LeafGrowthModel module (LeafOrganState + helpers).
//
// Plan §5, §6, §7, §8, §10, §11 (sleepy-growing-pretzel.md).
//
// PlantBase은 본 모듈을 호출해 모든 leaf-related growth state를 계산한 후
// LeafOrganState에 보관. Skeleton/Skin은 _값을 적용만_ — 재계산 금지.
//
// ★ Dependency-free boundary: 본 모듈은 ModelRegistry 등 application 의존성
// 없음. Cultivar는 structural input 타입 사용. Phase 1 ThermalTime/
// PhytomerModel/InternodeGrowthModel과 동일 패턴.
//
// References:
//   - Heuvelink 1996 TOMSIM (leaf area, phyllochron, source-sink)
//   - Marcelis 1996 (sink strength)
//   - Plan §5–§12

export type LeafStage =
  | 'primordium'
  | 'simple_leaf'
  | 'compound_developing'
  | 'compound_mature'
  | 'senescent'
  | 'removed';

// ============================================================
// Iter 30 Phase 2 — LeafAllocationState
// ============================================================

/**
 * Limitation reason — why this leaf's targetArea is smaller than potential.
 * `none` = no limitation (finalAllocationFactor ≥ 0.95).
 */
export type LeafLimitationReason =
  | 'none'
  | 'plant_source_limited'    // plant-wide sourceSinkProxy < 0.95
  | 'axis_capacity_limited'   // axis structural capacity < demand
  | 'axis_source_limited'     // (Phase 3) per-axis source-sink proxy < 0.95
  | 'side_shoot_limited'      // (Phase 4) side-shoot allocation factor < 0.95
  | 'stress_limited';         // water + disease > threshold

/**
 * LeafAllocationState — _이 leaf가 왜 이 크기인지_ trace 가능.
 *
 * Plan §4 (sleepy-growing-pretzel.md).
 * Phase 2 minimum 4-factor (Phase 3 axisSourceFactor 추가, Phase 4 별도 sideShoot).
 */
export interface LeafAllocationState {
  /** plant-wide sourceSinkProxyV1 (clamp [0.65, 1.15]). */
  plantSourceFactor: number;
  /**
   * Iter 30 Phase 3 — per-axis source-sink proxy (clamp [0.5, 1.15]).
   * 측지가 main 대비 약한 axis임을 반영. Main axis = 1.0 (Phase 3 정밀화 전).
   * Backward compat: optional ?:.
   */
  axisSourceFactor?: number;
  /** axis-level capacity factor (from NodeGrowthContext.axisCapacityFactor, clamp [0.35, 1.0]). */
  axisCapacityFactor: number;
  /** side-shoot only allocation (main = 1.0). Phase 4에서 정밀화. */
  sideShootAllocationFactor: number;
  /** stress composite (water + disease). */
  stressFactor: number;
  /** product, clamp [0.15, 1.5]. */
  finalAllocationFactor: number;
  /** finalAllocationFactor < 0.95 이면 가장 큰 limiting factor. */
  limitationReason: LeafLimitationReason;
}

const ALLOC_NEAR_FULL = 0.95;

/**
 * Compose final allocation factor + identify limiting reason.
 *
 * Plan §4 산식: final = plant × axis × sideShoot × stress (clamp [0.15, 1.5]).
 */
export function composeLeafAllocation(input: {
  plantSourceFactor: number;
  /** Iter 30 Phase 3 — axis source-sink proxy (optional; main=1.0 default). */
  axisSourceFactor?: number;
  axisCapacityFactor: number;
  sideShootAllocationFactor: number;
  stressFactor: number;
}): LeafAllocationState {
  const axisSource = input.axisSourceFactor ?? 1.0;
  const product =
    input.plantSourceFactor *
    axisSource *
    input.axisCapacityFactor *
    input.sideShootAllocationFactor *
    input.stressFactor;
  const finalAllocationFactor = Math.max(0.15, Math.min(1.5, product));

  // Identify limiting reason — 가장 낮은 factor (≤ 0.95 threshold)
  let limitationReason: LeafLimitationReason = 'none';
  if (finalAllocationFactor < ALLOC_NEAR_FULL) {
    const factors: { name: LeafLimitationReason; value: number }[] = [
      { name: 'plant_source_limited', value: input.plantSourceFactor },
      { name: 'axis_source_limited', value: axisSource },
      { name: 'axis_capacity_limited', value: input.axisCapacityFactor },
      { name: 'side_shoot_limited', value: input.sideShootAllocationFactor },
      { name: 'stress_limited', value: input.stressFactor },
    ];
    factors.sort((a, b) => a.value - b.value);  // 작은 순
    limitationReason = factors[0].name;
  }

  return {
    plantSourceFactor: input.plantSourceFactor,
    axisSourceFactor: axisSource,
    axisCapacityFactor: input.axisCapacityFactor,
    sideShootAllocationFactor: input.sideShootAllocationFactor,
    stressFactor: input.stressFactor,
    finalAllocationFactor,
    limitationReason,
  };
}

/**
 * Dev-only — allocation 4-factor 항등식 검증.
 */
export function assertAllocationConsistent(
  alloc: LeafAllocationState,
  contextHint?: string,
): void {
  const where = contextHint ? ` (${contextHint})` : '';
  const axisSource = alloc.axisSourceFactor ?? 1.0;
  const productClamped = Math.max(0.15, Math.min(1.5,
    alloc.plantSourceFactor *
    axisSource *
    alloc.axisCapacityFactor *
    alloc.sideShootAllocationFactor *
    alloc.stressFactor,
  ));
  if (Math.abs(alloc.finalAllocationFactor - productClamped) > 1e-6) {
    console.warn(
      `[LeafAllocationState] finalAllocationFactor=${alloc.finalAllocationFactor.toFixed(4)} ` +
      `vs product=${productClamped.toFixed(4)}${where}`,
    );
  }
  if (alloc.finalAllocationFactor < ALLOC_NEAR_FULL && alloc.limitationReason === 'none') {
    console.warn(`[LeafAllocationState] final < 0.95 but reason='none'${where}`);
  }
}

/**
 * Leaf posture state — Plan §11.
 *
 * PlantBase가 계산. Skeleton anchor.rotation에 _복사_. Skin은 anchor.rotation
 * 만 읽음 (SKIN-NO-LEAFBASE-01).
 *
 * ★ `curl`은 Phase 2A에서 posture에 둠. v3.3 DEFORMATION-FUTURE-01 — Phase
 * 5/6에서 LeafDeformationState 분리 가능성 docs.
 */
export interface LeafPostureState {
  /** Phyllotaxis azimuth (degrees) — baseAxis + index × 137.5 + node variation. */
  azimuthDeg: number;
  /** Petiole elevation (degrees) — 0° = horizontal up. (Legacy alias). */
  petioleElevationDeg: number;
  /** Leaf blade droop (degrees) — mature droop + senescence sag. (Legacy alias = finalDroopDeg). */
  droopDeg: number;
  /** Leaf twist (degrees) around the petiole axis. */
  twistDeg: number;
  /** Curl (0..1) — Phase 2A: posture field; future: deformation. */
  curl: number;

  // ── Iter 30 Phase 5 — 9-필드 분해 (light-facing + gravity 분리) ──
  // 사용자 review 6번 — 이름 정확화 (BladePlaneTilt 명명)
  // 사용자 review 7번 — 부호 일관성 (droop이 양수면 tilt 증가)
  // Backward compat: optional ?:. composePosture가 populate.

  /** 빛 추구 — blade plane이 ground-parallel 향하는 목표 (상부광이면 0°). */
  lightSeekingBladePlaneTiltDeg?: number;
  /** 빛 추구 — blade upward normal (상부광이면 (0, 1, 0)). */
  lightSeekingNormal?: { x: number; y: number; z: number };
  /** 마디에서 잎자루(petiole axis) base elevation (degrees). */
  petioleBaseElevationDeg?: number;
  /** Gravity droop component (degrees) — f(currentArea, rachisLength, age). */
  gravityDroopDeg?: number;
  /** Senescence droop component (degrees) — f(senescence.progress). */
  senescenceDroopDeg?: number;
  /** Water stress droop component (degrees). */
  waterStressDroopDeg?: number;
  /** Final blade plane tilt = lightSeekingTilt + finalDroopDeg (부호 일관). */
  finalBladePlaneTiltDeg?: number;
  /** Final droop = gravity + senescence + waterStress (Legacy alias = droopDeg). */
  finalDroopDeg?: number;
}

/**
 * Leaf morphology state — Plan §10.
 * Cultivar leaf shape + developmental stage + node position + deterministic
 * variation. Phase 2A populates with cultivar visual profile values (when
 * available) or default. Phase 5 integrates full variance.
 */
export interface LeafMorphologyState {
  /** Serration depth 0..1, multiplied with genome bias. */
  serrationDepth: number;
  /** Lobe depth 0..1. */
  lobeDepth: number;
  /** Petiole length (m). */
  petioleLengthM: number;
  /** Per-node deterministic variation seed. */
  variationSeed: number;
}

/**
 * Leaf senescence state — Plan §12 + LEAF-SENESCENCE-PLANTBASE-01.
 *
 * PlantBase가 _모두_ 계산해 LeafOrganState.senescence에 보관. Skin이
 * senescenceProgress를 직접 해석해 droop/curl 재계산 _금지_.
 */
export interface LeafSenescenceState {
  /** 0..1 senescence progress (sigmoid of ageTT - senescenceStartTT). */
  progress: number;
  /** 0..1 color dullness — chlorophyll loss (Phase 2A: tied to progress). */
  colorDullness: number;
  /** 0..1 visible area factor — _smooth_ multiplier on mesh visibility scale. */
  visibleAreaFactor: number;
  /** 0..1 senescence curl — chlorophyll/turgor loss curl-up. */
  curl: number;
  /** Additional droop (degrees) from senescence — adds to posture.droopDeg. */
  droopDeg: number;
}

/**
 * Leaf organ state — Plan §5 canonical structure. PlantBase가 계산하여
 * PhytomerNode.leaf에 보관.
 */
export interface LeafOrganState {
  nodeIndex: number;

  /** TT (GDD) when leaf was initiated. Mirrors PhytomerNode.initiationTT. */
  initiationTT: number;
  /** TT (GDD) when leaf became visible. Phase 2A = initiationTT. */
  visibleTT: number;
  /** TT (GDD) since initiation. Mirrors PhytomerNode.ageTT. */
  ageTT: number;

  /**
   * Iter 30 Phase 2 — Pre-allocation potential.
   * = cultivar.maxLeafAreaCm2 × nodePositionFactor × stemVigorFactor.
   * 'allocation' 적용 _전_ 잠재 면적 (POTENTIAL-TARGET-CURRENT-01).
   *
   * Backward compat: optional ?:. Phase 0.A에서 _함수 내부 변수_로만 존재했고
   * Phase 2부터 LeafOrganState 필드로 승격.
   */
  potentialAreaCm2?: number;

  /** Cultivar potential × position × vigor × allocation. POTENTIAL-TARGET-CURRENT-01: ≤ potential. */
  targetAreaCm2: number;
  /** Expansion-progress-scaled. Always ≤ targetAreaCm2 (LEAF-EXPANSION-01). */
  currentAreaCm2: number;
  /** 0..1 expansion sigmoid output. */
  expansionProgress: number;

  /** Discrete developmental stage. */
  stage: LeafStage;
  /** Rounded leaflet count from leafletCountFromMaturity (Iter 29 v1 P0 SSOT). */
  leafletCount: number;

  morphology: LeafMorphologyState;
  posture: LeafPostureState;
  senescence: LeafSenescenceState;

  /**
   * Iter 30 Phase 2 — LeafAllocationState (4-factor + finalAllocationFactor + reason).
   * Plan §4 (sleepy-growing-pretzel.md). Phase 0.A allocationFactor scalar의 _분해_.
   * Backward compat: optional ?:.
   */
  allocation?: LeafAllocationState;
}

/**
 * Truss organ state — Plan §2A shell. Phase 2A: state shell only.
 * Full flowering/fruiting/ripening biology remains in existing TrussState
 * (separate object — referenced via PhytomerNode.truss); this shell carries
 * the canonical TT-based lifecycle indicators.
 *
 * PHYTOMER-ORGAN-SHELL-01.
 */
export interface TrussOrganState {
  initiationTT: number;
  ageTT: number;
  state: 'primordium' | 'flowering' | 'fruiting' | 'ripening' | 'harvested';
}

/**
 * Side shoot state — Plan §2A shell. Phase 2A: state shell only.
 * Recursive sub-axis details remain in existing StemAxis (referenced via
 * PhytomerNode.sideShoot); this shell carries activation potential + TT.
 *
 * PHYTOMER-ORGAN-SHELL-01.
 */
export interface SideShootState {
  initiationTT: number;
  ageTT: number;
  /** Apex dominance + light + pruning composite potential (0..1). */
  potential: number;
  activatedAtTT?: number;
}

// ----- Helpers ---------------------------------------------------------

/**
 * Plan §6.2 — node position factor (sin curve peaking mid-shoot).
 * @param nodeFrac  0..1 along shoot (0 = base, 1 = apex)
 */
export function computeNodePositionFactor(nodeFrac: number): number {
  return Math.sin(Math.max(0, Math.min(1, nodeFrac)) * Math.PI);
}

/**
 * Plan §10 + VARIANCE-01 / VARIANCE-CLAMP-01 — per-node deterministic
 * morphology variance.
 *
 * Uses the node's `variationSeed` (Phase 2A populated by GrowthModel) to
 * generate two independent perturbations and applies them multiplicatively
 * within a clamp ±15% to serrationDepth and lobeDepth.
 *
 * deterministic — same variationSeed → same perturbation.
 *
 * @param base  baseline LeafMorphologyState (cultivar default values)
 * @param variancePct  perturbation magnitude (default 0.15 = ±15%)
 */
export function applyMorphologyVariance(
  base: LeafMorphologyState,
  variancePct: number = 0.15,
): LeafMorphologyState {
  // mulberry32 — simple 32-bit splittable PRNG, deterministic from seed.
  const r1 = mulberry32(base.variationSeed >>> 0)();
  const r2 = mulberry32((base.variationSeed + 0x9e3779b9) >>> 0)();
  const perturbed = (v: number, r: number) => v * (1 + (r - 0.5) * 2 * variancePct);
  return {
    ...base,
    serrationDepth: clamp(perturbed(base.serrationDepth, r1), 0.0, 0.5),
    lobeDepth: clamp(perturbed(base.lobeDepth, r2), 0.0, 0.5),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Mulberry32 PRNG factory — deterministic from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Plan §6.3 — plant vigor factor (lightweight stem-radius proxy).
 *
 * ★ 정직 표기: lightweight vigor proxy. NOT a full TOMSIM/TOMGRO carbon
 * partition model. Phase 2A uses the heightCm proxy (Iter 29 v1 P3 commit
 * 382dcc2 동일 식); Phase 2B switches to stem-radius ratio per plan §6.3.
 */
export function computePlantVigorFactor(heightCm: number, referenceHeightCm: number = 50): number {
  const safe = Math.max(1, heightCm);
  return Math.max(0.5, Math.min(1.5, Math.pow(safe / referenceHeightCm, 0.5)));
}

/**
 * Plan §7 — leaf expansion sigmoid. ageTT-based.
 *
 * sigmoid(t - midpointTT, steepness) clipped to [0, 1].
 *
 * @param ageTT                 leaf age (GDD)
 * @param expansionDurationTT   cultivar leaf expansion duration (GDD)
 * @param steepness             sigmoid steepness coefficient (default 0.015)
 */
export function computeLeafExpansionProgress(
  ageTT: number,
  expansionDurationTT: number,
  steepness: number = 0.015,
): number {
  if (ageTT <= 0) return 0;
  // midpoint at half-duration (t50)
  const midpoint = expansionDurationTT * 0.5;
  const x = steepness * (ageTT - midpoint);
  return Math.max(0, Math.min(1, 1 / (1 + Math.exp(-x))));
}

/**
 * Plan §5 — derive discrete LeafStage from expansionProgress + senescenceProgress.
 *
 * @param expansionProgress   0..1
 * @param senescenceProgress  0..1
 * @returns LeafStage enum
 */
export function classifyLeafStage(
  expansionProgress: number,
  senescenceProgress: number,
): LeafStage {
  if (expansionProgress <= 0) return 'primordium';
  if (senescenceProgress >= 0.95) return 'removed';
  if (senescenceProgress >= 0.3) return 'senescent';
  if (expansionProgress < 0.3) return 'simple_leaf';
  if (expansionProgress < 0.85) return 'compound_developing';
  return 'compound_mature';
}

/**
 * Build a LeafOrganState from already-computed flat fields (Phase 2A
 * transitional adapter). Behavior identical to existing GrowthModel pass
 * — only the structure is new.
 *
 * Phase 1 produces NodeState with flat fields + TT. Phase 2A adapter wraps
 * those into a canonical LeafOrganState that lives on PhytomerNode.leaf.
 */
export function makeLeafOrganStateFromFlat(input: {
  nodeIndex: number;
  initiationTT: number;
  visibleTT: number;
  ageTT: number;
  /** Phase 2 신규 — pre-allocation potential. Optional for backward compat. */
  potentialAreaCm2?: number;
  targetAreaCm2: number;
  currentAreaCm2: number;
  expansionProgress: number;
  leafletCount: number;
  /** Existing PostureState components, computed by PlantBase. */
  posture: LeafPostureState;
  morphology: LeafMorphologyState;
  senescence: LeafSenescenceState;
  /** Phase 2 신규 — LeafAllocationState. Optional for backward compat. */
  allocation?: LeafAllocationState;
}): LeafOrganState {
  return {
    nodeIndex: input.nodeIndex,
    initiationTT: input.initiationTT,
    visibleTT: input.visibleTT,
    ageTT: input.ageTT,
    potentialAreaCm2: input.potentialAreaCm2 !== undefined
      ? Math.max(0, input.potentialAreaCm2)
      : undefined,
    targetAreaCm2: Math.max(0, input.targetAreaCm2),
    currentAreaCm2: Math.max(0, Math.min(input.targetAreaCm2, input.currentAreaCm2)),
    expansionProgress: Math.max(0, Math.min(1, input.expansionProgress)),
    stage: classifyLeafStage(input.expansionProgress, input.senescence.progress),
    leafletCount: input.leafletCount,
    morphology: input.morphology,
    posture: input.posture,
    senescence: input.senescence,
    allocation: input.allocation,
  };
}

/**
 * Dev-only assertion — Plan LEAF-EXPANSION-01 (currentArea ≤ targetArea)
 * + LEAF-AGE-TT-01 (ageTT, initiationTT defined).
 */
export function assertLeafOrganStateValid(
  leaf: LeafOrganState,
  contextHint?: string,
): void {
  const where = contextHint ? ` (${contextHint})` : '';
  if (!Number.isFinite(leaf.initiationTT)) {
    console.warn(`[LeafGrowthModel] leaf.initiationTT missing${where}`);
  }
  if (!Number.isFinite(leaf.ageTT)) {
    console.warn(`[LeafGrowthModel] leaf.ageTT missing${where}`);
  }
  if (leaf.currentAreaCm2 > leaf.targetAreaCm2 + 1e-6) {
    console.warn(
      `[LeafGrowthModel] leaf[${leaf.nodeIndex}].currentAreaCm2=${leaf.currentAreaCm2.toFixed(2)} ` +
      `> targetAreaCm2=${leaf.targetAreaCm2.toFixed(2)}${where}`,
    );
  }
}
