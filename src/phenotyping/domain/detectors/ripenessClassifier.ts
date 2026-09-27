// Phenotyping survey v2 — Ripeness classifier (post-detection).
//
// Input: a panorama ImageData + a bbox of a *detected* tomato instance
//        (typically from an ONNX object detector that locates "this is a
//        tomato-like fruit" without classifying ripeness).
// Output: a 5-stage RipenessBin (green / breaker / turning / pink / red)
//         with a confidence score.
//
// Algorithm:
//   1. Iterate every pixel inside the bbox.
//   2. Convert RGB → HSV.
//   3. Drop "non-fruit pixels": low saturation (gray/background) or very dark.
//   4. Classify each remaining pixel into one of 5 hue bands.
//   5. Weight contributions by saturation × value (saturated, bright pixels
//      are more reliable indicators of ripeness than dim, washed-out ones).
//   6. The dominant band wins.  Confidence = dominant_fraction × avg_saturation.
//
// Why this works downstream of an instance detector but not standalone:
//   When we already know "this pixel region is a tomato" (because YOLO said so),
//   color-distinguishing ripeness is trivial — leaves vs unripe-green tomatoes
//   are *both* labeled green at the bin level, but YOLO already excluded leaves.
//   Standalone HSV cannot do this: green tomatoes look like green leaves.

import type { RipenessBin } from './types';

export interface RipenessResult {
  bin: RipenessBin;
  confidence: number;
  /** Per-band weighted scores, normalized 0..1. Useful for debug/UI. */
  scores: Record<RipenessBin, number>;
  /** Number of "fruit-like" pixels considered after gray/dark filtering. */
  validPixels: number;
}

/** Saturation below this → pixel is gray/background → excluded. */
const MIN_SAT = 0.12;
/** Value below this → pixel is too dark to classify reliably → excluded. */
const MIN_VAL = 0.10;
/** If the bbox yields fewer than this many valid pixels, classification is
 *  unreliable. We still return a best guess but with low confidence. */
const MIN_VALID_PIXELS = 8;

/** Hue band → bin lookup. Order matches RipenessBin progression. */
function pixelBin(h: number, s: number): RipenessBin {
  // Red zone (deep ripe): hue 0-15 or 340-360 with high saturation
  if ((h >= 0 && h < 15) || (h >= 340 && h <= 360)) {
    return s >= 0.45 ? 'red' : 'pink';
  }
  // Pink zone (light-red / blushing): magenta-leaning red with moderate sat
  if (h >= 320 && h < 340) return 'pink';
  // Turning zone (orange): 15-32 — fully ripening
  if (h >= 15 && h < 32) return 'turning';
  // Breaker zone (yellow-orange transition): 32-55
  if (h >= 32 && h < 60) return 'breaker';
  // Green zone (mature unripe to immature): 60-160
  if (h >= 60 && h < 160) return 'green';
  // Cool hues (blue/purple): unlikely for tomato, classify as green as default
  return 'green';
}

export function classifyRipeness(
  panorama: ImageData,
  bbox: { x: number; y: number; w: number; h: number },
): RipenessResult {
  const W = panorama.width;
  const H = panorama.height;
  const data = panorama.data;

  // Clamp bbox to image bounds. bbox from detector may go slightly off-edge.
  const x0 = Math.max(0, Math.floor(bbox.x));
  const y0 = Math.max(0, Math.floor(bbox.y));
  const x1 = Math.min(W, Math.ceil(bbox.x + bbox.w));
  const y1 = Math.min(H, Math.ceil(bbox.y + bbox.h));

  const scores: Record<RipenessBin, number> = {
    green: 0, breaker: 0, turning: 0, pink: 0, red: 0,
  };
  let validPixels = 0;
  let satSum = 0;

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const off = (py * W + px) * 4;
      const r = data[off] / 255;
      const g = data[off + 1] / 255;
      const b = data[off + 2] / 255;
      const { h, s, v } = rgb2hsv(r, g, b);
      if (s < MIN_SAT || v < MIN_VAL) continue;
      const bin = pixelBin(h, s);
      // Weight: saturated bright pixels contribute more.  Cap weight at 1.
      const w = Math.min(1, s * v + 0.2);
      scores[bin] += w;
      validPixels++;
      satSum += s;
    }
  }

  // Pick dominant
  let dominant: RipenessBin = 'green';
  let topScore = -1;
  let totalScore = 0;
  for (const k of ['green', 'breaker', 'turning', 'pink', 'red'] as const) {
    totalScore += scores[k];
    if (scores[k] > topScore) {
      topScore = scores[k];
      dominant = k;
    }
  }

  // Normalize scores for return
  if (totalScore > 0) {
    for (const k of Object.keys(scores) as RipenessBin[]) {
      scores[k] = scores[k] / totalScore;
    }
  }

  if (validPixels < MIN_VALID_PIXELS) {
    return {
      bin: dominant,
      confidence: 0.15,
      scores,
      validPixels,
    };
  }

  const dominantFrac = totalScore > 0 ? topScore / totalScore : 0;
  const avgSat = satSum / validPixels;
  // Confidence: dominant band's share × overall saturation.  Floor at 0.2 so
  // even weak signals show on the UI; cap at 1.
  const confidence = Math.max(0.2, Math.min(1, dominantFrac * (0.55 + 0.45 * avgSat)));

  return {
    bin: dominant,
    confidence,
    scores: {
      green: scores.green,
      breaker: scores.breaker,
      turning: scores.turning,
      pink: scores.pink,
      red: scores.red,
    },
    validPixels,
  };
}

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
