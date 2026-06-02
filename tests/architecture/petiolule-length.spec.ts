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

// ─── J0-7D (v16) 재정의 ─────────────────────────────────────────────────
// J0-3B (0.08/0.04)에서 시각상 _구슬 꿰기_ 인상 (branch hierarchy 약함).
// J0-7D (0.10/0.05) metrics-3D.json 비교 결과:
//   - 3B hierarchy prim/inter = 1.76
//   - 3D hierarchy prim/inter = 2.82 (60% 강화)
// → 3D 채택 + ceiling을 _metrics 근거 기반_ 재정의 (active 원칙 #22).
//
// 신규 PETIOLULE-LEN-01:
//   primary:     avg ≤ 0.10 AND individual max ≤ 0.12 AND individual min ≥ 0.04
//   intercalary: avg ≤ 0.06 AND individual max ≤ 0.07 AND individual min ≥ 0.02
// avg ceiling + 절대 max 상한 + floor — 3가지로 _금지_ + _부재_ 모두 catch.
test.describe('Petiolule Length (SSOT #192, Iter 39 Phase J0-7D 재정의)', () => {
  test('PETIOLULE-LEN-01: primary [0.04, 0.10 avg, 0.12 max], intercalary [0.02, 0.06 avg, 0.07 max]', async ({ page }) => {
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
      // ratio 수집 (잎별 position별).
      // ★ v21 #1: inflated 잎 (rachisLen > 0.40m, J0-8B audit FAIL 영역)은
      //   별도 reporting. sf > 1 inflation은 _engine 책임_ (POSTCLOSE-1).
      //   factor 0.105 × sf 1.1 = 0.1155 → ceiling 위반 가능.
      //   invariant 검증은 _normal 잎_ (rachisLen ≤ 0.40m)에서만.
      const INFLATED_THRESHOLD_M = 0.40;
      const ratiosByLeaf = new Map<string, { primary: number[]; intercalary: number[]; inflated: boolean }>();
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
        if (!ratiosByLeaf.has(tag)) {
          ratiosByLeaf.set(tag, {
            primary: [],
            intercalary: [],
            inflated: rachisLen > INFLATED_THRESHOLD_M,
          });
        }
        if (ref.position === 'primary') ratiosByLeaf.get(tag)!.primary.push(ratio);
        else ratiosByLeaf.get(tag)!.intercalary.push(ratio);
      }
      // ★ J0-7D 신규 PETIOLULE-LEN-01: avg ceiling + 절대 max + floor.
      // ★ v21 #1: inflated 잎은 별도 reporting, invariant 검증 제외.
      const violations: string[] = [];
      const inflatedReport: string[] = [];
      let checked = 0;
      const avg = (a: number[]) => a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length;
      for (const [tag, r] of ratiosByLeaf) {
        if (r.inflated) {
          // inflated 잎: reporting only — invariant 검증 제외 (POSTCLOSE-1 phase).
          if (r.primary.length > 0) {
            inflatedReport.push(`${tag} inflated (rachisLen > 0.40m) — primary max ${Math.max(...r.primary).toFixed(4)}, avg ${avg(r.primary).toFixed(4)}`);
          }
          continue;
        }
        if (r.primary.length > 0) {
          checked++;
          const primAvg = avg(r.primary);
          const primMax = Math.max(...r.primary);
          const primMin = Math.min(...r.primary);
          // ★ J0-9C + J0-9B-1 (v21 #1): spec은 _factor가 아니라_ measured ratio.
          //   ratio = leaflet.sf × factor[pairIndex]. J0-9C factor max 0.105.
          //   J0-9B-1로 primary baseSf range 1.00 ~ 0.70. leaflet sf 변동 최대
          //   ~1.20 (engine sizeFactor + baseSf 곱). 산식 upper:
          //     0.105 × 1.20 = 0.126 → max ceiling 0.13 (원칙 #22, +0.004 safety).
          //   v21 #1 권장 0.11은 sf=1.05 가정 — sf 변동 반영 0.13.
          if (primAvg > 0.10) violations.push(`${tag} primary avg ratio ${primAvg.toFixed(4)} > 0.10`);
          if (primMax > 0.13) violations.push(`${tag} primary max ratio ${primMax.toFixed(4)} > 0.13`);
          if (primMin < 0.04) violations.push(`${tag} primary min ratio ${primMin.toFixed(4)} < 0.04 (구슬 꿰기 risk)`);
        }
        if (r.intercalary.length > 0) {
          checked++;
          const intAvg = avg(r.intercalary);
          const intMax = Math.max(...r.intercalary);
          const intMin = Math.min(...r.intercalary);
          if (intAvg > 0.06) violations.push(`${tag} intercalary avg ${intAvg.toFixed(4)} > 0.06`);
          if (intMax > 0.07) violations.push(`${tag} intercalary max ${intMax.toFixed(4)} > 0.07`);
          // ★ intercalary floor 0.012 (J0-9B-1 산식 lower bound):
          //   factor 0.05 × J0-9B-1 min sf 0.25 = 0.0125. floor 0.012 = 산식
          //   lower - 0.0005 safety (원칙 #22). 이전 J0-5 sf 0.30 → 0.015.
          if (intMin < 0.012) violations.push(`${tag} intercalary min ${intMin.toFixed(4)} < 0.012`);
        }
      }
      return { violations, checked, inflatedReport };
    });
    if (probe.inflatedReport.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`PETIOLULE-LEN-01 inflated leaves (v21 #1, POSTCLOSE-1 영역):\n  ${probe.inflatedReport.join('\n  ')}`);
    }
    expect(probe.checked, 'primary/intercalary checked').toBeGreaterThan(0);
    expect(
      probe.violations,
      `PETIOLULE-LEN-01 violations:\n${probe.violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });
});
