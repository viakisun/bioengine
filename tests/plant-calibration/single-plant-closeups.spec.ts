// Single-plant 근접 촬영 — v0.8-botanical baseline snapshot harness.
//
// Day 30 / 60 / 90 × 3 view (front / side / closeup-truss) = 9 screenshots.
// SHOWCASE_SEED 고정, single-plant 모드 강제 진입 (hash routing이 initial
// load 시 fire 안 되므로 store.setMode 직접 호출).

import { test, type Page } from '@playwright/test';

const DAYS = [30, 60, 90];
const VIEWS = {
  // Plant 전체가 화면에 들어오는 정면/측면 거리 + 화방 근접.
  // single-plant preset radius=5.0 → 더 가까이 (1.8m) 로 좁힘.
  front:   { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.08, radius: 1.8, targetY: 1.2 },
  side:    { alpha: 0,            beta: Math.PI / 2 - 0.08, radius: 1.8, targetY: 1.2 },
  // 화방 + 상단 잎 근접 (높은 day 대응 위해 targetY 적당히 위)
  truss:   { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.20, radius: 0.9, targetY: 1.6 },
} as const;

async function enterSinglePlant(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // Force single-plant via store.setMode (initial hash load doesn't fire hashchange)
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void } };
    };
    w.__twinStore?.getState().setMode('single-plant');
  });
  // Scene transition + camera preset apply + progressive load.
  await page.waitForTimeout(5000);
}

async function scrubToDay(page: Page, day: number) {
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  // Simulation step + skin mesh rebuild.
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

test.describe('Single-plant 근접 촬영 (v0.8-botanical baseline)', () => {
  test.beforeAll(async ({ browser }) => {
    // Warm-up: open one page to trigger scene boot, then close.
    // This avoids long boot time on the first real test.
    const page = await browser.newPage();
    await enterSinglePlant(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await enterSinglePlant(page);
    // Hide every absolute-positioned overlay so canvas dominates.
    await page.addStyleTag({
      content: `
        body > div:not(#root) { display: none !important; }
        #root > div > div:not(:has(canvas)) { display: none !important; }
        div[style*="position: absolute"]:not(:has(canvas)) { display: none !important; }
        div[style*="position:absolute"]:not(:has(canvas)) { display: none !important; }
        canvas { width: 100vw !important; height: 100vh !important; position: fixed !important; top: 0 !important; left: 0 !important; z-index: 1 !important; }
      `,
    });
    await page.waitForTimeout(500);
  });

  for (const day of DAYS) {
    for (const [name, view] of Object.entries(VIEWS)) {
      test(`day ${day} ${name}`, async ({ page }) => {
        await scrubToDay(page, day);
        await setCamera(page, view);
        await page.waitForTimeout(800);
        await page.screenshot({
          path: `test-results/plant-calibration/day${day}_${name}.png`,
          fullPage: false,
        });
      });
    }
  }
});
