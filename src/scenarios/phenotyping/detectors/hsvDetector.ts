// Phenotyping survey v2 — HSV color-segmentation detector.
//
// Approach:
//  1. Convert panorama RGBA → HSV per pixel.
//  2. Threshold into 5 ripeness color bands (red / pink / turning / breaker / green).
//  3. Morphological erosion-then-dilation (3×3) to suppress single-pixel noise.
//  4. Connected-component labeling (4-neighbor) per color band → blobs.
//  5. Filter by min area (default 24 px²).
//  6. Each blob → FruitDetection with bbox + bin (band) + confidence (sat × area).
//
// No external deps. Tomatoes are color-dominant so this works surprisingly
// well as a baseline. Limitations: leaves' specular highlights occasionally
// trip the red band; mitigated by saturation threshold.

import type { Detector, DetectorContext, FruitDetection, RipenessBin } from './types';
import { panoXToRailX } from '../stitcher';

interface HsvBand {
  bin: RipenessBin;
  /** Hue degrees ranges. Each range is [min, max] inclusive (handles 0° wrap with multiple ranges). */
  hueRanges: Array<[number, number]>;
  /** Min saturation [0..1]. */
  satMin: number;
  /** Min value [0..1]. */
  valMin: number;
}

// 5 bands — order matters: first match wins per pixel.
const BANDS: readonly HsvBand[] = [
  { bin: 'red',     hueRanges: [[0, 12], [345, 360]], satMin: 0.55, valMin: 0.30 },
  { bin: 'pink',    hueRanges: [[330, 345]],           satMin: 0.30, valMin: 0.30 },
  { bin: 'turning', hueRanges: [[12, 25]],             satMin: 0.55, valMin: 0.35 },
  { bin: 'breaker', hueRanges: [[25, 50]],             satMin: 0.40, valMin: 0.35 },
  { bin: 'green',   hueRanges: [[70, 150]],            satMin: 0.45, valMin: 0.25 },
] as const;

const MIN_BLOB_AREA = 24;
const REF_AREA = 200; // confidence saturation point

export const hsvDetector: Detector = {
  id: 'hsv-v1',
  label: 'HSV color (no model)',
  source: 'hsv',
  async detect(panorama: ImageData, ctx: DetectorContext): Promise<FruitDetection[]> {
    const W = panorama.width;
    const H = panorama.height;
    const data = panorama.data;

    // Per-pixel label (0 = none, 1..N = band index + 1).
    const labels = new Uint8Array(W * H);
    // Per-pixel saturation cache (for confidence calc later, scaled to 0..255).
    const satCache = new Uint8Array(W * H);

    for (let i = 0; i < W * H; i++) {
      const off = i * 4;
      const r = data[off] / 255;
      const g = data[off + 1] / 255;
      const b = data[off + 2] / 255;
      const { h, s, v } = rgb2hsv(r, g, b);
      satCache[i] = Math.round(s * 255);

      for (let bi = 0; bi < BANDS.length; bi++) {
        const band = BANDS[bi];
        if (s < band.satMin || v < band.valMin) continue;
        let inHue = false;
        for (const [mn, mx] of band.hueRanges) {
          if (h >= mn && h <= mx) { inHue = true; break; }
        }
        if (inHue) {
          labels[i] = bi + 1;
          break;
        }
      }
    }

    // Morphological cleanup: 3×3 erosion then dilation, per band.
    // For simplicity we do it on the unified label map by treating each
    // band independently in successive passes.
    const cleaned = labels; // in-place buffer reuse
    morphPerBand(cleaned, W, H, BANDS.length);

    // Connected components per band.
    const detections: FruitDetection[] = [];
    for (let bi = 0; bi < BANDS.length; bi++) {
      const band = BANDS[bi];
      const target = bi + 1;
      const blobs = labelComponents(cleaned, W, H, target);
      for (const blob of blobs) {
        if (blob.area < MIN_BLOB_AREA) continue;
        // Confidence: combine size (proxy for fruit) + avg saturation
        let satSum = 0;
        for (const idx of blob.pixels) satSum += satCache[idx];
        const avgSat = (satSum / blob.area) / 255;
        const sizeScore = Math.min(1, blob.area / REF_AREA);
        const confidence = Math.max(0.1, Math.min(1, 0.5 * sizeScore + 0.5 * avgSat));

        const cxPx = blob.minX + (blob.maxX - blob.minX) / 2;
        const worldX = panoXToRailX(cxPx, ctx.panorama);

        detections.push({
          bbox: {
            x: blob.minX,
            y: blob.minY,
            w: blob.maxX - blob.minX,
            h: blob.maxY - blob.minY,
          },
          worldX,
          bin: band.bin,
          confidence,
          source: 'hsv',
        });
      }
    }
    return detections;
  },
};

