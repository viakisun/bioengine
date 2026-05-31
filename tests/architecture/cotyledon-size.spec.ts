// Iter 29 Phase 2 — Cotyledon size + shape invariant.
//
// 이전 (Iter 28까지):
//   const cotSize = 0.03 × cotyledonSize;       // max 6cm (Heuvelink 0.5-2cm 표준의 3-6배)
//   widthLengthRatio = 0.5 (2:1)
//
// Iter 29 Phase 2 fix:
//   const cotSize = botanical.cotyledon.maxHalfLengthM × cotyledonSize;
//                          ^^^^^^^^^^^^^^^^^^^^^^^^ default 0.008 (1.6cm full)
//   widthLengthRatio = 0.35 (2.85:1, Jones JB 2007)
//
// 측정 D=8: 8.60cm → 2.08cm (76% 감소). 본체 cot/stem 비율 0.54 → 0.13.

import { test, expect, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } } };
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } } };
  });
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as { __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } } };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

interface CotMetrics {
  count: number;
  maxBboxCm: number;
  stemHeightCm: number;
  cotStemRatio: number;
}

async function measureCotyledons(page: Page, day: number): Promise<CotMetrics> {
  await enter(page, day);
  return await page.evaluate(() => {
    const w = window as unknown as {
      __debugScene?: { meshes?: Array<{ name: string; isEnabled(): boolean; getBoundingInfo(): { boundingBox: { minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } } }> };
      __skinplantGraph?: { nodes: Map<string, { type?: string; pos: { y: number } }> };
    };
    const ms = w.__debugScene?.meshes ?? [];
    const cots = ms.filter((m) => m.name.startsWith('skinplant_cot_') && m.isEnabled());
    const bbLen = (m: { getBoundingInfo(): { boundingBox: { minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } } }) => {
      const bb = m.getBoundingInfo().boundingBox;
      return Math.hypot(bb.maximumWorld.x - bb.minimumWorld.x, bb.maximumWorld.y - bb.minimumWorld.y, bb.maximumWorld.z - bb.minimumWorld.z);
    };
    const maxBboxCm = cots.length > 0 ? Math.max(...cots.map(bbLen)) * 100 : 0;
    const stemYs = w.__skinplantGraph
      ? [...w.__skinplantGraph.nodes.values()].filter((n) => n.type === 'main-stem-node').map((n) => n.pos.y)
      : [];
    const stemHeightCm = stemYs.length > 0 ? (Math.max(...stemYs) - Math.min(...stemYs)) * 100 : 0;
    return {
      count: cots.length,
      maxBboxCm,
      stemHeightCm,
      cotStemRatio: stemHeightCm > 0 ? maxBboxCm / stemHeightCm : 0,
    };
  });
}

test.describe('Cotyledon Size + Shape (Iter 29 Phase 2)', () => {
  test('COT-SIZE-01: D=8 peak 떡잎 bbox ≤ 2.5cm (rotation 포함, Heuvelink 표준)', async ({ page }) => {
    test.setTimeout(120_000);
    const m = await measureCotyledons(page, 8);
    expect(m.count, 'D=8 cotyledon count').toBe(2);
    expect(m.maxBboxCm, `D=8 peak bbox (rotation 포함). 이전 bug: 8.60cm. fix 후: ~2.08cm.`).toBeLessThanOrEqual(2.5);
  });

  test('COT-PLANT-RATIO-01: D=8 cot/stem 비율 ≤ 0.25 (떡잎이 본체의 25% 이하)', async ({ page }) => {
    test.setTimeout(120_000);
    const m = await measureCotyledons(page, 8);
    expect(m.stemHeightCm, 'stem height > 0').toBeGreaterThan(0);
    expect(m.cotStemRatio, `D=8 cot/stem ratio. 이전: 0.54 (떡잎이 본체의 54%). fix 후: 0.13.`).toBeLessThanOrEqual(0.25);
  });

  test('COT-PLANT-RATIO-02: D=8 plant 막대기 위험 0 (본체 height > 떡잎 size × 3)', async ({ page }) => {
    test.setTimeout(120_000);
    const m = await measureCotyledons(page, 8);
    // 사용자 피드백 핵심: 떡잎 크기 줄이고 _plant이 막대기처럼 보이지 않는지_.
    // 본체 height가 떡잎 size의 최소 3배 이상이어야 plant 본체가 인식됨.
    expect(m.stemHeightCm, `본체 ${m.stemHeightCm.toFixed(1)}cm / 떡잎 ${m.maxBboxCm.toFixed(1)}cm. 비율 ${(m.stemHeightCm / m.maxBboxCm).toFixed(1)}x`).toBeGreaterThan(m.maxBboxCm * 3);
  });
});
