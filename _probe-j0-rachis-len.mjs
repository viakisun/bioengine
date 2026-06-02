// J0-8B — rachisLen audit. inflation 비율 측정 → J0 종료 후 별도 phase 분리.
//
// 사용자 v18 #3: J0-8B는 _필수 실행_ — observation only.
// - inflation 비율 ≤ 10%: rachisLen 정상. J0 종료 후 J1로 진행.
// - inflation 비율 > 10%: J0 책임 영역 아님. engine sizeFactor 산출 또는
//   computeLeafBladeRef의 sfClamped upper bound 도입은 별도 phase로 분리.
//
// botanical 토마토 compound leaf rachis: 25-30cm (mature), 5-15cm (young).
// inflation 기준: rachisLen > 0.40m.

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
    const graph = w.__lastGraph;
    if (!pb || !graph?.nodes) return { error: 'no PlantBase or graph' };
    // leafBladeRef 추출 — tip 노드의 ref.
    const samples = [];
    for (const node of graph.nodes.values()) {
      const ref = node.leafBladeRef;
      if (!ref) continue;
      const tag = node.id.match(/axis(\d+):n(\d+)/);
      if (!tag) continue;
      const axisIdx = parseInt(tag[1], 10);
      const nodeIdx = parseInt(tag[2], 10);
      // PlantBase에서 leaf찾기.
      const axis = axisIdx === 0 ? pb.mainAxis : pb.sideShoots[axisIdx - 1];
      const leaf = axis?.leaves?.find((l) => l.nodeIdx === nodeIdx);
      samples.push({
        axisIdx,
        nodeIdx,
        rachisLenM: ref.rachisLengthM,
        petioleLenM: ref.leafLengthM - ref.rachisLengthM,
        leafLengthM: ref.leafLengthM,
        sf: leaf?.sizeFactor ?? null,
        visible: leaf?.visibility?.visible ?? null,
        ratioRachisOverPetiole: ref.rachisLengthM / Math.max(0.001, ref.leafLengthM - ref.rachisLengthM),
        inflated: ref.rachisLengthM > 0.40,
        botanicalCategory:
          ref.rachisLengthM > 0.40 ? 'INFLATED' :
          ref.rachisLengthM >= 0.25 ? 'mature' :
          ref.rachisLengthM >= 0.05 ? 'young' : 'apex',
      });
    }
    const visibleSamples = samples.filter((s) => s.visible);
    const rachisLens = visibleSamples.map((s) => s.rachisLenM).sort((a, b) => a - b);
    const matureRachisLens = visibleSamples.filter((s) => s.sf != null && s.sf >= 0.7).map((s) => s.rachisLenM).sort((a, b) => a - b);
    const ratios = visibleSamples.map((s) => s.ratioRachisOverPetiole).filter((r) => Number.isFinite(r));
    const inflatedCount = visibleSamples.filter((s) => s.inflated).length;
    const stat = (a) => a.length === 0 ? null : ({
      n: a.length, min: a[0], p50: a[Math.floor(a.length * 0.50)],
      p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1],
      avg: a.reduce((x, y) => x + y, 0) / a.length,
    });
    return {
      aggregate: {
        visibleN: visibleSamples.length,
        rachisLenM: stat(rachisLens),
        matureRachisLenM: stat(matureRachisLens),
        rachisOverPetioleRatio: stat(ratios.sort((a, b) => a - b)),
        inflated: {
          count: inflatedCount,
          ratio: visibleSamples.length === 0 ? 0 : inflatedCount / visibleSamples.length,
          threshold: '> 0.40m',
        },
        botanicalRangeNote: '토마토 mature: 25-30cm, young: 5-15cm. INFLATED > 40cm',
        verdict: inflatedCount / Math.max(1, visibleSamples.length) <= 0.10
          ? 'PASS — rachisLen 정상 범위, J0 종료 후 J1 진행'
          : 'FAIL — inflation > 10%, J0가 아닌 engine scale 문제. 별도 phase 권고.',
      },
      samples: visibleSamples,
    };
  });

  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
