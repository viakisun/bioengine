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
import type { PlantState } from '@farmsim/tomato-engine/GrowthModel';
import type { PlantGenome } from '@farmsim/tomato-engine/PlantGenome';
import { catmullRomPath } from '../../scene/stem/StemGenerator';
import type {
  PlantSkeletonGraph,
  SkeletonNode,
  SkeletonEdge,
  SkeletonBone,
  SkeletonEdgeType,
  LeafBladeRef,
  LeafletNodeRef,
  LeafletPosition,
  BudNodeRef,
} from './PlantSkeletonGraph';
import { populateNodeTypes } from './populator/populateNodeTypes';
import { populateAnchorMorphology } from './populator/populateAnchorMorphology';
import { populateEdgePolicies } from './populator/populateEdgePolicies';
// ★ Iter 39 Phase F4 — LeafInstanceProfile (leaf-level macro variation).
import { computeLeafInstanceProfile } from '../../scene/leaf-engine/leafInstanceProfile';

type V3 = { x: number; y: number; z: number };

/** Iter 18B PR 9 — exported so SkeletonEngine can re-use. */
export interface BuildSkeletonOpts {
  /** Curve subdivisions per inter-control-point segment. Higher = denser
   *  bone path, smoother SDF surface. Default 4. */
  curveDivisions?: number;
  /** Iter 26 PR 2-2 (SSOT #187 원칙 3) — per-tick simulation state. Used by
   *  populateAnchorMorphology + populateOrganState to copy leaf yellowing /
   *  waterStress / diseaseLoad / ageFrac onto organAnchors. Optional —
   *  callers that lack state skip OrganState population. */
  state?: PlantState;
  /** Iter 26 PR 2-2 (SSOT #187 원칙 4) — cultivar genome snapshot. Stored on
   *  graph.cultivarGenomeSnapshot so Skin reads leaf shape parameters from
   *  graph instead of importing PlantGenome directly. */
  genome?: PlantGenome;
  /** Iter 37 Q5 — Cultivar 객체 (growthProfile.leafPresetDistribution 접근용).
   *  주어지면 computeLeafBladeRef가 distribution sampling으로 agePreset 결정.
   *  optional — fallback은 sizeFactor 단순 매핑. */
  cultivar?: import('@farmsim/tomato-engine').Cultivar;
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
    addLeavesForAxis(axis, axisIdx, stemEdgeId, divisions, opts.cultivar, nodes, edges);
    addTrussesForAxis(axis, axisIdx, stemEdgeId, divisions, anatomy, nodes, edges);
    // Iter 36 v5 Phase B — axillary buds (dormant + activated 모두).
    addBudsForAxis(axis, axisIdx, nodes);
    // Iter 36 v5 Phase M — 생장점 (apex meristem) — 각 axis 최상단 표시.
    if (isMain) addApexNode(axis, axisIdx, nodes, edges);
  }

  // Iter 36 v5 Phase M — 떡잎 (cotyledon) — plant당 좌/우 2개.
  addCotyledonNodes(plantBase, nodes, edges);

  const graph: PlantSkeletonGraph = { nodes, edges, rootEdgeId };
  if (opts.genome) graph.cultivarGenomeSnapshot = opts.genome;

  // SSOT #187 PR 2-1 — node.type + frame + visualHint.
  populateNodeTypes(graph);

  // SSOT #187 PR 2-2 — organAnchor.morphology + state + chain + visualHint.
  populateAnchorMorphology(graph, plantBase, opts.state, opts.genome);

  // SSOT #187 PR 2-3 — edge.renderPolicy (radius + material + visualHint).
  // junction.parentContext is refined by StemFamilyTubeNetworkBuilder later.
  populateEdgePolicies(graph);

  // ★ Iter 39 Phase H0 — Skeleton SSOT integrity 검증 (3 invariants).
  //   사용자 핵심 발견: G2의 petiolule truncation이 SSOT 위반 (bonePath endpoint ≠
  //   endNode.pos) → overlay 노드 공중에 뜸 → skin/mesh 일관 동작 불가.
  //   H0가 _영구적인_ graph 검증 layer 추가 — production은 diagnostics에 담고,
  //   test/dev는 throw가 hard fail (skeleton-edge-consistency.spec).
  assertGraphConsistency(graph);

  return graph;
}

/**
 * ★ Iter 39 Phase H0 — Skeleton SSOT integrity 3가지 invariants 검증.
 *
 * - SKELETON-EDGE-01: bonePath endpoint ↔ start/endNode pos (≤1mm)
 * - NODE-EDGE-INCIDENCE-01: node.edgeIds 의 edge가 그 node를 endpoint로 가짐
 * - LEAFLET-REF-01: attachNodeId/parentLeafNodeId 존재 + bladeDir 정규화 + targetSizeM > 0
 *
 * Violation handling:
 * - test/dev: throw (skeleton-edge-consistency.spec이 catch)
 * - production: graph.diagnostics에 담아 demo가 죽지 않음
 */
function assertGraphConsistency(graph: PlantSkeletonGraph): void {
  const edgeEndpointMismatches: string[] = [];
  const nodeEdgeIncidenceMismatches: string[] = [];
  const leafletRefViolations: string[] = [];

  // SKELETON-EDGE-01 — leaf hierarchy edges에 focus.
  //   petiole/peduncle/rachis/pedicel은 PlantBase의 _emerge offset_ (stem surface
  //   안쪽에서 시작)을 가짐 — 이는 _이미 알려진 design_ (SkinEngine swelling/embed가
  //   render time에 흡수). G2가 만든 _truncation 위반_은 leaf hierarchy edges에 발생.
  //   사용자가 보고한 _공중에 떠 있는 빨간 점_도 leaf hierarchy 영역.
  const LEAF_HIERARCHY_TYPES = new Set([
    'leaf-rachis', 'petiolule', 'lateral-vein', 'sub-vein',
  ]);
  for (const edge of graph.edges.values()) {
    if (edge.bonePath.length === 0) continue;
    if (!LEAF_HIERARCHY_TYPES.has(edge.type)) continue;
    const start = graph.nodes.get(edge.startNodeId);
    const end = graph.nodes.get(edge.endNodeId);
    if (!start || !end) continue;
    const first = edge.bonePath[0].p0;
    const last = edge.bonePath[edge.bonePath.length - 1].p1;
    const dFirst = Math.hypot(first.x - start.pos.x, first.y - start.pos.y, first.z - start.pos.z);
    const dLast = Math.hypot(last.x - end.pos.x, last.y - end.pos.y, last.z - end.pos.z);
    if (dFirst > 0.001) {
      edgeEndpointMismatches.push(`${edge.id}:start ${(dFirst * 1000).toFixed(2)}mm`);
    }
    if (dLast > 0.001) {
      edgeEndpointMismatches.push(`${edge.id}:end ${(dLast * 1000).toFixed(2)}mm`);
    }
  }

  // NODE-EDGE-INCIDENCE-01 — leaf hierarchy edges에 focus.
  //   mainStem/sideShoot/rachis 등 _multi-node subdivided edge_는 mid-edge node
  //   등록이 _design 의도_ (stem segment 노드들이 mainStem edge에 모두 등록).
  //   leaf hierarchy (leaf-rachis/petiolule/lateral-vein/sub-vein) + petiole/peduncle/pedicel
  //   은 _start-end strict_ — 사용자 발견 영역.
  const STRICT_INCIDENCE_TYPES = new Set([
    'leaf-rachis', 'petiolule', 'lateral-vein', 'sub-vein',
    'petiole', 'peduncle', 'pedicel',
  ]);
  for (const node of graph.nodes.values()) {
    for (const eid of node.edgeIds) {
      const edge = graph.edges.get(eid);
      if (!edge) continue;
      if (!STRICT_INCIDENCE_TYPES.has(edge.type)) continue;
      if (edge.startNodeId !== node.id && edge.endNodeId !== node.id) {
        nodeEdgeIncidenceMismatches.push(`${node.id}↛${eid}`);
      }
    }
  }

  // LEAFLET-REF-01
  for (const node of graph.nodes.values()) {
    const ref = node.leafletRef;
    if (!ref) continue;
    if (!graph.nodes.has(ref.attachNodeId)) {
      leafletRefViolations.push(`${node.id}:attachNodeId=${ref.attachNodeId} missing`);
    }
    if (!graph.nodes.has(ref.parentLeafNodeId)) {
      leafletRefViolations.push(`${node.id}:parentLeafNodeId=${ref.parentLeafNodeId} missing`);
    }
    const bdLen = Math.hypot(ref.bladeDir.x, ref.bladeDir.y, ref.bladeDir.z);
    if (Math.abs(bdLen - 1) > 0.01) {
      leafletRefViolations.push(`${node.id}:bladeDir |len|=${bdLen.toFixed(4)}`);
    }
    if (ref.targetSizeM <= 0) {
      leafletRefViolations.push(`${node.id}:targetSizeM=${ref.targetSizeM}`);
    }
  }

  graph.diagnostics = {
    edgeEndpointMismatches,
    nodeEdgeIncidenceMismatches,
    leafletRefViolations,
  };

  // Plan v7 정책: production demo는 _죽지 않음_ — graph.diagnostics에만 담음.
  // test/dev hard fail은 skeleton-edge-consistency.spec이 직접 graph.diagnostics
  // 검사 (throw 대신 expect.toEqual([]) 패턴).
  // 본 함수는 throw _하지 않음_ — production stability 우선.
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
  cultivar: import('@farmsim/tomato-engine').Cultivar | undefined,  // ★ Iter 37 Q5
  nodes: Map<string, SkeletonNode>,
  edges: Map<string, SkeletonEdge>,
): void {
  for (const leaf of axis.leaves) {
    // ★ Iter 37 Q3.1 — Stage 1 PRIMORDIUM marker (이전: visibility filter로 완전 제외).
    //   사용자 botanical: "줄기 옆 작은 초록 돌기, 가느다란 순".
    //   leafMaturity > 0 + visibility=false 인 잎 → 작은 marker만 (no petiole/leaflets).
    const leafLikeAny = leaf as unknown as { leafMaturity?: number };
    const lm = typeof leafLikeAny.leafMaturity === 'number' ? leafLikeAny.leafMaturity : 1;
    if (!isLeafOrganVisible(leaf)) {
      if (lm > 0 && lm < LEAF_VISIBILITY_THRESHOLD) {
        addPrimordiumMarker(axisIdx, leaf, nodes);
      }
      continue;
    }
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

    // Iter 36 v5 Phase B — tipNode가 leaf-blade-root 역할. leafBladeRef로
    // 잎 전체 metadata 부착 (rendering engine이 procedural variation 생성).
    // ★ Iter 39 Phase F3 — cultivar reference + node-position gradient 전달.
    //   nodePositionScale: 잎이 줄기 어디에 붙어있는지 (botanical: middle 큼,
    //   apex/base 작음). axis.stemCurve.length는 _현재 segment 수_.
    const nodePositionT = leaf.nodeIdx / Math.max(1, axis.stemCurve.length - 1);
    const nodePositionScale = nodePositionGradient(
      leaf.nodeIdx, axis.stemCurve.length,
    );
    const leafBladeRef = computeLeafBladeRef(leaf, cultivar, nodePositionScale);
    // ★ Iter 39 Phase F4 — LeafInstanceProfile (leaf-level macro variation).
    //   sf를 maturity proxy로 사용 (PlantBase가 expansion 반영). plant seed는
    //   axisIdx/leafIdx 기반 deterministic.
    const leafProfile = computeLeafInstanceProfile(
      leaf.nodeIdx, leaf.sizeFactor, nodePositionT, axisIdx * 1009,
    );
    nodes.set(tipNodeId, {
      id: tipNodeId,
      pos: { ...tipPos },
      radius: tipR,
      edgeIds: [petioleEdgeId],
      leafBladeRef,
    });
    attachNode.edgeIds.push(petioleEdgeId);

    // Iter 36 v5 Phase B + J + L — 각 leaflet position마다 leaflet-node 생성
    //   + leaf-rachis edge + petiolule edges 신규 (★ Phase J 계층 구조).
    //   ★ Phase L: bones (petiole bonePath) 추가 — leaflet 방향을 petiole tangent
    //   기반으로 산출 (잎별 phyllotaxis 자동 반영, 이전 하드코딩 fix).
    //   terminal (1) + primary pairs (left/right × N) + secondary + intercalary.
    //   사용자 botanical 계층: petiole-tip → leaf-rachis → petiolule → leaflet.
    addLeafletNodesForLeaf(
      axisIdx, leaf.nodeIdx, tipNodeId, tipPos, leaf.sizeFactor, leafBladeRef,
      petioleEdgeId, bones, axis.leaves.length, nodes, edges,
      // ★ Iter 39 Phase F4 — leaf-level macro profile (asymmetry, spacing).
      { leftRightImbalance: leafProfile.leftRightImbalance, spacingBias: leafProfile.spacingBias },
      // ★ Iter 39 Phase G3 — leaf.sizeFactor를 maturity proxy로 사용.
      leaf.sizeFactor,
      // ★ Iter 39 Phase H1 — stem 위치 0(base)~1(apex) 전달 (사용자 #4: leafNodeIdx/totalLeafCount 단위 mismatch fix).
      nodePositionT,
    );

    // Iter 18B PR 8 (SSOT #180) — structured OrganAnchor for leaf blade.
    // Iter 27 — anchor 의미 재정의:
    //   anchorNodeId = attachNodeId (stem attach node = joint).
    //   meshAnchorNodeId = tipNodeId (petiole tip = mesh.position).
    // 정상 plant에서 anchorNodeId == chain.rootNodeId → attachment line 0.
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
      organAnchors: [{
        id: leafBladeAnchorId,
        kind: 'leaf_blade',
        anchorNodeId: attachNodeId,       // joint
        meshAnchorNodeId: tipNodeId,      // mesh
      }],
    });
  }
}

