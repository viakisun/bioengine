// Iter 27 — leaf_blade anchor 좌표 전부 dump.
//
// 각 leaf의 anchor (= petiole tip = mesh.position)와 매칭 leaf mesh의
// world position을 함께 출력. 사용자가 직접 시각 비교용.

import { test, expect, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
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

test('ITER27-LEAF-COORDS: 모든 leaf anchor 좌표 + 매칭 mesh 좌표 dump', async ({ page }) => {
  test.setTimeout(180_000);
  await enter(page, 90);

  const report = await page.evaluate(() => {
    const w = window as unknown as {
      __skinplantGraph?: {
        nodes: Map<string, { id: string; pos: { x: number; y: number; z: number } }>;
        edges: Map<string, { id: string; organAnchors?: Array<{ id: string; kind: string; anchorNodeId: string }> }>;
      };
      __debugScene?: {
        meshes?: Array<{ name: string; absolutePosition: { x: number; y: number; z: number } }>;
        transformNodes?: Array<{ name: string; absolutePosition: { x: number; y: number; z: number } }>;
      };
    };
    if (!w.__skinplantGraph || !w.__debugScene) return null;
    const ms = w.__debugScene.meshes ?? [];
    const tns = w.__debugScene.transformNodes ?? [];

    const lush = tns.find((t) => t.name.startsWith('skinplant_lush_'));
    const lushWorld = lush ? { x: lush.absolutePosition.x, y: lush.absolutePosition.y, z: lush.absolutePosition.z } : null;
    const sampleLeaf = ms.find((m) => m.name.startsWith('skinplant_leaf_'));
    const seedMatch = sampleLeaf?.name.match(/^skinplant_leaf_(\d+)_/);
    const seed = seedMatch ? seedMatch[1] : null;

    const leafAnchors: { id: string; anchorNodeId: string; anchorPosLocal: { x: number; y: number; z: number }; anchorWorldExpected: { x: number; y: number; z: number } | null; leafMeshWorld: { x: number; y: number; z: number } | null; deltaMm: number | null }[] = [];

    for (const edge of w.__skinplantGraph.edges.values()) {
      if (!edge.organAnchors) continue;
      for (const a of edge.organAnchors) {
        if (a.kind !== 'leaf_blade') continue;
        const node = w.__skinplantGraph.nodes.get(a.anchorNodeId);
        if (!node) continue;
        const anchorPosLocal = { x: node.pos.x, y: node.pos.y, z: node.pos.z };
        const anchorWorldExpected = lushWorld ? {
          x: lushWorld.x + node.pos.x,
          y: lushWorld.y + node.pos.y,
          z: lushWorld.z + node.pos.z,
        } : null;
        const m = a.id.match(/^leaf_blade:axis(\d+):n(\d+)$/);
        let leafMeshWorld = null;
        if (m && seed) {
          const meshName = `skinplant_leaf_${seed}_a${m[1]}_n${m[2]}`;
          const mm = ms.find((m2) => m2.name === meshName);
          if (mm) leafMeshWorld = { x: mm.absolutePosition.x, y: mm.absolutePosition.y, z: mm.absolutePosition.z };
        }
        let deltaMm = null;
        if (anchorWorldExpected && leafMeshWorld) {
          const dx = anchorWorldExpected.x - leafMeshWorld.x;
          const dy = anchorWorldExpected.y - leafMeshWorld.y;
          const dz = anchorWorldExpected.z - leafMeshWorld.z;
          deltaMm = Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000;
        }
        leafAnchors.push({
          id: a.id,
          anchorNodeId: a.anchorNodeId,
          anchorPosLocal,
          anchorWorldExpected,
          leafMeshWorld,
          deltaMm,
        });
      }
    }

    return { lushWorld, seed, leafAnchorCount: leafAnchors.length, leafAnchors };
  });

  // eslint-disable-next-line no-console
  console.log('\n========== ITER27 — LEAF ANCHOR COORDINATES ==========');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log('====================================================\n');
  expect(report).not.toBeNull();
});
