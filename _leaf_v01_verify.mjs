// Leaf Module v0.1 verification harness — runs V1-V12 against the live
// dev server. Captures screenshots + dumps validation JSON.
//
// Run: node _leaf_v01_verify.mjs

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const outDir = '/tmp/leaf-v01-verify';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

page.on('console', (m) => {
  const t = m.text();
  if (t.includes('skinplant') || t.includes('[leafModule') || m.type() === 'error') {
    process.stdout.write(`[page] ${t}\n`);
  }
});

await page.goto('http://localhost:8090/#single-plant', {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await page.waitForSelector('canvas');
await page.waitForTimeout(3500);

// Make sure the skinmesh / implicit mesh path is active (toggle ON).
await page.evaluate(() => {
  const s = window.__twinStore;
  if (s?.getState?.()?.setUseImplicitMesh) s.getState().setUseImplicitMesh(true);
});
await page.waitForTimeout(1500);

async function setMinute(minute) {
  await page.evaluate((m) => {
    const range = document.querySelector('input[type="range"]');
    if (!range) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(range, String(m));
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
  }, minute);
  await page.waitForTimeout(2200);
}

async function aim({ target = [0, 1.5, 0], radius = 1.5, alpha = -1.57, beta = 1.3 } = {}) {
  await page.evaluate(({ t, r, a, b }) => {
    const cam = window.__camera;
    if (!cam) return;
    if (cam.target?.copyFromFloats) cam.target.copyFromFloats(t[0], t[1], t[2]);
    cam.radius = r; cam.alpha = a; cam.beta = b;
  }, { t: target, r: radius, a: alpha, b: beta });
  await page.waitForTimeout(300);
}

async function shot(label) {
  await page.screenshot({ path: `${outDir}/${label}.png` });
  process.stdout.write(`📷 ${label}.png\n`);
}

async function dumpReports(label) {
  const data = await page.evaluate(() => {
    const lm = window.__leafModule;
    if (!lm) return { error: 'no __leafModule' };
    return {
      summary: lm.summary(),
      botanical: lm.botanicalReport(),
      geometry: lm.geometryReport(),
      metadata: lm.metadata(),
      faceGroupCount: lm.faceGroups().length,
    };
  });
  writeFileSync(`${outDir}/${label}.json`, JSON.stringify(data, null, 2));
  process.stdout.write(`📝 ${label}.json\n  ${data.summary?.replace(/\n/g, '\n  ') ?? data.error}\n`);
  return data;
}

// === V1. Day-by-day progression — mature plant capture ===
process.stdout.write('\n=== V1 Day progression (day 30, 60, 80) ===\n');
for (const day of [30, 60, 80]) {
  await setMinute(day * 24 * 60);
  await aim({ target: [0, 1.5, 0], radius: 1.5, alpha: -1.57, beta: 1.3 });
  await shot(`V1_day${day}_overview`);
  await aim({ target: [0, 1.8, 0], radius: 0.5, alpha: -1.57, beta: 1.25 });
  await shot(`V1_day${day}_close`);
}

// === V3 + V4. Leaflet close-up + base=0 visible gap test ===
process.stdout.write('\n=== V3 + V4 Width profile + petiole-leaf connection ===\n');
await setMinute(50 * 24 * 60);
await aim({ target: [0.1, 1.6, 0], radius: 0.18, alpha: -1.57, beta: 1.3 });
await shot('V3_leaflet_base_close');
await aim({ target: [0, 1.5, 0], radius: 0.4, alpha: -1.57, beta: 1.2 });
await shot('V4_petiole_rachis_junction');

// === V6 / V9 / V10 / V11 / V12 — single-frame harness reports ===
process.stdout.write('\n=== V6 + V9-V12 Mesh stats + validation harness ===\n');
const reports = await dumpReports('V6_V9_V10_V11_reports');

// === V7 ShowcasePlant regression — toggle OFF check ===
process.stdout.write('\n=== V7 ShowcasePlant toggle OFF pixel reference ===\n');
await page.evaluate(() => {
  const s = window.__twinStore;
  if (s?.getState?.()?.setUseImplicitMesh) s.getState().setUseImplicitMesh(false);
});
await page.waitForTimeout(2000);
await aim({ target: [0, 1.5, 0], radius: 1.5, alpha: -1.57, beta: 1.3 });
await shot('V7_showcase_OFF');

await page.evaluate(() => {
  const s = window.__twinStore;
  if (s?.getState?.()?.setUseImplicitMesh) s.getState().setUseImplicitMesh(true);
});
await page.waitForTimeout(1500);
await shot('V7_skinmesh_ON');

// === V12 reproducibility — same seed twice ===
process.stdout.write('\n=== V12 Reproducibility ===\n');
const meta1 = await page.evaluate(() => window.__leafModule.metadata());
await setMinute(45 * 24 * 60);  // jiggle to force rebuild
await page.waitForTimeout(1500);
await setMinute(50 * 24 * 60);
await page.waitForTimeout(1500);
const meta2 = await page.evaluate(() => window.__leafModule.metadata());
const matches =
  meta1?.summary?.leafletCount === meta2?.summary?.leafletCount &&
  Math.abs((meta1?.summary?.totalLeafAreaM2 ?? 0) - (meta2?.summary?.totalLeafAreaM2 ?? 0)) < 1e-9;
writeFileSync(`${outDir}/V12_repro.json`, JSON.stringify({
  first: meta1?.summary,
  second: meta2?.summary,
  match: matches,
  rngVersion: meta1?.rngVersion,
}, null, 2));
process.stdout.write(`📝 V12_repro.json  match=${matches}  rngVersion=${meta1?.rngVersion}\n`);

// === Summary ===
const summary = {
  v6_mesh: {
    vertices: reports.metadata?.summary?.leafletCount,
    leafletCount: reports.metadata?.summary?.leafletCount,
    compoundLeafCount: reports.metadata?.summary?.compoundLeafCount,
    totalLeafAreaM2: reports.metadata?.summary?.totalLeafAreaM2,
  },
  v9_botanical_aggregated: reports.botanical?.aggregated,
  v10_geometry: {
    triangleCount: reports.geometry?.triangleCount,
    degenerateRatio: reports.geometry?.degenerateTriangleRatio,
    allowedDegen: reports.geometry?.allowedDegenerateCount,
    normalDevMean: reports.geometry?.meanNormalDeviationDeg,
    status: reports.geometry?.status,
  },
  v11_faceGroups: reports.faceGroupCount,
  v12_repro_match: matches,
};
writeFileSync(`${outDir}/SUMMARY.json`, JSON.stringify(summary, null, 2));
process.stdout.write(`\n✓ ${outDir}\n`);
process.stdout.write(`\n${JSON.stringify(summary, null, 2)}\n`);

await browser.close();
