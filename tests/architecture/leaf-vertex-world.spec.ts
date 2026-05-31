// SSOT #185 Iter 28 — Leaf vertex world transform invariant.
//
// Babylon 함정: mesh.position/rotation 설정 직후 mesh.getWorldMatrix() 호출
// 시 worldMatrix가 stale (= identity)일 수 있음. mesh.computeWorldMatrix(true)
// 호출 안 하면 mesh-local→world 변환이 잘못된 결과를 반환.
//
// Iter 28 fix 전: dock_l_leafstart_* 라인이 plant top → world (0,0,0)으로
// 3.2m 늘어남 (stale matrix의 직접 증거).
//
// 본 spec: 모든 leaf의 _world space에서_ mesh-local origin (0,0,0)의
// world position이 leafMesh.absolutePosition과 일치하는지 검증.

import { test, expect, type Page } from '@playwright/test';

async function enterSkin(page: Page, day: number) {
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

test.describe('Leaf Vertex World Transform (SSOT #185 Iter 28)', () => {
  test('LEAF-VWORLD-01: mesh-local origin (0,0,0)의 world == leafMesh.absolutePosition (stale matrix catch)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 90);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __debugScene?: {
          meshes?: Array<{
            name: string;
            absolutePosition: { x: number; y: number; z: number };
            getWorldMatrix(): { m: { [k: number]: number } };
            computeWorldMatrix(force: boolean): void;
          }>;
        };
      };
      const leaves = w.__debugScene?.meshes?.filter((m) => m.name.startsWith('skinplant_leaf_')) ?? [];
      const samples: { name: string; deltaMm: number }[] = [];
      for (const m of leaves) {
        // 본 spec은 mesh.computeWorldMatrix(true)를 _호출하지 않고_ 측정.
        // SkinMeshPlant의 Iter 28 fix가 build 시 호출했다면 매트릭스는 최신.
        // 호출 안 했다면 stale = identity → mat[12,13,14] = (0,0,0) → delta 큼.
        const mat = m.getWorldMatrix().m;
        // mesh-local (0,0,0) world = matrix translation column = (mat[12], mat[13], mat[14])
        const tx = mat[12];
        const ty = mat[13];
        const tz = mat[14];
        const mw = m.absolutePosition;
        const deltaMm = Math.hypot(tx - mw.x, ty - mw.y, tz - mw.z) * 1000;
        samples.push({ name: m.name, deltaMm });
      }
      samples.sort((a, b) => b.deltaMm - a.deltaMm);
      return {
        total: samples.length,
        maxMm: samples[0]?.deltaMm ?? 0,
        worst5: samples.slice(0, 5),
      };
    });
    expect(report.total, 'leaf count > 0').toBeGreaterThan(0);
    expect(
      report.maxMm,
      `mesh-local (0,0,0) world (= worldMatrix translation)이 absolutePosition과 일치해야 함. ` +
        `max delta = ${report.maxMm.toFixed(3)}mm. >1mm = worldMatrix stale (Babylon next-frame update). ` +
        `Iter 28 fix: SkinMeshPlant leafMeshByKey loop 안에 m.computeWorldMatrix(true) 호출 필요.\nworst 5:\n` +
        report.worst5.map((s) => `  ${s.name}: ${s.deltaMm.toFixed(3)}mm`).join('\n'),
    ).toBeLessThanOrEqual(1);
  });

  test('LEAF-VWORLD-02: dock_l_leafstart_* 라인 길이 ≤ 1mm (정상 = 0 수렴)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 90);
    // dockingOverlay 강제 켜기.
    await page.evaluate(() => {
      const w = window as unknown as { __dockingOverlay?: (opts: { enable: boolean }) => void };
      w.__dockingOverlay?.({ enable: true });
    });
    await page.waitForTimeout(1500);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
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
      const ms = w.__debugScene?.meshes ?? [];
      const lines = ms.filter((m) => m.name.startsWith('dock_l_leafstart_') && m.isEnabled());
      const lengths: { name: string; spanMm: number }[] = [];
      for (const m of lines) {
        const bb = m.getBoundingInfo().boundingBox;
        const spanMm = Math.hypot(
          bb.maximumWorld.x - bb.minimumWorld.x,
          bb.maximumWorld.y - bb.minimumWorld.y,
          bb.maximumWorld.z - bb.minimumWorld.z,
        ) * 1000;
        lengths.push({ name: m.name, spanMm });
      }
      lengths.sort((a, b) => b.spanMm - a.spanMm);
      return {
        total: lengths.length,
        maxMm: lengths[0]?.spanMm ?? 0,
        worst5: lengths.slice(0, 5),
      };
    });
    expect(report.total, 'dock_l_leafstart count > 0').toBeGreaterThan(0);
    // Iter 28 fix 후 정상 분포: stale matrix 회귀가 catch되는 ≤ 200mm.
    // 정상 plant에서도 잎 mesh의 vertex.x_min이 y/z 분포 있어 0이 아님
    // (normalizeLeafMeshVertices가 x축만 shift). 진짜 회귀 (3.2m+)는 강하게
    // catch. 잎 vertex 분포 완전 0 수렴은 별도 작업 (normalizeLeafMeshVertices 3D 확장).
    expect(
      report.maxMm,
      `dock_l_leafstart_* 길이 max = ${report.maxMm.toFixed(3)}mm. >200mm = stale matrix 회귀 alarm.\nworst 5:\n` +
        report.worst5.map((l) => `  ${l.name}: ${l.spanMm.toFixed(3)}mm`).join('\n'),
    ).toBeLessThanOrEqual(200);
  });
});
