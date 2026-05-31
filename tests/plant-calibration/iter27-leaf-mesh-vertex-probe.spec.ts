// 한 leaf mesh의 vertex range / boundingBox 직접 측정 — disconnect 원인 진단.
import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';

async function enterSkin(page: Page) {
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
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } } };
    w.__twinStore?.getState().setSinglePlantMinute(45 * 1440 + 12 * 60);
  });
  await page.waitForTimeout(3500);
}

test('leaf vertex probe', async ({ page }) => {
  test.setTimeout(120_000);
  await enterSkin(page);
  const probe = await page.evaluate(() => {
    const w = window as unknown as { __debugScene?: { meshes?: Array<{ name: string; position: { x: number; y: number; z: number }; parent?: { name: string }; getBoundingInfo(): { boundingBox: { minimum: { x: number; y: number; z: number }; maximum: { x: number; y: number; z: number }; minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } }; getVerticesData(kind: string): Float32Array | null; refreshBoundingInfo?: () => void; }> } };
    const leaves = w.__debugScene?.meshes?.filter(m => m.name.startsWith('skinplant_leaf_')) ?? [];
    const sample = leaves.slice(0, 3).map(m => {
      const bi = m.getBoundingInfo();
      const verts = m.getVerticesData('position');
      let vmin = { x: Infinity, y: Infinity, z: Infinity };
      let vmax = { x: -Infinity, y: -Infinity, z: -Infinity };
      let vCount = 0;
      if (verts) {
        vCount = verts.length / 3;
        for (let i = 0; i < verts.length; i += 3) {
          if (verts[i] < vmin.x) vmin.x = verts[i];
          if (verts[i + 1] < vmin.y) vmin.y = verts[i + 1];
          if (verts[i + 2] < vmin.z) vmin.z = verts[i + 2];
          if (verts[i] > vmax.x) vmax.x = verts[i];
          if (verts[i + 1] > vmax.y) vmax.y = verts[i + 1];
          if (verts[i + 2] > vmax.z) vmax.z = verts[i + 2];
        }
      }
      return {
        name: m.name,
        position: { x: m.position.x, y: m.position.y, z: m.position.z },
        parent: m.parent?.name,
        vertexCount: vCount,
        vertexMin: vmin,
        vertexMax: vmax,
        bbox_minLocal: { x: bi.boundingBox.minimum.x, y: bi.boundingBox.minimum.y, z: bi.boundingBox.minimum.z },
        bbox_maxLocal: { x: bi.boundingBox.maximum.x, y: bi.boundingBox.maximum.y, z: bi.boundingBox.maximum.z },
        bbox_minWorld: { x: bi.boundingBox.minimumWorld.x, y: bi.boundingBox.minimumWorld.y, z: bi.boundingBox.minimumWorld.z },
        bbox_maxWorld: { x: bi.boundingBox.maximumWorld.x, y: bi.boundingBox.maximumWorld.y, z: bi.boundingBox.maximumWorld.z },
        scaling: (m as unknown as { scaling: { x: number; y: number; z: number } }).scaling,
        rotationQuaternion: (m as unknown as { rotationQuaternion?: { x: number; y: number; z: number; w: number } }).rotationQuaternion,
        absolutePosition: (m as unknown as { absolutePosition: { x: number; y: number; z: number } }).absolutePosition,
        worldMatrix: (m as unknown as { getWorldMatrix(): { m: number[] } }).getWorldMatrix().m,
      };
    });
    return { totalLeaves: leaves.length, sample };
  });
  await fs.writeFile('test-results/iter27-vertex-probe.json', JSON.stringify(probe, null, 2));
  console.log(JSON.stringify(probe, null, 2));
});
