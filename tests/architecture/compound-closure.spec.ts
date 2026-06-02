// SSOT #196 — Compound Leaf Closure invariants (Iter 39 Phase J0-9D).
// See: docs/architecture/SKELETON_SSOT.md + LEAFLET_LAYOUT.md
//
// 사용자 v20/v21 핵심 강제: skeleton _부재_ 영역 마지막 catch. "축 위 slot
// 나열"이 아닌 "한 잎 silhouette" 정량화.
//
// 4 독립 invariants (v20 사용자 #4: 곱셈 score 폐기, v21 #2 reporting-first
// 후 baseline에서 활성):
//
// (a) CLOSURE-MAX-UNCOVERED-GAP-01 (influence radius coverage)
//     primary 0.11 / intercalary 0.06 / terminal 0.10 영향권으로 [u-r, u+r]
//     덮음. rachis [0.15, 0.95]에서 uncovered max ≤ mature 0.18 / young 0.30.
//
// (b) CLOSURE-INTERCALARY-FILL-01
//     primary _pair 단위_ macro gap 중 intercalary 채운 비율 ≥ 0.60.
//     pair count ≥ 3에서만 (intercalary 의미 있는 case).
//
// (c) CLOSURE-TERMINAL-EMPHASIS-01
//     terminalU ≥ 0.95 AND term/prim size ratio ≥ 1.20 AND clearance ∈ [0.15, 0.28].
//
// (d) CLOSURE-ROLE-SEPARATION-01
//     primaryAvg/intercalaryAvg size ratio ≥ 2.2 AND primary branch length /
//     intercalary branch length ≥ 1.6.

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

interface ClosureMetrics {
  parentTag: string;
  pairCount: number;
  rachisLen: number;
  maxUncoveredU: number;
  intercalaryFill: { pairGapCount: number; filledCount: number; ratio: number };
  terminal: { u: number; sizeOverPrim: number; clearance: number };
  roleSeparation: { sizeRatio: number; branchLenRatio: number };
}

