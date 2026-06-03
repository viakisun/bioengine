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

// ★ S111 — Control point polyline (사진에서 _직접 추출_한 (u, halfWidth) 점들).
// Gaussian 산식 대안 — 뾰족 삼각형 lobe + 깊은 V-notch _진짜_ 자연 잎 모방.
//   u: rachis 따라 0=base, 1=tip.
//   halfWidth: halfWidthBase 비율 (0=중심선까지 닿음, 1=full half-width).
export interface ControlPoint {
  u: number;
  halfWidth: number;
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
  /**
   * ★ S111 — Control point polyline (사진 추출). 지정 시 Gaussian _완전 대체_.
   *   shoulderLobes/sinusNotches/dripTip* 모두 _무시_, polyline 선형보간으로 outline 생성.
   */
  controlPoints?: ReadonlyArray<ControlPoint>;
  controlPointsRight?: ReadonlyArray<ControlPoint>;
}

// ★ S111 — Control point polyline 선형 보간.
function interpolateHalfWidthRatio(u: number, points: ReadonlyArray<ControlPoint>): number {
  if (points.length === 0) return 0;
  if (u <= points[0].u) return points[0].halfWidth;
  if (u >= points[points.length - 1].u) return points[points.length - 1].halfWidth;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (u >= a.u && u <= b.u) {
      const t = (u - a.u) / Math.max(1e-9, b.u - a.u);
      return a.halfWidth + (b.halfWidth - a.halfWidth) * t;
    }
  }
  return 0;
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

// ★ S104 — gravity = (lengthM / 0.25)² × 90 (cantilever bending).
const GRAVITY_REF_LENGTH_M = 0.25;
const GRAVITY_MAX_DEG = 90;

// ★ S108 — 자연 토마토 잎 사진에서 추출한 10개 outline sample.
//   각 sample = 한 자연 leaflet의 _고정_ shape parameters.
//   idSeed % 10으로 선택 → 10 종류 outline이 자연스럽게 섞임.
//   다양성: lobe 개수/위치/깊이/asymmetry/dripTip 모두 _제각각_.
//   S110: debug panel 시각화용으로 export.
export interface NaturalLeafletSample {
  aspectRatio: number;
  tipSharpness: number;
  shoulderLobes: ShoulderLobe[];
  sinusNotches: SinusNotch[];
  shoulderLobesRight?: ShoulderLobe[];   // 좌우 비대칭 sample 용
  sinusNotchesRight?: SinusNotch[];
  dripTipUStart: number;
  dripTipDepth: number;
  /** ★ S111 — 사진 추출 control point polyline. 지정 시 Gaussian 무시. */
  controlPoints?: ControlPoint[];
  controlPointsRight?: ControlPoint[];
}

