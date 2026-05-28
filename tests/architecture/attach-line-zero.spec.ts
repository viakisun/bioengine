// SSOT #187 Iter 27 — Attachment line alarm invariant.
//
// 사용자 의도: SemanticOverlay attachment line은 anchor.anchorNodeId (joint)
// ↔ anchor.chain.rootNodeId (= 지지 edge.startNodeId) 두 노드를 잇는다.
// 정상 plant에서 두 노드가 같은 그래프 노드를 가리키면 라인 두 vertex가
// 동일 위치 → 라인 길이 0 → 시각상 안 보임.
//
// 회귀 발생 시 (anchor 매핑 잘못 / 좌표계 frame mismatch / GreasedLine
// vertex transform 누락) → 라인 > 0 → 시각 alarm + 본 spec FAIL → 즉시 catch.

import { test, expect, type Page } from '@playwright/test';

async function enterSkin(page: Page, day: number) {
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

test.describe('Attachment Line Zero-Length Alarm (SSOT #187 Iter 27)', () => {
  test('ATTACH-LINE-01: anchor.anchorNodeId == chain.rootNodeId (graph identity)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          edges: Map<string, {
            organAnchors?: Array<{
              id: string;
              anchorNodeId: string;
              chain?: { rootNodeId: string };
            }>;
          }>;
        };
      };
      if (!w.__skinplantGraph) return null;
      const mismatches: { id: string; anchorNodeId: string; rootNodeId: string }[] = [];
      let total = 0;
      for (const edge of w.__skinplantGraph.edges.values()) {
        if (!edge.organAnchors) continue;
        for (const a of edge.organAnchors) {
          if (!a.chain) continue;
          total++;
          if (a.anchorNodeId !== a.chain.rootNodeId) {
            mismatches.push({
              id: a.id,
              anchorNodeId: a.anchorNodeId,
              rootNodeId: a.chain.rootNodeId,
            });
          }
        }
      }
      return { total, mismatches };
    });
    expect(result, 'graph available').not.toBeNull();
    expect(result!.total, 'organ anchors > 0').toBeGreaterThan(0);
    expect(
      result!.mismatches,
      `anchor.anchorNodeId === chain.rootNodeId 위반 (정상=joint identity).\n` +
        `이 위반이 있으면 SemanticOverlay attachment line이 길이 > 0이 됨 = 회귀 alarm.\n` +
        result!.mismatches.slice(0, 5).map((m) => `  - ${m.id}: anchor=${m.anchorNodeId} root=${m.rootNodeId}`).join('\n'),
    ).toEqual([]);
  });

  test('ATTACH-LINE-02: 모든 semantic_attach line bbox length ≤ 1mm', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    // SemanticOverlay 토글 — mesh 생성 보장.
    await page.evaluate(() => {
      const w = window as unknown as { __semanticOverlay?: { setVisible(v: boolean): void } };
      w.__semanticOverlay?.setVisible(true);
    });
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __debugScene?: {
          meshes?: Array<{
            name: string;
            getBoundingInfo(): {
              boundingBox: {
                minimumWorld: { x: number; y: number; z: number };
                maximumWorld: { x: number; y: number; z: number };
              };
            };
          }>;
        };
      };
      const ms = w.__debugScene?.meshes ?? [];
      const lines = ms.filter((m) => m.name.startsWith('semantic_attach_'));
      const lengths: { name: string; spanMm: number }[] = [];
      for (const m of lines) {
        const bb = m.getBoundingInfo().boundingBox;
        const dx = bb.maximumWorld.x - bb.minimumWorld.x;
        const dy = bb.maximumWorld.y - bb.minimumWorld.y;
        const dz = bb.maximumWorld.z - bb.minimumWorld.z;
        const spanMm = Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000;
        lengths.push({ name: m.name, spanMm });
      }
      lengths.sort((a, b) => b.spanMm - a.spanMm);
      return {
        total: lengths.length,
        maxMm: lengths[0]?.spanMm ?? 0,
        worst5: lengths.slice(0, 5),
      };
    });
    expect(result.total, 'attachment line count > 0').toBeGreaterThan(0);
    expect(
      result.maxMm,
      `attachment line bbox length max = ${result.maxMm.toFixed(3)}mm. 정상 plant에서 ≤ 1mm 기대 (anchorNodeId == rootNodeId → vertex 두 점 동일 → 라인 0). 회귀 시 라인 > 0 = alarm.\nworst 5:\n` +
        result.worst5.map((l) => `  - ${l.name}: ${l.spanMm.toFixed(3)}mm`).join('\n'),
    ).toBeLessThanOrEqual(1);
  });
});
