// Iter 29 Phase 3 — Populate OrganAnchor transform + SkeletonNode.phytomer.
//
// Plan §3 (sleepy-growing-pretzel.md). Replaces the Iter 26 PR 2-2
// morphology/state populator with the Phase 3 anchor-purity contract:
//
//   - SkeletonNode.phytomer = direct reference to PhytomerNode (Plan §13.2)
//   - OrganAnchor.position  = attachment point (Vec3, plant-local)
//   - OrganAnchor.rotation  = posture quaternion (PlantBase-computed; populator copies)
//   - OrganAnchor.chain     = preserved (Iter 26 PR 1-2 geometric path)
//   - OrganAnchor.visualHint= preserved (Iter 26 PR 1-2 overlay self-description)
//   - OrganAnchor.debugHint = derived from visualHint + chain visibility
//
//   ★ Removed (Phase 3 SKELETON-ANCHOR-PURE-01):
//   - OrganAnchor.morphology — read via SkeletonNode.phytomer.leaf instead
//   - OrganAnchor.state      — read via SkeletonNode.phytomer.leaf.senescence etc.
//
//   ★ Removed (Phase 3 SKELETON-NO-GROWTH-CALC-01):
//   - Stage classifiers (leafGrowthStage / fruitGrowthStage) — Skeleton must
//     NOT recompute growth state. PlantBase computes PhytomerNode and the
//     populator copies the reference into SkeletonNode.phytomer.
//
// Backward compat:
//   - Skin path readers of anchor.morphology/state are migrated in Phase 4
//     (SKIN-NO-LEAFBASE-01 + SKIN-NO-GROWTH-LOGIC-01).

import type {
  AnchorDebugHint,
  AnchorVisualHint,
  OrganAnchor,
  OrganChain,
  PhytomerNodeRef,
  PlantSkeletonGraph,
  SkeletonEdge,
  SkeletonNode,
} from '../PlantSkeletonGraph';
import type { PlantBase, AxisBase, LeafBase, FloralSiteBase } from '../../PlantBase';
import type { PlantState, NodeState } from '@farmsim/tomato-engine/GrowthModel';
import type { PlantGenome } from '@farmsim/tomato-engine/PlantGenome';
import { composeLeafRotation, composeLeafRotationLocal, IDENTITY_QUAT } from '../AnchorTransform';

// ── Anchor id parsing ─────────────────────────────────────────────────

interface LeafAnchorIds {
  kind: 'leaf_blade';
  axisIdx: number;
  nodeIdx: number;
}
interface SiteAnchorIds {
  kind: 'flower' | 'fruit' | 'calyx';
  axisIdx: number;
  trussIdx: number;
  siteIdx: number;
}
type AnchorIds = LeafAnchorIds | SiteAnchorIds | null;

function parseAnchorId(anchor: OrganAnchor): AnchorIds {
  // leaf_blade:axis{N}:n{I}
  const leafMatch = anchor.id.match(/^leaf_blade:axis(\d+):n(\d+)$/);
  if (leafMatch) {
    return {
      kind: 'leaf_blade',
      axisIdx: Number(leafMatch[1]),
      nodeIdx: Number(leafMatch[2]),
    };
  }
  // flower|fruit|calyx:axis{N}:t{T}:s{S}
  const siteMatch = anchor.id.match(/^(flower|fruit|calyx):axis(\d+):t(\d+):s(\d+)$/);
  if (siteMatch) {
    return {
      kind: siteMatch[1] as 'flower' | 'fruit' | 'calyx',
      axisIdx: Number(siteMatch[2]),
      trussIdx: Number(siteMatch[3]),
      siteIdx: Number(siteMatch[4]),
    };
  }
  return null;
}

// ── Source lookups ────────────────────────────────────────────────────

function axisAt(plantBase: PlantBase, axisIdx: number): AxisBase | undefined {
  if (axisIdx === 0) return plantBase.mainAxis;
  const sideIdx = axisIdx - 1;
  return plantBase.sideShoots[sideIdx];
}

function findLeafBase(axis: AxisBase, nodeIdx: number): LeafBase | undefined {
  return axis.leaves.find((l) => l.nodeIdx === nodeIdx);
}

