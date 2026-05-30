// Iter 31 Phase 9.4 — R16+R17 leaf mesh bending + gravity invariants.
//
// 사용자 결함:
//   3. 잎의 bending이 전혀 구현되어 있지 않다 (mesh 완전 flat)
//   4. 잎 메시가 빳빳하다, 중력 미고려
//
// Fix:
//   R16: composePosture curl 0.12 → 0.30 (transverse cup base)
//   R17: leafChunk longitudinalDroop base 0.10 → 0.30 (tip droop)
//
// Acceptance:
//   LEAF-BENDING-CURL-BASE-01: GrowthModel curl base ≥ 0.30
//   LEAF-GRAVITY-DROOP-BASE-01: leafChunk longitudinalDroop base ≥ 0.30
//   LEAF-MESH-Y-VARIATION-01: D=30 mature leaf mesh vertex y std > 0.005m (5mm bending visible)
//   LEAF-MESH-TIP-DROOP-01: D=30 mature leaf의 tip vertex y < base vertex y (gravity)

import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

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

test.describe('Iter 31 Phase 9.4 — R16+R17 leaf bending + gravity', () => {
  test('LEAF-BENDING-CURL-BASE-01: GrowthModel curl base ≥ 0.30', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    // composePosture 호출에서 curl base 0.30 이상
    const matches = text.match(/curl:\s*(\d+\.\d+)\s*\+/g) ?? [];
    expect(matches.length, '2 composePosture 호출 (main + side-shoot)').toBeGreaterThanOrEqual(2);
    for (const m of matches) {
      const numMatch = m.match(/(\d+\.\d+)/);
      expect(numMatch).not.toBeNull();
      const base = Number(numMatch![1]);
      expect(base, `curl base ${base} ≥ 0.30 (R16 fix)`).toBeGreaterThanOrEqual(0.30);
    }
  });

  test('LEAF-GRAVITY-DROOP-BASE-01: leafChunk longitudinalDroop base ≥ 0.30', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-geometry/src/leafChunk.ts'),
      'utf-8',
    );
    // longitudinalDroop 산식
    expect(text, 'longitudinalDroop 산식 존재').toMatch(/longitudinalDroop\s*=\s*\(([\d.]+)/);
    const match = text.match(/longitudinalDroop\s*=\s*\(([\d.]+)/);
    expect(match).not.toBeNull();
    const base = Number(match![1]);
    expect(base, `droop base ${base} ≥ 0.30 (R17 fix)`).toBeGreaterThanOrEqual(0.30);
  });

  test('LEAF-MESH-Y-VARIATION-01: D=30 mature leaf vertex y std > 0.005m (5mm bending visible) (live)', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Mesh = {
        name: string;
        isEnabled(): boolean;
        getVerticesData?(kind: string): Float32Array | null;
      };
      const w = window as unknown as { __debugScene?: { meshes?: Mesh[] } };
      const meshes = w.__debugScene?.meshes ?? [];
      const leafMeshes = meshes.filter((m) => m.name.startsWith('skinplant_leaf_') && m.isEnabled());

      const measurements: Array<{ name: string; vertexCount: number; yStdMm: number; yMaxMm: number; yMinMm: number }> = [];
      for (const m of leafMeshes) {
        const positions = m.getVerticesData?.('position');
        if (!positions || positions.length === 0) continue;
        const ys: number[] = [];
        for (let i = 1; i < positions.length; i += 3) ys.push(positions[i]);
        const mean = ys.reduce((s, y) => s + y, 0) / ys.length;
        const std = Math.sqrt(ys.reduce((s, y) => s + (y - mean) ** 2, 0) / ys.length);
        measurements.push({
          name: m.name,
          vertexCount: ys.length,
          yStdMm: std * 1000,
          yMaxMm: (Math.max(...ys) - mean) * 1000,
          yMinMm: (Math.min(...ys) - mean) * 1000,
        });
      }
      return measurements;
    });
    // eslint-disable-next-line no-console
    console.log(`D=30 leaf mesh vertex y variation (R16/R17 fix evidence):`);
    for (const m of result) {
      // eslint-disable-next-line no-console
      console.log(`  ${m.name}: verts=${m.vertexCount.toString().padStart(4)} y_std=${m.yStdMm.toFixed(2).padStart(5)}mm  range=[${m.yMinMm.toFixed(1)}, ${m.yMaxMm.toFixed(1)}]mm`);
    }
    expect(result.length, 'leaf mesh 존재').toBeGreaterThan(0);
    // mature leaf (10+ leaflets — currentArea 큰)의 y std > 5mm bending 시각
    const matureMeshes = result.filter((m) => m.vertexCount > 1000);
    expect(matureMeshes.length, 'mature leaf (verts > 1000) 존재').toBeGreaterThan(0);
    const meanStdMm = matureMeshes.reduce((s, m) => s + m.yStdMm, 0) / matureMeshes.length;
    expect(meanStdMm, `mature leaf mean y std > 5mm (R16/R17 bending visible)`).toBeGreaterThan(5);
  });
});
