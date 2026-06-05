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

    // ★ S142 후속 — drawCalls 누적 카운터 → 두 시점 측정으로 per-frame 추정.
    //   1초 간격 두 sample → delta drawCalls / delta time / fps = drawCalls/frame.
    type Sample = { drawCallsRaw: number | null; ts: number; fps: number } | null;
    const sample1 = await page.evaluate((): Sample => {
      const w = window as unknown as {
        __debugEngine?: { engine?: { getFps: () => number; _drawCalls?: { current: number } } } | { getFps: () => number; _drawCalls?: { current: number } };
      };
      const engHandle = w.__debugEngine;
      const engine = engHandle && 'engine' in engHandle ? engHandle.engine : engHandle;
      if (!engine) return null;
      return {
        drawCallsRaw: engine._drawCalls?.current ?? null,
        ts: performance.now(),
        fps: engine.getFps(),
      };
    });
    await page.waitForTimeout(1000);
    const measurement = await page.evaluate(() => {
      const w = window as unknown as {
        __debugScene?: { meshes: Array<{ isEnabled: () => boolean; isVisible: boolean; getTotalVertices: () => number; getTotalIndices: () => number; name: string }> };
        __debugEngine?: { engine?: { getFps: () => number; _drawCalls?: { current: number } } } | { getFps: () => number; _drawCalls?: { current: number } };
      };
      const scene = w.__debugScene;
      const engHandle = w.__debugEngine;
      const engine = engHandle && 'engine' in engHandle ? engHandle.engine : engHandle;
      if (!scene || !engine) return null;
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
        fps: engine.getFps(),
        drawCallsRaw: engine._drawCalls?.current ?? null,
        ts: performance.now(),
        totalMeshes: scene.meshes.length,
        totalVerts,
        totalTris,
        leafVerts,
        leafTris,
      };
    });
    // per-frame drawCalls derive
    let drawCallsPerFrame: number | null = null;
    if (sample1 && measurement && sample1.drawCallsRaw != null && measurement.drawCallsRaw != null) {
      const deltaCalls = measurement.drawCallsRaw - sample1.drawCallsRaw;
      const deltaSec = (measurement.ts - sample1.ts) / 1000;
      const avgFps = (sample1.fps + measurement.fps) / 2;
      if (deltaSec > 0 && avgFps > 0) {
        const callsPerSec = deltaCalls / deltaSec;
        drawCallsPerFrame = Math.max(0, Math.round(callsPerSec / avgFps));
      }
    }
    const metrics = measurement ? {
      fps: Math.round(measurement.fps),
      drawCallsPerFrame,
      totalMeshes: measurement.totalMeshes,
      totalVerts: measurement.totalVerts,
      totalTris: measurement.totalTris,
      leafVerts: measurement.leafVerts,
      leafTris: measurement.leafTris,
    } : null;

    console.log(`[preset=${preset}]`, JSON.stringify(metrics, null, 2));
    expect(metrics).not.toBeNull();
    expect(metrics!.leafVerts).toBeGreaterThan(0);
  });
}
