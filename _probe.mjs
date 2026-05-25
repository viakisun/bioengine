import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const out = [];
page.on('console', (m) => out.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => out.push(`[err] ${e.message}`));

await page.goto('http://localhost:8090/#single-plant', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('canvas');
await page.waitForTimeout(4000);

const probe = await page.evaluate(() => {
  const w = window;
  return {
    hasStore: typeof w.__twinStore?.getState === 'function',
    flag: w.__twinStore?.getState?.()?.useImplicitMesh,
    setter: typeof w.__twinStore?.getState?.()?.setUseImplicitMesh,
  };
});
process.stdout.write(`probe1: ${JSON.stringify(probe)}\n`);

// Flip toggle.
await page.evaluate(() => {
  window.__twinStore?.getState?.()?.setUseImplicitMesh?.(true);
});
await page.waitForTimeout(4000);

const probe2 = await page.evaluate(() => {
  const w = window;
  return {
    flag: w.__twinStore?.getState?.()?.useImplicitMesh,
  };
});
process.stdout.write(`probe2: ${JSON.stringify(probe2)}\n`);

process.stdout.write('=== page console ===\n');
for (const l of out) process.stdout.write(l + '\n');

await browser.close();
