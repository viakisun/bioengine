// Screenshot: 새 LoadingScreen 확인. greenhouse mid quality 진입 시 보이는 dark loading.
import { test } from '@playwright/test';

test('phytosim loading screen', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('http://localhost:8090/?mode=greenhouse', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/phytosim-loading.png', fullPage: false, timeout: 45_000 });
});