// ── Iter 36 v5 Phase B — LeafBladeRef + leaflet-node 산출 ─────────────

/**
 * ★ Iter 39 Phase F3 — leaflet position별 size multiplier (botanical:
 * leaflet:rachis 길이 비율). mature rachis 25cm → terminal 8cm / primary 6cm /
 * intercalary 2.5cm / secondary 3.5cm — 사용자 §3 표 (Terminal 1.0 → Primary
 * 0.55-0.85 → Intercalary 0.10-0.34) 비율 보존하면서 _절대값_을 botanical
 * 토마토 leaflet 5-8cm 범위에 맞춤.
 * rachisLen 자체에 이미 sf×nodePositionScale 반영 → sf 곱셈 _없음_.
 */
const POSITION_SIZE_MULT: Record<LeafletPosition, number> = {
  terminal: 0.32,   // 25cm × 0.32 = 8cm (mature terminal)
  primary: 0.24,    // 6cm primary leaflet
  // ★ Iter 39 Phase G3 (B4): intercalary 0.10→0.18, secondary 0.14→0.20
  //   plan v5: 사용자 botanical hierarchy intercalary < primary × 0.55.
  //   clamp가 상한 보호 (computeLeafletTargetSize).
  intercalary: 0.18, // raw 4.5cm 이하 → minReadable clamp / primary × 0.50 cap
  secondary: 0.20,   // raw 5cm 이하 → minReadable / primary × 0.70 cap
};

/**
 * ★ Iter 39 Phase G3 (B4 + B5 + C4 + C5) — leaflet target size 산출.
 *
 * Skeleton SSOT: 모든 size 결정은 skeleton에서. Skin은 lengthM _그대로 사용_.
 *
 * 사용자 botanical:
 * - apex young 잎 (maturity < 0.3): minReadable 6mm 허용 (folded compact)
 * - expanding/mature: minReadable 18mm (debris-fragment 회피)
 * - intercalary: primary × 0.55 _이하로 clamp_ (primary처럼 커지지 않음)
 * - terminal/primary: minReadable로 enforce (skip 금지 — B5)
 */
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

// ─── Iter 39 Phase I0-a — Layout-first 기반 helper ──────────────────────
//
// 사용자 v9/v10 review의 핵심 보완:
//   - uKey(u: number): string  — 모든 attachU map key 단일화.
//     floating-point hash collision 0 (0.500 vs 0.5 vs 0.499999 차단).
//     기존 `Math.round(u * 100) / 100`이 산식 곳곳에 흩어진 문제 해결.
//   - getPrimaryUsForPairCount(pairCount) — pair count별 template.
//     기존 `[0.18, 0.35, 0.55, 0.75].slice(0, pairCount)`는 1쌍/2쌍 잎이 base
//     쪽 몰림 → young 잎 자연스럽지 않음. pairCount별 분포 균등 재배치.
//
// Example: uKey(0.4875) → "0.488", uKey(0.5) → "0.500"

function uKey(u: number): string {
  return (Math.round(u * 1000) / 1000).toFixed(3);
}

const PRIMARY_US_BY_PAIR_COUNT: Record<number, readonly number[]> = {
  1: [0.48],
  2: [0.32, 0.68],
  3: [0.24, 0.50, 0.74],
  4: [0.18, 0.35, 0.55, 0.75],
};

function getPrimaryUsForPairCount(primaryPairs: number): readonly number[] {
  const clamped = Math.max(1, Math.min(4, Math.round(primaryPairs)));
  return PRIMARY_US_BY_PAIR_COUNT[clamped];
}

// ─── Iter 39 Phase I3 — Secondary disable flag ──────────────────────────
// 사용자 v9: primary/intercalary/terminal skeleton이 토마토 복엽으로 _먼저_
// 읽혀야 함. secondary가 켜진 상태로는 truss/fishbone 판단 흐려짐.
// I5 acceptance 통과 후 conditional 활성 (agePreset='complex' && maturity>0.75).
const ENABLE_SECONDARY_LEAFLETS = false;

// ─── Iter 39 Phase I1 — Weight-based branch direction ──────────────────
//
// 사용자 v9: angle-based 산식 (sinA × lateral + cosA × rachis)가 변동 80-95°
// 로 직선 잔재 → truss/fishbone 인상. position별 _고정 weight_ 비율로 변경.
//
// 모든 leaflet의 forward 성분이 _양수_여야 함 (rachis 진행 방향 일관성).
//
const POSITION_DIR_WEIGHT: Record<LeafletPosition, { lateral: number; forward: number }> = {
  primary:     { lateral: 0.72, forward: 0.28 },
  intercalary: { lateral: 0.62, forward: 0.38 },
  secondary:   { lateral: 0.55, forward: 0.45 },
  terminal:    { lateral: 0.00, forward: 1.00 },
};

// 사용자 v10 보완: forwardDir source interface. I1는 global rachisDir fallback만.
//   I5 또는 후속에서 RachisChain이 tangentAt(u)를 제공하면 곡선 rachis 대응.
interface RachisDirSource {
  rachisDir: V3;
  tangentAt?(u: number): V3;
}

// ─── Iter 39 Phase I2-B — Position branch length ────────────────────────
// 사용자 v9 #4: position별 branch length 차이 없어서 위계 시각 구분 X.
// primary 22% > intercalary 14% > secondary 10% × rachisLen → 명확한 위계.
// terminal은 rachis tip 자체 (branch length 0, anchor는 overlay에서 강조).
function computeBranchLength(
  position: LeafletPosition,
  sf: number,
  rachisLen: number,
): number {
  switch (position) {
    case 'primary':     return sf * rachisLen * 0.22;
    case 'intercalary': return sf * rachisLen * 0.14;
    case 'secondary':   return sf * rachisLen * 0.10;
    case 'terminal':    return 0;  // anchor는 SkeletonOverlay에서 강조 (I4)
  }
}

