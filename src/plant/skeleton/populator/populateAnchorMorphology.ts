// SSOT #187 — Populate OrganAnchor morphology + state + chain + visualHint.
//
// Iter 26 PR 2-2. For every OrganAnchor on every edge:
//   - chain: rootNodeId + attachmentNodeId + supportEdgeId + node/edge chains.
//   - morphology: static shape (PlantBase / cultivar copy).
//   - state: per-tick simulation (PlantState copy; original 원칙 3).
//   - visualHint: self-describing color + label (overlay reads directly).
//
// See: docs/architecture/SEMANTIC_GRAPH.md sections 2.3, 3.
// See: PR 2-AUDIT (linear-stargazing-pretzel.md追加 audit) for the exact
// PlantState / cultivar fields each organ kind consumes.

import type {
  AnchorMorphologyHint,
  AnchorVisualHint,
  OrganAnchor,
  OrganChain,
  OrganState,
  PlantSkeletonGraph,
  SkeletonEdge,
} from '../PlantSkeletonGraph';
import type { PlantBase, AxisBase, LeafBase, FloralSiteBase } from '../../PlantBase';
import type { PlantState, NodeState } from '@farmsim/tomato-engine/GrowthModel';
import type { PlantGenome } from '@farmsim/tomato-engine/PlantGenome';

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

/** Side-shoot leaf state lookup is not yet supported — main axis only.
 *  Returns undefined for side shoots; populator falls back to PlantBase-only
 *  morphology (state stays partially populated). */
