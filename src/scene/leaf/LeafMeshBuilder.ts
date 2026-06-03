// SSOT — Canonical entry for leaf mesh generation.
// See: docs/architecture/LEAF_MESH_PIPELINE_AUDIT.md
//
// ★ Iter 39 Phase L2-1 (사용자 v3 architectural refactor, Option B):
//
//   "잎이 왜 이렇게 생겼는지, 어느 파일에서 어떤 산식이 영향을 주는지,
//    어떤 값을 바꾸면 어떤 결과가 나오는지 한 번에 추적 가능해야 한다."
//
// 책임 분리 (active 원칙 #39):
//   LeafMeshBuilder = 잎 생김새 결정 (pure mesh algorithm, _이 파일_)
//   LeafGenerator   = Babylon Mesh / Material / Texture wrapper (별도)
//
// L2-1 phase (현재): _thin wrapper_ 시작 — buildLeafletMeshes로 위임.
//   output 100% byte-identical (REFACTOR-PARITY-01).
//   complexity 개선 X, lobe/serration 조정 X, per-position profile X,
//   resolution 증가 X, variation 강화 X.
//
// L2-3+ phase (future): per-position profile / outline quality / variation
//   산식을 _이 파일 안으로_ 점진적 inline. 그때까지 buildLeafletMeshes
//   존재 유지 (history 보존).
//
// L2-1 refactor 후 구조 (사용자 sketch, future):
//   buildLeafMeshFromSkeleton(input)
//     ├─ buildLeafMeshDescriptorFromSkeleton(input)
//     └─ for each leaflet:
//        ├─ buildLeafletOutlineProfile(leaflet)   ← L2-3 entry
//        ├─ buildLeafletOutline(profile)
//        ├─ buildLeafletPlaneChunk(outline)
//        └─ applyLeafletPose(chunk, leaflet.pose)
//     └─ mergeLeafletPatches(patches)

// ★ Iter 39 L3-D~F — pure mesh algorithm SSOT.
//   L3-F (S27): Babylon Mesh/Material/Texture 의존 _0_. 결과는 LeafMeshPatch[]
//   (GeoChunk + meshName + position + rotationQuat — pure data).
//   Babylon Mesh 생성은 LeafGenerator.wrapLeafChunksAsMeshes.

import type { SeededRandom } from '@farmsim/tomato-engine';
import type { GeoChunk } from '@farmsim/tomato-geometry';
import { buildLeafletPlaneChunk } from './LeafletPlaneChunk';

// ─── Pure quaternion math (Babylon 의존 0) ───────────────────────────────

export type Quat4 = { x: number; y: number; z: number; w: number };

/** Quaternion from yaw-pitch-roll (intrinsic Y-X-Z, same as Babylon). */
function quatFromYawPitchRoll(yaw: number, pitch: number, roll: number): Quat4 {
  // Babylon Quaternion.RotationYawPitchRoll uses Y (yaw) * X (pitch) * Z (roll).
  const halfRoll  = roll  * 0.5;
  const halfPitch = pitch * 0.5;
  const halfYaw   = yaw   * 0.5;
  const sinRoll  = Math.sin(halfRoll),  cosRoll  = Math.cos(halfRoll);
  const sinPitch = Math.sin(halfPitch), cosPitch = Math.cos(halfPitch);
  const sinYaw   = Math.sin(halfYaw),   cosYaw   = Math.cos(halfYaw);
  return {
    x: cosYaw * sinPitch * cosRoll + sinYaw * cosPitch * sinRoll,
    y: sinYaw * cosPitch * cosRoll - cosYaw * sinPitch * sinRoll,
    z: cosYaw * cosPitch * sinRoll - sinYaw * sinPitch * cosRoll,
    w: cosYaw * cosPitch * cosRoll + sinYaw * sinPitch * sinRoll,
  };
}

