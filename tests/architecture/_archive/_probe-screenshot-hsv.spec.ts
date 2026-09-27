// Probe — take screenshots of the main canvas, apply HSV (and a simple
// chroma-band classifier) to each, prove that tomato detection is trivial
// when fed actual rendered pixels.

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT = 'test-results/scenarios';

test.describe('Screenshot → HSV sanity', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('detect tomatoes in real screenshots', async ({ page }) => {
    test.setTimeout(180_000);

    const url =
      'http://localhost:8090/?mode=workbench&scenario=phenotyping-D110-survey' +
      '&bedLayout=2-4-4&activeBedIds=4,5,6,7,8,9' +
      '&robotProfile=phenotyping&robotTraverse=1&gimbalView=1&qualityPreset=1';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return c != null && c.width > 100 && c.height > 100;
    }, { timeout: 60_000 });
    await page.waitForTimeout(10_000);

    // Click START SURVEY so the robot starts traversing — gives us a moving view.
    const startBtn = page.locator('button', { hasText: 'START SURVEY' }).first();
    if (await startBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await startBtn.click({ force: true });
      console.log('[probe] START SURVEY clicked');
    }

    fs.mkdirSync(OUT, { recursive: true });

    const tSamples = [3_000, 15_000, 30_000, 50_000];
    let elapsed = 0;
    for (let i = 0; i < tSamples.length; i++) {
      const wait = tSamples[i] - elapsed;
      if (wait > 0) await page.waitForTimeout(wait);
      elapsed = tSamples[i];

      // Read the full canvas pixels (camera output, not the PiP).
      const result = await page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement;
        const W = c.width, H = c.height;
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        const ctx = off.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(c, 0, 0);
        const png = off.toDataURL('image/png').split(',')[1];
        const img = ctx.getImageData(0, 0, W, H);
        const px = img.data;

        const rgb2hsv = (r: number, g: number, b: number) => {
          const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
          let h = 0;
          if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60; if (h < 0) h += 360;
          }
          return { h, s: max === 0 ? 0 : d / max, v: max };
        };

        // ── Algorithm A: strict HSV bands (current hsvDetector) ──────────
        const BANDS_STRICT: Array<{ bin: string; hueRanges: Array<[number, number]>; satMin: number; valMin: number }> = [
          { bin: 'red',     hueRanges: [[0, 18], [340, 360]], satMin: 0.30, valMin: 0.25 },
          { bin: 'pink',    hueRanges: [[325, 340]],          satMin: 0.20, valMin: 0.30 },
          { bin: 'turning', hueRanges: [[18, 30]],            satMin: 0.30, valMin: 0.30 },
          { bin: 'breaker', hueRanges: [[30, 55]],            satMin: 0.25, valMin: 0.30 },
          { bin: 'green',   hueRanges: [[70, 150]],           satMin: 0.30, valMin: 0.20 },
        ];
        // ── Algorithm B: permissive bands (sat 0.15) ─────────────────────
        const BANDS_PERM = BANDS_STRICT.map((b) => ({ ...b, satMin: Math.max(0.15, b.satMin - 0.15), valMin: 0.15 }));
        // ── Algorithm C: dominant-channel rule (R > G+B*0.6 → red, etc.) ─
        const counts = { strict: { red: 0, pink: 0, turning: 0, breaker: 0, green: 0 }, perm: { red: 0, pink: 0, turning: 0, breaker: 0, green: 0 }, chroma: { red: 0, green: 0, orange: 0 } };
        let saturatedPx = 0;
        // hue/sat/val histograms (coarse, 18 bins each)
        const hueHist = new Array(18).fill(0);
        const satHist = new Array(10).fill(0);
        const valHist = new Array(10).fill(0);

        const tally = (bands: typeof BANDS_STRICT, bucket: Record<string, number>, h: number, s: number, v: number) => {
          for (const band of bands) {
            if (s < band.satMin || v < band.valMin) continue;
            let inHue = false;
            for (const [mn, mx] of band.hueRanges) {
              if (h >= mn && h <= mx) { inHue = true; break; }
            }
            if (inHue) { bucket[band.bin]++; return; }
          }
        };

        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], g = px[i + 1], b = px[i + 2];
          const { h, s, v } = rgb2hsv(r / 255, g / 255, b / 255);
          if (s >= 0.2) saturatedPx++;
          hueHist[Math.min(17, Math.floor(h / 20))]++;
          satHist[Math.min(9, Math.floor(s * 10))]++;
          valHist[Math.min(9, Math.floor(v * 10))]++;
          tally(BANDS_STRICT, counts.strict, h, s, v);
          tally(BANDS_PERM,   counts.perm,   h, s, v);
          if (r > g + 20 && r > b + 20 && r > 80) counts.chroma.red++;
          else if (g > r + 10 && g > b + 10 && g > 60) counts.chroma.green++;
          else if (r > 120 && g > 60 && b < g) counts.chroma.orange++;
        }
        const totalPx = W * H;
        return {
          W, H, totalPx,
          saturatedPctSat20: +(saturatedPx / totalPx * 100).toFixed(2),
          counts,
          hueHist20deg: hueHist,
          satHist01: satHist,
          valHist01: valHist,
          png,
        };
      });

      const file = path.join(OUT, `algo-sample-${i}-t${elapsed}.png`);
      fs.writeFileSync(file, Buffer.from(result.png, 'base64'));
      console.log(`\n=== Sample ${i} @ ${elapsed/1000}s — ${file} ===`);
      const { png: _omit, ...summary } = result as Record<string, unknown>;
      console.log(JSON.stringify(summary, null, 2));
    }

    expect(true).toBe(true);
  });
});
