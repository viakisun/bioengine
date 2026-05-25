// CapsuleSDF — Signed Distance Function for tapered capsules + smooth union.
//
// Used by PlantSkinMeshBuilder to define plant stem-like organs as a list
// of capsule bones, then evaluate the smooth-min union SDF at any point.
// Marching cubes then extracts the isosurface as a single watertight mesh.
//
// SSOT Phase 4 (Continuous PlantSkinMesh) — implements the "continuous
// branching surface" principle (SSOT 4.6) via implicit surface union.
// Junction filleting is mathematically automatic (smooth-min).
//
// Pure math, zero dependencies. Babylon-agnostic.

export type V3 = { x: number; y: number; z: number };

/** Tapered capsule = line segment p0→p1 with radius r0→r1 (linear taper). */
export interface CapsuleBone {
  p0: V3;
  p1: V3;
  r0: number;
  r1: number;
}

/** Bounding sphere for early voxel culling. */
export interface BoneBoundingSphere {
  center: V3;
  radius: number;
}

// ── Vector helpers (no allocation in hot path) ─────────────────────────

function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function lengthSq(a: V3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ── Capsule SDF ────────────────────────────────────────────────────────

/**
 * Signed distance from a point to a tapered capsule (round cone).
 *
 * Negative inside, positive outside. The taper interpolates radius
 * linearly from r0 at p0 to r1 at p1, with hemispherical caps at each end.
 *
 * Reference: Inigo Quilez "Distance Functions" — Round Cone variant.
 * https://iquilezles.org/articles/distfunctions/
 */
export function sdCapsule(px: number, py: number, pz: number, bone: CapsuleBone): number {
  const bax = bone.p1.x - bone.p0.x;
  const bay = bone.p1.y - bone.p0.y;
  const baz = bone.p1.z - bone.p0.z;
  const pax = px - bone.p0.x;
  const pay = py - bone.p0.y;
  const paz = pz - bone.p0.z;

  const baba = bax * bax + bay * bay + baz * baz;
  if (baba < 1e-12) {
    // Degenerate (p0 == p1) — treat as sphere at p0, average radius.
    const r = (bone.r0 + bone.r1) * 0.5;
    return Math.sqrt(pax * pax + pay * pay + paz * paz) - r;
  }
  const paba = pax * bax + pay * bay + paz * baz;
  const t = clamp01(paba / baba);
  const r = bone.r0 + (bone.r1 - bone.r0) * t;

  // Perpendicular vector from axis projection to p.
  const qx = pax - bax * t;
  const qy = pay - bay * t;
  const qz = paz - baz * t;
  const qlen = Math.sqrt(qx * qx + qy * qy + qz * qz);

  return qlen - r;
}

// ── Smooth-min (quadratic polynomial) ──────────────────────────────────

/**
 * Quadratic polynomial smooth-min of two distances.
 *
 * Produces a C^1-continuous union of two SDFs. The blend region width is
 * controlled by k (in meters) — larger k = more rounded junction. k of
 * 2-5mm is appropriate for tomato stem junctions.
 *
 * Reference: Inigo Quilez "Smooth Min / Max"
 * https://iquilezles.org/articles/smin/
 */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - 0.25 * h * h * k;
}

// ── Bone list SDF (smooth union over all bones) ────────────────────────

/**
 * SDF of a bone list = smooth-min reduction of all per-bone capsule SDFs.
 *
 * For correctness no early-out, but in practice callers should pre-cull
 * via bounding spheres (most voxels are near 1-3 bones at most).
 *
 * @param boneIndices Optional subset of bones to evaluate (for culling).
 *                    When undefined, all bones are evaluated.
 */
export function sdBoneList(
  px: number,
  py: number,
  pz: number,
  bones: ReadonlyArray<CapsuleBone>,
  k: number,
  boneIndices?: ReadonlyArray<number>,
): number {
  const idx = boneIndices ?? null;
  const n = idx ? idx.length : bones.length;
  if (n === 0) return Infinity;

  let d = sdCapsule(px, py, pz, bones[idx ? idx[0] : 0]);
  for (let i = 1; i < n; i++) {
    const di = sdCapsule(px, py, pz, bones[idx ? idx[i] : i]);
    d = smin(d, di, k);
  }
  return d;
}

// ── Bounding sphere for voxel culling ──────────────────────────────────

