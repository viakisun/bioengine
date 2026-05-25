// PlantSkeletonGraph — SSOT Phase 3: directed graph of plant skeleton.
//
// PlantBase carries organ centerline data per organ type. This module
// promotes that data to a formal node+edge graph so:
//   - PlantSkinMeshBuilder can iterate all stem-like edges as a single
//     bone list (input to SDF + marching cubes).
//   - Phase 5 cut/detach can identify which edge was cut and what
//     subtree falls (via parentEdgeId chain + attachedOrganIds).
//   - Phase 8 dataset export can label each vertex by semanticLabel.
//
// SSOT 4.4 — Skeleton is not a debug overlay. It is the real botanical
// centerline. Both SkeletonOverlay (wire) and PlantSkinMesh (surface)
// consume the same graph.
//
// Crop-agnostic types. Crop-specific builders (e.g. buildTomatoSkeletonGraph)
// live in adjacent files.

import type { V3 } from '../sdf/CapsuleSDF';

/**
 * Botanical edge type. SSOT 4.4 enum. Extends naturally as new crops
 * arrive (tendril / runner / fruitPeduncle for cucumber/paprika).
 */
export type SkeletonEdgeType =
  | 'mainStem'
  | 'sideShoot'
  | 'petiole'
  | 'peduncle'
  | 'rachis'
  | 'pedicel';

/** Graph node — shared by adjacent edges (junction or endpoint). */
export interface SkeletonNode {
  id: string;                              // unique within graph
  pos: V3;                                 // world-space
  /** Stem radius at this node (interpolated from PlantBase). */
  radius: number;
  /** Incident edge ids (≥3 at a junction, 1 at a tip, 2 mid-edge). */
  edgeIds: string[];
}

/** Tapered capsule segment along an edge centerline. */
export interface SkeletonBone {
  p0: V3;
  p1: V3;
  r0: number;
  r1: number;
}

/** Edge — a contiguous stem-like organ. */
export interface SkeletonEdge {
  id: string;                              // unique within graph
  type: SkeletonEdgeType;
  startNodeId: string;                     // origin (attached to parent)
  endNodeId: string;                       // tip / attaches to child organ
  /** Densified centerline as a list of capsules (≥1). The first bone's
   *  p0 matches startNode.pos; the last bone's p1 matches endNode.pos. */
  bonePath: SkeletonBone[];
  /** Parent edge in the cut hierarchy. null for root (mainStem). When a
   *  user cuts this edge, this + all descendant edges fall together. */
  parentEdgeId: string | null;
  /** Whether a tool may cut this edge. mainStem is typically false. */
  cuttable: boolean;
  /** Human / dataset label. e.g. 'main stem', 'leaf 7 petiole'. */
  semanticLabel: string;
  /** Non-edge organs attached to this edge's end (leaf blade, fruit
   *  body, calyx). Phase 5 disposes these along with the edge. */
  attachedOrganIds: string[];
}

export interface PlantSkeletonGraph {
  nodes: Map<string, SkeletonNode>;
  edges: Map<string, SkeletonEdge>;
  /** Root of the cut hierarchy. */
  rootEdgeId: string;
}

// ── Graph helpers ──────────────────────────────────────────────────────

/**
 * Walk parentEdgeId chain from edgeId up to the root. Returns the chain
 * including the start and root.
 */
export function edgeAncestors(graph: PlantSkeletonGraph, edgeId: string): string[] {
  const chain: string[] = [];
  let current: string | null = edgeId;
  while (current !== null) {
    chain.push(current);
    const edge = graph.edges.get(current);
    if (!edge) break;
    current = edge.parentEdgeId;
  }
  return chain;
}

/**
 * Build a reusable parent→children index for O(1) DFS traversal.
 *
 * Promoted from inside `edgeSubtree` so callers (e.g. tube builders) can
 * reuse a single index across many traversals without rebuilding it.
 */
export function buildChildIndex(graph: PlantSkeletonGraph): Map<string, string[]> {
  const children: Map<string, string[]> = new Map();
  for (const [eid, e] of graph.edges) {
    if (e.parentEdgeId === null) continue;
    const arr = children.get(e.parentEdgeId);
    if (arr) arr.push(eid);
    else children.set(e.parentEdgeId, [eid]);
  }
  return children;
}

/**
 * Collect edgeId + all descendants via BFS. Used at cut time: when an
 * edge is cut, this returns every edge whose parentEdgeId chain passes
 * through `edgeId`.
 */
export function edgeSubtree(graph: PlantSkeletonGraph, edgeId: string): string[] {
  const children = buildChildIndex(graph);
  const out: string[] = [];
  const queue: string[] = [edgeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    out.push(cur);
    const kids = children.get(cur);
    if (kids) queue.push(...kids);
  }
  return out;
}

/**
 * Flatten all bones from the graph into a single array, returning a
 * parallel array of edge ids (one per bone) for later vertex tagging.
 */
export function flattenBones(graph: PlantSkeletonGraph): {
  bones: SkeletonBone[];
  boneEdgeIds: string[];
} {
  const bones: SkeletonBone[] = [];
  const boneEdgeIds: string[] = [];
  for (const [eid, edge] of graph.edges) {
    for (const bone of edge.bonePath) {
      bones.push(bone);
      boneEdgeIds.push(eid);
    }
  }
  return { bones, boneEdgeIds };
}
