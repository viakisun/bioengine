// geometryMetrics — V10 harness (Leaf Module v0.1).
//
// Counts degenerate triangles, normal consistency, UV continuity.
// Known exceptions: allowedDegenerateIndexRanges per LeafletFaceGroup
// (base_collapse / tip_collapse) are excluded from the degenerate count.

import type { LeafBladeMesh } from '../buildLeafBladeMesh';

export interface GeometryReport {
  triangleCount: number;
  degenerateTriangleCount: number;
  degenerateTriangleRatio: number;
  allowedDegenerateCount: { base_collapse: number; tip_collapse: number };

  /** Mean angular deviation between adjacent face normals (degrees). */
  meanNormalDeviationDeg: number;

  /** UV monotonicity per leaflet: fraction of leaflets with strictly monotonic
   *  v along midrib direction. v0.1 always emits monotonic UVs, so should be 1. */
  uvMonotonicLeafletRatio: number;

  status: 'pass' | 'fail' | 'no_data';
}

const DEGEN_AREA_EPS = 1e-12; // m² — face-normal length below this = degenerate
const NORMAL_DEVIATION_FAIL_DEG = 30;
const DEGEN_RATIO_FAIL = 0.01; // 1%

export function computeGeometryReport(blade: LeafBladeMesh): GeometryReport {
  const mesh = blade.mesh;
  const positions = (mesh.getVerticesData('position') as Float32Array | number[] | null);
  const indices = (mesh.getIndices() as Int32Array | Uint32Array | number[] | null);
  const normals = (mesh.getVerticesData('normal') as Float32Array | number[] | null);
  const uvs = (mesh.getVerticesData('uv') as Float32Array | number[] | null);

  if (!positions || !indices || indices.length === 0) {
    return {
      triangleCount: 0,
      degenerateTriangleCount: 0,
      degenerateTriangleRatio: 0,
      allowedDegenerateCount: { base_collapse: 0, tip_collapse: 0 },
      meanNormalDeviationDeg: 0,
      uvMonotonicLeafletRatio: 0,
      status: 'no_data',
    };
  }

  // ── Build the allowed-degenerate mask by triangle index ───────────
  // mask[triIdx] = 'base_collapse' | 'tip_collapse' | undefined
  const triCount = indices.length / 3;
  const allowedMask: Array<undefined | 'base_collapse' | 'tip_collapse'> = new Array(triCount);
  let baseAllowedCount = 0;
  let tipAllowedCount = 0;
  for (const group of blade.leafletGroups) {
    const ranges = group.allowedDegenerateIndexRanges ?? [];
    for (const r of ranges) {
      const triStart = Math.floor(r.indexStart / 3);
      const triEnd = Math.floor((r.indexStart + r.indexCount) / 3);
      for (let t = triStart; t < triEnd; t++) {
        allowedMask[t] = r.reason;
        if (r.reason === 'base_collapse') baseAllowedCount++;
        else tipAllowedCount++;
      }
    }
  }

  // ── Degenerate triangle count (excluding allowed ranges) ──────────
  let degenerateOutsideAllowed = 0;
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3 + 0];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    const area = triangleArea(positions as ArrayLike<number>, i0, i1, i2);
    if (area < DEGEN_AREA_EPS) {
      if (allowedMask[t] === undefined) degenerateOutsideAllowed++;
    }
  }

  // ── Adjacent face normal deviation (sampled) ──────────────────────
  // For each leaflet group, average angle between consecutive triangle face
  // normals along the strip. Skips allowed degenerates (normal undefined).
  let normalDevSumDeg = 0;
  let normalDevSamples = 0;
  for (const group of blade.leafletGroups) {
    const triStart = Math.floor(group.indexStart / 3);
    const triEnd = Math.floor((group.indexStart + group.indexCount) / 3);
    let prevNx = 0, prevNy = 0, prevNz = 0;
    let havePrev = false;
    for (let t = triStart; t < triEnd; t++) {
      if (allowedMask[t]) { havePrev = false; continue; }
      const n = triangleNormal(positions as ArrayLike<number>, indices, t);
      if (n === null) { havePrev = false; continue; }
      if (havePrev) {
        const dot = Math.max(-1, Math.min(1, prevNx * n[0] + prevNy * n[1] + prevNz * n[2]));
        normalDevSumDeg += Math.acos(dot) * (180 / Math.PI);
        normalDevSamples++;
      }
      prevNx = n[0]; prevNy = n[1]; prevNz = n[2];
      havePrev = true;
    }
  }
  const meanNormalDeviationDeg = normalDevSamples > 0 ? normalDevSumDeg / normalDevSamples : 0;

  // ── UV monotonicity per leaflet ───────────────────────────────────
  // Inspect each leaflet's vertex range. v should be monotonically increasing
  // along the midrib direction (rows). Our builder emits v=row/lengthSegments
  // so this is always true unless triangulation gets reorderered.
  let monotonicLeaflets = 0;
  const tagArr = blade.vertexLeafletTag;
  const leafletCount = blade.leafletIdByIdx.length;
  if (uvs && tagArr.length === (positions as ArrayLike<number>).length / 3) {
    // Per-leaflet collect v values in insertion order; check monotonicity
    // by counting strict-decreasing pairs.
    for (let li = 0; li < leafletCount; li++) {
      let lastV = -Infinity;
      let decreases = 0;
      let inspected = 0;
      for (let vi = 0; vi < tagArr.length; vi++) {
        if (tagArr[vi] !== li) continue;
        const v = (uvs as ArrayLike<number>)[vi * 2 + 1];
        if (inspected > 0 && v < lastV - 1e-6) decreases++;
        lastV = v;
        inspected++;
      }
      if (inspected > 0 && decreases === 0) monotonicLeaflets++;
    }
  }
  const uvMonotonicLeafletRatio = leafletCount > 0 ? monotonicLeaflets / leafletCount : 1;

  // ── Status verdict ────────────────────────────────────────────────
  const validTriCount = triCount - baseAllowedCount - tipAllowedCount;
  const degenRatio = validTriCount > 0 ? degenerateOutsideAllowed / validTriCount : 0;
  const passDegen = degenRatio <= DEGEN_RATIO_FAIL;
  const passNormal = meanNormalDeviationDeg <= NORMAL_DEVIATION_FAIL_DEG;
  const passUV = uvMonotonicLeafletRatio >= 1;
  const status: GeometryReport['status'] = (passDegen && passNormal && passUV) ? 'pass' : 'fail';

  void normals; // (reserved for future per-vertex normal checks)

  return {
    triangleCount: triCount,
    degenerateTriangleCount: degenerateOutsideAllowed,
    degenerateTriangleRatio: degenRatio,
    allowedDegenerateCount: { base_collapse: baseAllowedCount, tip_collapse: tipAllowedCount },
    meanNormalDeviationDeg,
    uvMonotonicLeafletRatio,
    status,
  };
}

