import { Scene } from '@babylonjs/core/scene';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';

const TEX_SIZE = 512;

function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x: number, y: number, scale: number): number {
  const sx = x / scale, sy = y / scale;
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy;
}
function fbm(x: number, y: number): number {
  return smoothNoise(x, y, 64) * 0.5
       + smoothNoise(x, y, 32) * 0.25
       + smoothNoise(x, y, 16) * 0.15
       + smoothNoise(x, y, 8) * 0.1;
}

function buildAlbedoBytes(): Uint8Array {
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const idx = (py * TEX_SIZE + px) * 4;
      const macroNoise = fbm(px, py);
      const microNoise = smoothNoise(px, py, 4) * 0.1;
      // Concrete base 0.55, with mottled variation
      const v = Math.max(0, Math.min(1, 0.5 + (macroNoise - 0.5) * 0.25 + (microNoise - 0.05)));

      // Subtle stain spots (sparse darker patches)
      const stainNoise = smoothNoise(px * 0.5, py * 0.5, 96);
      const stain = stainNoise > 0.78 ? (stainNoise - 0.78) * 1.5 : 0;
      const final = Math.max(0.18, v - stain * 0.25);

      // Concrete tone: warm gray
      data[idx + 0] = Math.floor(final * 215);
      data[idx + 1] = Math.floor(final * 210);
      data[idx + 2] = Math.floor(final * 195);
      data[idx + 3] = 255;
    }
  }
  return data;
}

function buildNormalBytes(): Uint8Array {
  // Build heightmap from noise, derive normal via central diff
  const height = new Float32Array(TEX_SIZE * TEX_SIZE);
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      height[py * TEX_SIZE + px] = fbm(px, py) + smoothNoise(px, py, 4) * 0.3;
    }
  }
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const strength = 2.0;
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const idx = (py * TEX_SIZE + px) * 4;
      const hL = height[py * TEX_SIZE + Math.max(0, px - 1)];
      const hR = height[py * TEX_SIZE + Math.min(TEX_SIZE - 1, px + 1)];
      const hD = height[Math.max(0, py - 1) * TEX_SIZE + px];
      const hU = height[Math.min(TEX_SIZE - 1, py + 1) * TEX_SIZE + px];
      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len; ny /= len; nz /= len;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  return data;
}

const albedoCache = new WeakMap<Scene, RawTexture>();
const normalCache = new WeakMap<Scene, RawTexture>();

export function getGroundAlbedoTexture(scene: Scene): RawTexture {
  let t = albedoCache.get(scene);
  if (!t) {
    t = new RawTexture(
      buildAlbedoBytes(),
      TEX_SIZE,
      TEX_SIZE,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE
    );
    t.name = 'groundAlbedo';
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.uScale = 8;
    t.vScale = 8;
    t.gammaSpace = true;
    albedoCache.set(scene, t);
  }
  return t;
}

export function getGroundNormalTexture(scene: Scene): RawTexture {
  let t = normalCache.get(scene);
  if (!t) {
    t = new RawTexture(
      buildNormalBytes(),
      TEX_SIZE,
      TEX_SIZE,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE
    );
    t.name = 'groundNormal';
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.uScale = 8;
    t.vScale = 8;
    t.gammaSpace = false;
    normalCache.set(scene, t);
  }
  return t;
}
