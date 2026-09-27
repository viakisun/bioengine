// ★ S133 — 로딩 fail 정밀 추적.
// 사용자: "cache 후 로딩 안됨 이슈 재확인".

import { test } from '@playwright/test';

async function snapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { singlePlantMinute?: number; bootStages?: Record<string, unknown> } };
      __scene?: { meshes: Array<{ name: string; isVisible: boolean; isEnabled(): boolean; getTotalVertices(): number; position?: { x: number; y: number; z: number } }> };
      __lastPlantBase?: { mainAxis?: { stemCurve: { length: number } } };
      __camera?: { position?: { x: number; y: number; z: number }; target?: { x: number; y: number; z: number } };
    };
    const scene = w.__scene;
    const store = w.__twinStore?.getState();
    const meshes = scene?.meshes ?? [];
    const visMeshes = meshes.filter((m) => m.isVisible && m.isEnabled());
    return {
      store: { hasStore: !!store, singlePlantMinute: store?.singlePlantMinute, bootStages: store?.bootStages },
      scene: {
        totalMeshes: meshes.length,
        visibleMeshes: visMeshes.length,
        skinPlants: visMeshes.filter((m) => m.name.startsWith('skinplant_')).length,
        nonZeroVertMeshes: visMeshes.filter((m) => m.getTotalVertices() > 0).length,
      },
      camera: w.__camera ? { pos: w.__camera.position, target: w.__camera.target } : null,
      plant: {
        hasBase: !!w.__lastPlantBase,
        stemNodeCount: w.__lastPlantBase?.mainAxis?.stemCurve?.length,
      },
      dom: {
        canvasPresent: !!document.querySelector('canvas'),
        bodyHasError: document.body.innerHTML.toLowerCase().includes('error'),
        rootRendered: !!document.querySelector('#root') && (document.querySelector('#root')!.innerHTML.length > 100),
      },
    };
  }).catch((e) => ({ error: String(e) }));
}

test('S133 load-fail trace', async ({ page }) => {
  test.setTimeout(120_000);
  const events: Array<{ t: number; ev: string }> = [];
  const t0 = Date.now();

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      events.push({ t: Date.now() - t0, ev: `[${msg.type()}] ${msg.text().substring(0, 250)}` });
    }
  });
  page.on('pageerror', (err) => events.push({ t: Date.now() - t0, ev: `PAGEERROR: ${err.message}` }));
  page.on('requestfailed', (req) => events.push({ t: Date.now() - t0, ev: `REQ-FAIL: ${req.url()}` }));

  // ★ Cache 완전 우회 — bypassServiceWorker + 강제 reload + extraHTTPHeaders
  await page.context().setExtraHTTPHeaders({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  });
  await page.goto('http://localhost:8090/', { waitUntil: 'networkidle', timeout: 60_000 });

  // 매 2초마다 snapshot
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    const snap = await snapshot(page);
    events.push({ t: Date.now() - t0, ev: `SNAP: ${JSON.stringify(snap)}` });
    await page.screenshot({ path: `test-results/load-fail-t${(2 * (i + 1))}.png`, fullPage: false });
    if (!('error' in snap) && snap.plant?.hasBase) {
      events.push({ t: Date.now() - t0, ev: `BOOT-COMPLETE-${(2 * (i + 1))}s` });
      break;
    }
  }

  console.log('\n=== S133 LOAD-FAIL TRACE ===\n');
  for (const e of events) console.log(`[${(e.t / 1000).toFixed(1)}s] ${e.ev}`);

  console.log('\n=== Screenshots ===');
  console.log('test-results/load-fail-t2.png ... t24.png');
});
