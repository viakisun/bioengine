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
  // Iter 36 v5: `n:leaflet:*`, `n:bud:*` — new compound leaf + axillary bud nodes.
  if (id.startsWith('n:leaflet:')) return 'leaflet-node';
  if (id.startsWith('n:bud:')) return 'bud-node';
  // Iter 36 v5 Phase M: `n:cotyledon:*`, `n:apex:*` — 발아 + 생장점.
  if (id.startsWith('n:cotyledon:')) return 'cotyledon-node';
  if (id.startsWith('n:apex:')) return 'apex-node';
  // Iter 36 v5 Phase O: `n:rachis-attach:*` — 잎줄기 부착점 (마디).
  if (id.startsWith('n:rachis-attach:')) return 'rachis-attach-node';
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
 * Compute node tangent from first incident edge's bonePath.
 * Shared by legacy (computeFrame) and Iter 31 (computeFrameWithTransport).
 */
function computeNodeTangent(
  graph: PlantSkeletonGraph,
  node: SkeletonNode,
): PlantLocalV3 {
  const edgeId = node.edgeIds[0];
  const edge = edgeId !== undefined ? graph.edges.get(edgeId) : undefined;
  if (!edge || edge.bonePath.length === 0) return WORLD_UP;
  const isEndNode = edge.endNodeId === node.id;
  const bone = isEndNode ? edge.bonePath[edge.bonePath.length - 1] : edge.bonePath[0];
  return normalize({
    x: bone.p1.x - bone.p0.x,
    y: bone.p1.y - bone.p0.y,
    z: bone.p1.z - bone.p0.z,
  });
}

/**
 * Legacy fallback frame — WORLD_UP × tangent.
 * Iter 31 Phase 3 (R4 fix) — _axis root nodes 전용_ + non-stem typed nodes 전용.
 * Curved-stem 구간에서는 computeFrameWithTransport를 사용해야 normal.y XZ-plane
 * lock을 피함.
 */
function fallbackNormal(tangent: PlantLocalV3): PlantLocalV3 {
  const c = cross(WORLD_UP, tangent);
  const cLen = len(c);
  return cLen > 1e-6
    ? normalize(c)
    : ({ x: 1, y: 0, z: 0 } as PlantLocalV3);
}

/**
 * Legacy compute (Iter 26~30). Retained for typed leaves (petiole_tip 등) which
 * don't need axis-propagated continuity.
 */
function computeFrame(
  graph: PlantSkeletonGraph,
  node: SkeletonNode,
): LocalFrame {
  const tangent = computeNodeTangent(graph, node);
  return { tangent, normal: fallbackNormal(tangent) };
}

/**
 * Iter 31 Phase 3 (R4 fix) — Parallel-transport frame.
 *
 * Root cause: legacy `normal = WORLD_UP × tangent`는 모든 frame을 XZ horizontal
 * plane에 lock (Phase 0.0 baseline: D=30~D=90 _모든_ node normal.y = 0).
 *
 * Fix: 이전 node의 normal을 _현재 tangent 평면_에 project (Gram-Schmidt).
 * - prevFrame 있음 → projected normal = prev.normal - (prev.normal · tangent) × tangent
 * - prevFrame 없음 (axis 첫 node, fallback OK) → WORLD_UP × tangent
 *
 * 결과: 곡선 stem 위 연속 node가 _다른_ normal 가짐 → leaf droop이 다양한
 * binormal axis 주위 → fern frond stack 해소.
 */
function computeFrameWithTransport(
  graph: PlantSkeletonGraph,
  node: SkeletonNode,
  prevFrame: LocalFrame | undefined,
): LocalFrame {
  const tangent = computeNodeTangent(graph, node);

  let normal: PlantLocalV3;
  if (prevFrame) {
    // Gram-Schmidt projection: n' = n - (n·t)t
    const dot = prevFrame.normal.x * tangent.x
      + prevFrame.normal.y * tangent.y
      + prevFrame.normal.z * tangent.z;
    const projected = {
      x: prevFrame.normal.x - dot * tangent.x,
      y: prevFrame.normal.y - dot * tangent.y,
      z: prevFrame.normal.z - dot * tangent.z,
    };
    normal = len(projected) > 1e-6
      ? normalize(projected)
      : fallbackNormal(tangent);
  } else {
    normal = fallbackNormal(tangent);
  }
  return { tangent, normal };
}

