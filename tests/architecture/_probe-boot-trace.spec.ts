// ★ S131 — Boot trace probe (확장: BootOverlay + screenshot).
//
// 사용자: "로딩 과정에 로그를 모두 남겨서 추적. 어디서부터 안되고 있는건지".

import { test, expect } from '@playwright/test';

test('S131 boot trace probe', async ({ page }) => {
  test.setTimeout(180_000);

  const logs: Array<{ time: number; type: string; text: string }> = [];
  const t0 = Date.now();

  page.on('console', (msg) => {
    logs.push({ time: Date.now() - t0, type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    logs.push({ time: Date.now() - t0, type: 'pageerror', text: `${err.message}\n${err.stack ?? ''}` });
  });
  page.on('requestfailed', (req) => {
    logs.push({
      time: Date.now() - t0,
      type: 'requestfailed',
      text: `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? '?'}`,
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait + checkpoint
  for (const ms of [2000, 5000, 10000, 20000]) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    const state = await page.evaluate(() => {
      const w = window as unknown as {
        __twinStore?: { getState(): { bootStages?: Record<string, unknown>; singlePlantMinute?: number } };
        __scene?: { meshes: Array<{ name: string; isEnabled(): boolean; isVisible: boolean }> };
        __lastPlantBase?: unknown;
        __lastGraph?: unknown;
      };
      const store = w.__twinStore?.getState();
      const scene = w.__scene;
      const visMeshes = scene?.meshes.filter((m) => m.isEnabled() && m.isVisible) ?? [];
      const skinPlants = visMeshes.filter((m) => m.name.startsWith('skinplant_'));
      return {
        hasStore: !!store,
        hasScene: !!scene,
        totalMeshes: scene?.meshes.length ?? 0,
        visibleMeshes: visMeshes.length,
        skinPlantMeshes: skinPlants.length,
        hasPlantBase: !!w.__lastPlantBase,
        hasGraph: !!w.__lastGraph,
        bootStages: store?.bootStages,
        singlePlantMinute: store?.singlePlantMinute,
        bootOverlayStillVisible: !!document.querySelector('[data-testid="boot-overlay"]')
          || !!document.querySelector('.boot-overlay')
          || (document.body.innerHTML.includes('boot') || document.body.innerHTML.includes('로딩')),
        canvasPresent: !!document.querySelector('canvas'),
        canvasSize: (() => {
          const c = document.querySelector('canvas') as HTMLCanvasElement | null;
          return c ? { w: c.width, h: c.height, clientW: c.clientWidth, clientH: c.clientHeight } : null;
        })(),
      };
    }).catch((e) => ({ error: String(e) }));
    logs.push({
      time: Date.now() - t0,
      type: 'checkpoint',
      text: `t=${Math.round((Date.now() - t0) / 1000)}s ${JSON.stringify(state)}`,
    });
  }

  // Take screenshot at end
  await page.screenshot({ path: 'test-results/boot-trace-end.png', fullPage: false });
  logs.push({ time: Date.now() - t0, type: 'screenshot', text: 'test-results/boot-trace-end.png' });

  console.log('\n=== S131 BOOT TRACE ===\n');
  for (const l of logs) {
    const ts = (l.time / 1000).toFixed(2);
    console.log(`[${ts}s] [${l.type}] ${l.text.substring(0, 400)}`);
  }

  console.log(`\n=== SUMMARY ===`);
  const errors = logs.filter((l) => l.type === 'error' || l.type === 'pageerror' || l.type === 'requestfailed');
  console.log(`Total logs: ${logs.length}, Errors/failures: ${errors.length}`);
  expect(errors.length).toBe(0);
});
