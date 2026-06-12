/**
 * Procedural carbon-fiber texture for the phenotyping gimbal cage.
 *
 *   • getCarbonFiberTexture — 512×512 twill-weave carbon-fiber pattern
 *     with subtle highlight variation.  CocopeatBagTexture pattern
 *     (RawTexture + WeakMap cache, Offscreen/HTMLCanvas fallback).
 *
 * Pattern: 2/2 twill — interlocking diagonal threads at ±45°.  Threads
 * are bunched (each "thread" is ~6px wide group of fibers), and weave
 * cells are ~8mm in real-world scale.
 */

import { Scene } from '@babylonjs/core/scene';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';

const cachedCarbonTex = new WeakMap<Scene, RawTexture>();

function makeCanvas(w: number, h: number): {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  toBytes: () => Uint8Array;
} {
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

export function getCarbonFiberTexture(scene: Scene): RawTexture {
  let tex = cachedCarbonTex.get(scene);
  if (tex) return tex;

  const W = 512;
  const H = 512;
  const { ctx, toBytes } = makeCanvas(W, H);

  // Base — very dark charcoal (carbon weave shows through resin)
  ctx.fillStyle = '#0e0e10';
  ctx.fillRect(0, 0, W, H);

  // 2/2 twill weave — each thread group ~8px wide, weave cell 32px.
  // We draw alternating diagonal "rises" with slight specular highlight.
  const THREAD = 8;
  const CELL = 32;

  // Pass 1: warp threads (vertical "rises" highlighted on diagonal)
  for (let by = 0; by < H; by += CELL) {
    for (let bx = 0; bx < W; bx += CELL) {
      // 2/2 twill: top-left half of cell highlighted (warp over weft)
      ctx.fillStyle = '#1b1b1d';
      ctx.fillRect(bx, by, CELL / 2, CELL / 2);
      ctx.fillRect(bx + CELL / 2, by + CELL / 2, CELL / 2, CELL / 2);

      // Slight darker shadow on other half (weft under warp)
      ctx.fillStyle = '#080809';
      ctx.fillRect(bx + CELL / 2, by, CELL / 2, CELL / 2);
      ctx.fillRect(bx, by + CELL / 2, CELL / 2, CELL / 2);
    }
  }

  // Pass 2: diagonal fiber stripes (carbon fibers visible within thread groups)
  ctx.strokeStyle = 'rgba(64,64,68,0.35)';
  ctx.lineWidth = 1;
  for (let i = -H; i < W + H; i += 3) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }
  // Counter-diagonal (subtle, lighter)
  ctx.strokeStyle = 'rgba(48,48,52,0.20)';
  for (let i = -H; i < W + H; i += 3) {
    ctx.beginPath();
    ctx.moveTo(i, H);
    ctx.lineTo(i + H, 0);
    ctx.stroke();
  }

  // Pass 3: occasional specular highlight (fiber catches light)
  ctx.strokeStyle = 'rgba(140,140,150,0.18)';
  ctx.lineWidth = 1;
  for (let i = -H; i < W + H; i += 11) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }

  // Pass 4: subtle noise for realism
  const noiseImg = ctx.getImageData(0, 0, W, H);
  const d = noiseImg.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(noiseImg, 0, 0);

  tex = new RawTexture(
    toBytes(),
    W, H,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    true,           // generateMipMaps
    false,          // invertY
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  tex.name = 'robot:carbonFiberTex';
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  cachedCarbonTex.set(scene, tex);
  return tex;
}
