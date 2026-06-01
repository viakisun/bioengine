// StemFamilyTubeNetworkBuilder — single Mesh, single VertexData buffer.
//
// Generates the entire stem-family (mainStem / sideShoot / petiole / peduncle
// / rachis / pedicel) as one Babylon Mesh with one positions+indices buffer.
// Topology connection is NOT a goal — individual tube components are
// disjoint but live in the same buffer.
//
// Branch transitions use the "embedded branch" technique: each child tube
// starts inside the parent tube body (at parentCenter + radialDir × (R−embed))
// with no start cap, so the visual gap between parent and child is closed
// by overlap rather than by stitching. Parent radius at junction nodes is
// pre-bumped (parentSwellingScale) so the parent surface bulges into the
// branch and hides the seam.
//
// Frame algorithm: same world-up-referenced Frenet-like frame used by
// sweepTube (StemGenerator.ts:319-339). No parallel transport.
//
// Per-vertex / per-face metadata:
//   - faceGroups: index-buffer range → edge id (primary lookup for Phase 5
//     cut/pick via scene.pick faceId)
//   - vertexEdgeTag + edgeIdByIdx: per-vertex compact edge index (debug,
//     boundary cases only)
//
// SSOT Phase 4 — implements "continuous branching surface" principle (4.6)
// via embedded branches rather than stitching.

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import {
  type PlantSkeletonGraph,
  type SkeletonEdge,
  type SkeletonBone,
  type SkeletonEdgeType,
  buildChildIndex,
} from '../skeleton/PlantSkeletonGraph';
import type { V3 } from '../sdf/CapsuleSDF';

// ── public types ──────────────────────────────────────────────────────

export interface PlantFaceGroup {
  /** Index buffer offset (0-based into mesh.indices), NOT triangle count. */
  indexStart: number;
  /** Number of indices in this group (multiple of 3). */
  indexCount: number;
  edgeId: string;
  edgeType: SkeletonEdgeType;
}

export interface PlantStemFamilyMesh {
  /** Single Babylon Mesh. */
  mesh: Mesh;
  faceGroups: PlantFaceGroup[];
  /** Per-vertex compact edge index (debug). */
  vertexEdgeTag: Uint16Array;
  edgeIdByIdx: string[];
  stats: {
    edgeCount: number;
    branchCount: number;
    vertexCount: number;
    triangleCount: number;
    buildMs: number;
    // Iter 18A SSOT #176 — per-edge-type instrumentation for fidelity audit.
    edgesByType: Partial<Record<SkeletonEdgeType, number>>;
    emittedByType: Partial<Record<SkeletonEdgeType, number>>;
    /** Per-type biological radius (graph edge bonePath[0].r0) — min/median/max/count. */
    biologicalRadiusByType: Partial<Record<SkeletonEdgeType, RadiusStat>>;
    /** Per-type effective render radius (after rootRadiusScale + swelling). */
    renderRadiusByType: Partial<Record<SkeletonEdgeType, RadiusStat>>;
    /** Child edges whose start point is farther than 1mm from parent surface
     *  along the radial direction — surfaces "floating" relative to parent.
     *  See Iter 18C plan: this metric may be a false positive that confuses
     *  stem center-to-surface gap with true floating. */
    floatingCandidateCount: number;
    floatingCandidateIds: string[];
    /** Iter 18C — per-edge `childStart` after embedDepth+rootRadiusScale.
     *  Used by docking debug overlay (`__skinplantPetioleDock`) to expose
     *  the actual mesh root vs the graph bonePath[0].p0. */
    renderedRootByEdgeId: Record<string, { x: number; y: number; z: number }>;
    /** Iter 20 — per-edge parent stem context at the child's attach point.
     *  Pure measurement export (no geometry change) used by the petiole-stem
     *  junction debug overlay to compute occlusion depth + firstVisiblePoint.
     *
     *  SSOT #185 — Coordinate frame: **plant-local** (= graph node.pos 좌표계).
     *  - center: parent stem centerline 위 위치 (child attach point에서 interp)
     *  - tangent: parent centerline 방향 unit vector
     *  - radius: swollen render radius (post-swelling, post-floor) in meters
     *  참조: docs/architecture/COORDINATE_SYSTEMS.md */
    parentContextByEdgeId: Record<string, {
      center: { x: number; y: number; z: number };
      tangent: { x: number; y: number; z: number };
      radius: number;
    }>;
  };
}

export interface RadiusStat {
  min: number;
  median: number;
  max: number;
  count: number;
}

export interface StemFamilyTubeOpts {
  radialSegments?: number;                                       // default 8
  embedDepthFrac?: Partial<Record<SkeletonEdgeType, number>>;    // per-type
  rootRadiusScale?: number;                                      // default 1.15
  parentSwellingScale?: number;                                  // default 1.10
}

