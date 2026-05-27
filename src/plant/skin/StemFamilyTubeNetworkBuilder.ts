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
     *  along the radial direction — surfaces "floating" relative to parent. */
    floatingCandidateCount: number;
    floatingCandidateIds: string[];
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

// ── colors per edge type (vertex color baked) ──────────────────────────

const COLOR_BY_EDGE_TYPE: Record<SkeletonEdgeType, [number, number, number]> = {
  mainStem:  [0.40, 0.50, 0.25],
  sideShoot: [0.40, 0.50, 0.25],
  petiole:   [0.23, 0.54, 0.19],
  peduncle:  [0.29, 0.54, 0.19],
  rachis:    [0.35, 0.60, 0.25],
  pedicel:   [0.35, 0.60, 0.25],
};

// ── default embed depth per edge type (fraction of parent radius) ──────

const DEFAULT_EMBED_DEPTH_FRAC: Record<SkeletonEdgeType, number> = {
  mainStem:  0.0,   // root — no parent
  sideShoot: 0.8,
  petiole:   0.6,
  peduncle:  0.6,
  rachis:    0.5,
  pedicel:   0.5,
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
    for (const bone of swollen) {
      const nid0 = posToNodeId.get(nodePosKey(bone.p0));
      const nid1 = posToNodeId.get(nodePosKey(bone.p1));
      if (nid0 && junctions.has(nid0)) bone.r0 *= swellingScale;
      if (nid1 && junctions.has(nid1)) bone.r1 *= swellingScale;
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
  // Find the bone whose endpoint best matches childStartPos.
  // Prefer endpoint (p0 or p1) — exact match expected.
  let bestBoneIdx = 0;
  let bestEndpoint: 0 | 1 = 1;
  let bestDistSq = Infinity;
  for (let i = 0; i < parentBonePath.length; i++) {
    const b = parentBonePath[i];
    const d0 = (b.p0.x - childStartPos.x) ** 2 + (b.p0.y - childStartPos.y) ** 2 + (b.p0.z - childStartPos.z) ** 2;
    const d1 = (b.p1.x - childStartPos.x) ** 2 + (b.p1.y - childStartPos.y) ** 2 + (b.p1.z - childStartPos.z) ** 2;
    if (d0 < bestDistSq) { bestDistSq = d0; bestBoneIdx = i; bestEndpoint = 0; }
    if (d1 < bestDistSq) { bestDistSq = d1; bestBoneIdx = i; bestEndpoint = 1; }
  }
  const bone = parentBonePath[bestBoneIdx];
  const swollenBone = parentSwollenBonePath[bestBoneIdx];
  const centerlinePoint = bestEndpoint === 0 ? bone.p0 : bone.p1;
  const radius = bestEndpoint === 0 ? swollenBone.r0 : swollenBone.r1;
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
  const FLOATING_GAP_THRESHOLD_M = 0.001; // 1mm
  for (const e of graph.edges.values()) {
    edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;
  }

  // Pass 3 — DFS from root edge
  const rootEdge = graph.edges.get(graph.rootEdgeId);
  if (rootEdge) {
    emitEdgeRecursive(rootEdge, null);
  }

  function emitEdgeRecursive(edge: SkeletonEdge, parentInfo: ParentInfo | null): void {
    const swollenBones = bonePathByEdge.get(edge.id);
    if (!swollenBones || swollenBones.length === 0) return;

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
      const embedFrac = embedDepthFrac[edge.type] ?? 0.6;
      const embedFloor = DEFAULT_EMBED_DEPTH_FLOOR_M[edge.type] ?? 0;
      const embedDepth = Math.max(parentRadius * embedFrac, embedFloor);

      const childDir = averageTangent(edge.bonePath, Math.min(3, edge.bonePath.length));

      // radialDir: childDir projected onto plane ⊥ parentTangent.
      // Removes parent-axis component so child emerges purely radially.
      const projAlong = vdot(childDir, parentTangent);
      let radialRaw = vsub(childDir, vscale(parentTangent, projAlong));
      let radialDir: V3;
      if (vlen(radialRaw) < EPSILON) {
        // childDir nearly parallel to parentTangent — fallback to a perpendicular.
        // Use parent frame's normal direction.
        const parentFrame = makeFrame(parentTangent);
        radialDir = parentFrame.normal;
      } else {
        radialDir = vnorm(radialRaw);
      }

      const parentSurfacePoint = vadd(parentCenter, vscale(radialDir, parentRadius));
      const childStart = vsub(parentSurfacePoint, vscale(radialDir, embedDepth));

      const origFirst = swollenBones[0];
      const rootBone: SkeletonBone = {
        p0: childStart,
        p1: origFirst.p0,
        r0: origFirst.r0 * rootRadiusScale,
        r1: origFirst.r0 * 1.05,
      };
      effectiveBonePath = [rootBone, ...swollenBones];
      capStart = false;
      branchCount++;

      // Iter 18A: floating candidate detection — radial gap between graph
      // child start (pre-embed) and parent surface.
      const childGraphStart = edge.bonePath[0].p0;
      const radialGap = vlen(vsub(childGraphStart, parentSurfacePoint));
      if (radialGap > FLOATING_GAP_THRESHOLD_M) {
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
