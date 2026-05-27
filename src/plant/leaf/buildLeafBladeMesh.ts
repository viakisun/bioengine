// buildLeafBladeMesh — Pass 3 of Leaf Module v0.1.
//
// Procedural blade surface for every leaflet in a LeafOrganGraph, packed into
// a SINGLE Babylon Mesh / single VertexData buffer (no per-leaflet meshes).
// Mirrors stem-family's single-buffer principle but is shading-isolated:
// leaves are thin, double-sided, vertex-colored.
//
// Geometry kernel:
//   - Parallel-transport frame along each leaflet's midrib (twist-free).
//   - Beta-evaluated half-width profile (peakT + sharpness) — base/tip → 0.
//   - widthSegments=4 → 5 vertices per cross-section row.
//   - Cup (transverse) + droop (longitudinal) active in v0.1.
//   - Twist + edgeCurl stored in shapeProfile but not yet applied (v2).
//
// Validation hooks:
//   - LeafletFaceGroup marks every leaflet's blade_surface index range.
//   - allowedDegenerateIndexRanges flags the first/last row strips where
//     base_collapse / tip_collapse produce intentional degenerate triangles.

import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';

import type { V3 } from '../sdf/CapsuleSDF';
import type {
  CompoundLeafOrgan,
  LeafBladeMeshStats,
  LeafOrganGraph,
  LeafletFaceGroup,
  LeafletMorphologyNode,
} from './LeafOrganGraph';
import {
  samplePath,
  samplePathTangent,
  vadd,
  vcross,
  vdot,
  vlen,
  vnorm,
  vscale,
  vsub,
} from './leafGeometryHelpers';
import type { LeafBone } from './LeafOrganGraph';
import { evaluateWidthProfileT } from './widthProfile';

export interface LeafBladeMesh {
  mesh: Mesh;
  leafletGroups: LeafletFaceGroup[];
  vertexLeafletTag: Uint16Array;
  leafletIdByIdx: string[];
  stats: LeafBladeMeshStats;
}

export type VertexColorAt = (
  compound: CompoundLeafOrgan,
  leaflet: LeafletMorphologyNode,
  t: number,
) => [number, number, number, number];

export interface BuildLeafBladeMeshOptions {
  /** Cross-section vertices per row = widthSegments + 1. Default 4 → 5 verts. */
  widthSegments?: number;
  /** Rows along midrib (lengthSegments+1 actual rows). Default 14. */
  lengthSegments?: number;
  /** Optional callback per (compound, leaflet, t) returning RGBA in [0,1]^4.
   *  If absent, uniform leaf-green is used. */
  vertexColorAt?: VertexColorAt;
  /** Render rachis + petiolule guides as thin tubes (default true).
   *  Without this, lateral leaflets appear to float without a visible axis. */
  renderRachis?: boolean;
  /** Radial sides for rachis tube. Default 5 (pentagon — cheap, smooth enough). */
  rachisRadialSegments?: number;
}

const DEFAULT_WIDTH_SEGMENTS = 4;
const DEFAULT_LENGTH_SEGMENTS = 14;
const DEFAULT_LEAF_COLOR: [number, number, number, number] = [0.28, 0.55, 0.22, 1.0];

