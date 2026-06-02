// SSOT #190 — Rachis curvature discipline (Iter 39 Phase J0-2A).
// See: docs/architecture/SKELETON_SSOT.md (J0 active 원칙 #14)
//
// 사용자 J0 closure: rachis (잎 내부 잎줄기)는 _단순/단조 + 인접 smooth_.
// sinusoidal/zigzag 금지. droop은 _한 번만_.
//
// 두 가지 별도 invariant — _전진성_과 _연속성_은 다른 문제이기 때문:
// - RACHIS-MONOTONIC-01: rachis bone들의 global rachisDir 투영이 strict
//   monotonic 증가 + 각 segment dot > 0.70
// - RACHIS-SMOOTH-01: 인접 segment tangent dot > 0.85

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

interface Bone { p0: { x: number; y: number; z: number }; p1: { x: number; y: number; z: number } }
interface Edge { id: string; type: string; bonePath: Bone[] }
interface Node { id: string; pos: { x: number; y: number; z: number } }

// _Macro_ shape 검증 — attach 노드 polyline 기준 (dense Catmull-Rom 마이크로
// 노이즈는 검증 단위가 아님. user 의도: rachis _구조_가 단조 + smooth).
async function probeRachis(page: Page): Promise<{
  groups: Array<{
    parentLeafId: string;
    nodeCount: number;
    minProjStep: number;
    minSegDot: number;
    minAdjacentDot: number;
    backtrackCount: number;
    polylineLen: number;
    directDist: number;
    linearityRatio: number;   // polylineLen / directDist (1.000=직선)
    midpointSagM: number;     // midpoint deviation from lerp(start, end)
  }>;
}> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __lastGraph?: {
        nodes?: Map<string, Node>;
        edges?: Map<string, Edge>;
      };
    };
    const graph = w.__lastGraph;
    if (!graph?.nodes || !graph?.edges) return { groups: [] };
    // group leaf-rachis edges by parent leaf id (axis${X}:n${Y}).
    const byLeaf = new Map<string, Edge[]>();
    for (const e of graph.edges.values()) {
      if (e.type !== 'leaf-rachis') continue;
      const m = e.id.match(/axis\d+:n\d+/);
      if (!m) continue;
      if (!byLeaf.has(m[0])) byLeaf.set(m[0], []);
      byLeaf.get(m[0])!.push(e);
    }
    const groups: ReturnType<typeof probeRachis> extends Promise<{groups: infer G}> ? G : never = [];
    for (const [parentLeafId, list] of byLeaf) {
      // sort by seg index (suffix `:seg${i}`)
      list.sort((a, b) => {
        const ai = parseInt(a.id.match(/seg(\d+)/)?.[1] ?? '0', 10);
        const bi = parseInt(b.id.match(/seg(\d+)/)?.[1] ?? '0', 10);
        return ai - bi;
      });
      // attach point polyline — _macro_ shape:
      //   [seg0.bonePath[0].p0, seg0.endNode.pos, seg1.endNode.pos, ...]
      const pts: Array<{ x: number; y: number; z: number }> = [];
      pts.push({ ...list[0].bonePath[0].p0 });
      for (const e of list) {
        const endNode = graph.nodes!.get((e as unknown as { endNodeId: string }).endNodeId);
        if (endNode) pts.push({ ...endNode.pos });
      }
      if (pts.length < 2) continue;
      // global rachis direction: first → last point.
      const startP = pts[0];
      const endP = pts[pts.length - 1];
      const gx = endP.x - startP.x;
      const gy = endP.y - startP.y;
      const gz = endP.z - startP.z;
      const gLen = Math.hypot(gx, gy, gz);
      if (gLen < 1e-6) continue;
      const gDir = { x: gx / gLen, y: gy / gLen, z: gz / gLen };
      // tangents + projections at macro polyline level.
      const tans: Array<{ x: number; y: number; z: number }> = [];
      const projs: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x;
        const dy = pts[i + 1].y - pts[i].y;
        const dz = pts[i + 1].z - pts[i].z;
        const dLen = Math.hypot(dx, dy, dz);
        if (dLen < 1e-6) continue;  // degenerate (collocated attach points)
        tans.push({ x: dx / dLen, y: dy / dLen, z: dz / dLen });
        projs.push((pts[i].x - startP.x) * gDir.x
                 + (pts[i].y - startP.y) * gDir.y
                 + (pts[i].z - startP.z) * gDir.z);
      }
      projs.push((endP.x - startP.x) * gDir.x
               + (endP.y - startP.y) * gDir.y
               + (endP.z - startP.z) * gDir.z);
      // MONOTONIC: macro projection step strict 증가 (0.5mm tolerance).
      let minProjStep = Number.POSITIVE_INFINITY;
      let backtrackCount = 0;
      for (let i = 1; i < projs.length; i++) {
        const step = projs[i] - projs[i - 1];
        if (step < minProjStep) minProjStep = step;
        if (step < -0.0005) backtrackCount++;
      }
      let minSegDot = Number.POSITIVE_INFINITY;
      for (const t of tans) {
        const d = t.x * gDir.x + t.y * gDir.y + t.z * gDir.z;
        if (d < minSegDot) minSegDot = d;
      }
      let minAdjacentDot = Number.POSITIVE_INFINITY;
      for (let i = 1; i < tans.length; i++) {
        const a = tans[i - 1], b = tans[i];
        const d = a.x * b.x + a.y * b.y + a.z * b.z;
        if (d < minAdjacentDot) minAdjacentDot = d;
      }
      // ★ J0-7A: polyline 길이 + midpoint sag.
      let polylineLen = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        polylineLen += Math.hypot(
          pts[i + 1].x - pts[i].x,
          pts[i + 1].y - pts[i].y,
          pts[i + 1].z - pts[i].z,
        );
      }
      const linearityRatio = gLen > 1e-6 ? polylineLen / gLen : 1;
      // midpoint sag: midPoint vs lerp(start, end) at t=0.5
      const midIdx = Math.floor(pts.length / 2);
      const midPt = pts[midIdx];
      const lerpMidX = startP.x + (endP.x - startP.x) * 0.5;
      const lerpMidY = startP.y + (endP.y - startP.y) * 0.5;
      const lerpMidZ = startP.z + (endP.z - startP.z) * 0.5;
      const midpointSagM = Math.hypot(midPt.x - lerpMidX, midPt.y - lerpMidY, midPt.z - lerpMidZ);
      groups.push({
        parentLeafId,
        nodeCount: pts.length,
        minProjStep: Number.isFinite(minProjStep) ? minProjStep : 0,
        minSegDot: Number.isFinite(minSegDot) ? minSegDot : 1,
        minAdjacentDot: Number.isFinite(minAdjacentDot) ? minAdjacentDot : 1,
        backtrackCount,
        polylineLen,
        directDist: gLen,
        linearityRatio,
        midpointSagM,
      });
    }
    return { groups };
  });
}