/**
 * Iter 30 Phase 0.B (R2 fix) — Find NodeState by axisIdx + nodeIdx.
 *
 * 이전 (Iter 29까지): `axisIdx !== 0`이면 undefined → 측지 phytomer 미바인딩
 * → leaf mesh bbox=0. SIDE-SHOOT-PHYTOMER-BIND-01 결함.
 *
 * Phase 0.B fix:
 *   - axisIdx === 0: main axis nodes (state.nodes 동일)
 *   - axisIdx > 0: state.allAxes 중 order>0인 axes에서 순회 lookup
 *
 * ★ axisIdx traversal order 의존성 (사용자 review 2번, SIDE-SHOOT-AXIS-ID-01):
 *   sideAxes[axisIdx - 1] 단순 index 사용은 traversal 순서 변경 시 잘못된 axis로 mapping.
 *   Phase 0.B는 axisIdx 기반 1차 fix로 시작. axisId/chain consistency 검증은
 *   SIDE-SHOOT-AXIS-ID-01 invariant에서 확인 (anchor.chain.rootNodeId가
 *   해당 side axis의 parentNodeIdx와 일치하는지 자동 check).
 */
function findNodeState(state: PlantState, axisIdx: number, nodeIdx: number): NodeState | undefined {
  if (axisIdx === 0) return state.nodes.find((n) => n.index === nodeIdx);
  // Side-shoot: walk allAxes (filter order > 0)
  const sideAxes = state.allAxes.filter((a) => a.order > 0);
  // axisIdx convention: 1 = first side shoot in traversal order, etc.
  // Phase 0.B 1st cut: index-based. axisId-aware lookup은 Phase 1-Pre NodeGrowthContext.
  const targetAxis = sideAxes[axisIdx - 1];
  if (!targetAxis) return undefined;
  return targetAxis.nodes.find((n) => n.index === nodeIdx);
}

function findFloralSite(
  axis: AxisBase,
  trussIdx: number,
  siteIdx: number,
): FloralSiteBase | undefined {
  const truss = axis.trusses[trussIdx];
  if (!truss || !truss.floralSites) return undefined;
  return truss.floralSites.find((s) => s.index === siteIdx);
}

// ── Chain composition (unchanged from Iter 26 PR 2-2) ─────────────────

function buildChain(edge: SkeletonEdge): OrganChain {
  return {
    rootNodeId: edge.startNodeId,
    attachmentNodeId: edge.endNodeId,
    supportEdgeId: edge.id,
    nodeChain: [edge.startNodeId, edge.endNodeId],
    edgeChain: [edge.id],
  };
}

// ── Phytomer binding (Phase 3 SKELETON-PHYTOMER-01) ───────────────────

/**
 * Copy the engine PhytomerNode reference into the SkeletonNode.
 *
 * PlantBase owns the PhytomerNode object. Skeleton merely references it —
 * no recomputation (SKELETON-NO-GROWTH-CALC-01).
 */
function bindPhytomer(node: SkeletonNode, nodeState: NodeState): void {
  // Cast through unknown because the engine NodeState type is the canonical
  // version, and PhytomerNodeRef is the structural sibling in the skeleton
  // schema. They are designed to be assignment-compatible.
  node.phytomer = nodeState as unknown as PhytomerNodeRef;
}

// ── Per-kind populators ───────────────────────────────────────────────