// ── RGB→HSV (h: 0-360, s/v: 0-1) ──────────────────────────────────────

function rgb2hsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

// ── Morphological cleanup ─────────────────────────────────────────────

function morphPerBand(labels: Uint8Array, W: number, H: number, bandCount: number): void {
  for (let b = 1; b <= bandCount; b++) {
    erode(labels, W, H, b);
    dilate(labels, W, H, b);
  }
}

function erode(labels: Uint8Array, W: number, H: number, target: number): void {
  // Pixel kept only if all 8 neighbors also have target.  Standard 3×3 SE.
  const next = new Uint8Array(labels.length);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (labels[i] !== target) continue;
      const ok =
        labels[i - 1] === target && labels[i + 1] === target
        && labels[i - W] === target && labels[i + W] === target
        && labels[i - W - 1] === target && labels[i - W + 1] === target
        && labels[i + W - 1] === target && labels[i + W + 1] === target;
      if (ok) next[i] = target;
    }
  }
  // Merge — preserve other bands, replace this band region.
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === target) labels[i] = next[i];
  }
}

function dilate(labels: Uint8Array, W: number, H: number, target: number): void {
  // Pixel set if any 8 neighbor has target. Only sets if pixel is currently 0.
  const set: number[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (labels[i] !== 0) continue;
      if (
        labels[i - 1] === target || labels[i + 1] === target
        || labels[i - W] === target || labels[i + W] === target
        || labels[i - W - 1] === target || labels[i - W + 1] === target
        || labels[i + W - 1] === target || labels[i + W + 1] === target
      ) set.push(i);
    }
  }
  for (const i of set) labels[i] = target;
}

// ── Connected components (4-neighbor BFS) ─────────────────────────────

interface Blob {
  area: number;
  minX: number; maxX: number;
  minY: number; maxY: number;
  pixels: number[]; // indices for satCache lookup
}

function labelComponents(labels: Uint8Array, W: number, H: number, target: number): Blob[] {
  const visited = new Uint8Array(W * H);
  const blobs: Blob[] = [];
  const queue: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const start = y * W + x;
      if (visited[start] || labels[start] !== target) continue;
      const blob: Blob = { area: 0, minX: x, maxX: x, minY: y, maxY: y, pixels: [] };
      queue.length = 0;
      queue.push(start);
      visited[start] = 1;
      while (queue.length > 0) {
        const i = queue.pop()!;
        const px = i % W;
        const py = (i - px) / W;
        blob.area++;
        blob.pixels.push(i);
        if (px < blob.minX) blob.minX = px;
        if (px > blob.maxX) blob.maxX = px;
        if (py < blob.minY) blob.minY = py;
        if (py > blob.maxY) blob.maxY = py;
        // 4-neighbors
        if (px > 0) {
          const n = i - 1;
          if (!visited[n] && labels[n] === target) { visited[n] = 1; queue.push(n); }
        }
        if (px < W - 1) {
          const n = i + 1;
          if (!visited[n] && labels[n] === target) { visited[n] = 1; queue.push(n); }
        }
        if (py > 0) {
          const n = i - W;
          if (!visited[n] && labels[n] === target) { visited[n] = 1; queue.push(n); }
        }
        if (py < H - 1) {
          const n = i + W;
          if (!visited[n] && labels[n] === target) { visited[n] = 1; queue.push(n); }
        }
      }
      blobs.push(blob);
    }
  }
  return blobs;
}
