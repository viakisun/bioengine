// K2 진단 v4 — mesh-local stem-side vertex의 y, z 측정.
//
// 가설: normalizeLeafMeshVertices는 x만 shift (line 36-38 leafAnchor.ts).
// stem-side vertex (x_min)의 mesh-local y, z는 _임의_ 값. mesh.position을
// leafletNode.pos에 set해도, 실제 base vertex world position = node.pos +
// rotation × (0, y0, z0) → world gap.
//
// 측정:
//   axis0:n13의 모든 leaflet에 대해
//   - x_min vertex의 mesh-local (x, y, z) (x ≈ 0 보장됨, y/z는 ?)
//   - 거리 sqrt(y² + z²) = "anchor offset"
//   - rotation 적용 후 world offset
//
// 사용자 close-up gap이 이 offset 크기와 일치하면 root cause 확정.

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
    const scene = w.__scene || w.__debugScene;
    if (!scene?.meshes) return { error: 'no scene' };

    const samples = [];
    for (const m of scene.meshes) {
      if (!m.name || !/skinplant_leaf_.*_l\d+_/.test(m.name)) continue;
      const verts = m.getVerticesData?.('position');
      if (!verts || verts.length < 3) continue;
      // stem-side vertex = x_min.
      let minX = Infinity;
      let minIdx = -1;
      for (let i = 0; i < verts.length; i += 3) {
        if (verts[i] < minX) {
          minX = verts[i];
          minIdx = i;
        }
      }
      if (minIdx < 0) continue;
      const yLocal = verts[minIdx + 1];
      const zLocal = verts[minIdx + 2];
      const offset = Math.hypot(yLocal, zLocal);
      // rotation 후 world offset 추정: |offset| (rotation은 거리 보존, 방향만 회전).
      samples.push({
        name: m.name,
        xMinLocal: minX,
        yLocal,
        zLocal,
        yzOffset: offset,
      });
    }

    // Stats.
    const offsets = samples.map(s => s.yzOffset);
    const yLocals = samples.map(s => s.yLocal);
    const zLocals = samples.map(s => s.zLocal);
    const stat = (a) => {
      if (a.length === 0) return null;
      const s = a.slice().sort((x, y) => x - y);
      return {
        n: s.length, min: s[0], p50: s[Math.floor(s.length * 0.5)],
        p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1],
        avg: s.reduce((x, y) => x + y, 0) / s.length,
      };
    };

    return {
      meshCount: samples.length,
      xMinLocalStat: stat(samples.map(s => s.xMinLocal)),  // 0이어야 (ANCHOR-04)
      yzOffsetStat: stat(offsets),     // sqrt(y² + z²) — _이게 사용자 본 gap_
      yLocalStat: stat(yLocals),
      zLocalStat: stat(zLocals),
      // axis0:n13 sample 5개.
      n13Samples: samples.filter(s => s.name.includes('_a0_n13_')).slice(0, 10),
      // 전체 worst 5.
      worst5: samples.slice().sort((a, b) => b.yzOffset - a.yzOffset).slice(0, 5),
    };
  });

  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