/**
 * Extract axis index from node id (e.g. `n:axis2:n5` → 2, `n:petiole_tip:axis0:n3` → 0).
 * Returns null if no axis pattern matched.
 */
function parseAxisIndex(id: string): number | null {
  const m = id.match(/axis(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Extract node ordinal from id (e.g. `n:axis0:n12` → 12). Returns null if no n{N}.
 */
function parseNodeOrdinal(id: string): number | null {
  const m = id.match(/:n(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** Euclidean distance². */
function dist2(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Populate node.type / frame / visualHint on every node of the graph.
 *
 * Iter 31 Phase 3 (R4 fix) — axis별 parallel-transport frame propagation.
 *
 * Steps:
 *   1. typed leaves (petiole_tip, peduncle_end, pedicel_tip, knuckle): legacy fallback frame.
 *   2. main-axis stem nodes (n:axis0:*): ordinal 순 parallel-transport.
 *   3. side-shoot stem nodes (n:axis{N}:*): 첫 node frame seed = 위치 가장 가까운 main-axis frame,
 *      이후 ordinal 순 parallel-transport.
 *
 * In-place — modifies the graph passed in. Idempotent.
 */
export function populateNodeTypes(graph: PlantSkeletonGraph): void {
  // Step 1: classify + assign type + initial frame (typed leaves only)
  const mainAxisNodes: SkeletonNode[] = [];
  const sideAxisNodes = new Map<number, SkeletonNode[]>();

  for (const node of graph.nodes.values()) {
    const type = nodeTypeFromId(node.id);
    node.type = type;
    node.visualHint = defaultVisualHint(type);
    if (type === 'main-stem-node') {
      mainAxisNodes.push(node);
    } else if (type === 'side-shoot-node') {
      const axisIdx = parseAxisIndex(node.id);
      if (axisIdx != null && axisIdx > 0) {
        const list = sideAxisNodes.get(axisIdx) ?? [];
        list.push(node);
        sideAxisNodes.set(axisIdx, list);
      } else {
        // axis index 파싱 실패 → legacy fallback
        node.frame = computeFrame(graph, node);
      }
    } else {
      // typed leaves (petiole_tip, peduncle_end, ...) — legacy fallback OK
      node.frame = computeFrame(graph, node);
    }
  }

  // Step 2: main-axis parallel-transport (ordinal sort)
  mainAxisNodes.sort((a, b) => (parseNodeOrdinal(a.id) ?? 0) - (parseNodeOrdinal(b.id) ?? 0));
  let prevMainFrame: LocalFrame | undefined;
  for (const node of mainAxisNodes) {
    node.frame = computeFrameWithTransport(graph, node, prevMainFrame);
    prevMainFrame = node.frame;
  }

  // Step 3: side-shoot axes — seed first frame from nearest main-axis node.
  // ★ SIDE-FRAME-PARENT-SEED-01 (Iter 31 Plan v3 review 5).
  //   단순 fallback (WORLD_UP × tangent)은 side-shoot에서 XZ plane lock 유발.
  //   side-shoot 첫 node의 _공간상 가장 가까운_ main-axis frame을 prevFrame seed로.
  for (const [, sideNodes] of sideAxisNodes) {
    sideNodes.sort((a, b) => (parseNodeOrdinal(a.id) ?? 0) - (parseNodeOrdinal(b.id) ?? 0));
    let prevFrame: LocalFrame | undefined;
    if (sideNodes.length > 0 && mainAxisNodes.length > 0) {
      const firstSide = sideNodes[0];
      let bestMain: SkeletonNode | undefined;
      let bestDist = Infinity;
      for (const m of mainAxisNodes) {
        const d = dist2(firstSide.pos, m.pos);
        if (d < bestDist) {
          bestDist = d;
          bestMain = m;
        }
      }
      prevFrame = bestMain?.frame;  // parent main frame seed
    }
    for (const node of sideNodes) {
      node.frame = computeFrameWithTransport(graph, node, prevFrame);
      prevFrame = node.frame;
    }
  }
}
