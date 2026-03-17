import * as THREE from 'three';
import { SeededRandom } from '../utils/SeededRandom';
import type { NodeState } from '../simulation/GrowthModel';

const RADIAL_SEGMENTS = 8;

export function generateStem(
  nodes: NodeState[],
  rng: SeededRandom,
  _radiusMultiplier = 1,
): THREE.Mesh | null {
  if (nodes.length < 2) return null;

  // Build control points using physics-driven deflection
  const points: THREE.Vector3[] = [];
  const radii: number[] = [];

  // Ground point
  points.push(new THREE.Vector3(0, 0, 0));
  radii.push((nodes[0].stemRadiusMm / 1000) * 1.1); // wider at very base

  // Accumulated deflection offset
  let accumX = 0;
  let accumZ = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const y = node.heightCm / 100;

    // Physics-driven lateral offset from bending
    if (node.deflectionRad > 0.001) {
      const segLen = i > 0 ? (node.heightCm - nodes[i - 1].heightCm) / 100 : y;
      accumX += Math.sin(node.deflectionRad) * Math.cos(node.deflectionAzimuth) * segLen;
      accumZ += Math.sin(node.deflectionRad) * Math.sin(node.deflectionAzimuth) * segLen;
    }

    // Small organic jitter on top of physics
    const jitterX = rng.gaussian(0, 0.002);
    const jitterZ = rng.gaussian(0, 0.002);

    points.push(new THREE.Vector3(accumX + jitterX, y, accumZ + jitterZ));
    radii.push(node.stemRadiusMm / 1000);
  }

  // Create smooth curve
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const divisions = Math.max(nodes.length * 4, 20);
  const curvePoints = curve.getPoints(divisions);

  // Interpolate radii along curve (smooth taper)
  const curveRadii: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions;
    const ri = t * (radii.length - 1);
    const lo = Math.floor(ri);
    const hi = Math.min(lo + 1, radii.length - 1);
    const frac = ri - lo;
    curveRadii.push(radii[lo] + (radii[hi] - radii[lo]) * frac);
  }

  // Build custom BufferGeometry with per-division radius
  const totalVertices = (divisions + 1) * (RADIAL_SEGMENTS + 1);
  const positions = new Float32Array(totalVertices * 3);
  const colors = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);

  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions;
    const p = curvePoints[i];
    const radius = curveRadii[i];

    // Tangent
    if (i < divisions) {
      tangent.subVectors(curvePoints[i + 1], p).normalize();
    }

    // Frenet frame approximation
    if (Math.abs(tangent.dot(up)) > 0.99) {
      normal.set(1, 0, 0);
    } else {
      normal.crossVectors(up, tangent).normalize();
    }
    binormal.crossVectors(tangent, normal).normalize();

    // Color: woodiness increases toward base (nonlinear)
    const woodiness = Math.pow(1 - t, 0.6);
    const brown = [0.35, 0.22, 0.12];
    const green = [0.28, 0.55, 0.22];
    const r = brown[0] * woodiness + green[0] * (1 - woodiness);
    const g = brown[1] * woodiness + green[1] * (1 - woodiness);
    const b = brown[2] * woodiness + green[2] * (1 - woodiness);

    for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
      const angle = (j / RADIAL_SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const vIdx = (i * (RADIAL_SEGMENTS + 1) + j) * 3;

      positions[vIdx] = p.x + (normal.x * cos + binormal.x * sin) * radius;
      positions[vIdx + 1] = p.y + (normal.y * cos + binormal.y * sin) * radius;
      positions[vIdx + 2] = p.z + (normal.z * cos + binormal.z * sin) * radius;

      normals[vIdx] = normal.x * cos + binormal.x * sin;
      normals[vIdx + 1] = normal.y * cos + binormal.y * sin;
      normals[vIdx + 2] = normal.z * cos + binormal.z * sin;

      colors[vIdx] = r;
      colors[vIdx + 1] = g;
      colors[vIdx + 2] = b;
    }
  }

  // Indices
  const indexCount = divisions * RADIAL_SEGMENTS * 6;
  const indices = new Uint32Array(indexCount);
  let idx = 0;
  for (let i = 0; i < divisions; i++) {
    for (let j = 0; j < RADIAL_SEGMENTS; j++) {
      const a = i * (RADIAL_SEGMENTS + 1) + j;
      const b2 = a + RADIAL_SEGMENTS + 1;
      const c = a + 1;
      const d = b2 + 1;

      indices[idx++] = a;
      indices[idx++] = b2;
      indices[idx++] = c;
      indices[idx++] = c;
      indices[idx++] = b2;
      indices[idx++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

// Get world position along stem at a given height
export function getStemPositionAt(
  nodes: NodeState[],
  rng: SeededRandom,
  heightCm: number,
): THREE.Vector3 {
  const y = heightCm / 100;
  let xOff = 0, zOff = 0;
  const rngCopy = new SeededRandom(rng['initialSeed']);
  for (const node of nodes) {
    const nx = rngCopy.gaussian(0, 0.002);
    const nz = rngCopy.gaussian(0, 0.002);
    if (Math.abs(node.heightCm - heightCm) < 5) {
      xOff = nx;
      zOff = nz;
      break;
    }
  }
  return new THREE.Vector3(xOff, y, zOff);
}
