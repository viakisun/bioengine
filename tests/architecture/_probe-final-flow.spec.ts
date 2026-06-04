// S141 + S138-S140 종합 검증: EntryScreen + LoadingScreen + Scene 전체.
import { test } from '@playwright/test';

test('entry screen renders after code split', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('http://localhost:8090/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500); // CSS load + entry render
  await page.screenshot({
    path: 'test-results/final-entry.png',
    fullPage: false,
    timeout: 30_000,
  });
});

test('scene loads after Launch via lazy chunk', async ({ page }) => {
  test.setTimeout(120_000);
  // Direct skip — code-split chunks still apply.
  await page.goto('http://localhost:8090/?mode=greenhouse&extraPlants=8&quality=medium', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(45_000); // lazy chunk + build
  await page.screenshot({
    path: 'test-results/final-scene.png',
    fullPage: false,
    timeout: 45_000,
  });
});
