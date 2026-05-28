// SSOT #186 — Mesh anchor types.
// See: docs/architecture/MESH_ANCHORS.md

import type { PlantLocalV3 } from '../coordinates';

/** mesh-local (0,0,0)이 가리키는 semantic 위치. mesh 종류에 따라 다름. */
export type MeshLocalOriginRole =
  | 'stem-root'                     // StemFamily tube: stem 시작점 (ground)
  | 'first-leaflet-stem-side'       // Leaf blade: 첫 leaflet의 가장 stem-side vertex (Iter 24 contract)
  | 'fruit-attach-pedicel-side'     // Fruit mesh
  | 'flower-attach'                 // Flower mesh
  | 'calyx-attach'                  // Calyx mesh
  | 'cotyledon-attach';             // Cotyledon mesh

/** Mesh anchor contract — 각 mesh의 anchor 좌표 의미. */
export interface MeshAnchor {
  /** mesh.position (plant-local) — Babylon parent (lushGroup) 기준 부착 위치. */
  meshPlantPos: PlantLocalV3;
  /** mesh-local (0,0,0)이 가리키는 의미 (rotation origin이기도 함). */
  meshLocalOriginRole: MeshLocalOriginRole;
  /** anchor가 graph 어느 node를 가리키는가 (검증용). */
  graphAnchorNodeId: string;
}

/** Leaf blade mesh 전용 anchor — Iter 24 acfad71 contract. */
export interface LeafAnchor extends MeshAnchor {
  meshLocalOriginRole: 'first-leaflet-stem-side';
  /** mesh-local (0,0,0)에서 가장 가까운 leaflet의 nodeIdx (참고용). */
  firstLeafletNodeIdx?: number;
}

/** Fruit mesh 전용 anchor. */
export interface FruitAnchor extends MeshAnchor {
  meshLocalOriginRole: 'fruit-attach-pedicel-side';
}
