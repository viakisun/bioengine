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
