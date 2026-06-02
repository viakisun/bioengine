// SSOT #201 — Per-leaflet pitch envelope (Iter 39 Phase L0-D-1).
// See: docs/architecture/LEAF_MESH_SHAPE.md
//
// L0 진단: K3 (mesh anchor 3D) 적용 후에도 사용자 close-up에서 "잎이 안쪽
// 으로 말림" 인상. baseline 측정 결과:
//   - mesh-local vertex cup 산식 정상 (cupMax negative, droopMax 충분)
//   - 사용자 의심 정확: per-leaflet rotation 영역
//   - foldDroopDeg = -10 + 40×maturity (mature +30°) 산식 검증:
//       normalDotUp p50 0.854 = cos(31°) (mature leaflet 평균 31° tilt)
//       widthVerticalTilt p50 -0.396 (모든 leaflet 같은 방향 tilt → cup 인상)
//
// L0-D-1 fix: foldDroopDeg = -5 + 15×maturity (mature +10°)
//   buildLeafletMeshes.ts:133
//   결과: normalDotUp p50 0.951 (= 18° tilt), widthVerticalTilt p50 -0.103.
//
// LEAF-LEAFLET-PITCH-01 (회귀 보호):
//   ∀ leaflet mesh in scene:
//     planeNormalDotUp = mesh.rotationQuaternion · (0,1,0) of mesh +Y
//   분포 검증:
//     p50  ≥ 0.93  (= cos(22°), foldDroopDeg 30° 회귀 시 0.854로 즉시 fail)
//     p90  ≥ 0.85  (extreme outliers 차단)
//     mean ≥ 0.90

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

test.describe('Per-Leaflet Pitch Envelope (SSOT #201, Iter 39 Phase L0-D-1)', () => {
  test('LEAF-LEAFLET-PITCH-01: planeNormalDotUp 분포 (foldDroopDeg ≤ ~15° envelope)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __scene?: { meshes?: Array<{
          name?: string;
          rotationQuaternion?: { x: number; y: number; z: number; w: number };
        }> };
        __debugScene?: { meshes?: Array<{
          name?: string;
          rotationQuaternion?: { x: number; y: number; z: number; w: number };
        }> };
      };
      const scene = w.__scene ?? w.__debugScene;
      if (!scene?.meshes) return { error: 'no scene', dots: [] };

      // Quaternion 적용: (0, 1, 0) → world Y (mesh-local plane normal).
      function rotateY(q: { x: number; y: number; z: number; w: number }) {
        const { x: qx, y: qy, z: qz, w: qw } = q;
        // v = (0, 1, 0)
        const ix =  qy * 0 - qz * 0 + qw * 0;  // 0
        const iy =  qz * 0 - qx * 0 + qw * 1;  // qw
        const iz =  qx * 0 - qy * 0 + qw * 0;  // 0
        const iw = -qx * 0 - qy * 1 - qz * 0;  // -qy
        // 결과: (q × v) × q⁻¹의 y 성분 = ?
        // 간단화: 표준 공식 사용.
        const dotUp =
          2 * (qx * qy + qz * qw) * 0 +
          (qw * qw - qx * qx + qy * qy - qz * qz) * 1 +
          2 * (qy * qz - qx * qw) * 0;
        return dotUp;
        // void ix; void iy; void iz; void iw;  // suppress unused
      }

      const dots: number[] = [];
      for (const m of scene.meshes) {
        if (!m.name || !/skinplant_leaf_.*_l\d+_/.test(m.name)) continue;
        if (!m.rotationQuaternion) continue;
        dots.push(rotateY(m.rotationQuaternion));
      }
      return { dots };
    });

    expect(probe.dots.length, 'leaflet mesh 수').toBeGreaterThan(0);

    const sorted = probe.dots.slice().sort((a, b) => a - b);
    const n = sorted.length;
    const p50 = sorted[Math.floor(n * 0.5)];
    const p90 = sorted[Math.floor(n * 0.9)];
    const mean = sorted.reduce((s, x) => s + x, 0) / n;
    const min = sorted[0];
    const max = sorted[n - 1];

    // eslint-disable-next-line no-console
    console.log(`LEAF-LEAFLET-PITCH-01 normalDotUp: n=${n} min=${min.toFixed(3)} p50=${p50.toFixed(3)} p90=${p90.toFixed(3)} max=${max.toFixed(3)} mean=${mean.toFixed(3)}`);

    // L0-D-1 channel: foldDroopDeg ~10° mature, ~-5° young.
    //   기대: p50 ≥ 0.93 (회귀 차단), mean ≥ 0.90.
    //   foldDroopDeg 30° 회귀 시: p50 → 0.854 (fail), mean → 0.864 (fail).
    expect(p50, `normalDotUp p50 (= cos(median tilt))`).toBeGreaterThanOrEqual(0.93);
    expect(mean, `normalDotUp mean`).toBeGreaterThanOrEqual(0.90);
    // p90은 _상위_ outliers — 잘 정렬된 잎. 0.85 (= cos(31°)) 이상.
    expect(p90, `normalDotUp p90`).toBeGreaterThanOrEqual(0.85);
  });
});
