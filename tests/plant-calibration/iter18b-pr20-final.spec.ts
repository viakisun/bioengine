// Iter 18B PR 20 — Final visual capture for user approval.
//
// D45 showcase + 3 seeds × 12 azimuth × stem/full views.
// Saved to test-results/iter18b-final/. User reviews on wake.

import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';

const DAYS = [45];
const SEEDS = [20260520, 20260521, 20260522];  // showcase + 2 nearby
const AZIMUTHS = 12;
const OUT_DIR = 'test-results/iter18b-final';

async function enterSkin(page: Page, seed: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): {
        setMode(m: string): void; setUseImplicitMesh(v: boolean): void;
      } };
    };
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
  });
  await page.waitForTimeout(3000);
  // SHOWCASE_SEED is fixed in scene; varying seed requires picking a different
  // plant. For PR 20 final capture we just use the existing showcase plant
  // and vary day (1 seed × 1 day for runtime, but expand-ready).
  void seed;
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(45 * 1440 + 12 * 60);
  });
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
  await page.waitForTimeout(400);
}

async function setView(page: Page, mode: 'stem' | 'full') {
  await page.evaluate((m) => {
    const w = window as unknown as { __skinplantView?: (m: string) => void };
    w.__skinplantView?.(m);
  }, mode);
  await page.waitForTimeout(300);
}

test('PR 20 — final visual capture (sleep mode, user approve on wake)', async ({ page }) => {
  test.setTimeout(700_000);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await enterSkin(page, SEEDS[0]);

  // Final acceptance report snapshot for the audit log.
  const stats = await page.evaluate(() => {
    const w = window as unknown as { __skinplantStats?: unknown };
    return w.__skinplantStats ?? null;
  });
  await fs.writeFile(`${OUT_DIR}/final-stats.json`, JSON.stringify(stats, null, 2));

  for (const day of DAYS) {
    void day;  // day already set in enterSkin
    for (let i = 0; i < AZIMUTHS; i++) {
      const alpha = -Math.PI + (2 * Math.PI * i) / AZIMUTHS;
      const deg = Math.round((alpha * 180) / Math.PI);
      const tag = `${i.toString().padStart(2, '0')}_${deg >= 0 ? 'p' : 'n'}${Math.abs(deg)}deg`;
      await setCamera(page, alpha);
      for (const mode of ['stem', 'full'] as const) {
        await setView(page, mode);
        await page.screenshot({
          path: `${OUT_DIR}/d45_${tag}_${mode}.png`,
          fullPage: false,
        });
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[PR 20 FINAL] captured ${AZIMUTHS * 2} images + final-stats.json → ${OUT_DIR}/`);
  // eslint-disable-next-line no-console
  console.log('[PR 20 FINAL] User approve gate — review images on wake.');
});
