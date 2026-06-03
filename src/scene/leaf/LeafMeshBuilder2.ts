// ★ Iter 39 Phase L9-D V2 (S85/S90) — V2 outline builder side-by-side (메시빌더2).
//
// 사용자 결정 (smooth-prancing-starfish.md v5):
//   "현재 메시 빌더를 놔두고, 새로운 메시빌더2를 만드는 것도 방법이야."
//
// V1 (`LeafMeshBuilder.ts`)의 `sin(πu)^shapePower` 단일 bell curve가 _수학적으로_
// 자연 토마토 outline (shoulder lobe + sinus notch + drip tip)을 표현 불가능.
// V2는 _근본적으로 다른 산식_을 side-by-side로 실험. URL flag `?leafBuilder=v2`
// 로 V1과 toggle 비교. V1 100% 보존.
//
// S85: 골격 (V1 단순 위임).
// S90 (이 phase): 실제 V2 산식 활성.
//   - buildShapeProfileV2: Gaussian shoulder bump + sinus notch + drip tip
//   - Expansion + Senescence scaling (사용자 결정: maturity-driven outline)
//   - V1 helpers 재사용: buildLeafShapeDescriptor / applyLeafletPose /
//     buildLeafletPlaneChunk / serrationNoise / lobeNoise
//
// 공존 정책 (Active 원칙 #56):
//   V1+V2 공존은 _임시_. V2 승격 6 조건 충족 후 _L10-A archive plan_으로 V1 →
//   `_archive/`. `leaf-builder-v2-coexistence.spec.ts`가 phase 추적.

import { newChunk } from '@farmsim/tomato-geometry';
import {
  buildLeafShapeDescriptor,
  applyLeafletPose,
  buildLeafletPlaneChunk,
  serrationNoise,
  djb2,
  quatFromYawPitchRoll,
  quatMultiply,
  type LeafMeshBuildInput,
  type LeafMeshPatch,
  type LeafShapeDescriptor,
} from './LeafMeshBuilder';
import { normalizeLeafMeshVertices } from './LeafAnchor';
import {
  applyPositionProfile,
  type LeafletPosition,
} from './LeafletProfile';
import type { LeafSpec, ShoulderLobe, SinusNotch } from './LeafSpec';

// ─── V2 Outline 산식 ───────────────────────────────────────────────────

/**
 * Outward shoulder lobe (Gaussian bump) — outline _밖으로_ 가산.
 *
 * 산식: `bump(u) = Σ depth_i × exp(-(u - u_i)² / (2σ_i²))`
 *
 * @param u 잎 길이 0-1
 * @param lobes spec.shoulderLobes (단위: depth = halfWidthBase 비율, sigma = u-domain)
 */
function shoulderLobeBumps(u: number, lobes: ReadonlyArray<ShoulderLobe>): number {
  let bump = 0;
  for (const { u: ui, depth: di, sigma: si = 0.06 } of lobes) {
    bump += di * Math.exp(-((u - ui) ** 2) / (2 * si * si));
  }
  return bump;
}

/**
 * Inward sinus notch (Gaussian dent, lobe _사이_ 안쪽 파임) — outline _안쪽_ 감산.
 *
 * 자연 토마토 outline의 _깊은 갈라짐_ 표현. outward bump만으로는 부족.
 */
function notchDents(u: number, notches: ReadonlyArray<SinusNotch>): number {
  let dent = 0;
  for (const { u: ui, depth: di, sigma: si = 0.04 } of notches) {
    dent += di * Math.exp(-((u - ui) ** 2) / (2 * si * si));
  }
  return dent;
}

/**
 * V2 base width — sin(πu)^shapePower + drip tip acuminate taper.
 *
 * V1 baseWidth와 동일하되, u ≥ dripTipUStart 영역에서 polynomial narrowing
 * 으로 _acuminate apex_ 표현.
 */
