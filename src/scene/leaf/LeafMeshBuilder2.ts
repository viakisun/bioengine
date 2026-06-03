// ★ Iter 39 Phase L9-D V2 (S85) — V2 outline builder side-by-side (메시빌더2).
//
// 사용자 결정 (smooth-prancing-starfish.md v5):
//   "현재 메시 빌더를 놔두고, 새로운 메시빌더2를 만드는 것도 방법이야."
//
// V1 (`LeafMeshBuilder.ts`)의 `sin(πu)^shapePower` 단일 bell curve가 _수학적으로_
// 자연 토마토 outline (shoulder lobe + sinus notch + drip tip)을 표현 불가능.
// V2는 _근본적으로 다른 산식_을 side-by-side로 실험. URL flag `?leafBuilder=v2`
// 로 V1과 toggle 비교. V1 100% 보존.
//
// 현재 phase (S85): _골격_ — V1에 단순 위임 (byte-identical). 사용자가 toggle해도
// visual 차이 0. 산식 본격 도입은 S90 (`buildShapeProfileV2`).
//
// 공존 정책 (Active 원칙 #56):
//   V1+V2 공존은 _임시_. V2 승격 6 조건 충족 후 _L10-A archive plan_으로 V1 →
//   `_archive/`. `leaf-builder-v2-coexistence.spec.ts`가 phase 추적.

import { buildLeafMeshFromSkeleton, type LeafMeshBuildInput, type LeafMeshPatch } from './LeafMeshBuilder';

/**
 * V2 canonical entry — leaf mesh generation.
 *
 * S85 (현재): V1 `buildLeafMeshFromSkeleton` 단순 위임 — byte-identical output.
 * S90 (예정): `buildShapeProfileV2` (Gaussian shoulder lobe + sinus notch +
 *   drip tip + Expansion/Senescence scaling) 신규 산식. base wedge, lobeNoise,
 *   serrationNoise, applyLeafletPose, buildLeafletPlaneChunk는 V1 재사용.
 *
 * V1과 같은 input/output contract (LeafMeshBuildInput → LeafMeshPatch[]).
 */
export function buildLeafMeshFromSkeletonV2(input: LeafMeshBuildInput): LeafMeshPatch[] {
  // S85 — V1 위임. S90에서 자체 산식으로 교체.
  return buildLeafMeshFromSkeleton(input);
}
