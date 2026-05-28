// Iter 20 PR 2 — Petiole-stem junction data model + firstVisiblePoint
// computation. MEASUREMENT ONLY — no geometry modification. Consumes
// the additive `parentContextByEdgeId` stats exported by
// StemFamilyTubeNetworkBuilder in PR 2.

import type { PlantSkeletonGraph } from '../../plant/skeleton/PlantSkeletonGraph';

type V3 = { x: number; y: number; z: number };

export interface PetioleJunctionPair {
  pairId: string;                       // 'petiole:axis0:n14'
  edgeId: string;                       // 'e:petiole:axis0:n14'
  shortLabel: string;                   // 'leaf#14'
  // 4 core coords (focus='stem-junction')
  stemCenterNode: V3;
  expectedStemSurfaceDock: V3;
  actualRenderedRoot: V3 | null;
  firstVisiblePoint: V3 | null;
  // deltas (mm)
  expectedToActual_mm: number;          // Q1
  actualOcclusionDepth_mm: number;      // Q2 — positive = buried under stem skin
  emergeGap_mm: number;                 // Q3 — firstVisiblePoint distance from expected
  // optional (focus='all')
  petioleTip?: V3;
  leafBladeRoot?: V3 | null;
  leafBladeRootSource?: 'blade-anchor' | 'mesh-origin';
  tipToLeaf_mm?: number;
  // leaf mesh의 실제 visual 시작점 (boundingBox.minimumWorld) — 페어 검증용.
  actualLeafMeshStart?: V3 | null;
  leafMeshStartDelta_mm?: number;   // leafBladeRoot ↔ actualLeafMeshStart 거리
}

export interface BuildPairsInput {
  graph: PlantSkeletonGraph;
  renderedRootByEdgeId: Record<string, V3>;
  parentContextByEdgeId: Record<string, { center: V3; tangent: V3; radius: number }>;
  /** Optional: leaf mesh lookup keyed by 'a{axIdx}_n{nodeIdx}'.
   *  Only consumed when focus='all'. 좌표는 모두 plant-local (graph와 동일
   *  좌표계). bboxMinLocal/bboxMaxLocal은 lushGroup.invertMatrix 적용된 값. */
  leafMeshByKey?: Map<string, {
    position: V3;
    bboxMinLocal?: V3;
    bboxMaxLocal?: V3;
  }>;
  /** Sample density along the petiole bonePath for firstVisible search. */
  bonePathSamples?: number;
  /** Tolerance multiplier on swollenStemRadius — a sample is "outside" when
   *  perp distance > swollenStemRadius × tolerance. */
  outsideTolerance?: number;
}

// ── helpers ─────────────────────────────────────────────────────────────

function dist(a: V3, b: V3): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

/** Distance from point p to the infinite line through `center` with direction
 *  `tangent` (assumed unit-length). */
function perpDistance(p: V3, center: V3, tangent: V3): number {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const dz = p.z - center.z;
  const along = dx * tangent.x + dy * tangent.y + dz * tangent.z;
  const px = dx - tangent.x * along;
  const py = dy - tangent.y * along;
  const pz = dz - tangent.z * along;
  return Math.sqrt(px * px + py * py + pz * pz);
}

/** Sample a point at arc-parameter t (0..1) along the petiole bonePath
 *  (treated as a polyline of bone segments). */
function sampleBonePathAt(bonePath: { p0: V3; p1: V3 }[], t: number): V3 {
  if (bonePath.length === 0) return { x: 0, y: 0, z: 0 };
  if (bonePath.length === 1) {
    const b = bonePath[0];
    return {
      x: b.p0.x + (b.p1.x - b.p0.x) * t,
      y: b.p0.y + (b.p1.y - b.p0.y) * t,
      z: b.p0.z + (b.p1.z - b.p0.z) * t,
    };
  }
  // Multi-segment: clamp t into [0,1], select segment, interpolate within.
  const tClamped = Math.max(0, Math.min(1, t));
  const totalSeg = bonePath.length;
  const segPos = tClamped * totalSeg;
  let segIdx = Math.min(totalSeg - 1, Math.floor(segPos));
  const localT = segPos - segIdx;
  const b = bonePath[segIdx];
  return {
    x: b.p0.x + (b.p1.x - b.p0.x) * localT,
    y: b.p0.y + (b.p1.y - b.p0.y) * localT,
    z: b.p0.z + (b.p1.z - b.p0.z) * localT,
  };
}

/** Find the first sample along the petiole bonePath that exits the parent
 *  stem's swollen surface. Returns the sample point or null if none exits. */
function findFirstVisiblePoint(
  bonePath: { p0: V3; p1: V3 }[],
  parentCenter: V3,
  parentTangent: V3,
  swollenRadius: number,
  samples: number,
  tolerance: number,
): V3 | null {
  const threshold = swollenRadius * tolerance;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = sampleBonePathAt(bonePath, t);
    if (perpDistance(p, parentCenter, parentTangent) > threshold) {
      return p;
    }
  }
  return null;
}