function baseWidthV2(
  u: number,
  shapePower: number,
  dripTipUStart: number,
  dripTipDepth: number,
): number {
  let s = Math.pow(Math.max(0, Math.sin(Math.PI * u)), shapePower);
  if (u >= dripTipUStart && dripTipDepth > 0) {
    const tu = (u - dripTipUStart) / Math.max(1e-6, 1 - dripTipUStart);
    s *= 1 - dripTipDepth * tu * tu;
  }
  return Math.max(0, s);
}

export interface ShapeProfileV2Input {
  lengthM: number;
  aspectRatio: number;
  tipSharpness: number;
  baseShape: number;
  asymmetry: number;
  samples: number;
  baseTransitionEndU: number;
  shoulderLobes: ReadonlyArray<ShoulderLobe>;
  sinusNotches: ReadonlyArray<SinusNotch>;
  dripTipUStart: number;
  dripTipDepth: number;
  /** Expansion (0=primordium, 1=fully expanded). default 1.0. */
  expansionProgress: number;
  /** Senescence (0=fresh, 1=fully aged). default 0. */
  ageFrac: number;
  /** smoothMargin override (potato-leaf). shoulderLobes/sinusNotches 0 강제. */
  smoothMargin: boolean;
  /** ★ S96 — Per-leaflet seed (leaflet마다 다른 lobe/notch perturbation 위해). */
  idSeed: number;
  /** ★ S107 — 좌우 _다른 lobe set_ (자연 비대칭). undefined 시 좌우 동일 (대칭). */
  shoulderLobesRight?: ReadonlyArray<ShoulderLobe>;
  sinusNotchesRight?: ReadonlyArray<SinusNotch>;
}

// ★ S96 — Per-leaflet variation: deterministic signed random ([-1, 1]).
function signedRand(seed: number, salt: number): number {
  const h = (seed * 7919 + salt * 31 + 49297) >>> 0;
  return ((h % 2000) / 1000) - 1;  // [-1, 1]
}

// ★ L9-D V2 S99 — 사용자 핵심 결정 (variation function 단 하나):
//   _전체_ variation 강도를 하나의 multiplier로 통제.
//   0 = 완전 고정 (stereo type), 1 = 과격 (실험), 0.5 = 중간 (default).
//   사용자가 값 조정해서 시각 _중간점_ 찾기.
//
// 적용 영역 7가지 (사용자 명시):
//   Outline 2D:
//     1. lobe depth (깊은 갈라짐 / 뭉툭)
//     2. asymmetry (좌/우 면적)
//     3. dripTip depth (apex 뭉툭 / 뾰족)
//     4. aspectRatio (가로/세로 비율)
//   3D pose:
//     5. roll (좌/우 휘어짐)
//     6. pitch (앞으로 말림)
//   3D curl:
//     7. curl multiplier (말림 강도)
//
// 각 영역의 max range는 _과격_ 기준 (strength=1 시).
// strength=0.5 (default) → 모든 range × 0.5 (중간 자연 variation).
// ★ S100 — VAR_MAX 재조정 + strength=1.0 시작점.
//   이전 (S99) VAR_MAX/strength 너무 작아 시각 X. 사용자 "과격하게 시도 → 조절".
//
//   원칙:
//   - outline (1,2,3,4): _보수_ (마름모/기형 회피)
//   - 3D 회전 (5,6): _크게_ (outline 영향 0, 안전)
//   - curl (7): _크게_ (말림 강도 자연 다양)
// ★ S103 — 사용자 "하나씩만 하자". 다른 variation _모두 0_, 중력만 4 카테고리.
const LEAF_VARIATION_STRENGTH = 0.0;  // 모든 VAR_MAX 비활성

const VAR_MAX = {
  aspect: 0.0, depth: 0.0, asymmetry: 0.0, dripDepth: 0.0,
  rollRad: 0.0, pitchRad: 0.0, curlMult: 0.0,
} as const;

