import * as THREE from 'three';

/**
 * Procedural tomato leaf vein texture generator.
 * Creates color map + normal map as CanvasTexture (256×256).
 * Generated once at startup, cached as singletons, shared across all leaf materials.
 */

const TEX_SIZE = 256;

// --- Vein pattern definition ---
interface Vein {
  // Quadratic bezier: start → control → end (in UV space 0-1)
  sx: number; sy: number;
  cx: number; cy: number;
  ex: number; ey: number;
  width: number;     // pixel width at start
  widthEnd: number;  // pixel width at end
}

function buildVeinPattern(): Vein[] {
  const veins: Vein[] = [];

  // Midrib: runs along u=center (v=0.5 in texture), from base (u=0) to tip (u=1)
  veins.push({
    sx: 0.0, sy: 0.5,
    cx: 0.5, cy: 0.5,
    ex: 1.0, ey: 0.5,
    width: 6, widthEnd: 2,
  });

  // Secondary veins: 6 pairs branching from midrib
  const pairCount = 6;
  for (let i = 0; i < pairCount; i++) {
    const branchU = 0.10 + i * 0.13; // position along midrib
    // Angle variation: ~40-50°
    const angleDeg = 43 + (i % 3) * 3;
    const angleRad = angleDeg * Math.PI / 180;

    for (const side of [-1, 1]) {
      const dx = 0.12 + i * 0.01; // length along u
      const dy = side * (0.28 + i * 0.02); // spread across v

      // Bezier curve: from midrib, curves toward leaf tip & edge
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

/** Evaluate quadratic bezier at parameter t (0-1) */
function bezierPoint(v: Vein, t: number): [number, number] {
  const mt = 1 - t;
  const x = mt * mt * v.sx + 2 * mt * t * v.cx + t * t * v.ex;
  const y = mt * mt * v.sy + 2 * mt * t * v.cy + t * t * v.ey;
  return [x, y];
}

/** Compute minimum distance from pixel (px, py) to any vein, and the vein width at that point */
function veinDistance(
  px: number, py: number, veins: Vein[], texSize: number,
): { dist: number; width: number } {
  let minDist = Infinity;
  let nearestWidth = 1;

  const nu = px / texSize;
  const nv = py / texSize;

  for (const vein of veins) {
    // Sample bezier at intervals
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [bx, by] = bezierPoint(vein, t);
      const dx = nu - bx;
      const dy = nv - by;
      const d = Math.sqrt(dx * dx + dy * dy) * texSize;
      const w = vein.width + (vein.widthEnd - vein.width) * t;
      // Normalized distance relative to vein width
      if (d < minDist) {
        minDist = d;
        nearestWidth = w;
      }
    }
  }

  return { dist: minDist, width: nearestWidth };
}

// Simple hash-based noise for surface variation
function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, scale: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  // Bilinear interpolation
  const a = noise2D(ix, iy);
  const b = noise2D(ix + 1, iy);
  const c = noise2D(ix, iy + 1);
  const d = noise2D(ix + 1, iy + 1);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy;
}

function fbmNoise(x: number, y: number): number {
  return smoothNoise(x, y, 32) * 0.5
       + smoothNoise(x, y, 16) * 0.3
       + smoothNoise(x, y, 8) * 0.2;
}

// --- Color Map Generation ---
function generateColorMap(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;

  const veins = buildVeinPattern();
  const imageData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  const data = imageData.data;

  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const idx = (py * TEX_SIZE + px) * 4;

      // Base leaf color: realistic tomato leaf green (Solanum lycopersicum)
      // Real tomato leaves: rich green upper surface, chlorophyll-rich
      // Not too dark (would look black under shadow) nor too bright (would look fake)
      const noise = fbmNoise(px, py);
      const baseR = 35 + noise * 14 - 7;
      const baseG = 95 + noise * 20 - 10;
      const baseB = 22 + noise * 10 - 5;

      // Subtle edge shading
      const nv = py / TEX_SIZE;
      const edgeDist = Math.min(nv, 1 - nv);
      const edgeDarken = 0.88 + 0.12 * Math.min(1, edgeDist * 4);

      // Vein proximity
      const { dist, width } = veinDistance(px, py, veins, TEX_SIZE);
      const halfW = width * 0.7;

      // Gaussian vein intensity — sharper falloff for visible veins
      const veinIntensity = dist < halfW * 4
        ? Math.exp(-(dist * dist) / (2 * halfW * halfW))
        : 0;

      // Vein color: slightly lighter green — real veins are only subtly lighter
      const veinR = 55;
      const veinG = 125;
      const veinB = 40;

      // Blend base with vein
      const r = baseR + (veinR - baseR) * veinIntensity;
      const g = baseG + (veinG - baseG) * veinIntensity;
      const b = baseB + (veinB - baseB) * veinIntensity;

      data[idx + 0] = Math.max(0, Math.min(255, r * edgeDarken));
      data[idx + 1] = Math.max(0, Math.min(255, g * edgeDarken));
      data[idx + 2] = Math.max(0, Math.min(255, b * edgeDarken));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// --- Normal Map Generation ---
function generateNormalMap(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;

  const veins = buildVeinPattern();

  // First pass: generate height map
  const heightMap = new Float32Array(TEX_SIZE * TEX_SIZE);
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const { dist, width } = veinDistance(px, py, veins, TEX_SIZE);
      const sigma = width * 0.5;

      // Vein ridge height (gaussian profile)
      let height = 0;
      if (dist < sigma * 4) {
        height = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      }

      // Subtle surface bumps between veins
      const bump = fbmNoise(px * 1.5, py * 1.5) * 0.15;
      heightMap[py * TEX_SIZE + px] = height + bump;
    }
  }

  // Second pass: compute normals from height map via central differencing
  const imageData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  const data = imageData.data;
  const strength = 3.5; // normal map intensity — higher for visible vein relief

  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const idx = (py * TEX_SIZE + px) * 4;

      // Sample height neighbors (clamped at edges)
      const hL = heightMap[py * TEX_SIZE + Math.max(0, px - 1)];
      const hR = heightMap[py * TEX_SIZE + Math.min(TEX_SIZE - 1, px + 1)];
      const hD = heightMap[Math.max(0, py - 1) * TEX_SIZE + px];
      const hU = heightMap[Math.min(TEX_SIZE - 1, py + 1) * TEX_SIZE + px];

      // Central difference → tangent-space normal
      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      let nz = 1.0;

      // Normalize
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;

      // Encode to RGB: [-1,1] → [0,255]
      data[idx + 0] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// --- Singleton cache ---
let cachedColorTex: THREE.CanvasTexture | null = null;
let cachedNormalTex: THREE.CanvasTexture | null = null;

export function getLeafColorTexture(): THREE.CanvasTexture {
  if (!cachedColorTex) {
    const canvas = generateColorMap();
    cachedColorTex = new THREE.CanvasTexture(canvas);
    cachedColorTex.wrapS = THREE.ClampToEdgeWrapping;
    cachedColorTex.wrapT = THREE.ClampToEdgeWrapping;
    cachedColorTex.minFilter = THREE.LinearMipmapLinearFilter;
    cachedColorTex.magFilter = THREE.LinearFilter;
    cachedColorTex.colorSpace = THREE.SRGBColorSpace;
  }
  return cachedColorTex;
}

export function getLeafNormalTexture(): THREE.CanvasTexture {
  if (!cachedNormalTex) {
    const canvas = generateNormalMap();
    cachedNormalTex = new THREE.CanvasTexture(canvas);
    cachedNormalTex.wrapS = THREE.ClampToEdgeWrapping;
    cachedNormalTex.wrapT = THREE.ClampToEdgeWrapping;
    cachedNormalTex.minFilter = THREE.LinearMipmapLinearFilter;
    cachedNormalTex.magFilter = THREE.LinearFilter;
  }
  return cachedNormalTex;
}
