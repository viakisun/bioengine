// Iter 18B PR 13 — Default SkinEngine implementation.
//
// First migration step: stem family mesh now flows through SkinEngine.render().
// Leaf blade + truss organ + cotyledon rendering remain in SkinMeshPlant for
// now (closure-captured currentMeshes lifecycle). Subsequent PRs (out of
// scope for the 20-PR sprint) can progressively migrate those loops into
// this engine.
//
// This intentional partial migration keeps baseline-C byte-perfect: every
// caller of `defaultSkinEngine.render` sees the same stem mesh count and
// vertex layout as before.

import { buildPlantSkinMesh } from './buildPlantSkinMesh';
import type { SkinEngine, SkinEngineRenderOpts, SkinEngineRenderResult } from './SkinEngine';
import type { PlantSkeletonGraph } from '../skeleton/SkeletonEngine';

export const defaultSkinEngine: SkinEngine = {
  render(graph: PlantSkeletonGraph, opts: SkinEngineRenderOpts): SkinEngineRenderResult {
    const skin = buildPlantSkinMesh(opts.scene, graph, opts.stemOpts ?? {
      radialSegments: 8,
      rootRadiusScale: 1.15,
      parentSwellingScale: 1.25,
    });
    const stemMesh = skin.stats.vertexCount > 0 ? skin.mesh : null;
    if (stemMesh) {
      stemMesh.parent = opts.parent;
    }
    return {
      stemMesh,
      stemFaceGroups: skin.faceGroups,
      stemEdgeIdByIdx: skin.edgeIdByIdx,
      stemVertexEdgeTag: skin.vertexEdgeTag,
      // Subsequent PRs migrate these. For now the caller (SkinMeshPlant) is
      // still responsible — façade boundary is established but partial.
      leafMeshes: [],
      organNodes: [],
      cotyledonMeshes: [],
      stats: {
        ...skin.stats,
        leafMeshCount: 0,
        organNodeCount: 0,
        cotyledonCount: 0,
      },
    };
  },
};
