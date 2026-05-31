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

const RADIUS_FLOOR_M = 0.0008; // 0.8 mm — current StemFamily render floor.

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
};

const ZERO_DIR: PlantLocalV3 = { x: 0, y: 0, z: 0 } as PlantLocalV3;

function summarizeRadius(edge: SkeletonEdge): { biological: number; render: number } {
  // Use the maximum of bone radii as biological (the base of taper).
  let maxR = 0;
  for (const b of edge.bonePath) {
    if (b.r0 > maxR) maxR = b.r0;
    if (b.r1 > maxR) maxR = b.r1;
  }
  const render = Math.max(maxR, RADIUS_FLOOR_M);
  return { biological: maxR, render };
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
    const { biological, render } = summarizeRadius(edge);
    const policy: EdgeRenderPolicy = {
      radius: { biological, render, min: RADIUS_FLOOR_M },
      junction: {
        embedDepthM: 0, // refined by StemFamilyTubeNetworkBuilder (sync TBD).
        radialDir: ZERO_DIR,
      },
      material: { role: MATERIAL_ROLE[edge.type] },
      visualHint: { color: EDGE_COLOR[edge.type] },
    };
    edge.renderPolicy = policy;
  }
}
