// Screenshot probe — 현재 실제 보이는 상태.

import { test } from '@playwright/test';

test('screenshot greenhouse mode', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('http://localhost:8090/?mode=greenhouse', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);

  // 카메라 정보 확인
  const camInfo = await page.evaluate(() => {
    const w = window as unknown as {
      __camera?: { position?: { x: number; y: number; z: number }; target?: { x: number; y: number; z: number } };
    };
    return w.__camera ? {
      pos: w.__camera.position,
      target: w.__camera.target,
    } : null;
  });
  console.log('Camera:', JSON.stringify(camInfo, null, 2));

  await page.screenshot({ path: 'test-results/greenhouse-current.png', fullPage: false });
  console.log('Screenshot: test-results/greenhouse-current.png');
});