export function summarizeGeometryReport(r: GeometryReport): string {
  return (
    `[V10] tris=${r.triangleCount} ` +
    `degen=${r.degenerateTriangleCount}(${(r.degenerateTriangleRatio * 100).toFixed(2)}%) ` +
    `allowedDegen(base/tip)=${r.allowedDegenerateCount.base_collapse}/${r.allowedDegenerateCount.tip_collapse} ` +
    `normalDev̄=${r.meanNormalDeviationDeg.toFixed(1)}° ` +
    `uvMono=${(r.uvMonotonicLeafletRatio * 100).toFixed(0)}% ` +
    `→ ${r.status.toUpperCase()}`
  );
}

// ── Triangle helpers ──────────────────────────────────────────────────

function triangleArea(positions: ArrayLike<number>, i0: number, i1: number, i2: number): number {
  const ax = positions[i0 * 3 + 0], ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2];
  const bx = positions[i1 * 3 + 0], by = positions[i1 * 3 + 1], bz = positions[i1 * 3 + 2];
  const cx = positions[i2 * 3 + 0], cy = positions[i2 * 3 + 1], cz = positions[i2 * 3 + 2];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return 0.5 * Math.hypot(nx, ny, nz);
}

function triangleNormal(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  triIdx: number,
): [number, number, number] | null {
  const i0 = indices[triIdx * 3 + 0];
  const i1 = indices[triIdx * 3 + 1];
  const i2 = indices[triIdx * 3 + 2];
  const ax = positions[i0 * 3 + 0], ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2];
  const bx = positions[i1 * 3 + 0], by = positions[i1 * 3 + 1], bz = positions[i1 * 3 + 2];
  const cx = positions[i2 * 3 + 0], cy = positions[i2 * 3 + 1], cz = positions[i2 * 3 + 2];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-9) return null;
  return [nx / len, ny / len, nz / len];
}
