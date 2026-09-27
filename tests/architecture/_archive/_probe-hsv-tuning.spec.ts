// Probe — empirical HSV tuning. Captures several gimbal RTT frames during
// traverse, classifies pixels per current bands, dumps top hits per band
// with their pixel HSV so we can see *what* is being caught and tune the
// thresholds against actual scene pixels.

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT = 'test-results/scenarios';

test.describe('HSV tuning probe', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('analyze gimbal RTT frames for false positive sources', async ({ page }) => {
    test.setTimeout(180_000);
    page.on('console', (m) => {
      const t = m.text();
      if (t.includes('[runPerFrameHsv]') || t.includes('frameCapture')) {
        console.log(`[browser] ${t.slice(0, 200)}`);
      }
    });

    const url =
      'http://localhost:8090/?mode=workbench&scenario=phenotyping-D110-survey' +
      '&bedLayout=2-4-4&activeBedIds=4,5,6,7,8,9' +
      '&robotProfile=phenotyping&robotTraverse=1&gimbalView=1&qualityPreset=1';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return c != null && c.width > 100 && c.height > 100;
    }, { timeout: 60_000 });
    await page.waitForTimeout(8_000);

    const startBtn = page.locator('button', { hasText: 'START SURVEY' }).first();
    await expect(startBtn).toBeVisible({ timeout: 30_000 });
    await startBtn.click({ force: true, timeout: 30_000 });
    console.log('[probe] START SURVEY clicked');

    // Wait for a mid-rail frame where camera sees plants + substrate together
    await page.waitForTimeout(30_000);

    fs.mkdirSync(OUT, { recursive: true });

    const result = await page.evaluate(async () => {
      const w = window as unknown as { __capturedFrames?: string[] };
      const frames = w.__capturedFrames ?? [];
      if (frames.length === 0) return { error: 'no frames captured' };

      const out: Array<{
        frameIdx: number;
        png: string;
        stats: unknown;
      }> = [];

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

      // Analyze last 3 frames (mid-rail, plants in view).
      const lastFew = frames.slice(-3);
      for (let i = 0; i < lastFew.length; i++) {
        const dataUrl = lastFew[i];
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = dataUrl;
        });
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;

        // Bucket counts at multiple saturation thresholds, per hue band.
        const sThresholds = [0.20, 0.30, 0.40, 0.50, 0.60];
        const bands = [
          { name: 'red',     range: [[0, 18], [340, 360]] },
          { name: 'pink',    range: [[325, 340]] },
          { name: 'turning', range: [[18, 30]] },
          { name: 'breaker', range: [[30, 55]] },
          { name: 'green',   range: [[70, 150]] },
          { name: 'misc',    range: [[55, 70], [150, 325]] },
        ] as const;
        const counts: Record<string, number[]> = {};
        for (const b of bands) counts[b.name] = new Array(sThresholds.length).fill(0);

        // Sample some high-sat pixels per band, dump their RGB+HSV
        const samples: Record<string, Array<{ x: number; y: number; r: number; g: number; b: number; h: number; s: number; v: number }>> = {};
        for (const b of bands) samples[b.name] = [];

        // Region tally — top half (likely plants/wall) vs bottom half (substrate)
        const halfH = Math.floor(c.height / 2);
        const regionCounts = {
          top:    { red: 0, breaker: 0, turning: 0, green: 0 },
          bottom: { red: 0, breaker: 0, turning: 0, green: 0 },
        };

        for (let py = 0; py < c.height; py++) {
          for (let px = 0; px < c.width; px++) {
            const o = (py * c.width + px) * 4;
            const r = data[o], g = data[o + 1], bl = data[o + 2];
            const { h, s, v } = rgb2hsv(r / 255, g / 255, bl / 255);
            for (const band of bands) {
              let inHue = false;
              for (const [mn, mx] of band.range) {
                if (h >= mn && h <= mx) { inHue = true; break; }
              }
              if (!inHue) continue;
              for (let ti = 0; ti < sThresholds.length; ti++) {
                if (s >= sThresholds[ti] && v >= 0.25) counts[band.name][ti]++;
              }
              if (s >= 0.30 && v >= 0.25 && samples[band.name].length < 6) {
                samples[band.name].push({ x: px, y: py, r, g, b: bl, h: +h.toFixed(0), s: +s.toFixed(2), v: +v.toFixed(2) });
              }
              if (s >= 0.30 && v >= 0.25) {
                const region = py < halfH ? 'top' : 'bottom';
                if (band.name in regionCounts.top) {
                  regionCounts[region][band.name as keyof typeof regionCounts.top]++;
                }
              }
              break;
            }
          }
        }

        out.push({
          frameIdx: frames.length - lastFew.length + i,
          png: dataUrl.split(',')[1],
          stats: {
            W: c.width, H: c.height,
            sThresholds,
            countsPerBandPerThreshold: counts,
            samplesPerBand: samples,
            regionCounts,
          },
        });
      }
      return { ok: true, frames: out };
    });

    if ('error' in result) {
      console.log(`ERROR: ${result.error}`);
    } else if (result.ok && result.frames) {
      for (const fr of result.frames) {
        const file = path.join(OUT, `tune-frame-${fr.frameIdx}.png`);
        fs.writeFileSync(file, Buffer.from(fr.png, 'base64'));
        console.log(`\n=== frame ${fr.frameIdx} — ${file} ===`);
        console.log(JSON.stringify(fr.stats, null, 2));
      }
    }
    expect(true).toBe(true);
  });
});