// ★ S104 — 사용자 결정: gravity 처짐은 _잎 길이_에 비례 (cantilever bending).
//   자연 물리: 처짐 ∝ length² (균일 하중 cantilever)
//   - 짧은 intercalary (2-5cm) → 거의 수평 (가벼움)
//   - 중간 primary (10-15cm) → 30-50°
//   - 큰 terminal (20-25cm) → 70-90°
//
//   산식: gravityDeg = (lengthM / 0.25)² × 90  (clamp 0~90)
const GRAVITY_REF_LENGTH_M = 0.25;  // 25cm = 100% reference
const GRAVITY_MAX_DEG = 90;

/**
 * ★ L9-D V2 S107 — Per-leaflet lobe perturbation (좌/우 _다른 set_ 위해 saltBase 분리).
 *
 * 사용자 진단: "너무 규칙적". 자연 lobe는 u/depth/sigma _제각각_ + 좌우 _비대칭_.
 * 호출자가 _left_/_right_ 다른 saltBase 전달 → 좌우 다른 outline.
 *
 * 고정 jitter (strength 무관):
 *   - u ±0.04 (위치 불규칙)
 *   - depth ±25%
 *   - sigma ±15% (폭 제각각)
 */
function perturbLobes<T extends { u: number; depth: number; sigma?: number }>(
  lobes: ReadonlyArray<T>,
  idSeed: number,
  saltBase: number,
  samples: number,
): Array<{ u: number; depth: number; sigma: number }> {
  const minSigma = 1 / samples;
  return lobes.map((lobe, i) => {
    const uShift = signedRand(idSeed, saltBase + i * 7) * 0.04;
    const depthMult = 1 + signedRand(idSeed, saltBase + i * 11 + 3) * 0.25;
    const sigmaMult = 1 + signedRand(idSeed, saltBase + i * 13 + 5) * 0.15;
    return {
      u: Math.max(0.05, Math.min(0.95, lobe.u + uShift)),
      depth: Math.max(0, lobe.depth * depthMult),
      sigma: Math.max(minSigma, (lobe.sigma ?? 0.06) * sigmaMult),
    };
  });
}

export interface ShapeProfileV2Sample {
  u: number;
  halfWidthLeft: number;
  halfWidthRight: number;
}

/**
 * V2 outline profile — Gaussian shoulder bump + sinus notch + drip tip +
 * Expansion/Senescence scaling.
 *
 * ★ Plan v5 §V2 산식 핵심 + maturity-driven scaling.
 */