function fillLeafAnchor(
  graph: PlantSkeletonGraph,
  anchor: OrganAnchor,
  edge: SkeletonEdge,
  axisIdx: number,
  nodeIdx: number,
  plantBase: PlantBase,
  state: PlantState | undefined,
): void {
  anchor.chain = buildChain(edge);
  const axis = axisAt(plantBase, axisIdx);
  const leaf = axis ? findLeafBase(axis, nodeIdx) : undefined;
  const nodeState = state ? findNodeState(state, axisIdx, nodeIdx) : undefined;

  // Phase 3 SKELETON-PHYTOMER-01 — bind PhytomerNode reference on the
  // mesh-anchor SkeletonNode (where Skin places the leaf mesh).
  if (nodeState) {
    const targetNodeId = anchor.meshAnchorNodeId ?? anchor.anchorNodeId;
    const targetNode = graph.nodes.get(targetNodeId);
    if (targetNode) bindPhytomer(targetNode, nodeState);
  }

  // Phase 3 SKELETON-ANCHOR-TRANSFORM-01 — position from mesh anchor node.
  const meshNode = graph.nodes.get(anchor.meshAnchorNodeId ?? anchor.anchorNodeId);
  if (meshNode) {
    anchor.position = { x: meshNode.pos.x, y: meshNode.pos.y, z: meshNode.pos.z };
  }

  // Iter 30 Phase 0.D (R4 fix) — Stem-local frame leaf rotation.
  //
  // 이전 (Iter 29 결함): composeLeafRotation은 world Y/X/Z 기반. stem이 휘어도
  // leaf가 world에 lock → 모든 잎이 동일 평면에 누적 (사용자 사진 #2 evidence).
  //
  // 신규: meshAnchorNode.frame (Iter 26 PR 2-1 populated)이 있으면
  // composeLeafRotationLocal로 stem-local axis 기준 회전.
  // frame 미존재 fallback은 legacy composeLeafRotation (안전한 점진 마이그레이션).
  //
  // SKELETON-ANCHOR-POSTURE-01 (Iter 29): rotation _copied_ from PlantBase posture.
  // SKELETON-ANCHOR-TRANSFORM-01 (Iter 29): Quat4 출력.
  if (nodeState) {
    const posture = nodeState.leaf.posture;
    if (meshNode?.frame) {
      anchor.rotation = composeLeafRotationLocal(
        meshNode.frame,
        posture.azimuthDeg,
        posture.droopDeg,
        posture.twistDeg,
      );
    } else {
      anchor.rotation = composeLeafRotation(
        posture.azimuthDeg,
        posture.droopDeg,
        posture.twistDeg,
      );
    }
  } else if (leaf) {
    // Fallback for non-state populator paths (rare after Phase 0.B fix) —
    // PlantBase leaf azimuth/droop direct.
    const azDeg = (leaf.azimuthRad ?? 0) * (180 / Math.PI);
    const droopDeg = (leaf.droopRad ?? 0) * (180 / Math.PI);
    if (meshNode?.frame) {
      anchor.rotation = composeLeafRotationLocal(meshNode.frame, azDeg, droopDeg, 0);
    } else {
      anchor.rotation = composeLeafRotation(azDeg, droopDeg, 0);
    }
  } else {
    anchor.rotation = IDENTITY_QUAT;
  }

  // visualHint (Iter 26 PR 1-2 retained)
  const visualHint: AnchorVisualHint = {
    markerColor: '#9ACD32', // yellow green
    label: `leaf#${nodeIdx}`,
    showAttachmentLine: true,
  };
  anchor.visualHint = visualHint;

  // Phase 3 SKELETON-ANCHOR-PURE-01 — debugHint (renderer-only).
  const debugHint: AnchorDebugHint = {
    markerColor: visualHint.markerColor,
    label: visualHint.label,
    showAttachmentLine: visualHint.showAttachmentLine,
  };
  anchor.debugHint = debugHint;
}

function fillFruitAnchor(
  graph: PlantSkeletonGraph,
  anchor: OrganAnchor,
  edge: SkeletonEdge,
  axisIdx: number,
  trussIdx: number,
  siteIdx: number,
  plantBase: PlantBase,
): void {
  anchor.chain = buildChain(edge);

  // Phase 3 SKELETON-ANCHOR-TRANSFORM-01 — position from mesh anchor node.
  const meshNode = graph.nodes.get(anchor.meshAnchorNodeId ?? anchor.anchorNodeId);
  if (meshNode) {
    anchor.position = { x: meshNode.pos.x, y: meshNode.pos.y, z: meshNode.pos.z };
  }
  // Fruits hang downward — droop applied at the base; no phyllotaxis (already
  // distributed along the truss). Phase 5 may refine via PhytomerNode.trussOrgan.
  anchor.rotation = IDENTITY_QUAT;

  const visualHint: AnchorVisualHint = {
    markerColor: '#FF6347', // tomato red
    label: `fruit#${siteIdx}`,
    showAttachmentLine: true,
  };
  anchor.visualHint = visualHint;
  anchor.debugHint = {
    markerColor: visualHint.markerColor,
    label: visualHint.label,
    showAttachmentLine: visualHint.showAttachmentLine,
  };
  // Reference plantBase for IDE go-to-definition completeness.
  void plantBase; void axisIdx; void trussIdx;
}

