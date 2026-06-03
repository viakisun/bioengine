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
  const effectiveLobes = useStructured ? input.shoulderLobes : [];
  const effectiveNotches = useStructured ? input.sinusNotches : [];

  const result: ShapeProfileV2Sample[] = [];
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);

    // base ovate + drip tip
    const base = baseWidthV2(u, input.tipSharpness, input.dripTipUStart, input.dripTipDepth);

    // Expansion + Senescence scale 적용
    const outward = shoulderLobeBumps(u, effectiveLobes) * finalLobeScale;
    const inward = notchDents(u, effectiveNotches) * finalLobeScale;

    // base wedge (heart shape) — V1 동일 산식
    const baseFactor = u < input.baseTransitionEndU
      ? 1 - (1 - input.baseShape) * (1 - u / Math.max(1e-6, input.baseTransitionEndU))
      : 1;

    // 합산 + clamp (음수 방지)
    const w = Math.max(0, (base + outward - inward) * halfWidthBase * baseFactor);

    // 좌우 비대칭 (V1 동일)
    const asymOffset = input.asymmetry * w;
    const halfWidthLeft = Math.max(0, w - asymOffset * 0.5);
    const halfWidthRight = Math.max(0, w + asymOffset * 0.5);

    result.push({ u, halfWidthLeft, halfWidthRight });
  }
  return result;
}

// ─── V2 LOD ────────────────────────────────────────────────────────────

const LEAF_MESH_RESOLUTION_V2 = {
  'ultra-low': 17,
  low: 24,
  high: 32,
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

  const profileV2 = buildShapeProfileV2({
    lengthM,
    aspectRatio: positioned.aspectRatio * aspectJitter,
    tipSharpness: positioned.tipSharpness * sharpnessJitter,
    baseShape: positioned.baseShape,
    asymmetry: positioned.asymmetry,
    samples: samplesV2,
    baseTransitionEndU: ctx.spec.shapeProfileRules.baseTransitionEndU,
    shoulderLobes: positionedProfile.shoulderLobes ?? [],
    sinusNotches: positionedProfile.sinusNotches ?? [],
    dripTipUStart: positionedProfile.dripTipUStart ?? 0.85,
    dripTipDepth: positionedProfile.dripTipDepth ?? 0.6,
    expansionProgress: desc.maturity,
    ageFrac: desc.ageFrac,
    smoothMargin: desc.resolved.smoothMargin === true,
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

  // V1 buildLeafletPlaneChunk 재사용 (vertex grid + cup/droop/z-twist).
  const chunk = buildLeafletPlaneChunk(profileV2, {
    lengthM,
    curl: desc.curl,
    ageFrac: desc.ageFrac,
    gravityDroopDeg: desc.gravityDroopDeg,
    waviness: 0,
    isTerminal: node.leafletRef.position === 'terminal',
    veinSurfaceStrength: 1,
    seed: djb2(node.id),
  });

  // SSOT #186 — L1-B centroid anchor (V1 동일).
  normalizeLeafMeshVertices(chunk.positions);

  return {
    meshName: `${ctx.meshNamePrefix}_l${i}_${node.leafletRef.position}_v2`,
    chunk,
    position: { x: node.pos.x, y: node.pos.y, z: node.pos.z },
    rotationQuat: applyLeafletPose(ctx.spec.poseRules, node, idSeed, desc),
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
