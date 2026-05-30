// Iter 31 R24 — _잎이 자라는 방향_ vs _잎 body 방향_ 비교.
//
// 사용자 통찰:
//   A. 잎이 자라는 방향 = anchor.rotation × (1,0,0) = mesh +x → world
//   B. 잎 body 방향 = anchor.position → leaf tip (가장 먼 vertex world position)
//
//   두 vector가 _일치_해야 잎이 직선으로 자란 모습.
//   _불일치_시 leaf가 "꺾인" 시각 (사용자 사진 결함과 매칭).

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

test.describe('Iter 31 R24 — 자라는 방향 vs body 방향', () => {
  test('R24-DIAG-01: anchor → tip vector vs petiole world direction angle', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);

    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Quat = { x: number; y: number; z: number; w: number };
      type Anchor = { id: string; kind: string; position?: V3; rotation?: Quat; meshAnchorNodeId?: string; anchorNodeId: string };
      type Mesh = {
        name: string;
        isEnabled(): boolean;
        rotationQuaternion?: Quat | null;
        position?: V3;
        getVerticesData?(kind: string): Float32Array | null;
        getWorldMatrix?(): unknown;
      };
      type Edge = { id: number; organAnchors?: Anchor[] };
      const w = window as unknown as {
        __debugScene?: { meshes?: Mesh[] };
        __skinplantGraph?: { edges: Map<number, Edge> };
      };
      const meshes = (w.__debugScene?.meshes ?? []) as Mesh[];
      const g = w.__skinplantGraph;
      if (!g) return null;

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
      function normalize(v: V3): V3 {
        const L = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (L < 1e-9) return { x: 0, y: 0, z: 0 };
        return { x: v.x / L, y: v.y / L, z: v.z / L };
      }
      function angleDeg(a: V3, b: V3): number {
        const dot = a.x * b.x + a.y * b.y + a.z * b.z;
        const cosA = Math.max(-1, Math.min(1, dot));
        return Math.acos(cosA) * 180 / Math.PI;
      }

      // Build mesh lookup by anchor id
      const meshByAnchorId = new Map<string, Mesh>();
      for (const m of meshes) {
        if (!m.name.startsWith('skinplant_leaf_') || !m.isEnabled()) continue;
        const match = m.name.match(/_(a\d+_n\d+)$/);
        if (match) meshByAnchorId.set(match[1], m);
      }

      // Build anchor lookup by mesh-suffix
      const anchorByKey = new Map<string, Anchor>();
      const anchorIdsCollected: string[] = [];
      for (const edge of g.edges.values()) {
        for (const a of edge.organAnchors ?? []) {
          if (a.kind !== 'leaf_blade') continue;
          anchorIdsCollected.push(a.id);
          const k = a.id.match(/a\d+_n\d+/);
          if (k) anchorByKey.set(k[0], a);
        }
      }

      const data: Array<{
        anchorId: string;
        anchorPos: V3;
        rotation: Quat;
        meshXWorld: V3;             // 의도된 자라는 방향
        farthestVertexLocal: V3;     // mesh-local farthest from origin
        farthestVertexWorld: V3;     // world space
        bodyVectorWorld: V3;         // anchor → farthest, world
        growth_to_body_angle: number; // ★ 두 벡터 사이 각도 — 정상 0°
        meshLocalFarthestDistance: number;
      }> = [];

      // Iterate by mesh + lookup anchor (more robust)
      for (const [meshKey, mesh] of meshByAnchorId) {
        const a = anchorByKey.get(meshKey);
        if (!a || !a.position || !a.rotation) continue;
        {
          const positions = mesh.getVerticesData?.('position');
          if (!positions || positions.length === 0) continue;

          // Find farthest vertex from mesh-local origin
          let maxDist = 0;
          let farthestLocal: V3 = { x: 0, y: 0, z: 0 };
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i], y = positions[i + 1], z = positions[i + 2];
            const d = Math.sqrt(x * x + y * y + z * z);
            if (d > maxDist) {
              maxDist = d;
              farthestLocal = { x, y, z };
            }
          }

          // Convert farthest vertex to world space:
          //   world = anchorPos + rotation(local)
          const farthestWorldOffset = rotateVec(a.rotation, farthestLocal);
          const farthestWorld: V3 = {
            x: a.position.x + farthestWorldOffset.x,
            y: a.position.y + farthestWorldOffset.y,
            z: a.position.z + farthestWorldOffset.z,
          };

          // Body vector = anchor → farthest, normalized
          const bodyVector = normalize({
            x: farthestWorld.x - a.position.x,
            y: farthestWorld.y - a.position.y,
            z: farthestWorld.z - a.position.z,
          });

          // Growth direction = mesh +x → world
          const meshXWorld = normalize(rotateVec(a.rotation, { x: 1, y: 0, z: 0 }));

          // Angle between growth direction and body direction
          const angle = angleDeg(meshXWorld, bodyVector);

          data.push({
            anchorId: meshKey,
            anchorPos: a.position,
            rotation: a.rotation,
            meshXWorld,
            farthestVertexLocal: farthestLocal,
            farthestVertexWorld: farthestWorld,
            bodyVectorWorld: bodyVector,
            growth_to_body_angle: angle,
            meshLocalFarthestDistance: maxDist * 100,  // cm
          });
        }
      }

      function stats(values: number[]) {
        const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
        const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length));
        const min = Math.min(...values);
        const max = Math.max(...values);
        return { mean, std, min, max };
      }

      return {
        count: data.length,
        anchorCount: anchorByKey.size,
        meshCount: meshByAnchorId.size,
        sampleAnchorIds: anchorIdsCollected.slice(0, 5),
        data,
        summary: data.length > 0 ? stats(data.map((d) => d.growth_to_body_angle)) : { mean: 0, std: 0, min: 0, max: 0 },
      };
    });

    if (!result) {
      // eslint-disable-next-line no-console
      console.log('ERROR');
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`\n========== R24 GROWTH vs BODY VECTOR — D=30, ${result.count} leaves ==========\n`);
    // eslint-disable-next-line no-console
    console.log(`★ Per-leaf: growth direction (mesh +x → world) vs body direction (anchor → farthest):`);
    for (const d of result.data) {
      const status = d.growth_to_body_angle < 30 ? '✅' : d.growth_to_body_angle < 60 ? '⚠️' : '❌';
      // eslint-disable-next-line no-console
      console.log(
        `  ${d.anchorId.padEnd(12)} | growth=(${d.meshXWorld.x.toFixed(2).padStart(5)}, ${d.meshXWorld.y.toFixed(2).padStart(5)}, ${d.meshXWorld.z.toFixed(2).padStart(5)}) | ` +
        `body=(${d.bodyVectorWorld.x.toFixed(2).padStart(5)}, ${d.bodyVectorWorld.y.toFixed(2).padStart(5)}, ${d.bodyVectorWorld.z.toFixed(2).padStart(5)}) | ` +
        `angle=${d.growth_to_body_angle.toFixed(1).padStart(5)}° ${status} | farthest=${d.meshLocalFarthestDistance.toFixed(1)}cm`
      );
    }

    // eslint-disable-next-line no-console
    console.log(`\n★ Summary:`);
    // eslint-disable-next-line no-console
    console.log(`  growth ~ body angle: mean=${result.summary.mean.toFixed(1)}° ± ${result.summary.std.toFixed(1)}° [${result.summary.min.toFixed(1)}, ${result.summary.max.toFixed(1)}]`);

    if (result.summary.mean < 10) {
      // eslint-disable-next-line no-console
      console.log(`  ✅ growth direction과 body direction _일치_ — leaf가 직선으로 자람`);
    } else if (result.summary.mean < 30) {
      // eslint-disable-next-line no-console
      console.log(`  ⚠️ small offset (${result.summary.mean.toFixed(1)}°) — leaf 약간 꺾임`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`  ❌ ★ LARGE offset (${result.summary.mean.toFixed(1)}°) — leaf가 _명백히 꺾임_!`);
      // eslint-disable-next-line no-console
      console.log(`     사용자가 본 "꺾여있다" 패턴 확인. R24 root cause:`);
      // eslint-disable-next-line no-console
      console.log(`     mesh의 farthest vertex가 +x axis가 아닌 다른 방향에 위치.`);
    }
  });
});
