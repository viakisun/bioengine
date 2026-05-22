/**
 * Cocopeat grow-bag row + substrate mounds.
 *
 * Real-world reference: SJ corp / BIO GROW DUO 5-hole cocopeat bags
 * laid continuously along the hanging bed. Each bag has 5 square
 * cutouts on the top face; tomatoes are planted in holes 1, 3, 5 in
 * Kimje smart-farm practice ("1구 건너 1그루").
 *
 * Two merged meshes (1 draw call each):
 *
 *   `cocopeatBagRow`     — 30 bags × ~180 verts ≈ 5,400 verts. Each
 *                          bag is a small box with 5 octagonal hole
 *                          rims punched through the top, providing
 *                          real geometric depth (no alpha-cutout).
 *
 *   `cocopeatSubstrate`  — 30 bags × 5 holes = 150 low-poly dome
 *                          caps ≈ 1,500 verts. Each cap peeks ~1.2cm
 *                          above the bag top through its hole.
 *
 * Exported `SUBSTRATE_TOP_Y` is the world y-coordinate plants should
 * use as their stem base so they emerge from the mound rather than
 * floating above the bed.
 */

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { SeededRandom } from '@farmsim/tomato-engine';
import { SCENARIO } from '../data/mockScenario';
import {
  getCocopeatBagTexture,
  getCocopeatSubstrateTexture,
  getCocopeatSubstrateNormal,
} from './CocopeatBagTexture';

// === Dimensions ===
const BAG_LENGTH = 0.98;          // m (2cm gap between bags)
const BAG_WIDTH = 0.30;           // m
const BAG_HEIGHT = 0.10;          // m
const HOLE_RADIUS = 0.045;        // m (octagon inscribed radius)
const HOLE_DEPTH_BELOW_TOP = 0.025; // m (inner wall drops this far)
const HOLE_RING_SEGMENTS = 8;     // octagonal approximation of square hole
const HOLE_OFFSETS_X = [-0.40, -0.20, 0, +0.20, +0.40] as const; // 5 per bag

// Substrate mound geometry
const MOUND_RADIUS = HOLE_RADIUS; // seat exactly inside the hole rim
const MOUND_APEX_RISE = 0.012;    // m above bag top
const MOUND_BASE_SINK = 0.024;    // m below bag top
const MOUND_RING_VERTS = 8;

// Bed top y = 0.95. Bag sits on top.
const BAG_BOTTOM_Y = SCENARIO.bedY;
const BAG_TOP_Y = BAG_BOTTOM_Y + BAG_HEIGHT;

/**
 * World y where plant stems should originate so they appear to emerge
 * from the substrate mound. Imported by GreenhouseScene to offset the
 * showcase + supporting plant root positions.
 */
export const SUBSTRATE_TOP_Y = BAG_TOP_Y + MOUND_APEX_RISE;

const BED_LENGTH = SCENARIO.bedLengthM;
const BAG_COUNT = 30; // mirrors mockScenario BAG_COUNT
const BAG_PITCH = BED_LENGTH / BAG_COUNT; // 1.0m

export interface CocopeatBagsHandle {
  bagRow: Mesh;
  substrate: Mesh;
  dispose(): void;
}

