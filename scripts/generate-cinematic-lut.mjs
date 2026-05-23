// Generates public/luts/cinematic.3dl — a 16x16x16 3D LUT in the format
// Babylon's ColorGradingTexture parses.
//
// The grade:
//   - Lift shadows slightly toward teal (R-, G., B+).
//   - Push highlights warmer (R+, G., B-).
//   - Mild S-curve contrast (slope 1.12 around 0.5 midpoint).
//   - Subtle global desaturation.
//
// Output: integers in [0, 255]. First header line lists the input
// breakpoints (Babylon uses word count of the first non-empty line to
// determine LUT size).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SIZE = 16;
const MAX = 255;

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function mix(a, b, t) { return a + (b - a) * t; }

function applyGrade(r, g, b) {
  // S-curve contrast around 0.5
  const k = 1.12;
  const cs = (x) => clamp01((x - 0.5) * k + 0.5);
  let R = cs(r), G = cs(g), B = cs(b);

  // Luminance for shadow/highlight masks
  const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const shadowMask = clamp01(1 - lum * 1.5);          // strong at low lum
  const highlightMask = clamp01((lum - 0.5) * 2);     // strong at high lum

  // Shadow → teal/blue
  R -= 0.04 * shadowMask;
  B += 0.05 * shadowMask;

  // Highlight → warm orange
  R += 0.07 * highlightMask;
  B -= 0.04 * highlightMask;

  // Global slight desaturation (5%)
  const finalLum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  R = mix(finalLum, R, 0.95);
  G = mix(finalLum, G, 0.95);
  B = mix(finalLum, B, 0.95);

  return [clamp01(R), clamp01(G), clamp01(B)];
}

const lines = [];

// Header: SIZE integer markers separated by space. Babylon reads
// `words.length` of the first non-empty line to set LUT size.
lines.push(Array.from({ length: SIZE }, (_, i) => Math.round((i / (SIZE - 1)) * MAX)).join(' '));

// Standard .3dl ordering: B changes slowest, then G, then R. Babylon's
// loader fills with the index formula:
//   pixelStorageIndex = (W + slice * SIZE + H * SIZE^2) * 4
// where W = R, H = G, slice = B (from the index increments in the parser).
for (let b = 0; b < SIZE; b++) {
  for (let g = 0; g < SIZE; g++) {
    for (let r = 0; r < SIZE; r++) {
      const [outR, outG, outB] = applyGrade(r / (SIZE - 1), g / (SIZE - 1), b / (SIZE - 1));
      lines.push(`${Math.round(outR * MAX)} ${Math.round(outG * MAX)} ${Math.round(outB * MAX)}`);
    }
  }
}

const outPath = 'public/luts/cinematic.3dl';
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`wrote ${outPath} (${lines.length} lines)`);