export const NATURAL_LEAFLET_SAMPLES: ReadonlyArray<NaturalLeafletSample> = [
  // 0. Terminal elaborate — 큰 terminal leaflet, 4 sharp lobes 좌우 균등 (이미지 1 right-top)
  {
    aspectRatio: 2.2, tipSharpness: 1.05,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.88, dripTipDepth: 0.35,
    controlPoints: [
      { u: 0.00, halfWidth: 0.05 },  // 좁은 base (petiolule 부착)
      { u: 0.06, halfWidth: 0.35 },
      { u: 0.13, halfWidth: 0.85 },  // 1st lobe peak
      { u: 0.20, halfWidth: 0.40 },  // 1st notch (deep)
      { u: 0.30, halfWidth: 0.95 },  // 2nd lobe peak (largest)
      { u: 0.38, halfWidth: 0.45 },  // 2nd notch
      { u: 0.48, halfWidth: 0.90 },  // 3rd lobe
      { u: 0.56, halfWidth: 0.50 },  // 3rd notch
      { u: 0.66, halfWidth: 0.75 },  // 4th lobe (smaller)
      { u: 0.76, halfWidth: 0.40 },  // 4th notch
      { u: 0.85, halfWidth: 0.45 },  // pre-tip widening
      { u: 0.94, halfWidth: 0.20 },  // acuminate taper
      { u: 1.00, halfWidth: 0.00 },  // sharp tip
    ],
  },
  // 1. Primary broad — 넓은 primary leaflet, 3 broad lobes (이미지 1 lower-left)
  {
    aspectRatio: 1.8, tipSharpness: 1.10,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.85, dripTipDepth: 0.30,
    controlPoints: [
      { u: 0.00, halfWidth: 0.08 },
      { u: 0.08, halfWidth: 0.50 },
      { u: 0.16, halfWidth: 0.90 },
      { u: 0.26, halfWidth: 0.55 },
      { u: 0.38, halfWidth: 1.00 },  // 가장 큰 lobe
      { u: 0.50, halfWidth: 0.55 },
      { u: 0.62, halfWidth: 0.85 },
      { u: 0.74, halfWidth: 0.45 },
      { u: 0.84, halfWidth: 0.40 },
      { u: 0.93, halfWidth: 0.20 },
      { u: 1.00, halfWidth: 0.00 },
    ],
  },
  // 2. Sub-lobed (이미지 4 bottom-right) — 매우 깊게 갈라진 lobe, 거의 midrib까지
  {
    aspectRatio: 2.0, tipSharpness: 1.05,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.90, dripTipDepth: 0.30,
    controlPoints: [
      { u: 0.00, halfWidth: 0.06 },
      { u: 0.05, halfWidth: 0.30 },
      { u: 0.11, halfWidth: 0.85 },  // sub-leaflet 1
      { u: 0.17, halfWidth: 0.20 },  // 매우 깊은 cleavage
      { u: 0.24, halfWidth: 0.95 },  // sub-leaflet 2
      { u: 0.31, halfWidth: 0.18 },
      { u: 0.39, halfWidth: 1.00 },  // sub-leaflet 3 (largest)
      { u: 0.47, halfWidth: 0.22 },
      { u: 0.55, halfWidth: 0.85 },  // sub-leaflet 4
      { u: 0.63, halfWidth: 0.25 },
      { u: 0.71, halfWidth: 0.70 },  // sub-leaflet 5
      { u: 0.80, halfWidth: 0.30 },
      { u: 0.88, halfWidth: 0.40 },
      { u: 0.95, halfWidth: 0.15 },
      { u: 1.00, halfWidth: 0.00 },
    ],
  },
  // 3. Long pointed (이미지 3) — 길고 뾰족, 가는 elongated leaflet
  {
    aspectRatio: 2.8, tipSharpness: 1.15,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.78, dripTipDepth: 0.55,
    controlPoints: [
      { u: 0.00, halfWidth: 0.05 },
      { u: 0.10, halfWidth: 0.55 },
      { u: 0.22, halfWidth: 0.90 },  // 1st lobe peak
      { u: 0.35, halfWidth: 0.50 },  // notch
      { u: 0.50, halfWidth: 0.85 },  // 2nd lobe (mid)
      { u: 0.65, halfWidth: 0.50 },  // notch
      { u: 0.78, halfWidth: 0.55 },  // small bulge near tip
      { u: 0.88, halfWidth: 0.30 },
      { u: 0.96, halfWidth: 0.12 },  // long acuminate
      { u: 1.00, halfWidth: 0.00 },
    ],
  },
  // 4. Asymmetric left-heavy — 좌측 3 deep lobe, 우측 2 shallow (이미지 1 lower-right)
  {
    aspectRatio: 2.0, tipSharpness: 1.05,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.85, dripTipDepth: 0.35,
    controlPoints: [
      { u: 0.00, halfWidth: 0.05 },
      { u: 0.08, halfWidth: 0.45 },
      { u: 0.18, halfWidth: 0.95 },
      { u: 0.27, halfWidth: 0.40 },
      { u: 0.38, halfWidth: 0.90 },
      { u: 0.50, halfWidth: 0.45 },
      { u: 0.62, halfWidth: 0.75 },
      { u: 0.74, halfWidth: 0.40 },
      { u: 0.85, halfWidth: 0.35 },
      { u: 0.94, halfWidth: 0.18 },
      { u: 1.00, halfWidth: 0.00 },
    ],
    controlPointsRight: [
      { u: 0.00, halfWidth: 0.05 },
      { u: 0.12, halfWidth: 0.40 },
      { u: 0.30, halfWidth: 0.70 },  // 약한 lobe
      { u: 0.45, halfWidth: 0.50 },  // shallow notch
      { u: 0.62, halfWidth: 0.65 },
      { u: 0.78, halfWidth: 0.45 },
      { u: 0.90, halfWidth: 0.25 },
      { u: 1.00, halfWidth: 0.00 },
    ],
  },
  // 5. Asymmetric right-heavy — sample 4 좌우 swap (다른 leaflet 같은 plant)
  {
    aspectRatio: 2.0, tipSharpness: 1.05,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.85, dripTipDepth: 0.35,
    controlPoints: [
      { u: 0.00, halfWidth: 0.05 },
      { u: 0.12, halfWidth: 0.40 },
      { u: 0.30, halfWidth: 0.70 },
      { u: 0.45, halfWidth: 0.50 },
      { u: 0.62, halfWidth: 0.65 },
      { u: 0.78, halfWidth: 0.45 },
      { u: 0.90, halfWidth: 0.25 },
      { u: 1.00, halfWidth: 0.00 },
    ],
    controlPointsRight: [
      { u: 0.00, halfWidth: 0.05 },
      { u: 0.08, halfWidth: 0.45 },
      { u: 0.18, halfWidth: 0.95 },
      { u: 0.27, halfWidth: 0.40 },
      { u: 0.38, halfWidth: 0.90 },
      { u: 0.50, halfWidth: 0.45 },
      { u: 0.62, halfWidth: 0.75 },
      { u: 0.74, halfWidth: 0.40 },
      { u: 0.85, halfWidth: 0.35 },
      { u: 0.94, halfWidth: 0.18 },
      { u: 1.00, halfWidth: 0.00 },
    ],
  },
  // 6. Simple small — 작은 intercalary leaflet, 부드러운 ovate + mild teeth (이미지 1 중앙 소형)
  {
    aspectRatio: 1.7, tipSharpness: 1.05,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.92, dripTipDepth: 0.20,
    controlPoints: [
      { u: 0.00, halfWidth: 0.10 },
      { u: 0.12, halfWidth: 0.60 },
      { u: 0.28, halfWidth: 0.90 },
      { u: 0.40, halfWidth: 0.70 },  // 약한 notch
      { u: 0.52, halfWidth: 0.85 },
      { u: 0.66, halfWidth: 0.65 },
      { u: 0.80, halfWidth: 0.50 },
      { u: 0.92, halfWidth: 0.25 },
      { u: 1.00, halfWidth: 0.00 },
    ],
  },
  // 7. Deep cleavage — sub-leaflet 거의 분리될 정도 깊은 갈라짐 (이미지 4 top-left)
  {
    aspectRatio: 2.0, tipSharpness: 1.05,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.88, dripTipDepth: 0.30,
    controlPoints: [
      { u: 0.00, halfWidth: 0.06 },
      { u: 0.07, halfWidth: 0.45 },
      { u: 0.16, halfWidth: 1.00 },  // 매우 큰 sub-leaflet
      { u: 0.24, halfWidth: 0.15 },  // 거의 0까지 깊은 갈라짐
      { u: 0.34, halfWidth: 0.95 },
      { u: 0.43, halfWidth: 0.18 },  // 또 거의 0
      { u: 0.54, halfWidth: 0.85 },
      { u: 0.64, halfWidth: 0.22 },
      { u: 0.74, halfWidth: 0.65 },
      { u: 0.84, halfWidth: 0.35 },
      { u: 0.93, halfWidth: 0.20 },
      { u: 1.00, halfWidth: 0.00 },
    ],
  },
  // 8. Apex emphasis — 좁은 base + 큰 mid-apex lobe (이미지 2 top-right)
  {
    aspectRatio: 2.2, tipSharpness: 1.10,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.90, dripTipDepth: 0.40,
    controlPoints: [
      { u: 0.00, halfWidth: 0.04 },
      { u: 0.10, halfWidth: 0.30 },
      { u: 0.22, halfWidth: 0.45 },  // small base lobe
      { u: 0.34, halfWidth: 0.35 },
      { u: 0.46, halfWidth: 0.80 },  // mid lobe
      { u: 0.56, halfWidth: 0.45 },
      { u: 0.68, halfWidth: 1.00 },  // big apex-side lobe
      { u: 0.78, halfWidth: 0.50 },
      { u: 0.87, halfWidth: 0.55 },
      { u: 0.95, halfWidth: 0.22 },
      { u: 1.00, halfWidth: 0.00 },
    ],
  },
  // 9. Mid-bulged — 가운데 가장 넓은 단순 형태 (이미지 4 top-right)
  {
    aspectRatio: 1.9, tipSharpness: 1.05,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.85, dripTipDepth: 0.30,
    controlPoints: [
      { u: 0.00, halfWidth: 0.08 },
      { u: 0.12, halfWidth: 0.55 },
      { u: 0.24, halfWidth: 0.85 },
      { u: 0.35, halfWidth: 0.65 },  // mild notch
      { u: 0.46, halfWidth: 0.95 },  // widest
      { u: 0.58, halfWidth: 0.65 },  // mild notch
      { u: 0.70, halfWidth: 0.70 },
      { u: 0.82, halfWidth: 0.45 },
      { u: 0.92, halfWidth: 0.22 },
      { u: 1.00, halfWidth: 0.00 },
    ],
  },
];