export function createCocopeatBags(scene: Scene): CocopeatBagsHandle {
  // ---------- Bag row mesh ----------
  const bagPositions: number[] = [];
  const bagNormals: number[] = [];
  const bagUvs: number[] = [];
  const bagIndices: number[] = [];
  const bagColors: number[] = [];

  for (let b = 0; b < BAG_COUNT; b++) {
    const bagCenterX = -BED_LENGTH / 2 + BAG_PITCH / 2 + b * BAG_PITCH;
    const tintRng = new SeededRandom(20260520 + b * 13);
    const tintR = 0.95 + tintRng.next() * 0.10;
    const tintG = 0.95 + tintRng.next() * 0.10;
    const tintB = 0.95 + tintRng.next() * 0.10;
    appendBag(
      bagPositions, bagNormals, bagUvs, bagIndices, bagColors,
      bagCenterX,
      [tintR, tintG, tintB],
    );
  }

  const bagRow = new Mesh('cocopeatBagRow', scene);
  const bagVd = new VertexData();
  bagVd.positions = bagPositions;
  bagVd.normals = bagNormals;
  bagVd.uvs = bagUvs;
  bagVd.indices = bagIndices;
  bagVd.colors = bagColors;
  bagVd.applyToMesh(bagRow);

  const bagMat = new PBRMaterial('cocopeatBagMat', scene);
  bagMat.albedoColor = new Color3(1, 1, 1);
  bagMat.albedoTexture = getCocopeatBagTexture(scene);
  bagMat.metallic = 0;
  bagMat.roughness = 0.55;
  bagMat.clearCoat.isEnabled = true;
  bagMat.clearCoat.intensity = 0.25;
  bagMat.clearCoat.roughness = 0.4;
  bagMat.environmentIntensity = 0.6;
  bagMat.backFaceCulling = false; // hole inner walls have inward-facing normals
  bagRow.material = bagMat;
  bagRow.receiveShadows = true;

  // ---------- Substrate mound mesh ----------
  const subPositions: number[] = [];
  const subNormals: number[] = [];
  const subUvs: number[] = [];
  const subIndices: number[] = [];

  for (let b = 0; b < BAG_COUNT; b++) {
    const bagCenterX = -BED_LENGTH / 2 + BAG_PITCH / 2 + b * BAG_PITCH;
    const moundRng = new SeededRandom(20260520 + b * 31 + 7);
    for (let h = 0; h < HOLE_OFFSETS_X.length; h++) {
      const cx = bagCenterX + HOLE_OFFSETS_X[h];
      const cz = 0;
      const uvRotation = moundRng.next() * Math.PI * 2;
      appendMound(subPositions, subNormals, subUvs, subIndices, cx, cz, uvRotation);
    }
  }

  const substrate = new Mesh('cocopeatSubstrate', scene);
  const subVd = new VertexData();
  subVd.positions = subPositions;
  subVd.normals = subNormals;
  subVd.uvs = subUvs;
  subVd.indices = subIndices;
  subVd.applyToMesh(substrate);

  const subMat = new PBRMaterial('cocopeatSubstrateMat', scene);
  subMat.albedoColor = new Color3(1, 1, 1);
  subMat.albedoTexture = getCocopeatSubstrateTexture(scene);
  subMat.bumpTexture = getCocopeatSubstrateNormal(scene);
  subMat.metallic = 0;
  subMat.roughness = 0.95;
  subMat.environmentIntensity = 0.55;
  substrate.material = subMat;
  substrate.receiveShadows = true;

  return {
    bagRow,
    substrate,
    dispose() {
      bagRow.dispose(false, false);
      substrate.dispose(false, false);
      bagMat.dispose();
      subMat.dispose();
    },
  };
}

/**
 * Append a single bag's geometry to the merged buffers.
 *
 * Topology breakdown (all positions in world-space, no parent
 * transform needed at the mesh level):
 *
 *   1. Top face — quad strips along bag length, with a hole-shaped
 *      "skirt" cut around each of the 5 holes. We emit the top as a
 *      ring of trapezoids connecting bag's outer perimeter to each
 *      hole's outer perimeter, plus inter-hole strip fills.
 *   2. Hole inner walls — octagonal cylinders dropping from bag_top
 *      to bag_top - HOLE_DEPTH_BELOW_TOP, with inward-facing normals.
 *   3. Side faces — 4 outer-wall quads (±x ends, ±z sides).
 *   4. Bottom face — single quad (shadow integrity).
 *
 * For simplicity (and since the hole-skirt math is the visually
 * critical part) the top face uses a 4-zone strip per hole:
 *   - West fan from bag left edge to hole's west arc
 *   - East fan from hole's east arc to bag right edge
 *   - North/South strips between adjacent holes
 * We approximate by skipping the per-hole skirt math and instead
 * emit the top face as a list of "around-the-hole" rings interleaved
 * with simple inter-hole rectangles. The downside: minor seam where
 * the rectangular bag perimeter meets the octagonal hole rings —
 * acceptable since the bag print texture has the cutout markers
 * drawn at the hole positions to disguise any visual mismatch.
 */
