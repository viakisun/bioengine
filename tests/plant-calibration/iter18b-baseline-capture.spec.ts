// Iter 18B PR 2 — Phase baseline capture spec.
//
// Run with PHASE env var to choose target dir:
//   PHASE=A npx playwright test tests/plant-calibration/iter18b-baseline-capture.spec.ts
//   → captures into test-results/baseline/phase-A/
//
// Captures D45 showcase plant × 12 azimuth × 2 views (stem-only + full).
// Used by PR 3 (Phase A baseline) and Phase B/C/D/E/F boundaries.

import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';

const PHASE = process.env.PHASE ?? 'A';
const DAY = 45;
const AZIMUTHS = 12;
const OUT_DIR = `test-results/baseline/phase-${PHASE}`;

async function enterSkin(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): {
        setMode(m: string): void; setUseImplicitMesh(v: boolean): void;
      } };
    };
    w.__twinStore?.getState().setMode('single-plant');
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
  });
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, DAY);
  await page.waitForTimeout(3500);
}

async function setCamera(page: Page, alpha: number) {
  await page.evaluate(({ a }) => {
    const w = window as unknown as {
      __debugScene?: { activeCamera?: { alpha: number; beta: number; radius: number; target: { x: number; y: number; z: number } } };
    };
    const cam = w.__debugScene?.activeCamera;
    if (!cam) throw new Error('no camera');
    cam.alpha = a;
    cam.beta = Math.PI / 2 - 0.08;
    cam.radius = 1.8;
    cam.target.x = 0; cam.target.y = 1.2; cam.target.z = 0;
  }, { a: alpha });
  await page.waitForTimeout(500);
}

async function setView(page: Page, mode: 'stem' | 'full') {
  await page.evaluate((m) => {
    const w = window as unknown as { __skinplantView?: (m: string) => void };
    w.__skinplantView?.(m);
  }, mode);
  await page.waitForTimeout(300);
}

test(`Phase ${PHASE} baseline capture — D45 × ${AZIMUTHS} azimuth × stem/full`, async ({ page }) => {
  test.setTimeout(600_000);  // 10min — self-heal shot 1 (PR 3 timeout fix)
  await fs.mkdir(OUT_DIR, { recursive: true });
  await enterSkin(page);

  // Save stats snapshot once.
  const stats = await page.evaluate(() => {
    const w = window as unknown as { __skinplantStats?: unknown };
    return w.__skinplantStats ?? null;
  });
  await fs.writeFile(`${OUT_DIR}/stats.json`, JSON.stringify(stats, null, 2));

  for (let i = 0; i < AZIMUTHS; i++) {
    const alpha = -Math.PI + (2 * Math.PI * i) / AZIMUTHS;
    const deg = Math.round((alpha * 180) / Math.PI);
    const tag = `${i.toString().padStart(2, '0')}_${deg >= 0 ? 'p' : 'n'}${Math.abs(deg)}deg`;
    await setCamera(page, alpha);
    for (const mode of ['stem', 'full'] as const) {
      await setView(page, mode);
      await page.screenshot({ path: `${OUT_DIR}/d${DAY}_${tag}_${mode}.png`, fullPage: false });
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[baseline phase-${PHASE}] captured ${AZIMUTHS * 2} images + stats.json → ${OUT_DIR}/`);
});
