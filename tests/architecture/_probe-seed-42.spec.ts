// ★ S134 — 새 seed 로 page 안 뜨는지 확인.
// 사용자: "초기 로딩 화면 조차도 안나와 새로운 seed로 하면".

import { test } from '@playwright/test';

test('S134 seed=42 trace', async ({ page }) => {
  test.setTimeout(60_000);
  const events: Array<{ t: number; ev: string }> = [];
  const t0 = Date.now();

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      events.push({ t: Date.now() - t0, ev: `[${msg.type()}] ${msg.text().substring(0, 350)}` });
    }
  });
  page.on('pageerror', (err) => events.push({ t: Date.now() - t0, ev: `PAGEERROR: ${err.message}\n${err.stack?.substring(0, 500) ?? ''}` }));
  page.on('requestfailed', (req) => events.push({ t: Date.now() - t0, ev: `REQ-FAIL: ${req.url()} — ${req.failure()?.errorText ?? '?'}` }));

  await page.goto('http://localhost:8090/?seed=42', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(2000);
    const snap = await page.evaluate(() => {
      const w = window as unknown as {
        __scene?: { meshes: { length: number } };
        __lastPlantBase?: unknown;
      };
      const r = document.querySelector('#root');
      return {
        rootHasContent: !!r && r.innerHTML.length > 100,
        bodyText: document.body.innerText.substring(0, 200),
        canvasPresent: !!document.querySelector('canvas'),
        meshCount: w.__scene?.meshes?.length ?? 0,
        hasPlantBase: !!w.__lastPlantBase,
      };
    }).catch((e) => ({ error: String(e) }));
    events.push({ t: Date.now() - t0, ev: `t${2 * (i + 1)}s SNAP: ${JSON.stringify(snap)}` });
  }

  await page.screenshot({ path: 'test-results/seed-42.png' });

  console.log('\n=== S134 seed=42 trace ===\n');
  for (const e of events) console.log(`[${(e.t / 1000).toFixed(1)}s] ${e.ev}`);
});
