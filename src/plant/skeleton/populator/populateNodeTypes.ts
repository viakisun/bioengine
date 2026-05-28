// SSOT #187 — Populate SkeletonNode.type + frame + visualHint.
//
// Iter 26 PR 2-1. Walks every node in the freshly built graph and assigns:
//   - type: from the node-id prefix (the builder already encodes role in the id).
//   - frame: tangent inferred from the incident edge's bonePath, normal from
//     a simple world-up cross-product fallback. Good enough for v1; can be
//     refined per node-type if visual orientation needs it.
//   - visualHint: default per type from `visualHintDefaults.ts`.
//
// See: docs/architecture/SEMANTIC_GRAPH.md sections 2.1, 3.

import type {
  LocalFrame,
  PlantSkeletonGraph,
  SkeletonNode,
  SkeletonNodeType,
} from '../PlantSkeletonGraph';
import type { PlantLocalV3 } from '../../coordinates/types';
import { defaultVisualHint } from './visualHintDefaults';

/**
 * Map a SkeletonNode.id to its botanical role.
 *
 * Builder encodes role into the id prefix (e.g. `n:petiole_tip:axis0:n3`).
 * This keeps the populator pure — no need to re-derive from topology.
 */
function nodeTypeFromId(id: string): SkeletonNodeType {
  // `n:axis0:*` — main stem segment.
  // `n:axis{N}:*` (N>=1) — side shoot segment.
  // `n:petiole_tip:*`, `n:peduncle_end:*`, `n:knuckle:*`, `n:pedicel_tip:*` — typed leaves.
  if (id.startsWith('n:petiole_tip:')) return 'petiole-tip';
  if (id.startsWith('n:peduncle_end:')) return 'peduncle-node';
  if (id.startsWith('n:knuckle:')) return 'rachis-node';
  if (id.startsWith('n:pedicel_tip:')) return 'pedicel-tip';
  if (/^n:axis0:/.test(id)) return 'main-stem-node';
  if (/^n:axis\d+:/.test(id)) return 'side-shoot-node';
  // Fallback — unknown id pattern. Default to main-stem-node visual; PR 2-AUDIT
  // is expected to surface any missed pattern.
  return 'main-stem-node';
}

const WORLD_UP: PlantLocalV3 = { x: 0, y: 1, z: 0 } as PlantLocalV3;

function len(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: { x: number; y: number; z: number }): PlantLocalV3 {
  const L = len(v);
  if (L < 1e-9) return { x: 0, y: 1, z: 0 } as PlantLocalV3;
  return { x: v.x / L, y: v.y / L, z: v.z / L } as PlantLocalV3;
}

function cross(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Compute a local frame at the node from one of its incident edges.
 *
 * - tangent: direction along the first incident edge's bonePath near this node.
 * - normal: world-up × tangent, normalized; falls back to world-up if degenerate.
 */
function computeFrame(
  graph: PlantSkeletonGraph,
  node: SkeletonNode,
): LocalFrame {
  // Pick the first incident edge. For interior nodes any one works since the
  // populator is best-effort; downstream consumers refine if needed.
  const edgeId = node.edgeIds[0];
  const edge = edgeId !== undefined ? graph.edges.get(edgeId) : undefined;
  if (!edge || edge.bonePath.length === 0) {
    return { tangent: WORLD_UP, normal: { x: 1, y: 0, z: 0 } as PlantLocalV3 };
  }
  const isEndNode = edge.endNodeId === node.id;
  const bone = isEndNode ? edge.bonePath[edge.bonePath.length - 1] : edge.bonePath[0];
  const dir = isEndNode
    ? { x: bone.p1.x - bone.p0.x, y: bone.p1.y - bone.p0.y, z: bone.p1.z - bone.p0.z }
    : { x: bone.p1.x - bone.p0.x, y: bone.p1.y - bone.p0.y, z: bone.p1.z - bone.p0.z };
  const tangent = normalize(dir);
  // normal = world-up × tangent, normalized. If parallel, fall back to world-x.
  const c = cross(WORLD_UP, tangent);
  const cLen = len(c);
  const normal: PlantLocalV3 = cLen > 1e-6
    ? normalize(c)
    : ({ x: 1, y: 0, z: 0 } as PlantLocalV3);
  return { tangent, normal };
}

/**
 * Populate node.type / frame / visualHint on every node of the graph.
 *
 * In-place — modifies the graph passed in. Idempotent.
 */
export function populateNodeTypes(graph: PlantSkeletonGraph): void {
  for (const node of graph.nodes.values()) {
    const type = nodeTypeFromId(node.id);
    node.type = type;
    node.frame = computeFrame(graph, node);
    node.visualHint = defaultVisualHint(type);
  }
}
