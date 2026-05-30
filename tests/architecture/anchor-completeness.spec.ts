// Iter 29 Phase 3 — PHYTOMER-COMP-01~04 invariants.
//
// Replaces the Iter 26 PR 2-2 ANCHOR-COMP-01~04 contract — `anchor.morphology`
// and `anchor.state` were removed from OrganAnchor schema as part of Phase 3
// SKELETON-ANCHOR-PURE-01. The growth-state checks are now done against
// SkeletonNode.phytomer (PhytomerNode reference) instead.
//
// Plan §3 (sleepy-growing-pretzel.md):
//   "이전 Iter 26 PR 1-2 AnchorMorphologyHint / OrganState 필드는 _phytomer로
//    이관_ + anchor는 _purity 회복_."
//
// Acceptance:
//   PHYTOMER-COMP-01: 모든 PhytomerNode에 leaf.ageTT/initiationTT 있음
//   PHYTOMER-COMP-02: 모든 PhytomerNode.leaf에 targetAreaCm2/currentAreaCm2 있음
//   PHYTOMER-COMP-03: PhytomerNode.status와 LeafOrganState.stage 독립 일관성 검증
//   PHYTOMER-COMP-04: anchor.position == PhytomerNode.leaf의 anchor 위치 (≤1mm)
//                     + graph.cultivarGenomeSnapshot present (Iter 26 PR 1-3 preserved)

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

