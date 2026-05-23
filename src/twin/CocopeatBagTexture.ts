/**
 * Procedural textures for the cocopeat grow-bag visualization.
 *
 *   • getCocopeatBagTexture     — 1024×256 white plastic with green
 *                                 "COCOPEAT GROW BAG" / "BIO GROW DUO"
 *                                 / "SJ CORP" print + crinkle noise.
 *   • getCocopeatSubstrateTexture — 512×512 fibrous coir noise.
 *   • getCocopeatSubstrateNormal  — 256×256 bump map for the coir.
 *
 * All three use OffscreenCanvas (or HTMLCanvas) for 2D drawing then
 * upload via RawTexture, matching the LeafTexture/GroundTexture
 * patterns. Scene-keyed WeakMap caches so they survive React strict
 * mode + scene recreates without leaking.
 */

import { Scene } from '@babylonjs/core/scene';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';

const cachedBagTex = new WeakMap<Scene, RawTexture>();
const cachedSubAlbedo = new WeakMap<Scene, RawTexture>();
const cachedSubNormal = new WeakMap<Scene, RawTexture>();

// === Helpers (FBM noise — adapted from GroundTexture pattern) ===
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number, octaves: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += smoothNoise(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

// === Helper: get a 2D drawing context (Offscreen or HTMLCanvas) ===
function makeCanvas(w: number, h: number): {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  toBytes: () => Uint8Array;
} {
  // willReadFrequently=true hints the browser to keep the canvas backing
  // store CPU-side, so the subsequent getImageData() doesn't trigger a
  // GPU↔CPU readback every call (we draw + immediately read).
  if (typeof OffscreenCanvas !== 'undefined') {
    const can = new OffscreenCanvas(w, h);
    const ctx = can.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!ctx) throw new Error('No 2D context on OffscreenCanvas');
    return {
      ctx,
      toBytes: () => new Uint8Array(ctx.getImageData(0, 0, w, h).data),
    };
  }
  const can = document.createElement('canvas');
  can.width = w;
  can.height = h;
  const ctx = can.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No 2D context on HTMLCanvasElement');
  return {
    ctx,
    toBytes: () => new Uint8Array(ctx.getImageData(0, 0, w, h).data),
  };
}

