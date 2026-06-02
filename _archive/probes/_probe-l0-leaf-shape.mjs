// L0-1 — Leaf mesh shape balance + curl input 측정.
//
// 사용자 v2 보완 #3: posture.curl + senescence.curl + final curl + cup/droop.
// 모두 출력해서 _산식 vs input_ 어느 쪽 root cause인지 분리 진단.
//
// 측정 (per leaflet mesh):
//   - leafId (axis/node)
//   - position (primary/intercalary/terminal)
//   - ageFrac, maturity (expansionProgress)
//   - posture.curl, senescence.curl, final curl input
//   - gravityDroopDeg
//   - cup_max  = max(vertex.y) over edge col (|col_norm| > 0.7)
//   - droop_max = -min(vertex.y) over tip rows (t > 0.7)
//   - ratio = droop_max / cup_max  (≥ 1.3 mature, ≥ 0.8 developing, free young)

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
    const graph = w.__lastGraph;
    if (!scene?.meshes) return { error: 'no scene' };
    if (!graph?.nodes) return { error: 'no graph' };

    // mesh-local vertex 분포에서 cup/droop 측정.
    //   COLS = 9 (mesh-local x → col)
    //   lengthSegs = 15 (mesh-local row → t)
    //   vertex layout: row-major, COLS columns per row.
    // 단, 실제 vertex 순서는 산식에 따라 다를 수 있으므로 안전: vertex별
    //   (x, y, z) 그대로 사용하고 _normalized col_은 (z / max|z|) 로 추정.
    // 산식: leaflet plane은 mesh-local axis 평면 (x: length, z: width, y: out-of-plane).
    //   col이 width 방향 → z 사용.
    //   row가 length 방향 → x 사용.

    const samples = [];
    for (const m of scene.meshes) {
      if (!m.name || !/skinplant_leaf_.*_l\d+_/.test(m.name)) continue;
      const verts = m.getVerticesData?.('position');
      if (!verts || verts.length < 9) continue;

      // 범위 계산.
      let xMin = Infinity, xMax = -Infinity;
      let zMin = Infinity, zMax = -Infinity;
      for (let i = 0; i < verts.length; i += 3) {
        if (verts[i] < xMin) xMin = verts[i];
        if (verts[i] > xMax) xMax = verts[i];
        if (verts[i + 2] < zMin) zMin = verts[i + 2];
        if (verts[i + 2] > zMax) zMax = verts[i + 2];
      }
      const xRange = xMax - xMin;
      const zMaxAbs = Math.max(Math.abs(zMin), Math.abs(zMax));
      if (xRange <= 0 || zMaxAbs <= 0) continue;

      // cup_max = max(y) at edge (|z| > 0.7 × zMaxAbs).
      // droop_max = -min(y) at tip (x > 0.7 × xRange) — but exclude edge cup region.
      let cupMax = -Infinity;
      let droopMax = -Infinity;
      for (let i = 0; i < verts.length; i += 3) {
        const x = verts[i];
        const y = verts[i + 1];
        const z = verts[i + 2];
        const colNorm = Math.abs(z) / zMaxAbs;
        const tNorm = (x - xMin) / xRange;
        if (colNorm > 0.7) {
          if (y > cupMax) cupMax = y;
        }
        if (tNorm > 0.7) {
          if (-y > droopMax) droopMax = -y;
        }
      }
      if (cupMax === -Infinity) cupMax = 0;
      if (droopMax === -Infinity) droopMax = 0;

      // input curl 등 측정 — graph node에서 추출.
      const m1 = m.name.match(/_a(\d+)_n(\d+)_l(\d+)_(\w+)$/);
      if (!m1) continue;
      const leafTag = `axis${m1[1]}:n${m1[2]}`;
      const leafletIdx = +m1[3];
      const position = m1[4];

      // graph leaf-blade-root node 찾기 (leaf 단위 ageFrac/curl).
      let leafBladeRef = null;
      let leafStateLike = null;
      for (const node of graph.nodes.values()) {
        if (!node.id.startsWith(`leaf:${leafTag}`) && !node.id.endsWith(`:${leafTag}`)) {
          if (node.leafBladeRef && node.id.includes(leafTag)) {
            leafBladeRef = node.leafBladeRef;
            break;
          }
        }
      }
      // 또는 phytomerRef.leaf 데이터 — 추정 불가하면 null.
      samples.push({
        leafTag,
        leafletIdx,
        position,
        xRangeM: xRange,
        zMaxAbsM: zMaxAbs,
        cupMaxM: cupMax,
        droopMaxM: droopMax,
        ratio: cupMax > 1e-6 ? droopMax / cupMax : null,
        // leaf size + age 정보 — bladeRef 있으면 직접.
        rachisLengthM: leafBladeRef?.rachisLengthM,
      });
    }

    // Maturity / ageFrac / curl input은 phytomer state에서 — 여기서는 일단 mesh
    // geometry만. invariant 활성 시 추가.

    // Stats.
    const stat = (arr) => {
      const a = arr.filter(x => x != null && Number.isFinite(x)).slice().sort((x, y) => x - y);
      if (a.length === 0) return null;
      return {
        n: a.length, min: a[0], p50: a[Math.floor(a.length * 0.5)],
        p90: a[Math.floor(a.length * 0.9)], p95: a[Math.floor(a.length * 0.95)],
        max: a[a.length - 1], avg: a.reduce((x, y) => x + y, 0) / a.length,
      };
    };

    const cups = samples.map(s => s.cupMaxM);
    const droops = samples.map(s => s.droopMaxM);
    const ratios = samples.map(s => s.ratio);

    return {
      sampleCount: samples.length,
      cupMaxStat_mm: scaleStat(stat(cups), 1000),
      droopMaxStat_mm: scaleStat(stat(droops), 1000),
      ratioStat: stat(ratios),
      n13Samples: samples.filter(s => s.leafTag === 'axis0:n13').slice(0, 12),
      // Worst cup-dominant cases (ratio < 1) — Track A 보정 후보.
      cupDominant: samples.filter(s => s.ratio != null && s.ratio < 1.3).slice().sort((a, b) => a.ratio - b.ratio).slice(0, 8),
    };

    function scaleStat(s, factor) {
      if (!s) return null;
      return {
        n: s.n,
        min: s.min * factor, p50: s.p50 * factor, p90: s.p90 * factor,
        p95: s.p95 * factor, max: s.max * factor, avg: s.avg * factor,
      };
    }
  });

  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
