// SSOT #198 — Leaf Tube Audit (Iter 39 Phase K0-1).
// See: docs/architecture/SKELETON_SSOT.md, docs/architecture/LEAF_TUBE_RENDERING.md
//
// 사용자 K0 v23 #3: primary leaflet count ↔ lateral-vein edge count 대응 강제.
//
// LEAF-TUBE-AUDIT-01 — _graph-existence_ + _count correspondence_:
//   (a) 5 leaf-tube edge types 모두 graph 존재 (N > 0; sub-vein 제외):
//       petiole / leaf-rachis / lateral-vein / petiolule
//   (b) 잎별 leaflet count vs edge count 대응:
//       leaflet.primary      ↔ 'lateral-vein' edge count
//       leaflet.intercalary  ↔ 'petiolule'    edge count
//       leaflet.secondary    ↔ 'sub-vein'     edge count (현재 둘 다 0)
//
// 목적: renderPolicy.skinVisibleFraction _이외의_ 누락 catch (graph build
// 단계에서 edge 자체가 빠지면 visibility 조정으로 못 살림).

import { test, expect, type Page } from '@playwright/test';

const LEAF_TUBE_EDGE_TYPES = ['petiole', 'leaf-rachis', 'lateral-vein', 'petiolule', 'sub-vein'] as const;
type LeafTubeEdgeType = typeof LEAF_TUBE_EDGE_TYPES[number];

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

test.describe('Leaf Tube Audit (SSOT #198, Iter 39 Phase K0-1)', () => {
  test('LEAF-TUBE-AUDIT-01: 5 edge types graph 존재 + leaflet/edge count 대응', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await page.evaluate((LEAF_TUBE_EDGE_TYPES) => {
      const w = window as unknown as {
        __lastGraph?: {
          edges?: Map<string, { id: string; type: string }>;
          nodes?: Map<string, {
            id: string;
            leafletRef?: { position: string };
          }>;
        };
      };
      const graph = w.__lastGraph;
      if (!graph?.edges || !graph?.nodes) {
        return { violations: ['no graph'], typeCounts: null, mismatches: [] };
      }

      // (a) Type-level count.
      const typeCounts: Record<string, number> = {};
      for (const t of LEAF_TUBE_EDGE_TYPES) typeCounts[t] = 0;
      for (const edge of graph.edges.values()) {
        if (LEAF_TUBE_EDGE_TYPES.includes(edge.type as never)) typeCounts[edge.type]++;
      }

      // (b) Per-leaf edge count.
      const edgesByLeaf = new Map<string, Record<string, number>>();
      for (const edge of graph.edges.values()) {
        if (!LEAF_TUBE_EDGE_TYPES.includes(edge.type as never)) continue;
        const tag = edge.id.match(/axis\d+:n\d+/)?.[0];
        if (!tag) continue;
        if (!edgesByLeaf.has(tag)) {
          const init: Record<string, number> = {};
          for (const t of LEAF_TUBE_EDGE_TYPES) init[t] = 0;
          edgesByLeaf.set(tag, init);
        }
        edgesByLeaf.get(tag)![edge.type]++;
      }

      // (b) Per-leaf leaflet count by position.
      const leafletsByLeaf = new Map<string, Record<string, number>>();
      for (const node of graph.nodes.values()) {
        const ref = node.leafletRef;
        if (!ref) continue;
        const tag = node.id.match(/axis\d+:n\d+/)?.[0];
        if (!tag) continue;
        if (!leafletsByLeaf.has(tag)) {
          leafletsByLeaf.set(tag, { primary: 0, intercalary: 0, terminal: 0, secondary: 0 });
        }
        const counts = leafletsByLeaf.get(tag)!;
        if (ref.position in counts) counts[ref.position]++;
      }

      // Correspondence check (per leaf).
      const mismatches: string[] = [];
      for (const [tag, leaflets] of leafletsByLeaf) {
        const edges = edgesByLeaf.get(tag) ?? { 'lateral-vein': 0, petiolule: 0, 'sub-vein': 0 };
        if (leaflets.primary !== edges['lateral-vein']) {
          mismatches.push(`${tag}: primary=${leaflets.primary} != lateral-vein=${edges['lateral-vein']}`);
        }
        if (leaflets.intercalary !== edges.petiolule) {
          mismatches.push(`${tag}: intercalary=${leaflets.intercalary} != petiolule=${edges.petiolule}`);
        }
        if (leaflets.secondary !== edges['sub-vein']) {
          mismatches.push(`${tag}: secondary=${leaflets.secondary} != sub-vein=${edges['sub-vein']}`);
        }
      }

      // Existence check (a).
      const violations: string[] = [];
      // sub-vein은 현재 secondary disabled → 0이 정상. 검증 제외.
      for (const t of ['petiole', 'leaf-rachis', 'lateral-vein', 'petiolule']) {
        if (typeCounts[t] === 0) violations.push(`${t} edges N=0 (graph build 누락)`);
      }

      return { violations, typeCounts, mismatches };
    }, LEAF_TUBE_EDGE_TYPES as unknown as string[]);

    // 진단 출력 (reporting-first 원칙 #32).
    // eslint-disable-next-line no-console
    console.log('LEAF-TUBE-AUDIT-01 typeCounts:', JSON.stringify(probe.typeCounts));
    if (probe.mismatches.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`LEAF-TUBE-AUDIT-01 mismatches (${probe.mismatches.length}):\n  ${probe.mismatches.slice(0, 20).join('\n  ')}`);
    }

    expect(
      probe.violations,
      `LEAF-TUBE-AUDIT-01 existence violations:\n${probe.violations.join('\n')}`,
    ).toEqual([]);
    expect(
      probe.mismatches,
      `LEAF-TUBE-AUDIT-01 leaflet/edge count mismatches:\n${probe.mismatches.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });
});
