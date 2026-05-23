/**
 * StemGenerator — procedural tube mesh through a chain of NodeStates.
 *
 *   • Single source of truth: every node.position is consumed *as-is*; the
 *     mesh just sweeps a tapered tube along the wandering polyline.
 *   • Per-call polish knobs (radial segments, node bulge, vertical stripe)
 *     so showcase plants can opt into higher detail without paying the
 *     cost on 720-plant greenhouse renders.
 *   • Catmull-Rom utilities re-exported for SkeletonOverlay reuse.
 */

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { SeededRandom } from '@farmsim/tomato-engine';
import type { NodeState } from '@farmsim/tomato-engine';

// ─────────────────────────────────────────────────────────────────────────
// Catmull-Rom utilities (exported — SkeletonOverlay reuses these).
// ─────────────────────────────────────────────────────────────────────────

/** Catmull-Rom interpolation; p0/p3 are tangent anchors. */
export function catmullRom(
  p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number,
): Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return new Vector3(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  );
}

/**
 * Sample a smooth polyline through control points. For N control points
 * and D divisions, outputs (N-1)·D + 1 sample points — first sample is
 * control point 0, last sample is control point N-1, so endpoints are
 * preserved.
 */
export function catmullRomPath(points: Vector3[], divisionsPerSeg: number): Vector3[] {
  if (points.length < 2) return points.slice();
  const out: Vector3[] = [];
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

// ─────────────────────────────────────────────────────────────────────────
// Stem mesh
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_RADIAL_SEGMENTS = 8;
const DIVISIONS_PER_NODE = 4;

export interface StemMeshOptions {
  /** Side shoots: pass parent's branch position instead of ground origin.
   *  `undefined` (default) → use (0,0,0). `null` → no prefix at all. */
  origin?: { x: number; y: number; z: number } | null;
  /** Cross-section vertex count. 8 = octagonal (cheap, supporting plants).
   *  12 = visibly round (showcase). Default 8. */
  radialSegments?: number;
  /** 0 = uniform taper. > 0 = swelling at each NodeState's control-point
   *  position (마디감). Typical 0.10–0.20. */
  nodeBulge?: number;
  /** Number of longitudinal grooves around the cross-section. 0 disables.
   *  8 ≈ vascular bundle hint, only noticeable at close range. */
  verticalStripeCount?: number;
  /** Depth of the stripes (0..1 — multiplier on vertex color). 0.06 is
   *  subtle, 0.15 is obvious. */
  stripeDepth?: number;
}

/**
 * Build a tube mesh through `nodes` using each node's authoritative
 * 3D position (Plan 3b — single source of truth). Per-node `stemRadiusMm`
 * controls the cross-section radius for natural taper; per-node
 * `deflectionRad`/Azimuth from PhysicsModel adds fruit-weight bending
 * on top of the skeleton's wandering curve.
 *
 * Vertex colors encode woodiness — brown at the base, herbaceous green
 * at the tip — and optionally are modulated by `verticalStripeCount`
 * longitudinal grooves for vascular-bundle hints under close inspection.
 */
export function createStemMesh(
  name: string,
  scene: Scene,
  nodes: NodeState[],
  rng: SeededRandom,
  options: StemMeshOptions = {},
): Mesh | null {
  const radialSegments = Math.max(3, options.radialSegments ?? DEFAULT_RADIAL_SEGMENTS);
  const nodeBulge = Math.max(0, options.nodeBulge ?? 0);
  const stripeCount = Math.max(0, options.verticalStripeCount ?? 0);
  const stripeDepth = Math.max(0, Math.min(1, options.stripeDepth ?? 0));

  // origin: undefined → ground (0,0,0); null → no prefix; object → custom.
  const originPoint: Vector3 | null = options.origin === undefined
    ? new Vector3(0, 0, 0)
    : options.origin === null
      ? null
      : new Vector3(options.origin.x, options.origin.y, options.origin.z);

  // With origin prefix, even 1-node axis (origin + node) yields 2 points.
  const minNodes = originPoint ? 1 : 2;
  if (nodes.length < minNodes) return null;

  const { controlPoints, controlRadii } = buildControlSpine(nodes, rng, originPoint);
  const curvePoints = catmullRomPath(controlPoints, DIVISIONS_PER_NODE);

  // Per-curve-sample radius — linear blend between control radii, plus
  // node bulge swelling at the integer indices.
  const curveRadii = sampleRadiiAlongCurve(curvePoints.length, controlRadii, nodeBulge);

  const vd = sweepTube(curvePoints, curveRadii, radialSegments, stripeCount, stripeDepth);

  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  return mesh;
}

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convert NodeState[] → polyline control points + per-control radii.
 * Each node.position is consumed directly; PhysicsModel's
 * deflectionRad/Azimuth adds an extra X/Z bend on top.
 */
function buildControlSpine(
  nodes: NodeState[],
  rng: SeededRandom,
  originPoint: Vector3 | null,
): { controlPoints: Vector3[]; controlRadii: number[] } {
  const controlPoints: Vector3[] = [];
  const controlRadii: number[] = [];
  if (originPoint) {
    controlPoints.push(originPoint);
    // Root flare — first node's radius × 1.1 for a slight basal swell.
    controlRadii.push((nodes[0].stemRadiusMm / 1000) * 1.1);
  }
  let accX = 0;
  let accZ = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.deflectionRad > 0.001) {
      const segLen = (i > 0 ? node.heightCm - nodes[i - 1].heightCm : node.heightCm) / 100;
      accX += Math.sin(node.deflectionRad) * Math.cos(node.deflectionAzimuth) * segLen;
      accZ += Math.sin(node.deflectionRad) * Math.sin(node.deflectionAzimuth) * segLen;
    }
    const jitterX = rng.gaussian(0, 0.002);
    const jitterZ = rng.gaussian(0, 0.002);
    controlPoints.push(new Vector3(
      node.position.x + accX + jitterX,
      node.position.y,
      node.position.z + accZ + jitterZ,
    ));
    controlRadii.push(node.stemRadiusMm / 1000);
  }
  return { controlPoints, controlRadii };
}

