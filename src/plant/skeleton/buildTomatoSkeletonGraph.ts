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

  return graph;
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
    const leafBladeRef = computeLeafBladeRef(leaf, cultivar);
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
function computeLeafBladeRef(
  leaf: LeafBase,
  cultivar?: import('@farmsim/tomato-engine').Cultivar,
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

  // 잎 길이: cultivar reference 0.12m × sizeFactor (Iter 36 v5 Phase A 산식).
  const leafLengthM = 0.12 * Math.max(0.05, sf);
  // petiole : rachis 비율 — mature 0.3 : 0.7.
  const petioleRatioM = 0.30;
  const rachisLengthM = leafLengthM * 0.70;

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
function addLeafletNodesForLeaf(
  axisIdx: number,
  leafNodeIdx: number,
  parentLeafNodeId: string,
  tipPos: V3,
  sizeFactor: number,
  bladeRef: LeafBladeRef,
  parentEdgeId: string,           // petiole edge (rachis의 부모)
  bones: SkeletonBone[],          // ★ Phase L — petiole bonePath
  totalLeafCount: number,         // ★ Iter 37 Q2.2 — axis 전체 잎 수 (leafPos 산출용)
  nodes: Map<string, SkeletonNode>,
  edges: Map<string, SkeletonEdge>,
): void {
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

  // ── Phase O — rachis를 _multiple sub-edges_로 분할 + attach nodes 분산 ──
  //   사용자 의도: 잎줄기에 _여러 마디_가 있고 각 마디에서 좌우 소엽 분기.
  //   이전 (Phase J): leaf-rachis edge가 하나 — 모든 leaflet이 terminal에서 분기 (별모양).
  //   신규: rachisU별 attach node + sub-rachis edge → botanical fishbone.

  // 1. 모든 attachment rachisU 수집 (primary + intercalary) + terminal(1.0)
  const primaryUs = [0.18, 0.35, 0.55, 0.75].slice(0, bladeRef.primaryPairs);
  const intercalaryUs: number[] = [];
  for (let i = 0; i < bladeRef.intercalaryCount; i++) {
    intercalaryUs.push(0.25 + (i / Math.max(1, bladeRef.intercalaryCount)) * 0.5);
  }
  // attach points: primary + intercalary + terminal(1.0). 중복 제거 + 정렬.
  const attachUsSet = new Set<number>();
  for (const u of primaryUs) attachUsSet.add(Math.round(u * 100) / 100);
  for (const u of intercalaryUs) attachUsSet.add(Math.round(u * 100) / 100);
  attachUsSet.add(1.0);  // terminal
  const attachUs = Array.from(attachUsSet).sort((a, b) => a - b);

  // 2. rachis를 sub-edges로 분할 — leaf-blade-root → attach[0] → attach[1] → ... → terminal.
  //    각 attach node 생성 + sub-edge 등록 + parent edge id Map (rachisU → edge id).
  const attachNodeByU = new Map<number, string>();
  const subRachisEdgeIdByU = new Map<number, string>();
  let prevNodeId = parentLeafNodeId;
  let prevPos: V3 = { ...tipPos };

  for (let i = 0; i < attachUs.length; i++) {
    const u = attachUs[i];
    const attachPos = rachisPointAt(u);
    const isTerminal = u >= 0.999;
    const attachNodeId = isTerminal
      ? `n:leaflet:axis${axisIdx}:n${leafNodeIdx}:terminal:0`  // terminal node ID 유지
      : `n:rachis-attach:axis${axisIdx}:n${leafNodeIdx}:u${u.toFixed(2)}`;

    // sub-rachis edge.
    const subEdgeId = `e:leaf-rachis:axis${axisIdx}:n${leafNodeIdx}:seg${i}`;
    // ★ Iter 37 Q6.1 — rachis taper 강화 (base 1.4mm → tip 0.4mm).
    const r0 = 0.0014 - 0.0010 * (i / Math.max(1, attachUs.length));
    const r1 = 0.0014 - 0.0010 * ((i + 1) / Math.max(1, attachUs.length));

    // ★ Iter 37 Q2.1 — Catmull-Rom curve with droop sag (이전: single line).
    //   droopBias = -rachisLen × 0.10 × u (사용자 §1 rachisBend 0-12%).
    //   mid-point에 y bias 적용 → 자연스러운 S/U 곡선.
    const droopBias = -rachisLen * 0.10 * u;
    const sagPos: V3 = {
      x: (prevPos.x + attachPos.x) / 2,
      y: (prevPos.y + attachPos.y) / 2 + droopBias,
      z: (prevPos.z + attachPos.z) / 2,
    };
    const subBones = bonesFromCurve([prevPos, sagPos, attachPos], r0, r1, 3);

    edges.set(subEdgeId, {
      id: subEdgeId,
      type: 'leaf-rachis',
      startNodeId: prevNodeId,
      endNodeId: attachNodeId,
      bonePath: subBones,
      parentEdgeId: i === 0 ? parentEdgeId : subRachisEdgeIdByU.get(attachUs[i - 1])!,
      cuttable: true,
      semanticLabel: `leaf ${leafNodeIdx} rachis seg ${i}`,
      attachedOrganIds: [],
    });
    subRachisEdgeIdByU.set(u, subEdgeId);

    // attach node 생성 (terminal은 leafletRef 포함).
    if (isTerminal) {
      const terminalSf = 1.15;
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
          targetSizeM: rachisLen * terminalSf * 0.4,
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

    attachNodeByU.set(u, attachNodeId);
    prevNodeId = attachNodeId;
    prevPos = attachPos;
  }

  const terminalLid = attachNodeByU.get(1.0)!;
  const leafRachisEdgeId = subRachisEdgeIdByU.get(1.0)!;  // 마지막 sub-edge — sub-vein parent로 사용.

  // attach node lookup helper — rachisU에 가장 가까운 attach node 찾기.
  const findAttachNodeForU = (u: number): string => {
    const rounded = Math.round(u * 100) / 100;
    if (attachNodeByU.has(rounded)) return attachNodeByU.get(rounded)!;
    // fallback: 가장 가까운 attachU.
    let bestU = attachUs[0];
    let bestDist = Math.abs(rounded - bestU);
    for (const a of attachUs) {
      const d = Math.abs(rounded - a);
      if (d < bestDist) { bestDist = d; bestU = a; }
    }
    return attachNodeByU.get(bestU)!;
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
  ): { lid: string; pos: V3 } => {
    const lid = `n:leaflet:axis${axisIdx}:n${leafNodeIdx}:${position}:${leafletCounter++}`;
    const rachisPos = rachisPointAt(rachisU);

    // ★ Iter 37 Q2.2 — 부착 각도 leafPos별 분기 (사용자 §6).
    //   이전: 90° lateral 완벽 수평 (고사리 fern shape).
    //   현재: stem 위치(top/mid/bottom)에 따라 20-85° 범위 분산 + jitter.
    const leafPos = leafNodeIdx / Math.max(1, totalLeafCount);
    let baseAngleDeg: number;
    if (leafPos < 0.33) baseAngleDeg = 20 + leafPos * 105;             // 위쪽 잎: 20-55°
    else if (leafPos < 0.66) baseAngleDeg = 35 + (leafPos - 0.33) * 105; // 중간: 35-70°
    else baseAngleDeg = 45 + (leafPos - 0.66) * 120;                   // 아래쪽: 45-85°
    baseAngleDeg += (1 - rachisU) * 15;  // terminal에 가까울수록 0-15° 추가 spread
    const seed = leafNodeIdx * 0.7919 + leafletCounter * 31;
    const angleJitter = ((seed * 13) % 200 - 100) / 10;  // ±10°
    const attachRad = (baseAngleDeg + angleJitter) * Math.PI / 180;

    // 부착 방향 — rachis vs lateral 사이의 _각도_ 가 attachRad.
    const sinA = Math.sin(attachRad);
    const cosA = Math.cos(attachRad);
    const dirOut: V3 = {
      x: lateralDir.x * sinA + rachisDir.x * cosA,
      y: lateralDir.y * sinA + rachisDir.y * cosA,
      z: lateralDir.z * sinA + rachisDir.z * cosA,
    };
    const outAmount = lateralOffsetSign * sf * rachisLen * 0.35;

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
    const targetSizeM = rachisLen * sf * 0.4;

    // ★ Phase O — attach node에서 분기 (이전: terminalLid에서 모두 시작).
    const attachNodeId = findAttachNodeForU(rachisU);
    const attachNode = nodes.get(attachNodeId);
    const attachPos = attachNode?.pos ?? rachisPos;
    const parentSubRachisEdgeId =
      subRachisEdgeIdByU.get(Math.round(rachisU * 100) / 100)
      ?? leafRachisEdgeId;

    // ★ Iter 37 Q2.4 — Petiolule arch (rachisLen × 0.02 비례).
    //   이전: bonePath = [{p0, p1}] single straight bone (직선).
    //   현재: 3-point catmull-rom with mid arch.
    const archHeight = rachisLen * 0.02;
    const archMid: V3 = {
      x: (attachPos.x + leafletPos.x) / 2,
      y: (attachPos.y + leafletPos.y) / 2 + archHeight,
      z: (attachPos.z + leafletPos.z) / 2,
    };
    const petioluleBones = bonesFromCurve(
      [attachPos, archMid, leafletPos], 0.0005, 0.0003, 3,
    );

    const edgeId =
      `e:${edgeType}:axis${axisIdx}:n${leafNodeIdx}:${position}:${leafletCounter}`;
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
      } satisfies LeafletNodeRef,
    });
    return { lid, pos: leafletPos };
  };

  // ── secondary leaflet (소엽2) — primary의 _자식_으로 부착 ──
  //   Phase N: secondary는 _primary leaflet에서_ sub-vein으로 분기 (bipinnate).
  //   사용자 ASCII "소엽 → 소엽2" 직접 매핑.
  const addSubLeaflet = (
    parentPrimary: { lid: string; pos: V3 },
    rachisU: number,
    sf: number,
    lateralOffsetSign: number,
  ): void => {
    const lid =
      `n:leaflet:axis${axisIdx}:n${leafNodeIdx}:secondary:${leafletCounter++}`;
    // sub-leaflet 위치: primary leaflet에서 _outward_ 방향으로 추가 offset.
    const subSpacing = parentPrimary.pos.x - tipPos.x;  // primary가 얼마나 옆으로 나갔는지
    const outwardSign = subSpacing >= 0 ? +1 : -1;
    const extraOut = outwardSign * sf * rachisLen * 0.20;
    const subPos: V3 = {
      x: parentPrimary.pos.x + lateralDir.x * extraOut,
      y: parentPrimary.pos.y + lateralDir.y * extraOut * 0.5,
      z: parentPrimary.pos.z + lateralDir.z * extraOut,
    };
    void lateralOffsetSign;

    const subVeinEdgeId =
      `e:sub-vein:axis${axisIdx}:n${leafNodeIdx}:sec:${leafletCounter}`;
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
      parentEdgeId: leafRachisEdgeId,  // primary 부착 edge의 child로 cut hierarchy 유지
      cuttable: true,
      semanticLabel: `sub-leaflet of primary ${parentPrimary.lid}`,
      attachedOrganIds: [],
    });
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
        targetSizeM: rachisLen * sf * 0.4,
      } satisfies LeafletNodeRef,
    });
    // parent primary node에 sub-vein edge 등록.
    const parentNodeRef = nodes.get(parentPrimary.lid);
    if (parentNodeRef) parentNodeRef.edgeIds.push(subVeinEdgeId);
  };

  // 2. Primary pairs (left/right) — 위에서 산출한 primaryUs 사용.
  const primaries: { lid: string; pos: V3 }[] = [];
  for (let i = 0; i < primaryUs.length; i++) {
    const sf = 0.85 - i * 0.10;
    primaries.push(addRachisChild('primary', primaryUs[i], sf, -1, 'lateral-vein'));
    primaries.push(addRachisChild('primary', primaryUs[i] + 0.02, sf, +1, 'lateral-vein'));
  }

  // 3. Intercalary — rachis 직접 부착 (petiolule edge).
  for (let i = 0; i < bladeRef.intercalaryCount; i++) {
    const u = intercalaryUs[i];
    const sf = 0.10 + (i % 3) * 0.08;
    const sign = i % 2 === 0 ? -1 : +1;
    addRachisChild('intercalary', u, sf, sign, 'petiolule');
  }

  // 4. ★ Phase N — secondary (sub-leaflet) = primary leaflet의 _자식_.
  //    사용자 ASCII "소엽 → 소엽2" 명확 표현. sub-vein으로 분기.
  for (let i = 0; i < bladeRef.secondaryCount && i < primaries.length; i++) {
    const parent = primaries[i];
    const sf = 0.30 + (i % 2) * 0.10;
    const u = primaryUs[Math.floor(i / 2) % primaryUs.length] + 0.04;
    const sign = i % 2 === 0 ? +1 : -1;
    addSubLeaflet(parent, u, sf, sign);
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
