// SSOT #206 — Leaf Variation (Iter 39 Phase L2-5a — reporting first).
// See: src/scene/leaf-engine/buildLeafletMeshes.ts (per-leaflet jitter),
//      LEAF_MESH_PIPELINE_AUDIT.md
//
// 사용자 v3 #5 (보완): variation threshold _처음부터 hard invariant X_.
//   실제 std-dev 측정 → 1차 reporting (S16) → 2차 threshold 확정 (S17).
//
// 1차 (S16, 본 spec): per-axis 8 leaves의 aspect/length/width std-dev 측정
// + console.log. assert 없음.
//
// 2차 (S17): 측정값 × 0.7 등 보수적 threshold → hard invariant. modulo
// aliasing 회귀 catch.

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

test.describe('Leaf Variation (SSOT #206, Iter 39 Phase L2-5a reporting)', () => {
  test('LEAF-VARIATION-01 (S16 reporting): per-axis aspect/length/width std-dev', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);

    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __scene?: { meshes?: Array<{ name?: string; getVerticesData(k: string): Float32Array | null }> };
        __debugScene?: { meshes?: Array<{ name?: string; getVerticesData(k: string): Float32Array | null }> };
      };
      const scene = w.__scene ?? w.__debugScene;
      if (!scene?.meshes) return { measurements: [] };

      const measurements: Array<{
        axis: number; node: number; leaflet: number; position: string;
        length: number; width: number; aspect: number;
      }> = [];
      for (const m of scene.meshes) {
        if (!m.name || !/skinplant_leaf_.*_l\d+_/.test(m.name)) continue;
        const verts = m.getVerticesData('position');
        if (!verts || verts.length < 3) continue;
        let xMin = Infinity, xMax = -Infinity, zMaxAbs = 0;
        for (let i = 0; i < verts.length; i += 3) {
          if (verts[i] < xMin) xMin = verts[i];
          if (verts[i] > xMax) xMax = verts[i];
          const z = Math.abs(verts[i + 2]);
          if (z > zMaxAbs) zMaxAbs = z;
        }
        const length = xMax - xMin;
        const width = zMaxAbs * 2;
        const aspect = width > 0 ? length / width : 0;
        const m1 = m.name.match(/_a(\d+)_n(\d+)_l(\d+)_(\w+)$/);
        if (m1) {
          measurements.push({
            axis: +m1[1], node: +m1[2], leaflet: +m1[3], position: m1[4],
            length, width, aspect,
          });
        }
      }
      return { measurements };
    });

    expect(probe.measurements.length, 'leaf mesh 측정 count').toBeGreaterThan(0);

    // per-axis grouping.
    const byAxis = new Map<number, typeof probe.measurements>();
    for (const m of probe.measurements) {
      if (!byAxis.has(m.axis)) byAxis.set(m.axis, []);
      byAxis.get(m.axis)!.push(m);
    }

    const stdDev = (arr: number[]) => {
      if (arr.length < 2) return 0;
      const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
      return Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length);
    };
    const meanOf = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((s, x) => s + x, 0) / arr.length;

    // eslint-disable-next-line no-console
    console.log('LEAF-VARIATION-01 (reporting):');
    for (const [axis, ms] of byAxis) {
      const aspects = ms.map(m => m.aspect);
      const lengths = ms.map(m => m.length);
      const widths = ms.map(m => m.width);

      // per-position breakdown
      const byPosition: Record<string, typeof ms> = {};
      for (const m of ms) {
        if (!byPosition[m.position]) byPosition[m.position] = [];
        byPosition[m.position].push(m);
      }

      // eslint-disable-next-line no-console
      console.log(`  axis ${axis} (n=${ms.length}):`);
      // eslint-disable-next-line no-console
      console.log(`    aspect  mean=${meanOf(aspects).toFixed(3)} std-dev=${stdDev(aspects).toFixed(4)}`);
      // eslint-disable-next-line no-console
      console.log(`    length  mean=${meanOf(lengths).toFixed(4)}m std-dev=${stdDev(lengths).toFixed(5)}m`);
      // eslint-disable-next-line no-console
      console.log(`    width   mean=${meanOf(widths).toFixed(4)}m std-dev=${stdDev(widths).toFixed(5)}m`);
      for (const [pos, posMs] of Object.entries(byPosition)) {
        if (posMs.length < 2) continue;
        const posAspects = posMs.map(m => m.aspect);
        // eslint-disable-next-line no-console
        console.log(`      ${pos.padEnd(12)} n=${posMs.length} aspect std-dev=${stdDev(posAspects).toFixed(4)}`);
      }
    }

    // ★ S17 — Hard threshold (실측 × 0.7 보수적, modulo aliasing 회귀 catch).
    //   axis 0 baseline (S16 measurement):
    //     aspect overall std-dev 0.233 → threshold > 0.16
    //     length overall std-dev 0.100 → threshold > 0.07 (m)
    //     terminal aspect std-dev 0.055 → threshold > 0.04 (작음, aliasing 의심)
    //     primary  aspect std-dev 0.119 → threshold > 0.08
    //     intercalary aspect std-dev 0.200 → threshold > 0.14
    for (const [axis, ms] of byAxis) {
      if (ms.length < 4) continue;  // 너무 적은 leaves는 skip
      const aspects = ms.map(m => m.aspect);
      const lengths = ms.map(m => m.length);

      expect(
        stdDev(aspects),
        `axis ${axis} overall aspect std-dev (variation 부족 = modulo aliasing 의심)`,
      ).toBeGreaterThan(0.16);
      expect(
        stdDev(lengths),
        `axis ${axis} overall length std-dev (variation 부족)`,
      ).toBeGreaterThan(0.07);

      // per-position checks (terminal n=8은 적으니 skip 가능).
      const byPosition: Record<string, typeof ms> = {};
      for (const m of ms) {
        if (!byPosition[m.position]) byPosition[m.position] = [];
        byPosition[m.position].push(m);
      }
      const primaryAspects = (byPosition['primary'] ?? []).map(m => m.aspect);
      if (primaryAspects.length >= 4) {
        expect(
          stdDev(primaryAspects),
          `axis ${axis} primary aspect std-dev`,
        ).toBeGreaterThan(0.08);
      }
      const intercalaryAspects = (byPosition['intercalary'] ?? []).map(m => m.aspect);
      if (intercalaryAspects.length >= 4) {
        expect(
          stdDev(intercalaryAspects),
          `axis ${axis} intercalary aspect std-dev`,
        ).toBeGreaterThan(0.14);
      }
    }
  });
});
