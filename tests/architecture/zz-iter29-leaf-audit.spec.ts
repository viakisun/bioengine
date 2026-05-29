// Iter 29 Phase 1 — Measurement audit (read-only dump).
//
// 사용자 의문 3건 + 추가 의문 검증을 위한 시계열 측정:
//   - 떡잎 mesh size
//   - 첫 본엽 (node[0]) mesh size + leafletCount
//   - 본체 height / stem radius
//   - 모든 visible leaf의 sizeFactor distribution
//   - 비율: cotyledon / 본엽 / 본체 높이

import { test, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } } };
    w.__twinStore?.getState().setMode('single-plant');
    w.__twinStore?.getState().setUseImplicitMesh(false);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } } };
    w.__twinStore?.getState().setUseImplicitMesh(true);
  });
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as { __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } } };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

interface DayDump {
  day: number;
  cotyledon: { count: number; maxBboxCm: number; maxY: number };
  leaves: { count: number; sizeFactorRange: { min: number; max: number; mean: number } };
  leafletCounts: number[];
  stem: { yMin: number; yMax: number; heightCm: number; radiusMm: { min: number; max: number } };
  ratios: { cotyledonToStem: number; firstLeafToCotyledon: number };
}

async function dumpDay(page: Page, day: number): Promise<DayDump> {
  await enter(page, day);
  return await page.evaluate(() => {
    const w = window as unknown as {
      __debugScene?: { meshes?: Array<{ name: string; isEnabled(): boolean; getBoundingInfo(): { boundingBox: { minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } } }> };
      __skinplantGraph?: { nodes: Map<string, { type?: string; pos: { y: number }; radius: number }> };
    };
    const meshes = w.__debugScene?.meshes ?? [];
    const cots = meshes.filter((m) => m.name.startsWith('skinplant_cot_') && m.isEnabled());
    const leaves = meshes.filter((m) => m.name.startsWith('skinplant_leaf_') && m.isEnabled());
    const bbLen = (m: { getBoundingInfo(): { boundingBox: { minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } } }) => {
      const bb = m.getBoundingInfo().boundingBox;
      return Math.hypot(
        bb.maximumWorld.x - bb.minimumWorld.x,
        bb.maximumWorld.y - bb.minimumWorld.y,
        bb.maximumWorld.z - bb.minimumWorld.z,
      );
    };
    const cotMax = cots.length > 0 ? Math.max(...cots.map(bbLen)) : 0;
    const cotMaxY = cots.length > 0 ? Math.max(...cots.map((m) => m.getBoundingInfo().boundingBox.maximumWorld.y)) : 0;
    const leafBboxes = leaves.map(bbLen);
    const leafMean = leafBboxes.length > 0 ? leafBboxes.reduce((s, x) => s + x, 0) / leafBboxes.length : 0;

    const stemNodes = w.__skinplantGraph
      ? [...w.__skinplantGraph.nodes.values()].filter((n) => n.type === 'main-stem-node')
      : [];
    const stemYs = stemNodes.map((n) => n.pos.y);
    const stemRads = stemNodes.map((n) => n.radius * 1000);
    const yMin = stemYs.length > 0 ? Math.min(...stemYs) : 0;
    const yMax = stemYs.length > 0 ? Math.max(...stemYs) : 0;
    const heightCm = (yMax - yMin) * 100;
    const radiusMin = stemRads.length > 0 ? Math.min(...stemRads) : 0;
    const radiusMax = stemRads.length > 0 ? Math.max(...stemRads) : 0;

    return {
      day: 0,
      cotyledon: { count: cots.length, maxBboxCm: cotMax * 100, maxY: cotMaxY },
      leaves: { count: leaves.length, sizeFactorRange: { min: leafBboxes.length > 0 ? Math.min(...leafBboxes) * 100 : 0, max: leafBboxes.length > 0 ? Math.max(...leafBboxes) * 100 : 0, mean: leafMean * 100 } },
      leafletCounts: [],
      stem: { yMin, yMax, heightCm, radiusMm: { min: radiusMin, max: radiusMax } },
      ratios: {
        cotyledonToStem: heightCm > 0 ? (cotMax * 100) / heightCm : 0,
        firstLeafToCotyledon: cotMax > 0 ? (leafBboxes[0] ?? 0) / cotMax : 0,
      },
    };
  }).then((r) => ({ ...r, day }));
}

test('ITER29-A1: 잎 크기 시계열 dump (D=3, 5, 8, 10, 15, 25, 45, 90)', async ({ page }) => {
  test.setTimeout(600_000);
  const days = [3, 5, 8, 10, 15, 25, 45, 90];
  const dumps: DayDump[] = [];
  for (const d of days) {
    const dump = await dumpDay(page, d);
    dumps.push(dump);
  }
  // eslint-disable-next-line no-console
  console.log('\n========== ITER29 PHASE 1 — LEAF SIZE TIMELINE ==========');
  for (const d of dumps) {
    // eslint-disable-next-line no-console
    console.log(`\nDay ${d.day}:`);
    // eslint-disable-next-line no-console
    console.log(`  Cotyledon: count=${d.cotyledon.count}, maxBbox=${d.cotyledon.maxBboxCm.toFixed(2)}cm, maxY=${d.cotyledon.maxY.toFixed(2)}m`);
    // eslint-disable-next-line no-console
    console.log(`  Leaves (true): count=${d.leaves.count}, bbox range=${d.leaves.sizeFactorRange.min.toFixed(1)}~${d.leaves.sizeFactorRange.max.toFixed(1)}cm, mean=${d.leaves.sizeFactorRange.mean.toFixed(1)}cm`);
    // eslint-disable-next-line no-console
    console.log(`  Stem: heightCm=${d.stem.heightCm.toFixed(1)}, radius=${d.stem.radiusMm.min.toFixed(2)}~${d.stem.radiusMm.max.toFixed(2)}mm`);
    // eslint-disable-next-line no-console
    console.log(`  Ratios: cot/stem=${d.ratios.cotyledonToStem.toFixed(2)}, firstLeaf/cot=${d.ratios.firstLeafToCotyledon.toFixed(2)}`);
  }
  // eslint-disable-next-line no-console
  console.log('\n=======================================================\n');
});
