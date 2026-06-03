// ★ S132 — 두 URL의 boot 결과 비교.
// 사용자 진단: ?leafBuilder=v2는 되는데 URL 없으면 안 됨.

import { test } from '@playwright/test';

async function probe(page: import('@playwright/test').Page, url: string) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`CONSOLE-ERR: ${msg.text()}`);
  });

  // 캐시 우회 — context-level no-cache
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const state = await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): unknown };
      __scene?: { meshes: Array<{ name: string; isVisible: boolean; isEnabled(): boolean }> };
      __lastPlantBase?: unknown;
    };
    const scene = w.__scene;
    const visMeshes = scene?.meshes.filter((m) => m.isVisible && m.isEnabled()) ?? [];
    return {
      hasStore: !!w.__twinStore,
      totalMeshes: scene?.meshes.length ?? 0,
      visibleMeshes: visMeshes.length,
      skinPlants: visMeshes.filter((m) => m.name.startsWith('skinplant_')).length,
      uniquePlantSeeds: [...new Set(visMeshes
        .map((m) => m.name.match(/^skinplant_\w+_(\d+)/)?.[1])
        .filter(Boolean))] as string[],
      hasPlantBase: !!w.__lastPlantBase,
    };
  });
  return { state, errors };
}

test('S132 URL compare', async ({ browser }) => {
  test.setTimeout(60_000);

  // URL 1: 기본 (URL 파라미터 없음)
  const ctx1 = await browser.newContext({ bypassCSP: true });
  await ctx1.clearCookies();
  const page1 = await ctx1.newPage();
  const r1 = await probe(page1, '/');
  await ctx1.close();

  // URL 2: ?leafBuilder=v2 (사용자: "이거는 되는데")
  const ctx2 = await browser.newContext({ bypassCSP: true });
  await ctx2.clearCookies();
  const page2 = await ctx2.newPage();
  const r2 = await probe(page2, '/?leafBuilder=v2');
  await ctx2.close();

  console.log('\n=== S132 URL COMPARE ===\n');
  console.log('--- URL: / (no params) ---');
  console.log(JSON.stringify(r1.state, null, 2));
  console.log('Errors:', r1.errors.length);
  for (const e of r1.errors.slice(0, 10)) console.log('  ', e);

  console.log('\n--- URL: /?leafBuilder=v2 ---');
  console.log(JSON.stringify(r2.state, null, 2));
  console.log('Errors:', r2.errors.length);
  for (const e of r2.errors.slice(0, 10)) console.log('  ', e);

  console.log('\n--- DIFF ---');
  console.log('totalMeshes diff:', r2.state.totalMeshes - r1.state.totalMeshes);
  console.log('skinPlants diff:', r2.state.skinPlants - r1.state.skinPlants);
  console.log('plants seeds same?', JSON.stringify(r1.state.uniquePlantSeeds.sort()) === JSON.stringify(r2.state.uniquePlantSeeds.sort()));
});