export function buildShapeProfileV2(input: ShapeProfileV2Input): ShapeProfileV2Sample[] {
  const samples = Math.max(12, input.samples);
  const halfWidthBase = input.lengthM / Math.max(1, input.aspectRatio) / 2;

  // ★ Expansion + Senescence scaling 분리 (Plan v5 보완 #11).
  const expansion = Math.max(0, Math.min(1, input.expansionProgress));
  const ageFrac = Math.max(0, Math.min(1, input.ageFrac));

  // Expansion: young(<0.3)=0.2~0.4, mature(≥0.7)=1.0
  const expansionLobeScale = Math.min(1.0, Math.max(0.2, (expansion - 0.1) / 0.6));
  // Senescence: old도 60%+ 유지 (lobe _사라지는_ X)
  const senescenceLobeScale = Math.max(0.6, 1 - ageFrac * 0.4);
  const finalLobeScale = expansionLobeScale * senescenceLobeScale;

  // smoothMargin (potato-leaf preset): lobe + notch 완전 0 (V1 L8-1 동일 정책).
  const useStructured = !input.smoothMargin;

  // ★ S107 — 좌우 비대칭: 좌/우 _다른 saltBase_로 perturbLobes 두 번 호출.
  //   같은 leaflet이라도 좌/우 outline _제각각_ → 자연 인상.
  //   input.shoulderLobesRight 지정 시 _완전 다른 set_, 미지정 시 같은 lobes를
  //   _다른 salt_로 perturb (좌우 jitter 다름).
  const lobesLeft = input.shoulderLobes;
  const lobesRight = input.shoulderLobesRight ?? input.shoulderLobes;
  const notchesLeft = input.sinusNotches;
  const notchesRight = input.sinusNotchesRight ?? input.sinusNotches;

  const effectiveLobesLeft = useStructured
    ? perturbLobes(lobesLeft, input.idSeed, 101, samples)
    : [];
  const effectiveLobesRight = useStructured
    ? perturbLobes(lobesRight, input.idSeed, 313, samples)  // 다른 saltBase
    : [];
  const effectiveNotchesLeft = useStructured
    ? perturbLobes(notchesLeft, input.idSeed, 211, samples)
    : [];
  const effectiveNotchesRight = useStructured
    ? perturbLobes(notchesRight, input.idSeed, 419, samples)  // 다른 saltBase
    : [];

  const result: ShapeProfileV2Sample[] = [];
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);

    // base ovate + drip tip
    const base = baseWidthV2(u, input.tipSharpness, input.dripTipUStart, input.dripTipDepth);

    // base wedge (heart shape) — V1 동일 산식
    const baseFactor = u < input.baseTransitionEndU
      ? 1 - (1 - input.baseShape) * (1 - u / Math.max(1e-6, input.baseTransitionEndU))
      : 1;

    // ★ S107 — 좌/우 _다른 outline_ (자연 비대칭).
    const outwardLeft = shoulderLobeBumps(u, effectiveLobesLeft) * finalLobeScale;
    const outwardRight = shoulderLobeBumps(u, effectiveLobesRight) * finalLobeScale;
    const inwardLeft = notchDents(u, effectiveNotchesLeft) * finalLobeScale;
    const inwardRight = notchDents(u, effectiveNotchesRight) * finalLobeScale;

    const wLeft = Math.max(0, (base + outwardLeft - inwardLeft) * halfWidthBase * baseFactor);
    const wRight = Math.max(0, (base + outwardRight - inwardRight) * halfWidthBase * baseFactor);

    // asymmetry offset (V1 동일 정책)
    const asymOffset = input.asymmetry * Math.max(wLeft, wRight);
    const halfWidthLeft = Math.max(0, wLeft - asymOffset * 0.5);
    const halfWidthRight = Math.max(0, wRight + asymOffset * 0.5);

    result.push({ u, halfWidthLeft, halfWidthRight });
  }
  return result;
}

// ─── V2 LOD ────────────────────────────────────────────────────────────

// ★ S94 — V2 LOD 강화. 사용자 지적: "엣지 갯수가 다른데 메시 자체가 너무 단조로와".
//   shoulder/notch Gaussian peak이 _부드럽게_ 표현되려면 sample 밀도 ↑ 필요.
//   1차 강화 (samples 67% ↑): 17/24/32 → 28/40/56
//   sigma validation: 1/40 = 0.025, 모든 lobe sigma 0.043~0.045 안전.
const LEAF_MESH_RESOLUTION_V2 = {
  'ultra-low': 28,
  low: 40,
  high: 56,
} as const;

// ─── V2 per-leaflet pipeline ───────────────────────────────────────────

