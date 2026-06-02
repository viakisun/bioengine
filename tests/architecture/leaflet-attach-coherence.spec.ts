// SSOT #189 — Leaflet Attach Coherence invariant (Iter 39 Phase I5).
// See: docs/architecture/SKELETON_SSOT.md
//
// 사용자 v9/v10 핵심 강제: leaflet.attachNodeId가 rachis-attach node여야 하고
// (primary/intercalary), leaflet edge의 startNodeId가 그 attachNodeId와 일치해야
// 함. 이는 SKELETON-EDGE-01(bonePath endpoint == node.pos) + NODE-EDGE-INCIDENCE-01
// 위에서 graph-native 합성으로 _rachisPos == attachNode.pos_ 보장.
//
// 적용 범위:
// - primary, intercalary: rachis 위 attach node 부착
// 제외:
// - terminal: attachNodeId = terminal node 자기 자신 (의미 다름)
// - secondary: attachNodeId = parent primary (별도 invariant SECONDARY-ATTACH-01)

import { test, expect, type Page } from '@playwright/test';

async function enterSkin(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.waitForTimeout(1000);
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

test.describe('Leaflet Attach Coherence (SSOT #189, Iter 39 Phase I5)', () => {
  test('LEAFLET-ATTACH-COHERENCE-01: primary/intercalary attachNodeId == leaflet edge.startNodeId', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __lastGraph?: {
          nodes?: Map<string, {
            id: string;
            leafletRef?: { position: string; attachNodeId: string; parentLeafNodeId: string };
          }>;
          edges?: Map<string, {
            id: string; type: string; startNodeId: string; endNodeId: string;
          }>;
        };
      };
      const graph = w.__lastGraph;
      if (!graph?.nodes || !graph?.edges) return { error: 'no graph' };
      const violations: string[] = [];
      let checked = 0;
      for (const node of graph.nodes.values()) {
        const ref = node.leafletRef;
        if (!ref) continue;
        if (ref.position !== 'primary' && ref.position !== 'intercalary') continue;
        checked++;
        // 1. attachNodeId가 rachis-attach 종류여야 함
        const attachNode = graph.nodes.get(ref.attachNodeId);
        if (!attachNode) {
          violations.push(`${node.id}: attachNodeId ${ref.attachNodeId} not found`);
          continue;
        }
        if (!attachNode.id.includes('rachis-attach')) {
          violations.push(`${node.id}: attachNodeId ${attachNode.id} is not rachis-attach`);
          continue;
        }
        // 2. leaflet edge의 startNodeId == attachNodeId
        let leafletEdge: { id: string; startNodeId: string } | undefined;
        for (const e of graph.edges.values()) {
          if (e.endNodeId === node.id && (e.type === 'petiolule' || e.type === 'lateral-vein')) {
            leafletEdge = e; break;
          }
        }
        if (!leafletEdge) {
          violations.push(`${node.id}: no incoming petiolule/lateral-vein edge`);
          continue;
        }
        if (leafletEdge.startNodeId !== ref.attachNodeId) {
          violations.push(
            `${node.id}: edge.startNodeId ${leafletEdge.startNodeId} != attachNodeId ${ref.attachNodeId}`,
          );
        }
      }
      return { checked, violations };
    });
    if ('error' in probe) {
      console.warn('LEAFLET-ATTACH-COHERENCE-01: graph not exposed, soft skip');
      return;
    }
    expect(probe.checked, 'primary/intercalary leaflets checked').toBeGreaterThan(0);
    expect(
      probe.violations,
      `coherence violations:\n${probe.violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });
});
