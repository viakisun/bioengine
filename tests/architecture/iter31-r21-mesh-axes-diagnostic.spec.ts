// Iter 31 Phase 10.1 — R21 mesh axes diagnostic.
//
// 사용자 통찰: "잎이 우측으로 90도 정도 꺾여있는 일정한 패턴" + "어딘가 산수 실수"
//
// 측정:
//   1. mesh-local +x (vertices range x) — leaf length axis?
//   2. mesh-local +y (vertices range y) — blade normal axis?
//   3. mesh-local +z (vertices range z) — leaf width axis?
//   4. world space rotation 적용 후 각 axis → world direction
//   5. leaf world bbox dominant axis (가장 elongated direction)

import { test, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
  await page.goto('/?quality=8', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setMode('single-plant');
    w.__twinStore?.getState().setUseImplicitMesh(false);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setUseImplicitMesh(true);
  });
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

test.describe('Iter 31 Phase 10.1 — R21 mesh axes diagnostic', () => {
  test('R21-DIAG-01: mesh local axes vs world axes + leaf length vs width', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Quat = { x: number; y: number; z: number; w: number };
      type Mesh = {
        name: string;
        isEnabled(): boolean;
        rotationQuaternion?: Quat | null;
        getVerticesData?(kind: string): Float32Array | null;
        getBoundingInfo(): { boundingBox: { minimumWorld: V3; maximumWorld: V3 } };
      };
      const w = window as unknown as { __debugScene?: { meshes?: Mesh[] } };
      const meshes = w.__debugScene?.meshes ?? [];
      const leafMeshes = meshes.filter((m) => m.name.startsWith('skinplant_leaf_') && m.isEnabled());

      function rotateVec(q: Quat, v: V3): V3 {
        const ix = q.w * v.x + q.y * v.z - q.z * v.y;
        const iy = q.w * v.y + q.z * v.x - q.x * v.z;
        const iz = q.w * v.z + q.x * v.y - q.y * v.x;
        const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
        return {
          x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
          y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
          z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
        };
      }

      const data = leafMeshes.map((m) => {
        const positions = m.getVerticesData?.('position');
        if (!positions || positions.length === 0) return null;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i], y = positions[i + 1], z = positions[i + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const localRangeX = (maxX - minX) * 100;  // cm
        const localRangeY = (maxY - minY) * 100;
        const localRangeZ = (maxZ - minZ) * 100;

        const q = m.rotationQuaternion ?? { x: 0, y: 0, z: 0, w: 1 };
        const meshXWorld = rotateVec(q, { x: 1, y: 0, z: 0 });
        const meshYWorld = rotateVec(q, { x: 0, y: 1, z: 0 });
        const meshZWorld = rotateVec(q, { x: 0, y: 0, z: 1 });

        // World bbox
        const bb = m.getBoundingInfo().boundingBox;
        const worldDx = (bb.maximumWorld.x - bb.minimumWorld.x) * 100;
        const worldDy = (bb.maximumWorld.y - bb.minimumWorld.y) * 100;
        const worldDz = (bb.maximumWorld.z - bb.minimumWorld.z) * 100;
        const worldDominantAxis = worldDx >= worldDy && worldDx >= worldDz ? 'x'
          : worldDy >= worldDz ? 'y' : 'z';

        // Mesh-local dominant axis
        const localDominantAxis = localRangeX >= localRangeY && localRangeX >= localRangeZ ? 'x'
          : localRangeY >= localRangeZ ? 'y' : 'z';

        return {
          name: m.name,
          local: { rangeX: localRangeX, rangeY: localRangeY, rangeZ: localRangeZ, dominantAxis: localDominantAxis },
          world: { dx: worldDx, dy: worldDy, dz: worldDz, dominantAxis: worldDominantAxis },
          meshXWorld, meshYWorld, meshZWorld,
        };
      }).filter((d) => d !== null);

      return data;
    });

    // eslint-disable-next-line no-console
    console.log(`\n========== R21 MESH AXES DIAGNOSTIC — D=30, ${result.length} leaves ==========\n`);
    // eslint-disable-next-line no-console
    console.log(`★ mesh-local axes (vertex range, cm) — leaf length axis는 가장 elongated:`);
    for (const d of result) {
      // eslint-disable-next-line no-console
      console.log(`  ${d.name}: localX=${d.local.rangeX.toFixed(1).padStart(5)} localY=${d.local.rangeY.toFixed(1).padStart(5)} localZ=${d.local.rangeZ.toFixed(1).padStart(5)} → dominant=${d.local.dominantAxis}`);
    }

    // eslint-disable-next-line no-console
    console.log(`\n★ world-space rotation result (mesh +x/+y/+z → world):`);
    for (const d of result) {
      // eslint-disable-next-line no-console
      console.log(`  ${d.name}:`);
      // eslint-disable-next-line no-console
      console.log(`    mesh +x → world (${d.meshXWorld.x.toFixed(2).padStart(5)}, ${d.meshXWorld.y.toFixed(2).padStart(5)}, ${d.meshXWorld.z.toFixed(2).padStart(5)})`);
      // eslint-disable-next-line no-console
      console.log(`    mesh +y → world (${d.meshYWorld.x.toFixed(2).padStart(5)}, ${d.meshYWorld.y.toFixed(2).padStart(5)}, ${d.meshYWorld.z.toFixed(2).padStart(5)})`);
      // eslint-disable-next-line no-console
      console.log(`    mesh +z → world (${d.meshZWorld.x.toFixed(2).padStart(5)}, ${d.meshZWorld.y.toFixed(2).padStart(5)}, ${d.meshZWorld.z.toFixed(2).padStart(5)})`);
    }

    // eslint-disable-next-line no-console
    console.log(`\n★ world bbox (cm) — leaf의 실제 spread:`);
    for (const d of result) {
      // eslint-disable-next-line no-console
      console.log(`  ${d.name}: worldDx=${d.world.dx.toFixed(1).padStart(5)} worldDy=${d.world.dy.toFixed(1).padStart(5)} worldDz=${d.world.dz.toFixed(1).padStart(5)} → dominant=${d.world.dominantAxis}`);
    }

    // 진단 결론
    // eslint-disable-next-line no-console
    console.log(`\n★ 진단:`);
    const localDominantXCount = result.filter((d) => d.local.dominantAxis === 'x').length;
    const localDominantYCount = result.filter((d) => d.local.dominantAxis === 'y').length;
    const localDominantZCount = result.filter((d) => d.local.dominantAxis === 'z').length;
    // eslint-disable-next-line no-console
    console.log(`  mesh-local dominant axis: x=${localDominantXCount}, y=${localDominantYCount}, z=${localDominantZCount}`);
    // eslint-disable-next-line no-console
    console.log(`  → leaf length axis (가장 elongated)는 mesh-local 어느 axis? (x = length로 의도)`);
    if (localDominantXCount === result.length) {
      // eslint-disable-next-line no-console
      console.log(`  ✅ 모든 leaf mesh가 +x dominant → 의도와 일치 (mesh +x = leaf length)`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`  ⚠️ 일부 leaf의 dominant axis가 _다름_ — leaf length가 실제 +x가 아닐 수 있음. ★ R21 산수 실수 후보.`);
    }
  });
});