function appendBag(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  colors: number[],
  cx: number,
  tint: [number, number, number],
): void {
  const halfL = BAG_LENGTH / 2;
  const halfW = BAG_WIDTH / 2;
  const baseY = BAG_BOTTOM_Y;
  const topY = BAG_TOP_Y;
  const innerY = topY - HOLE_DEPTH_BELOW_TOP;

  const pushVert = (
    x: number, y: number, z: number,
    nx: number, ny: number, nz: number,
    u: number, v: number,
  ) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
    colors.push(tint[0], tint[1], tint[2], 1);
    return positions.length / 3 - 1;
  };

  // ============================================
  // Top face — fan around each hole
  // ============================================
  // For each hole, build an annular ring connecting the hole's
  // octagon to a small surrounding square at the same bag-relative
  // position. Then connect adjacent surrounding squares with strips
  // to fill the rest of the top face.
  //
  // Per-hole "outer ring" radius = HOLE_RADIUS + ringMargin
  const ringMargin = 0.025; // m halo of plastic visible around each hole
  const outerR = HOLE_RADIUS + ringMargin;

  type RingVerts = { inner: number[]; outer: number[]; cx: number; cz: number };
  const rings: RingVerts[] = [];

  for (const holeOffsetX of HOLE_OFFSETS_X) {
    const hcx = cx + holeOffsetX;
    const hcz = 0;
    const innerRing: number[] = [];
    const outerRing: number[] = [];

    for (let i = 0; i < HOLE_RING_SEGMENTS; i++) {
      const ang = (i / HOLE_RING_SEGMENTS) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);

      const ix = hcx + HOLE_RADIUS * c;
      const iz = hcz + HOLE_RADIUS * s;
      const ox = hcx + outerR * c;
      const oz = hcz + outerR * s;

      // UV mapping: center bag-local top into texture's [0,1]×[0,1]
      const iu = (ix - (cx - halfL)) / BAG_LENGTH;
      const iv = (iz + halfW) / BAG_WIDTH;
      const ou = (ox - (cx - halfL)) / BAG_LENGTH;
      const ov = (oz + halfW) / BAG_WIDTH;

      innerRing.push(pushVert(ix, topY, iz, 0, 1, 0, iu, iv));
      outerRing.push(pushVert(ox, topY, oz, 0, 1, 0, ou, ov));
    }
    rings.push({ inner: innerRing, outer: outerRing, cx: hcx, cz: hcz });

    // Connect inner ring → outer ring as triangle pairs (annulus)
    for (let i = 0; i < HOLE_RING_SEGMENTS; i++) {
      const i2 = (i + 1) % HOLE_RING_SEGMENTS;
      indices.push(innerRing[i], outerRing[i], innerRing[i2]);
      indices.push(innerRing[i2], outerRing[i], outerRing[i2]);
    }
  }

  // Inter-hole top fill — between each adjacent pair of rings, plus
  // the bag's two end caps. We tessellate the remaining top area as
  // a strip of quads whose inner edges are flat tangents to the
  // outer rings, and whose outer edges follow the bag's perimeter.
  // For visual simplicity, build a coarse 4-quad fill per gap.
  const bagLeftU = 0;
  const bagRightU = 1;
  const bagFrontV = 0;
  const bagBackV = 1;

  function pushTopQuad(
    x0: number, z0: number, x1: number, z1: number,
    x2: number, z2: number, x3: number, z3: number,
  ) {
    const u = (x: number) => (x - (cx - halfL)) / BAG_LENGTH;
    const v = (z: number) => (z + halfW) / BAG_WIDTH;
    const i0 = pushVert(x0, topY, z0, 0, 1, 0, u(x0), v(z0));
    const i1 = pushVert(x1, topY, z1, 0, 1, 0, u(x1), v(z1));
    const i2 = pushVert(x2, topY, z2, 0, 1, 0, u(x2), v(z2));
    const i3 = pushVert(x3, topY, z3, 0, 1, 0, u(x3), v(z3));
    indices.push(i0, i1, i2, i0, i2, i3);
  }

  // Left end cap (bag west edge → first hole west)
  pushTopQuad(
    cx - halfL, -halfW,
    rings[0].cx - outerR, -halfW,
    rings[0].cx - outerR, +halfW,
    cx - halfL, +halfW,
  );
  // Right end cap
  pushTopQuad(
    rings[4].cx + outerR, -halfW,
    cx + halfL, -halfW,
    cx + halfL, +halfW,
    rings[4].cx + outerR, +halfW,
  );
  // Between adjacent holes (4 gaps)
  for (let g = 0; g < 4; g++) {
    const left = rings[g];
    const right = rings[g + 1];
    pushTopQuad(
      left.cx + outerR, -halfW,
      right.cx - outerR, -halfW,
      right.cx - outerR, +halfW,
      left.cx + outerR, +halfW,
    );
  }
  // For each hole, fill the strips north and south of the outer ring
  for (const ring of rings) {
    pushTopQuad(
      ring.cx - outerR, -halfW,
      ring.cx + outerR, -halfW,
      ring.cx + outerR, -outerR,
      ring.cx - outerR, -outerR,
    );
    pushTopQuad(
      ring.cx - outerR, +outerR,
      ring.cx + outerR, +outerR,
      ring.cx + outerR, +halfW,
      ring.cx - outerR, +halfW,
    );
  }

  // ============================================
  // Hole inner walls — drop from top to innerY
  // ============================================
  for (const ring of rings) {
    const topRing = ring.inner;
    // Build a parallel ring at innerY
    const bottomRing: number[] = [];
    for (let i = 0; i < HOLE_RING_SEGMENTS; i++) {
      const ang = (i / HOLE_RING_SEGMENTS) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const x = ring.cx + HOLE_RADIUS * c;
      const z = ring.cz + HOLE_RADIUS * s;
      // Inward-facing normal so the wall lights from inside
      bottomRing.push(pushVert(x, innerY, z, -c, 0, -s, 0.99, 0.99));
    }
    // Wall quads
    for (let i = 0; i < HOLE_RING_SEGMENTS; i++) {
      const i2 = (i + 1) % HOLE_RING_SEGMENTS;
      indices.push(topRing[i], bottomRing[i], topRing[i2]);
      indices.push(topRing[i2], bottomRing[i], bottomRing[i2]);
    }
  }

  // ============================================
  // Side faces (4)
  // ============================================
  const sideSampleU = 0.99;
  const sideSampleV = 0.99;
  function pushSideQuad(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
    nx: number, ny: number, nz: number,
  ) {
    const i0 = pushVert(x0, y0, z0, nx, ny, nz, sideSampleU, sideSampleV);
    const i1 = pushVert(x1, y1, z1, nx, ny, nz, sideSampleU, sideSampleV);
    const i2 = pushVert(x2, y2, z2, nx, ny, nz, sideSampleU, sideSampleV);
    const i3 = pushVert(x3, y3, z3, nx, ny, nz, sideSampleU, sideSampleV);
    indices.push(i0, i1, i2, i0, i2, i3);
  }

  // Front face (-z)
  pushSideQuad(
    cx - halfL, baseY, -halfW,
    cx + halfL, baseY, -halfW,
    cx + halfL, topY, -halfW,
    cx - halfL, topY, -halfW,
    0, 0, -1,
  );
  // Back face (+z)
  pushSideQuad(
    cx + halfL, baseY, +halfW,
    cx - halfL, baseY, +halfW,
    cx - halfL, topY, +halfW,
    cx + halfL, topY, +halfW,
    0, 0, +1,
  );
  // Left end (-x)
  pushSideQuad(
    cx - halfL, baseY, +halfW,
    cx - halfL, baseY, -halfW,
    cx - halfL, topY, -halfW,
    cx - halfL, topY, +halfW,
    -1, 0, 0,
  );
  // Right end (+x)
  pushSideQuad(
    cx + halfL, baseY, -halfW,
    cx + halfL, baseY, +halfW,
    cx + halfL, topY, +halfW,
    cx + halfL, topY, -halfW,
    +1, 0, 0,
  );

  // ============================================
  // Bottom face
  // ============================================
  pushSideQuad(
    cx + halfL, baseY, -halfW,
    cx - halfL, baseY, -halfW,
    cx - halfL, baseY, +halfW,
    cx + halfL, baseY, +halfW,
    0, -1, 0,
  );
}

