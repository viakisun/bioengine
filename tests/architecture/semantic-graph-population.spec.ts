// SSOT #187 — Semantic graph population invariants.
// See: docs/architecture/SEMANTIC_GRAPH.md sections 2.1, 3.
//
// Iter 26 PR 2-1: every node carries type + frame + visualHint after populator runs.

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

const ALLOWED_TYPES = new Set([
  'main-stem-node',
  'side-shoot-node',
  'petiole-root',
  'petiole-tip',
  'leaf-blade-root',
  'truss-root',
  'peduncle-node',
  'rachis-node',
  'pedicel-root',
  'pedicel-tip',
  'fruit-root',
  'flower-root',
  'calyx-root',
]);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_SHAPES = new Set(['sphere', 'disk', 'ring', 'arrow']);

test.describe('Semantic Graph Population (SSOT #187)', () => {
  test('SEM-POP-01: every node carries type + frame + visualHint', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          nodes: Map<string, {
            id: string;
            type?: string;
            frame?: { tangent: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } };
            visualHint?: { markerColor: string; markerShape: string; markerSizeM: number };
          }>;
        };
      };
      const g = w.__skinplantGraph;
      if (!g) return null;
      const missing: { id: string; missing: string[] }[] = [];
      const tangentLens: number[] = [];
      const normalLens: number[] = [];
      let total = 0;
      const samples: { id: string; type?: string; color?: string; shape?: string }[] = [];
      for (const node of g.nodes.values()) {
        total++;
        const m: string[] = [];
        if (!node.type) m.push('type');
        if (!node.frame) m.push('frame');
        if (!node.visualHint) m.push('visualHint');
        if (m.length > 0) missing.push({ id: node.id, missing: m });
        if (node.frame) {
          const t = node.frame.tangent;
          const n = node.frame.normal;
          tangentLens.push(Math.sqrt(t.x * t.x + t.y * t.y + t.z * t.z));
          normalLens.push(Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z));
        }
        if (samples.length < 5) {
          samples.push({
            id: node.id,
            type: node.type,
            color: node.visualHint?.markerColor,
            shape: node.visualHint?.markerShape,
          });
        }
      }
      return { total, missing, tangentLens, normalLens, samples };
    });
    expect(report, 'graph available').not.toBeNull();
    expect(report!.total, 'node count > 0').toBeGreaterThan(0);
    expect(report!.missing, 'all nodes have type+frame+visualHint').toEqual([]);
    // tangent + normal are unit length (within float tolerance).
    for (const l of report!.tangentLens) {
      expect(Math.abs(l - 1), 'tangent unit length').toBeLessThan(1e-3);
    }
    for (const l of report!.normalLens) {
      expect(Math.abs(l - 1), 'normal unit length').toBeLessThan(1e-3);
    }
  });

  test('SEM-POP-02: node.type values are in allowed enum', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const types = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: { nodes: Map<string, { type?: string }> };
      };
      const out: string[] = [];
      if (w.__skinplantGraph) {
        for (const n of w.__skinplantGraph.nodes.values()) {
          if (n.type) out.push(n.type);
        }
      }
      return out;
    });
    expect(types.length).toBeGreaterThan(0);
    const bad = types.filter((t) => !ALLOWED_TYPES.has(t));
    expect(bad, `unknown node types: ${bad.join(', ')}`).toEqual([]);
  });

  test('SEM-POP-03: visualHint color is hex + shape is allowed', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const hints = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          nodes: Map<string, { id: string; visualHint?: { markerColor: string; markerShape: string; markerSizeM: number } }>;
        };
      };
      const out: { id: string; color: string; shape: string; size: number }[] = [];
      if (w.__skinplantGraph) {
        for (const n of w.__skinplantGraph.nodes.values()) {
          if (n.visualHint) {
            out.push({
              id: n.id,
              color: n.visualHint.markerColor,
              shape: n.visualHint.markerShape,
              size: n.visualHint.markerSizeM,
            });
          }
        }
      }
      return out;
    });
    expect(hints.length).toBeGreaterThan(0);
    for (const h of hints) {
      expect(HEX_COLOR.test(h.color), `${h.id} color hex`).toBe(true);
      expect(ALLOWED_SHAPES.has(h.shape), `${h.id} shape allowed`).toBe(true);
      expect(h.size, `${h.id} markerSizeM > 0`).toBeGreaterThan(0);
      expect(h.size, `${h.id} markerSizeM < 10cm`).toBeLessThan(0.1);
    }
  });
});