/**
 * Interpolate radius for every curve sample (catmullRom output index)
 * from the per-control values. With `nodeBulge > 0`, samples near a
 * control point get an additional radial swell — produces visible
 * mass at each plant node ("마디감").
 *
 * catmullRomPath maps sample index k → fractional control-point index
 * `k / DIVISIONS_PER_NODE`. The integer part is the lower control,
 * the fraction is the lerp factor.
 */
function sampleRadiiAlongCurve(
  ringCount: number,
  controlRadii: number[],
  nodeBulge: number,
): number[] {
  const out = new Array<number>(ringCount);
  const N = controlRadii.length;
  for (let i = 0; i < ringCount; i++) {
    const f = i / DIVISIONS_PER_NODE;
    const lo = Math.min(N - 1, Math.floor(f));
    const hi = Math.min(N - 1, lo + 1);
    const frac = Math.max(0, Math.min(1, f - lo));
    let r = controlRadii[lo] * (1 - frac) + controlRadii[hi] * frac;
    if (nodeBulge > 0) {
      // Distance from nearest control point as a fraction of [0, 0.5].
      // Bulge peaks at 0 (on control point), 0 at midpoint between
      // controls.
      const distFromCtrl = Math.min(frac, 1 - frac);
      const bulge = (1 - distFromCtrl * 2) * nodeBulge;
      r *= 1 + bulge;
    }
    out[i] = r;
  }
  return out;
}

/**
 * Sweep a tapered tube along the supplied curve. radialSegments determines
 * the cross-section polygon count. `stripeCount > 0` modulates per-vertex
 * color with longitudinal grooves (vascular bundle hint).
 */
