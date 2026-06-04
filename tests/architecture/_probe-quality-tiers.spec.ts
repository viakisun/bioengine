// S138 — quality tier 별 다중 plant 렌더 스크린샷 비교.
// extraPlants=8로 고정, mode=greenhouse + level만 변경.
import { test } from '@playwright/test';

const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;

for (const q of QUALITY_LEVELS) {
  test(`greenhouse quality=${q}`, async ({ page }) => {
    test.setTimeout(120_000);
    // mode 진입 + URL extraPlants=8로 적당히 줄여 빠른 측정.
    await page.goto(`http://localhost:8090/?mode=greenhouse&extraPlants=8&quality=${q}`, {
      waitUntil: 'domcontentloaded',
    });
    // 부팅 + 카메라 settle 대기. high는 30 plants × 'high' (시간 오래).
    await page.waitForTimeout(q === 'high' ? 60_000 : q === 'medium' ? 30_000 : 15_000);
    await page.screenshot({
      path: `test-results/quality-tier-${q}.png`,
      fullPage: false,
      timeout: 45_000,
    });
  });
}
