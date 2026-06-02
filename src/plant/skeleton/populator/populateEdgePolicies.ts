// SSOT #187 — Populate SkeletonEdge.renderPolicy.
//
// Iter 26 PR 2-3. Walks every edge and fills:
//   - radius.{biological, render, min}: from the bonePath taper.
//   - material.role: from edge.type.
//   - visualHint.{color}: per-role lookup.
//   - junction.{embedDepthM, radialDir}: placeholder. parentContext is
//     populated by the Skin path later (StemFamilyTubeNetworkBuilder owns
//     the exact stem-surface intersection geometry) and synced back to the
//     graph in a follow-up commit.
//
// See: docs/architecture/SEMANTIC_GRAPH.md sections 2.2, 2.4.

import type {
  EdgeRenderPolicy,
  PlantSkeletonGraph,
  SkeletonEdge,
  SkeletonEdgeType,
} from '../PlantSkeletonGraph';
import type { PlantLocalV3 } from '../../coordinates/types';

// ★ Iter 39 Phase F1 — type별 render floor (StemFamilyTubeNetworkBuilder와 동기).
//   사용자: petiole/leaf-rachis/petiolule/vein 굵기 위계 없음 → type별 floor로 차등.
const RADIUS_FLOOR_M = 0.0008; // 0.8 mm — 줄기 계열 기본 (legacy, summarizeRadius 호환)
const RADIUS_FLOOR_M_BY_TYPE: Record<SkeletonEdgeType, number> = {
  mainStem: 0.0008, sideShoot: 0.0008,
  petiole: 0.0008, peduncle: 0.0008, rachis: 0.0008, pedicel: 0.0008,
  'leaf-rachis':  0.0003,
  petiolule:      0.0001,
  'lateral-vein': 0.0,
  'sub-vein':     0.0,
};

const MATERIAL_ROLE: Record<SkeletonEdgeType, NonNullable<EdgeRenderPolicy['material']>['role']> = {
  mainStem: 'main-stem',
  sideShoot: 'side-shoot',
  petiole: 'petiole',
  peduncle: 'peduncle',
  rachis: 'rachis',
  pedicel: 'pedicel',
  // Iter 36 v5 Phase J — compound leaf 계층 (사용자 botanical model).
  'leaf-rachis': 'leaf-rachis',
  petiolule: 'petiolule',
  // Iter 36 v5 Phase N — bipinnate vein.
  'lateral-vein': 'lateral-vein',
  'sub-vein': 'sub-vein',
};

/**
 * Skin tube visible fraction per edge type (arc length 기준).
 * Connector edge는 _length 자르지 않음_ (active 원칙 #36, K2).
 * 시각 조정은 radius(skinRadiusScale)로만. sub-vein 0.0 = ENABLE_SECONDARY_LEAFLETS=false
 * 한정 — secondary 활성 시 재검토.
 * History (LEAF_TUBE_RENDERING.md): K0 0.0/0.30 → K0-3A 0.65/0.50 → K2 1.0/1.0.
 */
const SKIN_VISIBLE_FRACTION_BY_TYPE: Record<SkeletonEdgeType, number> = {
  mainStem: 1.0, sideShoot: 1.0,
  petiole: 1.0, peduncle: 1.0, rachis: 1.0, pedicel: 1.0,
  'leaf-rachis':  1.0,
  petiolule:      1.0,
  'lateral-vein': 1.0,
  'sub-vein':     0.0,
};

const EDGE_COLOR: Record<SkeletonEdgeType, string> = {
  mainStem: '#8B4513',
  sideShoot: '#A0522D',
  petiole: '#556B2F',
  peduncle: '#A52A2A',
  rachis: '#CD5C5C',
  pedicel: '#B22222',
  // Iter 36 v5 Phase J — leaf hierarchy wireframe 색 (skeleton overlay 식별용).
  'leaf-rachis': '#6B8E23',   // olive drab (petiole-tip 톤)
  petiolule: '#9ACD32',        // yellow green (leaflet 부착)
  // Iter 36 v5 Phase N — vein hierarchy (단계별 옅음).
  'lateral-vein': '#7DBC32',   // medium green (옆맥)
  'sub-vein':     '#AADD66',   // light green (잔맥)
};

const ZERO_DIR: PlantLocalV3 = { x: 0, y: 0, z: 0 } as PlantLocalV3;

function summarizeRadius(edge: SkeletonEdge): { biological: number; render: number; floor: number } {
  // Use the maximum of bone radii as biological (the base of taper).
  let maxR = 0;
  for (const b of edge.bonePath) {
    if (b.r0 > maxR) maxR = b.r0;
    if (b.r1 > maxR) maxR = b.r1;
  }
  // ★ Iter 39 Phase F1 — type별 floor.
  const floor = RADIUS_FLOOR_M_BY_TYPE[edge.type] ?? RADIUS_FLOOR_M;
  const render = Math.max(maxR, floor);
  return { biological: maxR, render, floor };
}

/**
 * Populate edge.renderPolicy on every edge of the graph. In-place; idempotent.
 *
 * junction.parentContext is left undefined here — SkinEngine fills it during
 * tube network build (StemFamilyTubeNetworkBuilder already produces this
 * value in its stats; a future PR syncs that back to the graph).
 */
export function populateEdgePolicies(graph: PlantSkeletonGraph): void {
  for (const edge of graph.edges.values()) {
    const { biological, render, floor } = summarizeRadius(edge);
    const policy: EdgeRenderPolicy = {
      radius: { biological, render, min: floor },
      junction: {
        embedDepthM: 0, // refined by StemFamilyTubeNetworkBuilder (sync TBD).
        radialDir: ZERO_DIR,
      },
      material: { role: MATERIAL_ROLE[edge.type] },
      visualHint: { color: EDGE_COLOR[edge.type] },
      // ★ Iter 39 Phase H4 — type별 skin visible fraction (arc length 기준).
      //   skeleton bonePath는 full (SSOT), skin SDF만 truncate.
      skinVisibleFraction: SKIN_VISIBLE_FRACTION_BY_TYPE[edge.type] ?? 1.0,
    };
    edge.renderPolicy = policy;
  }
}