test.describe('Rachis Curvature Discipline (SSOT #190, Iter 39 Phase J0-2A)', () => {
  test('RACHIS-MONOTONIC-01: rachis bone projection strict 증가 + segment dot > 0.70', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await probeRachis(page);
    expect(probe.groups.length, 'rachis groups found').toBeGreaterThan(0);
    const violations = probe.groups.filter(
      g => g.backtrackCount > 0 || g.minSegDot < 0.70,
    );
    expect(
      violations,
      `MONOTONIC violations (backtrack > 0 or minSegDot < 0.70):\n`
      + violations.slice(0, 10).map(v =>
        `${v.parentLeafId}: backtrack=${v.backtrackCount}, minSegDot=${v.minSegDot.toFixed(3)}`
      ).join('\n'),
    ).toEqual([]);
  });

  test('RACHIS-SMOOTH-01: 인접 segment tangent dot > 0.85', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await probeRachis(page);
    expect(probe.groups.length, 'rachis groups found').toBeGreaterThan(0);
    const violations = probe.groups.filter(g => g.minAdjacentDot < 0.85);
    expect(
      violations,
      `SMOOTH violations (minAdjacentDot < 0.85):\n`
      + violations.slice(0, 10).map(v =>
        `${v.parentLeafId}: minAdjDot=${v.minAdjacentDot.toFixed(3)} (${v.nodeCount} nodes)`
      ).join('\n'),
    ).toEqual([]);
  });

  // ★ J0-7A — Curvature presence (직선 금지). active 원칙 #25:
  //   금지(wave)만 catch하면 fishbone 인상 안 catch. floor invariant 필요.
  //
  //   ★ v16 적용: linearity ratio는 _macro polyline_ 측정 단위에서 작은 sag을
  //   underestimate (1.001-1.002 range with 2-3% relative sag). midpoint sag
  //   relative-to-rachisLen이 더 직접적인 floor signal.
  //   기준: midpointSag / rachisLen ≥ 0.005 (0.5% 이상 — single arc 존재).
  //   동시에 linearity ratio ≥ 1.001 (완전 직선 1.0 정확 차단).
  test('RACHIS-CURVATURE-PRESENCE-01: midpoint sag ≥ 0.5% × rachisLen + linearity ≥ 1.001', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await probeRachis(page);
    expect(probe.groups.length, 'rachis groups found').toBeGreaterThan(0);
    const violations = probe.groups.filter(g => {
      const relSag = g.directDist > 0 ? g.midpointSagM / g.directDist : 0;
      return g.linearityRatio < 1.001 || relSag < 0.005;
    });
    expect(
      violations,
      `CURVATURE-PRESENCE violations (linearity < 1.001 or relSag < 0.5%):\n`
      + violations.slice(0, 10).map(v => {
        const relSag = v.directDist > 0 ? (v.midpointSagM / v.directDist * 100) : 0;
        return `${v.parentLeafId}: linearity=${v.linearityRatio.toFixed(5)}, relSag=${relSag.toFixed(2)}%, sag=${(v.midpointSagM * 1000).toFixed(2)}mm`;
      }).join('\n'),
    ).toEqual([]);
  });
});
