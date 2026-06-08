// Probe — phenotyping-D110-survey 진입 시 console·crash·boot log 캡처.
//
// 실행: pnpm exec playwright test tests/architecture/_probe-phenotyping.spec.ts --reporter=list

import { test, expect } from '@playwright/test';

test.describe('Phenotyping probe', () => {
  test('phenotyping URL 직진입 — console + crash + boot log', async ({ page }) => {
    test.setTimeout(240_000);

    const consoleMessages: { type: string; text: string }[] = [];
    page.on('console', (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(`${err.name}: ${err.message}\n${err.stack ?? ''}`);
    });

    let crashed = false;
    page.on('crash', () => {
      crashed = true;
    });

    const url =
      'http://localhost:8090/?mode=workbench&scenario=phenotyping-D110-survey' +
      '&bedLayout=2-4-4&activeBedIds=4,5,6,7,8,9' +
      '&robotProfile=phenotyping&robotTraverse=1&gimbalView=1&qualityPreset=1';

    console.log('=== Phenotyping probe START ===');
    console.log(`URL: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (e) {
      console.log(`[goto error] ${e instanceof Error ? e.message : e}`);
    }

    // Boot in progress — 180초 wait or until crash.
    const t0 = Date.now();
    let lastBootText = '';
    let lastMsgIdx = 0;
    for (let i = 0; i < 180; i++) {
      await page.waitForTimeout(1000);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      if (i % 5 === 0) {
        const newMsgs = consoleMessages.slice(lastMsgIdx);
        lastMsgIdx = consoleMessages.length;
        console.log(`\n[t=${elapsed}s] alive (total console=${consoleMessages.length}, errors=${pageErrors.length}). new msgs:`);
        for (const m of newMsgs.slice(-15)) {
          console.log(`  [${m.type}] ${m.text.slice(0, 200)}`);
        }
      }
      if (crashed) {
        console.log(`[t=${elapsed}s] PAGE CRASHED`);
        break;
      }
      if (pageErrors.length > 0) {
        console.log(`[t=${elapsed}s] page error detected — dumping`);
        for (const e of pageErrors) console.log(e.slice(0, 1500));
      }
    }

    // Capture full HTML body text (boot log might be in it).
    let bodyText = '';
    try {
      bodyText = await page.locator('body').innerText({ timeout: 5_000 });
    } catch { /* */ }

    // Take screenshot whatever state
    try {
      await page.screenshot({
        path: 'test-results/scenarios/_phenotyping-probe.png',
        fullPage: false,
      });
    } catch { /* */ }

    // === Report ===
    console.log('\n=== Console messages (last 60) ===');
    for (const m of consoleMessages.slice(-60)) {
      console.log(`[${m.type}] ${m.text}`);
    }

    console.log('\n=== Page errors ===');
    for (const e of pageErrors) {
      console.log(e);
    }

    console.log('\n=== Crashed? ===');
    console.log(crashed);

    console.log('\n=== Body text (first 3000 char) ===');
    console.log(bodyText.slice(0, 3000));

    console.log('\n=== Boot log near phenotyping ===');
    console.log(lastBootText);

    console.log('=== Phenotyping probe END ===');

    // 일단 죽지 않으면 PASS — 진단 위주.
    expect(crashed).toBe(false);
  });
});
