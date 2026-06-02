// SSOT #186 — Leaf blade mesh anchor utility.
// See: docs/architecture/MESH_ANCHORS.md
//
// Iter 18~24 leaf disconnect 7번 실패의 최종 fix (commit acfad71) 로직을
// 본 utility로 추출. byte-identical to LeafGenerator.ts acfad71 inline code.

import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { PlantLocalV3 } from '../coordinates';
import type { LeafAnchor } from './types';

/**
 * Iter 39 Phase K3 — 3D anchor (Iter 24 acfad71 contract _확장_).
 *
 * `buildLeafBladeOnly` 출력 chunk는 leaflets가 mesh-local `(petioleLen +
 * rachisLen·t, y, z)`부터 분포. **stem-side vertex (x_min에 해당)의 _y, z_
 * 도 0이 아닌 임의 값**. mesh.position = leafletNode.pos로 set해도 base
 * vertex가 `(0, y₀, z₀)`에 있어 world position이 _leafletNode.pos에서 y/z
 * 평면으로 떠 있음_ → leaf blade가 공중에 떠 보이는 시각 disconnect.
 *
 * K3 진단 (probe yzOffset): p50 8.2mm, p95 35mm, max 91mm. 사용자 close-up
 * 에서 _수십 mm gap_ 정확히 일치.
 *
 * 본 함수 (K3 확장): `chunk.positions`의 x_min vertex 찾고 그 vertex의
 * `(x, y, z)` 모두 shift. 결과: stem-side vertex = mesh-local `(0, 0, 0)`.
 *
 * **호출 의무**: `buildLeafBladeOnly` / `buildLeafChunkSkin` / leafCellChunk
 * 호출 후 반드시 본 함수 적용. SkinMeshPlant 또는 buildLeafletMeshes에서
 * `leafMesh.position = leafletNode.pos` 설정 시 자동 정합.
 *
 * K2 history: K1 (end-anchored truncate)로 leaflet 쪽 connector tube gap
 * 해소 → K2 (fraction = 1.0)로 attach 쪽 gap 해소 → K3 (3D anchor)로 _mesh
 * 자체_의 anchor offset 해소 (사용자 진단 정확).
 *
 * 검증: tests/architecture/mesh-anchor-contracts.spec.ts:ANCHOR-04 (K3에서
 * 3D 검증으로 확장).
 */
export function normalizeLeafMeshVertices(
  chunkPositions: Float32Array | number[],
): void {
  let minX = Infinity;
  let yAtMinX = 0;
  let zAtMinX = 0;
  for (let i = 0; i < chunkPositions.length; i += 3) {
    if (chunkPositions[i] < minX) {
      minX = chunkPositions[i];
      yAtMinX = chunkPositions[i + 1];
      zAtMinX = chunkPositions[i + 2];
    }
  }
  if (!Number.isFinite(minX)) return;
  // K3: x_min vertex의 (x, y, z) 모두 0으로 shift. stem-side = (0, 0, 0).
  const needShift = minX !== 0 || yAtMinX !== 0 || zAtMinX !== 0;
  if (!needShift) return;
  for (let i = 0; i < chunkPositions.length; i += 3) {
    chunkPositions[i]     -= minX;
    chunkPositions[i + 1] -= yAtMinX;
    chunkPositions[i + 2] -= zAtMinX;
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
 * Invariant 검증 (K3 3D 확장): mesh의 _x_min vertex_가 mesh-local `(0, 0, 0)`
 * 근처에 있는지 — _x, y, z 모두_.
 *
 * `normalizeLeafMeshVertices` 호출 누락 또는 K3 이전 _x만 shift_ 시 catch.
 *
 * @param epsilon 기본 0.001 m (= 1 mm).
 */
export function assertLeafAnchorInvariant(mesh: Mesh, epsilon: number = 0.001): void {
  const verts = mesh.getVerticesData('position');
  if (!verts || verts.length < 3) {
    throw new Error(`[leafAnchor] mesh ${mesh.name} has no vertex data`);
  }
  let minX = Infinity;
  let yAtMinX = 0;
  let zAtMinX = 0;
  for (let i = 0; i < verts.length; i += 3) {
    if (verts[i] < minX) {
      minX = verts[i];
      yAtMinX = verts[i + 1];
      zAtMinX = verts[i + 2];
    }
  }
  const offset = Math.hypot(minX, yAtMinX, zAtMinX);
  if (offset > epsilon) {
    throw new Error(
      `[leafAnchor] mesh ${mesh.name} stem-side vertex `
      + `(${minX.toFixed(4)}, ${yAtMinX.toFixed(4)}, ${zAtMinX.toFixed(4)}) `
      + `not at mesh-local (0,0,0) (offset=${offset.toFixed(4)}m, ε=${epsilon}). `
      + `normalizeLeafMeshVertices() 호출 누락 또는 K3 이전 산식? `
      + `참조: docs/architecture/MESH_ANCHORS.md`,
    );
  }
}
