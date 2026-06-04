// ★ 진짜 가시성 진단 — mesh 있지만 안 보이는 이유.

import { test } from '@playwright/test';

test('plant visibility detailed', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('http://localhost:8090/?mode=greenhouse', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);

  const state = await page.evaluate(() => {
    const w = window as unknown as {
      __scene?: {
        meshes: Array<{
          name: string;
          isVisible: boolean;
          isEnabled(): boolean;
          getTotalVertices(): number;
          getAbsolutePosition(): { x: number; y: number; z: number };
          parent?: { name: string };
        }>;
      };
    };
    const scene = w.__scene;
    if (!scene) return { error: 'no scene' };

    // skinplant_skin_<seed> are the STEM meshes (one per plant)
    const stemMeshes = scene.meshes
      .filter((m) => m.name.match(/^skinplant_skin_\d+$/))
      .map((m) => ({
        name: m.name,
        verts: m.getTotalVertices(),
        isVisible: m.isVisible,
        isEnabled: m.isEnabled(),
        pos: m.getAbsolutePosition(),
        parent: m.parent?.name ?? 'none',
      }));

    // skinplant_<seed> = root TransformNode (parent of each plant's meshes)
    const rootNodes = (scene as unknown as { transformNodes?: Array<{ name: string; isEnabled(): boolean; position: { x: number; y: number; z: number }; getChildren?: () => unknown[] }> }).transformNodes
      ?.filter((n) => n.name.match(/^skinplant_\d+$/))
      .map((n) => ({
        name: n.name,
        isEnabled: n.isEnabled(),
        pos: { x: n.position.x, y: n.position.y, z: n.position.z },
      })) ?? [];

    return { stemMeshes, rootNodes, stemCount: stemMeshes.length, rootCount: rootNodes.length };
  });

  console.log('\n=== Plant visibility ===');
  console.log(JSON.stringify(state, null, 2));
});
