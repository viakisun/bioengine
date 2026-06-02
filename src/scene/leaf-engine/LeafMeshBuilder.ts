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

import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { buildLeafletMeshes, type LeafletMeshBuildContext } from './buildLeafletMeshes';

export type LeafMeshBuildInput = LeafletMeshBuildContext;

// ─── L3-C S21: lobe + serration noise (inline) ──────────────────────────
// 사용자 botanical reference §5: "큰 갈라짐 + 작은 톱니" 두 layer.
//   lobeNoise(u, amp, seed)       → low frequency / high amplitude (잎 큰 결각)
//   serrationNoise(u, amp, freq, seed) → high frequency / low amplitude (잎 톱니)

/**
 * Lobe noise — 잎 outline에 추가될 큰 갈라짐 (낮은 빈도, 큰 진폭).
 * sin 합성 (deterministic + 가벼움, Perlin 대신 단순 Fourier).
 *
 * @param u 잎 길이 0-1 (base → tip).
 * @param amp lobe 진폭 (잎 폭 대비, ResolvedLeafParams.lobeDepth).
 * @param seed deterministic seed (per leaf instance ID).
 */
export function lobeNoise(u: number, amp: number, seed: number): number {
  const freq1 = 2.0 + (seed % 1.5);    // 2.0-3.5 Hz
  const freq2 = 3.7 + ((seed * 7) % 1.2); // 3.7-4.9 Hz
  const freq3 = 5.1 + ((seed * 13) % 1.0); // 5.1-6.1 Hz

  const phase1 = (seed * 0.7) % (Math.PI * 2);
  const phase2 = (seed * 1.3) % (Math.PI * 2);
  const phase3 = (seed * 2.1) % (Math.PI * 2);

  const v = (
    Math.sin(2 * Math.PI * freq1 * u + phase1) * 0.5 +
    Math.sin(2 * Math.PI * freq2 * u + phase2) * 0.3 +
    Math.sin(2 * Math.PI * freq3 * u + phase3) * 0.2
  );

  // [-1, 1] → [0, amp] (잎 outline은 항상 _바깥쪽으로_ 갈라짐).
  return Math.max(0, v) * amp;
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

/** 5 age presets (botanical reference §7). */
export const AGE_PRESETS = {
  young: {
    leafLengthCmRange: [2, 8],
    majorLeafletPairsRange: [1, 2],
    intercalaryRange: [0, 2],
    aspectRatioRange: [1.2, 1.8],
    serrationAmpRange: [0.005, 0.015],
    lobeDepthRange: [0.03, 0.08],
    poseDroopDegRange: [-15, -5],
    color: 'bright-light-green',
    aspectRatioBaseline: 1.5,
    baseShapeBaseline: 0.92,
    tipSharpnessBaseline: 1.2,
  },
  mature: {
    leafLengthCmRange: [10, 25],
    majorLeafletPairsRange: [2, 4],
    intercalaryRange: [2, 6],
    aspectRatioRange: [1.8, 3.0],
    serrationAmpRange: [0.02, 0.04],
    lobeDepthRange: [0.07, 0.14],
    poseDroopDegRange: [-5, 15],
    color: 'green',
    aspectRatioBaseline: 2.4,
    baseShapeBaseline: 0.85,
    tipSharpnessBaseline: 1.5,
  },
  old: {
    leafLengthCmRange: [14, 28],
    majorLeafletPairsRange: [3, 4],
    intercalaryRange: [3, 8],
    aspectRatioRange: [2.0, 3.5],
    serrationAmpRange: [0.03, 0.06],
    lobeDepthRange: [0.10, 0.20],
    poseDroopDegRange: [15, 35],
    color: 'green-with-yellowing',
    curl: 0.4,
    aspectRatioBaseline: 2.8,
    baseShapeBaseline: 0.80,
    tipSharpnessBaseline: 1.7,
  },
  complex: {
    leafLengthCmRange: [16, 30],
    majorLeafletPairsRange: [4, 4],
    intercalaryRange: [5, 10],
    secondaryRange: [3, 8],
    aspectRatioRange: [2.2, 3.5],
    serrationAmpRange: [0.04, 0.06],
    lobeDepthRange: [0.14, 0.25],
    poseDroopDegRange: [0, 20],
    color: 'green',
    asymmetry: 0.3,
    aspectRatioBaseline: 2.9,
    baseShapeBaseline: 0.75,
    tipSharpnessBaseline: 1.8,
  },
  'potato-leaf': {
    leafLengthCmRange: [12, 28],
    majorLeafletPairsRange: [2, 3],
    intercalaryRange: [0, 1],
    aspectRatioRange: [1.3, 2.2],
    serrationAmpRange: [0.0, 0.01],
    lobeDepthRange: [0.0, 0.03],
    poseDroopDegRange: [-5, 15],
    color: 'green',
    smoothMargin: true,
    leafLengthFactor: 1.2,
    leafletCountFactor: 0.7,
    aspectRatioBaseline: 1.7,
    baseShapeBaseline: 0.95,
    tipSharpnessBaseline: 1.1,
  },
} as const satisfies Record<string, AgePresetParams>;

export type AgePresetKey = keyof typeof AGE_PRESETS;

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

/** Hybrid sampling: baseline + ±jitter (default ±10% of range). */
function sampleHybrid(
  range: readonly [number, number],
  baseline: number,
  seed: number,
  jitterScale = 0.10,
): number {
  const jitterRange = (range[1] - range[0]) * jitterScale;
  const jitterNorm = ((seed * 13) % 200 - 100) / 100;  // [-1, 1]
  const v = baseline + jitterNorm * jitterRange;
  return Math.max(range[0], Math.min(range[1], v));
}

/**
 * Correlation 산식 적용 — complexity seed 0-1을 _묶음 변화_로 변환.
 * 사용자 §8 직접 매핑.
 */
export function applyCorrelation(
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
  const intercalaryCount = Math.floor(lerp(preset.intercalaryRange, c * c) * leafletFactor);
  const secondaryRange = preset.secondaryRange ?? [0, 0];
  const secondaryCount = Math.floor(lerp(secondaryRange, c) * leafletFactor);

  const aspectRatioBaseline = preset.aspectRatioBaseline
    ?? (preset.aspectRatioRange[0] + preset.aspectRatioRange[1]) / 2;
  const aspectRatio = sampleHybrid(preset.aspectRatioRange, aspectRatioBaseline, seed);

  const serrationAmpBaseline = (preset.serrationAmpRange[0] + preset.serrationAmpRange[1]) / 2;
  const serrationAmp = sampleHybrid(preset.serrationAmpRange, serrationAmpBaseline, seed * 7);

  const serrationFreq = Math.floor(10 + c * 18);

  const lobeDepthBaseline = (preset.lobeDepthRange[0] + preset.lobeDepthRange[1]) / 2;
  const lobeDepth = sampleHybrid(preset.lobeDepthRange, lobeDepthBaseline, seed * 11);

  const baseShapeBaseline = preset.baseShapeBaseline ?? 0.85;
  const baseShape = sampleHybrid([0.70, 1.00], baseShapeBaseline, seed * 17);

  const tipSharpnessBaseline = preset.tipSharpnessBaseline ?? 1.5;
  const tipSharpness = sampleHybrid([1.00, 2.00], tipSharpnessBaseline, seed * 19);

  const asymmetry = (preset.asymmetry ?? 0) + 0.02 + c * 0.06;
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

    // baseShape: u가 base 근처(0-0.2)일 때 wedge/heart 변형.
    const baseFactor = u < 0.2 ? 1 - (1 - input.baseShape) * (1 - u / 0.2) : 1;
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
// 산식은 leafletPositionProfile.ts (pure module, Babylon 의존 0, unit test 가능).
export {
  PROFILE_BY_POSITION,
  applyPositionProfile,
} from './leafletPositionProfile';
export type {
  LeafletPosition,
  LeafletShapeProfile,
} from './leafletPositionProfile';

/**
 * ★ Canonical entry for leaf mesh generation (Phase L2-1).
 *
 * 현재 L2-1: thin wrapper — buildLeafletMeshes 위임. Babylon Mesh[] 반환은
 * 기존 동일. L2-3 이후 _GeoChunk 반환_으로 변경 + Babylon Mesh 변환은
 * LeafGenerator로 이행 예정.
 *
 * @param input    Leaflet mesh build context (bladeRef + skeletonNodes +
 *                 leafOrganState + rng + seed + ...).
 * @returns        Babylon Mesh[] (per leaflet, length = skeletonNodes.length).
 *
 * Output contract (REFACTOR-PARITY-01): 동일 input + 동일 seed → 동일 vertex
 * count / index count / bbox / position / normal / uv (tolerance ≤ 1e-6).
 */
export function buildLeafMeshFromSkeleton(input: LeafMeshBuildInput): Mesh[] {
  return buildLeafletMeshes(input);
}