export function buildLeafBladeMesh(
  scene: Scene,
  graph: LeafOrganGraph,
  opts: BuildLeafBladeMeshOptions = {},
): LeafBladeMesh {
  const widthSegments = Math.max(2, opts.widthSegments ?? DEFAULT_WIDTH_SEGMENTS);
  const lengthSegments = Math.max(4, opts.lengthSegments ?? DEFAULT_LENGTH_SEGMENTS);
  const colorOf = opts.vertexColorAt;
  const renderRachis = opts.renderRachis ?? true;
  const rachisRadialSegments = Math.max(3, opts.rachisRadialSegments ?? 5);
  const rachisColor: [number, number, number, number] = [0.30, 0.42, 0.18, 1.0];

  const t0 = nowMs();

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const leafletGroups: LeafletFaceGroup[] = [];
  const vertexLeafletTagArr: number[] = [];
  const leafletIdByIdx: string[] = [];

  let leafletCountTotal = 0;
  let compoundLeafCount = 0;

  for (const compound of graph.compoundLeaves) {
    compoundLeafCount++;

    // Rachis tube — visible connector between petiole tip and lateral
    // leaflets. Without this, lateral leaflets appear to float off
    // an invisible axis. Cheap pentagon-section tube; faceGroup tagged
    // with compoundLeafId only (no leafletId — it's compound-level).
    if (renderRachis && compound.rachisGuide.guidePath.length > 0) {
      const rachisIndexStart = indices.length;
      const rachisVertexStart = positions.length / 3;
      emitTube(
        compound.rachisGuide.guidePath,
        rachisRadialSegments,
        rachisColor,
        positions, normals, uvs, colors, indices,
        rachisVertexStart,
      );
      const rachisIndexCount = indices.length - rachisIndexStart;
      if (rachisIndexCount > 0) {
        // Track but don't push into leafletGroups (it's not a blade).
        // We DO tag vertices so segmentation can find "the leaf object".
        // Reserved leafletIdx = compound-level id, leafletId = rachis sentinel.
        const rachisIdx = leafletIdByIdx.length;
        leafletIdByIdx.push(`${compound.id}:rachis`);
        const vc = positions.length / 3 - rachisVertexStart;
        for (let i = 0; i < vc; i++) vertexLeafletTagArr.push(rachisIdx);
      }
    }

    for (const leaflet of compound.leaflets) {
      const indexStart = indices.length;
      const vertexStart = positions.length / 3;
      const leafletIdx = leafletIdByIdx.length;

      const colorFn: VertexColorAt = colorOf ?? (() => DEFAULT_LEAF_COLOR);
      const emit = emitLeafletBlade(
        compound,
        leaflet,
        widthSegments,
        lengthSegments,
        positions,
        normals,
        uvs,
        colors,
        indices,
        vertexStart,
        colorFn,
      );

      // Skip empty (e.g. zero-length) leaflets without polluting groups.
      const indexCount = indices.length - indexStart;
      if (indexCount === 0) continue;

      leafletIdByIdx.push(leaflet.id);
      leafletCountTotal++;
      const vertexCount = positions.length / 3 - vertexStart;
      for (let i = 0; i < vertexCount; i++) vertexLeafletTagArr.push(leafletIdx);

      leafletGroups.push({
        indexStart,
        indexCount,
        leafletId: leaflet.id,
        compoundLeafId: compound.id,
        side: leaflet.side,
        role: 'blade_surface',
        allowedDegenerateIndexRanges: [
          {
            indexStart: emit.baseStripIndexStart,
            indexCount: emit.baseStripIndexCount,
            reason: 'base_collapse',
          },
          {
            indexStart: emit.tipStripIndexStart,
            indexCount: emit.tipStripIndexCount,
            reason: 'tip_collapse',
          },
        ],
      });
    }
  }

  const mesh = new Mesh('skinplant_leaf_blade', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.colors = colors;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = true;

  const t1 = nowMs();

  return {
    mesh,
    leafletGroups,
    vertexLeafletTag: new Uint16Array(vertexLeafletTagArr),
    leafletIdByIdx,
    stats: {
      compoundLeafCount,
      leafletCount: leafletCountTotal,
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
      buildMs: t1 - t0,
    },
  };
}

// ── Per-leaflet emission ──────────────────────────────────────────────

interface EmitResult {
  /** Index range of the base→row1 strip (contains base_collapse degenerates). */
  baseStripIndexStart: number;
  baseStripIndexCount: number;
  /** Index range of the row(N-1)→tip strip (contains tip_collapse degenerates). */
  tipStripIndexStart: number;
  tipStripIndexCount: number;
}

function emitLeafletBlade(
  compound: CompoundLeafOrgan,
  leaflet: LeafletMorphologyNode,
  widthSegments: number,
  lengthSegments: number,
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
  vertexStart: number,
  colorAt: VertexColorAt,
): EmitResult {
  const shape = leaflet.shapeProfile;
  if (shape.lengthM <= 1e-4 || shape.maxHalfWidthM <= 1e-5) {
    return { baseStripIndexStart: 0, baseStripIndexCount: 0, tipStripIndexStart: 0, tipStripIndexCount: 0 };
  }

  const rowCount = lengthSegments + 1;
  const colCount = widthSegments + 1;

  // ── Parallel transport frame along midrib ─────────────────────────
  let prevTangent = samplePathTangent(leaflet.midribPath, 0);
  // Initial binormal: cross(tangent, world up). Fallback to (1,0,0) if parallel.
  let binormal = pickInitialBinormal(prevTangent);
  let normal = vnorm(vcross(prevTangent, binormal));

  // Per-leaflet vertex offset, used to address row[i][k] = i*colCount + k.
  const baseVertexOffset = vertexStart;

  for (let i = 0; i < rowCount; i++) {
    const t = i / lengthSegments;
    const center = samplePath(leaflet.midribPath, t);
    const tangent = samplePathTangent(leaflet.midribPath, t);

    // Parallel-transport binormal: rotate prev binormal by minimum rotation
    // that aligns prevTangent → tangent (Rodrigues axis = prev × curr).
    if (i > 0) {
      const axis = vcross(prevTangent, tangent);
      const axisLen = vlen(axis);
      if (axisLen > 1e-6) {
        const cosA = Math.max(-1, Math.min(1, vdot(prevTangent, tangent)));
        const angle = Math.atan2(axisLen, cosA);
        const unitAxis = vscale(axis, 1 / axisLen);
        binormal = rotateAroundAxis(binormal, unitAxis, angle);
      }
      normal = vnorm(vcross(tangent, binormal));
      // Re-orthonormalize binormal against (possibly accumulated) drift.
      binormal = vnorm(vcross(normal, tangent));
    }
    prevTangent = tangent;

    const halfWidthRel = evaluateWidthProfileT(shape.widthProfile, t); // 0..1 (peak=1)
    const halfWidth = halfWidthRel * shape.maxHalfWidthM;

    const droopY = shape.surfaceProfile.droopAmount * t * t * shape.lengthM;
    const color = colorAt(compound, leaflet, t);

    for (let k = 0; k < colCount; k++) {
      const u = -1 + (2 * k) / widthSegments; // [-1, +1]
      const asym = u >= 0
        ? shape.widthProfile.asymmetry
        : (shape.widthProfile.asymmetry > 1e-6 ? 1 / shape.widthProfile.asymmetry : 1);

      // Margin serration: only the outermost columns (k=0, k=widthSegments)
      // get a gentle edge modulation in v0.1 (geometry-weak — full tooth
      // geometry is v2 work).
      const edgeMod =
        k === 0 || k === widthSegments
          ? 1 + shape.marginProfile.serrationDepth * serrationCarrier(t) * 0.3
          : 1;

      const offset = u * halfWidth * asym * edgeMod;

      // Position: center + binormal*offset
      let px = center.x + binormal.x * offset;
      let py = center.y + binormal.y * offset;
      let pz = center.z + binormal.z * offset;

      // Cup: lift edges along surface normal, magnitude ∝ u^2 × halfWidth
      const cupAmt = shape.surfaceProfile.cupAmount * (u * u) * halfWidth;
      px += normal.x * cupAmt;
      py += normal.y * cupAmt;
      pz += normal.z * cupAmt;

      // Droop: pull whole row down (world -Y)
      py -= droopY;

      positions.push(px, py, pz);
      // Normal: use frame.normal for v0.1 (smooth shading). Will be
      // recomputed below per-vertex for accuracy.
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(k / widthSegments, t);
      colors.push(color[0], color[1], color[2], color[3]);
    }
  }

  // ── Triangulation (per quad strip between rows) ───────────────────
  const indicesBeforeStrips = indices.length;
  let baseStripStart = indicesBeforeStrips;
  let baseStripCount = 0;
  let tipStripStart = indicesBeforeStrips;
  let tipStripCount = 0;

  for (let i = 0; i < rowCount - 1; i++) {
    const stripStartIdx = indices.length;
    for (let k = 0; k < widthSegments; k++) {
      const a = baseVertexOffset + i * colCount + k;
      const b = baseVertexOffset + i * colCount + k + 1;
      const c = baseVertexOffset + (i + 1) * colCount + k;
      const d = baseVertexOffset + (i + 1) * colCount + k + 1;
      // Iter 16 fix: emit BOTH windings so the blade is genuinely double-sided.
      // Material backFaceCulling=false alone wasn't enough — PBR shading on a
      // flipped normal made the reverse side invisible from 180° viewpoints,
      // producing the "half the leaves missing depending on camera" symptom.
      indices.push(a, c, b);
      indices.push(b, c, d);
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
    const stripIndexCount = indices.length - stripStartIdx;
    if (i === 0) {
      baseStripStart = stripStartIdx;
      baseStripCount = stripIndexCount;
    }
    if (i === rowCount - 2) {
      tipStripStart = stripStartIdx;
      tipStripCount = stripIndexCount;
    }
  }

  // ── Smooth per-vertex normals (overwrite frame normals) ───────────
  // Cheap recompute: for each non-degenerate triangle, accumulate face normal
  // into its three vertices, then renormalize. Skips degenerate base/tip rows.
  recomputeSmoothNormals(
    positions,
    indices,
    normals,
    indicesBeforeStrips,
    indices.length,
  );

  return {
    baseStripIndexStart: baseStripStart,
    baseStripIndexCount: baseStripCount,
    tipStripIndexStart: tipStripStart,
    tipStripIndexCount: tipStripCount,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function pickInitialBinormal(tangent: V3): V3 {
  const up: V3 = { x: 0, y: 1, z: 0 };
  let b = vcross(tangent, up);
  if (Math.hypot(b.x, b.y, b.z) < 1e-6) b = { x: 1, y: 0, z: 0 };
  return vnorm(b);
}

function rotateAroundAxis(v: V3, axis: V3, angleRad: number): V3 {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dot = vdot(axis, v);
  return {
    x: v.x * cos + (axis.y * v.z - axis.z * v.y) * sin + axis.x * dot * (1 - cos),
    y: v.y * cos + (axis.z * v.x - axis.x * v.z) * sin + axis.y * dot * (1 - cos),
    z: v.z * cos + (axis.x * v.y - axis.y * v.x) * sin + axis.z * dot * (1 - cos),
  };
}

/** Sinusoidal carrier for serration mod along the midrib (v0.1: gentle). */
function serrationCarrier(t: number): number {
  return Math.sin(t * Math.PI * 6) * 0.5; // mild oscillation, no sharp teeth in v0.1
}

/**
 * Smooth-shade normals for the index range [indexStart, indexEnd). Re-uses
 * existing normals array (overwrites). Resets affected vertex normals to zero
 * before accumulation. Degenerate triangles contribute zero (cross is zero).
 */
function recomputeSmoothNormals(
  positions: number[],
  indices: number[],
  normalsOut: number[],
  indexStart: number,
  indexEnd: number,
): void {
  // Collect vertex indices touched by this range.
  const touched: Set<number> = new Set();
  for (let i = indexStart; i < indexEnd; i++) touched.add(indices[i]);

  // Zero them.
  for (const vi of touched) {
    normalsOut[vi * 3 + 0] = 0;
    normalsOut[vi * 3 + 1] = 0;
    normalsOut[vi * 3 + 2] = 0;
  }

  // Accumulate face normals.
  for (let i = indexStart; i < indexEnd; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    const ax = positions[a * 3 + 0], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3 + 0], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3 + 0], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    normalsOut[a * 3 + 0] += nx; normalsOut[a * 3 + 1] += ny; normalsOut[a * 3 + 2] += nz;
    normalsOut[b * 3 + 0] += nx; normalsOut[b * 3 + 1] += ny; normalsOut[b * 3 + 2] += nz;
    normalsOut[c * 3 + 0] += nx; normalsOut[c * 3 + 1] += ny; normalsOut[c * 3 + 2] += nz;
  }

  // Normalize, fallback to world up if zero.
  for (const vi of touched) {
    const nx = normalsOut[vi * 3 + 0];
    const ny = normalsOut[vi * 3 + 1];
    const nz = normalsOut[vi * 3 + 2];
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-6) {
      normalsOut[vi * 3 + 0] = nx / len;
      normalsOut[vi * 3 + 1] = ny / len;
      normalsOut[vi * 3 + 2] = nz / len;
    } else {
      normalsOut[vi * 3 + 0] = 0;
      normalsOut[vi * 3 + 1] = 1;
      normalsOut[vi * 3 + 2] = 0;
    }
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ── Rachis tube (cheap radial sweep) ──────────────────────────────────

/**
 * Sweep a small tube along a LeafBone polyline. Single closed cross-section
 * with `radialSegments` sides. Radius comes from each bone's r0/r1 (small,
 * < 1 mm). No caps — the start tucks into the petiole skin mesh, and the
 * tip tucks under the terminal leaflet's degenerate base.
 *
 * Parallel-transport binormal/normal to avoid twist; tangent comes from
 * (p1 - p0) per bone.
 */
function emitTube(
  bones: ReadonlyArray<LeafBone>,
  radialSegments: number,
  rgba: [number, number, number, number],
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
  baseVertexOffset: number,
): void {
  if (bones.length === 0) return;
  // Build a per-bone list of (center, tangent, radius) at each shared joint.
  // For N bones we emit N+1 rings.
  const rings: Array<{ center: V3; tangent: V3; r: number }> = [];
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i];
    if (i === 0) rings.push({ center: b.p0, tangent: dirSafe(vsub(b.p1, b.p0)), r: b.r0 });
    rings.push({ center: b.p1, tangent: dirSafe(vsub(b.p1, b.p0)), r: b.r1 });
  }

  // Parallel transport binormal.
  let binormal = pickInitialBinormal(rings[0].tangent);
  let prevTangent = rings[0].tangent;

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (i > 0) {
      const axis = vcross(prevTangent, ring.tangent);
      const axisLen = vlen(axis);
      if (axisLen > 1e-6) {
        const cosA = Math.max(-1, Math.min(1, vdot(prevTangent, ring.tangent)));
        const angle = Math.atan2(axisLen, cosA);
        binormal = rotateAroundAxis(binormal, vscale(axis, 1 / axisLen), angle);
      }
    }
    prevTangent = ring.tangent;
    const normal = vnorm(vcross(ring.tangent, binormal));
    binormal = vnorm(vcross(normal, ring.tangent));

    for (let k = 0; k < radialSegments; k++) {
      const theta = (k / radialSegments) * Math.PI * 2;
      const cx = Math.cos(theta), sx = Math.sin(theta);
      const ox = binormal.x * cx + normal.x * sx;
      const oy = binormal.y * cx + normal.y * sx;
      const oz = binormal.z * cx + normal.z * sx;
      positions.push(ring.center.x + ox * ring.r, ring.center.y + oy * ring.r, ring.center.z + oz * ring.r);
      normals.push(ox, oy, oz);
      uvs.push(k / radialSegments, i / (rings.length - 1 || 1));
      colors.push(rgba[0], rgba[1], rgba[2], rgba[3]);
    }
  }

  // Quad strip between consecutive rings (wrap k around radialSegments).
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < radialSegments; k++) {
      const a = baseVertexOffset + i * radialSegments + k;
      const b = baseVertexOffset + i * radialSegments + ((k + 1) % radialSegments);
      const c = baseVertexOffset + (i + 1) * radialSegments + k;
      const d = baseVertexOffset + (i + 1) * radialSegments + ((k + 1) % radialSegments);
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }
}

function dirSafe(v: V3): V3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 1e-6 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 1, z: 0 };
}
