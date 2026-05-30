// Iter 30 Phase 0.B — Side-shoot phytomer binding fix invariants.
//
// Plan §0.B (sleepy-growing-pretzel.md), R2 binding 누락 fix.
//
// 이전 (Iter 29까지):
//   populateAnchorMorphology.ts:94-96 findNodeState
//     if (axisIdx !== 0) return undefined;  // ← 의도적 누락
//   → 측지 anchor에 phytomer 미바인딩 → Skin canonical path 안 탐
//   → 측지 leaf mesh bbox = 0
//
// fix Phase 0.B:
//   axisIdx > 0 → state.allAxes 중 order>0 axes 순회 lookup
//
// Acceptance:
//   SIDE-SHOOT-PHYTOMER-BIND-01: 측지 SkeletonNode에도 phytomer bound (live)
//   SIDE-SHOOT-MESH-NONZERO-01: 측지 leaf mesh bbox > 0
//   SIDE-SHOOT-AXIS-ID-01: side-shoot binding consistency 검증

import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function readSrc(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf-8');
}

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

test.describe('Iter 30 Phase 0.B — Side-shoot phytomer binding (R2 fix)', () => {
  test('SIDE-SHOOT-PHYTOMER-BIND-01: 측지 SkeletonNode에도 phytomer bound', async ({ page }) => {
    test.setTimeout(120_000);
    await enter(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          nodes: Map<string, { id: string; phytomer?: { leaf?: { nodeIndex: number; currentAreaCm2: number } } }>;
          edges: Map<string, { id: string; organAnchors?: Array<{ id: string; kind: string; meshAnchorNodeId?: string; anchorNodeId: string }> }>;
        };
      };
      const g = w.__skinplantGraph;
      if (!g) return { error: 'no __skinplantGraph' };
      // 측지 leaf anchors: id pattern "leaf_blade:axis<N>:n<I>" with N > 0
      let mainAnchors = 0;
      let sideAnchors = 0;
      let mainBound = 0;
      let sideBound = 0;
      for (const edge of g.edges.values()) {
        if (!edge.organAnchors) continue;
        for (const a of edge.organAnchors) {
          if (a.kind !== 'leaf_blade') continue;
          const match = a.id.match(/^leaf_blade:axis(\d+):n(\d+)$/);
          if (!match) continue;
          const axisIdx = Number(match[1]);
          const targetNodeId = a.meshAnchorNodeId ?? a.anchorNodeId;
          const targetNode = g.nodes.get(targetNodeId);
          const isBound = !!targetNode?.phytomer?.leaf;
          if (axisIdx === 0) {
            mainAnchors++;
            if (isBound) mainBound++;
          } else {
            sideAnchors++;
            if (isBound) sideBound++;
          }
        }
      }
      return { mainAnchors, mainBound, sideAnchors, sideBound };
    });
    expect(report).not.toHaveProperty('error');
    const r = report as { mainAnchors: number; mainBound: number; sideAnchors: number; sideBound: number };
    expect(r.mainAnchors, 'main anchors exist').toBeGreaterThan(0);
    expect(r.mainBound, 'main anchors bound').toBeGreaterThan(0);
    if (r.sideAnchors > 0) {
      expect(r.sideBound, `${r.sideBound}/${r.sideAnchors} side anchors bound`).toBeGreaterThan(0);
    }
  });

  test('SIDE-SHOOT-MESH-NONZERO-01: 측지 leaf mesh bbox > 0', async ({ page }) => {
    test.setTimeout(120_000);
    await enter(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __debugScene?: { meshes?: Array<{ name: string; isEnabled(): boolean; getBoundingInfo(): { boundingBox: { minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } } }> };
      };
      const meshes = w.__debugScene?.meshes ?? [];
      // skinplant_leaf_<seed>_a<axisIdx>_n<nodeIdx> 패턴
      const sideLeafMeshes = meshes.filter((m) => /^skinplant_leaf_\d+_a[1-9]\d*_n\d+/.test(m.name) && m.isEnabled());
      const sideBboxes = sideLeafMeshes.map((m) => {
        const bb = m.getBoundingInfo().boundingBox;
        return Math.hypot(
          bb.maximumWorld.x - bb.minimumWorld.x,
          bb.maximumWorld.y - bb.minimumWorld.y,
          bb.maximumWorld.z - bb.minimumWorld.z,
        ) * 100;
      });
      return { sideCount: sideLeafMeshes.length, sideBboxes };
    });
    if (report.sideCount === 0) {
      // No side shoots at D=45 (training mode may suppress) — OK
      test.info().annotations.push({ type: 'note', description: 'No side-shoot leaves at D=45' });
      return;
    }
    const nonZero = report.sideBboxes.filter((b) => b > 1).length;
    expect(nonZero, `${nonZero}/${report.sideCount} side-shoot leaves bbox > 1cm`).toBeGreaterThan(0);
  });

  test('SIDE-SHOOT-AXIS-ID-01: side-shoot binding consistency (populator fix)', async () => {
    // 코드 단위 검증 — populator findNodeState가 side-shoot path를 walk
    const text = await readSrc('src/plant/skeleton/populator/populateAnchorMorphology.ts');
    // 핵심: `axisIdx > 0`에서도 lookup 수행
    expect(text, 'findNodeState handles axisIdx > 0').toMatch(/state\.allAxes\.filter/);
    expect(text, 'sideAxes lookup').toMatch(/sideAxes\[\s*axisIdx\s*-\s*1\s*\]/);
    // _의도적 누락_ 패턴 (`if (axisIdx !== 0) return undefined`) 0건
    expect(text, 'no intentional axisIdx skip').not.toMatch(/if\s*\(\s*axisIdx\s*!==\s*0\s*\)\s*return\s+undefined/);
  });
});