// ── main builder ────────────────────────────────────────────────────────

const PETIOLE_EDGE_REGEX = /^e:petiole:axis(\d+):n(\d+)$/;

export function buildPetioleJunctionPairs(input: BuildPairsInput): PetioleJunctionPair[] {
  const samples = input.bonePathSamples ?? 20;
  const tolerance = input.outsideTolerance ?? 1.0;
  const out: PetioleJunctionPair[] = [];

  for (const [edgeId, edge] of input.graph.edges) {
    if (edge.type !== 'petiole') continue;
    const match = PETIOLE_EDGE_REGEX.exec(edgeId);
    if (!match) continue;
    const axIdx = match[1];
    const nIdx = parseInt(match[2], 10);
    const key = `a${axIdx}_n${nIdx}`;

    const startNode = input.graph.nodes.get(edge.startNodeId);
    const endNode = input.graph.nodes.get(edge.endNodeId);
    if (!startNode || !endNode || edge.bonePath.length === 0) continue;

    const stemCenterNode = startNode.pos;
    const expectedStemSurfaceDock = edge.bonePath[0].p0;
    const actualRenderedRoot = input.renderedRootByEdgeId[edgeId] ?? null;
    const parentCtx = input.parentContextByEdgeId[edgeId];

    let firstVisiblePoint: V3 | null = null;
    let actualOcclusionDepth_mm = 0;
    let emergeGap_mm = 0;

    if (parentCtx) {
      firstVisiblePoint = findFirstVisiblePoint(
        edge.bonePath,
        parentCtx.center,
        parentCtx.tangent,
        parentCtx.radius,
        samples,
        tolerance,
      );
      if (firstVisiblePoint) {
        emergeGap_mm = dist(firstVisiblePoint, expectedStemSurfaceDock) * 1000;
      } else {
        // Full occlusion — set emergeGap to a flag value (whole petiole inside).
        emergeGap_mm = Number.POSITIVE_INFINITY;
      }
      if (actualRenderedRoot) {
        // Occlusion depth = (swollen radius) - (perp distance of actual from stem axis).
        // Positive = inside swollen stem skin.
        const perp = perpDistance(actualRenderedRoot, parentCtx.center, parentCtx.tangent);
        actualOcclusionDepth_mm = (parentCtx.radius - perp) * 1000;
      }
    }

    const expectedToActual_mm = actualRenderedRoot
      ? dist(expectedStemSurfaceDock, actualRenderedRoot) * 1000
      : 0;

    const pair: PetioleJunctionPair = {
      pairId: `petiole:axis${axIdx}:n${nIdx}`,
      edgeId,
      shortLabel: `leaf#${nIdx}`,
      stemCenterNode,
      expectedStemSurfaceDock,
      actualRenderedRoot,
      firstVisiblePoint,
      expectedToActual_mm,
      actualOcclusionDepth_mm,
      emergeGap_mm,
    };

    // focus='all' optional fields.
    pair.petioleTip = endNode.pos;
    const leafMesh = input.leafMeshByKey?.get(key);
    if (leafMesh) {
      pair.leafBladeRoot = leafMesh.position;
      pair.leafBladeRootSource = 'mesh-origin'; // Iter 21 후보: blade anchor expose
      pair.tipToLeaf_mm = dist(endNode.pos, leafMesh.position) * 1000;
      // actualLeafMeshStart = leaf mesh boundingBox minimumWorld → plant-local로
      // 변환된 값 (SkinMeshPlant에서 lushGroup invertMatrix 적용). 페어 검증:
      // leafBladeRoot (graph 의도)와 거리 = 진짜 disconnect 크기.
      if (leafMesh.bboxMinLocal) {
        pair.actualLeafMeshStart = leafMesh.bboxMinLocal;
        pair.leafMeshStartDelta_mm = dist(leafMesh.position, leafMesh.bboxMinLocal) * 1000;
      }
    }

    out.push(pair);
  }

  return out;
}

// ── severity helpers ────────────────────────────────────────────────────

export function classifyQ1(expectedToActual_mm: number): 'OK' | 'WARN' | 'FAIL' {
  if (expectedToActual_mm <= 1) return 'OK';
  if (expectedToActual_mm <= 3) return 'WARN';
  return 'FAIL';
}

export function classifyQ2(occlusionDepth_mm: number): 'OK' | 'WARN' | 'FAIL' {
  // Positive = buried. Acceptable up to embed clamp (2mm).
  if (occlusionDepth_mm <= 1) return 'OK';
  if (occlusionDepth_mm <= 2.5) return 'WARN';
  return 'FAIL';
}

export function classifyQ3(emergeGap_mm: number): 'OK' | 'WARN' | 'FAIL' {
  if (!Number.isFinite(emergeGap_mm)) return 'FAIL'; // full occlusion
  if (emergeGap_mm <= 1) return 'OK';
  if (emergeGap_mm <= 2) return 'WARN';
  return 'FAIL';
}