// ★ S112 — Procedural sample 생성기 (multi-generator 시스템).
//   10 photo sample _외에_ 절차적 polyline 생성. 동일 polyline 메커니즘 사용.
//   사용자: "여러 함수 만들어서 랜덤으로 돌려도 돼" → 10 sample + 무한 procedural 혼합.
function generateProceduralSample(idSeed: number): NaturalLeafletSample {
  // lobe 3~6개 (idSeed 결정)
  const lobeCount = 3 + ((Math.abs(idSeed * 7) % 4));

  // lobe u 범위 (base/tip 여유)
  const lobeRangeStart = 0.13 + signedRand(idSeed, 41) * 0.02;
  const lobeRangeEnd = 0.85 + signedRand(idSeed, 43) * 0.03;
  const step = (lobeRangeEnd - lobeRangeStart) / (lobeCount * 2);

  const buildSide = (sideSalt: number): ControlPoint[] => {
    const pts: ControlPoint[] = [];
    // base (좁음)
    pts.push({ u: 0, halfWidth: 0.05 + Math.abs(signedRand(idSeed, sideSalt + 51)) * 0.04 });
    // pre-base ramp
    pts.push({ u: 0.08, halfWidth: 0.35 + Math.abs(signedRand(idSeed, sideSalt + 53)) * 0.20 });
    // alternating peak/valley
    for (let i = 0; i < lobeCount; i++) {
      const lobeU = lobeRangeStart + step * (2 * i + 1)
        + signedRand(idSeed, sideSalt + 61 + i * 3) * step * 0.25;
      const lobeHW = 0.70 + Math.abs(signedRand(idSeed, sideSalt + 67 + i * 5)) * 0.30;
      pts.push({ u: Math.max(0.10, Math.min(0.95, lobeU)), halfWidth: lobeHW });

      if (i < lobeCount - 1) {
        const notchU = lobeRangeStart + step * (2 * i + 2)
          + signedRand(idSeed, sideSalt + 71 + i * 7) * step * 0.25;
        const notchHW = 0.20 + Math.abs(signedRand(idSeed, sideSalt + 73 + i * 11)) * 0.30;
        pts.push({ u: Math.max(0.10, Math.min(0.95, notchU)), halfWidth: notchHW });
      }
    }
    // post-lobe taper
    pts.push({ u: 0.93, halfWidth: 0.15 + Math.abs(signedRand(idSeed, sideSalt + 81)) * 0.10 });
    pts.push({ u: 1.0, halfWidth: 0 });
    return pts;
  };

  // 30% 비대칭 (좌우 _완전 다른 set_)
  const asymmetric = ((Math.abs(idSeed) >>> 3) % 10) < 3;
  const aspectRatio = 1.7 + Math.abs(signedRand(idSeed, 91)) * 0.7;
  const tipSharpness = 1.05 + Math.abs(signedRand(idSeed, 101)) * 0.10;

  return {
    aspectRatio,
    tipSharpness,
    shoulderLobes: [],
    sinusNotches: [],
    dripTipUStart: 0.85,
    dripTipDepth: 0.30,
    controlPoints: buildSide(0),
    controlPointsRight: asymmetric ? buildSide(503) : undefined,
  };
}

