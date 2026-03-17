import * as THREE from 'three';
import { SeededRandom } from '../utils/SeededRandom';
import { getLeafColorTexture, getLeafNormalTexture } from './LeafTexture';

// Genome-driven leaf shape parameters
export interface LeafShapeParams {
  serrationDepth: number;  // 0.10-0.25
  serrationFreq: number;   // 7-14
  lobeDepth: number;       // 0.0-0.15
  waviness: number;        // 0.0-0.006
  petioleLength: number;   // 0.05-0.12 (m)
}

const DEFAULT_LEAF_PARAMS: LeafShapeParams = {
  serrationDepth: 0.18,
  serrationFreq: 10,
  lobeDepth: 0.08,
  waviness: 0.003,
  petioleLength: 0.08,
};

/**
 * Create a compound tomato leaf geometry (odd-pinnate).
 * Rachis with paired lateral leaflets + terminal leaflet.
 * Each leaflet is ovate with deep serration.
 */
export function createLeafGeometry(
  leafletCount: number,
  sizeFactor: number,
  maturity: number,
  curl: number,
  rng: SeededRandom,
  shapeParams?: LeafShapeParams,
  ageFrac?: number, // 0=young, 1=very old (age/80 clamped)
): THREE.BufferGeometry {
  const params = shapeParams ?? DEFAULT_LEAF_PARAMS;
  const af = ageFrac ?? 0; // gravity aging factor
  const geos: THREE.BufferGeometry[] = [];

  // Real tomato compound leaf anatomy:
  //   petiole (5-12cm cylindrical) → rachis (15-25cm, thinner) → leaflets
  const petioleLen = params.petioleLength * sizeFactor * maturity;
  const rachisLen = 0.32 * sizeFactor * maturity;
  const totalLen = petioleLen + rachisLen;
  const pairs = Math.floor(leafletCount / 2);

  // --- Petiole: cylindrical stem from node to first leaflet pair ---
  // Tapers from ~2mm at stem junction to ~1.2mm where rachis begins
  // Proportional to herbaceous vine — not woody
  const petioleBaseRadius = 0.0018 * sizeFactor;
  const petioleTipRadius = 0.0012 * sizeFactor;
  const petioleSegs = 6;
  const petioleGeo = new THREE.CylinderGeometry(
    petioleTipRadius, petioleBaseRadius, petioleLen, 5, petioleSegs,
  );
  // Rotate so it extends along +X (matching leaf coordinate system)
  petioleGeo.rotateZ(-Math.PI / 2);
  petioleGeo.translate(petioleLen / 2, 0, 0);
  // Gravity-aware petiole curve:
  // Young: slight upward arch (turgor pressure holds it up)
  // Old: arch collapses, petiole sags under leaf weight
  const petPos = petioleGeo.getAttribute('position');
  for (let v = 0; v < petPos.count; v++) {
    const x = petPos.getX(v);
    const t = x / petioleLen; // 0=base, 1=tip
    // Young: slight upward arch, Old: strong downward sag
    const archStrength = 0.04 * (1 - af * 3.5); // +0.04 → -0.10
    const archY = Math.sin(t * Math.PI) * petioleLen * archStrength;
    // Gravity pull increases toward tip, much stronger with age
    const gravityY = -t * t * petioleLen * af * 0.25;
    petPos.setY(v, petPos.getY(v) + archY + gravityY);
  }
  petPos.needsUpdate = true;
  petioleGeo.computeVertexNormals();
  geos.push(petioleGeo);

  // --- Rachis: thinner continuation, carries leaflets ---
  // Tapers from ~1mm down to ~0.5mm at tip — noticeably thinner than petiole
  const rachisBaseRadius = 0.0010 * sizeFactor;
  const rachisTipRadius = 0.0005 * sizeFactor;
  const rachisSegs = 8;
  const rachisGeo = new THREE.CylinderGeometry(
    rachisTipRadius, rachisBaseRadius, rachisLen, 4, rachisSegs,
  );
  rachisGeo.rotateZ(-Math.PI / 2);
  rachisGeo.translate(petioleLen + rachisLen / 2, 0, 0);
  // Rachis droop: increases with age as leaflet mass accumulates
  // Young: slight droop (0.08), Old: heavy sag under weight (0.35)
  const rachisDroopFactor = 0.08 + af * 0.27;
  const racPos = rachisGeo.getAttribute('position');
  for (let v = 0; v < racPos.count; v++) {
    const x = racPos.getX(v);
    const t = (x - petioleLen) / rachisLen;
    if (t >= 0 && t <= 1) {
      racPos.setY(v, racPos.getY(v) - t * t * rachisLen * rachisDroopFactor);
    }
  }
  racPos.needsUpdate = true;
  rachisGeo.computeVertexNormals();
  geos.push(rachisGeo);

  // --- Leaflets along rachis (offset by petioleLen) ---
  for (let i = 0; i <= pairs; i++) {
    const t = pairs === 0 ? 0.7 : (0.15 + 0.75 * (i / pairs));
    const posAlongRachis = petioleLen + rachisLen * t;
    // Y offset: follows age-dependent rachis droop curve
    const yOff = -t * t * rachisLen * rachisDroopFactor;

    const isTerminal = i === pairs;
    const baseSizeMod = isTerminal ? 1.2 : (0.5 + 0.5 * Math.sin(t * Math.PI));
    const leafletSize = 0.14 * sizeFactor * maturity * baseSizeMod * rng.range(0.8, 1.2);

    // Gravity-aware leaflet tilt: older leaves have irregular drooping leaflets
    // Young: nearly flat (±5°), Old: significant tilt (±25°) + twist (±15°)
    const leafletDroopRange = 0.08 + af * 0.36; // radians: ~5° → ~25°
    const leafletTwistRange = 0.05 + af * 0.22; // radians: ~3° → ~15°

    if (isTerminal) {
      const geo = createOvateLeaflet(leafletSize, curl * rng.range(0.7, 1.3), rng, params, true);
      // Terminal leaflet droops slightly with age
      geo.rotateZ(rng.range(-leafletDroopRange * 0.5, leafletDroopRange * 0.3));
      geo.rotateX(rng.range(-leafletTwistRange, leafletTwistRange));
      geo.translate(posAlongRachis, yOff, 0);
      geos.push(geo);
    } else {
      for (const side of [-1, 1]) {
        const geo = createOvateLeaflet(
          leafletSize * rng.range(0.85, 1.15),
          curl * rng.range(0.5, 1.5),
          rng,
          params,
          false,
        );
        // Leaflets angle outward from rachis, not perfectly perpendicular
        geo.rotateY(side * rng.range(0.35, 0.65));
        // Age-dependent irregular tilt: each leaflet sags/twists differently
        geo.rotateZ(-Math.abs(rng.gaussian(0, leafletDroopRange))); // bias downward
        geo.rotateX(rng.gaussian(0, leafletTwistRange)); // random twist
        geo.translate(posAlongRachis, yOff, side * 0.025 * baseSizeMod);
        geos.push(geo);

        // Petiolule: tiny sub-stem from rachis to each lateral leaflet (1-2mm visible)
        const petioluleLen = 0.008 * baseSizeMod;
        const petioluleGeo = new THREE.CylinderGeometry(
          0.0004 * sizeFactor, 0.0006 * sizeFactor, petioluleLen, 3,
        );
        petioluleGeo.rotateX(Math.PI / 2); // point along Z
        petioluleGeo.translate(posAlongRachis, yOff, side * petioluleLen * 0.5);
        geos.push(petioluleGeo);
      }

      // Intercalary leaflets (small between main pairs)
      if (i < pairs && rng.next() > 0.3) {
        const interT = t + 0.5 / (pairs + 1) * 0.75;
        const interPos = petioleLen + rachisLen * interT;
        const interYOff = -interT * interT * rachisLen * rachisDroopFactor;
        const interSize = leafletSize * 0.35 * rng.range(0.7, 1.3);
        for (const side of [-1, 1]) {
          if (rng.next() > 0.4) {
            const geo = createOvateLeaflet(interSize, curl * rng.range(0.3, 1.0), rng, params, false);
            geo.rotateY(side * rng.range(0.4, 0.8));
            geo.rotateZ(-Math.abs(rng.gaussian(0, leafletDroopRange * 0.7)));
            geo.translate(interPos, interYOff, side * 0.015);
            geos.push(geo);
          }
        }
      }
    }
  }

  return mergeGeometries(geos);
}

