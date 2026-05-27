// Iter 18A Phase 1.2 + 1.3 — capture stem-only / truss-only / leaf-only /
// full views + skeleton overlay for topology diff. D45 showcase, single
// camera angle that shows the floating-fragment issue clearly.

import { test, type Page } from '@playwright/test';

const DAY = 45;
const OUT_DIR = 'test-results/plant-calibration/iter18-views';

async function enterSkin(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);  // wait for greenhouse + plant init
  // Force OFF → ON cycle so the subscriber sees a definite false→true delta
  // even if it was missed during boot.
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

async function setCamera(page: Page, alpha: number) {
  await page.evaluate(({ a }) => {
    const w = window as unknown as {
      __debugScene?: { activeCamera?: { alpha: number; beta: number; radius: number; target: { x: number; y: number; z: number } } };
    };
    const cam = w.__debugScene?.activeCamera;
    if (!cam) throw new Error('no camera');
    cam.alpha = a;
    cam.beta = Math.PI / 2 - 0.15;
    cam.radius = 1.4;
    cam.target.x = 0; cam.target.y = 1.4; cam.target.z = 0;
  }, { a: alpha });
  await page.waitForTimeout(500);
}

async function setView(page: Page, mode: 'stem' | 'truss' | 'leaf' | 'full') {
  await page.evaluate((m) => {
    const w = window as unknown as { __skinplantView?: (m: string) => void };
    w.__skinplantView?.(m);
  }, mode);
  await page.waitForTimeout(400);
}

test('Phase 1.2/1.3 — view toggle captures @ D45', async ({ page }) => {
  test.setTimeout(180_000);
  await enterSkin(page);
  // Camera ~-90° (perpendicular to greenhouse row — full plant profile).
  await setCamera(page, -Math.PI / 2);

  for (const mode of ['full', 'stem', 'truss', 'leaf'] as const) {
    await setView(page, mode);
    const enabledReport = await page.evaluate(() => {
      const scene = (window as unknown as { __debugScene?: { meshes: Array<{ name: string; isEnabled(): boolean }> } }).__debugScene;
      if (!scene) return null;
      const groups = { stem: 0, leaf: 0, truss: 0, cot: 0, other: 0 };
      const enabled = { stem: 0, leaf: 0, truss: 0, cot: 0, other: 0 };
      for (const m of scene.meshes) {
        let g: keyof typeof groups = 'other';
        if (m.name.startsWith('skinplant_skin_')) g = 'stem';
        else if (m.name.startsWith('skinplant_leaf_')) g = 'leaf';
        else if (m.name.startsWith('skinplant_truss_')) g = 'truss';
        else if (m.name.startsWith('skinplant_cot_')) g = 'cot';
        groups[g]++;
        if (m.isEnabled()) enabled[g]++;
      }
      return { groups, enabled };
    });
    console.log(`view=${mode}`, JSON.stringify(enabledReport));
    await page.screenshot({
      path: `${OUT_DIR}/d${DAY}_skin_${mode}.png`,
      fullPage: false,
    });
  }

  // Same camera, skeleton overlay (toggle via store).
  await setView(page, 'full');  // restore for skeleton render
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setShowSkeleton(v: boolean): void } };
    };
    w.__twinStore?.getState().setShowSkeleton(true);
  });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: `${OUT_DIR}/d${DAY}_skeleton_overlay.png`,
    fullPage: false,
  });
});
