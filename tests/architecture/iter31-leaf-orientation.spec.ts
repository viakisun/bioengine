// Iter 31 Phase 9 — R11 leaf blade orientation convention fix invariants.
//
// Plan: AnchorTransform.ts composeLeafRotationLocal에 baseAlignment 추가.
//
// Acceptance:
//   LEAF-BASE-ALIGNMENT-01: baseAlignmentQuat 함수 정의 + JSDoc convention 명시
//   LEAF-MESH-CONVENTION-01: createOvateLeaflet의 +x petiole / +y normal / +z width 명시
//   LEAF-BLADE-NORMAL-UP-01: D=30 mature leaf의 _world_ blade normal이 +y에 가까움 (cos > 0.5)
//   LEAF-VERTICAL-STACK-BREAK-01: D=30 leaf bbox aspect ratio 검증 — vertical (bboxY > bboxX & bboxZ) 0건

import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function enter(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
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

test.describe('Iter 31 Phase 9 — R11 leaf orientation convention fix', () => {
  test('LEAF-BASE-ALIGNMENT-01: baseAlignmentQuat 함수 + JSDoc convention 명시', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/AnchorTransform.ts'),
      'utf-8',
    );
    expect(text, 'baseAlignmentQuat 함수 정의').toMatch(/function\s+baseAlignmentQuat/);
    expect(text, 'matrixToQuat helper').toMatch(/function\s+matrixToQuat/);
    expect(text, 'Mesh-local convention 명시').toMatch(/\+x\s*=\s*petiole/i);
    expect(text, '+y blade normal up 명시').toMatch(/\+y\s*=\s*blade normal/i);
    expect(text, 'R11 fix 주석').toMatch(/R11/);
  });

  test('LEAF-MESH-CONVENTION-01: leafChunk.ts mesh-local axes 의미 (코드 검증)', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-geometry/src/leafChunk.ts'),
      'utf-8',
    );
    // createOvateLeaflet에서 positions push 패턴 확인:
    //   chunk.positions.push(rowX, y, z)  ← rowX=length(+x), y=normal(+y), z=width(+z)
    expect(text, 'positions push 패턴 (rowX, y, z)').toMatch(/positions\.push\(rowX,\s*y,\s*z\)/);
    // rowX = t * length 확인
    expect(text, 'rowX = t * length').toMatch(/rowX\s*=\s*t\s*\*\s*length/);
  });

  test('LEAF-BLADE-NORMAL-UP-01: D=30 mature leaf의 _world_ blade normal이 위 향함 (live)', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Mesh = {
        name: string;
        isEnabled(): boolean;
        rotationQuaternion?: { x: number; y: number; z: number; w: number } | null;
        getBoundingInfo(): { boundingBox: { minimumWorld: V3; maximumWorld: V3 } };
      };
      const w = window as unknown as { __debugScene?: { meshes?: Mesh[] } };
      const meshes = w.__debugScene?.meshes ?? [];
      const leaves = meshes.filter((m) => m.name.startsWith('skinplant_leaf_') && m.isEnabled());

      function rotateVec(q: { x: number; y: number; z: number; w: number }, v: V3): V3 {
        // v' = q × v × q⁻¹ (formula optimized)
        const x = q.x, y = q.y, z = q.z, w = q.w;
        const ix = w * v.x + y * v.z - z * v.y;
        const iy = w * v.y + z * v.x - x * v.z;
        const iz = w * v.z + x * v.y - y * v.x;
        const iw = -x * v.x - y * v.y - z * v.z;
        return {
          x: ix * w + iw * -x + iy * -z - iz * -y,
          y: iy * w + iw * -y + iz * -x - ix * -z,
          z: iz * w + iw * -z + ix * -y - iy * -x,
        };
      }

      // mesh-local +y (blade normal) → world
      const bladeNormals = leaves.map((m) => {
        const q = m.rotationQuaternion ?? { x: 0, y: 0, z: 0, w: 1 };
        const worldNormal = rotateVec(q, { x: 0, y: 1, z: 0 });
        return { name: m.name, world: worldNormal, y: worldNormal.y };
      });

      return {
        count: leaves.length,
        bladeNormals,
        meanY: bladeNormals.reduce((s, b) => s + b.y, 0) / Math.max(1, bladeNormals.length),
        upCount: bladeNormals.filter((b) => b.y > 0.5).length,
      };
    });
    // eslint-disable-next-line no-console
    console.log(`D=30 blade normals (mesh +y → world):`);
    for (const b of result.bladeNormals) {
      // eslint-disable-next-line no-console
      console.log(`  ${b.name}: (${b.world.x.toFixed(2)}, ${b.world.y.toFixed(2)}, ${b.world.z.toFixed(2)})`);
    }
    // eslint-disable-next-line no-console
    console.log(`  mean y: ${result.meanY.toFixed(3)} | up count (y>0.5): ${result.upCount} / ${result.count}`);
    expect(result.count, 'leaf mesh count').toBeGreaterThan(0);
    // ★ Iter 30 baseline: 모두 horizontal (y ≈ 0, vertical leaf stack).
    // ★ Iter 31 R11 (baseAlign 추가): partial (mean 0.156, up 44%).
    // ★ Iter 31 R12 (★ az → world Y, 진단 winner): complete (mean 0.997, up 100%).
    //
    // Visual target (정상 토마토 ground-parallel blade) 달성.
    expect(result.meanY, 'mean blade normal y > 0.7 (R12 fix: ground-parallel blade)').toBeGreaterThan(0.7);
    expect(result.upCount / result.count, 'blade up ratio > 80%').toBeGreaterThan(0.8);
  });

  test('LEAF-VERTICAL-STACK-BREAK-01: D=30 leaf bbox aspect (bboxY가 dominant 0건)', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Mesh = {
        name: string;
        isEnabled(): boolean;
        getBoundingInfo(): { boundingBox: { minimumWorld: V3; maximumWorld: V3 } };
      };
      const w = window as unknown as { __debugScene?: { meshes?: Mesh[] } };
      const meshes = w.__debugScene?.meshes ?? [];
      const leaves = meshes.filter((m) => m.name.startsWith('skinplant_leaf_') && m.isEnabled());
      const aspects = leaves.map((m) => {
        const bb = m.getBoundingInfo().boundingBox;
        const dx = (bb.maximumWorld.x - bb.minimumWorld.x) * 100;
        const dy = (bb.maximumWorld.y - bb.minimumWorld.y) * 100;
        const dz = (bb.maximumWorld.z - bb.minimumWorld.z) * 100;
        return { name: m.name, dx, dy, dz, isVertical: dy > dx && dy > dz };
      });
      const verticalCount = aspects.filter((a) => a.isVertical).length;
      return { count: leaves.length, aspects, verticalCount };
    });
    // eslint-disable-next-line no-console
    console.log(`D=30 leaf vertical-bbox count: ${result.verticalCount} / ${result.count}`);
    for (const a of result.aspects.filter((x) => x.isVertical)) {
      // eslint-disable-next-line no-console
      console.log(`  ⚠️ ${a.name}: dx=${a.dx.toFixed(1)} dy=${a.dy.toFixed(1)} dz=${a.dz.toFixed(1)}`);
    }
    // ★ vertical bbox (dy > dx && dy > dz)는 _leaf가 vertical_ 신호.
    // Iter 30 baseline: 대부분 vertical (stack). R12 fix 후 0건 (모든 leaf horizontal).
    const verticalRatio = result.verticalCount / Math.max(1, result.count);
    expect(verticalRatio, 'vertical bbox ratio = 0 (R12 fix: 모든 leaf horizontal)').toBe(0);
  });
});
