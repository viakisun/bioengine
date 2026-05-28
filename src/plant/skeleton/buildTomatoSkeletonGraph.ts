// buildTomatoSkeletonGraph — TomatoPlugin partial (SSOT Phase 3).
//
// Iter 26 PR 2-0 (SSOT #187) — UNIQUE simulation → graph mapping point.
// All PlantBase / PlantState / cultivar JSONC reads happen inside this
// function (or its helper modules in ./populator/*). Skin / Overlay /
// AcceptanceProbe never read simulation truth directly — they read the
// returned graph. See docs/architecture/SEMANTIC_GRAPH.md sections 1, 3.
//
// Converts PlantBase (computed by computePlantGeometry — world-space output
// equals plant-local when the plant is at scene origin) into a formal
// SemanticSkeletonGraph: nodes + edges + organ anchors + visual hints,
// with cut hierarchy.
//
// The graph is the input to PlantSkinMeshBuilder (Phase 4) which produces
// a single watertight continuous mesh, and to Phase 5 cut/detach which
// uses parentEdgeId chains to identify what falls when an edge is cut.
//
// Helper modules (populator/*) — added across PR 2-1/2-2/2-3 to keep this
// file under ~500 LOC:
//   - populator/populateNodeTypes.ts        (PR 2-1) — node.type/frame/visualHint
//   - populator/populateAnchorMorphology.ts (PR 2-2) — organAnchor 4 fields
//   - populator/populateEdgePolicies.ts     (PR 2-3) — edge.renderPolicy
//   - populator/visualHintDefaults.ts       (PR 2-1) — type → hint lookup
//
// Topology choices:
//   - mainStem / sideShoot: one edge per axis (single bonePath).
//     Mid-edge attach nodes (leaf, truss) carry multi-edge incidence but
//     the stem edge is not subdivided — mainStem is cuttable=false so
//     mid-edge cut is irrelevant.
//   - petiole: one edge per visible leaf, parent = stem.
//   - peduncle: one edge per visible truss, parent = stem.
//   - rachis: sub-divided per knuckle. Each sub-edge connects two
//     consecutive nodes (peduncleEnd → knuckle[0] → knuckle[1] → ...).
//     This is required so that cutting rachis mid-way detaches only
//     the distal sites + their pedicels, not all of them.
//   - pedicel: one edge per floral site, parent = the rachis sub-edge
//     ending at that site's knuckle.
//
// Bone path densification uses catmullRomPath at divisions=4 (configurable)
// — 16 sample points per 4-cp curve → 15 capsule segments per organ.

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ACTIVE_MODEL } from '@farmsim/tomato-engine/ModelRegistry';
import type { PlantBase, AxisBase, TrussBase, LeafBase } from '../PlantBase';
import { catmullRomPath } from '../StemGenerator';
import type {
  PlantSkeletonGraph,
  SkeletonNode,
  SkeletonEdge,
  SkeletonBone,
  SkeletonEdgeType,
} from './PlantSkeletonGraph';

type V3 = { x: number; y: number; z: number };

/** Iter 18B PR 9 — exported so SkeletonEngine can re-use. */
export interface BuildSkeletonOpts {
  /** Curve subdivisions per inter-control-point segment. Higher = denser
   *  bone path, smoother SDF surface. Default 4. */
  curveDivisions?: number;
}

