// Catmull-Rom spline interpolation — engine-agnostic.
// Returns Vec3 plain objects; renderer wraps with Babylon Vector3 etc.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Catmull-Rom: interpolates between p1 and p2; p0/p3 control tangent. */
export function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

/** Smooth path through control points with `divisionsPerSeg` interpolated samples between each pair. */
export function catmullRomPath(points: Vec3[], divisionsPerSeg: number): Vec3[] {
  if (points.length < 2) return points.slice();
  const out: Vec3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const steps = i === points.length - 2 ? divisionsPerSeg + 1 : divisionsPerSeg;
    for (let s = 0; s < steps; s++) {
      const t = s / divisionsPerSeg;
      out.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  return out;
}