// === Bag texture (white plastic with green print) ===
export function getCocopeatBagTexture(scene: Scene): RawTexture {
  let tex = cachedBagTex.get(scene);
  if (!tex) {
    const W = 1024;
    const H = 256;
    const { ctx, toBytes } = makeCanvas(W, H);

    // Base mid-beige (was #f8f5ed off-white — too bright, looked like
    // ceramic tile from above. Real cocopeat bags are slightly tinted by
    // substrate stains + greenhouse dust.)
    ctx.fillStyle = '#e0d8c3';
    ctx.fillRect(0, 0, W, H);

    // FBM mottling — per-pixel blend between #e0d8c3 and #c4b89a
    const img = ctx.getImageData(0, 0, W, H);
    const data = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = fbm(x / 60, y / 60, 4);
        const t = (n - 0.4) * 0.6; // recenter, attenuate
        const k = Math.max(0, Math.min(1, 0.5 + t));
        // e0d8c3 → c4b89a
        const r = 0xe0 + (0xc4 - 0xe0) * k;
        const g = 0xd8 + (0xb8 - 0xd8) * k;
        const b = 0xc3 + (0x9a - 0xc3) * k;
        const idx = (y * W + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Crinkle highlights — horizontal sweeping streaks
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const cy = (i / 40) * H + Math.sin(i * 1.7) * 8;
      const phase = i * 0.6;
      ctx.globalAlpha = 0.07 + (i % 3) * 0.04;
      ctx.fillStyle = '#ffffff';
      for (let x = 0; x < W; x += 2) {
        const stripeY = cy + Math.cos((x / W) * Math.PI * 2 + phase) * 2;
        ctx.fillRect(x, stripeY, 2, 1);
      }
    }
    ctx.restore();

    // Green print — "COCOPEAT" / "GROW BAG" / "BIO GROW DUO" / "SJ CORP"
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = '#2d8a3d';
    ctx.font = 'bold 60px sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('COCOPEAT', 50, 90);
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#246a30';
    ctx.fillText('GROW BAG', 60, 135);

    ctx.fillStyle = '#1f6b2c';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('BIO GROW DUO', 540, 110);

    ctx.fillStyle = '#7a7670';
    ctx.font = '22px sans-serif';
    ctx.fillText('SJ CORP · cocopeat grow bag', 540, 145);

    // 5 cutout marker rectangles — disguise the seam between the
    // printed bag edges and the geometric hole openings.
    ctx.strokeStyle = '#9a9590';
    ctx.lineWidth = 1.5;
    // Holes at relative-x offsets [-0.4, -0.2, 0, +0.2, +0.4] from bag
    // center; bag's u=[0,1] spans -halfL..+halfL → hole u = 0.1, 0.3,
    // 0.5, 0.7, 0.9. Mark each with a faint square.
    const markerW = 90;
    const markerH = 90;
    for (const uCenter of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const mx = uCenter * W - markerW / 2;
      const my = H * 0.55 - markerH / 2;
      ctx.strokeRect(mx, my, markerW, markerH);
    }
    ctx.restore();

    const bytes = toBytes();
    tex = new RawTexture(
      bytes,
      W,
      H,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 8;
    cachedBagTex.set(scene, tex);
  }
  return tex;
}

// === Substrate albedo (brown fibrous coir) ===
export function getCocopeatSubstrateTexture(scene: Scene): RawTexture {
  let tex = cachedSubAlbedo.get(scene);
  if (!tex) {
    const W = 512;
    const H = 512;
    const { ctx, toBytes } = makeCanvas(W, H);

    // Cocopeat base — warmer / lighter tan than wet peat. Reference
    // photo's cocopeat reads as #5e4225 on a light-theme background;
    // wet peat (#3a2618) was too dark and the holes turned into ink
    // dots from camera distance.
    ctx.fillStyle = '#5e4225';
    ctx.fillRect(0, 0, W, H);

    // Multi-scale FBM
    const img = ctx.getImageData(0, 0, W, H);
    const data = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const macro = fbm(x / 80, y / 80, 3);
        const mid = fbm(x / 20, y / 20, 3);
        const fine = fbm(x / 4, y / 4, 2);
        const t = macro * 0.45 + mid * 0.35 + fine * 0.20;

        // Default warm tan
        let r = 0x5e, g = 0x42, b = 0x25;
        if (t > 0.62) {
          // Lighter fiber
          const k = Math.min(1, (t - 0.62) / 0.38);
          r = 0x5e + (0x8a - 0x5e) * k;
          g = 0x42 + (0x66 - 0x42) * k;
          b = 0x25 + (0x40 - 0x25) * k;
        } else if (t < 0.30) {
          // Wet pocket darker
          const k = Math.min(1, (0.30 - t) / 0.30);
          r = 0x5e + (0x36 - 0x5e) * k;
          g = 0x42 + (0x24 - 0x42) * k;
          b = 0x25 + (0x14 - 0x25) * k;
        }
        const idx = (y * W + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // 150 fine fiber strokes
    ctx.save();
    ctx.strokeStyle = '#8a6840';
    ctx.lineWidth = 1;
    for (let i = 0; i < 150; i++) {
      const sx = hash(i, 1) * W;
      const sy = hash(i, 2) * H;
      const ang = hash(i, 3) * Math.PI * 2;
      const len = 18 + hash(i, 4) * 22;
      ctx.globalAlpha = 0.5 + hash(i, 5) * 0.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.restore();

    // 10 algae specks
    ctx.save();
    ctx.fillStyle = '#4aaa30';
    for (let i = 0; i < 10; i++) {
      const cx = hash(i + 100, 7) * W;
      const cy = hash(i + 100, 8) * H;
      const r = 1.5 + hash(i + 100, 9) * 2;
      ctx.globalAlpha = 0.25 + hash(i + 100, 10) * 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const bytes = toBytes();
    tex = new RawTexture(
      bytes,
      W,
      H,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 4;
    cachedSubAlbedo.set(scene, tex);
  }
  return tex;
}

// === Substrate normal map (matching FBM gradients) ===
export function getCocopeatSubstrateNormal(scene: Scene): RawTexture {
  let tex = cachedSubNormal.get(scene);
  if (!tex) {
    const W = 256;
    const H = 256;
    const heights = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const macro = fbm(x / 40, y / 40, 3);
        const fine = fbm(x / 4, y / 4, 2);
        heights[y * W + x] = macro * 0.5 + fine * 0.5;
      }
    }

    const bytes = new Uint8Array(W * H * 4);
    const strength = 2.2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W;
        const xp = (x + 1) % W;
        const ym = (y - 1 + H) % H;
        const yp = (y + 1) % H;
        const dx = (heights[y * W + xp] - heights[y * W + xm]) * strength;
        const dy = (heights[yp * W + x] - heights[ym * W + x]) * strength;
        // Normalize to [-1, 1] then pack [0, 255]
        const len = Math.hypot(dx, dy, 1);
        const nx = -dx / len;
        const ny = -dy / len;
        const nz = 1 / len;
        const idx = (y * W + x) * 4;
        bytes[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        bytes[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        bytes[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        bytes[idx + 3] = 255;
      }
    }

    tex = new RawTexture(
      bytes,
      W,
      H,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    cachedSubNormal.set(scene, tex);
  }
  return tex;
}
