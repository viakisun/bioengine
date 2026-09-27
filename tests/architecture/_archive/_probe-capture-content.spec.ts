// Probe — peek inside FrameCapturer's offscreen output to see what pixels
// runPerFrameHsv actually receives. Uses window.__capturedFrames data URLs
// (first 5 frames dumped by frameCapture.ts diagnostic).

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT_DIR = 'test-results/scenarios';

test.describe('Captured frame content probe', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('inspect frameCapture output', async ({ page }) => {
    test.setTimeout(180_000);
    page.on('console', (msg) => {
      const t = msg.text();
      if (t.includes('frameCapture') || t.includes('runPerFrameHsv')) {
        console.log(`[browser] ${t.slice(0, 220)}`);
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
    await startBtn.click({ force: true });
    console.log('[probe] clicked START SURVEY');

    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Wait long enough for ≥5 frames (rail moves 0.3 m/s × 0.3m cadence = ~1 frame/s, plus startup).
    await page.waitForTimeout(15_000);

    const captured = await page.evaluate(() => {
      const w = window as unknown as { __capturedFrames?: string[]; __capturedFramesMeta?: unknown[] };
      return {
        count: w.__capturedFrames?.length ?? 0,
        meta: w.__capturedFramesMeta ?? null,
        frames: w.__capturedFrames ?? [],
      };
    });
    console.log(`[probe] __capturedFrames count: ${captured.count}`);
    console.log(`[probe] meta: ${JSON.stringify(captured.meta, null, 2)}`);

    for (let i = 0; i < Math.min(5, captured.frames.length); i++) {
      const dataUrl = captured.frames[i];
      const base64 = dataUrl.split(',')[1];
      const buf = Buffer.from(base64, 'base64');
      const file = path.join(OUT_DIR, `capture-frame-${i}.png`);
      fs.writeFileSync(file, buf);
      console.log(`  → ${file} (${buf.length} bytes)`);
    }

    // Compute pixel stats on frame 0 by drawing it back into a canvas
    if (captured.frames.length > 0) {
      const stats = await page.evaluate(async (dataUrl: string) => {
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
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        // histogram of unique colors (top 5 most common)
        const counts = new Map<string, number>();
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], g = px[i + 1], b = px[i + 2];
          const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
        // HSV stats — count pixels per band
        let red = 0, green = 0, orange = 0, sat30 = 0;
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
        for (let i = 0; i < px.length; i += 4) {
          const { h, s, v } = rgb2hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
          if (s >= 0.3) sat30++;
          if (s >= 0.3 && v >= 0.25 && ((h <= 18) || (h >= 340))) red++;
          if (s >= 0.3 && v >= 0.30 && h >= 18 && h <= 30) orange++;
          if (s >= 0.3 && v >= 0.20 && h >= 70 && h <= 150) green++;
        }
        return {
          w: c.width, h: c.height, totalPx: c.width * c.height,
          topColors: sorted.map(([k, n]) => ({ key: k, n })),
          sat30Px: sat30, redPx: red, orangePx: orange, greenPx: green,
        };
      }, captured.frames[0]);
      console.log(`\n=== Frame 0 stats ===`);
      console.log(JSON.stringify(stats, null, 2));
    }

    expect(true).toBe(true);
  });
});