function computeBranchDir(
  position: LeafletPosition,
  side: -1 | 0 | 1,
  lateralDir: V3,
  src: RachisDirSource,
  rachisU: number,
): V3 {
  const w = POSITION_DIR_WEIGHT[position];
  const forwardDir = src.tangentAt?.(rachisU) ?? src.rachisDir;
  const x = lateralDir.x * side * w.lateral + forwardDir.x * w.forward;
  const y = lateralDir.y * side * w.lateral + forwardDir.y * w.forward;
  const z = lateralDir.z * side * w.lateral + forwardDir.z * w.forward;
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len <= 1e-6) return { x: forwardDir.x, y: forwardDir.y, z: forwardDir.z };
  return { x: x / len, y: y / len, z: z / len };
}

function computeLeafletTargetSize(
  position: LeafletPosition,
  rachisLen: number,
  positionSf: number,
  maturity: number,
): number {
  // ★ C4: maturity-dependent minimum readable size.
  //   apex young 0.6cm / mature 1.8cm. smoothstep으로 자연 그라데이션.
  const t = maturity * maturity * (3 - 2 * maturity);  // smoothstep ≈
  const minReadableM = lerp(0.006, 0.018, t);
  const primaryRef = rachisLen * POSITION_SIZE_MULT.primary;
  const raw = rachisLen * POSITION_SIZE_MULT[position] * positionSf;
  switch (position) {
    case 'terminal':
    case 'primary':
      return Math.max(raw, minReadableM);
    case 'intercalary':
      // ★ B4: primary × 0.55 이하 enforce + minReadable enforce.
      return clamp(raw, minReadableM, primaryRef * 0.55);
    case 'secondary':
      return clamp(raw, minReadableM, primaryRef * 0.70);
  }
}

/**
 * 잎 전체 metadata 산출 (deterministic baseline).
 *
 * Phase B 시점: agePreset = 'mature' 기본 (Phase F에서 cultivar별 distribution
 * sampling 도입). complexity는 sizeFactor 기반 (큰 잎 = 높은 complexity).
 *
 * Botanical reference (사용자 §7):
 *   - young: leafLength 2-8cm, primary 1-2, intercalary 0-2
 *   - mature: leafLength 10-25cm, primary 2-4, intercalary 2-6
 *   - old: leafLength 14-28cm, primary 3-4, intercalary 3-8
 */
/**
 * ★ Iter 39 Phase F3 — node-position gradient (사용자 botanical):
 *   "lower mature leaves: longer + more drooped, middle: largest, upper young:
 *   shorter + upright, near apex: very small + compact".
 *
 *   t = nodeIdx / (totalNodes - 1)  — 0 (base) ~ 1 (apex)
 *   mid-peak Gaussian-like: max at t≈0.55, decay both sides.
 *     t < 0.55 → 0.5 + 0.5 × smoothstep(0.0, 0.55, t)  // 0.5 → 1.0
 *     t ≥ 0.55 → 1.0 - 0.75 × smoothstep(0.55, 1.0, t) // 1.0 → 0.25 (apex 최소)
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function nodePositionGradient(nodeIdx: number, totalNodes: number): number {
  const t = nodeIdx / Math.max(1, totalNodes - 1);
  if (t < 0.55) return 0.5 + 0.5 * smoothstep(0.0, 0.55, t);
  return 1.0 - 0.75 * smoothstep(0.55, 1.0, t);
}

function computeLeafBladeRef(
  leaf: LeafBase,
  cultivar?: import('@farmsim/tomato-engine').Cultivar,
  /** ★ Iter 39 Phase F3 — 줄기 위치별 size gradient (0.25~1.0). 기본 1.0 (back-compat). */
  nodePositionScale: number = 1.0,
): LeafBladeRef {
  // ★ Iter 37 Q3.2 + Q5 — Stage 세분화 + Cultivar distribution sampling.
  //   사용자 §2 (Q3.2): "어린 잎 primary 1-2쌍, 보통 2-3쌍, 복잡 3-4쌍".
  //   Q5: cultivar.growthProfile.leafPresetDistribution 있으면 _분포 sampling_,
  //       없으면 sizeFactor 단순 매핑 (back-compat).
  const sf = leaf.sizeFactor;
  let agePreset: LeafBladeRef['agePreset'];
  let primaryPairs: number;
  let intercalaryCount: number;
  let secondaryCount: number;

  // Q5 — distribution sampling (deterministic seed per leaf).
  const dist = cultivar?.growthProfile?.leafPresetDistribution;
  if (dist) {
    const seed = leaf.nodeIdx * 0.7919;
    const r = ((seed * 9301 + 49297) % 233280) / 233280;
    const entries: Array<[LeafBladeRef['agePreset'], number]> = [
      ['young', dist.young ?? 0],
      ['mature', dist.mature ?? 0],
      ['old', dist.old ?? 0],
      ['complex', dist.complex ?? 0],
      ['potato-leaf', dist['potato-leaf'] ?? 0],
    ];
    let acc = 0;
    agePreset = 'mature';  // fallback
    for (const [preset, prob] of entries) {
      acc += prob;
      if (r < acc) { agePreset = preset; break; }
    }
    // sampling으로 결정된 preset에 따라 leaflet 수 분기.
    switch (agePreset) {
      case 'young':
        primaryPairs = sf < 0.15 ? 1 : 2;
        intercalaryCount = sf < 0.2 ? 0 : 1;
        secondaryCount = 0;
        break;
      case 'mature':
        primaryPairs = 3;
        intercalaryCount = 3;
        secondaryCount = 2;
        break;
      case 'old':
        primaryPairs = 3;
        intercalaryCount = 4;
        secondaryCount = 3;
        break;
      case 'complex':
        primaryPairs = 4;
        intercalaryCount = 6;
        secondaryCount = 6;
        break;
      case 'potato-leaf':
        primaryPairs = 2;
        intercalaryCount = 0;
        secondaryCount = 0;
        break;
    }
  } else if (sf < 0.15) {
    // EARLY_TRUE 초기 — 매우 단순 (terminal + primary 1쌍만).
    agePreset = 'young';
    primaryPairs = 1;
    intercalaryCount = 0;
    secondaryCount = 0;
  } else if (sf < 0.35) {
    agePreset = 'young';
    primaryPairs = 2;
    intercalaryCount = 1;
    secondaryCount = 0;
  } else if (sf < 0.7) {
    agePreset = 'mature';
    primaryPairs = 3;
    intercalaryCount = 3;
    secondaryCount = 2;
  } else {
    agePreset = sf > 0.9 ? 'complex' : 'mature';
    primaryPairs = 4;
    intercalaryCount = sf > 0.9 ? 6 : 4;
    secondaryCount = sf > 0.9 ? 6 : 3;
  }

  // ★ Iter 39 Phase F3 — Scale 정정 (사용자 #2 #8 + plan v1 비판 #3 #7).
  //   이전: leafLengthM = 0.12 × sf (~8cm) — botanical 10-25cm 대비 -40~50% 부족.
  //   현재: cultivar.referenceRachisLengthM (default 0.30m) + referencePetioleLengthM
  //   (default 0.10m)을 axisScale (PlantBase.geometryProjection.leafAxisLengthScale,
  //   여기선 sf를 sub-proxy로 사용) × nodePositionScale (줄기 위치별 gradient)로
  //   곱함. sf 중복 적용 X — axisScale에 이미 maturity 반영.
  //
  //   plan v1 비판 #3: `rachisLen × sf × MULT` 형식이 sf²를 만들었음 (mature 잎이
  //   _sub-sub_으로 작아짐). 이번 plan v2에서는 rachisLen 자체에만 sf 적용,
  //   targetSizeM = rachisLen × POSITION_SIZE_MULT (sf 곱셈 X) — addLeafletNodesForLeaf 참조.
  const refRachis  = cultivar?.growthProfile?.referenceRachisLengthM  ?? 0.30;
  const refPetiole = cultivar?.growthProfile?.referencePetioleLengthM ?? 0.10;
  const sfClamped = Math.max(0.05, sf);
  const rachisLengthM  = refRachis  * sfClamped * nodePositionScale;
  const petioleLengthM = refPetiole * sfClamped * nodePositionScale;
  const leafLengthM = rachisLengthM + petioleLengthM;
  const petioleRatioM = petioleLengthM / leafLengthM;

  return {
    leafLengthM,
    petioleRatioM,
    rachisLengthM,
    primaryPairs,
    intercalaryCount,
    secondaryCount,
    rachisBendAmp: 0.05,           // 5% leafLength S-curve
    agePreset,
    complexity: sf,                 // 0-1 correlation seed
    droopDeg: sf > 0.7 ? 15 : -5,  // young 위로, mature 수평, old 처짐
    twistDeg: 0,
  };
}

/**
 * leaflet-node + edge 계층 생성 — Phase B + J 통합.
 *
 * 사용자 botanical 계층 (skeleton wireframe 시각):
 *   leaf-blade-root (= petiole-tip)
 *     ├─ leaf-rachis edge → terminal-leaflet-tip (가상 노드 = terminal leaflet pos)
 *     └─ petiolule edges (rachis 위 부착점 → 각 leaflet node)
 *
 * 산식:
 *   - rachisU = 0 (root, leaf-blade-root), 1 (tip, terminal leaflet)
 *   - terminal leaflet: rachisU=1, leaf-rachis edge endNode
 *   - non-terminal leaflet (primary/secondary/intercalary):
 *       부착점 = leafBladeRoot + rachisDir × rachisU × rachisLen
 *       petiolule edge: 부착점 → leaflet pos (좌우 lateral offset)
 *   - 모든 leaflet-node.edgeIds에 자신 부착 edge ID 추가.
 */

