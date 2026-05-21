import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { SeededRandom } from '@farmsim/tomato-engine';
import { getLeafColorTexture, getLeafNormalTexture } from './LeafTexture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { NodeState } from '@farmsim/tomato-engine';
import type { PlantGenome } from '@farmsim/tomato-engine';

export interface LeafShapeParams {
  serrationDepth: number;
  serrationFreq: number;
  lobeDepth: number;
  waviness: number;
  petioleLength: number;
}

const DEFAULT_LEAF_PARAMS: LeafShapeParams = {
  serrationDepth: 0.18,
  serrationFreq: 10,
  lobeDepth: 0.08,
  waviness: 0.003,
  petioleLength: 0.08,
};

interface GeoChunk {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function newChunk(): GeoChunk {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function transformChunk(chunk: GeoChunk, matrix: Matrix) {
  const m = matrix.m;
  const pos = chunk.positions;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    pos[i] = x * m[0] + y * m[4] + z * m[8] + m[12];
    pos[i + 1] = x * m[1] + y * m[5] + z * m[9] + m[13];
    pos[i + 2] = x * m[2] + y * m[6] + z * m[10] + m[14];
  }
  const nrm = chunk.normals;
  for (let i = 0; i < nrm.length; i += 3) {
    const x = nrm[i], y = nrm[i + 1], z = nrm[i + 2];
    let nx = x * m[0] + y * m[4] + z * m[8];
    let ny = x * m[1] + y * m[5] + z * m[9];
    let nz = x * m[2] + y * m[6] + z * m[10];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nrm[i] = nx / len;
    nrm[i + 1] = ny / len;
    nrm[i + 2] = nz / len;
  }
}

function rotateZ(chunk: GeoChunk, angle: number) {
  transformChunk(chunk, Matrix.RotationZ(angle));
}
function rotateY(chunk: GeoChunk, angle: number) {
  transformChunk(chunk, Matrix.RotationY(angle));
}
function rotateX(chunk: GeoChunk, angle: number) {
  transformChunk(chunk, Matrix.RotationX(angle));
}
function translate(chunk: GeoChunk, x: number, y: number, z: number) {
  transformChunk(chunk, Matrix.Translation(x, y, z));
}

function createCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegs: number,
  heightSegs: number
): GeoChunk {
  const chunk = newChunk();
  const halfH = height / 2;
  const ringCount = heightSegs + 1;
  const colCount = radialSegs + 1;

  for (let ring = 0; ring < ringCount; ring++) {
    const t = ring / heightSegs;
    const y = -halfH + t * height;
    const radius = radiusBottom + (radiusTop - radiusBottom) * t;
    for (let col = 0; col < colCount; col++) {
      const theta = (col / radialSegs) * Math.PI * 2;
      const cx = Math.cos(theta);
      const sx = Math.sin(theta);
      chunk.positions.push(radius * cx, y, radius * sx);
      chunk.normals.push(cx, 0, sx);
      chunk.uvs.push(col / radialSegs, t);
    }
  }

  for (let ring = 0; ring < heightSegs; ring++) {
    for (let col = 0; col < radialSegs; col++) {
      const a = ring * colCount + col;
      const b = a + 1;
      const c = a + colCount;
      const d = c + 1;
      chunk.indices.push(a, c, b, b, c, d);
    }
  }
  return chunk;
}

function mergeChunks(chunks: GeoChunk[]): GeoChunk {
  const merged = newChunk();
  let vertexOffset = 0;
  for (const c of chunks) {
    merged.positions.push(...c.positions);
    merged.normals.push(...c.normals);
    merged.uvs.push(...c.uvs);
    for (const idx of c.indices) merged.indices.push(idx + vertexOffset);
    vertexOffset += c.positions.length / 3;
  }
  return merged;
}

function applyChunkToMesh(chunk: GeoChunk, mesh: Mesh) {
  const vd = new VertexData();
  vd.positions = chunk.positions;
  vd.normals = chunk.normals;
  vd.uvs = chunk.uvs;
  vd.indices = chunk.indices;
  vd.applyToMesh(mesh);
}

