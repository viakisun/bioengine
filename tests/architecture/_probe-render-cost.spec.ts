// ★ S129 — Rendering cost probe (per-plant + scene-level).
//
// 사용자: "plant를 높이면서 뭔가 잘못한거 같아. 렌더링 비용 계산기 만들어서 점검".
//
// 측정 대상:
//   - Scene 전체 mesh / vertex / face / draw-call 추정
//   - Plant prefix별 breakdown (skinplant_* per seed)
//   - Greenhouse infrastructure (frame, roof, walls, wires, bags) 비용
//   - showcase vs extras 차이 (lowQuality 효과 검증)
//
// 사용: npx playwright test tests/architecture/_probe-render-cost.spec.ts

import { test } from '@playwright/test';

test('S129 render cost probe', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/', { waitUntil: 'networkidle' });

  // 충분히 대기 — 모든 plants build 끝날 때까지
  await page.waitForTimeout(20000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setSinglePlantMinute?: (m: number) => void } } };
    const setter = w.__twinStore?.getState().setSinglePlantMinute;
    if (typeof setter === 'function') setter(80 * 1440 + 12 * 60);
  });
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => {
    const w = window as unknown as { __scene?: { meshes: Array<{
      name: string;
      isEnabled(): boolean;
      isVisible: boolean;
      getTotalVertices(): number;
      getTotalIndices(): number;
      material?: { name?: string };
      subMeshes?: Array<unknown>;
    }> } };
    const scene = w.__scene;
    if (!scene) return { error: 'no scene' };

    interface MeshStats {
      count: number;
      verts: number;
      indices: number;
      tris: number;
    }
    const empty = (): MeshStats => ({ count: 0, verts: 0, indices: 0, tris: 0 });
    const add = (a: MeshStats, mesh: { getTotalVertices(): number; getTotalIndices(): number }) => {
      a.count++;
      a.verts += mesh.getTotalVertices();
      a.indices += mesh.getTotalIndices();
      a.tris += Math.floor(mesh.getTotalIndices() / 3);
    };

    const total = empty();
    const visible = empty();
    const byPrefix = new Map<string, MeshStats>();
    const bySeed = new Map<string, MeshStats>();

    // Per-plant breakdown — match `skinplant_<part>_<seed>_...`
    const seedRegex = /^skinplant_(stem|leaf|fruit|truss|cot)_(\d+)/;
    const prefixRegex = /^([a-z]+)_/;

    for (const mesh of scene.meshes) {
      add(total, mesh);
      if (mesh.isEnabled() && mesh.isVisible) add(visible, mesh);

      // by prefix (first lowercase token)
      const pm = mesh.name.match(prefixRegex);
      const prefix = pm ? pm[1] : 'other';
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, empty());
      add(byPrefix.get(prefix)!, mesh);

      // by seed (if skinplant_*)
      const sm = mesh.name.match(seedRegex);
      if (sm) {
        const seed = sm[2];
        if (!bySeed.has(seed)) bySeed.set(seed, empty());
        add(bySeed.get(seed)!, mesh);
      }
    }

    // Top 10 heaviest individual meshes
    const heaviestMeshes = [...scene.meshes]
      .map(m => ({
        name: m.name,
        verts: m.getTotalVertices(),
        tris: Math.floor(m.getTotalIndices() / 3),
      }))
      .sort((a, b) => b.verts - a.verts)
      .slice(0, 15);

    return {
      total,
      visible,
      byPrefix: Object.fromEntries(byPrefix),
      bySeed: Object.fromEntries(bySeed),
      heaviestMeshes,
      plantCount: bySeed.size,
    };
  });

  console.log('=== S129 RENDER COST PROBE ===\n');
  console.log(JSON.stringify(result, null, 2));
});
