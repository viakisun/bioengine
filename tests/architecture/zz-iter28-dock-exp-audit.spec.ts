// Iter 28 Phase A-0 — dock_exp 위치 audit.
//
// 사용자 진단: "dock_exp의 위치가 지금 바닥이고 그래서 거기로 연결되는거 같은데."
// dock_exp_pos = edge.bonePath[0].p0 = leaf.attachPosition.
//
// 측정:
//   1. 각 petiole edge의 bonePath[0].p0 (= dock_exp source) 좌표
//   2. 같은 leaf의 attach stem node (startNode) 좌표
//   3. 둘 거리 → stem radius 정도면 정상, 매우 멀면 PlantBase 버그
//   4. y 값이 바닥 (y < 0.05m) 인 것 식별

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

test('ITER28-A0: dock_exp source (bonePath[0].p0) 좌표 dump', async ({ page }) => {
  test.setTimeout(180_000);
  await enter(page, 90);

  const report = await page.evaluate(() => {
    const w = window as unknown as {
      __skinplantGraph?: {
        nodes: Map<string, { id: string; pos: { x: number; y: number; z: number }; radius?: number }>;
        edges: Map<string, {
          id: string;
          type: string;
          startNodeId: string;
          endNodeId: string;
          bonePath: Array<{ p0: { x: number; y: number; z: number }; p1: { x: number; y: number; z: number }; r0?: number; r1?: number }>;
        }>;
      };
    };
    if (!w.__skinplantGraph) return null;

    const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

    // 모든 petiole edge에 대해
    const rows: Array<{
      edgeId: string;
      startNodeId: string;
      endNodeId: string;
      stemCenter: { x: number; y: number; z: number };
      stemRadiusMm: number;
      bonePath0_p0: { x: number; y: number; z: number };
      bonePathLast_p1: { x: number; y: number; z: number };
      petioleLengthMm: number;
      attachNode_vs_bonePath0_mm: number;
      petioleTipNode_vs_bonePathLast_mm: number;
      is_bonePath0_BOTTOM: boolean;
      is_bonePathLast_BOTTOM: boolean;
    }> = [];

    for (const edge of w.__skinplantGraph.edges.values()) {
      if (edge.type !== 'petiole') continue;
      const startNode = w.__skinplantGraph.nodes.get(edge.startNodeId);
      const endNode = w.__skinplantGraph.nodes.get(edge.endNodeId);
      if (!startNode || !endNode || edge.bonePath.length === 0) continue;
      const bp0 = edge.bonePath[0].p0;
      const bpLast = edge.bonePath[edge.bonePath.length - 1].p1;
      rows.push({
        edgeId: edge.id,
        startNodeId: edge.startNodeId,
        endNodeId: edge.endNodeId,
        stemCenter: { x: startNode.pos.x, y: startNode.pos.y, z: startNode.pos.z },
        stemRadiusMm: (startNode.radius ?? 0) * 1000,
        bonePath0_p0: bp0,
        bonePathLast_p1: bpLast,
        petioleLengthMm: dist(bp0, bpLast) * 1000,
        attachNode_vs_bonePath0_mm: dist(startNode.pos, bp0) * 1000,
        petioleTipNode_vs_bonePathLast_mm: dist(endNode.pos, bpLast) * 1000,
        is_bonePath0_BOTTOM: bp0.y < 0.05,
        is_bonePathLast_BOTTOM: bpLast.y < 0.05,
      });
    }

    // 통계
    const stemYs = rows.map((r) => r.stemCenter.y);
    const bonePath0Ys = rows.map((r) => r.bonePath0_p0.y);
    const attachDeltas = rows.map((r) => r.attachNode_vs_bonePath0_mm);

    return {
      petioleCount: rows.length,
      stemY_range: { min: Math.min(...stemYs), max: Math.max(...stemYs) },
      bonePath0_y_range: { min: Math.min(...bonePath0Ys), max: Math.max(...bonePath0Ys) },
      attachNode_vs_bonePath0_mm: {
        min: Math.min(...attachDeltas),
        max: Math.max(...attachDeltas),
        mean: attachDeltas.reduce((s, x) => s + x, 0) / attachDeltas.length,
      },
      bottomY_rows: rows.filter((r) => r.is_bonePath0_BOTTOM),
      worstByAttachDelta: rows.sort((a, b) => b.attachNode_vs_bonePath0_mm - a.attachNode_vs_bonePath0_mm).slice(0, 5),
      first3: rows.slice(0, 3),
    };
  });

  // eslint-disable-next-line no-console
  console.log('\n========== ITER28 A-0 — dock_exp source audit ==========');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log('========================================================\n');
  expect(report).not.toBeNull();
});