test.describe('PhytomerNode Completeness (Iter 29 Phase 3, replaces ANCHOR-COMP)', () => {
  test('PHYTOMER-COMP-01: 모든 PhytomerNode에 leaf.ageTT/initiationTT 있음', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          nodes: Map<string, {
            id: string;
            phytomer?: {
              index: number;
              initiationTT: number;
              ageTT: number;
              leaf: { initiationTT: number; ageTT: number; visibleTT: number };
            };
          }>;
        };
      };
      const g = w.__skinplantGraph;
      if (!g) return null;
      let withPhytomer = 0;
      const issues: { id: string; reason: string }[] = [];
      for (const node of g.nodes.values()) {
        if (!node.phytomer) continue;
        withPhytomer++;
        const leaf = node.phytomer.leaf;
        if (typeof leaf?.initiationTT !== 'number' || !Number.isFinite(leaf.initiationTT)) {
          issues.push({ id: node.id, reason: 'leaf.initiationTT missing' });
        }
        if (typeof leaf?.ageTT !== 'number' || !Number.isFinite(leaf.ageTT)) {
          issues.push({ id: node.id, reason: 'leaf.ageTT missing' });
        }
        if (typeof leaf?.visibleTT !== 'number' || !Number.isFinite(leaf.visibleTT)) {
          issues.push({ id: node.id, reason: 'leaf.visibleTT missing' });
        }
      }
      return { withPhytomer, issues };
    });
    expect(report, 'graph available').not.toBeNull();
    expect(report!.withPhytomer, 'phytomer-bound nodes > 0').toBeGreaterThan(0);
    expect(report!.issues, 'all phytomer-bound nodes have leaf TT fields').toEqual([]);
  });

  test('PHYTOMER-COMP-02: 모든 PhytomerNode.leaf에 targetAreaCm2/currentAreaCm2', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          nodes: Map<string, {
            id: string;
            phytomer?: {
              leaf: {
                targetAreaCm2: number;
                currentAreaCm2: number;
                expansionProgress: number;
                leafletCount: number;
              };
            };
          }>;
        };
      };
      const g = w.__skinplantGraph;
      if (!g) return null;
      const samples: { id: string; target: number; current: number; progress: number; leaflets: number }[] = [];
      for (const node of g.nodes.values()) {
        if (!node.phytomer) continue;
        const leaf = node.phytomer.leaf;
        samples.push({
          id: node.id,
          target: leaf.targetAreaCm2,
          current: leaf.currentAreaCm2,
          progress: leaf.expansionProgress,
          leaflets: leaf.leafletCount,
        });
      }
      return samples;
    });
    expect(report, 'graph available').not.toBeNull();
    expect(report!.length, 'phytomer-bound nodes present').toBeGreaterThan(0);
    for (const s of report!) {
      expect(s.target, `${s.id} targetAreaCm2 > 0`).toBeGreaterThan(0);
      expect(s.current, `${s.id} currentAreaCm2 ≥ 0`).toBeGreaterThanOrEqual(0);
      expect(s.current, `${s.id} currentAreaCm2 ≤ targetAreaCm2`).toBeLessThanOrEqual(s.target + 1e-6);
      expect(s.progress, `${s.id} expansionProgress ∈ [0, 1]`).toBeGreaterThanOrEqual(0);
      expect(s.progress, `${s.id} expansionProgress ∈ [0, 1]`).toBeLessThanOrEqual(1);
      expect(s.leaflets, `${s.id} leafletCount > 0`).toBeGreaterThan(0);
    }
  });

  test('PHYTOMER-COMP-03: PhytomerNode.status와 LeafOrganState.stage 독립 일관성', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          nodes: Map<string, {
            id: string;
            phytomer?: { status: string; leaf: { stage: string; ageTT: number } };
          }>;
        };
      };
      const g = w.__skinplantGraph;
      if (!g) return null;
      const VALID_STATUS = ['primordium', 'visible', 'expanding', 'mature', 'senescent', 'removed'];
      const VALID_STAGES = ['primordium', 'simple_leaf', 'compound_developing', 'compound_mature', 'senescent', 'removed'];
      const issues: { id: string; reason: string }[] = [];
      let pairs = 0;
      for (const node of g.nodes.values()) {
        if (!node.phytomer) continue;
        pairs++;
        const { status } = node.phytomer;
        const { stage } = node.phytomer.leaf;
        if (!VALID_STATUS.includes(status)) issues.push({ id: node.id, reason: `bad status: ${status}` });
        if (!VALID_STAGES.includes(stage)) issues.push({ id: node.id, reason: `bad stage: ${stage}` });
      }
      return { pairs, issues };
    });
    expect(report, 'graph available').not.toBeNull();
    expect(report!.pairs, 'phytomer-bound nodes present').toBeGreaterThan(0);
    expect(report!.issues, 'status + stage are valid enum values').toEqual([]);
  });

  test('PHYTOMER-COMP-04: anchor.position == mesh anchor node position (≤1mm) + cultivarGenomeSnapshot present', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          cultivarGenomeSnapshot?: unknown;
          nodes: Map<string, { id: string; pos: { x: number; y: number; z: number } }>;
          edges: Map<string, {
            id: string;
            organAnchors?: Array<{
              id: string;
              kind: string;
              meshAnchorNodeId?: string;
              anchorNodeId: string;
              position?: { x: number; y: number; z: number };
              rotation?: { x: number; y: number; z: number; w: number };
            }>;
          }>;
        };
      };
      const g = w.__skinplantGraph;
      if (!g) return null;
      let leafAnchors = 0;
      const issues: { id: string; reason: string; delta?: number }[] = [];
      let withRotation = 0;
      for (const edge of g.edges.values()) {
        if (!edge.organAnchors) continue;
        for (const a of edge.organAnchors) {
          if (a.kind !== 'leaf_blade') continue;
          leafAnchors++;
          const targetNodeId = a.meshAnchorNodeId ?? a.anchorNodeId;
          const targetNode = g.nodes.get(targetNodeId);
          if (!targetNode) {
            issues.push({ id: a.id, reason: 'mesh anchor node missing' });
            continue;
          }
          if (!a.position) {
            issues.push({ id: a.id, reason: 'anchor.position missing' });
            continue;
          }
          const dx = a.position.x - targetNode.pos.x;
          const dy = a.position.y - targetNode.pos.y;
          const dz = a.position.z - targetNode.pos.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 0.001) {
            issues.push({ id: a.id, reason: 'anchor.position vs node.pos drift', delta: dist });
          }
          if (a.rotation) {
            withRotation++;
            const mag = Math.sqrt(
              a.rotation.x * a.rotation.x + a.rotation.y * a.rotation.y +
              a.rotation.z * a.rotation.z + a.rotation.w * a.rotation.w,
            );
            if (Math.abs(mag - 1) > 0.01) {
              issues.push({ id: a.id, reason: 'anchor.rotation not unit length', delta: mag });
            }
          }
        }
      }
      return { leafAnchors, withRotation, issues, hasSnapshot: g.cultivarGenomeSnapshot !== undefined };
    });
    expect(report, 'graph available').not.toBeNull();
    expect(report!.leafAnchors, 'leaf anchors present').toBeGreaterThan(0);
    expect(report!.issues, 'anchor.position/rotation valid').toEqual([]);
    expect(report!.withRotation, 'leaf anchors carry rotation').toBeGreaterThan(0);
    expect(report!.hasSnapshot, 'graph.cultivarGenomeSnapshot populated').toBe(true);
  });
});