function sweepTube(
  curvePoints: Vector3[],
  curveRadii: number[],
  radialSegments: number,
  stripeCount: number,
  stripeDepth: number,
): VertexData {
  const ringCount = curvePoints.length;
  const totalSegments = ringCount - 1;
  const colCount = radialSegments + 1;          // +1 to close the cylinder (uv seam)
  const vertCount = ringCount * colCount;

  const positions = new Array<number>(vertCount * 3);
  const normals = new Array<number>(vertCount * 3);
  const colors = new Array<number>(vertCount * 4);
  const uvs = new Array<number>(vertCount * 2);

  const up = new Vector3(0, 1, 0);
  // Scratch vectors — reused inside the per-ring loop to reduce GC churn.
  const tangent = new Vector3();
  const normalDir = new Vector3();
  const binormal = new Vector3();

  for (let i = 0; i < ringCount; i++) {
    const t = totalSegments > 0 ? i / totalSegments : 0;
    const p = curvePoints[i];
    const radius = curveRadii[i];

    // Tangent via central difference (clamped at endpoints).
    const next = i < ringCount - 1 ? curvePoints[i + 1] : p;
    const prev = i > 0 ? curvePoints[i - 1] : p;
    next.subtractToRef(prev, tangent);
    tangent.normalize();

    // Frenet-ish frame — pick a normal perpendicular to tangent. When the
    // tangent is almost parallel to world up, fall back to world-x.
    if (Math.abs(Vector3.Dot(tangent, up)) > 0.99) {
      normalDir.set(1, 0, 0);
    } else {
      Vector3.CrossToRef(up, tangent, normalDir);
      normalDir.normalize();
    }
    Vector3.CrossToRef(tangent, normalDir, binormal);
    binormal.normalize();

    // Woodiness — nonlinear gradient toward base. The transformation is
    // chosen so basal nodes read brown (lignified) and apical nodes read
    // green (herbaceous).
    const woodiness = Math.pow(1 - t, 0.6);
    const r0 = 0.35 * woodiness + 0.28 * (1 - woodiness);
    const g0 = 0.22 * woodiness + 0.55 * (1 - woodiness);
    const b0 = 0.12 * woodiness + 0.22 * (1 - woodiness);

    for (let j = 0; j < colCount; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const nx = normalDir.x * cosA + binormal.x * sinA;
      const ny = normalDir.y * cosA + binormal.y * sinA;
      const nz = normalDir.z * cosA + binormal.z * sinA;

      const idx = (i * colCount + j) * 3;
      positions[idx]     = p.x + nx * radius;
      positions[idx + 1] = p.y + ny * radius;
      positions[idx + 2] = p.z + nz * radius;
      normals[idx]     = nx;
      normals[idx + 1] = ny;
      normals[idx + 2] = nz;

      // Vertical stripe — darken slightly along `stripeCount` longitudinal
      // grooves. Peaks at the high points (|cos|=1), 0 in valleys.
      let stripeMul = 1;
      if (stripeCount > 0 && stripeDepth > 0) {
        stripeMul = 1 - stripeDepth * Math.abs(Math.cos(stripeCount * angle));
      }

      const cidx = (i * colCount + j) * 4;
      colors[cidx]     = r0 * stripeMul;
      colors[cidx + 1] = g0 * stripeMul;
      colors[cidx + 2] = b0 * stripeMul;
      colors[cidx + 3] = 1;

      const uidx = (i * colCount + j) * 2;
      uvs[uidx]     = j / radialSegments;
      uvs[uidx + 1] = t;
    }
  }

  // Quad-strip indices — two triangles per quad (ring × radial).
  const indices: number[] = new Array((ringCount - 1) * radialSegments * 6);
  let w = 0;
  for (let i = 0; i < ringCount - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * colCount + j;
      const b2 = a + colCount;
      const c = a + 1;
      const d = b2 + 1;
      indices[w++] = a;  indices[w++] = b2; indices[w++] = c;
      indices[w++] = c;  indices[w++] = b2; indices[w++] = d;
    }
  }

  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.colors = colors;
  vd.uvs = uvs;
  vd.indices = indices;
  return vd;
}

// ─────────────────────────────────────────────────────────────────────────
// Material
// ─────────────────────────────────────────────────────────────────────────

const cachedStemMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();

export function getStemMaterial(scene: Scene): PBRMaterial {
  let mat = cachedStemMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('stemMat', scene);
    mat.albedoColor = new Color3(1, 1, 1);
    mat.useAlphaFromAlbedoTexture = false;
    mat.metallic = 0;
    mat.roughness = 0.85;
    mat.backFaceCulling = true;
    cachedStemMaterial.set(scene, mat);
  }
  return mat;
}
