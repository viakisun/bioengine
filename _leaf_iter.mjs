// Leaf iteration sweep — close-up multi-angle capture for Technical Preview
// Stabilization. Usage:  node _leaf_iter.mjs iterN
//
// Captures 1 mature plant from many directions to surface issues fast.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const iter = process.argv[2] || 'iter01';
const outDir = `/tmp/leaf-iter/${iter}`;
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

async function aim({ target = [0, 1.5, 0], radius = 1.5, alpha = -1.57, beta = 1.3 }) {
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

await setMinute(55 * 24 * 60); // mature plant, day 55

// === A. Overview 4 azimuths ===
for (let i = 0; i < 4; i++) {
  await aim({ target: [0, 1.4, 0], radius: 1.6, alpha: -Math.PI/2 + (i * Math.PI/2), beta: 1.3 });
  await shot(`A_overview_${i}`);
}

// === B. Single leaf close-up — find a visible mid-stem leaf ===
for (const [name, t, r, alpha, beta] of [
  ['B_leaf_side',  [0, 1.5, 0],  0.28, -1.57, 1.30],
  ['B_leaf_front', [0, 1.5, 0],  0.28, -Math.PI, 1.30],
  ['B_leaf_above', [0, 1.5, 0],  0.28, -1.57, 0.40],
  ['B_leaf_below', [0, 1.5, 0],  0.28, -1.57, 2.30],
]) {
  await aim({ target: t, radius: r, alpha, beta });
  await shot(name);
}

// === C. Petiole junction — where petiole meets stem ===
for (let i = 0; i < 4; i++) {
  const y = 1.0 + i * 0.35;
  await aim({ target: [0, y, 0], radius: 0.18, alpha: -1.57, beta: 1.3 });
  await shot(`C_junction_y${y.toFixed(2)}`);
}

// === D. Leaflet base detail — verify base=0 width (no floating gap) ===
for (const [name, t, r] of [
  ['D_leaflet_base_close', [0.12, 1.55, 0], 0.10],
  ['D_leaflet_tip_close',  [0.20, 1.55, 0], 0.08],
  ['D_compound_top',       [0,    1.7, 0],  0.40],
]) {
  await aim({ target: t, radius: r, alpha: -1.57, beta: 1.3 });
  await shot(name);
}

// === E. Skeleton overlay toggle for V4 reference ===
await page.evaluate(() => {
  const s = window.__twinStore;
  if (s?.getState?.()?.setSkeletonMode) s.getState().setSkeletonMode(true);
  else if (s?.getState?.()?.setSkeletonEnabled) s.getState().setSkeletonEnabled(true);
});
await page.waitForTimeout(800);
for (let i = 0; i < 3; i++) {
  await aim({ target: [0, 1.5, 0], radius: 0.6, alpha: -1.57 + i * 0.8, beta: 1.3 });
  await shot(`E_skeleton_${i}`);
}
await page.evaluate(() => {
  const s = window.__twinStore;
  if (s?.getState?.()?.setSkeletonMode) s.getState().setSkeletonMode(false);
  else if (s?.getState?.()?.setLushEnabled) s.getState().setLushEnabled(true);
});
await page.waitForTimeout(600);

// === F. Reports ===
const reports = await page.evaluate(() => {
  const lm = window.__leafModule;
  if (!lm) return { error: 'no __leafModule' };
  return {
    summary: lm.summary(),
    botanical: lm.botanicalReport(),
    geometry: lm.geometryReport(),
  };
});
writeFileSync(`${outDir}/REPORTS.json`, JSON.stringify(reports, null, 2));
process.stdout.write(`\n${reports.summary ?? reports.error}\n`);
process.stdout.write(`\n✓ ${outDir}\n`);
await browser.close();