async function probeClosure(page: Page): Promise<ClosureMetrics[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __lastGraph?: {
        nodes?: Map<string, {
          id: string;
          pos: { x: number; y: number; z: number };
          leafBladeRef?: { rachisLengthM: number };
          leafletRef?: {
            position: string;
            rachisU: number;
            targetSizeM: number;
            attachNodeId: string;
          };
        }>;
      };
    };
    const graph = w.__lastGraph;
    if (!graph?.nodes) return [];

    const rachisLenByLeaf = new Map<string, number>();
    for (const node of graph.nodes.values()) {
      if (!node.leafBladeRef) continue;
      const t = node.id.match(/axis\d+:n\d+/)?.[0];
      if (t) rachisLenByLeaf.set(t, node.leafBladeRef.rachisLengthM);
    }
    const byTag = new Map<string, {
      primary: Array<{ u: number; size: number; pos: typeof graph.nodes extends Map<string, infer N> ? (N extends { pos: infer P } ? P : never) : never; attachNodeId: string }>;
      intercalary: Array<{ u: number; size: number; pos: { x: number; y: number; z: number }; attachNodeId: string }>;
      terminal: Array<{ u: number; size: number }>;
    }>();
    for (const node of graph.nodes.values()) {
      const ref = node.leafletRef;
      if (!ref) continue;
      const tag = node.id.match(/axis\d+:n\d+/)?.[0];
      if (!tag) continue;
      if (!byTag.has(tag)) byTag.set(tag, { primary: [], intercalary: [], terminal: [] });
      const g = byTag.get(tag)!;
      const entry = { u: ref.rachisU, size: ref.targetSizeM, pos: node.pos, attachNodeId: ref.attachNodeId };
      if (ref.position === 'primary') g.primary.push(entry);
      else if (ref.position === 'intercalary') g.intercalary.push(entry);
      else if (ref.position === 'terminal') g.terminal.push({ u: ref.rachisU, size: ref.targetSizeM });
    }

    const INFLUENCE = { primary: 0.11, intercalary: 0.06, terminal: 0.10 };
    const avg = (a: number[]) => a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length;
    const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

    const results: ClosureMetrics[] = [];
    for (const [parentTag, g] of byTag) {
      const rachisLen = rachisLenByLeaf.get(parentTag) ?? 0;
      if (rachisLen <= 0) continue;

      // (a) Influence radius coverage
      const covered: Array<{ lo: number; hi: number }> = [];
      for (const p of g.primary) covered.push({ lo: p.u - INFLUENCE.primary, hi: p.u + INFLUENCE.primary });
      for (const it of g.intercalary) covered.push({ lo: it.u - INFLUENCE.intercalary, hi: it.u + INFLUENCE.intercalary });
      for (const t of g.terminal) covered.push({ lo: t.u - INFLUENCE.terminal, hi: t.u + INFLUENCE.terminal });
      covered.sort((a, b) => a.lo - b.lo);
      let maxUncovered = 0;
      let cursor = 0.15;
      for (const c of covered) {
        if (c.hi < cursor) continue;
        if (c.lo > cursor) {
          const gap = Math.min(c.lo, 0.95) - cursor;
          if (gap > maxUncovered) maxUncovered = gap;
        }
        cursor = Math.max(cursor, c.hi);
        if (cursor >= 0.95) break;
      }
      if (cursor < 0.95) {
        const gap = 0.95 - cursor;
        if (gap > maxUncovered) maxUncovered = gap;
      }

      // (b) Intercalary fill (pair-base macro gaps)
      const primUsRaw = g.primary.map(p => p.u).sort((a, b) => a - b);
      const pairBaseUs: number[] = [];
      for (let i = 0; i + 1 < primUsRaw.length; i += 2) {
        pairBaseUs.push((primUsRaw[i] + primUsRaw[i + 1]) * 0.5);
      }
      const intUs = g.intercalary.map(it => it.u);
      let pairGapCount = 0, filledCount = 0;
      for (let i = 0; i < pairBaseUs.length - 1; i++) {
        const a = pairBaseUs[i], b = pairBaseUs[i + 1];
        pairGapCount++;
        if (intUs.some(u => u > a && u < b)) filledCount++;
      }
      const fillRatio = pairGapCount > 0 ? filledCount / pairGapCount : 0;

      // (c) Terminal emphasis
      const termU = g.terminal[0]?.u ?? 0;
      const termSize = g.terminal[0]?.size ?? 0;
      const primAvgSize = avg(g.primary.map(p => p.size));
      const termOverPrim = primAvgSize > 0 ? termSize / primAvgSize : 0;
      const termClearance = primUsRaw.length > 0 ? termU - primUsRaw[primUsRaw.length - 1] : 0;

      // (d) Role separation
      const interAvgSize = avg(g.intercalary.map(it => it.size));
      const sizeRatio = interAvgSize > 0 ? primAvgSize / interAvgSize : 0;
      // branch length 측정 — leaflet pos - attach pos.
      const primBranchLens: number[] = [];
      for (const p of g.primary) {
        const attach = graph.nodes!.get(p.attachNodeId);
        if (attach) primBranchLens.push(dist(p.pos, attach.pos));
      }
      const interBranchLens: number[] = [];
      for (const it of g.intercalary) {
        const attach = graph.nodes!.get(it.attachNodeId);
        if (attach) interBranchLens.push(dist(it.pos, attach.pos));
      }
      const branchLenRatio = avg(interBranchLens) > 0 ? avg(primBranchLens) / avg(interBranchLens) : 0;

      results.push({
        parentTag,
        pairCount: Math.floor(g.primary.length / 2),
        rachisLen,
        maxUncoveredU: maxUncovered,
        intercalaryFill: { pairGapCount, filledCount, ratio: fillRatio },
        terminal: { u: termU, sizeOverPrim: termOverPrim, clearance: termClearance },
        roleSeparation: { sizeRatio, branchLenRatio },
      });
    }
    return results;
  });
}