function buildLeafletPatchV2(
  node: import('../../plant/skeleton/PlantSkeletonGraph').SkeletonNode,
  i: number,
  desc: LeafShapeDescriptor,
  ctx: LeafMeshBuildInput,
): LeafMeshPatch | null {
  if (!node.leafletRef) return null;
  const lengthM = node.leafletRef.targetSizeM;
  if (lengthM <= 0) return null;

  const leafletSeed = djb2(node.id) * 0.7919 + i * 31;
  const idSeed = djb2(node.id);

  // ★ L9-D V2 S90 — V2 outline profile.
  const position = node.leafletRef.position as LeafletPosition;
  // per-position profile (V1 applyPositionProfile 재사용)
  const positioned = applyPositionProfile(
    ctx.spec.profileByPosition,
    desc.resolved,
    position,
  );
  const positionedProfile = ctx.spec.profileByPosition[position];

  // V2 samples (LOD V2)
  const samplesV2 = positionedProfile.samplesV2 ?? LEAF_MESH_RESOLUTION_V2[ctx.quality ?? 'low'];

  // jitter (V1 동일 산식)
  const jitterDivisor = 5000 / ctx.spec.poseRules.leafletJitterPercent;
  const aspectJitter = 1 + (((idSeed * 23) % 100 - 50) / jitterDivisor);
  const sharpnessJitter = 1 + (((idSeed * 29) % 100 - 50) / jitterDivisor);

  // ★ S103 — outline variation 모두 비활성 (strength=0).
  //   사용자 "하나씩만 하자" — 중력 4 카테고리만 적용.
  const s = LEAF_VARIATION_STRENGTH;  // 0 → 모든 jitter 0
  const aspectJitterV2 = 1;
  const asymVariation = 0;
  const dripDepthBase = positionedProfile.dripTipDepth ?? 0.6;
  const dripUStartBase = positionedProfile.dripTipUStart ?? 0.85;
  const dripDepthJitter = 1;
  const dripUShift = 0;
  const lengthV2 = lengthM;
  const curlMult = 1;
  void s;  // unused (strength=0)

  // ★ S104 — gravityDroopDeg = (lengthM / 0.25)² × 90 (cantilever bending).
  //   잎 길이에 비례 (자연 물리). 4 랜덤 카테고리 제거.
  const sizeRatio = Math.min(1, lengthM / GRAVITY_REF_LENGTH_M);
  const overrideGravityDroopDeg = sizeRatio * sizeRatio * GRAVITY_MAX_DEG;

  // ★ S105 — lobe depth = 잎 길이 비례 (어린/작은 잎은 얕은 lobe).
  //   산식: max(0.2, min(1.0, lengthM / 0.20)) — 20cm 이상 full depth.
  //   2cm intercalary → 0.20 (거의 매끈), 10cm → 0.50, 20cm+ → 1.00.
  const lobeDepthMult = Math.max(0.2, Math.min(1.0, lengthM / 0.20));
  const scaledShoulderLobes = (positionedProfile.shoulderLobes ?? []).map(lobe => ({
    ...lobe,
    depth: lobe.depth * lobeDepthMult,
  }));
  const scaledSinusNotches = (positionedProfile.sinusNotches ?? []).map(notch => ({
    ...notch,
    depth: notch.depth * lobeDepthMult,
  }));

  const profileV2 = buildShapeProfileV2({
    lengthM: lengthV2,
    aspectRatio: positioned.aspectRatio * aspectJitter * aspectJitterV2,
    tipSharpness: positioned.tipSharpness * sharpnessJitter,  // sharpness는 V1 only
    baseShape: positioned.baseShape,
    asymmetry: positioned.asymmetry + asymVariation,  // ★ S99 영역 2
    samples: samplesV2,
    baseTransitionEndU: ctx.spec.shapeProfileRules.baseTransitionEndU,
    shoulderLobes: scaledShoulderLobes,
    sinusNotches: scaledSinusNotches,
    dripTipUStart: Math.max(0.7, Math.min(0.95, dripUStartBase + dripUShift)),
    dripTipDepth: Math.max(0, dripDepthBase * dripDepthJitter),
    expansionProgress: desc.maturity,
    ageFrac: desc.ageFrac,
    smoothMargin: desc.resolved.smoothMargin === true,
    idSeed,
  });

  // V2 serration 후처리 — V1 serrationNoise 재사용 (micro-serration)
  // shoulder/notch는 _구조_, serration은 _가장자리 톱니_ (성격 다름)
  const noiseLengthM = Math.max(lengthM, 0.02);
  const serrationTaperMin = ctx.spec.shapeProfileRules.serrationTaperMin;
  const serrationEndpointGuardU = ctx.spec.shapeProfileRules.serrationEndpointGuardU;
  const smoothMargin = desc.resolved.smoothMargin === true;
  const lengthSegs = profileV2.length - 1;

  for (let r = 0; r < profileV2.length; r++) {
    const sample = profileV2[r];
    const t = lengthSegs > 0 ? r / lengthSegs : 0;
    // V1 endpoint guard + taper 산식 동일 (in-place 적용)
    const inGuard = t < serrationEndpointGuardU || t > 1 - serrationEndpointGuardU;
    const taper = inGuard ? 0 : Math.max(serrationTaperMin, Math.sin(t * Math.PI));
    const teeth = smoothMargin
      ? 0
      : serrationNoise(sample.u, positioned.serrationAmp * noiseLengthM, positioned.serrationFreq, leafletSeed) * taper;
    sample.halfWidthLeft = Math.max(0, sample.halfWidthLeft + teeth);
    sample.halfWidthRight = Math.max(0, sample.halfWidthRight + teeth);
  }

  // V1 buildLeafletPlaneChunk 재사용 + ★ S95 cols 17 + ★ S103 gravityDroopDeg 4 카테고리.
  const chunk = buildLeafletPlaneChunk(profileV2, {
    lengthM: lengthV2,
    curl: desc.curl * curlMult,
    ageFrac: desc.ageFrac,
    gravityDroopDeg: overrideGravityDroopDeg,  // ★ S103 per-leaflet 4 카테고리 강제
    waviness: 0,
    isTerminal: node.leafletRef.position === 'terminal',
    veinSurfaceStrength: 1,
    seed: djb2(node.id),
    cols: 17,
  });

  // SSOT #186 — L1-B centroid anchor (V1 동일).
  normalizeLeafMeshVertices(chunk.positions);

  // ★ S102 — V1 applyLeafletPose만 (extra pitch/roll 제거).
  //   사용자: "pitch/roll 부착지점 회전은 말이 안 됨".
  const finalQuat = applyLeafletPose(ctx.spec.poseRules, node, idSeed, desc);

  return {
    meshName: `${ctx.meshNamePrefix}_l${i}_${node.leafletRef.position}_v2`,
    chunk,
    position: { x: node.pos.x, y: node.pos.y, z: node.pos.z },
    rotationQuat: finalQuat,
  };
}

