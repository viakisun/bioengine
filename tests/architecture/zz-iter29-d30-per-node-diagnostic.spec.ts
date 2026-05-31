// Iter 29 사후 진단 — D=30 per-node phytomer + skin mesh 상태 dump.
//
// 동기: 사용자가 D=30 사진에서 "줄기는 막대기, 잎은 1군집만, 측지 비대"를
// 지적. zz-iter29-leaf-audit는 aggregate (leaves count, mean bbox)만 측정해서
// per-node 분포 회귀를 _catch 못 함_.
//
// PlantState는 window에 직접 노출되지 않음. 그러나 Phase 3 SKELETON-PHYTOMER-01
// 으로 SkeletonNode.phytomer = engine NodeState reference가 bound됨.
// __skinplantGraph.nodes 를 순회해서 phytomer를 가진 노드를 dump.

import { test, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
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

test.describe('Iter 29 D=15/30/45 per-node diagnostic (post-Quality-Gate-D visual audit)', () => {
  for (const day of [15, 30, 45]) {
    test(`ITER29-DIAG-D${day}: per-node phytomer + skin mesh dump`, async ({ page }) => {
      test.setTimeout(180_000);
      await enter(page, day);
      const report = await page.evaluate(() => {
        type Phytomer = {
          index: number;
          status: string;
          initiationTT: number;
          ageTT: number;
          internode: { targetLengthCm: number; currentLengthCm: number; expansionProgress: number };
          leaf: {
            initiationTT: number;
            ageTT: number;
            targetAreaCm2: number;
            currentAreaCm2: number;
            expansionProgress: number;
            leafletCount: number;
            stage: string;
            posture: { finalDroopDeg?: number; curl: number };  // ★ Iter 34 C3
            senescence: { progress: number; colorDullness: number; visibleAreaFactor: number };
          };
        };
        const w = window as unknown as {
          __skinplantGraph?: {
            nodes: Map<string, { id: string; type?: string; pos: { x: number; y: number; z: number }; phytomer?: Phytomer }>;
            edges: Map<string, { id: string; organAnchors?: Array<{ id: string; kind: string; meshAnchorNodeId?: string; anchorNodeId: string }> }>;
          };
          __debugScene?: { meshes?: Array<{ name: string; isEnabled(): boolean; getBoundingInfo(): { boundingBox: { minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } } }> };
        };
        const g = w.__skinplantGraph;
        if (!g) return { error: 'no __skinplantGraph' };

        // Collect phytomer-bound nodes
        const bound: Phytomer[] = [];
        for (const node of g.nodes.values()) {
          if (node.phytomer) bound.push(node.phytomer);
        }
        bound.sort((a, b) => a.index - b.index);

        // Count leaf anchors per axis-node pair
        let leafAnchorCount = 0;
        for (const edge of g.edges.values()) {
          if (!edge.organAnchors) continue;
          for (const a of edge.organAnchors) {
            if (a.kind === 'leaf_blade') leafAnchorCount++;
          }
        }

        // Skin meshes
        const meshes = w.__debugScene?.meshes ?? [];
        const leafMeshes = meshes.filter((m) => m.name.startsWith('skinplant_leaf_') && m.isEnabled()).map((m) => {
          const bb = m.getBoundingInfo().boundingBox;
          const dx = bb.maximumWorld.x - bb.minimumWorld.x;
          const dy = bb.maximumWorld.y - bb.minimumWorld.y;
          const dz = bb.maximumWorld.z - bb.minimumWorld.z;
          return {
            name: m.name,
            bboxCm: Number((Math.hypot(dx, dy, dz) * 100).toFixed(1)),
            centerY: Number((((bb.maximumWorld.y + bb.minimumWorld.y) / 2)).toFixed(3)),
          };
        });
        const cotMeshes = meshes.filter((m) => m.name.startsWith('skinplant_cot_') && m.isEnabled()).map((m) => {
          const bb = m.getBoundingInfo().boundingBox;
          return Number((Math.hypot(
            bb.maximumWorld.x - bb.minimumWorld.x,
            bb.maximumWorld.y - bb.minimumWorld.y,
            bb.maximumWorld.z - bb.minimumWorld.z,
          ) * 100).toFixed(1));
        });
        const stemMesh = meshes.find((m) => m.name.includes('skinplant_unifiedStem') || m.name.includes('skinplant_stem'));
        const stemMeshBboxY = stemMesh ? (() => {
          const bb = stemMesh.getBoundingInfo().boundingBox;
          return Number((bb.maximumWorld.y - bb.minimumWorld.y).toFixed(3));
        })() : null;

        const stemNodeYs = [...g.nodes.values()].filter((n) => n.type === 'main-stem-node').map((n) => n.pos.y);
        const stemHeightCm = stemNodeYs.length > 0 ? Number(((Math.max(...stemNodeYs) - Math.min(...stemNodeYs)) * 100).toFixed(1)) : 0;

        // Per-node dump
        const perNode = bound.map((p) => ({
          idx: p.index,
          status: p.status,
          ageTT: Number(p.ageTT.toFixed(0)),
          initTT: Number(p.initiationTT.toFixed(0)),
          intern_tgt: Number(p.internode.targetLengthCm.toFixed(2)),
          intern_cur: Number(p.internode.currentLengthCm.toFixed(2)),
          intern_p: Number(p.internode.expansionProgress.toFixed(2)),
          leaf_ageTT: Number(p.leaf.ageTT.toFixed(0)),
          leaf_tgt: Number(p.leaf.targetAreaCm2.toFixed(0)),
          leaf_cur: Number(p.leaf.currentAreaCm2.toFixed(0)),
          leaf_ratio: Number((p.leaf.currentAreaCm2 / Math.max(1, p.leaf.targetAreaCm2)).toFixed(2)),
          leaf_exp: Number(p.leaf.expansionProgress.toFixed(2)),
          leaflets: p.leaf.leafletCount,
          stage: p.leaf.stage,
          droop: Number((p.leaf.posture.finalDroopDeg ?? 0).toFixed(0)),
          senP: Number(p.leaf.senescence.progress.toFixed(2)),
          visArea: Number(p.leaf.senescence.visibleAreaFactor.toFixed(2)),
        }));

        return {
          stemHeightCm,
          stemMeshBboxYm: stemMeshBboxY,
          phytomerBoundCount: bound.length,
          leafAnchorCount,
          cotMeshes,
          leafMeshes,
          perNode,
        };
      });

      console.log(`========== ITER29 D=${day} DIAGNOSTIC ==========`);
      console.log(JSON.stringify(report, null, 2));
      console.log('=============================================');
    });
  }
});
