// ★ S142-C — Leaf meshConfig preset 측정 probe.
//
// 3 preset (baseline / lite / aggressive) × quality=medium × extraPlants=8
// 측정: fps / drawCalls / totalVerts / leafVerts / triangles / topPrefixes
// baseline parity 보호: S142-B 변경 후 baseline 측정값이 S142-A 이전 hardcode
// 측정과 _일치_해야 함 (회귀 0).
//
// _probe-perfhud.spec.ts 패턴 재사용 — page.evaluate scene + engine.

import { test, expect } from '@playwright/test';

const PRESETS = ['baseline', 'lite', 'aggressive'] as const;

for (const preset of PRESETS) {
  test(`leaf config preset=${preset}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(
      `http://localhost:8090/?mode=greenhouse&extraPlants=8&quality=medium&leafConfig=${preset}`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForTimeout(45_000); // scene + lazy chunk + plants build

    await page.screenshot({
      path: `test-results/leaf-config-${preset}.png`,
      fullPage: false,
      timeout: 45_000,
    });

    const metrics = await page.evaluate(() => {
      const w = window as unknown as {
        __debugScene?: { meshes: Array<{ isEnabled: () => boolean; isVisible: boolean; getTotalVertices: () => number; getTotalIndices: () => number; name: string }> };
        __debugEngine?: { engine?: { getFps: () => number; _drawCalls?: { current: number } } } | { getFps: () => number; _drawCalls?: { current: number } };
      };
      const scene = w.__debugScene;
      const engHandle = w.__debugEngine;
      const engine = engHandle && 'engine' in engHandle ? engHandle.engine : engHandle;
      if (!scene || !engine) return null;
      const drawCalls = engine._drawCalls?.current ?? null;
      let totalVerts = 0, totalTris = 0, leafVerts = 0, leafTris = 0;
      for (const m of scene.meshes) {
        if (!m.isEnabled() || !m.isVisible) continue;
        const v = m.getTotalVertices();
        const t = Math.floor(m.getTotalIndices() / 3);
        totalVerts += v;
        totalTris += t;
        if ((m.name ?? '').startsWith('skinplant_leaf')) {
          leafVerts += v;
          leafTris += t;
        }
      }
      return {
        fps: Math.round(engine.getFps()),
        drawCalls,
        totalMeshes: scene.meshes.length,
        totalVerts,
        totalTris,
        leafVerts,
        leafTris,
      };
    });

    console.log(`[preset=${preset}]`, JSON.stringify(metrics, null, 2));
    expect(metrics).not.toBeNull();
    expect(metrics!.leafVerts).toBeGreaterThan(0);
  });
}