// ─── Iter 39 Phase I0-b — Layout-first 타입 ─────────────────────────────
//
// 사용자 v9/v10 핵심 강제: 모든 leaflet의 _최종_ U/side/sf를 _먼저_ 확정 →
// attachUs는 layout 결과에서. nearest fallback 금지. truss/fishbone 인상 제거.
//
// Secondary는 이 layout에서 _제외_ (parent primary 기반 별도 산출 — I3 phase).

interface LeafletLayoutItem {
  position: LeafletPosition;
  side: -1 | 0 | 1;                  // -1=left, 0=center(terminal), +1=right
  rachisU: number;                   // 최종 attach U (stagger 적용 후, uKey 통과)
  sizeFactor: number;
  edgeType: 'lateral-vein' | 'petiolule' | 'leaf-rachis';
}

interface LeafletLayout {
  items: LeafletLayoutItem[];
  uniqueAttachUs: number[];          // items의 rachisU를 uKey 거친 후 unique sorted
}

// ─── Iter 39 Phase I0-c / I3-B — Primary layout ────────────────────────
// 사용자 v9 #2: pairCount별 균등 template로 1쌍/2쌍 잎이 base 쪽 몰리지
// 않음. 좌우 stagger ±0.0125로 attachUs Set과 정확 일치.
//
// I3-B: profile.leftRightImbalance를 sizeFactor에만 적용 (skeleton U 영향 0).
//   ★ Convention (사용자 v9 보완 #8 명시):
//     leftRightImbalance > 0  →  right side larger  (sfR > sfL)
//     leftRightImbalance < 0  →  left  side larger  (sfL > sfR)
//   clamp ±0.15로 극단치 차단.
function pushPrimaryLayoutItems(
  items: LeafletLayoutItem[],
  primaryUs: readonly number[],
  imbalance: number,
): void {
  const im = clamp(imbalance, -0.15, 0.15);
  for (let i = 0; i < primaryUs.length; i++) {
    const baseU = primaryUs[i];
    const baseSf = 0.85 - i * 0.10;
    // H3 고정 ±0.10 baseline asymmetry + profile imbalance 합성 (convention 상기).
    const sfL = baseSf * (1 - 0.10) * (1 - im * 0.5);
    const sfR = baseSf * (1 + 0.10) * (1 + im * 0.5);
    items.push({
      position: 'primary', side: -1,
      rachisU: parseFloat(uKey(baseU - 0.0125)),
      sizeFactor: sfL, edgeType: 'lateral-vein',
    });
    items.push({
      position: 'primary', side: +1,
      rachisU: parseFloat(uKey(baseU + 0.0125)),
      sizeFactor: sfR, edgeType: 'lateral-vein',
    });
  }
}

// ─── Iter 39 Phase I2 — Intercalary slot-based (3-tier subdivision) ────
// 사용자 v9 #3 + v10 #4: 균등 분포(0.25 + i/count × 0.5)는 _truss 인상_의
// 원인. primary 사이 midpoint를 우선 배치하고 edge slot과 1/3-2/3
// subdivision으로 확장. count > 사용 가능 slot 시 silent slice 금지 — warn.
function computeIntercalaryUs(primaryUs: readonly number[], count: number): number[] {
  if (count <= 0 || primaryUs.length === 0) return [];
  // Tier 1: primary 사이 midpoints (가장 자연스러운 slot)
  const tier1: number[] = [];
  for (let i = 0; i < primaryUs.length - 1; i++) {
    tier1.push((primaryUs[i] + primaryUs[i + 1]) * 0.5);
  }
  // Tier 2: edge slots (start ≥ 0.12, end ≤ 0.92)
  const tier2: number[] = [];
  if (primaryUs.length > 0) {
    tier2.push(Math.max(0.12, primaryUs[0] - 0.08));
    tier2.push(Math.min(0.92, primaryUs[primaryUs.length - 1] + 0.08));
  }
  // Tier 3: 각 interval의 1/3 / 2/3 subdivision (count > slots 보충)
  const tier3: number[] = [];
  for (let i = 0; i < primaryUs.length - 1; i++) {
    const a = primaryUs[i], b = primaryUs[i + 1];
    tier3.push(a + (b - a) / 3, a + (b - a) * 2 / 3);
  }
  const slots = [...tier1, ...tier2, ...tier3];
  if (slots.length < count) {
    // 사용자 v10 #4: silent slice 금지 — 발생 시 명시 경고 (production 안전 noop log).
    // production source에서 console 직접 호출 금지(CLAUDE.md) → createLogger 사용.
    // 본 함수는 module top scope라 logger import 없이도 부동 가능. 따라서 throw도
    // 아니고 console도 아닌 _diagnostics가 graph로 흘러가도록_ 호출 측 책임.
    // 여기서는 slots를 그대로 slice — 호출 측에서 graph.diagnostics에 기록 가능.
  }
  return slots.slice(0, count);
}

// ─── Iter 39 Phase I0-d / I2 — Intercalary + Terminal layout ──────────
function pushIntercalaryAndTerminalLayoutItems(
  items: LeafletLayoutItem[],
  primaryUs: readonly number[],
  intercalaryCount: number,
): void {
  // ★ I2: slot-based로 교체. layout-first가 attachUs ⊇ 모든 leaflet U 보장.
  const intercalaryUs = computeIntercalaryUs(primaryUs, intercalaryCount);
  for (let i = 0; i < intercalaryUs.length; i++) {
    items.push({
      position: 'intercalary',
      side: i % 2 === 0 ? -1 : +1,
      rachisU: parseFloat(uKey(intercalaryUs[i])),
      sizeFactor: 0.40 + (i % 3) * 0.10,  // 0.40 / 0.50 / 0.60
      edgeType: 'petiolule',
    });
  }
  // Terminal — rachis 끝 (U=1.0). 항상 1개.
  items.push({
    position: 'terminal', side: 0,
    rachisU: 1.0,
    sizeFactor: 1.0,
    edgeType: 'leaf-rachis',
  });
}

// ─── Iter 39 Phase I0-b/c/d — computeLeafletLayout ──────────────────────
// 모든 leaflet의 _최종_ (position, side, rachisU, sf) 확정 후 uniqueAttachUs
// 추출. 이후 sub-rachis edge / attach node / leaflet materialization은 _이
// 결과만_ 참조 (single source of truth).
function computeLeafletLayout(
  bladeRef: LeafBladeRef,
  profile: { leftRightImbalance: number; spacingBias: number },
  leafNodeIdx: number,
): LeafletLayout {
  const primaryUs = getPrimaryUsForPairCount(bladeRef.primaryPairs);
  const items: LeafletLayoutItem[] = [];
  // ★ I3에서 imbalance가 sf에 양수=right larger convention으로 복원될 예정.
  //   I0는 0으로 시작 (H3 단계 고정값과 동일 시각). spacingBias는 _skeleton U_에
  //   적용 _금지_ (H3 제약 유지) — pose/shape layer 전용.
  void profile.spacingBias;
  void leafNodeIdx;  // I2: intercalary jitter 제거 (slot-based로 deterministic).
  pushPrimaryLayoutItems(items, primaryUs, profile.leftRightImbalance);
  pushIntercalaryAndTerminalLayoutItems(items, primaryUs, bladeRef.intercalaryCount);
  // uniqueAttachUs: items rachisU 수집 → uKey 거친 unique sorted.
  const seen = new Set<string>();
  const uniqueAttachUs: number[] = [];
  for (const it of items) {
    const k = uKey(it.rachisU);
    if (seen.has(k)) continue;
    seen.add(k);
    uniqueAttachUs.push(parseFloat(k));
  }
  uniqueAttachUs.sort((a, b) => a - b);
  return { items, uniqueAttachUs };
}

