// Iter 18B PR 14 — Organ position-assert spec.
//
// Runs the browser-side position-assert script (tests/lib/position-assert.ts)
// against the live D45 showcase plant and verifies every leaf_blade
// OrganAnchor's mesh sits within 1mm of the SkeletonGraph anchor node.

import { test, expect, type Page } from '@playwright/test';
import { buildPositionAssertScript } from '../lib/position-assert';

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
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(45 * 1440 + 12 * 60);
  });
  await page.waitForTimeout(3500);
}

test('PR 14 — leaf_blade organ-anchor position-assert (D45 showcase)', async ({ page }) => {
  test.setTimeout(60_000);
  await enterSkin(page);
  const TOLERANCE_M = 0.001;  // 1mm — per Plan PR 14 spec
  const report = await page.evaluate(buildPositionAssertScript(TOLERANCE_M));
  expect(report, 'position-assert returned non-null report').not.toBeNull();
  // eslint-disable-next-line no-console
  console.log(`[PR 14 position-assert] total=${report!.total} passed=${report!.passed} failed=${report!.failed}`);
  if (report!.failed > 0) {
    // eslint-disable-next-line no-console
    console.log('[PR 14 position-assert] failures (first 5):', report!.findings.filter(f => !f.pass).slice(0, 5));
  }
  expect(report!.failed).toBe(0);
});
