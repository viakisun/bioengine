// SSOT #199 — Leaf Tube Visibility (Iter 39 Phase K2 revised).
// See: docs/architecture/LEAF_TUBE_RENDERING.md, SKELETON_CLOSE.md
//
// K0 (Phase K0-3A) 채택값 0.65 / 0.50은 _부분 양보_였음 — forward truncate에서
// leaflet 쪽 35% gap, end-anchored (K1)에서 attach 쪽 10mm gap. K2에서
// connector edge fraction = 1.0 강제 → gap 0 (active 원칙 #36).
//
// LEAF-TUBE-VISIBILITY-01 (K2 revised, 원칙 #36):
//   leaf-rachis  | value - 1.0 | ≤ 1e-6
//   lateral-vein | value - 1.0 | ≤ 1e-6     ← K2 강제 (was K0 [0.5, 0.9])
//   petiolule    | value - 1.0 | ≤ 1e-6     ← K2 강제 (was K0 [0.45, 0.75])
//   sub-vein     | value - 0.0 | ≤ 1e-6     ← ENABLE_SECONDARY_LEAFLETS=false 전제
//
// ★ secondary 활성 시 재검토 필수 — sub-vein이 0.0이면 secondary leaflet
//   floating 문제 재발. POSTCLOSE-3 진입 시 본 invariant 갱신.
//
// tolerance 1e-6 = floating-point 안전 (== 직접 비교 회피).

import { test, expect, type Page } from '@playwright/test';

const TOL = 1e-6;

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

test.describe('Leaf Tube Visibility (SSOT #199, Iter 39 Phase K2 revised)', () => {
  test('LEAF-TUBE-VISIBILITY-01: connector edge fraction == 1.0 (gap-free)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __lastGraph?: {
          edges?: Map<string, {
            type: string;
            renderPolicy?: { skinVisibleFraction?: number };
          }>;
        };
      };
      const graph = w.__lastGraph;
      if (!graph?.edges) return { violations: ['no graph'], samples: {} };

      const samples: Record<string, number | null> = {
        'leaf-rachis':  null,
        'lateral-vein': null,
        petiolule:      null,
        'sub-vein':     null,
      };
      for (const edge of graph.edges.values()) {
        if (!(edge.type in samples)) continue;
        if (samples[edge.type] != null) continue;
        const f = edge.renderPolicy?.skinVisibleFraction;
        if (f != null) samples[edge.type] = f;
      }

      return { samples };
    });

    // eslint-disable-next-line no-console
    console.log('LEAF-TUBE-VISIBILITY-01 samples:', JSON.stringify(probe.samples));

    const samples = (probe as { samples: Record<string, number | null> }).samples;

    // K2 (원칙 #36): connector edge fraction == 1.0 (tolerance 1e-6).
    const checkOne = (key: string) => {
      const v = samples[key];
      expect(v, `${key}: edge 없음 (sample 미수집)`).not.toBeNull();
      expect(
        Math.abs((v as number) - 1.0),
        `${key}: ${v} != 1.0 (tolerance ${TOL}) — connector edge는 visibility 자르지 않음 (원칙 #36)`,
      ).toBeLessThanOrEqual(TOL);
    };
    checkOne('leaf-rachis');
    checkOne('lateral-vein');
    checkOne('petiolule');

    // sub-vein: ENABLE_SECONDARY_LEAFLETS = false 전제 한정.
    //   현재 sub-vein 생성 안 되므로 sample = null → skip.
    //   secondary 활성 시 본 조항 갱신 필요 (sub-vein 0.0이면 secondary
    //   leaflet floating 재발).
    if (samples['sub-vein'] != null) {
      expect(
        Math.abs(samples['sub-vein'] - 0.0),
        `sub-vein: ${samples['sub-vein']} != 0.0 (secondary disabled 전제, ENABLE_SECONDARY_LEAFLETS=false). secondary 활성 시 본 조항 재검토.`,
      ).toBeLessThanOrEqual(TOL);
    }
  });
});
