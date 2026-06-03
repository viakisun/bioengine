// ★ S116 — Main stem curve probe.
//
// 사용자 진단: "main stem이 거의 하드코딩되어 있는거 같은데?"
// stemCurve 노드별 (position, radius, deflection, internodeLen) dump.

import { test } from '@playwright/test';

test('S116 main stem curve probe', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(10000);

  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setSinglePlantMinute?: (m: number) => void } } };
    const setter = w.__twinStore?.getState().setSinglePlantMinute;
    if (typeof setter === 'function') setter(80 * 1440 + 12 * 60);
  });
  await page.waitForTimeout(3500);

  const result = await page.evaluate(() => {
    const w = window as unknown as {
      __lastPlantBase?: {
        mainAxis?: {
          stemCurve: Array<{
            nodeIdx: number;
            position: { x: number; y: number; z: number };
            radius: number;
            age: number;
          }>;
          nodes?: Array<{
            index: number;
            stemRadiusMm: number;
            deflectionRad: number;
            deflectionAzimuth: number;
            heightCm: number;
            internodeLenCm: number;
            position: { x: number; y: number; z: number };
          }>;
        };
      };
    };
    const pb = w.__lastPlantBase;
    if (!pb?.mainAxis) return { error: 'no mainAxis' };
    const ax = pb.mainAxis;

    // stemCurve + nodes match
    const curve = ax.stemCurve.map(s => ({
      nodeIdx: s.nodeIdx,
      x: Math.round(s.position.x * 1000) / 1000,
      y: Math.round(s.position.y * 1000) / 1000,
      z: Math.round(s.position.z * 1000) / 1000,
      radiusMm: Math.round(s.radius * 100000) / 100,  // m → mm
      age: Math.round(s.age),
    }));
    const totalDx = ax.stemCurve.reduce((max, s, i) => {
      if (i === 0) return max;
      const dx = Math.abs(s.position.x - ax.stemCurve[0].position.x);
      const dz = Math.abs(s.position.z - ax.stemCurve[0].position.z);
      return Math.max(max, Math.sqrt(dx*dx + dz*dz));
    }, 0);

    return {
      totalNodes: ax.stemCurve.length,
      maxHorizontalDeviationCm: Math.round(totalDx * 1000) / 10,
      curve,
      // Node engine-state data
      engineNodes: (ax.nodes ?? []).map(n => ({
        idx: n.index,
        heightCm: Math.round(n.heightCm * 10) / 10,
        radiusMm: Math.round(n.stemRadiusMm * 10) / 10,
        deflectionRad: Math.round(n.deflectionRad * 1000) / 1000,
        deflectionDeg: Math.round(n.deflectionRad * 180 / Math.PI * 10) / 10,
        internodeCm: Math.round(n.internodeLenCm * 10) / 10,
      })),
    };
  });

  console.log('=== S116 STEM CURVE PROBE (day=80) ===');
  console.log(JSON.stringify(result, null, 2));
});