export function createLeafMesh(
  name: string,
  scene: Scene,
  leafletCount: number,
  sizeFactor: number,
  maturity: number,
  curl: number,
  rng: SeededRandom,
  shapeParams?: LeafShapeParams,
  ageFrac?: number
): Mesh {
  const chunk = buildLeafChunk(leafletCount, sizeFactor, maturity, curl, rng, shapeParams, ageFrac);
  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh);
  return mesh;
}

/**
 * Build a leaf mesh driven directly by GrowthEngine output (NodeState + PlantGenome).
 *
 * Wires the engine's detailed biology into the geometry:
 *   - node.leafSizeFactor + leafMaturity → mesh scale and expansion
 *   - node.leafletCount                  → compound-leaf complexity
 *   - node.droopExtra (degrees, 0–120)   → petiole + rachis gravity sag
 *   - node.age                           → cumulative gravity / waviness aging
 *   - genome.leafSerrationDepth/Freq, leafLobeDepth, leafWaviness, leafPetioleLength
 *     → per-plant shape signature (62-param genome) instead of defaults
 */
export function createLeafMeshFromNode(
  name: string,
  scene: Scene,
  node: NodeState,
  genome: PlantGenome,
  rng: SeededRandom
): Mesh {
  if (node.leafMaturity < 0.01) {
    // Pruned or not yet emerged — return an empty mesh
    return new Mesh(name, scene);
  }

  const shapeParams: LeafShapeParams = {
    serrationDepth: genome.leafSerrationDepth,
    serrationFreq: genome.leafSerrationFreq,
    lobeDepth: genome.leafLobeDepth,
    waviness: genome.leafWaviness,
    petioleLength: genome.leafPetioleLength,
  };

  // droopExtra is in degrees (0–120). Convert to the [0..1] ageFrac
  // that drives gravity curves inside buildLeafChunk. droop ~ age.
  const ageFracFromDroop = Math.min(1, node.droopExtra / 120);
  // Combine with raw age so very old leaves still age visually even
  // with light loads.
  const ageFromAge = Math.min(1, node.age / 80);
  const ageFrac = Math.max(ageFracFromDroop, ageFromAge);

  // curl: leaves curl slightly more as they yellow/senesce
  const curl = 0.12 + node.yellowing * 0.15;

  const chunk = buildLeafChunk(
    node.leafletCount,
    node.leafSizeFactor * genome.leafSizeMultiplier,
    node.leafMaturity,
    curl,
    rng,
    shapeParams,
    ageFrac
  );
  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh);
  return mesh;
}

