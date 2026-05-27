// Iter 18A Phase 5 — final fidelity verification.
//
// Captures SkinMeshPlant @ D45 from multiple cameras and view modes to
// validate the 6 Acceptance Criteria (no floating fragment, SkeletonGraph
// as single source of truth, organ lifecycle unified, junction welded,
// topology 1:1).

import { test, type Page } from '@playwright/test';

const DAY = 45;
const OUT_DIR = 'test-results/plant-calibration/iter18-fidelity';

async function enterSkin(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): {
        setMode(m: string): void;
        setUseImplicitMesh(v: boolean): void;
      } };
    };
    w.__twinStore?.getState().setMode('single-plant');
    w.__twinStore?.getState().setUseImplicitMesh(false);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setUseImplicitMesh(true);
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

async function setCamera(
  page: Page,
  view: { alpha: number; beta: number; radius: number; targetY: number },
) {
  await page.evaluate(({ alpha, beta, radius, targetY }) => {
    const w = window as unknown as {
      __debugScene?: { activeCamera?: { alpha: number; beta: number; radius: number; target: { x: number; y: number; z: number } } };
    };
    const cam = w.__debugScene?.activeCamera;
    if (!cam) throw new Error('no camera');
    cam.alpha = alpha; cam.beta = beta; cam.radius = radius;
    cam.target.x = 0; cam.target.y = targetY; cam.target.z = 0;
  }, view);
  await page.waitForTimeout(400);
}

async function setView(page: Page, mode: 'stem' | 'truss' | 'leaf' | 'full') {
  await page.evaluate((m) => {
    const w = window as unknown as { __skinplantView?: (m: string) => void };
    w.__skinplantView?.(m);
  }, mode);
  await page.waitForTimeout(300);
}

test('Phase 5 — fidelity capture (Acceptance Criteria check)', async ({ page }) => {
  test.setTimeout(240_000);
  await enterSkin(page);

  // Closeup of a single petiole/main-stem junction (low height, close camera).
  await setCamera(page, { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.1, radius: 0.6, targetY: 0.6 });
  for (const mode of ['stem', 'full'] as const) {
    await setView(page, mode);
    await page.screenshot({ path: `${OUT_DIR}/closeup_junction_${mode}.png`, fullPage: false });
  }

  // Mid-plant petiole junction.
  await setCamera(page, { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.2, radius: 0.5, targetY: 1.2 });
  for (const mode of ['stem', 'full'] as const) {
    await setView(page, mode);
    await page.screenshot({ path: `${OUT_DIR}/closeup_mid_${mode}.png`, fullPage: false });
  }

  // 12-azimuth full plant orbit (stem-only view to check topology consistency).
  await setView(page, 'stem');
  for (let i = 0; i < 12; i++) {
    const alpha = -Math.PI + (2 * Math.PI * i) / 12;
    await setCamera(page, { alpha, beta: Math.PI / 2 - 0.1, radius: 1.8, targetY: 1.2 });
    const deg = Math.round((alpha * 180) / Math.PI);
    await page.screenshot({
      path: `${OUT_DIR}/orbit_stem_${String(i).padStart(2, '0')}_${deg >= 0 ? 'p' : 'n'}${Math.abs(deg)}deg.png`,
      fullPage: false,
    });
  }

  // Final stats dump (Acceptance Criteria #1 floating count check).
  const stats = await page.evaluate(() => {
    const w = window as unknown as { __skinplantStats?: { floatingCandidateCount: number; renderRadiusByType: Record<string, { min: number }> } };
    return w.__skinplantStats ?? null;
  });
  console.log('FIDELITY STATS:', JSON.stringify(stats, null, 2));
});
