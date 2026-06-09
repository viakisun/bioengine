// ★ Plant bed-distribution probe — 사용자 보고 "좌표 유니크지만 시각 안 늘어남" 진단.
// 측정: bed별 mesh count + 위치 + boundingBox + visibility.

import { test } from '@playwright/test';

test('plant bed distribution + visibility', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(
    'http://localhost:8090/?mode=workbench&scenario=phenotyping-D110-survey'
    + '&bedLayout=2-4-4&activeBedIds=4%2C5%2C6%2C7%2C8%2C9'
    + '&robotProfile=phenotyping&qualityPreset=1',
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForTimeout(20_000);

  // ★ slider 조작 — 사용자가 직접 plant count를 100으로 늘린 상황 재현.
  const slider = page.locator('input[aria-label="작물 개수"]');
  await slider.waitFor({ state: 'visible', timeout: 10_000 });
  // Range input — value 직접 set + 'input' + 'change' event dispatch.
  await slider.evaluate((el, value) => {
    const input = el as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value',
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, '100');

  // build progress polling — plants.length가 증가 멈출 때까지 추적.
  const progress: Array<{ t: number; root: number; mesh: number }> = [];
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    await page.waitForTimeout(2000);
    const snap = await page.evaluate(() => {
      const scene = (window as unknown as { __debugScene?: {
        meshes: Array<{ name: string }>;
        transformNodes?: Array<{ name: string }>;
      } }).__debugScene;
      if (!scene) return { root: 0, mesh: 0 };
      const root = (scene.transformNodes ?? []).filter(n => /^skinplant_\d+$/.test(n.name)).length;
      const mesh = scene.meshes.filter(m => /^skinplant_skin_\d+$/.test(m.name)).length;
      return { root, mesh };
    });
    progress.push({ t: Math.round((Date.now() - start) / 1000), ...snap });
    // 진행 멈춤 감지 — 마지막 3 sample 동일하면 break.
    if (progress.length >= 3) {
      const last = progress.slice(-3);
      if (last.every(s => s.root === last[0].root && s.mesh === last[0].mesh)) break;
    }
  }
  console.log('build progress:', JSON.stringify(progress));

  const dump = await page.evaluate(() => {
    const w = window as unknown as {
      __debugScene?: {
        meshes: Array<{
          name: string;
          isVisible: boolean;
          isEnabled(): boolean;
          getTotalVertices(): number;
          getAbsolutePosition(): { x: number; y: number; z: number };
          getBoundingInfo(): {
            boundingBox: {
              minimumWorld: { x: number; y: number; z: number };
              maximumWorld: { x: number; y: number; z: number };
            };
          };
        }>;
        transformNodes?: Array<{
          name: string;
          isEnabled(): boolean;
          position: { x: number; y: number; z: number };
        }>;
        activeCamera?: {
          position: { x: number; y: number; z: number };
          target?: { x: number; y: number; z: number };
        };
      };
    };
    const scene = w.__debugScene;
    if (!scene) return { error: 'no __debugScene' };

    // Stem meshes (one per plant root)
    const stemMeshes = scene.meshes.filter((m) => /^skinplant_skin_\d+$/.test(m.name));
    // Root TransformNodes (one per plant)
    const rootNodes = (scene.transformNodes ?? []).filter((n) => /^skinplant_\d+$/.test(n.name));

    // Group root nodes by Z (= bed center)
    const byZ: Record<string, number> = {};
    const byEnabled = { enabled: 0, disabled: 0 };
    const samples: Array<{
      name: string;
      pos: { x: number; y: number; z: number };
      enabled: boolean;
    }> = [];
    for (const n of rootNodes) {
      const zKey = n.position.z.toFixed(2);
      byZ[zKey] = (byZ[zKey] ?? 0) + 1;
      if (n.isEnabled()) byEnabled.enabled++;
      else byEnabled.disabled++;
      if (samples.length < 6) {
        samples.push({
          name: n.name,
          pos: { x: n.position.x, y: n.position.y, z: n.position.z },
          enabled: n.isEnabled(),
        });
      }
    }

    // Stem mesh stats (size + visibility)
    let visible = 0;
    let totalVerts = 0;
    let minVerts = Infinity;
    let maxVerts = 0;
    const bbSamples: Array<{
      name: string;
      verts: number;
      pos: { x: number; y: number; z: number };
      bbSize: { w: number; h: number; d: number };
      isVisible: boolean;
      isEnabled: boolean;
    }> = [];
    for (const m of stemMeshes) {
      if (m.isVisible && m.isEnabled()) visible++;
      const v = m.getTotalVertices();
      totalVerts += v;
      if (v < minVerts) minVerts = v;
      if (v > maxVerts) maxVerts = v;
      if (bbSamples.length < 6) {
        const bb = m.getBoundingInfo().boundingBox;
        bbSamples.push({
          name: m.name,
          verts: v,
          pos: m.getAbsolutePosition(),
          bbSize: {
            w: bb.maximumWorld.x - bb.minimumWorld.x,
            h: bb.maximumWorld.y - bb.minimumWorld.y,
            d: bb.maximumWorld.z - bb.minimumWorld.z,
          },
          isVisible: m.isVisible,
          isEnabled: m.isEnabled(),
        });
      }
    }

    const cam = scene.activeCamera;
    return {
      summary: {
        stemMeshCount: stemMeshes.length,
        rootNodeCount: rootNodes.length,
        stemMeshVisibleEnabled: visible,
        rootEnabled: byEnabled,
        bedDistribution: byZ,
        avgVertsPerStem: stemMeshes.length > 0 ? Math.round(totalVerts / stemMeshes.length) : 0,
        minVerts: Number.isFinite(minVerts) ? minVerts : 0,
        maxVerts,
      },
      cameraPosition: cam?.position,
      cameraTarget: cam?.target,
      rootSamples: samples,
      stemSamples: bbSamples,
    };
  });

  console.log('\n=== Plant bed distribution probe ===');
  console.log(JSON.stringify(dump, null, 2));
});