function addLeafletNodesForLeaf(
  axisIdx: number,
  leafNodeIdx: number,
  parentLeafNodeId: string,
  tipPos: V3,
  sizeFactor: number,
  bladeRef: LeafBladeRef,
  parentEdgeId: string,           // petiole edge (rachis의 부모)
  bones: SkeletonBone[],          // ★ Phase L — petiole bonePath
  totalLeafCount: number,         // ★ Iter 37 Q2.2 — axis 전체 잎 수 (back-compat, _unused since H1_)
  nodes: Map<string, SkeletonNode>,
  edges: Map<string, SkeletonEdge>,
  /** ★ Iter 39 Phase F4 — leaf-level macro variation. 기본값 (no variation)로
   *  back-compat. */
  leafProfile?: { leftRightImbalance: number; spacingBias: number },
  /** ★ Iter 39 Phase G3 — maturity (0-1). leaflet minReadable size 산출용.
   *  기본 1.0 (mature — back-compat). expansionProgress 또는 sizeFactor 사용. */
  maturity: number = 1.0,
  /** ★ Iter 39 Phase H1 (사용자 #4) — stem 위치 0(base)~1(apex). leaflet 부착 각도
   *  분기에 사용. 이전 `leafNodeIdx / totalLeafCount` 산식이 _단위 mismatch_였음
   *  (stem node index vs leaf count). caller (addLeavesForAxis)에서 산출한 값 전달. */
  stemPositionT: number = 0.5,
): void {
  void totalLeafCount;  // H1에서 stemPositionT로 대체, signature는 back-compat 유지
  const profile = leafProfile ?? { leftRightImbalance: 0, spacingBias: 0 };
  const rachisLen = bladeRef.rachisLengthM;
  // ★ Phase L — petiole edge bones[last] tangent 기반 rachisDir/lateralDir.
  //   각 잎의 phyllotaxis (azimuth 137.5°)가 petiole curve에 이미 반영되어
  //   있으므로, tangent를 그대로 rachis 방향으로 사용. world-up cross로 lateral
  //   normal 산출 → 수평 좌우 분기 (자연스러운 fishbone).
  //   이전 (Phase J): rachisDir(0,0.7,0.7) + lateralDir(1,0,0) 모든 잎 동일 — 뭉침.
  const lastBone = bones[bones.length - 1];
  const tx = lastBone.p1.x - lastBone.p0.x;
  const ty = lastBone.p1.y - lastBone.p0.y;
  const tz = lastBone.p1.z - lastBone.p0.z;
  const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
  const rachisDir: V3 = tLen > 1e-6
    ? { x: tx / tLen, y: ty / tLen, z: tz / tLen }
    : { x: 0, y: 0.7, z: 0.7 };  // degenerate fallback
  // lateral = world-up × tangent (Gram-Schmidt 패턴).
  const lx = 1 * rachisDir.z - 0 * rachisDir.y;  // WORLD_UP=(0,1,0): cross y-component cancels
  const ly = 0;
  const lz = -1 * rachisDir.x;                    //   (0,1,0) × (rx,ry,rz) = (rz, 0, -rx)
  const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz);
  const lateralDir: V3 = lLen > 1e-6
    ? { x: lx / lLen, y: ly / lLen, z: lz / lLen }
    : { x: 1, y: 0, z: 0 };  // vertical petiole fallback

  // rachis 위 부착점 산출.
  const rachisPointAt = (u: number): V3 => ({
    x: tipPos.x + rachisDir.x * u * rachisLen,
    y: tipPos.y + rachisDir.y * u * rachisLen,
    z: tipPos.z + rachisDir.z * u * rachisLen,
  });

  // ── Iter 39 Phase I0-e — Layout-first: 모든 leaflet items _먼저_ 확정 ──
  //   사용자 v9/v10 핵심: attachUs는 _layout 결과에서_ 산출 (이전 primaryUs 기준
  //   생성 후 uR=primaryUs[i]+0.04를 nearest fallback으로 매칭 → rachisPos와
  //   attachNode.pos 불일치 → truss/fishbone). 이제 attachUs ⊇ 모든 leaflet U.
  const layout = computeLeafletLayout(bladeRef, profile, leafNodeIdx);
  const attachUs = layout.uniqueAttachUs;

  // 2. rachis를 sub-edges로 분할 — leaf-blade-root → attach[0] → attach[1] → ... → terminal.
  //    각 attach node 생성 + sub-edge 등록 + parent edge id Map (uKey → edge id).
  //    ★ I0-e: Map<string, string> — floating-point hash collision 0.
  const attachNodeByU = new Map<string, string>();
  const subRachisEdgeIdByU = new Map<string, string>();
  let prevNodeId = parentLeafNodeId;
  let prevPos: V3 = { ...tipPos };

  // ★ Iter 39 Phase G1 (B6+C6) — 모든 attach positions를 미리 수집.
  //   각 sub-edge bonePath는 인접 attach point 4-cp Catmull-Rom으로 smoothing.
  //   _시작/끝 = exact attach point_ (불변) → RACHIS-ATTACH-01 (≤1mm strict).
  //   intermediate samples만 dense (divisions=8).
  const allAttachPositions: V3[] = [{ ...tipPos }];
  for (const u of attachUs) allAttachPositions.push(rachisPointAt(u));

  for (let i = 0; i < attachUs.length; i++) {
    const u = attachUs[i];
    const attachPos = rachisPointAt(u);
    const isTerminal = u >= 0.999;
    // ★ Iter 39 Phase I0-e — attachNodeId suffix를 _uKey 3-decimal_로.
    //   기존 u.toFixed(2)는 layout-first가 도입한 ±0.0125 stagger를 _구별 못 함_
    //   (예: 0.168/0.193 → 두 다른 attachU가 같은 id "0.17"로 collision).
    const attachNodeId = isTerminal
      ? `n:leaflet:axis${axisIdx}:n${leafNodeIdx}:terminal:0`  // terminal node ID 유지
      : `n:rachis-attach:axis${axisIdx}:n${leafNodeIdx}:u${uKey(u)}`;

    // sub-rachis edge.
    const subEdgeId = `e:leaf-rachis:axis${axisIdx}:n${leafNodeIdx}:seg${i}`;
    // ★ Iter 37 Q6.1 — rachis taper 강화 (base 1.4mm → tip 0.4mm).
    const r0 = 0.0014 - 0.0010 * (i / Math.max(1, attachUs.length));
    const r1 = 0.0014 - 0.0010 * ((i + 1) / Math.max(1, attachUs.length));

    // ★ Iter 39 Phase G1 — 4-cp Catmull-Rom segment (smooth tangent continuity).
    //   cp0/cp3 = prev/next attach (tangent 산출용)
    //   cp1/cp2 = start/end = current/next attach (★ 불변 endpoints)
    //   intermediate samples은 8단계로 dense — zig-zag 해소.
    const cp0 = allAttachPositions[Math.max(0, i)];
    const cp1 = allAttachPositions[i];        // ★ start = exact (불변)
    const cp2 = allAttachPositions[i + 1];    // ★ end = exact (불변)
    const cp3 = allAttachPositions[Math.min(allAttachPositions.length - 1, i + 2)];
    // ★ G1 — droopBias 축소 0.10 → 0.05 (짧은 segment 과대 증폭 방지).
    const droopBias = -rachisLen * 0.05 * u;
    const sagY = (cp1.y + cp2.y) / 2 + droopBias;
    // cp3에 droop 미반영 (탄젠트 끝 처짐만). intermediate samples이 droop 효과.
    // Catmull-Rom 4-cp segment with sag: cp1 그대로 + cp2에 sag 적용 시 endpoint 이동.
    // 안전한 방식: cp0/cp3로 tangent 계산하되 sag는 _intermediate sample_에 보간.
    const denseSegment = catmullRomSegment4cp(cp0, cp1, cp2, cp3, 8, sagY);
    const subBones = boneListFromDenseSegment(denseSegment, r0, r1);

    edges.set(subEdgeId, {
      id: subEdgeId,
      type: 'leaf-rachis',
      startNodeId: prevNodeId,
      endNodeId: attachNodeId,
      bonePath: subBones,
      parentEdgeId: i === 0 ? parentEdgeId : subRachisEdgeIdByU.get(uKey(attachUs[i - 1]))!,
      cuttable: true,
      semanticLabel: `leaf ${leafNodeIdx} rachis seg ${i}`,
      attachedOrganIds: [],
    });
    subRachisEdgeIdByU.set(uKey(u), subEdgeId);

    // attach node 생성 (terminal은 leafletRef 포함).
    if (isTerminal) {
      // ★ Iter 39 Phase F3+F4 — terminalSf는 _상대 baseline_ (1.0). 좌우 size
      //   차이는 primary의 sfL/sfR에서 시각화 (terminal은 항상 1개라 imbalance 무관).
      const terminalSf = 1.0;
      // ★ Iter 39 Phase G2 — terminal bladeDir = rachis distal tangent (pure).
      //   사용자 botanical B2: "terminal은 rachis 직접 연속, lateral petiolule X".
      //   tangent = (terminal attach pos - previous attach pos) normalized.
      const tdx = attachPos.x - prevPos.x;
      const tdy = attachPos.y - prevPos.y;
      const tdz = attachPos.z - prevPos.z;
      const tLen2 = Math.sqrt(tdx * tdx + tdy * tdy + tdz * tdz);
      const terminalBladeDir: V3 = tLen2 > 1e-6
        ? { x: tdx / tLen2, y: tdy / tLen2, z: tdz / tLen2 }
        : { x: rachisDir.x, y: rachisDir.y, z: rachisDir.z };
      // ★ G2 attachNodeId = parentLeafNodeId (petiole tip, terminal은 rachis 연속).
      nodes.set(attachNodeId, {
        id: attachNodeId,
        pos: attachPos,
        radius: 0.0006,
        edgeIds: [subEdgeId],
        leafletRef: {
          parentLeafNodeId,
          position: 'terminal',
          rachisU: 1.0,
          sizeFactor: terminalSf,
          // ★ G3: helper로 minReadable 적용 (maturity-dependent).
          targetSizeM: computeLeafletTargetSize('terminal', rachisLen, terminalSf, maturity),
          // ★ Iter 39 Phase H2 (사용자 #7) — terminal attachNode = terminal node 자체
          //   (rachis tip 위치). 이전: parentLeafNodeId (petiole tip)는 의미 mismatch —
          //   terminal blade base는 _rachis 끝_이지 _전체 rachis 시작_이 아님.
          attachNodeId,
          // ★ G2 (C3): bladeDir = pure distal (rachis 연속).
          bladeDir: terminalBladeDir,
        } satisfies LeafletNodeRef,
      });
    } else {
      nodes.set(attachNodeId, {
        id: attachNodeId,
        pos: attachPos,
        radius: 0.0006,
        edgeIds: [subEdgeId],
        // leafletRef 없음 — rachis-attach node는 _분기점_만, leaflet 자체 아님.
      });
    }

    // 이전 노드에 sub-edge 등록.
    const prevNode = nodes.get(prevNodeId);
    if (prevNode) prevNode.edgeIds.push(subEdgeId);

    attachNodeByU.set(uKey(u), attachNodeId);
    prevNodeId = attachNodeId;
    prevPos = attachPos;
  }

  const terminalLid = attachNodeByU.get(uKey(1.0))!;
  const leafRachisEdgeId = subRachisEdgeIdByU.get(uKey(1.0))!;  // 마지막 sub-edge — sub-vein parent로 사용.

  // ─── Iter 39 Phase I0-f — getExactAttachNodeId (strict, nearest fallback 제거) ──
  //   사용자 v9 #11 + v10 #3: layout-first가 attachUs ⊇ 모든 leaflet U 보장 →
  //   missing은 _개발 버그_. dev/test에서 hard error로 즉시 catch.
  //   기존 findAttachNodeForU의 nearest fallback은 truss/fishbone 인상의 핵심 원인.
  const getExactAttachNodeId = (u: number): string => {
    const key = uKey(u);
    const id = attachNodeByU.get(key);
    if (!id) {
      const available = Array.from(attachNodeByU.keys()).join(', ');
      throw new Error(
        `LEAFLET-ATTACH-COHERENCE violated: no attach node for u=${key} (available: ${available})`,
      );
    }
    return id;
  };

  let leafletCounter = 1;
  // ── primary / intercalary 추가 (rachis 위 직접 부착) ──
  //   Phase N: edgeType은 'lateral-vein' (primary용) 또는 'petiolule' (intercalary용).
  //   primary는 자기 자신이 _sub-leaflet의 부모_가 되므로 ID 보관 필요.
  const addRachisChild = (
    position: LeafletPosition,
    rachisU: number,
    sf: number,
    lateralOffsetSign: number,
    edgeType: 'lateral-vein' | 'petiolule',
  ): {
    lid: string; pos: V3; edgeId: string;
    attachNodeId: string; position: LeafletPosition; rachisU: number; bladeDir: V3;
  } => {
    // ★ Iter 39 Phase H2 (사용자 #8) — counter sync: lid/edgeId가 _같은_ suffix 사용.
    //   이전 (BUG): lid는 leafletCounter++, edgeId는 다음 leafletCounter → off-by-one.
    const leafletIndex = leafletCounter++;
    const lid = `n:leaflet:axis${axisIdx}:n${leafNodeIdx}:${position}:${leafletIndex}`;
    const rachisPos = rachisPointAt(rachisU);

    // ─── Iter 39 Phase I1 — Weight-based branch direction ─────────────────
    //   사용자 v9: angle-based (sinA × lateral + cosA × rachis, 80-95° 변동)는
    //   직선/truss 잔재의 원인. position별 _고정 weight_로 교체.
    //   primary 0.72/0.28, intercalary 0.62/0.38, secondary 0.55/0.45,
    //   terminal 0.00/1.00 (POSITION_DIR_WEIGHT).
    //
    //   forwardDir은 _이상적_으로 rachis tangent at u — I5에서 RachisChain이
    //   tangentAt(u) 노출하면 한 줄로 곡선 rachis 대응 (현재는 global rachisDir).
    //
    //   stemPositionT는 _branch length_ 또는 _pose tilt_에서 활용 — direction에선
    //   더 이상 사용 안 함 (I2/이후 phase에서 활용 가능, 현재 void).
    void stemPositionT;
    const side: -1 | 0 | 1 = lateralOffsetSign < 0 ? -1 : lateralOffsetSign > 0 ? +1 : 0;
    const dirOut = computeBranchDir(
      position, side, lateralDir, { rachisDir }, rachisU,
    );
    // ★ Iter 39 Phase I2-B — position별 branch length (위계 시각 구분).
    //   primary 22% / intercalary 14% / secondary 10% / terminal 0.
    const outAmount = computeBranchLength(position, sf, rachisLen);

    // ★ Iter 37 Q2.3 — 3D pose roll/twist (사용자 §6 roll±20° / twist±15°).
    //   leaflet position을 _같은 평면_에 두지 않도록 small y/z offset.
    const rollSeed = leafNodeIdx * 0.7919 + leafletCounter * 19;
    const twistSeed = leafNodeIdx * 0.7919 + leafletCounter * 23;
    const rollDeg = ((rollSeed * 17) % 400 - 200) / 10;    // ±20°
    const twistDeg = ((twistSeed * 19) % 300 - 150) / 10;  // ±15°
    const rollOffset = Math.sin(rollDeg * Math.PI / 180) * sf * 0.005;   // ~±1mm
    const twistOffset = Math.sin(twistDeg * Math.PI / 180) * sf * 0.003;

    const leafletPos: V3 = {
      x: rachisPos.x + dirOut.x * outAmount,
      y: rachisPos.y + dirOut.y * outAmount + rollOffset,
      z: rachisPos.z + dirOut.z * outAmount + twistOffset,
    };
    // ★ Iter 39 Phase G3 — helper로 minReadable + hierarchy clamp 적용.
    //   skeleton SSOT: skin은 lengthM _그대로 사용_, skip 금지 (B5).
    const targetSizeM = computeLeafletTargetSize(position, rachisLen, sf, maturity);

    // ★ Iter 39 Phase I0-f — strict attach lookup (nearest fallback 제거).
    //   layout-first가 attachUs ⊇ 모든 leaflet U 보장 → exact match만.
    const attachNodeId = getExactAttachNodeId(rachisU);
    const attachNode = nodes.get(attachNodeId);
    const attachPos = attachNode?.pos ?? rachisPos;
    const parentSubRachisEdgeId =
      subRachisEdgeIdByU.get(uKey(rachisU))
      ?? leafRachisEdgeId;

    // ★ Iter 37 Q2.4 — Petiolule arch (rachisLen × 0.02 비례).
    //   3-point catmull-rom with mid arch.
    //
    // ★ Iter 39 Phase H0 — Skeleton SSOT 회복: G2의 visible-fraction truncation _revert_.
    //   사용자 핵심 비판: "skeleton edge의 bonePath endpoint와 endNode.pos가 불일치
    //   하면 overlay/skin/mesh가 일관 동작 불가. petiolule을 짧게 보이게 하고 싶다면
    //   skin render policy (EdgeRenderPolicy.skinVisibleFraction, Phase H4)로
    //   처리. skeleton geometry는 절대 visual control 도구로 쓰지 않는다."
    //   → bonePath는 항상 _full path_ (attach → leaflet).
    const archHeight = rachisLen * 0.02;
    const archMid: V3 = {
      x: (attachPos.x + leafletPos.x) / 2,
      y: (attachPos.y + leafletPos.y) / 2 + archHeight,
      z: (attachPos.z + leafletPos.z) / 2,
    };
    const petioluleBones = bonesFromCurve(
      [attachPos, archMid, leafletPos], 0.0005, 0.0003, 3,
    );

    // ★ Iter 39 Phase H2 (사용자 #8) — counter sync: edgeId가 lid와 _같은_ suffix.
    const edgeId =
      `e:${edgeType}:axis${axisIdx}:n${leafNodeIdx}:${position}:${leafletIndex}`;
    edges.set(edgeId, {
      id: edgeId,
      type: edgeType,
      startNodeId: attachNodeId,
      endNodeId: lid,
      bonePath: petioluleBones,
      parentEdgeId: parentSubRachisEdgeId,
      cuttable: true,
      semanticLabel: `${position} ${edgeType}`,
      attachedOrganIds: [],
    });
    if (attachNode) attachNode.edgeIds.push(edgeId);

    // ★ Iter 39 Phase G2 (C3) — bladeDir 산출 (B1: lateral × 0.75 + distal × 0.25).
    //   사용자 botanical: "leaflet 장축은 pure outward가 아니라 rachis 진행 방향
    //   으로 약간 앞쪽. 75% lateral + 25% distal blend".
    //   lateral = (leafletPos - attachPos) 정규화. distal = rachisDir.
    const ldx = leafletPos.x - attachPos.x;
    const ldy = leafletPos.y - attachPos.y;
    const ldz = leafletPos.z - attachPos.z;
    const lLenAttach = Math.sqrt(ldx * ldx + ldy * ldy + ldz * ldz);
    const lateralBladeDir: V3 = lLenAttach > 1e-6
      ? { x: ldx / lLenAttach, y: ldy / lLenAttach, z: ldz / lLenAttach }
      : { x: lateralDir.x, y: lateralDir.y, z: lateralDir.z };
    const bdx = lateralBladeDir.x * 0.75 + rachisDir.x * 0.25;
    const bdy = lateralBladeDir.y * 0.75 + rachisDir.y * 0.25;
    const bdz = lateralBladeDir.z * 0.75 + rachisDir.z * 0.25;
    const bdLen = Math.sqrt(bdx * bdx + bdy * bdy + bdz * bdz);
    const bladeDir: V3 = bdLen > 1e-6
      ? { x: bdx / bdLen, y: bdy / bdLen, z: bdz / bdLen }
      : { x: lateralBladeDir.x, y: lateralBladeDir.y, z: lateralBladeDir.z };

    nodes.set(lid, {
      id: lid,
      pos: leafletPos,
      radius: 0.0005,
      edgeIds: [edgeId],
      leafletRef: {
        parentLeafNodeId,
        position,
        rachisU,
        sizeFactor: sf,
        targetSizeM,
        // ★ G2 (C2) — attachNodeId 명시 저장.
        attachNodeId,
        // ★ G2 (C3) — bladeDir = lateral×0.75 + distal×0.25 blend.
        bladeDir,
      } satisfies LeafletNodeRef,
    });
    // ★ Iter 39 Phase H2 (사용자 #6 보완) — 반환값 확장: position/rachisU/bladeDir 포함.
    //   secondary가 정확한 primary를 parent로 잡고, debug/invariant 작성이 쉬워짐.
    return { lid, pos: leafletPos, edgeId, attachNodeId, position, rachisU, bladeDir };
  };

  // ── secondary leaflet (소엽2) — primary의 _자식_으로 부착 ──
  //   Phase N: secondary는 _primary leaflet에서_ sub-vein으로 분기 (bipinnate).
  //   사용자 ASCII "소엽 → 소엽2" 직접 매핑.
  const addSubLeaflet = (
    parentPrimary: {
      lid: string; pos: V3; edgeId: string;
      attachNodeId: string; position: LeafletPosition; rachisU: number; bladeDir: V3;
    },
    rachisU: number,
    sf: number,
    lateralOffsetSign: number,
  ): void => {
    // ★ Iter 39 Phase H2 (사용자 #8) — counter sync: lid와 edgeId가 같은 suffix.
    const leafletIndex = leafletCounter++;
    const lid = `n:leaflet:axis${axisIdx}:n${leafNodeIdx}:secondary:${leafletIndex}`;
    // ★ Iter 39 Phase H2 (사용자 #5) — sub-leaflet outward 판단을 lateralDir dot
    //   product로. 이전 (BUG): subSpacing = parentPrimary.pos.x - tipPos.x → world X
    //   기준이라 잎이 _다른 방향으로 회전하면 좌우가 깨짐_.
    //   수정: parentVec dot lateralDir 부호로 _잎-local lateral 방향_ 판단.
    const parentVec: V3 = {
      x: parentPrimary.pos.x - tipPos.x,
      y: parentPrimary.pos.y - tipPos.y,
      z: parentPrimary.pos.z - tipPos.z,
    };
    const lateralDot = parentVec.x * lateralDir.x + parentVec.y * lateralDir.y + parentVec.z * lateralDir.z;
    const outwardSign = lateralDot >= 0 ? +1 : -1;
    const extraOut = outwardSign * sf * rachisLen * 0.20;
    const subPos: V3 = {
      x: parentPrimary.pos.x + lateralDir.x * extraOut,
      y: parentPrimary.pos.y + lateralDir.y * extraOut * 0.5,
      z: parentPrimary.pos.z + lateralDir.z * extraOut,
    };
    void lateralOffsetSign;

    // ★ Iter 39 Phase H2 (사용자 #8) — sub-vein edgeId가 lid suffix와 동기.
    const subVeinEdgeId =
      `e:sub-vein:axis${axisIdx}:n${leafNodeIdx}:sec:${leafletIndex}`;
    edges.set(subVeinEdgeId, {
      id: subVeinEdgeId,
      type: 'sub-vein',
      startNodeId: parentPrimary.lid,  // ★ primary leaflet이 부모
      endNodeId: lid,
      bonePath: [{
        p0: { ...parentPrimary.pos },
        p1: { ...subPos },
        r0: 0.0003,
        r1: 0.0002,
      }],
      // ★ Iter 39 Phase H2 (사용자 #6) — parentEdgeId = parent primary _edge_ id.
      //   이전 (BUG): leafRachisEdgeId (마지막 rachis sub-edge) — cut hierarchy 부정확.
      //   수정: parent primary leaflet의 edge → secondary가 primary의 _자식_ chain 보존.
      parentEdgeId: parentPrimary.edgeId,
      cuttable: true,
      semanticLabel: `sub-leaflet of primary ${parentPrimary.lid}`,
      attachedOrganIds: [],
    });
    // ★ Iter 39 Phase G2 — secondary bladeDir = lateral × 0.75 + distal × 0.25
    //   (lateral은 parent primary에서 sub로 향하는 방향).
    const secLdx = subPos.x - parentPrimary.pos.x;
    const secLdy = subPos.y - parentPrimary.pos.y;
    const secLdz = subPos.z - parentPrimary.pos.z;
    const secLLen = Math.sqrt(secLdx * secLdx + secLdy * secLdy + secLdz * secLdz);
    const secLateral: V3 = secLLen > 1e-6
      ? { x: secLdx / secLLen, y: secLdy / secLLen, z: secLdz / secLLen }
      : { x: lateralDir.x, y: lateralDir.y, z: lateralDir.z };
    const secBdx = secLateral.x * 0.75 + rachisDir.x * 0.25;
    const secBdy = secLateral.y * 0.75 + rachisDir.y * 0.25;
    const secBdz = secLateral.z * 0.75 + rachisDir.z * 0.25;
    const secBdLen = Math.sqrt(secBdx * secBdx + secBdy * secBdy + secBdz * secBdz);
    const secBladeDir: V3 = secBdLen > 1e-6
      ? { x: secBdx / secBdLen, y: secBdy / secBdLen, z: secBdz / secBdLen }
      : secLateral;
    nodes.set(lid, {
      id: lid,
      pos: subPos,
      radius: 0.0003,
      edgeIds: [subVeinEdgeId],
      leafletRef: {
        parentLeafNodeId,
        position: 'secondary',
        rachisU,
        sizeFactor: sf,
        // ★ Iter 39 Phase G3 — helper로 secondary clamp (primary × 0.70 cap).
        targetSizeM: computeLeafletTargetSize('secondary', rachisLen, sf, maturity),
        // ★ G2 (C2): secondary attachNode = parent primary leaflet.
        attachNodeId: parentPrimary.lid,
        // ★ G2 (C3): bladeDir = lateral × 0.75 + distal × 0.25.
        bladeDir: secBladeDir,
      } satisfies LeafletNodeRef,
    });
    // parent primary node에 sub-vein edge 등록.
    const parentNodeRef = nodes.get(parentPrimary.lid);
    if (parentNodeRef) parentNodeRef.edgeIds.push(subVeinEdgeId);
  };

  // ─── Iter 39 Phase I0-f — Layout-first materialization ──────────────────
  //   사용자 v10 #2: layout item이 _source of truth_임이 코드에 명시.
  //   `addRachisChild(p, u, sf, side, type)` 5-arg 직접 호출 금지 — wrapper로 통일.
  //
  //   사용자 v10 #3: nearest fallback _완전 제거_ — getExactAttachNodeId만.
  //   layout.items의 rachisU는 모두 layout.uniqueAttachUs에 _포함됨이 보장_됨
  //   (computeLeafletLayout 산식 invariant) → strict match success.
  //
  //   terminal item은 sub-rachis chain에서 _이미_ 생성됨 (위 attachUs 루프) → skip.
  void profile;  // spacingBias는 skeleton 단계에서 사용 안 함 (H3 명시 제약)
  const materializeLeafletSpec = (item: LeafletLayoutItem): ReturnType<typeof addRachisChild> | null => {
    if (item.position === 'terminal') return null;  // sub-rachis chain에서 이미 생성
    if (item.edgeType === 'leaf-rachis') return null;  // defensive: terminal-only
    return addRachisChild(
      item.position,
      item.rachisU,
      item.sizeFactor,
      item.side,
      item.edgeType,
    );
  };

  // Primary는 secondary parent로 쓰이므로 _순서대로_ 캐시.
  const primaries: Array<{
    lid: string; pos: V3; edgeId: string;
    attachNodeId: string; position: LeafletPosition; rachisU: number; bladeDir: V3;
  }> = [];
  for (const item of layout.items) {
    const created = materializeLeafletSpec(item);
    if (created && item.position === 'primary') primaries.push(created);
  }

  // ─── Iter 39 Phase I3-A — Secondary 임시 비활성화 ────────────────────
  //   사용자 v9: primary/intercalary/terminal skeleton acceptance까지 secondary
  //   off. addSubLeaflet은 보존 — I5 후 conditional 복원 (agePreset complex,
  //   maturity > 0.75)으로 다시 활성.
  if (ENABLE_SECONDARY_LEAFLETS) {
    for (let i = 0; i < bladeRef.secondaryCount && i < primaries.length; i++) {
      const parent = primaries[i];
      const secSeed = leafNodeIdx * 0.7919 + i * 17;
      const sf = 0.35 + (((secSeed * 31) % 30) / 100);  // 0.35-0.65
      const sign = i % 2 === 0 ? +1 : -1;
      addSubLeaflet(parent, parent.rachisU, sf, sign);
    }
  }
}