function findNodeState(state: PlantState, axisIdx: number, nodeIdx: number): NodeState | undefined {
  if (axisIdx !== 0) return undefined; // side shoots not in state.nodes
  return state.nodes.find((n) => n.index === nodeIdx);
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

// ── Chain composition ─────────────────────────────────────────────────

function buildChain(edge: SkeletonEdge): OrganChain {
  // For every supported anchor edge type (petiole / pedicel), the support
  // edge runs from rootNode (start) to anchorNode (end). nodeChain captures
  // just those two nodes; edgeChain just the one support edge. Future
  // multi-segment chains (e.g. rachis-spanning) can extend this without
  // changing the shape.
  return {
    rootNodeId: edge.startNodeId,
    attachmentNodeId: edge.endNodeId,
    supportEdgeId: edge.id,
    nodeChain: [edge.startNodeId, edge.endNodeId],
    edgeChain: [edge.id],
  };
}

// ── Stage / vigor heuristics ──────────────────────────────────────────

function leafGrowthStage(maturity: number, yellowing: number): OrganState['growthStage'] {
  if (yellowing > 0.5) return 'senescing';
  if (maturity < 0.3) return 'emerging';
  if (maturity < 0.9) return 'expanding';
  return 'mature';
}

function fruitGrowthStage(ripenStage: number): OrganState['growthStage'] {
  // ripenStage 0..5 (녹숙기 → 완숙기)
  if (ripenStage < 1) return 'expanding';
  if (ripenStage < 4) return 'mature';
  return 'senescing';
}

// ── Per-kind populators ───────────────────────────────────────────────

function fillLeafAnchor(
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

  // morphology: PlantBase first (sizeFactor / droopRad), then PlantState
  // (leafletCount, ageFracForGravity composite).
  const morphology: AnchorMorphologyHint = { kind: 'leaf' };
  if (leaf) {
    morphology.sizeFactor = leaf.sizeFactor;
    morphology.droopFactor = leaf.droopRad;
    morphology.leafletCount = leaf.leafletCount;
  }
  if (nodeState) {
    if (morphology.leafletCount === undefined) morphology.leafletCount = nodeState.leafletCount;
    morphology.maturity = nodeState.leafMaturity;
    morphology.ageFracForGravity =
      Math.max(nodeState.droopExtra / 120, nodeState.age / 80) + nodeState.waterStress * 0.3;
  }
  anchor.morphology = morphology;

  // state: per-tick. visibility from PlantBase (already filtered upstream by
  // isLeafOrganVisible, but record it for symmetry).
  const organState: OrganState = {
    visibility: leaf?.visibility.visible ?? true,
  };
  if (nodeState) {
    organState.growthStage = leafGrowthStage(nodeState.leafMaturity, nodeState.yellowing);
    organState.yellowing = nodeState.yellowing;
    organState.waterStress = nodeState.waterStress;
    organState.diseaseLoad = nodeState.diseaseLoad;
    organState.vigor = Math.max(0, 1 - nodeState.yellowing - 0.5 * nodeState.diseaseLoad);
  }
  anchor.state = organState;

  // visualHint
  const stage = organState.growthStage ?? 'expanding';
  const visualHint: AnchorVisualHint = {
    markerColor: '#9ACD32', // yellow green
    label: `leaf#${nodeIdx} ${stage}`,
    showAttachmentLine: true,
  };
  anchor.visualHint = visualHint;
}

function fillFruitAnchor(
  anchor: OrganAnchor,
  edge: SkeletonEdge,
  axisIdx: number,
  trussIdx: number,
  siteIdx: number,
  plantBase: PlantBase,
): void {
  anchor.chain = buildChain(edge);
  const axis = axisAt(plantBase, axisIdx);
  const site = axis ? findFloralSite(axis, trussIdx, siteIdx) : undefined;
  const fruit = site?.fruit;

  const morphology: AnchorMorphologyHint = { kind: 'fruit' };
  if (fruit) {
    morphology.targetDiameterM = fruit.diameterMm / 1000;
    morphology.ripeness = fruit.ripenFraction;
    morphology.maturity = Math.min(1, fruit.ripenStage / 5);
    if (fruit.cultivarGenome) morphology.fruitGenome = fruit.cultivarGenome;
  }
  anchor.morphology = morphology;

  const organState: OrganState = {
    visibility: site?.visibility.visible ?? false,
  };
  if (fruit) {
    organState.growthStage = fruitGrowthStage(fruit.ripenStage);
    organState.vigor = 1.0;
  }
  anchor.state = organState;

  const stage = organState.growthStage ?? 'expanding';
  anchor.visualHint = {
    markerColor: '#FF6347', // tomato red
    label: `fruit#${siteIdx} ${stage}`,
    showAttachmentLine: true,
  };
}

function fillFlowerAnchor(
  anchor: OrganAnchor,
  edge: SkeletonEdge,
  axisIdx: number,
  trussIdx: number,
  siteIdx: number,
  plantBase: PlantBase,
): void {
  anchor.chain = buildChain(edge);
  const axis = axisAt(plantBase, axisIdx);
  const site = axis ? findFloralSite(axis, trussIdx, siteIdx) : undefined;
  const flower = site?.flower;

  anchor.morphology = { kind: 'flower' };

  const organState: OrganState = {
    visibility: site?.visibility.visible ?? false,
  };
  if (flower) {
    organState.growthStage = flower.bloomProgress < 0.3 ? 'emerging'
      : flower.bloomProgress < 0.9 ? 'expanding'
      : 'senescing';
    organState.vigor = 1 - flower.petalDrop;
  }
  anchor.state = organState;

  anchor.visualHint = {
    markerColor: '#FFD700', // gold
    label: `flower#${siteIdx}`,
    showAttachmentLine: true,
  };
}

function fillCalyxAnchor(
  anchor: OrganAnchor,
  edge: SkeletonEdge,
  axisIdx: number,
  trussIdx: number,
  siteIdx: number,
  plantBase: PlantBase,
): void {
  anchor.chain = buildChain(edge);
  const axis = axisAt(plantBase, axisIdx);
  const site = axis ? findFloralSite(axis, trussIdx, siteIdx) : undefined;

  anchor.morphology = { kind: 'calyx' };
  anchor.state = {
    visibility: site?.visibility.visible ?? false,
  };
  anchor.visualHint = {
    markerColor: '#228B22', // forest green
    label: `calyx#${siteIdx}`,
    showAttachmentLine: true,
  };
}

// ── Entry ─────────────────────────────────────────────────────────────

/**
 * Walk every organAnchor on every edge and populate chain + morphology +
 * state + visualHint. In-place; idempotent. Safe to call without state /
 * genome (partial populate — Skin must tolerate missing fields).
 */
export function populateAnchorMorphology(
  graph: PlantSkeletonGraph,
  plantBase: PlantBase,
  state?: PlantState,
  // genome is stored on graph.cultivarGenomeSnapshot by the caller; this
  // function only needs it to mark intent (currently unused — reserved for
  // future leaf-shape morphology fields).
  _genome?: PlantGenome,
): void {
  for (const edge of graph.edges.values()) {
    if (!edge.organAnchors) continue;
    for (const anchor of edge.organAnchors) {
      const parsed = parseAnchorId(anchor);
      if (!parsed) continue;
      if (parsed.kind === 'leaf_blade') {
        fillLeafAnchor(anchor, edge, parsed.axisIdx, parsed.nodeIdx, plantBase, state);
      } else if (parsed.kind === 'fruit') {
        fillFruitAnchor(anchor, edge, parsed.axisIdx, parsed.trussIdx, parsed.siteIdx, plantBase);
      } else if (parsed.kind === 'flower') {
        fillFlowerAnchor(anchor, edge, parsed.axisIdx, parsed.trussIdx, parsed.siteIdx, plantBase);
      } else if (parsed.kind === 'calyx') {
        fillCalyxAnchor(anchor, edge, parsed.axisIdx, parsed.trussIdx, parsed.siteIdx, plantBase);
      }
    }
  }
}
