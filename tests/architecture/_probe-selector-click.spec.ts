// ★ S136-B — Selector 진입 경로 검증 (실제 click flow).

import { test } from '@playwright/test';

test('S136-B selector → greenhouse 진입', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('http://localhost:8090/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // 1) ModeSelector 표시 확인
  const selectorVisible = await page.evaluate(() => {
    return document.body.innerText.includes('단일 식물') || document.body.innerText.includes('FarmSim');
  });
  console.log('Selector visible:', selectorVisible);

  // 2) "온실 모드" 카드 클릭
  await page.evaluate(() => {
    const cards = document.querySelectorAll('h2');
    for (const c of cards) {
      if (c.textContent?.includes('온실')) {
        (c.closest('div') as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  // 3) "진입 →" 버튼 클릭
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      if (b.textContent?.includes('진입')) {
        b.click();
        break;
      }
    }
  });
  await page.waitForTimeout(15000);

  // 4) 식물 수 측정
  const state = await page.evaluate(() => {
    const w = window as unknown as {
      __scene?: { meshes: Array<{ name: string }> };
    };
    const meshes = w.__scene?.meshes ?? [];
    const plantSeeds = [...new Set(
      meshes.map((m) => {
        const mm = m.name.match(/^skinplant_(stem|leaf|fruit|truss|cot|skin)_(\d+)$/);
        return mm?.[2];
      }).filter(Boolean)
    )];
    return {
      totalMeshes: meshes.length,
      plantCount: plantSeeds.length,
      plantSeeds,
    };
  });

  console.log('\n=== Selector click → greenhouse ===');
  console.log(JSON.stringify(state, null, 2));
  console.log('Expected: 15 plants (showcase + 14 extras)');
});