export function buildTomatoSkeletonGraph(
  plantBase: PlantBase,
  opts: BuildSkeletonOpts = {},
): PlantSkeletonGraph {
  const divisions = opts.curveDivisions ?? 4;
  const anatomy = ACTIVE_MODEL.trussAnatomy;

  const nodes = new Map<string, SkeletonNode>();
  const edges = new Map<string, SkeletonEdge>();

  const allAxes: AxisBase[] = [plantBase.mainAxis, ...plantBase.sideShoots];

  let rootEdgeId = '';

  for (let axisIdx = 0; axisIdx < allAxes.length; axisIdx++) {
    const axis = allAxes[axisIdx];
    if (axis.stemCurve.length === 0) continue;

    const isMain = axisIdx === 0;
    const stemEdgeId = isMain ? 'e:mainStem' : `e:sideShoot:${axisIdx}`;
    const stemType: SkeletonEdgeType = isMain ? 'mainStem' : 'sideShoot';
    if (isMain) rootEdgeId = stemEdgeId;

    addStemAxis(axis, axisIdx, stemEdgeId, stemType, nodes, edges);
    addLeavesForAxis(axis, axisIdx, stemEdgeId, divisions, nodes, edges);
    addTrussesForAxis(axis, axisIdx, stemEdgeId, divisions, anatomy, nodes, edges);
  }

  return { nodes, edges, rootEdgeId };
}

// ── Main / side stem axis ─────────────────────────────────────────────

function addStemAxis(
  axis: AxisBase,
  axisIdx: number,
  stemEdgeId: string,
  stemType: SkeletonEdgeType,
  nodes: Map<string, SkeletonNode>,
  edges: Map<string, SkeletonEdge>,
): void {
  // One node per stemCurve segment. nodeIdx is preserved for attach lookup.
  for (let i = 0; i < axis.stemCurve.length; i++) {
    const seg = axis.stemCurve[i];
    const nodeId = stemNodeId(axisIdx, seg.nodeIdx);
    nodes.set(nodeId, {
      id: nodeId,
      pos: { ...seg.position },
      radius: seg.radius,
      edgeIds: [stemEdgeId],
    });
  }

  // One bone per consecutive segment pair.
  const stemBones: SkeletonBone[] = [];
  for (let i = 0; i < axis.stemCurve.length - 1; i++) {
    const a = axis.stemCurve[i];
    const b = axis.stemCurve[i + 1];
    stemBones.push({
      p0: { ...a.position },
      p1: { ...b.position },
      r0: a.radius,
      r1: b.radius,
    });
  }
  if (stemBones.length === 0) {
    // Single segment — emit degenerate bone (acts as sphere at p0).
    const only = axis.stemCurve[0];
    stemBones.push({
      p0: { ...only.position },
      p1: { ...only.position },
      r0: only.radius,
      r1: only.radius,
    });
  }

  const startSeg = axis.stemCurve[0];
  const endSeg = axis.stemCurve[axis.stemCurve.length - 1];

  edges.set(stemEdgeId, {
    id: stemEdgeId,
    type: stemType,
    startNodeId: stemNodeId(axisIdx, startSeg.nodeIdx),
    endNodeId: stemNodeId(axisIdx, endSeg.nodeIdx),
    bonePath: stemBones,
    parentEdgeId: null,
    cuttable: false,
    semanticLabel: axisIdx === 0 ? 'main stem' : `side shoot ${axisIdx}`,
    attachedOrganIds: [],
  });
}

// ── Iter 18A SSOT #176 — organ visibility predicates ────────────────────
//
// 모든 stem-family edge 생성과 leaf blade / truss organ mesh 생성은 동일
// predicate를 통과해야 한다. 한 organ을 부분만 렌더하지 않는다 (e.g. petiole
// 있는데 leaf blade 없는 floating fragment 방지).

/** sizeFactor 하한 — engine pruned threshold (leafMaturity < 0.05)와 통일. */
export const LEAF_VISIBILITY_THRESHOLD = 0.05;

export function isLeafOrganVisible(leaf: {
  visibility: { visible: boolean };
  sizeFactor: number;
}): boolean {
  return leaf.visibility.visible && leaf.sizeFactor >= LEAF_VISIBILITY_THRESHOLD;
}

type TrussWithCurves<T> = T & {
  peduncleCurve: NonNullable<T extends { peduncleCurve?: infer P } ? P : never>;
  rachisCurve: NonNullable<T extends { rachisCurve?: infer P } ? P : never>;
  floralSites: NonNullable<T extends { floralSites?: infer P } ? P : never>;
};

