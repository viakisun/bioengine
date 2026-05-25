// Iter4 — extreme close-up + multi-stage sweep + bottom-up view.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const outDir = '/tmp/leaf-iter/iter04';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('skinplant') || m.type() === 'error') process.stdout.write(`[page] ${t}\n`);
});

await page.goto('http://localhost:8090/#single-plant', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('canvas');
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const s = window.__twinStore;
  if (s?.getState?.()?.setUseImplicitMesh) s.getState().setUseImplicitMesh(true);
});
await page.waitForTimeout(1200);

async function setMinute(minute) {
  await page.evaluate((m) => {
    const r = document.querySelector('input[type="range"]');
    if (!r) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(r, String(m));
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
  }, minute);
  await page.waitForTimeout(2200);
}
async function aim({ target, radius, alpha, beta }) {
  await page.evaluate(({ t, r, a, b }) => {
    const cam = window.__camera;
    if (!cam) return;
    if (cam.target?.copyFromFloats) cam.target.copyFromFloats(t[0], t[1], t[2]);
    cam.radius = r; cam.alpha = a; cam.beta = b;
  }, { t: target, r: radius, a: alpha, b: beta });
  await page.waitForTimeout(280);
}
async function shot(label) {
  await page.screenshot({ path: `${outDir}/${label}.png` });
  process.stdout.write(`📷 ${label}.png\n`);
}

// === A. day 55 single-leaflet extreme close-up (12cm out) ===
await setMinute(55 * 24 * 60);
for (let i = 0; i < 6; i++) {
  const alpha = -Math.PI / 2 + (i / 6) * Math.PI * 2;
  await aim({ target: [0, 1.7, 0], radius: 0.12, alpha, beta: 1.3 });
  await shot(`A_leafletcloseup_${i}`);
}

// === B. bottom-up view (looking up at plant underside) ===
await aim({ target: [0, 1.5, 0], radius: 1.5, alpha: -1.57, beta: 2.2 });
await shot('B_bottom_up');
await aim({ target: [0, 1.5, 0], radius: 0.8, alpha: -1.57, beta: 2.0 });
await shot('B_bottom_close');

// === C. day progression with rachis visible ===
for (const day of [15, 25, 40, 55, 70, 85]) {
  await setMinute(day * 24 * 60);
  await aim({ target: [0, 1.3, 0], radius: 1.2, alpha: -1.57, beta: 1.3 });
  await shot(`C_day${day}_overview`);
  await aim({ target: [0, 1.5, 0], radius: 0.4, alpha: -1.57, beta: 1.3 });
  await shot(`C_day${day}_close`);
}

// === D. final reports ===
const reports = await page.evaluate(() => {
  const lm = window.__leafModule;
  if (!lm) return null;
  return {
    summary: lm.summary(),
    metadata: lm.metadata(),
    geometry: lm.geometryReport(),
  };
});
writeFileSync(`${outDir}/REPORTS.json`, JSON.stringify(reports, null, 2));
process.stdout.write(`\n${reports?.summary ?? 'no report'}\n`);
process.stdout.write(`\n✓ ${outDir}\n`);
await browser.close();
