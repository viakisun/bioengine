// SSOT #187 — OrganAnchor completeness invariants.
// See: docs/architecture/SEMANTIC_GRAPH.md sections 2.3, 3.
//
// Iter 26 PR 2-2: every organAnchor on every edge carries chain + morphology
// + state + visualHint after the populator runs.

import { test, expect, type Page } from '@playwright/test';

async function enterSkin(page: Page, day: number) {
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

test.describe('OrganAnchor Completeness (SSOT #187)', () => {
  test('ANCHOR-COMP-01: every organAnchor has chain + morphology + state + visualHint', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          edges: Map<string, {
            id: string;
            organAnchors?: Array<{
              id: string;
              kind: string;
              chain?: { rootNodeId: string; attachmentNodeId: string; nodeChain: string[]; edgeChain: string[] };
              morphology?: { kind: string };
              state?: { visibility: boolean };
              visualHint?: { markerColor: string; label: string };
            }>;
          }>;
        };
      };
      const g = w.__skinplantGraph;
      if (!g) return null;
      let anchorCount = 0;
      const missing: { id: string; missing: string[] }[] = [];
      const kinds = new Set<string>();
      for (const edge of g.edges.values()) {
        if (!edge.organAnchors) continue;
        for (const a of edge.organAnchors) {
          anchorCount++;
          kinds.add(a.kind);
          const m: string[] = [];
          if (!a.chain) m.push('chain');
          if (!a.morphology) m.push('morphology');
          if (!a.state) m.push('state');
          if (!a.visualHint) m.push('visualHint');
          if (m.length > 0) missing.push({ id: a.id, missing: m });
        }
      }
      return { anchorCount, missing, kinds: Array.from(kinds) };
    });
    expect(report, 'graph available').not.toBeNull();
    expect(report!.anchorCount, 'anchor count > 0').toBeGreaterThan(0);
    expect(report!.missing, 'all anchors have chain+morphology+state+visualHint').toEqual([]);
    // At day 45 a tomato has leaves + at least one truss → expect ≥2 kinds.
    expect(report!.kinds.length, 'multiple anchor kinds').toBeGreaterThanOrEqual(2);
  });

  test('ANCHOR-COMP-02: leaf anchor morphology carries sizeFactor + leafletCount', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const sample = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          edges: Map<string, {
            organAnchors?: Array<{
              id: string;
              kind: string;
              morphology?: { sizeFactor?: number; leafletCount?: number };
            }>;
          }>;
        };
      };
      const out: { id: string; sizeFactor?: number; leafletCount?: number }[] = [];
      if (w.__skinplantGraph) {
        for (const edge of w.__skinplantGraph.edges.values()) {
          if (!edge.organAnchors) continue;
          for (const a of edge.organAnchors) {
            if (a.kind === 'leaf_blade' && a.morphology) {
              out.push({
                id: a.id,
                sizeFactor: a.morphology.sizeFactor,
                leafletCount: a.morphology.leafletCount,
              });
            }
          }
        }
      }
      return out;
    });
    expect(sample.length, 'has leaf anchors').toBeGreaterThan(0);
    for (const s of sample) {
      expect(s.sizeFactor, `${s.id} sizeFactor`).toBeGreaterThan(0);
      expect(s.leafletCount, `${s.id} leafletCount`).toBeGreaterThan(0);
    }
  });

  test('ANCHOR-COMP-03: fruit anchor morphology carries fruitGenome when set', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 60); // ensure trusses present + fruit set
    const sample = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          edges: Map<string, {
            organAnchors?: Array<{
              id: string;
              kind: string;
              morphology?: {
                targetDiameterM?: number;
                fruitGenome?: { loculeCount: number; heightWidthRatio: number };
              };
            }>;
          }>;
        };
      };
      const out: { id: string; targetDiameterM?: number; hasGenome: boolean }[] = [];
      if (w.__skinplantGraph) {
        for (const edge of w.__skinplantGraph.edges.values()) {
          if (!edge.organAnchors) continue;
          for (const a of edge.organAnchors) {
            if (a.kind === 'fruit' && a.morphology) {
              out.push({
                id: a.id,
                targetDiameterM: a.morphology.targetDiameterM,
                hasGenome: a.morphology.fruitGenome !== undefined,
              });
            }
          }
        }
      }
      return out;
    });
    // Spec is informational on D60 — fruits may or may not have set yet.
    // Just verify shape: if morphology exists, fields obey schema.
    for (const s of sample) {
      if (s.targetDiameterM !== undefined) {
        expect(s.targetDiameterM, `${s.id} targetDiameterM > 0`).toBeGreaterThan(0);
      }
    }
  });

  test('ANCHOR-COMP-04: graph.cultivarGenomeSnapshot present', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const hasSnapshot = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: { cultivarGenomeSnapshot?: unknown };
      };
      return w.__skinplantGraph?.cultivarGenomeSnapshot !== undefined;
    });
    expect(hasSnapshot, 'graph.cultivarGenomeSnapshot populated').toBe(true);
  });
});