/** Quaternion multiply (a × b). */
function quatMultiply(a: Quat4, b: Quat4): Quat4 {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/**
 * Quaternion → 4×4 rotation Mat4 (translation = 0).
 *
 * ★ L6-B-1a (S56) — per-leaf mesh batching에서 `transformChunk` (tomato-geometry)
 *   재사용 위한 변환. Mat4 column-major layout — Babylon Matrix.m과 동일.
 *
 * 표준 quaternion → rotation matrix 산식. byte-identical to Babylon
 * `Matrix.FromQuaternionToRef`.
 */
export function quatToMat4(q: Quat4): { m: Float32Array } {
  const x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
  const xx = q.x * x2, xy = q.x * y2, xz = q.x * z2;
  const yy = q.y * y2, yz = q.y * z2, zz = q.z * z2;
  const wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
  return {
    m: new Float32Array([
      1 - (yy + zz), xy + wz,       xz - wy,       0,
      xy - wz,       1 - (xx + zz), yz + wx,       0,
      xz + wy,       yz - wx,       1 - (xx + yy), 0,
      0,             0,             0,             1,
    ]),
  };
}
import type {
  SkeletonNode,
  LeafBladeRef,
} from '../../plant/skeleton/PlantSkeletonGraph';
import { makeLeafQuaternion } from '../../plant/skeleton/AnchorTransform';
import { normalizeLeafMeshVertices } from './LeafAnchor';
import type {
  LeafSpec,
  CorrelationRules,
  PoseRules,
  LobeNoiseRules,
} from './LeafSpec';
import {
  applyPositionProfile,
  lobeTaperWeight,
  serrationTaperWeight,
  LEAF_MESH_RESOLUTION,
  DEFAULT_LEAF_MESH_QUALITY,
  type LeafletPosition,
  type LeafMeshQuality,
} from './LeafletProfile';
import type { CultivarShapeOverride } from './index';

type V3 = { x: number; y: number; z: number };

const WORLD_UP: V3 = { x: 0, y: 1, z: 0 };

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

// ─── L3-F: LeafMeshPatch (pure data, Babylon Mesh 분리) ──────────────────
//
// LeafMeshBuilder는 _pure data_ 산출:
//   - chunk: GeoChunk (vertex/index/normal/uv)
//   - meshName: Babylon Mesh 이름 (LeafGenerator가 사용)
//   - position: plant-local
//   - rotationQuat: rotation (Babylon Quaternion이 같은 layout)
//
// LeafGenerator.wrapLeafChunksAsMeshes가 Babylon Mesh로 변환.

export interface LeafMeshPatch {
  /** Babylon Mesh 이름. */
  meshName: string;
  /** Vertex data (positions/normals/uvs/indices). */
  chunk: GeoChunk;
  /** Mesh.position (plant-local). */
  position: { x: number; y: number; z: number };
  /** Mesh.rotationQuaternion (Babylon Quaternion 동일 layout). */
  rotationQuat: Quat4;
}

export interface LeafletMeshBuildContext {
  /** ★ L4-5 (S33) — botanical parameter spec. caller loads via getLeafSpec(name). */
  spec: LeafSpec;
  bladeRef: LeafBladeRef;
  leafletSkeletonNodes: ReadonlyArray<SkeletonNode>;
  leafBladeRootNode: SkeletonNode;
  petioleTipTangent: V3;
  leafOrganState: {
    expansionProgress: number;
    posture: { droopDeg: number; curl: number; gravityDroopDeg?: number };
    senescence: { progress: number; colorDullness: number; curl: number };
    morphology: { serrationDepth: number; lobeDepth: number; petioleLengthM: number };
  };
  rng: SeededRandom;
  seed: number;
  cultivarOverride?: CultivarShapeOverride;
  meshNamePrefix: string;
  /** ★ L2-4b — leaf mesh resolution quality. Default 'low'. */
  quality?: LeafMeshQuality;
  /**
   * ★ L6-A-7 (S52) — per-leaf macro variation state (optional).
   * 산출: `computeLeafMacroState(spec.leafInstanceRules, leafNodeIdx, globalSeed)`.
   * 부재 시 baseline 사용 (curlMultiplier=1.0, opennessOffset=0).
   */
  leafMacro?: LeafMacroState;
}

export type LeafMeshBuildInput = LeafletMeshBuildContext;

// ─── L3-C S21: lobe + serration noise (inline) ──────────────────────────
// 사용자 botanical reference §5: "큰 갈라짐 + 작은 톱니" 두 layer.
//   lobeNoise(u, amp, seed)       → low frequency / high amplitude (잎 큰 결각)
//   serrationNoise(u, amp, freq, seed) → high frequency / low amplitude (잎 톱니)

/**
 * Lobe noise — 잎 outline에 추가될 큰 갈라짐 (낮은 빈도, 큰 진폭).
 * sin 합성 (deterministic + 가벼움, Perlin 대신 단순 Fourier).
 *
 * ★ L5-3 (S40) — rules.waves에서 frequency/phase/weight 주입. 산식 동일.
 *   For wave w: freq = w.baseFrequency + (seed * w.seedMultiplier) % w.seedFrequencyMod
 *               phase = (seed * w.phaseMultiplier) % (2π)
 *               out += sin(2π * freq * u + phase) * w.weight
 *   rules.positiveOnly → max(0, sum).
 *
 * @param rules spec.lobeNoiseRules (botanical parameter).
 * @param u    잎 길이 0-1 (base → tip).
 * @param amp  lobe 진폭 (잎 폭 대비, ResolvedLeafParams.lobeDepth).
 * @param seed deterministic seed (per leaf instance ID).
 */
export function lobeNoise(
  rules: LobeNoiseRules,
  u: number,
  amp: number,
  seed: number,
): number {
  let v = 0;
  for (const wave of rules.waves) {
    const freq = wave.baseFrequency + ((seed * wave.seedMultiplier) % wave.seedFrequencyMod);
    const phase = (seed * wave.phaseMultiplier) % (Math.PI * 2);
    v += Math.sin(2 * Math.PI * freq * u + phase) * wave.weight;
  }
  return (rules.positiveOnly ? Math.max(0, v) : v) * amp;
}

// ─── L5-4 (S41) — Leaf-instance macro variation (분해) ─────────────────────
//
// L4 후 _부분 dead_ 발견 (audit Section 3):
//   - 6 fields 중 leftRightImbalance 1개만 live (skeleton size factor 영향)
//   - spacingBias는 `void` (사용 안 함)
//   - rachisCurvature/leafDroopDeg/opennessFactor/overallTwist 완전 dead
//
// L5-4: function 분해 — `computeLeafInstanceProfile` 폐기, 단일 책임 함수로
// 대체. spec.leafInstanceRules 주입.
//
// Formula (이전과 byte-identical):
//   seed = (globalSeed * 1009 + leafNodeIdx * 31) >>> 0
//   h(i) = ((seed * (i * 7919 + 1) + 49297) % 1000) / 1000
//   signed(i) = h(i) * 2 - 1
//   apexBoost = nodePositionT > rules.apexImbalanceThreshold ? rules.apexImbalanceBoost : 1.0
//   leftRightImbalance = signed(3) * rules.leftRightImbalanceRange * apexBoost
//
// `computeLeafletPose` (deg-based) — _완전 dead_ (호출처 0), 제거.

import type { LeafInstanceRules } from './LeafSpec';

/**
 * Compute leaf-level left/right imbalance (skeleton size factor 영향).
 * Deterministic: leafNodeIdx + globalSeed 기반.
 */
export function computeLeftRightImbalance(
  rules: LeafInstanceRules,
  leafNodeIdx: number,
  nodePositionT: number,
  globalSeed: number,
): number {
  const seed = (globalSeed * 1009 + leafNodeIdx * 31) >>> 0;
  const h = (i: number): number => ((seed * (i * 7919 + 1) + 49297) % 1000) / 1000;
  const signed = (i: number): number => h(i) * 2 - 1;
  const apexBoost = nodePositionT > rules.apexImbalanceThreshold
    ? rules.apexImbalanceBoost
    : 1.0;
  return signed(3) * rules.leftRightImbalanceRange * apexBoost;
}

/**
 * Per-leaf macro variation state (curl multiplier / openness offset /
 * rachis curvature bias). Deterministic per leaf.
 *
 * ★ L6-A-6 (S51) — Step 1: 산출만, mesh path _미연결_.
 * ★ L6-A-7 (S52) — Step 2: buildLeafShapeDescriptor 주입 예정.
 *
 * 산식 (signed 의 hash index는 leftRightImbalance와 _겹치지 않도록_ 8/9/10):
 *   curlMultiplier      = baseline + signed(8) * range
 *   opennessOffset      = baseline + signed(9) * range
 *   rachisCurvatureBias = baseline + signed(10) * range
 */
export interface LeafMacroState {
  curlMultiplier: number;
  opennessOffset: number;
  rachisCurvatureBias: number;
}

export function computeLeafMacroState(
  rules: LeafInstanceRules,
  leafNodeIdx: number,
  globalSeed: number,
): LeafMacroState {
  const seed = (globalSeed * 1009 + leafNodeIdx * 31) >>> 0;
  const h = (i: number): number => ((seed * (i * 7919 + 1) + 49297) % 1000) / 1000;
  const signed = (i: number): number => h(i) * 2 - 1;
  return {
    curlMultiplier:      rules.curlMultiplier.baseline      + signed(8)  * rules.curlMultiplier.range,
    opennessOffset:      rules.opennessOffset.baseline      + signed(9)  * rules.opennessOffset.range,
    rachisCurvatureBias: rules.rachisCurvatureBias.baseline + signed(10) * rules.rachisCurvatureBias.range,
  };
}

// ─── L3-C S23: agePresets + correlationRules (inline) ───────────────────
// 사용자 botanical reference §7-8: 5 age presets + complexity 묶음 산식.

export interface AgePresetParams {
  leafLengthCmRange: readonly [number, number];
  majorLeafletPairsRange: readonly [number, number];
  intercalaryRange: readonly [number, number];
  secondaryRange?: readonly [number, number];
  aspectRatioRange: readonly [number, number];
  serrationAmpRange: readonly [number, number];
  lobeDepthRange: readonly [number, number];
  poseDroopDegRange: readonly [number, number];
  color: 'bright-light-green' | 'green' | 'green-with-yellowing';
  curl?: number;
  asymmetry?: number;
  smoothMargin?: boolean;
  leafLengthFactor?: number;
  leafletCountFactor?: number;
  aspectRatioBaseline?: number;
  baseShapeBaseline?: number;
  tipSharpnessBaseline?: number;
}

// ★ L5-7 (S44) — AGE_PRESETS 상수 + AgePresetKey type 제거.
//   tomato.json의 agePresets와 100% 중복이었음. engine은 ctx.spec.agePresets 사용.
//   AgePresetParams interface는 type 정의로 유지 (LeafSpec inference 의존).

export interface ResolvedLeafParams {
  leafLengthM: number;
  primaryPairs: number;
  intercalaryCount: number;
  secondaryCount: number;
  aspectRatio: number;
  serrationAmp: number;
  serrationFreq: number;
  lobeDepth: number;
  asymmetry: number;
  poseDroopDeg: number;
  color: AgePresetParams['color'];
  curl?: number;
  smoothMargin?: boolean;
  baseShape: number;
  tipSharpness: number;
}

/** Linear lerp helper. */
function lerp(range: readonly [number, number], t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return range[0] + (range[1] - range[0]) * clamped;
}

/** Hybrid sampling: baseline + ±jitter (jitterScale from spec.correlationRules). */
function sampleHybrid(
  range: readonly [number, number],
  baseline: number,
  seed: number,
  jitterScale: number,
): number {
  const jitterRange = (range[1] - range[0]) * jitterScale;
  const jitterNorm = ((seed * 13) % 200 - 100) / 100;  // [-1, 1]
  const v = baseline + jitterNorm * jitterRange;
  return Math.max(range[0], Math.min(range[1], v));
}

/**
 * Correlation 산식 적용 — complexity seed 0-1을 _묶음 변화_로 변환.
 * 사용자 §8 매핑. ★ L4-5 (S33) — coefficients from spec.correlationRules.
 */
export function applyCorrelation(
  rules: CorrelationRules,
  complexity: number,
  preset: AgePresetParams,
  seed = 0,
): ResolvedLeafParams {
  const c = Math.max(0, Math.min(1, complexity));

  const leafLengthCm = lerp(preset.leafLengthCmRange, c);
  const factor = preset.leafLengthFactor ?? 1.0;
  const leafLengthM = (leafLengthCm * factor) / 100;

  const leafletFactor = preset.leafletCountFactor ?? 1.0;
  const primaryPairs = Math.floor(lerp(preset.majorLeafletPairsRange, c) * leafletFactor);
  const intercalaryCount = Math.floor(
    lerp(preset.intercalaryRange, Math.pow(c, rules.intercalaryComplexityExponent)) * leafletFactor,
  );
  const secondaryRange = preset.secondaryRange ?? [0, 0];
  const secondaryCount = Math.floor(lerp(secondaryRange, c) * leafletFactor);

  const jitterScale = rules.correlationJitterScale;

  const aspectRatioBaseline = preset.aspectRatioBaseline
    ?? (preset.aspectRatioRange[0] + preset.aspectRatioRange[1]) / 2;
  const aspectRatio = sampleHybrid(preset.aspectRatioRange, aspectRatioBaseline, seed, jitterScale);

  const serrationAmpBaseline = (preset.serrationAmpRange[0] + preset.serrationAmpRange[1]) / 2;
  const serrationAmp = sampleHybrid(preset.serrationAmpRange, serrationAmpBaseline, seed * 7, jitterScale);

  const serrationFreq = Math.floor(rules.serrationFreqBase + c * rules.serrationFreqSlope);

  const lobeDepthBaseline = (preset.lobeDepthRange[0] + preset.lobeDepthRange[1]) / 2;
  const lobeDepth = sampleHybrid(preset.lobeDepthRange, lobeDepthBaseline, seed * 11, jitterScale);

  const baseShapeBaseline = preset.baseShapeBaseline ?? 0.85;
  const baseShape = sampleHybrid([0.70, 1.00], baseShapeBaseline, seed * 17, jitterScale);

  const tipSharpnessBaseline = preset.tipSharpnessBaseline ?? 1.5;
  const tipSharpness = sampleHybrid([1.00, 2.00], tipSharpnessBaseline, seed * 19, jitterScale);

  const asymmetry = (preset.asymmetry ?? 0) + rules.asymmetryBase + c * rules.asymmetrySlope;
  const poseDroopDeg = lerp(preset.poseDroopDegRange, c);

  return {
    leafLengthM,
    primaryPairs: Math.max(1, primaryPairs),
    intercalaryCount: Math.max(0, intercalaryCount),
    secondaryCount: Math.max(0, secondaryCount),
    aspectRatio,
    serrationAmp,
    serrationFreq,
    lobeDepth,
    asymmetry,
    poseDroopDeg,
    color: preset.color,
    curl: preset.curl,
    smoothMargin: preset.smoothMargin,
    baseShape,
    tipSharpness,
  };
}

// ─── L3-C S22: shapeProfile (inline) ────────────────────────────────────
// 소엽 outline 생성 산식 (botanical reference §5):
//   baseWidth(u) = sin(πu)^shapePower (0~1, tip sharpness 결정)
//   halfWidth ± asymmetryOffset (좌우 비대칭)

export interface ShapeProfileInput {
  lengthM: number;
  aspectRatio: number;
  tipSharpness: number;
  baseShape: number;
  asymmetry: number;
  samples?: number;
  /** ★ L5-6a (S42) — base wedge transition end (was hardcoded 0.2). */
  baseTransitionEndU: number;
}

export interface ShapeProfileSample {
  u: number;
  halfWidthLeft: number;
  halfWidthRight: number;
}

/** Base half-width — sin(π × u)^shapePower (0 at endpoints, 1 at mid). */
function baseWidth(u: number, shapePower: number): number {
  const s = Math.sin(Math.PI * u);
  return Math.pow(Math.max(0, s), shapePower);
}

/**
 * 소엽 outline 생성 — base shape만 (lobe + serration은 callsite에서 추가).
 * 사용자 §5 산식 구현.
 */
export function buildShapeProfile(input: ShapeProfileInput): ShapeProfileSample[] {
  const samples = input.samples ?? 16;
  const widthM = input.lengthM / Math.max(1, input.aspectRatio);
  const halfWidthBase = widthM / 2;
  const shapePower = input.tipSharpness;

  const result: ShapeProfileSample[] = [];
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const w = baseWidth(u, shapePower) * halfWidthBase;

    // baseShape: u가 base 근처(0~baseTransitionEndU)일 때 wedge/heart 변형.
    // ★ L5-6a (S42) — baseTransitionEndU from spec.shapeProfileRules.
    const baseFactor = u < input.baseTransitionEndU
      ? 1 - (1 - input.baseShape) * (1 - u / input.baseTransitionEndU)
      : 1;
    const w2 = w * baseFactor;

    // 좌우 비대칭.
    const asymmetryOffset = input.asymmetry * w2;
    const halfWidthLeft = Math.max(0, w2 - asymmetryOffset * 0.5);
    const halfWidthRight = Math.max(0, w2 + asymmetryOffset * 0.5);

    result.push({ u, halfWidthLeft, halfWidthRight });
  }
  return result;
}