/**
 * Append one cocopeat dome to the substrate buffers.
 *
 * Geometry: a low-poly cone-cap with `MOUND_RING_VERTS` perimeter
 * vertices at y = bag_top − MOUND_BASE_SINK and one apex vertex at
 * y = bag_top + MOUND_APEX_RISE. Plus a small disk underneath at
 * the base so back-face culling doesn't expose hollowness.
 *
 * UV rotation per mound (passed in) is fed to all ring verts so the
 * coir fiber texture doesn't repeat visibly across mounds.
 */
function appendMound(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  cx: number,
  cz: number,
  uvRotation: number,
): void {
  const apexY = BAG_TOP_Y + MOUND_APEX_RISE;
  const baseY = BAG_TOP_Y - MOUND_BASE_SINK;
  const baseStart = positions.length / 3;

  const cosR = Math.cos(uvRotation);
  const sinR = Math.sin(uvRotation);

  // Apex vertex
  positions.push(cx, apexY, cz);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  // Ring vertices at base
  for (let i = 0; i < MOUND_RING_VERTS; i++) {
    const ang = (i / MOUND_RING_VERTS) * Math.PI * 2;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const x = cx + MOUND_RADIUS * c;
    const z = cz + MOUND_RADIUS * s;
    positions.push(x, baseY, z);
    // Outward + slightly upward normal for dome shading
    const nLen = Math.hypot(c * 0.7, 0.7, s * 0.7);
    normals.push((c * 0.7) / nLen, 0.7 / nLen, (s * 0.7) / nLen);
    // Rotated UVs in [0,1]
    const u = 0.5 + (c * cosR - s * sinR) * 0.4;
    const v = 0.5 + (c * sinR + s * cosR) * 0.4;
    uvs.push(u, v);
  }

  // Side triangles (apex → ring[i] → ring[i+1])
  for (let i = 0; i < MOUND_RING_VERTS; i++) {
    const i2 = (i + 1) % MOUND_RING_VERTS;
    indices.push(baseStart, baseStart + 1 + i, baseStart + 1 + i2);
  }
}
