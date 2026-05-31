// Iter 16 — Early Vegetative/Reproductive Onset visual check.
//
// Verifies the CoreModel truss emergence fix (SSOT #168) + plantStageLabel
// tightening (SSOT #165). Captures D5/10/15/20/24/29/30/35/40/45/50 front
// + a D24 truss-area closeup at the moment when "착과비대기" used to fire.
//
// Pass criteria (audit, not asserted):
//   - D5/10/15/20/23: 영양생장기, no truss, juvenile-looking foliage
//   - D24: 화방 분화기, 1 truss bud, NO red fruit
//   - D29: 착과기, small green at 3mm, NO red fruit
//   - D45+: 착과비대기 OK

import { test, type Page } from '@playwright/test';

const DAYS = [5, 10, 15, 20, 24, 29, 30, 35, 40, 45, 50];

const VIEWS = {
  front: { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.08, radius: 1.8, targetY: 1.2 },
  truss: { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.20, radius: 0.9, targetY: 1.4 },
} as const;

async function enterSinglePlant(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void } };
    };
  });
  await page.waitForTimeout(5000);
}

async function scrubToDay(page: Page, day: number) {
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(2500);
}

async function setCamera(
  page: Page,
  view: { alpha: number; beta: number; radius: number; targetY: number },
) {
  await page.evaluate(({ alpha, beta, radius, targetY }) => {
    const w = window as unknown as {
      __debugScene?: { activeCamera?: { alpha: number; beta: number; radius: number; target: { x: number; y: number; z: number } } };
    };
    const cam = w.__debugScene?.activeCamera;
    if (!cam) throw new Error('no active camera');
    cam.alpha = alpha;
    cam.beta = beta;
    cam.radius = radius;
    cam.target.x = 0;
    cam.target.y = targetY;
    cam.target.z = 0;
  }, view);
  await page.waitForTimeout(800);
}

test.describe('Iter 16 — Early Onset visual check (post engine + label fix)', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await enterSinglePlant(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await enterSinglePlant(page);
  });

  for (const day of DAYS) {
    test(`day ${day} front (full plant)`, async ({ page }) => {
      await scrubToDay(page, day);
      await setCamera(page, VIEWS.front);
      await page.waitForTimeout(800);
      await page.screenshot({
        path: `test-results/plant-calibration/iter16/day${String(day).padStart(2, '0')}_front.png`,
        fullPage: false,
      });
    });
  }

  // Closeup of D24/D29 truss zone (the scene of the original "빨간 토마토" complaint).
  for (const day of [24, 29]) {
    test(`day ${day} truss closeup`, async ({ page }) => {
      await scrubToDay(page, day);
      await setCamera(page, VIEWS.truss);
      await page.waitForTimeout(800);
      await page.screenshot({
        path: `test-results/plant-calibration/iter16/day${String(day).padStart(2, '0')}_truss_closeup.png`,
        fullPage: false,
      });
    });
  }

  // Multi-angle rotation check (Issue B — 180° backface-culling regression).
  // Pause timeline; capture D29 + D45 at 4 azimuths. If only half the leaves
  // render at some angles, the leaf-blade mesh is still single-sided.
  for (const day of [29, 45]) {
    for (const alpha of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
      const tag = `a${alpha.toFixed(2).replace('-', 'n').replace('.', '_')}`;
      test(`day ${day} azimuth ${alpha.toFixed(2)} (B 180° check)`, async ({ page }) => {
        await scrubToDay(page, day);
        await setCamera(page, { alpha, beta: Math.PI / 2 - 0.08, radius: 1.8, targetY: 1.2 });
        await page.waitForTimeout(800);
        await page.screenshot({
          path: `test-results/plant-calibration/iter16/day${String(day).padStart(2, '0')}_${tag}.png`,
          fullPage: false,
        });
      });
    }
  }
});
