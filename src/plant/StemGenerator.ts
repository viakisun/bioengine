import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { SeededRandom } from '@farmsim/tomato-engine';
import type { NodeState } from '@farmsim/tomato-engine';

const RADIAL_SEGMENTS = 8;
const DIVISIONS_PER_NODE = 4;

/**
 * Catmull-Rom interpolation between p1 and p2 (p0/p3 are tangent anchors).
 */
export function catmullRom(
  p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number
): Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return new Vector3(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
  );
}

/**
 * Generate a smooth polyline through control points using Catmull-Rom
 * interpolation. Each adjacent control-point pair produces
 * `divisionsPerSeg` interior sample points. The last segment also emits
 * the final endpoint so the curve actually reaches the last control
 * point.
 *
 * Reused by SkeletonOverlay to make stem segments visibly curved
 * (Plan 3a Phase ε — *직선 금지* invariant on the rendered polyline).
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

/**
 * Build a stem mesh from GrowthEngine NodeState array.
 * Reads heightCm, deflectionRad / Azimuth, and stemRadiusMm from
 * each node so the stem actually bends with truss weight and tapers
 * by pipe-model radius.
 *
 * Vertex colors encode woodiness — brown at the base, herbaceous
 * green at the tip.
 */
export function createStemMesh(
  name: string,
  scene: Scene,
  nodes: NodeState[],
  rng: SeededRandom,
  /** Side shoots: pass parent's branch position instead of ground origin. */
  options?: { origin?: { x: number; y: number; z: number } | null },
): Mesh | null {
  // With origin prefix, even 1-node axis (origin + node) yields 2 points.
  // Without prefix (origin === null), need >= 2 nodes.
  const hasOrigin = options?.origin !== null;
  const minNodes = hasOrigin ? 1 : 2;
  if (nodes.length < minNodes) return null;

  // Build control points from skeleton (Plan 3b — single source of truth).
  // node.position 은 GrowthModel 의 synthesizeGrowthDir 합성 결과로 이미
  // wandering + gravity sag 반영. PhysicsModel 의 deflectionRad/Azimuth
  // (fruit weight 의 추가 bending) 는 *온 top of* position 으로 더해서
  // 둘 다 보존.
  const controlPoints: Vector3[] = [];
  const controlRadii: number[] = [];
  const originPoint = options?.origin === undefined
    ? new Vector3(0, 0, 0)              // main stem: ground anchor
    : options.origin === null
      ? null                            // explicit null: no origin prefix
      : new Vector3(options.origin.x, options.origin.y, options.origin.z);
  if (originPoint) {
    controlPoints.push(originPoint);
    controlRadii.push((nodes[0].stemRadiusMm / 1000) * 1.1);
  }

  let accX = 0;
  let accZ = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    // Deflection 누적 — fruit weight bending 만. Skeleton 의 wandering
    // 은 node.position 에 이미 반영됨.
    if (node.deflectionRad > 0.001) {
      const segLen = i > 0 ? (node.heightCm - nodes[i - 1].heightCm) / 100 : node.heightCm / 100;
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

  const curvePoints = catmullRomPath(controlPoints, DIVISIONS_PER_NODE);
  const totalSegments = curvePoints.length - 1;

  // Interpolate radii along the curve
  const curveRadii: number[] = [];
  for (let i = 0; i < curvePoints.length; i++) {
    const t = i / totalSegments;
    const ri = t * (controlRadii.length - 1);
    const lo = Math.floor(ri);
    const hi = Math.min(lo + 1, controlRadii.length - 1);
    const frac = ri - lo;
    curveRadii.push(controlRadii[lo] + (controlRadii[hi] - controlRadii[lo]) * frac);
  }

  const ringCount = curvePoints.length;
  const colCount = RADIAL_SEGMENTS + 1;
  const positions: number[] = new Array(ringCount * colCount * 3);
  const normals: number[] = new Array(ringCount * colCount * 3);
  const colors: number[] = new Array(ringCount * colCount * 4);
  const uvs: number[] = new Array(ringCount * colCount * 2);

  const up = new Vector3(0, 1, 0);

  for (let i = 0; i < ringCount; i++) {
    const t = i / Math.max(1, totalSegments);
    const p = curvePoints[i];
    const radius = curveRadii[i];

    // Tangent
    const next = i < ringCount - 1 ? curvePoints[i + 1] : p;
    const prev = i > 0 ? curvePoints[i - 1] : p;
    const tangent = next.subtract(prev).normalize();

    // Frenet frame
    let normal: Vector3;
    if (Math.abs(Vector3.Dot(tangent, up)) > 0.99) {
      normal = new Vector3(1, 0, 0);
    } else {
      normal = Vector3.Cross(up, tangent).normalize();
    }
    const binormal = Vector3.Cross(tangent, normal).normalize();

    // Vertex color: woodiness nonlinear toward base
    const woodiness = Math.pow(1 - t, 0.6);
    const r = 0.35 * woodiness + 0.28 * (1 - woodiness);
    const g = 0.22 * woodiness + 0.55 * (1 - woodiness);
    const b = 0.12 * woodiness + 0.22 * (1 - woodiness);

    for (let j = 0; j < colCount; j++) {
      const angle = (j / RADIAL_SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const nx = normal.x * cos + binormal.x * sin;
      const ny = normal.y * cos + binormal.y * sin;
      const nz = normal.z * cos + binormal.z * sin;
      const idx = (i * colCount + j) * 3;

      positions[idx] = p.x + nx * radius;
      positions[idx + 1] = p.y + ny * radius;
      positions[idx + 2] = p.z + nz * radius;
      normals[idx] = nx;
      normals[idx + 1] = ny;
      normals[idx + 2] = nz;

      const cidx = (i * colCount + j) * 4;
      colors[cidx] = r;
      colors[cidx + 1] = g;
      colors[cidx + 2] = b;
      colors[cidx + 3] = 1.0;

      const uidx = (i * colCount + j) * 2;
      uvs[uidx] = j / RADIAL_SEGMENTS;
      uvs[uidx + 1] = t;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < ringCount - 1; i++) {
    for (let j = 0; j < RADIAL_SEGMENTS; j++) {
      const a = i * colCount + j;
      const b2 = a + colCount;
      const c = a + 1;
      const d = b2 + 1;
      indices.push(a, b2, c, c, b2, d);
    }
  }

  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.colors = colors;
  vd.uvs = uvs;
  vd.indices = indices;

  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  return mesh;
}

let cachedStemMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();

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
