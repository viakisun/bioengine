// Iter 27 Phase A-2 — SemanticOverlay 모든 line mesh의 bbox length + 색 식별.
//
// 사용자 사진의 비정상 라인이 정확히 어떤 PR 4-2 component인지 코드 데이터로
// 매핑. SemanticOverlay에서 그리는 것:
//   - semantic_edge_*  (solid, edge.renderPolicy.visualHint.color)
//   - semantic_attach_* (dashed, anchor visualHint.markerColor)

import { test, expect, type Page } from '@playwright/test';

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

test('ITER27-A2: SemanticOverlay 모든 line mesh의 bbox length + 가장 긴 것 식별', async ({ page }) => {
  test.setTimeout(180_000);
  await enter(page, 90);

  const report = await page.evaluate(() => {
    const w = window as unknown as {
      __skinplantGraph?: {
        edges: Map<string, {
          id: string; type: string;
          renderPolicy?: { visualHint?: { color: string } };
          organAnchors?: Array<{ id: string; kind: string; visualHint?: { markerColor: string } }>;
        }>;
      };
      __debugScene?: {
        meshes?: Array<{
          name: string;
          isEnabled(): boolean;
          getBoundingInfo(): {
            boundingBox: {
              minimumWorld: { x: number; y: number; z: number };
              maximumWorld: { x: number; y: number; z: number };
            };
          };
        }>;
      };
    };

    // SemanticOverlay 강제 켜기.
    const w2 = w as unknown as { __semanticOverlay?: { setVisible(v: boolean): void } };
    w2.__semanticOverlay?.setVisible(true);

    if (!w.__debugScene) return null;
    const ms = w.__debugScene.meshes ?? [];

    interface LineEntry {
      name: string;
      idx: number;
      kind: 'edge' | 'attach';
      enabled: boolean;
      spanM: number;
      bboxMin: { x: number; y: number; z: number };
      bboxMax: { x: number; y: number; z: number };
    }
    const all: LineEntry[] = [];
    for (const m of ms) {
      const isEdge = m.name.startsWith('semantic_edge_');
      const isAttach = m.name.startsWith('semantic_attach_');
      if (!isEdge && !isAttach) continue;
      const idxMatch = m.name.match(/_(\d+)$/);
      const idx = idxMatch ? Number(idxMatch[1]) : -1;
      const bb = m.getBoundingInfo().boundingBox;
      const dx = bb.maximumWorld.x - bb.minimumWorld.x;
      const dy = bb.maximumWorld.y - bb.minimumWorld.y;
      const dz = bb.maximumWorld.z - bb.minimumWorld.z;
      const span = Math.sqrt(dx * dx + dy * dy + dz * dz);
      all.push({
        name: m.name,
        idx,
        kind: isEdge ? 'edge' : 'attach',
        enabled: m.isEnabled(),
        spanM: span,
        bboxMin: { x: bb.minimumWorld.x, y: bb.minimumWorld.y, z: bb.minimumWorld.z },
        bboxMax: { x: bb.maximumWorld.x, y: bb.maximumWorld.y, z: bb.maximumWorld.z },
      });
    }

    // edge index → edge entry 매핑 (graph.edges 순회 순서로 ai 증가).
    const edgeOrderInfo: { idx: number; edgeId: string; edgeType: string; color?: string }[] = [];
    if (w.__skinplantGraph) {
      let ei = 0;
      for (const e of w.__skinplantGraph.edges.values()) {
        const color = e.renderPolicy?.visualHint?.color;
        if (!color || !e.id) {
          ei++;
          continue;
        }
        edgeOrderInfo.push({ idx: ei, edgeId: e.id, edgeType: e.type, color });
        ei++;
      }
    }

    // attach index → anchor 매핑.
    const attachOrderInfo: { idx: number; anchorId: string; kind: string; color?: string }[] = [];
    if (w.__skinplantGraph) {
      let ai = 0;
      for (const e of w.__skinplantGraph.edges.values()) {
        if (!e.organAnchors) continue;
        for (const a of e.organAnchors) {
          if (!a.visualHint) {
            ai++;
            continue;
          }
          attachOrderInfo.push({ idx: ai, anchorId: a.id, kind: a.kind, color: a.visualHint.markerColor });
          ai++;
        }
      }
    }

    // 가장 긴 top 10.
    all.sort((a, b) => b.spanM - a.spanM);
    const top10 = all.slice(0, 10).map((l) => {
      const meta = l.kind === 'edge'
        ? edgeOrderInfo.find((x) => x.idx === l.idx)
        : attachOrderInfo.find((x) => x.idx === l.idx);
      return {
        name: l.name,
        kind: l.kind,
        enabled: l.enabled,
        spanCm: l.spanM * 100,
        bboxMin: l.bboxMin,
        bboxMax: l.bboxMax,
        meta,
      };
    });

    // kind별 통계.
    const edges = all.filter((l) => l.kind === 'edge');
    const attachs = all.filter((l) => l.kind === 'attach');
    const stats = (arr: LineEntry[]) => arr.length === 0 ? null : {
      count: arr.length,
      enabledCount: arr.filter((l) => l.enabled).length,
      minCm: arr.reduce((m, l) => Math.min(m, l.spanM), Infinity) * 100,
      maxCm: arr.reduce((m, l) => Math.max(m, l.spanM), 0) * 100,
      meanCm: (arr.reduce((s, l) => s + l.spanM, 0) / arr.length) * 100,
    };

    return {
      edgeStats: stats(edges),
      attachStats: stats(attachs),
      top10,
    };
  });

  // eslint-disable-next-line no-console
  console.log('\n========== ITER27 A-2 — LINE SOURCE AUDIT ==========');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log('==================================================\n');

  expect(report, 'report').not.toBeNull();
});