export function buildLeafChunk(
  leafletCount: number,
  sizeFactor: number,
  maturity: number,
  curl: number,
  rng: SeededRandom,
  shapeParams?: LeafShapeParams,
  ageFrac?: number
): GeoChunk {
  const params = shapeParams ?? DEFAULT_LEAF_PARAMS;
  const af = ageFrac ?? 0;
  const chunks: GeoChunk[] = [];

  const petioleLen = params.petioleLength * sizeFactor * maturity;
  const rachisLen = 0.32 * sizeFactor * maturity;
  const pairs = Math.floor(leafletCount / 2);

  const petioleBaseRadius = 0.0018 * sizeFactor;
  const petioleTipRadius = 0.0012 * sizeFactor;
  const petiole = createCylinder(petioleTipRadius, petioleBaseRadius, petioleLen, 5, 6);
  rotateZ(petiole, -Math.PI / 2);
  translate(petiole, petioleLen / 2, 0, 0);

  for (let v = 0; v < petiole.positions.length; v += 3) {
    const x = petiole.positions[v];
    const t = x / petioleLen;
    const archStrength = 0.03 * (1 - af * 4.0);
    const archY = Math.sin(t * Math.PI) * petioleLen * archStrength;
    const gravityY = -t * t * t * petioleLen * (0.08 + af * 0.35);
    petiole.positions[v + 1] += archY + gravityY;
  }
  chunks.push(petiole);

  const rachisBaseRadius = 0.0010 * sizeFactor;
  const rachisTipRadius = 0.0005 * sizeFactor;
  const rachis = createCylinder(rachisTipRadius, rachisBaseRadius, rachisLen, 4, 8);
  rotateZ(rachis, -Math.PI / 2);
  translate(rachis, petioleLen + rachisLen / 2, 0, 0);
  const rachisDroopFactor = 0.12 + af * 0.45;
  for (let v = 0; v < rachis.positions.length; v += 3) {
    const x = rachis.positions[v];
    const t = (x - petioleLen) / rachisLen;
    if (t >= 0 && t <= 1) {
      rachis.positions[v + 1] -= t * t * rachisLen * rachisDroopFactor;
    }
  }
  chunks.push(rachis);

  for (let i = 0; i <= pairs; i++) {
    const t = pairs === 0 ? 0.7 : 0.15 + 0.75 * (i / pairs);
    const posAlongRachis = petioleLen + rachisLen * t;
    const yOff = -t * t * rachisLen * rachisDroopFactor;

    const isTerminal = i === pairs;
    const baseSizeMod = isTerminal ? 1.2 : 0.5 + 0.5 * Math.sin(t * Math.PI);
    const expansionScale = maturity * maturity;
    const leafletSize = 0.12 * sizeFactor * expansionScale * baseSizeMod * rng.range(0.8, 1.2);

    const leafletDroopRange = 0.14 + af * 0.48;
    const leafletTwistRange = 0.08 + af * 0.28;

    if (isTerminal) {
      const leaflet = createOvateLeaflet(leafletSize, curl * rng.range(0.7, 1.3), rng, params, true);
      rotateZ(leaflet, rng.range(-leafletDroopRange * 0.5, leafletDroopRange * 0.3));
      rotateX(leaflet, rng.range(-leafletTwistRange, leafletTwistRange));
      translate(leaflet, posAlongRachis, yOff, 0);
      chunks.push(leaflet);
    } else {
      for (const side of [-1, 1]) {
        const leaflet = createOvateLeaflet(
          leafletSize * rng.range(0.85, 1.15),
          curl * rng.range(0.5, 1.5),
          rng,
          params,
          false
        );
        rotateY(leaflet, side * rng.range(0.35, 0.65));
        rotateZ(leaflet, -Math.abs(rng.gaussian(0, leafletDroopRange)));
        rotateX(leaflet, rng.gaussian(0, leafletTwistRange));
        translate(leaflet, posAlongRachis, yOff, side * 0.025 * baseSizeMod);
        chunks.push(leaflet);

        const petioluleLen = 0.008 * baseSizeMod;
        const petiolule = createCylinder(0.0004 * sizeFactor, 0.0006 * sizeFactor, petioluleLen, 3, 1);
        rotateX(petiolule, Math.PI / 2);
        translate(petiolule, posAlongRachis, yOff, side * petioluleLen * 0.5);
        chunks.push(petiolule);
      }

      if (i < pairs && rng.next() > 0.3) {
        const interT = t + 0.5 / (pairs + 1) * 0.75;
        const interPos = petioleLen + rachisLen * interT;
        const interYOff = -interT * interT * rachisLen * rachisDroopFactor;
        const interSize = leafletSize * 0.35 * rng.range(0.7, 1.3);
        for (const side of [-1, 1]) {
          if (rng.next() > 0.4) {
            const small = createOvateLeaflet(interSize, curl * rng.range(0.3, 1.0), rng, params, false);
            rotateY(small, side * rng.range(0.4, 0.8));
            rotateZ(small, -Math.abs(rng.gaussian(0, leafletDroopRange * 0.7)));
            translate(small, interPos, interYOff, side * 0.015);
            chunks.push(small);
          }
        }
      }
    }
  }

  return mergeChunks(chunks);
}

