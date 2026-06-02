// SSOT #193 — Compound leaf layout discipline (Iter 39 Phase J0-4).
// See: docs/architecture/SKELETON_SSOT.md
//
// 사용자 J0 v14:
// - COMPOUND-GAP-01: case-aware threshold (young/mature/complex 별)
// - COMPOUND-SLOTS-01: intercalary가 primary 사이 또는 edge slot에만
// - TERMINAL-CLEARANCE-01: lastPrimaryU ≤ 0.82 + terminalU − lastPrimaryU ≥ 0.15

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

interface LeafSummary {
  parentTag: string;
  pairCount: number;
  primaryUs: number[];
  intercalaryUs: number[];
  terminalU: number;
  gaps: number[];
}

async function probeLeaves(page: Page): Promise<LeafSummary[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __lastGraph?: {
        nodes?: Map<string, {
          id: string;
          leafletRef?: { position: string; rachisU: number };
        }>;
      };
    };
    const graph = w.__lastGraph;
    if (!graph?.nodes) return [];
    const byTag = new Map<string, { primary: number[]; intercalary: number[]; terminal: number[] }>();
    for (const node of graph.nodes.values()) {
      const ref = node.leafletRef;
      if (!ref) continue;
      const tag = node.id.match(/axis\d+:n\d+/)?.[0];
      if (!tag) continue;
      if (!byTag.has(tag)) byTag.set(tag, { primary: [], intercalary: [], terminal: [] });
      const g = byTag.get(tag)!;
      if (ref.position === 'primary') g.primary.push(ref.rachisU);
      else if (ref.position === 'intercalary') g.intercalary.push(ref.rachisU);
      else if (ref.position === 'terminal') g.terminal.push(ref.rachisU);
    }
    const out: LeafSummary[] = [];
    for (const [parentTag, g] of byTag) {
      g.primary.sort((a, b) => a - b);
      g.intercalary.sort((a, b) => a - b);
      const allUs = [...new Set([...g.primary, ...g.intercalary, ...g.terminal])].sort((a, b) => a - b);
      const gaps: number[] = [];
      for (let i = 1; i < allUs.length; i++) gaps.push(allUs[i] - allUs[i - 1]);
      out.push({
        parentTag,
        pairCount: Math.floor(g.primary.length / 2),
        primaryUs: g.primary,
        intercalaryUs: g.intercalary,
        terminalU: g.terminal[0] ?? 1.0,
        gaps,
      });
    }
    return out;
  });
}

function caseForPairCount(pc: number): 'young' | 'mature' | 'complex' {
  if (pc <= 2) return 'young';
  if (pc === 3) return 'mature';
  return 'complex';
}

const GAP_THRESHOLDS: Record<'young' | 'mature' | 'complex', { avg: number; max: number }> = {
  young: { avg: 0.35, max: 0.50 },
  mature: { avg: 0.25, max: 0.35 },
  complex: { avg: 0.22, max: 0.30 },
};

test.describe('Compound Leaf Layout (SSOT #193, Iter 39 Phase J0-4)', () => {
  test('COMPOUND-GAP-01: case-aware attach U gap threshold', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const leaves = await probeLeaves(page);
    expect(leaves.length, 'leaves found').toBeGreaterThan(0);
    const violations: string[] = [];
    for (const leaf of leaves) {
      if (leaf.pairCount === 0) continue;  // 1 pair only → gap 무의미
      if (leaf.gaps.length === 0) continue;
      const cas = caseForPairCount(leaf.pairCount);
      const th = GAP_THRESHOLDS[cas];
      const avgGap = leaf.gaps.reduce((a, b) => a + b, 0) / leaf.gaps.length;
      const maxGap = Math.max(...leaf.gaps);
      // 1 pair (young) — max gap 적용 안 함
      if (leaf.pairCount === 1) {
        if (avgGap > th.avg) {
          violations.push(`${leaf.parentTag} (young 1pair): avgGap ${avgGap.toFixed(3)} > ${th.avg}`);
        }
        continue;
      }
      if (avgGap > th.avg) {
        violations.push(`${leaf.parentTag} (${cas}): avgGap ${avgGap.toFixed(3)} > ${th.avg}`);
      }
      if (maxGap > th.max) {
        violations.push(`${leaf.parentTag} (${cas}): maxGap ${maxGap.toFixed(3)} > ${th.max}`);
      }
    }
    expect(
      violations,
      `COMPOUND-GAP-01 violations:\n${violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });

  test('COMPOUND-SLOTS-01: intercalary가 primary 사이 또는 edge slot 영역', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const leaves = await probeLeaves(page);
    expect(leaves.length, 'leaves found').toBeGreaterThan(0);
    const violations: string[] = [];
    for (const leaf of leaves) {
      if (leaf.intercalaryUs.length === 0) continue;
      if (leaf.primaryUs.length === 0) continue;
      const minPrim = Math.min(...leaf.primaryUs);
      const maxPrim = Math.max(...leaf.primaryUs);
      // edge slot 허용 영역: minPrim - 0.10 ≤ u ≤ maxPrim + 0.10
      const lo = Math.max(0, minPrim - 0.10);
      const hi = Math.min(1.0, maxPrim + 0.10);
      for (const u of leaf.intercalaryUs) {
        if (u < lo || u > hi) {
          violations.push(`${leaf.parentTag}: intercalary u=${u.toFixed(3)} out of [${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
        }
      }
    }
    expect(
      violations,
      `COMPOUND-SLOTS-01 violations:\n${violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });

  test('TERMINAL-CLEARANCE-01: lastPrimaryU ≤ 0.82 + terminalU − lastPrimaryU ≥ 0.15', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const leaves = await probeLeaves(page);
    expect(leaves.length, 'leaves found').toBeGreaterThan(0);
    const violations: string[] = [];
    for (const leaf of leaves) {
      if (leaf.primaryUs.length === 0) continue;
      const lastPrimaryU = Math.max(...leaf.primaryUs);
      if (lastPrimaryU > 0.82) {
        violations.push(`${leaf.parentTag}: lastPrimaryU ${lastPrimaryU.toFixed(3)} > 0.82`);
      }
      const clearance = leaf.terminalU - lastPrimaryU;
      if (clearance < 0.15) {
        violations.push(`${leaf.parentTag}: clearance ${clearance.toFixed(3)} < 0.15 (lastPrim=${lastPrimaryU.toFixed(3)}, term=${leaf.terminalU.toFixed(3)})`);
      }
    }
    expect(
      violations,
      `TERMINAL-CLEARANCE-01 violations:\n${violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });
});