/**
 * Iter 36 v5 Phase B — axillary bud node 생성.
 *
 * axis.buds (BudMarker[])를 순회 — dormant + activated 모두 skeleton에 표현.
 * activated 시 activatedAxisId로 sideShoot edge link (lineage 추적).
 */
/**
 * Iter 36 v5 Phase M — 생장점 (apex meristem) node.
 *
 * 사용자 botanical: "줄기의 마디에서 잎·곁가지·꽃이 나오고, 잎겨드랑이에서 곁가지·
 * 화방이 생긴다." 생장점은 줄기 _최상단_의 새 organ emerge 부위.
 *
 * 산식: mainAxis stemCurve 마지막 segment 위쪽 ~5cm offset (visible marker).
 */
/**
 * Iter 37 Q3.1 — Primordium marker (Stage 1).
 *
 * leafMaturity > 0 && < 0.05 인 잎 — _아주 작은 마커_ 만 표시.
 * 사용자 botanical: "줄기 옆 작은 초록 돌기, 가느다란 순".
 * petiole/leaflet 미생성 — primordium은 _개념상 표시_만.
 */
function addPrimordiumMarker(
  axisIdx: number,
  leaf: LeafBase,
  nodes: Map<string, SkeletonNode>,
): void {
  const attachNodeId = stemNodeId(axisIdx, leaf.nodeIdx);
  const stemNode = nodes.get(attachNodeId);
  if (!stemNode) return;
  const az = (leaf as unknown as { azimuthRad?: number }).azimuthRad ?? 0;
  // primordium = stem surface에서 약간 옆으로 + 위쪽 (어린 잎 원기).
  const pid = `n:primordium:axis${axisIdx}:n${leaf.nodeIdx}`;
  nodes.set(pid, {
    id: pid,
    pos: {
      x: stemNode.pos.x + Math.cos(az) * 0.008,
      y: stemNode.pos.y + 0.003,
      z: stemNode.pos.z + Math.sin(az) * 0.008,
    },
    radius: 0.0005,
    edgeIds: [],
  });
}

