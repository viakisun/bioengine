// Iter 18B PR 1 self-test — verifies fidelity-assert + pixel-diff infra works
// against the live SkinMeshPlant at D45.

import { test, expect, type Page } from '@playwright/test';
import {
  readSkinplantStats,
  runInvariants,
  INV_NO_MAIN_STEM_MISSING,
  INV_GRAPH_EQ_EMITTED,
  INV_FLOATING_LOW,
  INV_FLOATING_ZERO,
} from '../lib/fidelity-assert';

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

test('PR 1 self-test — fidelity-assert reads stats + invariants pass/fail as expected', async ({ page }) => {
  test.setTimeout(60_000);
  await enterSkin(page);
  const stats = await readSkinplantStats(page);
  expect(stats, 'window.__skinplantStats should be available').not.toBeNull();

  const report = runInvariants(stats!, [
    INV_NO_MAIN_STEM_MISSING,
    INV_GRAPH_EQ_EMITTED,
    INV_FLOATING_LOW,    // Iter 18A baseline 140 → should PASS
    INV_FLOATING_ZERO,   // intentional FAIL (Phase B 후 fix 대상)
  ]);
  // eslint-disable-next-line no-console
  console.log('[PR 1 self-test] passed:', report.passed.map((i) => i.name));
  // eslint-disable-next-line no-console
  console.log('[PR 1 self-test] failed:', report.failed.map((f) => `${f.inv.name}: ${f.message}`));

  // Expected: 3 pass, 1 fail (INV_FLOATING_ZERO)
  expect(report.passed.length).toBe(3);
  expect(report.failed.length).toBe(1);
  expect(report.failed[0].inv.name).toBe('floatingCandidateCount === 0');
});

import { promises as fs } from 'node:fs';
import { compareImages } from '../lib/pixel-diff';

test('PR 1 self-test — pixel-diff compares an image against itself = 0% diff', async ({ page }) => {
  test.setTimeout(30_000);
  await enterSkin(page);
  const tmpDir = 'test-results/plant-calibration/iter18b-pr01-pixel/';
  await fs.mkdir(tmpDir, { recursive: true });
  const p = `${tmpDir}selftest.png`;
  await page.screenshot({ path: p, fullPage: false });
  const result = await compareImages(p, p, { threshold: 0.05 });
  expect(result.overall.diffPct).toBe(0);
  for (const r of result.regions) expect(r.diffPct).toBe(0);
});