/**
 * Bounding sphere containing the capsule + smin blend margin.
 *
 * For voxel culling: a voxel can be skipped for this bone iff the voxel
 * center is further than `radius + voxelHalfDiag` from `center`. The
 * `sminMargin` adds extra radius so bones near each other still influence
 * voxels in the blend region.
 */
export function boneBoundingSphere(bone: CapsuleBone, sminMargin: number): BoneBoundingSphere {
  const cx = (bone.p0.x + bone.p1.x) * 0.5;
  const cy = (bone.p0.y + bone.p1.y) * 0.5;
  const cz = (bone.p0.z + bone.p1.z) * 0.5;
  const dx = bone.p1.x - bone.p0.x;
  const dy = bone.p1.y - bone.p0.y;
  const dz = bone.p1.z - bone.p0.z;
  const halfLen = 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);
  const maxR = Math.max(bone.r0, bone.r1);
  return {
    center: { x: cx, y: cy, z: cz },
    radius: halfLen + maxR + sminMargin,
  };
}

/**
 * Total bounding box of a bone list (for voxel grid sizing).
 *
 * Returned bbox includes per-bone max radius padding so the resulting
 * isosurface is fully contained.
 */
export function bonesBoundingBox(
  bones: ReadonlyArray<CapsuleBone>,
  padding: number,
): { min: V3; max: V3 } {
  if (bones.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const b of bones) {
    const r = Math.max(b.r0, b.r1) + padding;
    minX = Math.min(minX, b.p0.x - r, b.p1.x - r);
    minY = Math.min(minY, b.p0.y - r, b.p1.y - r);
    minZ = Math.min(minZ, b.p0.z - r, b.p1.z - r);
    maxX = Math.max(maxX, b.p0.x + r, b.p1.x + r);
    maxY = Math.max(maxY, b.p0.y + r, b.p1.y + r);
    maxZ = Math.max(maxZ, b.p0.z + r, b.p1.z + r);
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

// ── Nearest bone (for per-vertex tagging) ──────────────────────────────

/**
 * Find the bone whose capsule SDF is smallest at point p.
 *
 * Used after marching cubes to tag each vertex with its closest bone, so
 * downstream code can:
 *   - assign edge id (organ tagging for Phase 5 cut/detach)
 *   - assign per-vertex color (organ type → color)
 */
export function nearestBoneIndex(
  px: number,
  py: number,
  pz: number,
  bones: ReadonlyArray<CapsuleBone>,
  boneIndices?: ReadonlyArray<number>,
): number {
  const idx = boneIndices ?? null;
  const n = idx ? idx.length : bones.length;
  if (n === 0) return -1;

  let best = idx ? idx[0] : 0;
  let bestD = sdCapsule(px, py, pz, bones[best]);
  for (let i = 1; i < n; i++) {
    const bi = idx ? idx[i] : i;
    const d = sdCapsule(px, py, pz, bones[bi]);
    if (d < bestD) {
      bestD = d;
      best = bi;
    }
  }
  return best;
}

/**
 * Find the top-K nearest bones, sorted by distance ascending.
 *
 * Used at junction vertices to blend colors of multiple bones by inverse-
 * distance weight (smooth color transition across organ boundaries).
 * Returns an array of length min(k, bones.length) of [boneIndex, distance].
 */
export function nearestBonesTopK(
  px: number,
  py: number,
  pz: number,
  bones: ReadonlyArray<CapsuleBone>,
  k: number,
  boneIndices?: ReadonlyArray<number>,
): Array<[number, number]> {
  const idx = boneIndices ?? null;
  const n = idx ? idx.length : bones.length;
  if (n === 0 || k <= 0) return [];

  // Small-k selection: maintain a sorted top-k array. For k=2-3 this is
  // faster than a heap.
  const top: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const bi = idx ? idx[i] : i;
    const d = sdCapsule(px, py, pz, bones[bi]);
    if (top.length < k) {
      top.push([bi, d]);
      // Insertion sort (small k).
      for (let j = top.length - 1; j > 0 && top[j][1] < top[j - 1][1]; j--) {
        const tmp = top[j];
        top[j] = top[j - 1];
        top[j - 1] = tmp;
      }
    } else if (d < top[top.length - 1][1]) {
      top[top.length - 1] = [bi, d];
      for (let j = top.length - 1; j > 0 && top[j][1] < top[j - 1][1]; j--) {
        const tmp = top[j];
        top[j] = top[j - 1];
        top[j - 1] = tmp;
      }
    }
  }
  return top;
}

// Marked exports for verification/tests
export const __testing__ = { dot, lengthSq, clamp01 };
