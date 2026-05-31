// SSOT #187 — Edge renderPolicy completeness invariants.
// See: docs/architecture/SEMANTIC_GRAPH.md sections 2.2, 2.4.
//
// Iter 26 PR 2-3: every edge carries renderPolicy.radius + material +
// visualHint after the populator runs. junction.parentContext is permitted
// to be empty here (populated by StemFamilyTubeNetworkBuilder downstream).

import { test, expect, type Page } from '@playwright/test';

async function enterSkin(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } } };
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } } };
  });
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as { __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } } };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_ROLES = new Set([
  'main-stem', 'side-shoot', 'petiole', 'peduncle', 'rachis', 'pedicel',
]);

test.describe('Edge RenderPolicy Completeness (SSOT #187)', () => {
  test('EDGE-POL-01: every edge has renderPolicy.radius + material + visualHint', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          edges: Map<string, {
            id: string;
            type: string;
            renderPolicy?: {
              radius: { biological: number; render: number; min?: number };
              material?: { role: string };
              visualHint?: { color: string };
              junction: { embedDepthM: number };
            };
          }>;
        };
      };
      const g = w.__skinplantGraph;
      if (!g) return null;
      const missing: { id: string; missing: string[] }[] = [];
      const rolesByType: Record<string, Set<string>> = {};
      let total = 0;
      for (const e of g.edges.values()) {
        total++;
        const m: string[] = [];
        if (!e.renderPolicy) m.push('renderPolicy');
        else {
          if (!e.renderPolicy.radius) m.push('radius');
          if (!e.renderPolicy.material) m.push('material');
          if (!e.renderPolicy.visualHint) m.push('visualHint');
          if (e.renderPolicy.material) {
            const r = rolesByType[e.type] ?? new Set<string>();
            r.add(e.renderPolicy.material.role);
            rolesByType[e.type] = r;
          }
        }
        if (m.length > 0) missing.push({ id: e.id, missing: m });
      }
      const rolesSerialized: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(rolesByType)) rolesSerialized[k] = Array.from(v);
      return { total, missing, rolesSerialized };
    });
    expect(report, 'graph available').not.toBeNull();
    expect(report!.total, 'edge count > 0').toBeGreaterThan(0);
    expect(report!.missing, 'all edges have renderPolicy fields').toEqual([]);
  });

  test('EDGE-POL-02: material.role values are in allowed enum', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const roles = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: { edges: Map<string, { renderPolicy?: { material?: { role: string } } }> };
      };
      const out: string[] = [];
      if (w.__skinplantGraph) {
        for (const e of w.__skinplantGraph.edges.values()) {
          const r = e.renderPolicy?.material?.role;
          if (r) out.push(r);
        }
      }
      return out;
    });
    expect(roles.length).toBeGreaterThan(0);
    const bad = roles.filter((r) => !ALLOWED_ROLES.has(r));
    expect(bad, `unknown roles: ${bad.join(', ')}`).toEqual([]);
  });

  test('EDGE-POL-03: visualHint color is hex; radius.render ≥ min', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const sample = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          edges: Map<string, {
            id: string;
            renderPolicy?: {
              radius: { biological: number; render: number; min?: number };
              visualHint?: { color: string };
            };
          }>;
        };
      };
      const out: { id: string; color?: string; bio: number; ren: number; min?: number }[] = [];
      if (w.__skinplantGraph) {
        for (const e of w.__skinplantGraph.edges.values()) {
          if (!e.renderPolicy) continue;
          out.push({
            id: e.id,
            color: e.renderPolicy.visualHint?.color,
            bio: e.renderPolicy.radius.biological,
            ren: e.renderPolicy.radius.render,
            min: e.renderPolicy.radius.min,
          });
        }
      }
      return out;
    });
    expect(sample.length).toBeGreaterThan(0);
    for (const s of sample) {
      expect(s.color, `${s.id} has color`).toBeDefined();
      expect(HEX_COLOR.test(s.color!), `${s.id} color hex`).toBe(true);
      expect(s.bio, `${s.id} biological ≥ 0`).toBeGreaterThanOrEqual(0);
      expect(s.ren, `${s.id} render ≥ 0`).toBeGreaterThanOrEqual(0);
      if (s.min !== undefined) {
        expect(s.ren, `${s.id} render ≥ min`).toBeGreaterThanOrEqual(s.min);
      }
    }
  });
});
