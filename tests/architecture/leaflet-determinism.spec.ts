// SSOT #191 — Leaflet node.pos determinism (Iter 39 Phase J0-2C).
// See: docs/architecture/SKELETON_SSOT.md (active 원칙 #18)
//
// 사용자 J0: skeleton node.pos는 deterministic. `rollOffset/twistOffset` 등
// seed 기반 noise가 _node 위치 자체_에 들어가면 안 됨. visual pose는 J1로.
//
// 검증: 동일 graph snapshot을 _두 번_ 캡처해서 모든 leaflet node.pos가
// byte-identical (또는 ≤ 1e-9 tolerance). 사용자 plan 정의.

import { test, expect, type Page } from '@playwright/test';

async function enterSkin(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.waitForTimeout(1000);
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

async function snapshotLeafletPositions(page: Page): Promise<Array<{
  id: string;
  x: number; y: number; z: number;
}>> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __lastGraph?: {
        nodes?: Map<string, {
          id: string;
          pos: { x: number; y: number; z: number };
          leafletRef?: unknown;
        }>;
      };
    };
    const graph = w.__lastGraph;
    if (!graph?.nodes) return [];
    const out: Array<{ id: string; x: number; y: number; z: number }> = [];
    for (const node of graph.nodes.values()) {
      if (!node.leafletRef) continue;
      out.push({ id: node.id, x: node.pos.x, y: node.pos.y, z: node.pos.z });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  });
}

test.describe('Leaflet Determinism (SSOT #191, Iter 39 Phase J0-2C)', () => {
  test('LEAFLET-DETERMINISM-01: 같은 시점 재진입 시 leaflet node.pos byte-identical', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const snap1 = await snapshotLeafletPositions(page);
    expect(snap1.length, 'leaflet nodes present').toBeGreaterThan(0);

    // 같은 day로 재진입 — graph 재빌드 강제.
    await page.evaluate(() => {
      const w = window as unknown as {
        __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
      };
      // 다른 시간으로 한 번 → 다시 45일로 (재계산 트리거).
      w.__twinStore?.getState().setSinglePlantMinute(20 * 1440 + 12 * 60);
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const w = window as unknown as {
        __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
      };
      w.__twinStore?.getState().setSinglePlantMinute(45 * 1440 + 12 * 60);
    });
    await page.waitForTimeout(3500);
    const snap2 = await snapshotLeafletPositions(page);
    expect(snap2.length, 'snap2 leaflet nodes').toBe(snap1.length);

    const mismatches: string[] = [];
    for (let i = 0; i < snap1.length; i++) {
      const a = snap1[i], b = snap2[i];
      if (a.id !== b.id) {
        mismatches.push(`id order changed at ${i}: ${a.id} vs ${b.id}`);
        continue;
      }
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const dz = Math.abs(a.z - b.z);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // 1e-9 tolerance per plan
      if (d > 1e-9) {
        mismatches.push(`${a.id}: drift ${(d * 1e9).toFixed(2)}nm (${dx.toExponential(2)}, ${dy.toExponential(2)}, ${dz.toExponential(2)})`);
      }
    }
    expect(
      mismatches,
      `LEAFLET-DETERMINISM-01 violations:\n${mismatches.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });
});
