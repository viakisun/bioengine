// Procedural leaf color + normal map bytes — engine-agnostic.
// Returns raw RGBA Uint8Array; renderer wraps with Babylon RawTexture / etc.

export const LEAF_TEX_SIZE = 256;

interface Vein {
  sx: number; sy: number;
  cx: number; cy: number;
  ex: number; ey: number;
  width: number;
  widthEnd: number;
}

function buildVeinPattern(): Vein[] {
  const veins: Vein[] = [];
  veins.push({ sx: 0, sy: 0.5, cx: 0.5, cy: 0.5, ex: 1, ey: 0.5, width: 6, widthEnd: 2 });
  const pairCount = 6;
  for (let i = 0; i < pairCount; i++) {
    const branchU = 0.10 + i * 0.13;
    for (const side of [-1, 1]) {
      const dx = 0.12 + i * 0.01;
      const dy = side * (0.28 + i * 0.02);
      veins.push({
        sx: branchU, sy: 0.5,
        cx: branchU + dx * 0.5, cy: 0.5 + dy * 0.6,
        ex: branchU + dx, ey: 0.5 + dy,
        width: 3.0 - i * 0.15,
        widthEnd: 0.6,
      });
    }
  }
  return veins;
}

function bezierPoint(v: Vein, t: number): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * v.sx + 2 * mt * t * v.cx + t * t * v.ex,
    mt * mt * v.sy + 2 * mt * t * v.cy + t * t * v.ey,
  ];
}

function veinDistance(px: number, py: number, veins: Vein[]): { dist: number; width: number } {
  let minDist = Infinity;
  let nearestWidth = 1;
  const nu = px / LEAF_TEX_SIZE;
  const nv = py / LEAF_TEX_SIZE;
  for (const vein of veins) {
    // 20 was visible as a "string of beads" along each vein — each sample
    // point produced a small intensity peak, the gaps between dipped, and
    // close zoom made the dots pop. 64 makes the gap between samples
    // sub-pixel at 256² so the field reads as a continuous curve.
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [bx, by] = bezierPoint(vein, t);
      const dx = nu - bx;
      const dy = nv - by;
      const d = Math.sqrt(dx * dx + dy * dy) * LEAF_TEX_SIZE;
      const w = vein.width + (vein.widthEnd - vein.width) * t;
      if (d < minDist) {
        minDist = d;
        nearestWidth = w;
      }
    }
  }
  return { dist: minDist, width: nearestWidth };
}

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, scale: number): number {
  const sx = x / scale, sy = y / scale;
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy;
}

function fbmNoise(x: number, y: number): number {
  return smoothNoise(x, y, 32) * 0.5 + smoothNoise(x, y, 16) * 0.3 + smoothNoise(x, y, 8) * 0.2;
}

/**
 * Procedural tomato leaf RGBA bytes (rich green + Bezier veins + edge darkening).
 * Optional `diseaseLoad` (0–1) overlays brown spots via Perlin threshold.
 */
export function buildLeafColorBytes(diseaseLoad = 0): Uint8Array {
  const data = new Uint8Array(LEAF_TEX_SIZE * LEAF_TEX_SIZE * 4);
  const veins = buildVeinPattern();
  for (let py = 0; py < LEAF_TEX_SIZE; py++) {
    for (let px = 0; px < LEAF_TEX_SIZE; px++) {
      const idx = (py * LEAF_TEX_SIZE + px) * 4;
      const noise = fbmNoise(px, py);
      const baseR = 35 + noise * 14 - 7;
      const baseG = 95 + noise * 20 - 10;
      const baseB = 22 + noise * 10 - 5;

      const nv = py / LEAF_TEX_SIZE;
      const edgeDist = Math.min(nv, 1 - nv);
      const edgeDarken = 0.88 + 0.12 * Math.min(1, edgeDist * 4);

      const { dist, width } = veinDistance(px, py, veins);
      const halfW = width * 0.7;
      const veinIntensity = dist < halfW * 4
        ? Math.exp(-(dist * dist) / (2 * halfW * halfW))
        : 0;

      const veinR = 55, veinG = 125, veinB = 40;
      let r = baseR + (veinR - baseR) * veinIntensity;
      let g = baseG + (veinG - baseG) * veinIntensity;
      let b = baseB + (veinB - baseB) * veinIntensity;

      // Disease overlay — brown spots when high-frequency noise > threshold
      if (diseaseLoad > 0.05) {
        const spotNoise = smoothNoise(px, py, 5);
        const threshold = 0.85 - diseaseLoad * 0.3; // higher load → lower threshold = more spots
        if (spotNoise > threshold) {
          const spotStrength = Math.min(1, (spotNoise - threshold) / 0.15);
          // Brown spot color
          r = r * (1 - spotStrength) + 95 * spotStrength;
          g = g * (1 - spotStrength) + 58 * spotStrength;
          b = b * (1 - spotStrength) + 20 * spotStrength;
        }
      }

      data[idx + 0] = Math.max(0, Math.min(255, r * edgeDarken));
      data[idx + 1] = Math.max(0, Math.min(255, g * edgeDarken));
      data[idx + 2] = Math.max(0, Math.min(255, b * edgeDarken));
      data[idx + 3] = 255;
    }
  }
  return data;
}

/** Procedural normal map from vein-derived heightmap (central diff). */
export function buildLeafNormalBytes(): Uint8Array {
  const veins = buildVeinPattern();
  const heightMap = new Float32Array(LEAF_TEX_SIZE * LEAF_TEX_SIZE);

  for (let py = 0; py < LEAF_TEX_SIZE; py++) {
    for (let px = 0; px < LEAF_TEX_SIZE; px++) {
      const { dist, width } = veinDistance(px, py, veins);
      const sigma = width * 0.5;
      let height = 0;
      if (dist < sigma * 4) {
        height = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      }
      const bump = fbmNoise(px * 1.5, py * 1.5) * 0.15;
      heightMap[py * LEAF_TEX_SIZE + px] = height + bump;
    }
  }

  const data = new Uint8Array(LEAF_TEX_SIZE * LEAF_TEX_SIZE * 4);
  const strength = 3.5;
  for (let py = 0; py < LEAF_TEX_SIZE; py++) {
    for (let px = 0; px < LEAF_TEX_SIZE; px++) {
      const idx = (py * LEAF_TEX_SIZE + px) * 4;
      const hL = heightMap[py * LEAF_TEX_SIZE + Math.max(0, px - 1)];
      const hR = heightMap[py * LEAF_TEX_SIZE + Math.min(LEAF_TEX_SIZE - 1, px + 1)];
      const hD = heightMap[Math.max(0, py - 1) * LEAF_TEX_SIZE + px];
      const hU = heightMap[Math.min(LEAF_TEX_SIZE - 1, py + 1) * LEAF_TEX_SIZE + px];

      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len; ny /= len; nz /= len;

      data[idx + 0] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  return data;
}