// ★ S112 — Generator dispatch. idSeed 기반 deterministic 선택.
//   60% photo sample (10개 중 하나), 40% procedural (무한 가짓수).
export function selectLeafletSample(idSeed: number): NaturalLeafletSample {
  const useProc = ((Math.abs(idSeed) >>> 4) % 10) < 4;
  if (useProc) return generateProceduralSample(idSeed);
  return NATURAL_LEAFLET_SAMPLES[Math.abs(idSeed) % NATURAL_LEAFLET_SAMPLES.length];
}

// ★ S110 — debug panel 라벨용 sample 이름 (NATURAL_LEAFLET_SAMPLES 순서 일치).
export const NATURAL_LEAFLET_SAMPLE_NAMES: ReadonlyArray<string> = [
  '0. Terminal elaborate',
  '1. Primary broad',
  '2. Sub-lobed (6 lobes)',
  '3. Long pointed',
  '4. Asym left-heavy',
  '5. Asym right-heavy',
  '6. Simple small',
  '7. Deep cleavage',
  '8. Apex emphasis',
  '9. Mid-bulged',
];

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

  // ★ S111 — Control points polyline 경로 (Gaussian _완전 대체_).
  //   사진에서 직접 추출한 (u, halfWidth) 점들의 선형 보간으로 outline 생성.
  //   _뾰족 삼각형_ lobe + _깊은 V-notch_ 자연 형태.
  if (input.controlPoints && input.controlPoints.length >= 2 && !input.smoothMargin) {
    const expansion = Math.max(0, Math.min(1, input.expansionProgress));
    const ageFrac = Math.max(0, Math.min(1, input.ageFrac));
    const expansionLobeScale = Math.min(1.0, Math.max(0.2, (expansion - 0.1) / 0.6));
    const senescenceLobeScale = Math.max(0.6, 1 - ageFrac * 0.4);
    const finalLobeScale = expansionLobeScale * senescenceLobeScale;

    const pointsLeft = input.controlPoints;
    const pointsRight = input.controlPointsRight ?? input.controlPoints;

    // 폴리라인 ±5% size jitter (per-leaflet, deterministic).
    const sizeJitter = 1 + signedRand(input.idSeed, 31) * 0.05;

    const result: ShapeProfileV2Sample[] = [];
    for (let i = 0; i < samples; i++) {
      const u = i / (samples - 1);
      const hwL = interpolateHalfWidthRatio(u, pointsLeft) * finalLobeScale * sizeJitter;
      const hwR = interpolateHalfWidthRatio(u, pointsRight) * finalLobeScale * sizeJitter;
      const halfWidthLeft = Math.max(0, hwL * halfWidthBase);
      const halfWidthRight = Math.max(0, hwR * halfWidthBase);
      result.push({ u, halfWidthLeft, halfWidthRight });
    }
    return result;
  }

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

  // ★ S108 → S112 — Natural sample 선택 + procedural 혼합.
  //   사용자: "여러 함수 만들어서 랜덤" — 60% photo (10 sample), 40% procedural (무한).
  const sample = selectLeafletSample(idSeed);

  // S105 lobeDepthMult (잎 길이 비례) — sample depth × mult
  const lobeDepthMult = Math.max(0.2, Math.min(1.0, lengthM / 0.20));
  const scaledShoulderLobes = sample.shoulderLobes.map(lobe => ({
    ...lobe,
    depth: lobe.depth * lobeDepthMult,
  }));
  const scaledSinusNotches = sample.sinusNotches.map(notch => ({
    ...notch,
    depth: notch.depth * lobeDepthMult,
  }));
  // 좌우 비대칭 sample (Sample 4/5는 right 따로)
  const scaledShoulderLobesRight = sample.shoulderLobesRight
    ? sample.shoulderLobesRight.map(lobe => ({ ...lobe, depth: lobe.depth * lobeDepthMult }))
    : undefined;
  const scaledSinusNotchesRight = sample.sinusNotchesRight
    ? sample.sinusNotchesRight.map(notch => ({ ...notch, depth: notch.depth * lobeDepthMult }))
    : undefined;

  // ★ S108 — sample 값 _완전 override_ (자연 모방). spec의 aspect/sharpness/dripTip 무시.
  // ★ S111 — sample.controlPoints 지정 시 polyline 경로 사용 (Gaussian _완전 대체_).
  const profileV2 = buildShapeProfileV2({
    lengthM: lengthV2,
    aspectRatio: sample.aspectRatio * aspectJitter,  // sample 기준 + V1 ±5% jitter
    tipSharpness: sample.tipSharpness * sharpnessJitter,
    baseShape: positioned.baseShape,
    asymmetry: positioned.asymmetry,
    samples: samplesV2,
    baseTransitionEndU: ctx.spec.shapeProfileRules.baseTransitionEndU,
    shoulderLobes: scaledShoulderLobes,
    sinusNotches: scaledSinusNotches,
    shoulderLobesRight: scaledShoulderLobesRight,
    sinusNotchesRight: scaledSinusNotchesRight,
    dripTipUStart: sample.dripTipUStart,
    dripTipDepth: sample.dripTipDepth,
    expansionProgress: desc.maturity,
    ageFrac: desc.ageFrac,
    smoothMargin: desc.resolved.smoothMargin === true,
    idSeed,
    controlPoints: sample.controlPoints,
    controlPointsRight: sample.controlPointsRight,
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