// ── local vector helpers (mirror PlantBase.ts private V3 utils) ────────

function vsub(a: V3, b: V3): V3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function vadd(a: V3, b: V3): V3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function vscale(a: V3, s: number): V3 { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function vdot(a: V3, b: V3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function vlen(a: V3): number { return Math.hypot(a.x, a.y, a.z); }
function vnorm(a: V3): V3 { const l = vlen(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
function vcross(a: V3, b: V3): V3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

const EPSILON = 1e-4;

/**
 * ★ Iter 39 Phase H4 — Arc length 기준 bonePath truncate.
 *
 * fraction (0-1): bonePath의 _arc length_ 누적 fraction만큼만 emit.
 * - fraction >= 1.0: 변경 없이 반환
 * - fraction <= 0.0: 빈 배열
 * - 중간: target arc length에서 마지막 bone을 interpolate.
 *
 * 사용자 plan v7 review #6: "bone count 기준 슬라이스 X, arc length 기준이어야
 * segment 길이가 비균일해도 정확한 시각 비율".
 */
function truncateBonePathByArcLength(
  bones: SkeletonBone[],
  fraction: number,
): SkeletonBone[] {
  if (fraction >= 1.0) return bones;
  if (fraction <= 0.0) return [];
  let total = 0;
  for (const b of bones) total += vlen(vsub(b.p1, b.p0));
  if (total <= 0) return [];
  const target = total * fraction;
  let accumulated = 0;
  const out: SkeletonBone[] = [];
  for (const b of bones) {
    const segLen = vlen(vsub(b.p1, b.p0));
    if (accumulated + segLen <= target) {
      out.push(b);
      accumulated += segLen;
    } else {
      const remain = target - accumulated;
      const remainFrac = segLen > 0 ? remain / segLen : 0;
      out.push({
        p0: { ...b.p0 },
        p1: {
          x: b.p0.x + (b.p1.x - b.p0.x) * remainFrac,
          y: b.p0.y + (b.p1.y - b.p0.y) * remainFrac,
          z: b.p0.z + (b.p1.z - b.p0.z) * remainFrac,
        },
        r0: b.r0,
        r1: b.r0 + (b.r1 - b.r0) * remainFrac,
      });
      break;
    }
  }
  return out;
}

// ── colors per edge type (vertex color baked) ──────────────────────────

const COLOR_BY_EDGE_TYPE: Record<SkeletonEdgeType, [number, number, number]> = {
  mainStem:  [0.40, 0.50, 0.25],
  sideShoot: [0.40, 0.50, 0.25],
  petiole:   [0.23, 0.54, 0.19],
  peduncle:  [0.29, 0.54, 0.19],
  rachis:    [0.35, 0.60, 0.25],
  pedicel:   [0.35, 0.60, 0.25],
  // Iter 39 — leaf hierarchy edges도 SDF tube skin 생성 (사용자: "줄기와 같은 방식").
  //   tomato leaf vein/rachis는 잎 색 톤 (밝은 녹색, midrib).
  'leaf-rachis':  [0.32, 0.55, 0.20],
  petiolule:      [0.36, 0.58, 0.22],
  'lateral-vein': [0.36, 0.58, 0.22],
  'sub-vein':     [0.40, 0.60, 0.26],
};

// ── default embed depth per edge type (fraction of parent radius) ──────

const DEFAULT_EMBED_DEPTH_FRAC: Record<SkeletonEdgeType, number> = {
  mainStem:  0.0,   // root — no parent
  sideShoot: 0.8,
  petiole:   0.6,
  peduncle:  0.6,
  rachis:    0.5,
  pedicel:   0.5,
  // Iter 39 — leaf hierarchy edges도 SDF skin. parent embed fraction은 줄기
  //   계열보다 _작게_ — rachis/vein은 얇아서 깊이 박히면 모체에 잠김.
  'leaf-rachis':  0.4,   // petiole tip에 부착
  petiolule:      0.3,   // rachis-attach node에 부착 (intercalary)
  'lateral-vein': 0.3,   // rachis-attach node에 부착 (primary)
  'sub-vein':     0.25,  // primary leaflet에 부착 (secondary)
};

// Iter 18A SSOT #178 — absolute floor (meters) per child type. fraction은
// parent가 두꺼울 때 적합하나, parent radius가 1-2mm 정도면 embed depth
// < 1mm이 되어 child가 시각적으로 parent에 거의 안 박혀 "꽂혀 있는" 인상.
// effectiveEmbed = max(fraction * parentRadius, absolute floor).
const DEFAULT_EMBED_DEPTH_FLOOR_M: Record<SkeletonEdgeType, number> = {
  mainStem:  0,
  sideShoot: 0.004,   // 4mm
  petiole:   0.0015,  // 1.5mm
  peduncle:  0.0020,  // 2.0mm
  rachis:    0.0010,  // 1.0mm
  pedicel:   0.0010,  // 1.0mm
  // Iter 39 — leaf hierarchy edges도 SDF skin. embed floor는 매우 얇음
  //   (vein은 sub-mm 굵기).
  'leaf-rachis':  0.0003,  // 0.3mm
  petiolule:      0.0002,  // 0.2mm
  'lateral-vein': 0.0002,  // 0.2mm
  'sub-vein':     0.0002,  // 0.2mm
};

// Iter 18A SSOT #177 — render-time pixel-visibility radius floor (meters).
// engine biological radius (edge.bonePath[i].r0/r1)는 변경 없이 유지.
// 이 floor는 swelling/embed clone된 bone에만 적용 — 0.5mm 이하 organ이
// sub-pixel로 사라지지 않도록 보장. biological 값과 분리 (debug overlay에서
// 두 값 비교 가능, SSOT #176 stats.biologicalRadiusByType vs renderRadiusByType).
//
// ★ Iter 39 Phase F1 — type별 floor로 교체 (사용자: petiole/leaf-rachis/petiolule/
//   sub-vein이 모두 0.8mm로 압축되어 굵기 위계 안 보임). 줄기 계열은 0.8mm 유지,
//   leaf hierarchy는 botanical 위계대로 차등:
//     leaf-rachis 0.3mm (main midrib), petiolule 0.1mm (connector), vein 0mm (skip 예정).
//   Phase F2의 SDF_SKIP_TYPES와 호환 — vein 0mm는 emit 안 됨, petiolule 0.1mm는
//   짧은 connector로 가시화.
const RENDER_RADIUS_FLOOR_M = 0.0008;  // 0.8mm — 줄기 계열 기본 (deprecated: 아래 dict 사용)
const RENDER_RADIUS_FLOOR_M_BY_TYPE: Record<SkeletonEdgeType, number> = {
  mainStem: 0.0008, sideShoot: 0.0008,
  petiole: 0.0008, peduncle: 0.0008, rachis: 0.0008, pedicel: 0.0008,
  'leaf-rachis':  0.0003,  // 0.3mm — biological floor (main leaf midrib)
  petiolule:      0.0003,  // ★ G2 (B3): 0.1mm → 0.3mm. visible attachment connector
                           //   (사용자: "공중 카드 인상 회피 — petiolule이 보여야 부착감")
  'lateral-vein': 0.0,     // F2에서 SDF skip — vein은 surface로 (F2.5)
  'sub-vein':     0.0,     // F2에서 SDF skip
};

// ── frame (sweepTube-compatible, world-up referenced) ──────────────────

interface Frame {
  tangent: V3;
  normal: V3;
  binormal: V3;
}

const WORLD_UP: V3 = { x: 0, y: 1, z: 0 };

function makeFrame(tangent: V3): Frame {
  const t = vnorm(tangent);
  let n: V3;
  if (Math.abs(vdot(t, WORLD_UP)) > 0.99) {
    // tangent ∥ up → use X-axis as fallback
    n = { x: 1, y: 0, z: 0 };
  } else {
    n = vnorm(vcross(WORLD_UP, t));
  }
  const b = vnorm(vcross(t, n));
  return { tangent: t, normal: n, binormal: b };
}

// ── emit a ring of radialSegs+1 vertices (UV seam closure) ─────────────

function emitRing(
  pos: V3,
  radius: number,
  frame: Frame,
  radialSegs: number,
  vAlong: number,
  color: [number, number, number],
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
): number {
  const colCount = radialSegs + 1;
  const firstIdx = positions.length / 3;
  for (let c = 0; c < colCount; c++) {
    const theta = (c / radialSegs) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // radial = normal * cos + binormal * sin
    const rx = frame.normal.x * cos + frame.binormal.x * sin;
    const ry = frame.normal.y * cos + frame.binormal.y * sin;
    const rz = frame.normal.z * cos + frame.binormal.z * sin;
    positions.push(pos.x + rx * radius, pos.y + ry * radius, pos.z + rz * radius);
    normals.push(rx, ry, rz);
    uvs.push(c / radialSegs, vAlong);
    colors.push(color[0], color[1], color[2], 1);
  }
  return firstIdx;
}

// ── emit a triangle fan cap around a ring (outward normal = ±tangent) ──

function emitCap(
  ringFirstIdx: number,
  ringPos: V3,
  ringRadius: number,
  frame: Frame,
  radialSegs: number,
  outwardSign: number,  // +1 (start cap, facing -tangent) or -1 (end cap, facing +tangent)
  color: [number, number, number],
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
): void {
  // Center vertex
  const centerIdx = positions.length / 3;
  positions.push(ringPos.x, ringPos.y, ringPos.z);
  const nx = -frame.tangent.x * outwardSign;
  const ny = -frame.tangent.y * outwardSign;
  const nz = -frame.tangent.z * outwardSign;
  normals.push(nx, ny, nz);
  uvs.push(0.5, outwardSign > 0 ? 0 : 1);
  colors.push(color[0], color[1], color[2], 1);

  // Fan triangles: indices wind CCW from outside.
  // Start cap (outwardSign=+1, normal = -tangent): looking from outside
  //   (= from -tangent direction). Ring rotates CCW from above? cap normal
  //   is -tangent; triangles (center, ring[i+1], ring[i]) for CCW seen from
  //   -tangent.
  // End cap (outwardSign=-1, normal = +tangent): (center, ring[i], ring[i+1]).
  for (let c = 0; c < radialSegs; c++) {
    if (outwardSign > 0) {
      indices.push(centerIdx, ringFirstIdx + c + 1, ringFirstIdx + c);
    } else {
      indices.push(centerIdx, ringFirstIdx + c, ringFirstIdx + c + 1);
    }
  }
  void ringRadius;  // unused; kept in signature for clarity
}

// ── emit a tube along bonePath: rings + quad strips + optional caps ────

function emitTube(
  bonePath: SkeletonBone[],
  radialSegs: number,
  capStart: boolean,
  capEnd: boolean,
  color: [number, number, number],
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
): { ringFirstIdxs: number[]; rings: number } {
  if (bonePath.length === 0) return { ringFirstIdxs: [], rings: 0 };

  // Compute tangents for each ring (one per bone endpoint).
  // Ring count = bonePath.length + 1 (each bone contributes one ring at p1,
  // plus an initial ring at p0).
  const ringCount = bonePath.length + 1;
  const positionsAt: V3[] = new Array(ringCount);
  const radiiAt: number[] = new Array(ringCount);
  positionsAt[0] = bonePath[0].p0;
  radiiAt[0] = bonePath[0].r0;
  for (let i = 0; i < bonePath.length; i++) {
    positionsAt[i + 1] = bonePath[i].p1;
    radiiAt[i + 1] = bonePath[i].r1;
  }

  // Tangent at ring i = central difference between positionsAt[i-1] and [i+1].
  // Endpoints: forward / backward difference.
  const tangents: V3[] = new Array(ringCount);
  for (let i = 0; i < ringCount; i++) {
    let t: V3;
    if (i === 0) {
      t = vsub(positionsAt[1], positionsAt[0]);
    } else if (i === ringCount - 1) {
      t = vsub(positionsAt[i], positionsAt[i - 1]);
    } else {
      t = vsub(positionsAt[i + 1], positionsAt[i - 1]);
    }
    if (vlen(t) < EPSILON) {
      // Degenerate — fallback to previous tangent or world-up.
      t = i > 0 ? tangents[i - 1] : WORLD_UP;
    }
    tangents[i] = vnorm(t);
  }

  // Emit rings
  const ringFirstIdxs: number[] = new Array(ringCount);
  const frames: Frame[] = new Array(ringCount);
  for (let i = 0; i < ringCount; i++) {
    frames[i] = makeFrame(tangents[i]);
    const v = i / (ringCount - 1);
    ringFirstIdxs[i] = emitRing(
      positionsAt[i], radiiAt[i], frames[i],
      radialSegs, v, color,
      positions, normals, uvs, colors,
    );
  }

  // Quad strips between consecutive rings
  const colCount = radialSegs + 1;
  for (let i = 0; i < ringCount - 1; i++) {
    const a0 = ringFirstIdxs[i];
    const b0 = ringFirstIdxs[i + 1];
    for (let c = 0; c < radialSegs; c++) {
      const a = a0 + c;
      const b = a0 + c + 1;
      const cIdx = b0 + c;
      const d = b0 + c + 1;
      indices.push(a, cIdx, b, b, cIdx, d);
    }
    void colCount;
  }

  // Caps
  if (capStart) {
    emitCap(ringFirstIdxs[0], positionsAt[0], radiiAt[0], frames[0],
            radialSegs, +1, color, positions, normals, uvs, colors, indices);
  }
  if (capEnd) {
    const last = ringCount - 1;
    emitCap(ringFirstIdxs[last], positionsAt[last], radiiAt[last], frames[last],
            radialSegs, -1, color, positions, normals, uvs, colors, indices);
  }

  return { ringFirstIdxs, rings: ringCount };
}

// ── junction node detection (parent ring radius bump) ─────────────────

function buildJunctionNodeSet(graph: PlantSkeletonGraph): Set<string> {
  const set = new Set<string>();
  for (const [nodeId, node] of graph.nodes) {
    if (node.edgeIds.length > 1) set.add(nodeId);
  }
  return set;
}

// ── preprocess: clone bonePath per edge with junction swelling baked ──

function preprocessBonePathsWithSwelling(
  graph: PlantSkeletonGraph,
  swellingScale: number,
): Map<string, SkeletonBone[]> {
  const junctions = buildJunctionNodeSet(graph);
  // Map each node position to its node id (epsilon match for endpoint lookup).
  const nodePosKey = (p: V3): string =>
    `${p.x.toFixed(5)}_${p.y.toFixed(5)}_${p.z.toFixed(5)}`;
  const posToNodeId = new Map<string, string>();
  for (const [nodeId, node] of graph.nodes) {
    posToNodeId.set(nodePosKey(node.pos), nodeId);
  }

  const out = new Map<string, SkeletonBone[]>();
  for (const [edgeId, edge] of graph.edges) {
    const swollen: SkeletonBone[] = edge.bonePath.map((b) => ({
      p0: { ...b.p0 }, p1: { ...b.p1 }, r0: b.r0, r1: b.r1,
    }));
    // ★ Iter 39 Phase F1 — type별 render floor.
    const floor = RENDER_RADIUS_FLOOR_M_BY_TYPE[edge.type] ?? RENDER_RADIUS_FLOOR_M;
    for (const bone of swollen) {
      const nid0 = posToNodeId.get(nodePosKey(bone.p0));
      const nid1 = posToNodeId.get(nodePosKey(bone.p1));
      if (nid0 && junctions.has(nid0)) bone.r0 *= swellingScale;
      if (nid1 && junctions.has(nid1)) bone.r1 *= swellingScale;
      // Iter 18A SSOT #177 — render radius floor (biological values in
      // edge.bonePath untouched).
      bone.r0 = Math.max(bone.r0, floor);
      bone.r1 = Math.max(bone.r1, floor);
    }
    out.set(edgeId, swollen);
  }
  return out;
}

// ── locate parent edge's bonePath sample matching child startNode pos ──

interface ParentInfo {
  centerlinePoint: V3;
  radius: number;
  tangent: V3;
}

function computeParentInfo(
  parentBonePath: SkeletonBone[],
  parentSwollenBonePath: SkeletonBone[],
  childStartPos: V3,
): ParentInfo {
  // Iter 19 fix — project childStartPos onto each bone segment and pick the
  // segment with the closest projection. Old logic snapped to nearest bone
  // ENDPOINT; for mid-segment attachments on coarse bone paths (mature D99
  // stem) the snap introduced 1–4mm vertical offset between graph petiole
  // root and rendered root.
  let bestBoneIdx = 0;
  let bestT = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < parentBonePath.length; i++) {
    const b = parentBonePath[i];
    const dx = b.p1.x - b.p0.x;
    const dy = b.p1.y - b.p0.y;
    const dz = b.p1.z - b.p0.z;
    const segLenSq = dx * dx + dy * dy + dz * dz;
    if (segLenSq < EPSILON * EPSILON) continue;
    const cx = childStartPos.x - b.p0.x;
    const cy = childStartPos.y - b.p0.y;
    const cz = childStartPos.z - b.p0.z;
    const tRaw = (cx * dx + cy * dy + cz * dz) / segLenSq;
    const t = Math.max(0, Math.min(1, tRaw));
    const px = b.p0.x + dx * t;
    const py = b.p0.y + dy * t;
    const pz = b.p0.z + dz * t;
    const distSq = (px - childStartPos.x) ** 2 + (py - childStartPos.y) ** 2 + (pz - childStartPos.z) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestBoneIdx = i;
      bestT = t;
    }
  }
  const bone = parentBonePath[bestBoneIdx];
  const swollenBone = parentSwollenBonePath[bestBoneIdx];
  const centerlinePoint: V3 = {
    x: bone.p0.x + (bone.p1.x - bone.p0.x) * bestT,
    y: bone.p0.y + (bone.p1.y - bone.p0.y) * bestT,
    z: bone.p0.z + (bone.p1.z - bone.p0.z) * bestT,
  };
  const radius = swollenBone.r0 + (swollenBone.r1 - swollenBone.r0) * bestT;
  const tangent = vnorm(vsub(bone.p1, bone.p0));
  return { centerlinePoint, radius, tangent };
}

// ── average tangent over first N segments of child bonePath ────────────

function averageTangent(bonePath: SkeletonBone[], samples: number): V3 {
  const n = Math.min(samples, bonePath.length);
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < n; i++) {
    const b = bonePath[i];
    const t = vnorm(vsub(b.p1, b.p0));
    sx += t.x; sy += t.y; sz += t.z;
  }
  return vnorm({ x: sx, y: sy, z: sz });
}

// ── main builder ───────────────────────────────────────────────────────

export function buildStemFamilyTubeNetwork(
  scene: Scene,
  graph: PlantSkeletonGraph,
  opts: StemFamilyTubeOpts = {},
): PlantStemFamilyMesh {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const radialSegs = opts.radialSegments ?? 8;
  const rootRadiusScale = opts.rootRadiusScale ?? 1.15;
  const parentSwellingScale = opts.parentSwellingScale ?? 1.10;
  const embedDepthFrac: Record<SkeletonEdgeType, number> = {
    ...DEFAULT_EMBED_DEPTH_FRAC,
    ...opts.embedDepthFrac,
  };

  // Pass 0 — child index
  const childIndex = buildChildIndex(graph);

  // Pass 1 — bake junction swelling into per-edge cloned bonePath
  const bonePathByEdge = preprocessBonePathsWithSwelling(graph, parentSwellingScale);

  // Pass 2 — flat buffers
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const faceGroups: PlantFaceGroup[] = [];
  const vertexEdgeTagArr: number[] = [];
  const edgeIdByIdx: string[] = [];
  let branchCount = 0;

  // Iter 18A SSOT #176 — instrumentation accumulators.
  const edgesByType: Partial<Record<SkeletonEdgeType, number>> = {};
  const emittedByType: Partial<Record<SkeletonEdgeType, number>> = {};
  const bioRadiiByType: Partial<Record<SkeletonEdgeType, number[]>> = {};
  const renderRadiiByType: Partial<Record<SkeletonEdgeType, number[]>> = {};
  const floatingCandidateIds: string[] = [];
  // Iter 23 — metric semantic shift + threshold 1mm → 3mm.
  // Iter 18A 정의 (childGraphStart vs parentSurfacePoint): PlantBase bio
  // surface ↔ runtime swollen surface. parentSwellingScale 1.25 × bio_radius
  // offset 때문에 false positive 다수 (Iter 19 Phase D 확정: D45 raw=41 vs
  // 실제 disconnect=0). 신규 정의 (childGraphStart vs childStart): 시각적
  // disconnect와 직접 대응 = Q1 expectedToActual_mm.
  // 임계값 3mm = Iter 18C severity 정의 (yellow ≤ 3mm, red > 3mm)와 일관.
  const FLOATING_GAP_THRESHOLD_M = 0.003;
  // Iter 18C — per-edge actual mesh root (embed + scale 적용 후 childStart).
  const renderedRootByEdgeId: Record<string, V3> = {};
  const parentContextByEdgeId: Record<string, {
    center: V3; tangent: V3; radius: number;
  }> = {};
  for (const e of graph.edges.values()) {
    edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;
  }

  // Pass 3 — DFS from root edge
  const rootEdge = graph.edges.get(graph.rootEdgeId);
  if (rootEdge) {
    emitEdgeRecursive(rootEdge, null);
  }

  function emitEdgeRecursive(edge: SkeletonEdge, parentInfo: ParentInfo | null): void {
    // ★ Iter 39 Phase F2 — lateral-vein/sub-vein은 SDF tube 생성 안 함.
    //   사용자 botanical feedback: "lateral veins should not be rendered as SDF
    //   tubes. Instead, represent veins as surface-level features on the leaflet
    //   blade". F2.5에서 vertex color/normal로 vein 표현 예정.
    //   petiolule은 _짧은 connector_로 유지 — leaflet이 공중 카드처럼 보이지
    //   않도록. petiolule edge bonePath는 buildTomatoSkeletonGraph.ts에서 단축
    //   (F2 second part).
    //
    //   원래 Phase S (Iter 39 S1, commit 899261b)에서 모든 leaf hierarchy edges에
    //   SDF skin 추가했으나, 사용자 비판 (plan v1 review): "lateral-vein/sub-vein
    //   tube가 leaflet plane 안에 거미줄/사다리꼴 frame처럼 노출" → 부분 revert.
    // ★ Iter 39 Phase H4 — skinVisibleFraction 0이면 SDF tube emit 안 함, 자식 traversal만.
    //   사용자 #6: arc length 기준 truncate (bone count X). 0.0 = skip, 1.0 = full,
    //   0~1 = arc length 기준 부분 emit.
    const visibleFrac = edge.renderPolicy?.skinVisibleFraction ?? 1.0;
    if (visibleFrac <= 0.0) {
      // edge SDF skip, recurse into children (leaflet plane은 graph node에 부착).
      const childIds = childIndex.get(edge.id) ?? [];
      for (const cid of childIds) {
        const cedge = graph.edges.get(cid);
        if (cedge) emitEdgeRecursive(cedge, parentInfo);
      }
      return;
    }
    let swollenBones = bonePathByEdge.get(edge.id);
    if (!swollenBones || swollenBones.length === 0) return;
    // ★ Iter 39 Phase H4 — visibleFrac < 1.0 시 arc length 기준 truncate.
    if (visibleFrac < 1.0) {
      swollenBones = truncateBonePathByArcLength(swollenBones, visibleFrac);
      if (swollenBones.length === 0) {
        // 자식 traversal은 유지.
        const childIds = childIndex.get(edge.id) ?? [];
        for (const cid of childIds) {
          const cedge = graph.edges.get(cid);
          if (cedge) emitEdgeRecursive(cedge, parentInfo);
        }
        return;
      }
    }

    // Iter 18A: per-type biological radius (graph value, pre-embed).
    const bioR0 = edge.bonePath[0]?.r0 ?? 0;
    (bioRadiiByType[edge.type] ??= []).push(bioR0);

    let effectiveBonePath = swollenBones;
    let capStart: boolean;

    if (parentInfo) {
      // Embedded branch: prepend rootBone from parent-internal point to first skeleton point.
      const parentCenter = parentInfo.centerlinePoint;
      const parentRadius = parentInfo.radius;
      const parentTangent = parentInfo.tangent;
      // Iter 18A SSOT #178: max(fraction × parentR, absolute floor). Thin
      // parents get sufficient embed via the absolute floor so child mesh
      // visibly emerges from inside parent surface.
      // Iter 19 Case B fix: petiole clamped to [0.5mm, 2.0mm] with parentR*0.25.
      // Old policy (0.6 × parentR, floor 1.5mm) put child mesh 4.6mm inside
      // D99 stem skin, hiding emerge point — visual disconnect. Clamp limits
      // worst-case embed while preserving weld effect on small stems.
      let embedDepth: number;
      if (edge.type === 'petiole') {
        // Iter 21 — clamp [0.2, 1.0]mm. peduncle은 truss 구조라 동일 정책
        // 미적용 (Iter 23에서 시도 후 floating 1→2 역효과 → revert).
        embedDepth = Math.min(Math.max(parentRadius * 0.15, 0.0002), 0.0010);
      } else {
        const embedFrac = embedDepthFrac[edge.type] ?? 0.6;
        const embedFloor = DEFAULT_EMBED_DEPTH_FLOOR_M[edge.type] ?? 0;
        embedDepth = Math.max(parentRadius * embedFrac, embedFloor);
      }

      // radialDir derivation differs by edge type:
      // - petiole: use (graphRoot - parentCenter), so radialDir aligns with
      //   the PlantBase petiole azimuth regardless of how the petiole curves
      //   downstream. Iter 19 fix — averageTangent-based radialDir flipped
      //   ~157° for drooping D99 petioles.
      // - peduncle: Iter 23에서 같은 fix 확장 (Iter 19 Phase B 측정: D45 peduncle
      //   worst 9.78mm / D99 12.59mm 동일 Case B 패턴). Iter 23 floating
      //   metric 재정의로 peduncle disconnect가 acceptance AC1을 실제로
      //   flag하므로 함께 처리.
      // - rachis/pedicel: averageTangent 유지 (Iter 19 Phase B clean ≤ 1.25mm).
      const childGraphStart = edge.bonePath[0].p0;
      const sourceDir = (edge.type === 'petiole' || edge.type === 'peduncle')
        ? vsub(childGraphStart, parentCenter)
        : averageTangent(edge.bonePath, Math.min(3, edge.bonePath.length));

      // radialDir: sourceDir projected onto plane ⊥ parentTangent.
      // Removes parent-axis component so child emerges purely radially.
      const projAlong = vdot(sourceDir, parentTangent);
      let radialRaw = vsub(sourceDir, vscale(parentTangent, projAlong));
      let radialDir: V3;
      if (vlen(radialRaw) < EPSILON) {
        // sourceDir nearly parallel to parentTangent — fallback to a perpendicular.
        // Use parent frame's normal direction.
        const parentFrame = makeFrame(parentTangent);
        radialDir = parentFrame.normal;
      } else {
        radialDir = vnorm(radialRaw);
      }

      const parentSurfacePoint = vadd(parentCenter, vscale(radialDir, parentRadius));
      const childStart = vsub(parentSurfacePoint, vscale(radialDir, embedDepth));
      // Iter 18C — expose the actual mesh root for the docking debug overlay.
      renderedRootByEdgeId[edge.id] = { x: childStart.x, y: childStart.y, z: childStart.z };
      // Iter 20 — expose parent stem context for occlusion + firstVisible calc.
      parentContextByEdgeId[edge.id] = {
        center: { x: parentCenter.x, y: parentCenter.y, z: parentCenter.z },
        tangent: { x: parentTangent.x, y: parentTangent.y, z: parentTangent.z },
        radius: parentRadius,
      };

      const origFirst = swollenBones[0];
      // Iter 18A SSOT #177 — rootBone radii also subject to render floor.
      // (swollenBones already pre-floored in preprocess; rootBone is post-hoc.)
      // ★ Iter 39 Phase F1 — type별 floor 동기.
      const rootFloor = RENDER_RADIUS_FLOOR_M_BY_TYPE[edge.type] ?? RENDER_RADIUS_FLOOR_M;
      const rootBone: SkeletonBone = {
        p0: childStart,
        p1: origFirst.p0,
        r0: Math.max(origFirst.r0 * rootRadiusScale, rootFloor),
        r1: Math.max(origFirst.r0 * 1.05, rootFloor),
      };
      effectiveBonePath = [rootBone, ...swollenBones];
      capStart = false;
      branchCount++;

      // Iter 23 — 'floating' = rendered mesh root가 PlantBase 정한
      // graph attach point에서 떨어진 정도 (= Q1 expectedToActual). 시각적
      // disconnect 직접 indicator.
      const renderedRootGap = vlen(vsub(childGraphStart, childStart));
      if (renderedRootGap > FLOATING_GAP_THRESHOLD_M) {
        floatingCandidateIds.push(edge.id);
      }
    } else {
      capStart = true;  // root (mainStem) — base sits on ground
    }

    // Iter 18A: per-type effective render radius (after embed, swelling, scale).
    const renderR0 = effectiveBonePath[0]?.r0 ?? 0;
    (renderRadiiByType[edge.type] ??= []).push(renderR0);
    emittedByType[edge.type] = (emittedByType[edge.type] ?? 0) + 1;

    // capEnd: children + attached organ check
    const childIds = childIndex.get(edge.id) ?? [];
    const hasChild = childIds.length > 0;
    const hasAttachedOrgan = (edge.attachedOrganIds?.length ?? 0) > 0;
    const capEnd = !hasChild && !hasAttachedOrgan;

    // Emit tube
    const color = COLOR_BY_EDGE_TYPE[edge.type];
    const faceStart = indices.length;     // index buffer offset (NOT triangle count)
    const vertexStart = positions.length / 3;

    emitTube(
      effectiveBonePath, radialSegs, capStart, capEnd, color,
      positions, normals, uvs, colors, indices,
    );

    const faceCount = indices.length - faceStart;
    const vertexCount = positions.length / 3 - vertexStart;

    const edgeIdx = edgeIdByIdx.length;
    edgeIdByIdx.push(edge.id);
    for (let i = 0; i < vertexCount; i++) {
      vertexEdgeTagArr.push(edgeIdx);
    }
    faceGroups.push({
      indexStart: faceStart,
      indexCount: faceCount,
      edgeId: edge.id,
      edgeType: edge.type,
    });

    // Recurse — reuse childIds
    for (const childEdgeId of childIds) {
      const childEdge = graph.edges.get(childEdgeId);
      if (!childEdge) continue;
      const childOrigBonePath = childEdge.bonePath;
      if (childOrigBonePath.length === 0) continue;
      // childStartPos = first point of child's first bone, prior to embedding.
      const childStartPos = childOrigBonePath[0].p0;
      const parentBonePath = edge.bonePath;
      const parentSwollenBonePath = swollenBones;
      const childParentInfo = computeParentInfo(
        parentBonePath, parentSwollenBonePath, childStartPos,
      );
      emitEdgeRecursive(childEdge, childParentInfo);
    }
  }

  // Build Mesh
  const mesh = new Mesh('skinplant_stem_family', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.colors = colors;
  vd.applyToMesh(mesh);

  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Iter 18A: finalize per-type radius stats.
  const biologicalRadiusByType: Partial<Record<SkeletonEdgeType, RadiusStat>> = {};
  for (const [type, vals] of Object.entries(bioRadiiByType) as Array<[SkeletonEdgeType, number[]]>) {
    biologicalRadiusByType[type] = radiusStat(vals);
  }
  const renderRadiusByType: Partial<Record<SkeletonEdgeType, RadiusStat>> = {};
  for (const [type, vals] of Object.entries(renderRadiiByType) as Array<[SkeletonEdgeType, number[]]>) {
    renderRadiusByType[type] = radiusStat(vals);
  }

  return {
    mesh,
    faceGroups,
    vertexEdgeTag: new Uint16Array(vertexEdgeTagArr),
    edgeIdByIdx,
    stats: {
      edgeCount: graph.edges.size,
      branchCount,
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
      buildMs: t1 - t0,
      edgesByType,
      emittedByType,
      biologicalRadiusByType,
      renderRadiusByType,
      floatingCandidateCount: floatingCandidateIds.length,
      floatingCandidateIds,
      renderedRootByEdgeId,
      parentContextByEdgeId,
    },
  };
}

function radiusStat(values: number[]): RadiusStat {
  if (values.length === 0) return { min: 0, median: 0, max: 0, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return { min: sorted[0], median, max: sorted[sorted.length - 1], count: sorted.length };
}
