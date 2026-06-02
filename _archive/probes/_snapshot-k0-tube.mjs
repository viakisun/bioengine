// K0 — Mode A isolated leaf snapshot helper.
//
// Usage: node _snapshot-k0-tube.mjs <label> [leafId]
//   label  : "before" | "3a" | "3b"
//   leafId : default "axis0:n13"
//
// 저장: docs/screenshots/k0-tube/k0-<label>-<leafId>.png

import { chromium } from 'playwright';

const label = process.argv[2];
const leafId = process.argv[3] ?? 'axis0:n13';
const mode = process.argv[4] ?? 'full';  // 'full' | 'close'
if (!label) {
  console.error('usage: node _snapshot-k0-tube.mjs <label> [leafId] [full|close]');
  process.exit(2);
}

const URL = `http://localhost:8090/`;
const DAY = 45;
const OUT_DIR = mode === 'close' ? 'docs/screenshots/k1' : 'docs/screenshots/k0-tube';
const OUT = `${OUT_DIR}/${mode === 'close' ? 'k1-' : 'k0-'}${label}-close.png`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (err) => console.error('page error:', err.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(9000);
  await page.evaluate((d) => {
    const w = window;
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, DAY);
  await page.waitForTimeout(4000);
  if (mode === 'close') {
    // Babylon camera 직접 조작 — radius (distance) ↓, beta (pitch) ↑.
    await page.evaluate(() => {
      const scene = window.__lastScene ?? window.__babylonScene;
      const cam = scene?.activeCamera;
      if (cam && 'radius' in cam) {
        cam.radius = 0.5;       // 가까이
        cam.beta = 1.2;          // 약간 아래 시점
        cam.target.y = 1.0;      // 식물 중상부 향함
      }
    });
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: OUT, fullPage: false });
  console.log(`saved: ${OUT}`);
  await browser.close();
}

main().catch((err) => {
  console.error('snapshot failed:', err);
  process.exit(1);
});