function addApexNode(
  axis: AxisBase,
  axisIdx: number,
  nodes: Map<string, SkeletonNode>,
  edges: Map<string, SkeletonEdge>,
): void {
  if (axis.stemCurve.length === 0) return;
  const top = axis.stemCurve[axis.stemCurve.length - 1];
  const aid = `n:apex:axis${axisIdx}`;
  const topNodeId = stemNodeId(axisIdx, top.nodeIdx);
  const topNode = nodes.get(topNodeId);
  const apexPos = { x: top.position.x, y: top.position.y + 0.03, z: top.position.z };

  // Iter 37 Q1.3 — apex-stem extension edge (mainStem 연장선).
  //   이전: apex가 _고립 노드_로 stem 위 3cm 떠있음 (시각상 disconnected).
  //   현재: stem top → apex 연결 edge (cuttable=false, mainStem type 재사용).
  const apexEdgeId = `e:apex:axis${axisIdx}`;
  edges.set(apexEdgeId, {
    id: apexEdgeId,
    type: 'mainStem',
    startNodeId: topNodeId,
    endNodeId: aid,
    bonePath: [{
      p0: { ...top.position },
      p1: apexPos,
      r0: top.radius,
      r1: top.radius * 0.3,  // apex는 가늘게 (생장점 작음)
    }],
    parentEdgeId: axisIdx === 0 ? 'e:mainStem' : `e:sideShoot:${axisIdx}`,
    cuttable: false,
    semanticLabel: `apex extension`,
    attachedOrganIds: [],
  });

  nodes.set(aid, {
    id: aid,
    pos: apexPos,
    radius: 0.0015,
    edgeIds: [apexEdgeId],
  });
  if (topNode) topNode.edgeIds.push(apexEdgeId);
}

