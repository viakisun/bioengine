/** Raw vertex array chunk — engine-agnostic. Wrap with Babylon / Three / Filament / etc. */
export interface GeoChunk {
  positions: number[];   // xyz triples
  normals: number[];     // xyz triples (unit-length)
  uvs: number[];         // uv pairs
  indices: number[];     // triangle list
  colors?: number[];     // optional rgba quads (vertex colors)
}

export function newChunk(): GeoChunk {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

/** Minimal column-major 4x4 matrix — same memory layout as Babylon.Matrix.m */
export type Mat4 = { m: Float32Array };

export const Mat4 = {
  identity(): Mat4 {
    return { m: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
  },
  rotationX(a: number): Mat4 {
    const c = Math.cos(a), s = Math.sin(a);
    return { m: new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]) };
  },
  rotationY(a: number): Mat4 {
    const c = Math.cos(a), s = Math.sin(a);
    return { m: new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]) };
  },
  rotationZ(a: number): Mat4 {
    const c = Math.cos(a), s = Math.sin(a);
    return { m: new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
  },
  translation(x: number, y: number, z: number): Mat4 {
    return { m: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]) };
  },
};

/** Apply a 4x4 transform to all positions + rotate all normals (renormalized). */
export function transformChunk(chunk: GeoChunk, matrix: Mat4) {
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
    const nx = x * m[0] + y * m[4] + z * m[8];
    const ny = x * m[1] + y * m[5] + z * m[9];
    const nz = x * m[2] + y * m[6] + z * m[10];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nrm[i] = nx / len;
    nrm[i + 1] = ny / len;
    nrm[i + 2] = nz / len;
  }
}

export function rotateChunkX(chunk: GeoChunk, angle: number) {
  transformChunk(chunk, Mat4.rotationX(angle));
}
export function rotateChunkY(chunk: GeoChunk, angle: number) {
  transformChunk(chunk, Mat4.rotationY(angle));
}
export function rotateChunkZ(chunk: GeoChunk, angle: number) {
  transformChunk(chunk, Mat4.rotationZ(angle));
}
export function translateChunk(chunk: GeoChunk, x: number, y: number, z: number) {
  transformChunk(chunk, Mat4.translation(x, y, z));
}

export function mergeChunks(chunks: GeoChunk[]): GeoChunk {
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

export function createCylinderChunk(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegs: number,
  heightSegs: number,
  capped = false,
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

  // End caps — disk fan at each pole. Without these, a camera looking
  // into the cylinder end sees an empty pipe (backface-culled interior).
  // Required when the cylinder is rendered with a free end (e.g. leaf
  // petiole base meeting the main stem, fruit pedicel meeting calyx).
  if (capped) {
    // Bottom cap (y = -halfH, normal -Y)
    const bottomCenterIdx = chunk.positions.length / 3;
    chunk.positions.push(0, -halfH, 0);
    chunk.normals.push(0, -1, 0);
    chunk.uvs.push(0.5, 0);
    const bottomRingStart = chunk.positions.length / 3;
    for (let col = 0; col < colCount; col++) {
      const theta = (col / radialSegs) * Math.PI * 2;
      const cx = Math.cos(theta);
      const sx = Math.sin(theta);
      chunk.positions.push(radiusBottom * cx, -halfH, radiusBottom * sx);
      chunk.normals.push(0, -1, 0);
      chunk.uvs.push((cx + 1) * 0.5, (sx + 1) * 0.5);
    }
    for (let col = 0; col < radialSegs; col++) {
      // CCW from below (-Y look direction): center, col+1, col
      chunk.indices.push(bottomCenterIdx, bottomRingStart + col + 1, bottomRingStart + col);
    }

    // Top cap (y = +halfH, normal +Y)
    const topCenterIdx = chunk.positions.length / 3;
    chunk.positions.push(0, halfH, 0);
    chunk.normals.push(0, 1, 0);
    chunk.uvs.push(0.5, 1);
    const topRingStart = chunk.positions.length / 3;
    for (let col = 0; col < colCount; col++) {
      const theta = (col / radialSegs) * Math.PI * 2;
      const cx = Math.cos(theta);
      const sx = Math.sin(theta);
      chunk.positions.push(radiusTop * cx, halfH, radiusTop * sx);
      chunk.normals.push(0, 1, 0);
      chunk.uvs.push((cx + 1) * 0.5, (sx + 1) * 0.5);
    }
    for (let col = 0; col < radialSegs; col++) {
      // CCW from above (+Y look direction): center, col, col+1
      chunk.indices.push(topCenterIdx, topRingStart + col, topRingStart + col + 1);
    }
  }

  return chunk;
}