export function isTrussOrganVisible<T extends {
  visibility: { visible: boolean };
  peduncleCurve?: ReadonlyArray<unknown> | unknown[];
  rachisCurve?: ReadonlyArray<unknown> | unknown[];
  floralSites?: ReadonlyArray<unknown> | unknown[];
}>(truss: T): truss is TrussWithCurves<T> {
  if (!truss.visibility.visible) return false;
  if (!truss.peduncleCurve || !truss.rachisCurve || !truss.floralSites) return false;
  if (truss.peduncleCurve.length < 2) return false;
  return true;
}

// ── Leaf petioles ─────────────────────────────────────────────────────

function addLeavesForAxis(
  axis: AxisBase,
  axisIdx: number,
  stemEdgeId: string,
  divisions: number,
  nodes: Map<string, SkeletonNode>,
  edges: Map<string, SkeletonEdge>,
): void {
  for (const leaf of axis.leaves) {
    if (!isLeafOrganVisible(leaf)) continue;
    if (leaf.petioleCurve.length < 2) continue;

    const attachNodeId = stemNodeId(axisIdx, leaf.nodeIdx);
    const attachNode = nodes.get(attachNodeId);
    if (!attachNode) continue;

    const petioleEdgeId = `e:petiole:axis${axisIdx}:n${leaf.nodeIdx}`;
    const tipNodeId = `n:petiole_tip:axis${axisIdx}:n${leaf.nodeIdx}`;

    // Radii match leafChunk.ts:93-94 so visual continuity with existing
    // leaf blade mesh attach point.
    const baseR = 0.0018 * leaf.sizeFactor;
    const tipR = 0.0012 * leaf.sizeFactor;
    const bones = bonesFromCurve(leaf.petioleCurve, baseR, tipR, divisions);
    const tipPos = bones[bones.length - 1].p1;

    nodes.set(tipNodeId, {
      id: tipNodeId,
      pos: { ...tipPos },
      radius: tipR,
      edgeIds: [petioleEdgeId],
    });
    attachNode.edgeIds.push(petioleEdgeId);

    // Iter 18B PR 8 (SSOT #180) — structured OrganAnchor for leaf blade.
    // anchorNodeId = petiole tip (the same node the legacy id encodes).
    const leafBladeAnchorId = `leaf_blade:axis${axisIdx}:n${leaf.nodeIdx}`;
    edges.set(petioleEdgeId, {
      id: petioleEdgeId,
      type: 'petiole',
      startNodeId: attachNodeId,
      endNodeId: tipNodeId,
      bonePath: bones,
      parentEdgeId: stemEdgeId,
      cuttable: true,
      semanticLabel: `leaf ${leaf.nodeIdx} petiole`,
      attachedOrganIds: [leafBladeAnchorId],
      organAnchors: [{ id: leafBladeAnchorId, kind: 'leaf_blade', anchorNodeId: tipNodeId }],
    });
  }
}

// ── Trusses (peduncle + rachis sub-edges + per-site pedicels) ─────────

