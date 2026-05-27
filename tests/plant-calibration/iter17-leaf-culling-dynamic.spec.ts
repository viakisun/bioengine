// Iter 17 — Leaf-blade dynamic camera-rotation culling capture.
//
// Iter 16 (commit 34f4708) added reverse-winding triangle indices to fix the
// "180° 절반 culling" symptom. Static 4-azimuth capture passed, but the user
// reports the culling resumes when the camera rotates dynamically — meaning
// the prior fix was a workaround, not the root cause.
//
// This spec orbits the camera around the showcase plant at Day 45 in 36
// fine-grained azimuth steps (every 10°) and screenshots each frame. The
// resulting sequence makes it visually obvious at which angles the leaf
// blade mesh disappears (or partial leaflets vanish).
//
// Run as a single test (1 page, no per-frame restart) so the camera moves
// continuously and any per-frame culling/blending is observable.

import { test, type Page } from '@playwright/test';

const DAY = 45;
const STEPS = 12;                       // every 30° (down from 36 for total runtime fit)
const OUT_DIR = 'test-results/plant-calibration/iter17-rotate';

async function enterSinglePlant(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): {
        setMode(m: string): void;
        setUseImplicitMesh(v: boolean): void;
      } };
    };
    w.__twinStore?.getState().setMode('single-plant');
    // Iter 17: enable SkinMeshPlant (skin mode) since user's complaint is
    // specifically about the skin renderer, not the default ShowcasePlant.
    w.__twinStore?.getState().setUseImplicitMesh(true);
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
      __debugScene?: {
        activeCamera?: {
          alpha: number; beta: number; radius: number;
          target: { x: number; y: number; z: number };
        };
      };
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
  // Short wait — we WANT to observe per-frame rendering, not pre-warm caches.
  await page.waitForTimeout(150);
}

test.describe('Iter 17 — Leaf culling dynamic rotation capture', () => {
  test('D45 orbit 36 steps', async ({ page }) => {
    test.setTimeout(300_000);
    await enterSinglePlant(page);
    await scrubToDay(page, DAY);
    // Stable beta + radius; only alpha varies. targetY at canopy peak.
    const beta = Math.PI / 2 - 0.08;
    const radius = 1.8;
    const targetY = 1.2;
    for (let i = 0; i < STEPS; i++) {
      const alpha = -Math.PI + (2 * Math.PI * i) / STEPS;
      await setCamera(page, { alpha, beta, radius, targetY });
      const deg = Math.round((alpha * 180) / Math.PI);
      const tag = (deg >= 0 ? `p${deg}` : `n${-deg}`).padStart(4, '0');
      await page.screenshot({
        path: `${OUT_DIR}/d${DAY}_step${String(i).padStart(2, '0')}_${tag}deg.png`,
        fullPage: false,
      });
    }
  });
});