/**
 * Triangle wave — period 1 단위로 톱니 형성. 결과 [0, 1].
 */
function triangleWave(x: number): number {
  const f = x - Math.floor(x);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

/**
 * Serration noise — 잎 outline에 추가될 작은 톱니 (높은 빈도, 작은 진폭).
 *
 * @param u 잎 길이 0-1.
 * @param amp 톱니 진폭 (잎 폭 대비, ResolvedLeafParams.serrationAmp).
 * @param freq 톱니 빈도 (한쪽당 10-28).
 * @param seed deterministic seed.
 */
export function serrationNoise(u: number, amp: number, freq: number, seed: number): number {
  if (amp <= 0 || freq <= 0) return 0;
  const phase = (seed * 0.5) % 1.0;
  const t = triangleWave(u * freq + phase);
  return t * amp;
}

// ─── L2-3: Per-Leaflet Position Profile re-export ──────────────────────────
// 산식은 LeafletProfile.ts (pure module, Babylon 의존 0, unit test 가능).
export {
  PROFILE_BY_POSITION,
  applyPositionProfile,
} from './LeafletProfile';
export type {
  LeafletPosition,
  LeafletShapeProfile,
} from './LeafletProfile';

// ─── L3-E (S26) — 사용자 v3 sketch 함수 분해 ────────────────────────────
// monolithic for-loop를 단일 책임 함수로 분해.

/** Leaf-level descriptor — resolved params + maturity envelope. */
interface LeafShapeDescriptor {
  resolved: ResolvedLeafParams;
  ageFrac: number;
  curl: number;
  gravityDroopDeg: number;
  maturity: number;
  opennessFactor: number;
  foldDroopDeg: number;
  qualitySamples: number;
}

/**
 * Step 1: leaf-level descriptor 산출.
 * spec.agePresets + applyCorrelation + cultivar override + maturity envelope.
 * ★ L4-5 (S33) — spec.agePresets / correlationRules / poseRules 주입.
 */
function buildLeafShapeDescriptor(ctx: LeafMeshBuildInput): LeafShapeDescriptor {
  const preset = ctx.spec.agePresets[ctx.bladeRef.agePreset] as AgePresetParams;
  const resolved = applyCorrelation(
    ctx.spec.correlationRules,
    ctx.bladeRef.complexity,
    preset,
    ctx.seed,
  );

  // Cultivar shape override (Iter 38 S4).
  // ★ L5-6a (S42) — clamp bounds from spec.shapeProfileRules.{baseShapeClamp, tipSharpnessClamp}.
  if (ctx.cultivarOverride) {
    const o = ctx.cultivarOverride;
    const baseClamp = ctx.spec.shapeProfileRules.baseShapeClamp;
    const tipClamp = ctx.spec.shapeProfileRules.tipSharpnessClamp;
    if (o.aspectRatioMultiplier != null) resolved.aspectRatio *= o.aspectRatioMultiplier;
    if (o.baseShapeBias != null) {
      resolved.baseShape = Math.max(baseClamp[0], Math.min(baseClamp[1], resolved.baseShape + o.baseShapeBias));
    }
    if (o.tipSharpnessMultiplier != null) {
      resolved.tipSharpness = Math.max(
        tipClamp[0], Math.min(tipClamp[1], resolved.tipSharpness * o.tipSharpnessMultiplier),
      );
    }
  }

  const ageFrac = Math.min(1, ctx.leafOrganState.senescence.progress);
  // ★ L5-6a (S42) — senescence curl weight from spec.
  // ★ L6-A-7 (S52) — per-leaf macro curlMultiplier 주입 (baseline=1.0).
  const curlMultiplier = ctx.leafMacro?.curlMultiplier ?? 1.0;
  const curl = (
    ctx.leafOrganState.posture.curl
    + ctx.leafOrganState.senescence.curl * ctx.spec.shapeProfileRules.senescenceCurlWeight
  ) * curlMultiplier;
  const gravityDroopDeg = ctx.leafOrganState.posture.gravityDroopDeg ?? 0;
  const maturity = Math.max(0, Math.min(1, ctx.leafOrganState.expansionProgress));
  // ★ L5-6b (S43) — Phase F5 maturity-driven pose envelope from spec.shapeProfileRules.
  const envStart = ctx.spec.shapeProfileRules.maturityEnvelopeStart;
  const envEnd = ctx.spec.shapeProfileRules.maturityEnvelopeEnd;
  const oMin = ctx.spec.shapeProfileRules.opennessBaseMin;
  const oMax = ctx.spec.shapeProfileRules.opennessBaseMax;
  const t = Math.max(0, Math.min(1, (maturity - envStart) / (envEnd - envStart)));
  // ★ L6-A-7 (S52) — per-leaf macro opennessOffset 주입 (baseline=0).
  //   결과를 [oMin, oMax] 안에 clamp — overshoot 방지.
  const opennessOffset = ctx.leafMacro?.opennessOffset ?? 0;
  const opennessRaw = oMin + (oMax - oMin) * (t * t * (3 - 2 * t)) + opennessOffset;  // smoothstep + offset
  const opennessFactor = Math.max(oMin, Math.min(oMax, opennessRaw));
  // L0-D-1 per-leaflet pitch — spec.poseRules.foldDroopDeg{Base,Slope}.
  const foldDroopDeg =
    ctx.spec.poseRules.foldDroopDegBase + ctx.spec.poseRules.foldDroopDegSlope * maturity;
  // L2-4b quality.
  const qualityRes = LEAF_MESH_RESOLUTION[ctx.quality ?? DEFAULT_LEAF_MESH_QUALITY];

  return {
    resolved,
    ageFrac,
    curl,
    gravityDroopDeg,
    maturity,
    opennessFactor,
    foldDroopDeg,
    qualitySamples: qualityRes.shapeProfileSamples,
  };
}

/**
 * Step 2: per-leaflet outline profile (halfWidth + lobe + serration with cap taper).
 * L2-3 position profile + L2-4a endpoint taper 통합.
 */
function buildLeafletOutlineWithNoise(
  spec: LeafSpec,
  node: SkeletonNode,
  leafletSeed: number,
  idSeed: number,
  desc: LeafShapeDescriptor,
): ReturnType<typeof buildShapeProfile> {
  const lengthM = node.leafletRef!.targetSizeM;
  // ★ L4-5 (S33) — per-leaflet shape jitter (±jitterPercent/100 from spec.poseRules).
  //   원본 산식: ((seed*N) % 100 - 50) / 1000 = ±0.05 = ±5%.
  //   일반화: numerator max abs = 50, divisor = 5000 / jitterPercent → ±(jitterPercent/100).
  //   jitterPercent=5 → divisor=1000 → byte-identical.
  const jitterDivisor = 5000 / spec.poseRules.leafletJitterPercent;
  const aspectJitter    = 1 + (((idSeed * 23) % 100 - 50) / jitterDivisor);
  const sharpnessJitter = 1 + (((idSeed * 29) % 100 - 50) / jitterDivisor);
  // L2-3 per-position profile — spec.profileByPosition 주입.
  const positioned = applyPositionProfile(
    spec.profileByPosition,
    desc.resolved,
    node.leafletRef!.position as LeafletPosition,
  );

  const profile = buildShapeProfile({
    lengthM,
    aspectRatio:  positioned.aspectRatio  * aspectJitter,
    tipSharpness: positioned.tipSharpness * sharpnessJitter,
    baseShape:    positioned.baseShape,
    asymmetry:    positioned.asymmetry,
    samples:      desc.qualitySamples,
    baseTransitionEndU: spec.shapeProfileRules.baseTransitionEndU,
  });

  // G3 noise scale cap (작은 leaflet broken mesh shard 방지).
  const noiseLengthM = Math.max(lengthM, 0.02);
  // L2-4a cap topology — endpoint taper.
  // ★ L6-A-1 (S46) — lobe와 serration의 taper 정책 분리:
  //   - lobe: full sin(πt) — 큰 결각은 끝에서 사라짐 (자연스러움)
  //   - serration: max(serrationTaperMin, sin(πt)) — 끝에서도 톱니 일부 보존
  // ★ L8-1 (S69) — smoothMargin override 실 적용 (사용자 보완 #7):
  //   potato-leaf preset (smooth-margin tomato cultivar) — lobe + serration 0 강제.
  //   tomato.json agePresets.potato-leaf.smoothMargin: true → 매끈한 leaflet.
  const smoothMargin = desc.resolved.smoothMargin === true;
  const lengthSegs = profile.length - 1;
  const serrationTaperMin = spec.shapeProfileRules.serrationTaperMin;
  for (let r = 0; r < profile.length; r++) {
    const sample = profile[r];
    const t = lengthSegs > 0 ? r / lengthSegs : 0;
    const lobeTaper = lobeTaperWeight(t);
    const serrationTaper = serrationTaperWeight(t, serrationTaperMin);
    const lobe = smoothMargin
      ? 0
      : lobeNoise(spec.lobeNoiseRules, sample.u, positioned.lobeDepth * noiseLengthM, leafletSeed) * lobeTaper;
    const teeth = smoothMargin
      ? 0
      : serrationNoise(
        sample.u, positioned.serrationAmp * noiseLengthM, positioned.serrationFreq, leafletSeed,
      ) * serrationTaper;
    // ★ L5-6b (S43) — edge asymmetry weights from spec.edgeAsymmetryRules.
    const ea = spec.edgeAsymmetryRules;
    sample.halfWidthLeft += lobe * ea.leftLobeWeight + teeth * ea.leftSerrationWeight;
    sample.halfWidthRight += lobe * ea.rightLobeWeight + teeth * ea.rightSerrationWeight;
  }
  return profile;
}

/**
 * Step 3: leaflet pose composition — pure rotation Quat4.
 * F5 maturity envelope + L0-D-1 pitch + per-leaflet noise.
 */
function applyLeafletPose(
  poseRules: PoseRules,
  node: SkeletonNode,
  idSeed: number,
  desc: LeafShapeDescriptor,
): Quat4 {
  const bd = node.leafletRef!.bladeDir;
  const baseQ = makeLeafQuaternion(bd, WORLD_UP);  // Quat4
  // ★ L4-5 (S33) — pitch/roll/twist noise from spec.poseRules (default 0.1/0.2/0.15 rad).
  //   원본 산식: (... % 200 - 100) / 1000 = ±0.1 rad. 일반화:
  //   numerator max abs = (range×10×100/2) when modular = 2×100×range, divisor = 1000 / range.
  //   pitchNoiseRange=0.1 → divisor=10000 → numerator (% 200 - 100) → ±0.01. WRONG.
  //   재정렬: original `% 200 - 100` gives [-100, 99] / 1000 = [-0.1, 0.099].
  //   want = ±range. divisor = 100 / range (because max abs num 100).
  //   pitchNoiseRange=0.1 → divisor = 1000 → ✓ byte-identical.
  const pitchDivisor = 100 / poseRules.pitchNoiseRangeRad;
  const rollDivisor  = 200 / poseRules.rollNoiseRangeRad;   // num: % 400 - 200 → max 200 → div 200/range
  const twistDivisor = 150 / poseRules.twistNoiseRangeRad;  // num: % 300 - 150 → max 150 → div 150/range
  const pitchNoise = (((idSeed * 17) % 200 - 100) / pitchDivisor);
  const rollNoise  = (((idSeed * 19) % 400 - 200) / rollDivisor);
  const twistNoise = (((idSeed * 13) % 300 - 150) / twistDivisor);
  const pitchRad = (desc.foldDroopDeg * Math.PI / 180 + pitchNoise) * desc.opennessFactor;
  const rollRad  = rollNoise  * desc.opennessFactor;
  const twistRad = twistNoise * desc.opennessFactor;
  const localQ = quatFromYawPitchRoll(twistRad, pitchRad, rollRad);
  return quatMultiply(baseQ, localQ);
}

/**
 * Step 4: per-leaflet patch — pure data (GeoChunk + meshName + position + rotation).
 * Babylon Mesh 생성은 LeafGenerator.wrapLeafChunksAsMeshes에서.
 */
function buildLeafletPatch(
  node: SkeletonNode,
  i: number,
  desc: LeafShapeDescriptor,
  ctx: LeafMeshBuildInput,
): LeafMeshPatch | null {
  if (!node.leafletRef) return null;
  const lengthM = node.leafletRef.targetSizeM;
  if (lengthM <= 0) return null;

  const leafletSeed = djb2(node.id) * 0.7919 + i * 31;
  const idSeed = djb2(node.id);

  // outline (profile + lobe + serration with taper) — spec.profileByPosition/poseRules 주입.
  const profile = buildLeafletOutlineWithNoise(ctx.spec, node, leafletSeed, idSeed, desc);

  // Plane geometry chunk (mesh-local).
  const chunk = buildLeafletPlaneChunk(profile, {
    lengthM,
    curl: desc.curl,
    ageFrac: desc.ageFrac,
    gravityDroopDeg: desc.gravityDroopDeg,
    waviness: 0,
    isTerminal: node.leafletRef.position === 'terminal',
    veinSurfaceStrength: 1,
    seed: djb2(node.id),
  });

  // SSOT #186 — L1-B centroid anchor.
  normalizeLeafMeshVertices(chunk.positions);

  return {
    meshName: `${ctx.meshNamePrefix}_l${i}_${node.leafletRef.position}`,
    chunk,
    position: { x: node.pos.x, y: node.pos.y, z: node.pos.z },
    rotationQuat: applyLeafletPose(ctx.spec.poseRules, node, idSeed, desc),
  };
}

/**
 * ★ Canonical entry for leaf mesh generation (Phase L3-E 함수 분해).
 *
 *   buildLeafMeshFromSkeleton(input)
 *     ├─ buildLeafShapeDescriptor(input)              ← leaf-level params
 *     └─ for each leaflet:
 *        └─ buildLeafletPatch(node, i, desc, ctx)     ← per-leaflet mesh
 *           ├─ buildLeafletOutlineWithNoise(...)
 *           ├─ buildLeafletPlaneChunk(...)
 *           ├─ normalizeLeafMeshVertices(...)
 *           └─ applyLeafletPose(mesh, ...)
 *
 * Output contract (REFACTOR-PARITY-01): 동일 input + seed → 동일 vertex
 * count / position / bbox / index.
 */
export function buildLeafMeshFromSkeleton(ctx: LeafMeshBuildInput): LeafMeshPatch[] {
  if (!ctx.bladeRef) {
    throw new Error('buildLeafMeshFromSkeleton: bladeRef required (mandatory contract)');
  }
  if (!ctx.leafletSkeletonNodes) {
    throw new Error('buildLeafMeshFromSkeleton: leafletSkeletonNodes required (mandatory contract)');
  }
  if (ctx.leafletSkeletonNodes.length === 0) return [];

  const descriptor = buildLeafShapeDescriptor(ctx);

  const patches: LeafMeshPatch[] = [];
  for (let i = 0; i < ctx.leafletSkeletonNodes.length; i++) {
    const patch = buildLeafletPatch(ctx.leafletSkeletonNodes[i], i, descriptor, ctx);
    if (patch) patches.push(patch);
  }
  return patches;
}
