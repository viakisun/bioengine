// Iter 18A Phase 1.1 — capture window.__skinplantStats after entering
// single-plant skin mode at Day 45 (showcase plant), to verify the
// per-edge-type fidelity breakdown wired in StemFamilyTubeNetworkBuilder.

import { test, expect, type Page } from '@playwright/test';

async function enterSkinSinglePlant(page: Page) {
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
    w.__twinStore?.getState().setUseImplicitMesh(true);
  });
  await page.waitForTimeout(5000);
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, 45);
  await page.waitForTimeout(3500);
}

test('Phase 1.1 — __skinplantStats per-edge-type dump exists at D45', async ({ page }) => {
  test.setTimeout(60_000);
  await enterSkinSinglePlant(page);
  const stats = await page.evaluate(() => {
    const w = window as unknown as { __skinplantStats?: unknown };
    return w.__skinplantStats ?? null;
  });
  // eslint-disable-next-line no-console
  console.log('STATS DUMP:', JSON.stringify(stats, null, 2));
  expect(stats).not.toBeNull();
});