/**
 * V2 canonical entry — leaf mesh generation.
 *
 * S85: V1 buildLeafMeshFromSkeleton 단순 위임.
 * S90 (현재): 자체 V2 outline pipeline (buildShapeProfileV2 +
 *   buildLeafletPatchV2). V1 helpers 재사용 (buildLeafShapeDescriptor,
 *   applyLeafletPose, buildLeafletPlaneChunk, serrationNoise).
 */
export function buildLeafMeshFromSkeletonV2(ctx: LeafMeshBuildInput): LeafMeshPatch[] {
  if (!ctx.bladeRef) {
    throw new Error('buildLeafMeshFromSkeletonV2: bladeRef required');
  }
  if (!ctx.leafletSkeletonNodes) {
    throw new Error('buildLeafMeshFromSkeletonV2: leafletSkeletonNodes required');
  }
  if (ctx.leafletSkeletonNodes.length === 0) return [];

  // ★ V2도 V1 buildLeafShapeDescriptor 재사용 — leaf-level params는 동일 정책.
  //   spec.agePresets + applyCorrelation + cultivar override + maturity envelope.
  const descriptor = buildLeafShapeDescriptor(ctx);

  const patches: LeafMeshPatch[] = [];
  for (let i = 0; i < ctx.leafletSkeletonNodes.length; i++) {
    const patch = buildLeafletPatchV2(ctx.leafletSkeletonNodes[i], i, descriptor, ctx);
    if (patch) patches.push(patch);
  }
  return patches;
}

// _newChunk_ import 보존 — 미래 V2 자체 vertex grid 작성 시 사용.
void newChunk;
// _LeafSpec_ import 보존
void (null as unknown as LeafSpec);
