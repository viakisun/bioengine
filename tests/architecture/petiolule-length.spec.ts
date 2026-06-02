// SSOT #192 — Petiolule length discipline (Iter 39 Phase J0-3 decision).
// See: docs/architecture/SKELETON_SSOT.md
//
// 사용자 J0 v14: J0-3A (0.12/0.06) vs J0-3B (0.08/0.04) metrics 비교 후 채택.
// metrics-3A.json (primary max 0.120) > strict 0.10 위반 → 3B 채택.
//
// PETIOLULE-LEN-01 (strict, J0-3B 적용 후 영구 활성):
// - primary `petioluleLen / rachisLen` ≤ 0.10
// - intercalary ≤ 0.06
// - terminal = 0 (sub-rachis chain에서 attach 자체가 terminal node)
//
// 근거: 실제 토마토 petiolule은 거의 안 보일 정도로 짧음. leaflet base가
// rachis에 _딱 붙어야_ 한 잎으로 응집 (J0 active 원칙 #15).

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

test.describe('Petiolule Length (SSOT #192, Iter 39 Phase J0-3B 채택)', () => {
  test('PETIOLULE-LEN-01: primary ≤ 0.10 × rachisLen, intercalary ≤ 0.06 × rachisLen', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __lastGraph?: {
          nodes?: Map<string, {
            id: string;
            pos: { x: number; y: number; z: number };
            leafBladeRef?: { rachisLengthM: number };
            leafletRef?: { position: string; attachNodeId: string };
          }>;
        };
      };
      const graph = w.__lastGraph;
      if (!graph?.nodes) return { violations: ['no graph'], checked: 0 };

      // leaf별 rachisLengthM lookup (tip node leafBladeRef).
      const rachisLenByLeaf = new Map<string, number>();
      for (const node of graph.nodes.values()) {
        if (!node.leafBladeRef) continue;
        const tag = node.id.match(/axis\d+:n\d+/)?.[0];
        if (tag) rachisLenByLeaf.set(tag, node.leafBladeRef.rachisLengthM);
      }
      const violations: string[] = [];
      let checked = 0;
      for (const node of graph.nodes.values()) {
        const ref = node.leafletRef;
        if (!ref) continue;
        if (ref.position !== 'primary' && ref.position !== 'intercalary') continue;
        const tag = node.id.match(/axis\d+:n\d+/)?.[0];
        if (!tag) continue;
        const rachisLen = rachisLenByLeaf.get(tag);
        if (!rachisLen || rachisLen <= 0) continue;
        const attach = graph.nodes.get(ref.attachNodeId);
        if (!attach) continue;
        const dx = node.pos.x - attach.pos.x;
        const dy = node.pos.y - attach.pos.y;
        const dz = node.pos.z - attach.pos.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const ratio = len / rachisLen;
        const cap = ref.position === 'primary' ? 0.10 : 0.06;
        checked++;
        if (ratio > cap) {
          violations.push(
            `${node.id} (${ref.position}): ratio ${ratio.toFixed(4)} > cap ${cap}`,
          );
        }
      }
      return { violations, checked };
    });
    expect(probe.checked, 'primary/intercalary checked').toBeGreaterThan(0);
    expect(
      probe.violations,
      `PETIOLULE-LEN-01 violations:\n${probe.violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });
});
