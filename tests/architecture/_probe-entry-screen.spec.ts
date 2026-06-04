// Screenshot: 새 EntryScreen 확인.
import { test } from '@playwright/test';

test('phytosim entry screen', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('http://localhost:8090/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/phytosim-entry.png', fullPage: false });
});
