// Phenotyping survey v2 — Orthographic mosaic stitcher.
//
// The gimbal is rail-mounted (fixed Y, fixed Z facing the bed) and only X
// varies between captures.  This makes panorama assembly trivial: each
// frame contributes a column-range proportional to (railX × pxPerM).  No
// feature matching / homography is needed.
//
// Overlap regions are blended via center-weight (each frame "votes harder"
// for its own center pixels), which hides RTT seam artifacts.

import type { CapturedFrame } from './frameCapture';

export interface StitchOpts {
  /** Panorama horizontal scale.  default 80 px per meter of rail.  At rail
   *  range ±14 m → 2240 px wide panorama (manageable). */
  pxPerM?: number;
  /** Optional explicit panorama height in px.  Defaults to first frame height. */
  heightPx?: number;
  /** Background color for uncovered regions (RGBA, default opaque dark). */
  background?: [number, number, number, number];
}

export interface StitchResult {
  imageData: ImageData;
  pxPerM: number;
  railStartX: number;
  railEndX: number;
  /** Where each frame landed in panorama X (for bbox→worldX reverse mapping). */
  framePlacements: Array<{ railX: number; xStartPx: number; xEndPx: number }>;
}

/** Build a horizontal mosaic panorama from rail-mounted captures.
 *
 *  - Frames sorted by railX ascending.
 *  - First frame's center pixel maps to railX0, etc.
 *  - Each frame's width covers (frame.width / pxPerM) meters of rail.
 *  - Overlapping pixels blended with center-weighting:
 *      w(i) = max(0, 1 - 2·|i - center| / frame.width)
 *  - Output ImageData is created via OffscreenCanvas (browser) or polyfill. */
export function stitchFrames(frames: readonly CapturedFrame[], opts: StitchOpts = {}): StitchResult {
  const pxPerM = opts.pxPerM ?? 80;
  if (frames.length === 0) {
    return makeEmpty(pxPerM, opts);
  }
  // Defensive sort (caller may already have done this).
  const sorted = frames.slice().sort((a, b) => a.railX - b.railX);
  const first = sorted[0];
  const heightPx = opts.heightPx ?? first.height;
  const frameWPx = first.width;
  // Meters that one frame covers horizontally.
  const frameWidthM = frameWPx / pxPerM;
  const halfWidthM = frameWidthM / 2;
  const railStart = sorted[0].railX - halfWidthM;
  const railEnd = sorted[sorted.length - 1].railX + halfWidthM;
  const panoWPx = Math.max(1, Math.ceil((railEnd - railStart) * pxPerM));
  const bg = opts.background ?? [12, 14, 18, 255];

  // Accumulators (float for blending) + total weight.
  const accR = new Float32Array(panoWPx * heightPx);
  const accG = new Float32Array(panoWPx * heightPx);
  const accB = new Float32Array(panoWPx * heightPx);
  const accW = new Float32Array(panoWPx * heightPx);
  const placements: StitchResult['framePlacements'] = [];

  for (const frame of sorted) {
    const xCenterPx = Math.round((frame.railX - railStart) * pxPerM);
    const xStartPx = xCenterPx - Math.floor(frameWPx / 2);
    const xEndPx = xStartPx + frameWPx;
    placements.push({ railX: frame.railX, xStartPx, xEndPx });

    // Clamp loop range to panorama bounds.
    const loopXStart = Math.max(0, xStartPx);
    const loopXEnd = Math.min(panoWPx, xEndPx);
    const fH = Math.min(heightPx, frame.height);

    for (let y = 0; y < fH; y++) {
      for (let px = loopXStart; px < loopXEnd; px++) {
        const fx = px - xStartPx;            // local x in frame
        const fi = (y * frame.width + fx) * 4;
        const ai = y * panoWPx + px;
        // Center-weight: 1 at center, 0 at edges. Add tiny floor to avoid 0.
        const w = Math.max(0.05, 1 - Math.abs(2 * (fx - frame.width / 2) / frame.width));
        accR[ai] += frame.pixels[fi]     * w;
        accG[ai] += frame.pixels[fi + 1] * w;
        accB[ai] += frame.pixels[fi + 2] * w;
        accW[ai] += w;
      }
    }
  }

  // Compose final ImageData.
  const out = new Uint8ClampedArray(panoWPx * heightPx * 4);
  for (let i = 0; i < panoWPx * heightPx; i++) {
    const oi = i * 4;
    const w = accW[i];
    if (w > 0) {
      out[oi]     = accR[i] / w;
      out[oi + 1] = accG[i] / w;
      out[oi + 2] = accB[i] / w;
      out[oi + 3] = 255;
    } else {
      out[oi]     = bg[0];
      out[oi + 1] = bg[1];
      out[oi + 2] = bg[2];
      out[oi + 3] = bg[3];
    }
  }
  const imageData = new ImageData(out, panoWPx, heightPx);
  return { imageData, pxPerM, railStartX: railStart, railEndX: railEnd, framePlacements: placements };
}

/** Convert a panorama ImageData to a PNG Blob (for IndexedDB persistence). */
export async function imageDataToPng(img: ImageData): Promise<Blob> {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(img.width, img.height)
    : (() => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; return c; })();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for canvas');
  (ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).putImageData(img, 0, 0);
  if ('convertToBlob' in canvas) {
    return await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  }
  return await new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (blob) resolve(blob); else reject(new Error('toBlob returned null'));
    }, 'image/png');
  });
}

/** Reverse map: panorama X (px) → rail X (m). */
export function panoXToRailX(panX: number, result: { pxPerM: number; railStartX: number }): number {
  return result.railStartX + panX / result.pxPerM;
}

// ── internal ──

function makeEmpty(pxPerM: number, opts: StitchOpts): StitchResult {
  const w = 1, h = opts.heightPx ?? 1;
  const bg = opts.background ?? [12, 14, 18, 255];
  const out = new Uint8ClampedArray([bg[0], bg[1], bg[2], bg[3]]);
  return {
    imageData: new ImageData(out, w, h),
    pxPerM,
    railStartX: 0,
    railEndX: 0,
    framePlacements: [],
  };
}
