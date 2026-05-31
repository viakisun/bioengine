// SSOT #186 — Mesh anchor invariants. ANCHOR-01 ~ ANCHOR-04.
// See: docs/architecture/MESH_ANCHORS.md

import { test, expect, type Page } from '@playwright/test';
import { normalizeLeafMeshVertices } from '../../src/plant/anchors';

async function enterSkin(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } } };
    w.__twinStore?.getState().setMode('single-plant');
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

test.describe('Mesh Anchor Contracts (SSOT #186)', () => {
  test('ANCHOR-01: LeafBladeOnly mesh의 vertex.x_min이 mesh-local (0,0,0) 근처 (≤1mm)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __debugScene?: { meshes?: Array<{ name: string; getVerticesData(k: string): Float32Array | null }> };
      };
      const leaves = w.__debugScene?.meshes?.filter(m => m.name.startsWith('skinplant_leaf_')) ?? [];
      return leaves.map(m => {
        const verts = m.getVerticesData('position');
        if (!verts || verts.length < 3) return { name: m.name, minX_mm: NaN };
        let minX = Infinity;
        for (let i = 0; i < verts.length; i += 3) {
          if (verts[i] < minX) minX = verts[i];
        }
        return { name: m.name, minX_mm: minX * 1000 };
      });
    });
    expect(probe.length, 'leaf mesh 개수').toBeGreaterThan(0);
    for (const r of probe) {
      expect(Math.abs(r.minX_mm), `${r.name}: vertex.x_min`).toBeLessThan(1);
    }
  });

  test('ANCHOR-04: normalizeLeafMeshVertices byte-identical to Iter 24 acfad71 inline', async () => {
    // Synthetic chunk.positions — Iter 24 logic 재현 후 비교.
    const positions = new Float32Array([
      // 첫 leaflet stem-side 가까운 vertex들
      0.05, 0.0, 0.1,
      0.08, -0.01, 0.05,
      // 가장 stem-side
      0.03, 0.0, 0.0,
      // 다른 leaflet
      0.5, -0.1, 0.2,
      1.0, -0.2, 0.0,
    ]);
    const before = new Float32Array(positions);
    normalizeLeafMeshVertices(positions);
    // Inline Iter 24 acfad71 logic 별도 적용해 결과 비교.
    const expected = new Float32Array(before);
    {
      let minX = Infinity;
      for (let i = 0; i < expected.length; i += 3) {
        if (expected[i] < minX) minX = expected[i];
      }
      if (Number.isFinite(minX) && minX !== 0) {
        for (let i = 0; i < expected.length; i += 3) {
          expected[i] -= minX;
        }
      }
    }
    expect(Array.from(positions)).toEqual(Array.from(expected));
    // Iter 24 contract: 결과 min x = 0
    let resultMin = Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i] < resultMin) resultMin = positions[i];
    }
    expect(resultMin).toBeCloseTo(0, 6);
  });
});
