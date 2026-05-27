// Iter 18B PR 12 (SSOT #181) — SkinEngine façade interface.
//
// Skin Engine = (PlantSkeletonGraph + render options) → Babylon mesh trio
// (stem family unified mesh + per-leaf blade meshes + per-truss organ meshes).
// SSOT #181 — every visible geometry in skin mode flows through this single
// render() call. SkinMeshPlant becomes a thin Babylon-scene adapter.
//
// Implementation: PR 13 wires the existing inline render code in
// SkinMeshPlant.ts into `defaultSkinEngine.render()`.
//
// Constraints:
//   - render() reads ONLY SkeletonGraph + PlantBase + SkeletonEngine helpers.
//     No direct biological/cultivar/engine state lookups.
//   - Leaflets are mesh-local (SSOT #182) — render() returns blade meshes
//     positioned at leaf_blade OrganAnchor; leaflet/rib/vein geometry lives
//     inside the blade mesh and is NOT independently anchored.

import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { PlantSkeletonGraph } from '../skeleton/SkeletonEngine';
import type { PlantStemFamilyMesh, PlantFaceGroup } from './StemFamilyTubeNetworkBuilder';
import type { PlantBase } from '../PlantBase';
import type { GrowthEngine, PlantState } from '@farmsim/tomato-engine';

export interface SkinEngineRenderOpts {
  /** Plant seed (used for genome + per-plant material caches). */
  seed: number;
  /** GrowthEngine for genome lookup (per-leaf style randomization). */
  engine: GrowthEngine;
  /** Cultivar key for material/leaf-shape lookup. */
  cultivarKey: string;
  /** Engine-side per-plant state (legacy callers may pass for fruit overlay). */
  state: PlantState;
  /** PlantBase computed geometry (visible organ positions, visibility flags). */
  plantBase: PlantBase;
  /** Babylon scene for mesh attachment. */
  scene: Scene;
  /** Parent transform node — meshes will be parented here. */
  parent: TransformNode;
  /** Stem family tube opts forwarded to buildPlantSkinMesh. */
  stemOpts?: {
    radialSegments?: number;
    rootRadiusScale?: number;
    parentSwellingScale?: number;
  };
}

export interface SkinEngineRenderResult {
  /** Single unified mesh covering stem family (mainStem + sideShoot + petiole +
   *  peduncle + rachis + pedicel) — built via PlantSkinMesh / SDF tube network. */
  stemMesh: Mesh | null;
  /** Phase 5 cut/pick metadata from the stem mesh — empty when stemMesh is null. */
  stemFaceGroups: PlantFaceGroup[];
  stemEdgeIdByIdx: string[];
  stemVertexEdgeTag: Uint16Array;
  /** Per-leaf blade meshes, parented to opts.parent. positioned at
   *  SkeletonGraph leaf_blade OrganAnchor. */
  leafMeshes: Mesh[];
  /** Per-truss organ TransformNodes (fruit body / calyx / flower) — children
   *  positioned at SkeletonGraph fruit/flower/calyx OrganAnchors. */
  organNodes: TransformNode[];
  /** Cotyledon meshes (seedling phase). */
  cotyledonMeshes: Mesh[];
  /** Per-frame diagnostic stats — passed through PlantStemFamilyMesh + extras. */
  stats: PlantStemFamilyMesh['stats'] & {
    leafMeshCount: number;
    organNodeCount: number;
    cotyledonCount: number;
  };
}

/**
 * Render the plant skin from a SkeletonGraph.
 *
 * Pure function (modulo Babylon mesh allocation). Caller owns mesh lifecycle
 * (disposal). Cache invalidation by graph snapshot is the caller's responsibility.
 */
export interface SkinEngine {
  render(graph: PlantSkeletonGraph, opts: SkinEngineRenderOpts): SkinEngineRenderResult;
}