/**
 * Create a single ovate leaflet with deep serration.
 * Strip triangulation along the midrib for proper topology.
 */
function createOvateLeaflet(
  size: number,
  curl: number,
  rng: SeededRandom,
  params: LeafShapeParams,
  isTerminal: boolean,
): THREE.BufferGeometry {
  const length = size;
  const maxWidth = size * 0.55; // real tomato leaflet width ~50-60% of length
  const lengthSegs = 12;
  const widthSegs = 4;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const cols = widthSegs * 2 + 1;

  for (let row = 0; row <= lengthSegs; row++) {
    const t = row / lengthSegs; // 0=base, 1=tip

    // Ovate outline: widest at ~40%, acuminate tip
    let widthFactor: number;
    if (t < 0.4) {
      widthFactor = Math.sin((t / 0.4) * Math.PI * 0.5);
    } else {
      const tNorm = (t - 0.4) / 0.6;
      widthFactor = Math.cos(tNorm * Math.PI * 0.5) * (1 - tNorm * 0.3);
    }

    // Lobing modulation
    const lobeModulation = 1 - params.lobeDepth * Math.sin(t * Math.PI * 3) * Math.max(0, 1 - t * 1.5);

    const rowWidth = maxWidth * widthFactor * lobeModulation;
    const rowX = t * length;

    for (let col = 0; col < cols; col++) {
      const colNorm = (col / (cols - 1)) * 2 - 1; // -1 to +1
      const absCol = Math.abs(colNorm);

      let z = colNorm * rowWidth;

      // Deep serration on edges
      if (absCol > 0.6 && t > 0.05 && t < 0.95) {
        const serrationPhase = t * params.serrationFreq * Math.PI * 2 + rng.next() * 0.5;
        const toothShape = Math.max(0, Math.sin(serrationPhase));
        const serrationAmp = rowWidth * params.serrationDepth * absCol;
        z += Math.sign(colNorm) * toothShape * serrationAmp;
      }

      // Y: curl + waviness + midrib ridge (scaled relative to leaf size)
      const dist = Math.sqrt((t * length) * (t * length) + z * z) / size;
      let y = curl * dist * dist * size * 3;

      // Surface waviness (blistered texture)
      if (params.waviness > 0) {
        y += params.waviness * Math.sin(rowX * 40) * Math.sin(z * 60) * (1 - absCol * 0.5);
      }

      // Midrib ridge
      const midribHeight = 0.002 * (1 - absCol * absCol) * size * 10;
      y += midribHeight;

      positions.push(rowX, y, z);

      // UV: u along length (0=base, 1=tip), v across width (0=left, 1=right)
      const u = t;
      const v = col / (cols - 1);
      uvs.push(u, v);

      const curlEffect = curl * size * dist;
      const ny = 1 - curlEffect * 2;
      normals.push(0, Math.max(0.3, ny), curlEffect * Math.sign(z || 0.01));
    }
  }

  // Quad strip indices
  for (let row = 0; row < lengthSegs; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  // Terminal leaflet: side lobes (characteristic of tomato)
  if (isTerminal && size > 0.03) {
    for (const side of [-1, 1]) {
      const lobeGeo = createSmallLobe(size * 0.3, curl, rng, params);
      lobeGeo.rotateY(side * 0.6);
      lobeGeo.translate(size * 0.35, 0, side * maxWidth * 0.6);

      const lobePos = lobeGeo.getAttribute('position');
      const lobeNorm = lobeGeo.getAttribute('normal');
      const lobeUv = lobeGeo.getAttribute('uv');
      const lobeIdx = lobeGeo.index;
      const baseVertex = positions.length / 3;

      for (let i = 0; i < lobePos.count; i++) {
        positions.push(lobePos.getX(i), lobePos.getY(i), lobePos.getZ(i));
        normals.push(
          lobeNorm ? lobeNorm.getX(i) : 0,
          lobeNorm ? lobeNorm.getY(i) : 1,
          lobeNorm ? lobeNorm.getZ(i) : 0,
        );
        uvs.push(
          lobeUv ? lobeUv.getX(i) : 0.5,
          lobeUv ? lobeUv.getY(i) : 0.5,
        );
      }
      if (lobeIdx) {
        for (let i = 0; i < lobeIdx.count; i++) {
          indices.push(lobeIdx.array[i] + baseVertex);
        }
      }
      lobeGeo.dispose();
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/** Small side lobe for terminal leaflet */
function createSmallLobe(
  size: number,
  curl: number,
  rng: SeededRandom,
  params: LeafShapeParams,
): THREE.BufferGeometry {
  const segs = 6;
  const w = size;
  const h = size * 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Center vertex
  positions.push(0, 0, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i <= segs * 2; i++) {
    const t = i / (segs * 2);
    const angle = t * Math.PI * 2;
    let x = Math.cos(angle) * w;
    let z = Math.sin(angle) * h;

    const serration = 1 + params.serrationDepth * 0.5 * Math.sin(i * 4.5 + rng.next() * 2);
    x *= serration;
    z *= serration;

    const dist = Math.sqrt(x * x + z * z);
    const y = curl * dist * dist * w * 2;

    positions.push(x, y, z);
    const ce = curl * w * dist;
    normals.push(0, Math.max(0.3, 1 - ce * 2), ce);
    // UV: map radially from center
    uvs.push(0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.4);
  }

  const edgeCount = segs * 2 + 1;
  for (let i = 1; i < edgeCount; i++) {
    indices.push(0, i, i + 1);
  }
  indices.push(0, edgeCount, 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;

  for (const g of geos) {
    totalVerts += g.getAttribute('position').count;
    totalIndices += g.index ? g.index.count : 0;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normalsArr = new Float32Array(totalVerts * 3);
  const uvsArr = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  let vertOffset = 0;
  let posOffset = 0;
  let uvOffset = 0;

  for (const g of geos) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');

    for (let i = 0; i < pos.count * 3; i++) {
      positions[posOffset + i] = (pos.array as Float32Array)[i];
      if (norm) normalsArr[posOffset + i] = (norm.array as Float32Array)[i];
    }

    // UV: copy if present, otherwise default to (0.5, 0.0) — midrib base color
    if (uv) {
      for (let i = 0; i < pos.count * 2; i++) {
        uvsArr[uvOffset + i] = (uv.array as Float32Array)[i];
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        uvsArr[uvOffset + i * 2] = 0.5;     // u = midrib center
        uvsArr[uvOffset + i * 2 + 1] = 0.0; // v = base
      }
    }

    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        indices.push(g.index.array[i] + vertOffset);
      }
    }

    vertOffset += pos.count;
    posOffset += pos.count * 3;
    uvOffset += pos.count * 2;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normalsArr, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvsArr, 2));
  if (indices.length > 0) merged.setIndex(indices);
  return merged;
}

// Shared materials with procedural vein textures
export const leafMaterial = new THREE.MeshStandardMaterial({
  map: getLeafColorTexture(),
  normalMap: getLeafNormalTexture(),
  normalScale: new THREE.Vector2(1.0, 1.0),
  roughness: 0.65,
  metalness: 0.0,
  side: THREE.DoubleSide,
});

export const yellowLeafMaterial = new THREE.MeshStandardMaterial({
  map: getLeafColorTexture(),
  normalMap: getLeafNormalTexture(),
  normalScale: new THREE.Vector2(1.0, 1.0),
  color: 0xcccc80, // yellow tint multiplied with map
  roughness: 0.65,
  metalness: 0.0,
  side: THREE.DoubleSide,
});
