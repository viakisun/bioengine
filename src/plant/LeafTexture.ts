import { Scene } from '@babylonjs/core/scene';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';

const TEX_SIZE = 256;

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
  const nu = px / TEX_SIZE;
  const nv = py / TEX_SIZE;
  for (const vein of veins) {
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [bx, by] = bezierPoint(vein, t);
      const dx = nu - bx;
      const dy = nv - by;
      const d = Math.sqrt(dx * dx + dy * dy) * TEX_SIZE;
      const w = vein.width + (vein.widthEnd - vein.width) * t;
      if (d < minDist) {
        minDist = d;
        nearestWidth = w;
      }
    }
  }
  return { dist: minDist, width: nearestWidth };
}

function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, scale: number): number {
  const sx = x / scale, sy = y / scale;
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const a = noise2D(ix, iy);
  const b = noise2D(ix + 1, iy);
  const c = noise2D(ix, iy + 1);
  const d = noise2D(ix + 1, iy + 1);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy;
}

function fbmNoise(x: number, y: number): number {
  return smoothNoise(x, y, 32) * 0.5 + smoothNoise(x, y, 16) * 0.3 + smoothNoise(x, y, 8) * 0.2;
}

function buildColorBytes(): Uint8Array {
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const veins = buildVeinPattern();
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const idx = (py * TEX_SIZE + px) * 4;
      const noise = fbmNoise(px, py);
      const baseR = 35 + noise * 14 - 7;
      const baseG = 95 + noise * 20 - 10;
      const baseB = 22 + noise * 10 - 5;

      const nv = py / TEX_SIZE;
      const edgeDist = Math.min(nv, 1 - nv);
      const edgeDarken = 0.88 + 0.12 * Math.min(1, edgeDist * 4);

      const { dist, width } = veinDistance(px, py, veins);
      const halfW = width * 0.7;
      const veinIntensity = dist < halfW * 4
        ? Math.exp(-(dist * dist) / (2 * halfW * halfW))
        : 0;

      const veinR = 55, veinG = 125, veinB = 40;
      const r = baseR + (veinR - baseR) * veinIntensity;
      const g = baseG + (veinG - baseG) * veinIntensity;
      const b = baseB + (veinB - baseB) * veinIntensity;

      data[idx + 0] = Math.max(0, Math.min(255, r * edgeDarken));
      data[idx + 1] = Math.max(0, Math.min(255, g * edgeDarken));
      data[idx + 2] = Math.max(0, Math.min(255, b * edgeDarken));
      data[idx + 3] = 255;
    }
  }
  return data;
}

function buildNormalBytes(): Uint8Array {
  const veins = buildVeinPattern();
  const heightMap = new Float32Array(TEX_SIZE * TEX_SIZE);

  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const { dist, width } = veinDistance(px, py, veins);
      const sigma = width * 0.5;
      let height = 0;
      if (dist < sigma * 4) {
        height = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      }
      const bump = fbmNoise(px * 1.5, py * 1.5) * 0.15;
      heightMap[py * TEX_SIZE + px] = height + bump;
    }
  }

  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const strength = 3.5;
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const idx = (py * TEX_SIZE + px) * 4;
      const hL = heightMap[py * TEX_SIZE + Math.max(0, px - 1)];
      const hR = heightMap[py * TEX_SIZE + Math.min(TEX_SIZE - 1, px + 1)];
      const hD = heightMap[Math.max(0, py - 1) * TEX_SIZE + px];
      const hU = heightMap[Math.min(TEX_SIZE - 1, py + 1) * TEX_SIZE + px];

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

const cachedColorTex: WeakMap<Scene, RawTexture> = new WeakMap();
const cachedNormalTex: WeakMap<Scene, RawTexture> = new WeakMap();

export function getLeafColorTexture(scene: Scene): RawTexture {
  let tex = cachedColorTex.get(scene);
  if (!tex) {
    const data = buildColorBytes();
    tex = new RawTexture(
      data,
      TEX_SIZE,
      TEX_SIZE,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true, // generateMipMaps
      false, // invertY
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE
    );
    tex.name = 'leafColor';
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    tex.gammaSpace = true;
    cachedColorTex.set(scene, tex);
  }
  return tex;
}

export function getLeafNormalTexture(scene: Scene): RawTexture {
  let tex = cachedNormalTex.get(scene);
  if (!tex) {
    const data = buildNormalBytes();
    tex = new RawTexture(
      data,
      TEX_SIZE,
      TEX_SIZE,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE
    );
    tex.name = 'leafNormal';
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    tex.gammaSpace = false;
    cachedNormalTex.set(scene, tex);
  }
  return tex;
}
