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
