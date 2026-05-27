// buildPlantSkinMesh — thin wrapper around StemFamilyTubeNetworkBuilder.
//
// SSOT Phase 4. Previously SDF + marching cubes (now dead code in sdf/
// kept for Phase 5 cut plane SDF use). Current backend: tube network
// with embedded branches in a single Mesh / single VertexData buffer.
// Topology connection is NOT a goal — individual tube components are
// disjoint within the same buffer.

import { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { PlantSkeletonGraph } from '../skeleton/PlantSkeletonGraph';
import {
  buildStemFamilyTubeNetwork,
  type PlantFaceGroup,
  type PlantStemFamilyMesh,
  type StemFamilyTubeOpts,
} from './StemFamilyTubeNetworkBuilder';

export interface PlantSkinMesh {
  /** Single Babylon Mesh — the entire stem family. */
  mesh: Mesh;
  /** Index-buffer offset → edge id mapping (Phase 5 cut/pick primary). */
  faceGroups: PlantFaceGroup[];
  /** Per-vertex compact edge index (debug + boundary cases). */
  vertexEdgeTag: Uint16Array;
  /** Reverse lookup: vertexEdgeTag[v] → edge id. */
  edgeIdByIdx: string[];
  /** Iter 18A: full stats including per-edge-type breakdown + floating audit. */
  stats: PlantStemFamilyMesh['stats'];
}

export interface PlantSkinMeshOptions extends StemFamilyTubeOpts {}

/**
 * Build the unified stem-family mesh from a skeleton graph.
 *
 * Returns a single Babylon Mesh suitable for direct attachment to a
 * TransformNode (e.g. SkinMeshPlant.lushGroup). Caller is responsible
 * for parenting, materials, and disposal lifecycle.
 *
 * mesh.metadata is NOT set here — caller stores faceGroups + edge
 * tables on metadata as it sees fit.
 */
export function buildPlantSkinMesh(
  scene: Scene,
  graph: PlantSkeletonGraph,
  opts: PlantSkinMeshOptions = {},
): PlantSkinMesh {
  const out = buildStemFamilyTubeNetwork(scene, graph, opts);
  return {
    mesh: out.mesh,
    faceGroups: out.faceGroups,
    vertexEdgeTag: out.vertexEdgeTag,
    edgeIdByIdx: out.edgeIdByIdx,
    stats: out.stats,
  };
}
