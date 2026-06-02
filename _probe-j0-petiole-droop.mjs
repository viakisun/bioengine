// J0-2B-audit — droopRad 분포 측정 probe.
// 사용자 J0 v14: J0-2B는 audit과 patch 분리. 측정 먼저, 극단치 _관찰 시에만_
// clamp commit.
//
// 사용법:
//   1. dev server 실행 (npm run dev) — :8090
//   2. node _probe-j0-petiole-droop.mjs > probe-petiole-droop.json
//
// 출력: 잎별 droopRad(rad/deg), sizeFactor, nodeIdx + 통계 (avg/max/p95).

import { chromium } from 'playwright';

const URL = 'http://localhost:8090/';
const DAY = 45;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('page error:', err.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate((d) => {
    const w = window;
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, DAY);
  await page.waitForTimeout(3500);

  const probe = await page.evaluate(() => {
    const w = window;
    const pb = w.__lastPlantBase;
    if (!pb) return { error: 'no PlantBase exposed' };
    const samples = [];
    for (const leaf of pb.mainAxis.leaves) {
      samples.push({
        axisIdx: 0,
        nodeIdx: leaf.nodeIdx,
        sizeFactor: leaf.sizeFactor,
        droopRad: leaf.droopRad ?? null,
        droopDeg: leaf.droopRad != null ? (leaf.droopRad * 180) / Math.PI : null,
        visible: leaf.visibility?.visible ?? null,
      });
    }
    for (let s = 0; s < pb.sideShoots.length; s++) {
      const axis = pb.sideShoots[s];
      for (const leaf of axis.leaves) {
        samples.push({
          axisIdx: s + 1,
          nodeIdx: leaf.nodeIdx,
          sizeFactor: leaf.sizeFactor,
          droopRad: leaf.droopRad ?? null,
          droopDeg: leaf.droopRad != null ? (leaf.droopRad * 180) / Math.PI : null,
          visible: leaf.visibility?.visible ?? null,
        });
      }
    }
    const visibleDegs = samples
      .filter((s) => s.visible && s.droopDeg != null)
      .map((s) => s.droopDeg);
    visibleDegs.sort((a, b) => a - b);
    const stats = visibleDegs.length === 0
      ? null
      : {
          n: visibleDegs.length,
          min: visibleDegs[0],
          p50: visibleDegs[Math.floor(visibleDegs.length * 0.50)],
          p95: visibleDegs[Math.floor(visibleDegs.length * 0.95)],
          max: visibleDegs[visibleDegs.length - 1],
          avg: visibleDegs.reduce((a, b) => a + b, 0) / visibleDegs.length,
        };
    return { samples, stats };
  });

  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
