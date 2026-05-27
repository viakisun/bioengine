// Iter 20 PR 6 — petiole-stem junction overlay capture spec.
//
// Activates the overlay via window.__dockingOverlay({enable:true}), then
// captures D45 + D99 across 8 azimuth × Skin + Skeleton modes = 32 shots.
// Also dumps the per-petiole junction JSON for Phase G diagnosis report.
//
// Sanity check: counts purple/yellow/orange/red pixels per shot to confirm
// the overlay actually rendered (catches regressions silently dropping the
// markers).

import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';
import { PNG } from 'pngjs';

const DAYS = [45, 99];
const AZIMUTHS = 8;
const OUT_DIR = 'test-results/iter20-petiole-junction';

async function enterScene(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): {
        setMode(m: string): void; setUseImplicitMesh(v: boolean): void;
      } };
    };
    w.__twinStore?.getState().setMode('single-plant');
    w.__twinStore?.getState().setUseImplicitMesh(false);  // start in Skeleton mode
  });
  await page.waitForTimeout(1000);
  // Bring Skin once so all data publishes, then we'll toggle per-shot.
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setUseImplicitMesh(true);
  });
  await page.waitForTimeout(3000);
}

async function scrubToDay(page: Page, day: number) {
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

async function setMode(page: Page, mode: 'skin' | 'skeleton') {
  await page.evaluate((m) => {
    const w = window as unknown as {
      __twinStore?: { getState(): {
        setUseImplicitMesh(v: boolean): void;
        setShowSkeleton(v: boolean): void;
      } };
    };
    const s = w.__twinStore?.getState();
    s?.setUseImplicitMesh(m === 'skin');
    // Skeleton-mode capture: also enable the showSkeleton wireframe overlay
    // so the petiole-junction markers appear over the skeleton lines.
    s?.setShowSkeleton(m === 'skeleton');
  }, mode);
  await page.waitForTimeout(1500);
}

async function enableOverlay(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __dockingOverlay?: (opts: {
        enable: boolean; edgeTypes?: string[]; focus?: string; labelMode?: string;
      }) => void;
    };
    w.__dockingOverlay?.({
      enable: true,
      edgeTypes: ['petiole'],
      focus: 'stem-junction',
      labelMode: 'all',
    });
  });
  await page.waitForTimeout(800);
}

async function setCamera(page: Page, alpha: number, day: number) {
  // Plant root at world Y ≈ SUBSTRATE_TOP_Y (~1.06m). Local coords are
  // additive — D45 leaves world Y ≈ 1.4-1.7, D99 leaves ≈ 1.5-2.5.
  const isYoung = day < 60;
  await page.evaluate(({ a, isYoung }) => {
    const w = window as unknown as {
      __debugScene?: { activeCamera?: { alpha: number; beta: number; radius: number; target: { x: number; y: number; z: number } } };
    };
    const cam = w.__debugScene?.activeCamera;
    if (!cam) throw new Error('no camera');
    cam.alpha = a;
    cam.beta = Math.PI / 2 - 0.1;
    cam.radius = isYoung ? 0.9 : 1.6;
    cam.target.x = 0;
    cam.target.y = isYoung ? 1.4 : 1.6;
    cam.target.z = 0;
  }, { a: alpha, isYoung });
  await page.waitForTimeout(500);
}

interface PixelSanity { purple: number; yellow: number; orange: number; red: number; total: number; }

async function countMarkerPixels(filePath: string): Promise<PixelSanity> {
  const data = await fs.readFile(filePath);
  const png = await new Promise<PNG>((resolve, reject) => {
    new PNG().parse(data, (err, p) => err ? reject(err) : resolve(p));
  });
  let purple = 0, yellow = 0, orange = 0, red = 0;
  const buf = png.data;
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    // approximate matches around the palette constants in markerPrimitives.ts
    if (r > 110 && r < 170 && g < 80 && b > 180) purple++;          // ~(140,51,217)
    else if (r > 220 && g > 200 && b < 80) yellow++;                // ~(255,217,26)
    else if (r > 220 && g > 90 && g < 140 && b < 50) orange++;      // ~(255,115,26)
    else if (r > 220 && g < 60 && b < 60) red++;                    // ~(255,26,26)
  }
  return { purple, yellow, orange, red, total: png.width * png.height };
}

async function captureJsonDump(page: Page, day: number) {
  const pairs = await page.evaluate(() => {
    const w = window as unknown as { __dockingJunctionPairs?: unknown };
    return w.__dockingJunctionPairs ?? null;
  });
  await fs.writeFile(
    `${OUT_DIR}/petiole-junctions-d${day}.json`,
    JSON.stringify(pairs, null, 2),
  );
}

test('Iter 20 PR 6 — petiole-stem junction overlay capture (32 shots)', async ({ page }) => {
  test.setTimeout(900_000);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await enterScene(page);

  const sanityLines: string[] = [
    'Iter 20 PR 6 — overlay marker pixel sanity per shot',
    'shot                              | purple | yellow | orange |   red',
    '----------------------------------+--------+--------+--------+------',
  ];

  for (const day of DAYS) {
    await scrubToDay(page, day);

    // Bring Skin mode visible so pairs are freshly published.
    await setMode(page, 'skin');
    await enableOverlay(page);
    await captureJsonDump(page, day);

    for (const mode of ['skin', 'skeleton'] as const) {
      await setMode(page, mode);
      // Re-enable overlay (mode swap could trigger rebuild w/o overlay).
      await enableOverlay(page);
      for (let i = 0; i < AZIMUTHS; i++) {
        const alpha = -Math.PI + (2 * Math.PI * i) / AZIMUTHS;
        const deg = Math.round((alpha * 180) / Math.PI);
        const tag = `${i.toString().padStart(2, '0')}_${deg >= 0 ? 'p' : 'n'}${Math.abs(deg)}deg`;
        await setCamera(page, alpha, day);
        const filePath = `${OUT_DIR}/d${day}_${mode}_${tag}.png`;
        await page.screenshot({ path: filePath, fullPage: false });
        const pix = await countMarkerPixels(filePath);
        const shotId = `d${day}_${mode}_${tag}`.padEnd(34);
        sanityLines.push(
          `${shotId} | ${pix.purple.toString().padStart(6)} | ${pix.yellow.toString().padStart(6)} | ${pix.orange.toString().padStart(6)} | ${pix.red.toString().padStart(5)}`,
        );
      }
    }
  }

  await fs.writeFile(`${OUT_DIR}/marker-pixel-sanity.txt`, sanityLines.join('\n'));
  // eslint-disable-next-line no-console
  console.log(sanityLines.slice(0, 20).join('\n'));
  console.log(`[iter20] sanity table → ${OUT_DIR}/marker-pixel-sanity.txt`);
});
