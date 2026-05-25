// Local vector + curve helpers for the leaf module.
//
// Mirrors PlantBase.parabolicArc + buildTomatoSkeletonGraph.bonesFromCurve.
// Re-implemented locally rather than imported because:
//   (1) stem-family helpers are unexported (encapsulation),
//   (2) plan declares stem-family files 무수정 (zero touch),
//   (3) leaf module should stay self-contained for future extraction.

import type { V3 } from '../sdf/CapsuleSDF';
import type { LeafBone } from './LeafOrganGraph';

// ── Vector primitives ─────────────────────────────────────────────────

export function v(x: number, y: number, z: number): V3 { return { x, y, z }; }
export function vsub(a: V3, b: V3): V3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
export function vadd(a: V3, b: V3): V3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
export function vscale(a: V3, s: number): V3 { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
export function vlen(a: V3): number { return Math.hypot(a.x, a.y, a.z); }
export function vnorm(a: V3): V3 {
  const l = vlen(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
export function vdot(a: V3, b: V3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function vcross(a: V3, b: V3): V3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

// ── Parabolic arc (4-cp Catmull-Rom control points with downward sag) ─

export function parabolicArc(start: V3, end: V3, sagFrac = 0.06): V3[] {
  const arcLen = vlen(vsub(end, start));
  const sag = arcLen * sagFrac;
  const p1 = vadd(vscale(start, 0.66), vscale(end, 0.34));
  p1.y -= sag * 0.45;
  const p2 = vadd(vscale(start, 0.34), vscale(end, 0.66));
  p2.y -= sag * 0.85;
  return [start, p1, p2, end];
}

// ── Catmull-Rom densification ─────────────────────────────────────────

function catmullRomSegment(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const b0 = -0.5 * t3 + t2 - 0.5 * t;
  const b1 = 1.5 * t3 - 2.5 * t2 + 1.0;
  const b2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
  const b3 = 0.5 * t3 - 0.5 * t2;
  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
    z: b0 * p0.z + b1 * p1.z + b2 * p2.z + b3 * p3.z,
  };
}

/**
 * Densify a control-point polyline (Catmull-Rom). Reflects endpoints for
 * boundary segments so the first and last sample land exactly on cp[0] and
 * cp[N-1]. divisionsPerSeg=N produces N samples per segment + 1 endpoint.
 */
export function catmullRomPath(cps: ReadonlyArray<V3>, divisionsPerSeg: number): V3[] {
  if (cps.length === 0) return [];
  if (cps.length === 1) return [cps[0]];
  const div = Math.max(1, divisionsPerSeg);
  const out: V3[] = [];
  const get = (i: number): V3 => {
    if (i < 0) {
      // Reflect first segment: p[-1] = 2·p[0] - p[1]
      return vsub(vscale(cps[0], 2), cps[1]);
    }
    if (i >= cps.length) {
      const last = cps.length - 1;
      return vsub(vscale(cps[last], 2), cps[last - 1]);
    }
    return cps[i];
  };
  for (let i = 0; i < cps.length - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let j = 0; j < div; j++) {
      out.push(catmullRomSegment(p0, p1, p2, p3, j / div));
    }
  }
  out.push(cps[cps.length - 1]);
  return out;
}

// ── bonesFromCurve — densify + taper radius with smoothstep ───────────

/**
 * Same algorithm as stem-family bonesFromCurve. Smoothstep taper keeps the
 * mid-section weighted, matching stem-family visual.
 *
 * Input cps may be a 4-cp Catmull-Rom or any polyline of ≥ 2 points.
 */
export function bonesFromCurveLeaf(
  cps: ReadonlyArray<V3>,
  baseR: number,
  tipR: number,
  divisions: number,
): LeafBone[] {
  if (cps.length < 1) return [];
  if (cps.length === 1) {
    return [{ p0: cps[0], p1: cps[0], r0: baseR, r1: tipR }];
  }
  const dense = catmullRomPath(cps, Math.max(1, divisions));
  const n = dense.length;
  if (n < 2) {
    return [{ p0: dense[0], p1: dense[0], r0: baseR, r1: tipR }];
  }
  const smoothstep = (t: number): number => t * t * (3 - 2 * t);
  const bones: LeafBone[] = [];
  for (let i = 0; i < n - 1; i++) {
    const t0 = smoothstep(i / (n - 1));
    const t1 = smoothstep((i + 1) / (n - 1));
    bones.push({
      p0: dense[i],
      p1: dense[i + 1],
      r0: baseR + (tipR - baseR) * t0,
      r1: baseR + (tipR - baseR) * t1,
    });
  }
  return bones;
}

// ── Path metrics ──────────────────────────────────────────────────────

export function pathArcLength(bones: ReadonlyArray<LeafBone>): number {
  let total = 0;
  for (const b of bones) total += vlen(vsub(b.p1, b.p0));
  return total;
}

/**
 * Sample a point at fractional arc length t ∈ [0, 1] along a bone path.
 * Returns the linear interpolation within the bone that contains t.
 */
export function samplePath(bones: ReadonlyArray<LeafBone>, t: number): V3 {
  if (bones.length === 0) return v(0, 0, 0);
  const tClamped = Math.max(0, Math.min(1, t));
  const total = pathArcLength(bones);
  if (total <= 0) return bones[0].p0;
  const target = tClamped * total;
  let acc = 0;
  for (const b of bones) {
    const seg = vlen(vsub(b.p1, b.p0));
    if (acc + seg >= target || b === bones[bones.length - 1]) {
      const local = seg > 0 ? (target - acc) / seg : 0;
      return vadd(b.p0, vscale(vsub(b.p1, b.p0), Math.max(0, Math.min(1, local))));
    }
    acc += seg;
  }
  return bones[bones.length - 1].p1;
}

/** Tangent at fractional arc length t (unit vector). */
export function samplePathTangent(bones: ReadonlyArray<LeafBone>, t: number): V3 {
  if (bones.length === 0) return v(0, 1, 0);
  const tClamped = Math.max(0, Math.min(1, t));
  const total = pathArcLength(bones);
  if (total <= 0) return vnorm(vsub(bones[0].p1, bones[0].p0));
  const target = tClamped * total;
  let acc = 0;
  for (const b of bones) {
    const seg = vlen(vsub(b.p1, b.p0));
    if (acc + seg >= target || b === bones[bones.length - 1]) {
      return vnorm(vsub(b.p1, b.p0));
    }
    acc += seg;
  }
  return vnorm(vsub(bones[bones.length - 1].p1, bones[bones.length - 1].p0));
}

/**
 * Cantilever droop angle in degrees: angle between the chord (root → tip) and
 * horizontal (xz plane). Positive when tip sags below root. Used as a research
 * metric for V9 botanical validation.
 */
export function chordDroopAngleDeg(bones: ReadonlyArray<LeafBone>): number {
  if (bones.length === 0) return 0;
  const root = bones[0].p0;
  const tip = bones[bones.length - 1].p1;
  const chord = vsub(tip, root);
  const horizLen = Math.hypot(chord.x, chord.z);
  if (horizLen <= 1e-6) return chord.y < 0 ? -90 : chord.y > 0 ? 90 : 0;
  // -chord.y because positive droop = tip BELOW root.
  return Math.atan2(-chord.y, horizLen) * (180 / Math.PI);
}

/**
 * Rotate vector v around axis (unit) by angle radians. Rodrigues' formula.
 */
export function rotateAroundAxis(vIn: V3, axis: V3, angleRad: number): V3 {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dot = vdot(axis, vIn);
  return {
    x: vIn.x * cos + (axis.y * vIn.z - axis.z * vIn.y) * sin + axis.x * dot * (1 - cos),
    y: vIn.y * cos + (axis.z * vIn.x - axis.x * vIn.z) * sin + axis.y * dot * (1 - cos),
    z: vIn.z * cos + (axis.x * vIn.y - axis.y * vIn.x) * sin + axis.z * dot * (1 - cos),
  };
}
