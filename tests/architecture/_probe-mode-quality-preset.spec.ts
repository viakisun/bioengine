// ★ S142 후속 — mode quality.level → meshPreset 자동 매핑 검증.
//   기존 ?leafConfig= URL 없이 mode 만으로 preset이 적용되는지.
//   mapping: low→aggressive, medium→lite (default), high→baseline.
import { test, expect } from '@playwright/test';

const QUALITIES = ['low', 'medium', 'high'] as const;

for (const q of QUALITIES) {
  test(`mode quality=${q} → preset auto`, async ({ page }) => {
    test.setTimeout(120_000);
    // ?leafConfig= 미지정 — mode mapping만 작동
    await page.goto(
      `http://localhost:8090/?mode=greenhouse&extraPlants=8&quality=${q}`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForTimeout(45_000);

    await page.screenshot({
      path: `test-results/mode-quality-${q}.png`,
      fullPage: false,
      timeout: 45_000,
    });

    const m = await page.evaluate(() => {
      const w = window as unknown as {
        __debugScene?: { meshes: Array<{ isEnabled: () => boolean; isVisible: boolean; getTotalVertices: () => number; getTotalIndices: () => number; name: string }> };
      };
      const scene = w.__debugScene;
      if (!scene) return null;
      let total = 0, leaf = 0;
      for (const mesh of scene.meshes) {
        if (!mesh.isEnabled() || !mesh.isVisible) continue;
        const v = mesh.getTotalVertices();
        total += v;
        if ((mesh.name ?? '').startsWith('skinplant_leaf')) leaf += v;
      }
      return { totalVerts: total, leafVerts: leaf, meshes: scene.meshes.length };
    });

    console.log(`[mode=${q}]`, JSON.stringify(m, null, 2));
    expect(m).not.toBeNull();
    expect(m!.leafVerts).toBeGreaterThan(0);
  });
}
