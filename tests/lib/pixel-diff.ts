// Iter 18B PR 1 — bbox-aware pixel diff for visual regression.
//
// Plant areas (stem / leaf / truss) overlap heavily in viewport, so we
// approximate by horizontal bands at the showcase plant's typical camera
// distance (radius=1.8m, beta≈π/2-0.08, targetY=1.2m). These bands let us
// flag diffs that originate in a specific organ layer.
//
// Usage:
//   const result = compareImages(actualPath, baselinePath);
//   if (result.overall.diffPct > 0.5) fail;

import { promises as fs } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface BboxRegion {
  /** Inclusive rect in pixels — [x0, y0, x1, y1] from top-left. */
  rect: [number, number, number, number];
  /** Region label (stem / leaf-upper / leaf-lower / truss / overall). */
  label: string;
}

export interface BboxDiffResult {
  label: string;
  diffPx: number;
  totalPx: number;
  diffPct: number;  // 0–100
}

export interface CompareImagesResult {
  width: number;
  height: number;
  overall: BboxDiffResult;
  regions: BboxDiffResult[];
  /** Difference image (RGBA) for debugging. */
  diffPngBuffer?: Buffer;
}

/**
 * Default bbox layout for D45 showcase capture at canonical camera (1600x1000
 * viewport, radius=1.8, targetY=1.2). Tuned empirically — refine as needed.
 */
export const DEFAULT_BBOX: BboxRegion[] = [
  { rect: [0, 0, 1600, 200], label: 'sky' },             // empty backdrop, ignore
  { rect: [400, 200, 1200, 450], label: 'leaf-upper' },  // upper canopy
  { rect: [400, 450, 1200, 750], label: 'truss' },       // mid-plant trusses
  { rect: [600, 250, 1000, 950], label: 'stem' },        // central stem column
  { rect: [400, 750, 1200, 1000], label: 'leaf-lower' }, // lower canopy
];

async function loadPng(filePath: string): Promise<PNG> {
  const data = await fs.readFile(filePath);
  return new Promise<PNG>((resolve, reject) => {
    new PNG().parse(data, (err, png) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

function diffRegion(
  actual: Buffer,
  baseline: Buffer,
  width: number,
  height: number,
  rect: [number, number, number, number],
  threshold: number,
): { diffPx: number; totalPx: number } {
  // Clamp rect to image bounds.
  const x0 = Math.max(0, rect[0]);
  const y0 = Math.max(0, rect[1]);
  const x1 = Math.min(width, rect[2]);
  const y1 = Math.min(height, rect[3]);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return { diffPx: 0, totalPx: 0 };

  // Crop into temp RGBA buffers (pixelmatch expects full slabs).
  const actualCrop = Buffer.alloc(w * h * 4);
  const baselineCrop = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcOff = ((y0 + row) * width + x0) * 4;
    const dstOff = row * w * 4;
    actual.copy(actualCrop, dstOff, srcOff, srcOff + w * 4);
    baseline.copy(baselineCrop, dstOff, srcOff, srcOff + w * 4);
  }
  const diffPx = pixelmatch(actualCrop, baselineCrop, null, w, h, { threshold });
  return { diffPx, totalPx: w * h };
}

export async function compareImages(
  actualPath: string,
  baselinePath: string,
  opts: { regions?: BboxRegion[]; threshold?: number; emitDiff?: boolean } = {},
): Promise<CompareImagesResult> {
  const regions = opts.regions ?? DEFAULT_BBOX;
  const threshold = opts.threshold ?? 0.1;
  const [a, b] = await Promise.all([loadPng(actualPath), loadPng(baselinePath)]);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `pixel-diff: size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    );
  }
  const width = a.width;
  const height = a.height;

  const regionResults: BboxDiffResult[] = regions.map((r) => {
    const { diffPx, totalPx } = diffRegion(a.data, b.data, width, height, r.rect, threshold);
    return {
      label: r.label,
      diffPx,
      totalPx,
      diffPct: totalPx > 0 ? (diffPx / totalPx) * 100 : 0,
    };
  });

  const overallTotal = width * height;
  const overallDiff = pixelmatch(a.data, b.data, null, width, height, { threshold });
  const overall: BboxDiffResult = {
    label: 'overall',
    diffPx: overallDiff,
    totalPx: overallTotal,
    diffPct: (overallDiff / overallTotal) * 100,
  };

  let diffPngBuffer: Buffer | undefined;
  if (opts.emitDiff) {
    const diffPng = new PNG({ width, height });
    pixelmatch(a.data, b.data, diffPng.data, width, height, { threshold });
    diffPngBuffer = PNG.sync.write(diffPng);
  }

  return { width, height, overall, regions: regionResults, diffPngBuffer };
}
