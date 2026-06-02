// SSOT #195 — Left/Right primary stagger (Iter 39 Phase J0-6).
// See: docs/architecture/SKELETON_SSOT.md
//
// 사용자 J0 v14 S5: 좌우 교대 유지 + 기계적 사다리꼴 금지.
//
// LR-STAGGER-01:
// - 같은 baseU에서 좌우 primary가 _정확히 같은 U_ 공유 X (±0.020 stagger 유지)
// - 좌우 sizeFactor 차이 ≥ 0.05

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

test.describe('LR Stagger (SSOT #195, Iter 39 Phase J0-6)', () => {
  test('LR-STAGGER-01: 좌우 primary U 분리 + sizeFactor 차이', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __lastGraph?: {
          nodes?: Map<string, {
            id: string;
            leafletRef?: { position: string; rachisU: number; sizeFactor: number };
          }>;
        };
      };
      const graph = w.__lastGraph;
      if (!graph?.nodes) return { groups: [] };
      // primary leaflet들의 (rachisU, sizeFactor)를 leaf별로 수집.
      const byTag = new Map<string, Array<{ u: number; sf: number }>>();
      for (const node of graph.nodes.values()) {
        const ref = node.leafletRef;
        if (!ref || ref.position !== 'primary') continue;
        const tag = node.id.match(/axis\d+:n\d+/)?.[0];
        if (!tag) continue;
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag)!.push({ u: ref.rachisU, sf: ref.sizeFactor });
      }
      const groups: Array<{
        parentTag: string;
        primaryCount: number;
        identicalUPairs: number;
        minStagger: number;
        minSizeDelta: number;
      }> = [];
      for (const [parentTag, prims] of byTag) {
        if (prims.length < 2) continue;
        prims.sort((a, b) => a.u - b.u);
        // pair 가까운 것끼리 묶어 좌우 stagger 검사.
        //   primary 1쌍 = 2 entry, 2쌍 = 4 entry 등. 인접 쌍 (i, i+1)이 좌우.
        let identicalU = 0;
        let minStagger = Number.POSITIVE_INFINITY;
        let minSizeDelta = Number.POSITIVE_INFINITY;
        for (let i = 0; i < prims.length - 1; i += 2) {
          const a = prims[i], b = prims[i + 1];
          const du = Math.abs(b.u - a.u);
          if (du < 1e-6) identicalU++;
          if (du < minStagger) minStagger = du;
          const ds = Math.abs(b.sf - a.sf);
          if (ds < minSizeDelta) minSizeDelta = ds;
        }
        groups.push({
          parentTag,
          primaryCount: prims.length,
          identicalUPairs: identicalU,
          minStagger: Number.isFinite(minStagger) ? minStagger : 0,
          minSizeDelta: Number.isFinite(minSizeDelta) ? minSizeDelta : 0,
        });
      }
      return { groups };
    });
    const violations: string[] = [];
    for (const g of probe.groups) {
      if (g.identicalUPairs > 0) {
        violations.push(`${g.parentTag}: ${g.identicalUPairs} pair(s) share identical U`);
      }
      // ±0.020 stagger → 좌우 du = 0.040 expected. 최소 0.020 보장.
      if (g.minStagger < 0.020) {
        violations.push(`${g.parentTag}: minStagger ${g.minStagger.toFixed(4)} < 0.020`);
      }
      if (g.minSizeDelta < 0.05) {
        violations.push(`${g.parentTag}: minSizeDelta ${g.minSizeDelta.toFixed(4)} < 0.05`);
      }
    }
    expect(probe.groups.length, 'primary groups found').toBeGreaterThan(0);
    expect(
      violations,
      `LR-STAGGER-01 violations:\n${violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });
});
