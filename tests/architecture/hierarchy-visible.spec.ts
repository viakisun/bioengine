// SSOT #194 — Hierarchy ratio invariant (Iter 39 Phase J0-5).
// See: docs/architecture/SKELETON_SSOT.md (active 원칙 #16)
//
// 사용자 J0 v14: hierarchy는 _수치 ratio_로 검증 (absolute size는 J1 책임).
// "보기에 다름"이 아니라 invariant로 catch.
//
// HIERARCHY-VISIBLE-01:
// - avg(terminal targetSizeM) ≥ avg(primary targetSizeM) × 1.15
// - avg(primary targetSizeM) ≥ avg(intercalary targetSizeM) × 1.8

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

test.describe('Hierarchy Ratio (SSOT #194, Iter 39 Phase J0-5)', () => {
  test('HIERARCHY-VISIBLE-01: terminal ≥ primary × 1.15 + primary ≥ intercalary × 1.8', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __lastGraph?: {
          nodes?: Map<string, {
            id: string;
            leafletRef?: { position: string; targetSizeM: number };
          }>;
        };
      };
      const graph = w.__lastGraph;
      if (!graph?.nodes) return { leaves: [] };
      const byTag = new Map<string, { primary: number[]; intercalary: number[]; terminal: number[] }>();
      for (const node of graph.nodes.values()) {
        const ref = node.leafletRef;
        if (!ref) continue;
        const tag = node.id.match(/axis\d+:n\d+/)?.[0];
        if (!tag) continue;
        if (!byTag.has(tag)) byTag.set(tag, { primary: [], intercalary: [], terminal: [] });
        const g = byTag.get(tag)!;
        if (ref.position === 'primary') g.primary.push(ref.targetSizeM);
        else if (ref.position === 'intercalary') g.intercalary.push(ref.targetSizeM);
        else if (ref.position === 'terminal') g.terminal.push(ref.targetSizeM);
      }
      const leaves: Array<{
        parentTag: string;
        primCount: number; interCount: number;
        termAvg: number; primAvg: number; interAvg: number;
        termOverPrim: number; primOverInter: number;
      }> = [];
      const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
      for (const [parentTag, g] of byTag) {
        const termAvg = avg(g.terminal);
        const primAvg = avg(g.primary);
        const interAvg = avg(g.intercalary);
        leaves.push({
          parentTag,
          primCount: g.primary.length,
          interCount: g.intercalary.length,
          termAvg, primAvg, interAvg,
          termOverPrim: primAvg > 0 ? termAvg / primAvg : 0,
          primOverInter: interAvg > 0 ? primAvg / interAvg : 0,
        });
      }
      return { leaves };
    });
    expect(probe.leaves.length, 'leaves found').toBeGreaterThan(0);
    // active 원칙 #23 case-aware: minReadable clamp (mature 18mm)가 _양쪽_에
    // 활성이면 ratio 1.0 근처로 평준화 → 측정 무의미. botanical 실제 "apex
    // 잎은 leaflet 모두 작고 비슷" — clamp 영역에서 ratio 검증 제외.
    //   threshold: 0.022m (clamp 18mm + 안전 margin).
    const CLAMP_FLOOR_M = 0.022;
    const MIN_PRIMARY_FOR_HIERARCHY = 4;   // 2쌍 이상 (mature)
    const MIN_INTERCALARY_FOR_RATIO = 2;
    const violations: string[] = [];
    for (const l of probe.leaves) {
      // primary가 minReadable 가까이면 clamp 영역 → ratio 검증 skip.
      const primaryClamped = l.primAvg < CLAMP_FLOOR_M;
      const interClamped = l.interAvg < CLAMP_FLOOR_M;
      // term/prim ratio: primary가 충분 + clamp 영역 아닐 때만.
      if (l.termAvg > 0 && l.primAvg > 0
          && l.primCount >= MIN_PRIMARY_FOR_HIERARCHY
          && !primaryClamped) {
        if (l.termOverPrim < 1.15) {
          violations.push(`${l.parentTag}: termOverPrim ${l.termOverPrim.toFixed(3)} < 1.15 (primAvg=${l.primAvg.toFixed(4)})`);
        }
      }
      // prim/inter ratio: 양쪽 모두 clamp 영역 아닐 때만.
      if (l.primAvg > 0 && l.interAvg > 0
          && l.primCount >= MIN_PRIMARY_FOR_HIERARCHY
          && l.interCount >= MIN_INTERCALARY_FOR_RATIO
          && !primaryClamped && !interClamped) {
        if (l.primOverInter < 1.8) {
          violations.push(`${l.parentTag}: primOverInter ${l.primOverInter.toFixed(3)} < 1.8 (primAvg=${l.primAvg.toFixed(4)}, interAvg=${l.interAvg.toFixed(4)})`);
        }
      }
    }
    expect(
      violations,
      `HIERARCHY-VISIBLE-01 violations:\n${violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });
});
