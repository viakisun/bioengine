// Iter 27 Phase A — 모든 anchor의 ring world ↔ 매칭 mesh world 일대일 비교.
//
// 사용자 통찰: "mesh는 잘 붙어있는데 anchor 좌표 표시가 잘못". 사진의
// attachment line은 현상. 원인 = anchor visualization 좌표가 mesh와 다른
// frame으로 그려짐. 추측: z값이 잘못 반영.
//
// 측정 데이터로 어느 anchor / 어느 축 / 얼마나 어긋났는지 식별.

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

test('ITER27-A1: 모든 anchor의 ring↔mesh delta dump (per anchor, per axis)', async ({ page }) => {
  test.setTimeout(180_000);
  await enter(page, 90);

  const report = await page.evaluate(() => {
    const w = window as unknown as {
      __skinplantGraph?: {
        nodes: Map<string, { id: string; type?: string; pos: { x: number; y: number; z: number } }>;
        edges: Map<string, {
          id: string;
          organAnchors?: Array<{
            id: string;
            kind: string;
            anchorNodeId: string;
            chain?: { rootNodeId: string };
          }>;
        }>;
      };
      __debugScene?: {
        meshes?: Array<{
          name: string;
          isEnabled(): boolean;
          absolutePosition: { x: number; y: number; z: number };
        }>;
        transformNodes?: Array<{
          name: string;
          absolutePosition: { x: number; y: number; z: number };
          getWorldMatrix(): { m: { [k: number]: number } };
        }>;
      };
    };

    // SemanticOverlay 강제 켜기.
    const w2 = w as unknown as { __semanticOverlay?: { setVisible(v: boolean): void } };
    w2.__semanticOverlay?.setVisible(true);

    if (!w.__skinplantGraph || !w.__debugScene) return null;
    const ms = w.__debugScene.meshes ?? [];
    const tns = w.__debugScene.transformNodes ?? [];

    // ── 0) lushGroup vs SemanticOverlay root frame 비교.
    const lush = tns.find((t) => t.name.startsWith('skinplant_lush_'));
    const semRoot = tns.find((t) => t.name === 'semantic_overlay_root');
    const frameCompare = (lush && semRoot)
      ? {
        lushWorld: { x: lush.absolutePosition.x, y: lush.absolutePosition.y, z: lush.absolutePosition.z },
        semWorld: { x: semRoot.absolutePosition.x, y: semRoot.absolutePosition.y, z: semRoot.absolutePosition.z },
        deltaMm: Math.sqrt(
          Math.pow(lush.absolutePosition.x - semRoot.absolutePosition.x, 2)
          + Math.pow(lush.absolutePosition.y - semRoot.absolutePosition.y, 2)
          + Math.pow(lush.absolutePosition.z - semRoot.absolutePosition.z, 2),
        ) * 1000,
        // worldMatrix 16개 element 비교.
        lushMatrix: Array.from({ length: 16 }, (_, i) => lush.getWorldMatrix().m[i]),
        semMatrix: Array.from({ length: 16 }, (_, i) => semRoot.getWorldMatrix().m[i]),
      }
      : null;

    // ── 1) seed 추출 (mesh 이름에서).
    const sampleLeaf = ms.find((m) => m.name.startsWith('skinplant_leaf_'));
    const seedMatch = sampleLeaf?.name.match(/^skinplant_leaf_(\d+)_/);
    const seed = seedMatch ? seedMatch[1] : null;

    // ── 2) anchor와 mesh 매칭.
    interface Delta {
      anchorId: string;
      kind: string;
      anchorNodeId: string;
      ringName: string;
      meshName: string;
      ringWorld: { x: number; y: number; z: number };
      meshWorld: { x: number; y: number; z: number };
      dx: number; dy: number; dz: number;
      distMm: number;
    }
    const matched: Delta[] = [];
    const unmatched: { anchorId: string; reason: string }[] = [];

    // ring index 순서대로 SemanticOverlay 만들었으므로 graph anchor 순회 순서가 동일.
    // 그러나 보다 robust 하게 anchor id로 매칭.
    let ringIndex = 0;
    for (const edge of w.__skinplantGraph.edges.values()) {
      if (!edge.organAnchors) continue;
      for (const anchor of edge.organAnchors) {
        const ringName = `semantic_anchor_${ringIndex}`;
        const ring = ms.find((m) => m.name === ringName);
        ringIndex++;
        if (!ring) {
          unmatched.push({ anchorId: anchor.id, reason: 'ring not found' });
          continue;
        }
        // 매칭 mesh 찾기.
        let meshName = '';
        if (anchor.kind === 'leaf_blade') {
          // leaf_blade:axis{A}:n{N} → skinplant_leaf_{seed}_a{A}_n{N}
          const m = anchor.id.match(/^leaf_blade:axis(\d+):n(\d+)$/);
          if (m && seed) meshName = `skinplant_leaf_${seed}_a${m[1]}_n${m[2]}`;
        } else if (anchor.kind === 'fruit' || anchor.kind === 'flower' || anchor.kind === 'calyx') {
          // {kind}:axis{A}:t{T}:s{S} — truss 본체는 skinplant_truss_{seed}_a{A}_n{...}
          // child는 _body / _calyx / _flower 접미사. 매칭 어려움. 진단 위해 truss 본체로.
          // 대신 graph의 anchorNode (pedicel_tip)을 사용해 expected world 계산.
          meshName = '__use_anchor_node__';
        }

        const ringWorld = { x: ring.absolutePosition.x, y: ring.absolutePosition.y, z: ring.absolutePosition.z };

        let meshWorld: { x: number; y: number; z: number } | null = null;
        if (meshName === '__use_anchor_node__') {
          // truss organ은 mesh 매칭 복잡 → anchorNode 의도 위치 계산.
          // expected = lushGroup.world + anchorNode.pos
          const node = w.__skinplantGraph.nodes.get(anchor.anchorNodeId);
          if (node && lush) {
            meshWorld = {
              x: lush.absolutePosition.x + node.pos.x,
              y: lush.absolutePosition.y + node.pos.y,
              z: lush.absolutePosition.z + node.pos.z,
            };
          }
        } else if (meshName) {
          const mm = ms.find((m) => m.name === meshName);
          if (mm) meshWorld = { x: mm.absolutePosition.x, y: mm.absolutePosition.y, z: mm.absolutePosition.z };
        }
        if (!meshWorld) {
          unmatched.push({ anchorId: anchor.id, reason: `mesh '${meshName}' not found` });
          continue;
        }

        const dx = ringWorld.x - meshWorld.x;
        const dy = ringWorld.y - meshWorld.y;
        const dz = ringWorld.z - meshWorld.z;
        const distMm = Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000;
        matched.push({
          anchorId: anchor.id,
          kind: anchor.kind,
          anchorNodeId: anchor.anchorNodeId,
          ringName,
          meshName: meshName === '__use_anchor_node__' ? `<expected:anchorNode>` : meshName,
          ringWorld,
          meshWorld,
          dx, dy, dz,
          distMm,
        });
      }
    }

    // ── 3) 축별 통계.
    const stats = (vals: number[]) => {
      if (vals.length === 0) return null;
      const sorted = [...vals].sort((a, b) => a - b);
      return {
        min: sorted[0] * 1000,
        max: sorted[sorted.length - 1] * 1000,
        mean: (vals.reduce((s, x) => s + x, 0) / vals.length) * 1000,
        absMean: (vals.reduce((s, x) => s + Math.abs(x), 0) / vals.length) * 1000,
      };
    };
    const dxs = matched.map((d) => d.dx);
    const dys = matched.map((d) => d.dy);
    const dzs = matched.map((d) => d.dz);

    // ── 4) Top 5 worst by each axis + by total.
    const top5 = (sortKey: (d: Delta) => number) =>
      [...matched].sort((a, b) => sortKey(b) - sortKey(a)).slice(0, 5).map((d) => ({
        id: d.anchorId,
        kind: d.kind,
        ringWorld: d.ringWorld,
        meshWorld: d.meshWorld,
        dx: d.dx * 1000, dy: d.dy * 1000, dz: d.dz * 1000,
        distMm: d.distMm,
      }));

    // ── 5) kind별 통계.
    const byKind: Record<string, { count: number; absMeanDxMm: number; absMeanDyMm: number; absMeanDzMm: number; maxDistMm: number }> = {};
    for (const d of matched) {
      const k = byKind[d.kind] ?? { count: 0, absMeanDxMm: 0, absMeanDyMm: 0, absMeanDzMm: 0, maxDistMm: 0 };
      k.count++;
      k.absMeanDxMm += Math.abs(d.dx) * 1000;
      k.absMeanDyMm += Math.abs(d.dy) * 1000;
      k.absMeanDzMm += Math.abs(d.dz) * 1000;
      if (d.distMm > k.maxDistMm) k.maxDistMm = d.distMm;
      byKind[d.kind] = k;
    }
    for (const k of Object.keys(byKind)) {
      byKind[k].absMeanDxMm /= byKind[k].count;
      byKind[k].absMeanDyMm /= byKind[k].count;
      byKind[k].absMeanDzMm /= byKind[k].count;
    }

    return {
      frameCompare,
      seed,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      unmatched: unmatched.slice(0, 5),
      dxStatsMm: stats(dxs),
      dyStatsMm: stats(dys),
      dzStatsMm: stats(dzs),
      worstByDx: top5((d) => Math.abs(d.dx)),
      worstByDy: top5((d) => Math.abs(d.dy)),
      worstByDz: top5((d) => Math.abs(d.dz)),
      worstByDist: top5((d) => d.distMm),
      byKind,
    };
  });

  // eslint-disable-next-line no-console
  console.log('\n========== ITER27 PHASE A — ANCHOR POSITION AUDIT ==========');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log('==========================================================\n');

  expect(report, 'report available').not.toBeNull();
  expect(report!.matchedCount, 'matched anchors > 0').toBeGreaterThan(0);
});