function addTrussesForAxis(
  axis: AxisBase,
  axisIdx: number,
  stemEdgeId: string,
  divisions: number,
  anatomy: typeof ACTIVE_MODEL.trussAnatomy,
  nodes: Map<string, SkeletonNode>,
  edges: Map<string, SkeletonEdge>,
): void {
  for (let trussIdx = 0; trussIdx < axis.trusses.length; trussIdx++) {
    const truss = axis.trusses[trussIdx];
    if (!isTrussOrganVisible(truss)) continue;

    const stemAttachNodeId = stemNodeId(axisIdx, truss.nodeIdx);
    const stemAttachNode = nodes.get(stemAttachNodeId);
    if (!stemAttachNode) continue;

    // ── Peduncle edge ──
    const peduncleEdgeId = `e:peduncle:axis${axisIdx}:t${trussIdx}`;
    const peduncleEndNodeId = `n:peduncle_end:axis${axisIdx}:t${trussIdx}`;

    const pedBaseR = anatomy.peduncle.radiusM;
    const pedTipR = anatomy.rachis.radiusBaseM;
    const pedBones = bonesFromCurve(truss.peduncleCurve, pedBaseR, pedTipR, divisions);
    const peduncleEndPos = pedBones[pedBones.length - 1].p1;

    nodes.set(peduncleEndNodeId, {
      id: peduncleEndNodeId,
      pos: { ...peduncleEndPos },
      radius: pedTipR,
      edgeIds: [peduncleEdgeId],
    });
    stemAttachNode.edgeIds.push(peduncleEdgeId);

    edges.set(peduncleEdgeId, {
      id: peduncleEdgeId,
      type: 'peduncle',
      startNodeId: stemAttachNodeId,
      endNodeId: peduncleEndNodeId,
      bonePath: pedBones,
      parentEdgeId: stemEdgeId,
      cuttable: true,
      semanticLabel: `truss ${trussIdx} peduncle`,
      attachedOrganIds: [],
    });

    // ── Rachis sub-edges (per knuckle) + pedicels ──
    const knuckles = truss.rachisKnuckles ?? [];
    let prevRachisEdgeId = peduncleEdgeId;
    let prevRachisNodeId = peduncleEndNodeId;

    for (let kIdx = 0; kIdx < knuckles.length; kIdx++) {
      const knuckle = knuckles[kIdx];
      const knuckleNodeId = `n:knuckle:axis${axisIdx}:t${trussIdx}:k${kIdx}`;
      const subRachisEdgeId = `e:rachis:axis${axisIdx}:t${trussIdx}:k${kIdx}`;

      // Linear radius taper along the rachis (base → tip).
      const tFrac = (kIdx + 1) / (knuckles.length + 1);
      const knuckleR =
        anatomy.rachis.radiusBaseM * (1 - tFrac) + anatomy.rachis.radiusTipM * tFrac;

      const prevNode = nodes.get(prevRachisNodeId)!;
      nodes.set(knuckleNodeId, {
        id: knuckleNodeId,
        pos: { ...knuckle },
        radius: knuckleR,
        edgeIds: [subRachisEdgeId],
      });
      prevNode.edgeIds.push(subRachisEdgeId);

      // Sub-rachis bones — densify the prev→knuckle segment so the
      // surface stays smooth even on short hops.
      const subBones = bonesFromCurve(
        [prevNode.pos, knuckle],
        prevNode.radius,
        knuckleR,
        Math.max(1, Math.floor(divisions / 2)),
      );

      edges.set(subRachisEdgeId, {
        id: subRachisEdgeId,
        type: 'rachis',
        startNodeId: prevRachisNodeId,
        endNodeId: knuckleNodeId,
        bonePath: subBones,
        parentEdgeId: prevRachisEdgeId,
        cuttable: true,
        semanticLabel: `truss ${trussIdx} rachis seg ${kIdx}`,
        attachedOrganIds: [],
      });

      // Pedicel for this knuckle's floral site (if present).
      const site = truss.floralSites[kIdx];
      if (site && site.pedicelCurve.length >= 2) {
        const pedicelEdgeId = `e:pedicel:axis${axisIdx}:t${trussIdx}:s${site.index}`;
        const pedicelTipNodeId = `n:pedicel_tip:axis${axisIdx}:t${trussIdx}:s${site.index}`;

        const pdBaseR = anatomy.pedicel.radiusBaseM;
        const pdTipR = anatomy.pedicel.radiusTipM;
        const pdBones = bonesFromCurve(site.pedicelCurve, pdBaseR, pdTipR, divisions);

        nodes.set(pedicelTipNodeId, {
          id: pedicelTipNodeId,
          pos: { ...site.fruitTop },
          radius: pdTipR,
          edgeIds: [pedicelEdgeId],
        });
        nodes.get(knuckleNodeId)!.edgeIds.push(pedicelEdgeId);

        const attachedOrganIds = [
          `flower:axis${axisIdx}:t${trussIdx}:s${site.index}`,
          `fruit:axis${axisIdx}:t${trussIdx}:s${site.index}`,
          `calyx:axis${axisIdx}:t${trussIdx}:s${site.index}`,
        ];

        // Iter 18B PR 8 (SSOT #180) — structured OrganAnchors for flower /
        // fruit / calyx at pedicel tip.
        const organAnchors: import('./PlantSkeletonGraph').OrganAnchor[] = [
          { id: `flower:axis${axisIdx}:t${trussIdx}:s${site.index}`, kind: 'flower', anchorNodeId: pedicelTipNodeId },
          { id: `fruit:axis${axisIdx}:t${trussIdx}:s${site.index}`,  kind: 'fruit',  anchorNodeId: pedicelTipNodeId },
          { id: `calyx:axis${axisIdx}:t${trussIdx}:s${site.index}`,  kind: 'calyx',  anchorNodeId: pedicelTipNodeId },
        ];
        edges.set(pedicelEdgeId, {
          id: pedicelEdgeId,
          type: 'pedicel',
          startNodeId: knuckleNodeId,
          endNodeId: pedicelTipNodeId,
          bonePath: pdBones,
          parentEdgeId: subRachisEdgeId,
          cuttable: true,
          semanticLabel: `pedicel site ${site.index}`,
          attachedOrganIds,
          organAnchors,
        });
      }

      prevRachisEdgeId = subRachisEdgeId;
      prevRachisNodeId = knuckleNodeId;
    }
  }
}