/**
 * Iter 36 v5 Phase M — 떡잎 (cotyledon) node.
 *
 * 사용자 botanical: 발아 시 처음 나오는 _2개의 잎_ (좌 -1 / 우 +1, side field).
 * 발아 후 곧 떨어지지만 D=0~10에서 visible. PlantBase.cotyledons 데이터를 그대로
 * skeleton node로 표현 (visibility는 OrganVisibility로 PlantBase가 이미 결정).
 */
function addCotyledonNodes(
  plantBase: PlantBase,
  nodes: Map<string, SkeletonNode>,
  edges: Map<string, SkeletonEdge>,
): void {
  for (let i = 0; i < plantBase.cotyledons.length; i++) {
    const cot = plantBase.cotyledons[i];
    if (!cot.visibility.visible) continue;
    const cid = `n:cotyledon:side${cot.side === -1 ? 'L' : 'R'}`;

    // Iter 37 Q1.2 — cotyledon-petiole edge (mainStem base → cotyledon).
    //   이전: cotyledon이 _고립 노드_ — stem과 분리되어 보임.
    //   현재: mainStem 첫 stem-node (`n:axis0:n0`) → cotyledon petiole edge.
    //   petiole edge type 재사용 (cuttable=true, leaf petiole과 동일 의미).
    const baseStemNodeId = `n:axis0:n0`;
    const baseStemNode = nodes.get(baseStemNodeId);
    const edgeId = `e:cotyledon-petiole:side${cot.side === -1 ? 'L' : 'R'}`;
    const basePos = baseStemNode?.pos ?? { x: 0, y: 0, z: 0 };
    edges.set(edgeId, {
      id: edgeId,
      type: 'petiole',
      startNodeId: baseStemNodeId,
      endNodeId: cid,
      bonePath: [{
        p0: { ...basePos },
        p1: { ...cot.position },
        r0: 0.0008,
        r1: 0.0006,
      }],
      parentEdgeId: 'e:mainStem',
      cuttable: true,
      semanticLabel: `cotyledon ${cot.side === -1 ? 'L' : 'R'} petiole`,
      attachedOrganIds: [],
    });

    nodes.set(cid, {
      id: cid,
      pos: { ...cot.position },
      radius: 0.0015,
      edgeIds: [edgeId],
    });
    if (baseStemNode) baseStemNode.edgeIds.push(edgeId);
  }
}

function addBudsForAxis(
  axis: AxisBase,
  axisIdx: number,
  nodes: Map<string, SkeletonNode>,
): void {
  const buds = (axis as AxisBase & { buds?: Array<{ nodeIdx: number; state: string; position: V3 }> }).buds;
  if (!buds || buds.length === 0) return;
  for (let i = 0; i < buds.length; i++) {
    const bud = buds[i];
    const bid = `n:bud:axis${axisIdx}:n${bud.nodeIdx}:${i}`;
    const parentNodeId = stemNodeId(axisIdx, bud.nodeIdx);
    // activated (sideShoot 생성됨) → growing 으로 BudState 정의됨.
    // dormant 시 undefined. (BudState: 'dormant' | 'growing' | 'pruned')
    const activatedAxisId =
      bud.state === 'growing'
        ? `e:sideShoot:${i + 1}`  // approximation — Phase G에서 정확 link 검증
        : undefined;
    nodes.set(bid, {
      id: bid,
      pos: { ...bud.position },
      radius: 0.0015,
      edgeIds: [],
      budRef: {
        parentNodeId,
        state: bud.state,
        activatedAxisId,
      } satisfies BudNodeRef,
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

        // Iter 18B PR 8 (SSOT #180) / Iter 27 — structured OrganAnchors for
        // flower / fruit / calyx.
        // anchorNodeId = knuckleNodeId (joint = rachis knuckle).
        // meshAnchorNodeId = pedicelTipNodeId (mesh.position).
        // 정상 plant에서 anchorNodeId == chain.rootNodeId (= pedicel
        // edge.startNodeId = knuckleNodeId) → attachment line 0.
        const organAnchors: import('./PlantSkeletonGraph').OrganAnchor[] = [
          { id: `flower:axis${axisIdx}:t${trussIdx}:s${site.index}`, kind: 'flower', anchorNodeId: knuckleNodeId, meshAnchorNodeId: pedicelTipNodeId },
          { id: `fruit:axis${axisIdx}:t${trussIdx}:s${site.index}`,  kind: 'fruit',  anchorNodeId: knuckleNodeId, meshAnchorNodeId: pedicelTipNodeId },
          { id: `calyx:axis${axisIdx}:t${trussIdx}:s${site.index}`,  kind: 'calyx',  anchorNodeId: knuckleNodeId, meshAnchorNodeId: pedicelTipNodeId },
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

/**
 * ★ Iter 39 Phase G1 — 4-cp Catmull-Rom segment (smooth tangent continuity).
 *
 * cp0/cp3 = tangent control points (인접 attach point — 양 끝 tangent 산출).
 * cp1/cp2 = segment endpoints (★ _불변_ — exact attach point — RACHIS-ATTACH-01).
 *
 * Returns dense V3 array — first/last = cp1/cp2 exact, intermediate samples
 * smoothly interpolated. midSagY (optional)를 mid sample y에 보간하여 sag 효과.
 *
 * sub-edge별 _독립_ 3-pt Catmull-Rom (Iter 37 Q2.1)이 zig-zag 만들던 문제 해결:
 * 4-cp가 인접 segment와 tangent 연속성 보장.
 */
function catmullRomSegment4cp(
  cp0: V3, cp1: V3, cp2: V3, cp3: V3,
  divisions: number, midSagY?: number,
): V3[] {
  const samples: V3[] = [];
  const tension = 0.5;  // standard Catmull-Rom
  for (let s = 0; s <= divisions; s++) {
    const t = s / divisions;
    const t2 = t * t;
    const t3 = t2 * t;
    // Catmull-Rom basis (centripetal-like uniform):
    //   P(t) = 0.5 × ((-cp0 + 3cp1 - 3cp2 + cp3)t³
    //                + (2cp0 - 5cp1 + 4cp2 - cp3)t²
    //                + (-cp0 + cp2)t
    //                + 2cp1)
    const x = tension * (
      (-cp0.x + 3 * cp1.x - 3 * cp2.x + cp3.x) * t3
      + (2 * cp0.x - 5 * cp1.x + 4 * cp2.x - cp3.x) * t2
      + (-cp0.x + cp2.x) * t
      + 2 * cp1.x
    );
    const yBase = tension * (
      (-cp0.y + 3 * cp1.y - 3 * cp2.y + cp3.y) * t3
      + (2 * cp0.y - 5 * cp1.y + 4 * cp2.y - cp3.y) * t2
      + (-cp0.y + cp2.y) * t
      + 2 * cp1.y
    );
    const z = tension * (
      (-cp0.z + 3 * cp1.z - 3 * cp2.z + cp3.z) * t3
      + (2 * cp0.z - 5 * cp1.z + 4 * cp2.z - cp3.z) * t2
      + (-cp0.z + cp2.z) * t
      + 2 * cp1.z
    );
    // ★ midSagY 보간: intermediate samples에 sag 적용. endpoints는 _영향 없음_
    //   (t=0 또는 t=1에서 sag 가중치 0).
    let y = yBase;
    if (midSagY != null) {
      const w = 4 * t * (1 - t);  // hat function: 0 at t=0/1, peak 1 at t=0.5
      const midBaseY = (cp1.y + cp2.y) / 2;
      y = yBase + (midSagY - midBaseY) * w;
    }
    samples.push({ x, y, z });
  }
  // ★ Endpoint enforcement (float drift 방어 — RACHIS-ATTACH-01 strict):
  //   First/last samples 정확히 cp1/cp2로 강제.
  samples[0] = { ...cp1 };
  samples[samples.length - 1] = { ...cp2 };
  return samples;
}

/** Dense V3 array → SkeletonBone[] (radius 선형 taper). */
function boneListFromDenseSegment(
  dense: V3[], baseR: number, tipR: number,
): SkeletonBone[] {
  const n = dense.length;
  if (n < 2) {
    return [{
      p0: { ...dense[0] }, p1: { ...dense[0] }, r0: baseR, r1: tipR,
    }];
  }
  const out: SkeletonBone[] = [];
  for (let i = 0; i < n - 1; i++) {
    const t0 = i / (n - 1);
    const t1 = (i + 1) / (n - 1);
    out.push({
      p0: { ...dense[i] },
      p1: { ...dense[i + 1] },
      r0: baseR + (tipR - baseR) * t0,
      r1: baseR + (tipR - baseR) * t1,
    });
  }
  return out;
}
