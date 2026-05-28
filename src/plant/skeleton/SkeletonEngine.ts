// Iter 18B PR 9 (SSOT #180) / Iter 26 PR 2-0 (SSOT #187) —
// Skeleton Engine single entry point.
//
// All visible structure flows through buildPlantSkeleton(plantBase). Crop-
// specific builders (currently only tomato) dispatch from here. Future crops
// (cherry / pepper / cucumber) add cases without touching consumers.
//
// SSOT #180 — Skeleton is the single source of truth for plant topology.
// SSOT #187 — Skeleton is also the source of truth for visual semantics
// (node.type, node.frame, node.visualHint, anchor.morphology/state/chain/
// visualHint, edge.renderPolicy). See docs/architecture/SEMANTIC_GRAPH.md.
//
// This function is the UNIQUE simulation → graph mapping point. Reads
// PlantBase + PlantState + cultivar JSONC here; afterwards Skin/Overlay/
// AcceptanceProbe consume ONLY the returned graph. Direct PlantBase /
// PlantState references outside this populator are tracked by
// `tests/architecture/skeleton-populator-isolation.spec.ts`.

import type { PlantBase } from '../PlantBase';
import type { PlantSkeletonGraph } from './PlantSkeletonGraph';
import {
  buildTomatoSkeletonGraph,
  type BuildSkeletonOpts,
} from './buildTomatoSkeletonGraph';

export interface BuildPlantSkeletonOpts extends BuildSkeletonOpts {
  /** Crop selector. Currently only 'tomato' supported. */
  crop?: 'tomato';
}

/**
 * Build a PlantSkeletonGraph from a PlantBase (geometry snapshot).
 *
 * Single Skeleton Engine entry — every consumer (SkinMeshPlant, validator,
 * acceptance harness, fidelity dump) MUST go through this function. Direct
 * imports of buildTomatoSkeletonGraph are allowed only inside this module.
 */
export function buildPlantSkeleton(
  plantBase: PlantBase,
  opts: BuildPlantSkeletonOpts = {},
): PlantSkeletonGraph {
  const crop = opts.crop ?? 'tomato';
  switch (crop) {
    case 'tomato':
      return buildTomatoSkeletonGraph(plantBase, opts);
    default: {
      const _exhaustive: never = crop;
      throw new Error(`SkeletonEngine: unsupported crop "${_exhaustive as string}"`);
    }
  }
}

// Re-export type so consumers can `import { buildPlantSkeleton, PlantSkeletonGraph } from './SkeletonEngine'`.
export type { PlantSkeletonGraph } from './PlantSkeletonGraph';
export type {
  OrganAnchor,
  OrganAnchorKind,
  SkeletonEdge,
  SkeletonEdgeType,
  SkeletonNode,
  SkeletonBone,
} from './PlantSkeletonGraph';
// Re-export organ visibility predicates so consumers have a single
// SkeletonEngine surface (Iter 18A SSOT #176).
export {
  isLeafOrganVisible,
  isTrussOrganVisible,
  LEAF_VISIBILITY_THRESHOLD,
} from './buildTomatoSkeletonGraph';
// PR 10 — validation harness.
export { validateSkeleton } from './validateSkeleton';
export type { ValidationFinding, ValidationReport, ValidationSeverity } from './validateSkeleton';