// ── helpers ───────────────────────────────────────────────────────────

function stemNodeId(axisIdx: number, segNodeIdx: number): string {
  return `n:axis${axisIdx}:${segNodeIdx}`;
}

/**
 * Densify a control-point curve and build a list of tapered capsule bones.
 *
 * Takes 4-cp Catmull-Rom input (or any polyline of ≥2 points), interpolates
 * via catmullRomPath, then emits one capsule per consecutive sample pair
 * with radius linearly tapered baseR → tipR along the path.
 */
function bonesFromCurve(
  controlPoints: ReadonlyArray<V3>,
  baseR: number,
  tipR: number,
  divisions: number,
): SkeletonBone[] {
  const cps = controlPoints.map((p) => new Vector3(p.x, p.y, p.z));
  const dense = catmullRomPath(cps, Math.max(1, divisions));
  const n = dense.length;
  if (n < 2) {
    return [{
      p0: { x: cps[0].x, y: cps[0].y, z: cps[0].z },
      p1: { x: cps[0].x, y: cps[0].y, z: cps[0].z },
      r0: baseR,
      r1: tipR,
    }];
  }
  // Radius taper: smoothstep instead of linear so the mid-section keeps
  // its weight (user-spec: "skeleton 단위 + 중간 단위 두께 가중치"). Endpoints
  // identical to linear; the slope is gentler in the middle, giving an
  // organic tapering rather than a straight cone.
  const smoothstep = (t: number): number => t * t * (3 - 2 * t);
  const bones: SkeletonBone[] = [];
  for (let i = 0; i < n - 1; i++) {
    const t0 = smoothstep(i / (n - 1));
    const t1 = smoothstep((i + 1) / (n - 1));
    bones.push({
      p0: { x: dense[i].x, y: dense[i].y, z: dense[i].z },
      p1: { x: dense[i + 1].x, y: dense[i + 1].y, z: dense[i + 1].z },
      r0: baseR + (tipR - baseR) * t0,
      r1: baseR + (tipR - baseR) * t1,
    });
  }
  return bones;
}