function createOvateLeaflet(
  size: number,
  curl: number,
  rng: SeededRandom,
  params: LeafShapeParams,
  isTerminal: boolean
): GeoChunk {
  const length = size;
  const maxWidth = size * 0.55;
  const lengthSegs = 12;
  const widthSegs = 4;
  const cols = widthSegs * 2 + 1;

  const chunk = newChunk();

  for (let row = 0; row <= lengthSegs; row++) {
    const t = row / lengthSegs;
    let widthFactor: number;
    if (t < 0.4) {
      widthFactor = Math.sin((t / 0.4) * Math.PI * 0.5);
    } else {
      const tNorm = (t - 0.4) / 0.6;
      widthFactor = Math.cos(tNorm * Math.PI * 0.5) * (1 - tNorm * 0.3);
    }

    const lobeModulation = 1 - params.lobeDepth * Math.sin(t * Math.PI * 3) * Math.max(0, 1 - t * 1.5);
    const rowWidth = maxWidth * widthFactor * lobeModulation;
    const rowX = t * length;

    for (let col = 0; col < cols; col++) {
      const colNorm = (col / (cols - 1)) * 2 - 1;
      const absCol = Math.abs(colNorm);

      let z = colNorm * rowWidth;

      if (absCol > 0.6 && t > 0.05 && t < 0.95) {
        const serrationPhase = t * params.serrationFreq * Math.PI * 2 + rng.next() * 0.5;
        const toothShape = Math.max(0, Math.sin(serrationPhase));
        const serrationAmp = rowWidth * params.serrationDepth * absCol;
        z += Math.sign(colNorm) * toothShape * serrationAmp;
      }

      const dist = Math.sqrt(rowX * rowX + z * z) / size;
      let y = curl * dist * dist * size * 3;

      if (params.waviness > 0) {
        y += params.waviness * Math.sin(rowX * 40) * Math.sin(z * 60) * (1 - absCol * 0.5);
      }

      const midribHeight = 0.002 * (1 - absCol * absCol) * size * 10;
      y += midribHeight;

      chunk.positions.push(rowX, y, z);

      const u = t;
      const v = col / (cols - 1);
      chunk.uvs.push(u, v);

      const curlEffect = curl * size * dist;
      const ny = 1 - curlEffect * 2;
      chunk.normals.push(0, Math.max(0.3, ny), curlEffect * Math.sign(z || 0.01));
    }
  }

  for (let row = 0; row < lengthSegs; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      chunk.indices.push(a, c, b, b, c, d);
    }
  }

  if (isTerminal && size > 0.03) {
    for (const side of [-1, 1]) {
      const lobe = createSmallLobe(size * 0.3, curl, rng, params);
      rotateY(lobe, side * 0.6);
      translate(lobe, size * 0.35, 0, side * maxWidth * 0.6);
      const baseVertex = chunk.positions.length / 3;
      chunk.positions.push(...lobe.positions);
      chunk.normals.push(...lobe.normals);
      chunk.uvs.push(...lobe.uvs);
      for (const idx of lobe.indices) chunk.indices.push(idx + baseVertex);
    }
  }

  return chunk;
}

function createSmallLobe(
  size: number,
  curl: number,
  rng: SeededRandom,
  params: LeafShapeParams
): GeoChunk {
  const segs = 6;
  const w = size;
  const h = size * 0.5;
  const chunk = newChunk();

  chunk.positions.push(0, 0, 0);
  chunk.normals.push(0, 1, 0);
  chunk.uvs.push(0.5, 0.5);

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

    chunk.positions.push(x, y, z);
    const ce = curl * w * dist;
    chunk.normals.push(0, Math.max(0.3, 1 - ce * 2), ce);
    chunk.uvs.push(0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.4);
  }

  const edgeCount = segs * 2 + 1;
  for (let i = 1; i < edgeCount; i++) {
    chunk.indices.push(0, i, i + 1);
  }
  chunk.indices.push(0, edgeCount, 1);
  return chunk;
}

let cachedLeafMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();
let cachedYellowLeafMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();

export function getLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedLeafMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('leafMat', scene);
    mat.albedoColor = new Color3(1, 1, 1);
    mat.albedoTexture = getLeafColorTexture(scene);
    mat.bumpTexture = getLeafNormalTexture(scene);
    mat.invertNormalMapY = false;
    mat.invertNormalMapX = false;
    mat.metallic = 0.0;
    mat.roughness = 0.6;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mat.environmentIntensity = 0.6;

    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.45;
    mat.subSurface.tintColor = Color3.FromHexString('#2a6818');
    mat.subSurface.minimumThickness = 0.1;
    mat.subSurface.maximumThickness = 0.4;

    cachedLeafMaterial.set(scene, mat);
  }
  return mat;
}

export function getYellowLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedYellowLeafMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('yellowLeafMat', scene);
    mat.albedoTexture = getLeafColorTexture(scene);
    mat.bumpTexture = getLeafNormalTexture(scene);
    mat.albedoColor = Color3.FromHexString('#cccc80');
    mat.metallic = 0.0;
    mat.roughness = 0.6;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mat.environmentIntensity = 0.5;

    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.6;
    mat.subSurface.tintColor = Color3.FromHexString('#a89030');

    cachedYellowLeafMaterial.set(scene, mat);
  }
  return mat;
}
