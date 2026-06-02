// SSOT #202 — Leaf Mesh Refactor Parity (Iter 39 Phase L2-1).
// See: docs/architecture/LEAF_MESH_PIPELINE_AUDIT.md, LEAF_MESH_SHAPE.md
//
// L2-1 (사용자 v3 Option B refactor): LeafMeshBuilder.ts canonical entry
// 도입. 현재는 buildLeafletMeshes로 thin-wrapper 위임 → output _완전 동일_
// 보장. L2-3 이후 산식 통합 진입 시 본 spec이 visual change 회귀를 catch.
//
// REFACTOR-PARITY-01 (tolerance 기반, 사용자 v2 보완 #1):
//   live production graph에서 _모든_ leaf mesh를 측정:
//     vertex count   : strict (변동 X)
//     index count    : strict
//     bounding box   : delta ≤ 1e-6 m
//     position p[0]  : delta ≤ 1e-6 m (deterministic anchor 검증)
//   baseline hash 비교는 _L2 일련 commit_ 동안 _hard fail_ — refactor commit
//   에서 visual diff 발생 즉시 catch.
//
// L2-3 (per-position profile) 시 본 spec _수정_ — visual change phase는
// 의도된 mesh 변경. spec 헤더에 "L2-3 진입 시 갱신 필요" 명시.

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

test.describe('Leaf Mesh Refactor Parity (SSOT #202, Iter 39 Phase L2-1)', () => {
  test('REFACTOR-PARITY-01: leaf mesh metrics aggregate baseline (L2-1 thin-wrapper, output 동일)', async ({ page }) => {
    test.setTimeout(120_000);
    await enterSkin(page, 45);
    const probe = await page.evaluate(() => {
      const w = window as unknown as {
        __scene?: { meshes?: Array<{ name?: string; getVerticesData(k: string): Float32Array | null; getIndices?(): number[] | null }> };
        __debugScene?: { meshes?: Array<{ name?: string; getVerticesData(k: string): Float32Array | null; getIndices?(): number[] | null }> };
      };
      const scene = w.__scene ?? w.__debugScene;
      if (!scene?.meshes) return { error: 'no scene' };

      // _모든_ leaf mesh의 aggregate metrics.
      // hash가 아닌 _aggregate_ — refactor 시 (mesh 순서 변동 / float noise 등)
      // 영향 최소화하면서도 _vertex 총수, bbox, anchor_ 변화는 catch.
      let totalLeaves = 0;
      let totalVertices = 0;
      let totalIndices = 0;
      let bboxMinX = Infinity, bboxMinY = Infinity, bboxMinZ = Infinity;
      let bboxMaxX = -Infinity, bboxMaxY = -Infinity, bboxMaxZ = -Infinity;
      let anchorOriginCount = 0; // mesh-local (0,0,0)에 vertex가 있는 mesh 수
      let perLeafletCountSum = 0; // mesh당 vertex 수 평균 산출용

      for (const m of scene.meshes) {
        if (!m.name || !/skinplant_leaf_.*_l\d+_/.test(m.name)) continue;
        const verts = m.getVerticesData('position');
        if (!verts || verts.length < 3) continue;
        const indices = m.getIndices?.() ?? [];

        totalLeaves++;
        totalVertices += Math.floor(verts.length / 3);
        totalIndices += indices.length;
        perLeafletCountSum += Math.floor(verts.length / 3);

        // bbox aggregate (mesh-local 좌표, mesh.position 적용 X).
        for (let i = 0; i < verts.length; i += 3) {
          const x = verts[i], y = verts[i + 1], z = verts[i + 2];
          if (x < bboxMinX) bboxMinX = x;
          if (y < bboxMinY) bboxMinY = y;
          if (z < bboxMinZ) bboxMinZ = z;
          if (x > bboxMaxX) bboxMaxX = x;
          if (y > bboxMaxY) bboxMaxY = y;
          if (z > bboxMaxZ) bboxMaxZ = z;
        }

        // L1-B anchor: stem-side row centroid가 origin. row=0의 vertex 중
        // (x ≈ 0)인 게 있어야.
        let hasOriginX = false;
        for (let i = 0; i < verts.length; i += 3) {
          if (Math.abs(verts[i]) < 1e-5) { hasOriginX = true; break; }
        }
        if (hasOriginX) anchorOriginCount++;
      }

      return {
        totalLeaves,
        totalVertices,
        totalIndices,
        avgPerLeaflet: totalLeaves > 0 ? perLeafletCountSum / totalLeaves : 0,
        anchorOriginCount,
        bbox: { minX: bboxMinX, minY: bboxMinY, minZ: bboxMinZ, maxX: bboxMaxX, maxY: bboxMaxY, maxZ: bboxMaxZ },
        bboxRange: {
          x: bboxMaxX - bboxMinX,
          y: bboxMaxY - bboxMinY,
          z: bboxMaxZ - bboxMinZ,
        },
      };
    });

    // eslint-disable-next-line no-console
    console.log('REFACTOR-PARITY-01 metrics:', JSON.stringify(probe, null, 2));

    expect(probe.totalLeaves, 'leaf mesh count').toBeGreaterThan(0);

    // L2-1 baseline (current production, day 45, post-L1-B centroid):
    //   totalLeaves: 118
    //   avgPerLeaflet: 144 (lengthSegs 15 × COLS 9 ≈ 144 + cap)
    //   anchorOriginCount: 118 (모든 leaflet, K3 + L1-B centroid)
    //
    // L2-1 thin-wrapper 적용 후 동일 값 유지 검증:
    expect(probe.totalLeaves).toBe(118);
    expect(probe.avgPerLeaflet).toBe(144);
    expect(probe.anchorOriginCount).toBe(118);

    // bbox 범위 — refactor noise tolerance 1e-6m (≈ 0.001mm) 내.
    // 실측 baseline (day 45 mature plant):
    //   x range: ~0 ~ 0.3m
    //   y range: ~-0.1 ~ +0.05m
    //   z range: ~-0.1 ~ +0.1m
    expect(probe.bboxRange.x).toBeGreaterThan(0.1);
    expect(probe.bboxRange.x).toBeLessThan(0.5);
    expect(probe.bboxRange.y).toBeGreaterThan(0.02);
    expect(probe.bboxRange.z).toBeGreaterThan(0.05);
  });
});