test.describe('Compound Leaf Closure (SSOT #196, Iter 39 Phase J0-9D)', () => {
  test('CLOSURE-MAX-UNCOVERED-GAP-01: influence radius coverage uncovered ≤ 0.18 (mature) / 0.30 (young)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await probeClosure(page);
    expect(probe.length, 'closure groups found').toBeGreaterThan(0);
    const violations: string[] = [];
    for (const l of probe) {
      const cap = l.pairCount >= 3 ? 0.18 : 0.30;
      if (l.maxUncoveredU > cap) {
        violations.push(`${l.parentTag} (pair=${l.pairCount}): maxUncoveredU ${l.maxUncoveredU.toFixed(3)} > ${cap}`);
      }
    }
    expect(violations, `CLOSURE-MAX-UNCOVERED-GAP-01:\n${violations.slice(0, 10).join('\n')}`).toEqual([]);
  });

  test('CLOSURE-INTERCALARY-FILL-01: pair-base macro gap fill ratio ≥ 0.60 (pair ≥ 3)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await probeClosure(page);
    const violations: string[] = [];
    for (const l of probe) {
      if (l.pairCount < 3) continue;
      if (l.intercalaryFill.ratio < 0.60) {
        violations.push(`${l.parentTag} (pair=${l.pairCount}): fill ${l.intercalaryFill.ratio.toFixed(3)} (${l.intercalaryFill.filledCount}/${l.intercalaryFill.pairGapCount}) < 0.60`);
      }
    }
    expect(violations, `CLOSURE-INTERCALARY-FILL-01:\n${violations.slice(0, 10).join('\n')}`).toEqual([]);
  });

  test('CLOSURE-TERMINAL-EMPHASIS-01: terminalU ≥ 0.95 + term/prim ≥ 1.20 + clearance ∈ [0.15, 0.28]', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await probeClosure(page);
    const violations: string[] = [];
    for (const l of probe) {
      if (l.pairCount < 2) continue;  // young 1쌍 제외
      if (l.terminal.u < 0.95) {
        violations.push(`${l.parentTag}: terminalU ${l.terminal.u.toFixed(3)} < 0.95`);
      }
      if (l.terminal.sizeOverPrim < 1.20) {
        violations.push(`${l.parentTag}: term/prim ${l.terminal.sizeOverPrim.toFixed(3)} < 1.20`);
      }
      if (l.terminal.clearance < 0.15) {
        violations.push(`${l.parentTag}: clearance ${l.terminal.clearance.toFixed(3)} < 0.15`);
      }
      if (l.terminal.clearance > 0.28) {
        violations.push(`${l.parentTag}: clearance ${l.terminal.clearance.toFixed(3)} > 0.28`);
      }
    }
    expect(violations, `CLOSURE-TERMINAL-EMPHASIS-01:\n${violations.slice(0, 10).join('\n')}`).toEqual([]);
  });

  test('CLOSURE-ROLE-SEPARATION-01: size ratio ≥ 2.2 + branch length ratio ≥ 1.6', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await probeClosure(page);
    const violations: string[] = [];
    // ★ HIERARCHY-VISIBLE-01과 같은 패턴: apex young 잎 (rachisLen < 0.10m)은
    //   minReadable clamp 영역에서 primary/intercalary 모두 floor 도달 → ratio
    //   무의미. clamp 영역 검증 제외.
    for (const l of probe) {
      if (l.pairCount < 3) continue;  // intercalary 있는 경우만
      if (l.rachisLen < 0.10) continue;  // apex young 제외 (clamp 영역)
      if (l.roleSeparation.sizeRatio < 2.2) {
        violations.push(`${l.parentTag}: sizeRatio ${l.roleSeparation.sizeRatio.toFixed(3)} < 2.2`);
      }
      if (l.roleSeparation.branchLenRatio < 1.6) {
        violations.push(`${l.parentTag}: branchLenRatio ${l.roleSeparation.branchLenRatio.toFixed(3)} < 1.6`);
      }
    }
    expect(violations, `CLOSURE-ROLE-SEPARATION-01:\n${violations.slice(0, 10).join('\n')}`).toEqual([]);
  });
});
