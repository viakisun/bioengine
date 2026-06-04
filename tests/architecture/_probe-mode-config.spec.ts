// ★ S136-B 검증 — mode selector → quality → SceneInfrastructure wire.

import { test } from '@playwright/test';

test('S136-B mode greenhouse config wire', async ({ page }) => {
  test.setTimeout(120_000);

  // ?mode=greenhouse로 selector 우회, default quality 사용 (extraPlants=14)
  await page.goto('http://localhost:8090/?mode=greenhouse', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);

  const state = await page.evaluate(() => {
    const w = window as unknown as {
      __lastPlantBase?: unknown;
      __scene?: { meshes: Array<{ name: string; isVisible: boolean }> };
    };
    const scene = w.__scene;
    const skinPlants = scene?.meshes.filter((m) =>
      m.name.match(/^skinplant_\w+_(\d+)$/),
    ) ?? [];
    const uniqueSeeds = [...new Set(skinPlants.map((m) => m.name.match(/_(\d+)$/)?.[1]).filter(Boolean))];
    return {
      hasPlantBase: !!w.__lastPlantBase,
      skinPlantMeshes: skinPlants.length,
      uniquePlantSeeds: uniqueSeeds,
      plantCount: uniqueSeeds.length,
    };
  });

  console.log('\n=== S136-B mode=greenhouse ===');
  console.log(JSON.stringify(state, null, 2));
  console.log('Expected plantCount: 15 (1 showcase + 14 extras)');
});