function fillFlowerAnchor(
  graph: PlantSkeletonGraph,
  anchor: OrganAnchor,
  edge: SkeletonEdge,
  axisIdx: number,
  trussIdx: number,
  siteIdx: number,
  plantBase: PlantBase,
): void {
  anchor.chain = buildChain(edge);
  const meshNode = graph.nodes.get(anchor.meshAnchorNodeId ?? anchor.anchorNodeId);
  if (meshNode) {
    anchor.position = { x: meshNode.pos.x, y: meshNode.pos.y, z: meshNode.pos.z };
  }
  anchor.rotation = IDENTITY_QUAT;
  const visualHint: AnchorVisualHint = {
    markerColor: '#FFD700', // gold
    label: `flower#${siteIdx}`,
    showAttachmentLine: true,
  };
  anchor.visualHint = visualHint;
  anchor.debugHint = {
    markerColor: visualHint.markerColor,
    label: visualHint.label,
    showAttachmentLine: visualHint.showAttachmentLine,
  };
  void plantBase; void axisIdx; void trussIdx;
}

function fillCalyxAnchor(
  graph: PlantSkeletonGraph,
  anchor: OrganAnchor,
  edge: SkeletonEdge,
  axisIdx: number,
  trussIdx: number,
  siteIdx: number,
  plantBase: PlantBase,
): void {
  anchor.chain = buildChain(edge);
  const meshNode = graph.nodes.get(anchor.meshAnchorNodeId ?? anchor.anchorNodeId);
  if (meshNode) {
    anchor.position = { x: meshNode.pos.x, y: meshNode.pos.y, z: meshNode.pos.z };
  }
  anchor.rotation = IDENTITY_QUAT;
  const visualHint: AnchorVisualHint = {
    markerColor: '#228B22', // forest green
    label: `calyx#${siteIdx}`,
    showAttachmentLine: true,
  };
  anchor.visualHint = visualHint;
  anchor.debugHint = {
    markerColor: visualHint.markerColor,
    label: visualHint.label,
    showAttachmentLine: visualHint.showAttachmentLine,
  };
  void plantBase; void axisIdx; void trussIdx;
}

// ── Entry ─────────────────────────────────────────────────────────────

/**
 * Walk every organAnchor on every edge and populate Phase 3 fields:
 *   - SkeletonNode.phytomer (for the mesh anchor node, when state is present)
 *   - OrganAnchor.position (spatial transform — attachment point)
 *   - OrganAnchor.rotation (spatial transform — posture quaternion, copied)
 *   - OrganAnchor.chain (geometric path — unchanged from Iter 26 PR 2-2)
 *   - OrganAnchor.visualHint + debugHint (renderer self-description)
 *
 * In-place; idempotent. Safe to call without state / genome (partial populate
 * — anchor.rotation falls back to PlantBase leaf angles or identity).
 */
export function populateAnchorMorphology(
  graph: PlantSkeletonGraph,
  plantBase: PlantBase,
  state?: PlantState,
  // genome is stored on graph.cultivarGenomeSnapshot by the caller; this
  // function only needs it to mark intent (currently unused — reserved for
  // future leaf-shape morphology fields on PhytomerNode.leaf.morphology).
  _genome?: PlantGenome,
): void {
  for (const edge of graph.edges.values()) {
    if (!edge.organAnchors) continue;
    for (const anchor of edge.organAnchors) {
      const parsed = parseAnchorId(anchor);
      if (!parsed) continue;
      if (parsed.kind === 'leaf_blade') {
        fillLeafAnchor(graph, anchor, edge, parsed.axisIdx, parsed.nodeIdx, plantBase, state);
      } else if (parsed.kind === 'fruit') {
        fillFruitAnchor(graph, anchor, edge, parsed.axisIdx, parsed.trussIdx, parsed.siteIdx, plantBase);
      } else if (parsed.kind === 'flower') {
        fillFlowerAnchor(graph, anchor, edge, parsed.axisIdx, parsed.trussIdx, parsed.siteIdx, plantBase);
      } else if (parsed.kind === 'calyx') {
        fillCalyxAnchor(graph, anchor, edge, parsed.axisIdx, parsed.trussIdx, parsed.siteIdx, plantBase);
      }
    }
  }
}
