// SSOT #186 — Leaf blade mesh anchor utility.
// See: docs/architecture/MESH_ANCHORS.md
//
// Iter 18~24 leaf disconnect 7번 실패의 최종 fix (commit acfad71) 로직을
// 본 utility로 추출. byte-identical to LeafGenerator.ts acfad71 inline code.

import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { PlantLocalV3 } from '../coordinates';
import type { LeafAnchor } from './types';

/**
 * Iter 24 acfad71 contract — leaf chunk의 vertex.x_min을 0으로 shift.
 *
 * `buildLeafBladeOnly` 출력 chunk는 leaflets가 mesh-local `(petioleLen +
 * rachisLen·t, ?, ?)`부터 분포. mesh-local origin은 빈 공간이라 origin과
 * 첫 vertex 사이 gap이 시각 disconnect 원인 (Iter 18~24 bug).
 *
 * 본 함수: `chunk.positions`의 `x_min`을 측정해 모든 vertex.x에서 빼기.
 * 결과: 첫 leaflet의 가장 stem-side vertex가 mesh-local `(0, ?, ?)`.
 *
 * **호출 의무**: `buildLeafBladeOnly` / `buildLeafChunkSkin` 호출 후 반드시
 * 본 함수 적용. SkinMeshPlant에서 `leafMesh.position = petiole tip` 설정 시
 * 자동 정합.
 *
 * **byte-identical to LeafGenerator.ts acfad71 inline code** (검증:
 * tests/architecture/mesh-anchor-contracts.spec.ts:ANCHOR-04).
 */
export function normalizeLeafMeshVertices(
  chunkPositions: Float32Array | number[],
): void {
  let minX = Infinity;
  for (let i = 0; i < chunkPositions.length; i += 3) {
    if (chunkPositions[i] < minX) minX = chunkPositions[i];
  }
  if (Number.isFinite(minX) && minX !== 0) {
    for (let i = 0; i < chunkPositions.length; i += 3) {
      chunkPositions[i] -= minX;
    }
  }
}

/**
 * Leaf anchor 생성 helper — graph anchor node + mesh-local origin role 명시.
 *
 * @param petioleTipPlantPos leafMesh.position에 set할 값 (= petiole tip, plant-local).
 * @param graphTipNodeId petiole edge endNode id (검증 용).
 * @param firstLeafletNodeIdx 참고 — 가장 stem-side leaflet의 nodeIdx.
 */
export function makeLeafAnchor(
  petioleTipPlantPos: PlantLocalV3,
  graphTipNodeId: string,
  firstLeafletNodeIdx?: number,
): LeafAnchor {
  return {
    meshPlantPos: petioleTipPlantPos,
    meshLocalOriginRole: 'first-leaflet-stem-side',
    graphAnchorNodeId: graphTipNodeId,
    firstLeafletNodeIdx,
  };
}

/**
 * Invariant 검증: mesh의 vertex.x_min이 mesh-local `(0, 0, 0)` 근처에 있는지.
 *
 * `normalizeLeafMeshVertices` 호출 누락 시 vertex.x_min > 0 → throw로 catch.
 *
 * @param epsilon 기본 0.001 m (= 1 mm).
 */
export function assertLeafAnchorInvariant(mesh: Mesh, epsilon: number = 0.001): void {
  const verts = mesh.getVerticesData('position');
  if (!verts || verts.length < 3) {
    throw new Error(`[leafAnchor] mesh ${mesh.name} has no vertex data`);
  }
  let minX = Infinity;
  for (let i = 0; i < verts.length; i += 3) {
    if (verts[i] < minX) minX = verts[i];
  }
  if (Math.abs(minX) > epsilon) {
    throw new Error(
      `[leafAnchor] mesh ${mesh.name} vertex.x_min=${minX.toFixed(4)} `
      + `not at mesh-local (0,0,0) (ε=${epsilon}). `
      + `normalizeLeafMeshVertices() 호출 누락? `
      + `참조: docs/architecture/MESH_ANCHORS.md`,
    );
  }
}
