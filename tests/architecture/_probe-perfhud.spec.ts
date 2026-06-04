// S140-A — PerfHUD가 실제로 metric 표시하는지 + quality 별 cost 차이 확인.
import { test, expect } from '@playwright/test';

const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;

for (const q of QUALITY_LEVELS) {
  test(`perfhud captures metrics quality=${q}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(
      `http://localhost:8090/?mode=greenhouse&extraPlants=8&quality=${q}&perfHud=1`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForTimeout(q === 'high' ? 60_000 : q === 'medium' ? 30_000 : 15_000);
    await page.screenshot({
      path: `test-results/perfhud-${q}.png`,
      fullPage: false,
      timeout: 45_000,
    });
    // window.__debugScene 직접 조사 — HUD 내용보다 raw metric 채집이 더 유용.
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
      let verts = 0, tris = 0, enabled = 0;
      const byPrefix: Record<string, { v: number; t: number; n: number }> = {};
      for (const m of scene.meshes) {
        if (!m.isEnabled() || !m.isVisible) continue;
        enabled++;
        const v = m.getTotalVertices();
        const t = Math.floor(m.getTotalIndices() / 3);
        verts += v;
        tris += t;
        const prefix = (m.name || 'unknown').split('_').slice(0, 2).join('_') || 'unknown';
        const bucket = byPrefix[prefix] ?? { v: 0, t: 0, n: 0 };
        bucket.v += v; bucket.t += t; bucket.n++;
        byPrefix[prefix] = bucket;
      }
      const top = Object.entries(byPrefix)
        .sort((a, b) => b[1].v - a[1].v)
        .slice(0, 8)
        .map(([p, b]) => `  ${p.padEnd(28, ' ')} n=${String(b.n).padStart(4)} v=${b.v.toLocaleString().padStart(10)} t=${b.t.toLocaleString().padStart(10)}`);
      return {
        fps: Math.round(engine.getFps()),
        drawCalls,
        totalMeshes: scene.meshes.length,
        enabledMeshes: enabled,
        verts,
        tris,
        topPrefixes: top.join('\n'),
      };
    });
    console.log(`[quality=${q}] metrics:`, JSON.stringify(metrics, null, 2));
    expect(metrics).not.toBeNull();
    expect(metrics!.verts).toBeGreaterThan(0);
  });
}
