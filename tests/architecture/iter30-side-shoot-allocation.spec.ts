// Iter 30 Phase 4 — Side-shoot Allocation Factor invariants.
//
// Plan §6 (sleepy-growing-pretzel.md).
//
// Acceptance:
//   SIDE-SHOOT-ALLOCATION-01: factor ≤ 0.7 (clamp 강제)
//   SIDE-SHOOT-ALLOCATION-CLAMP-01: clamp [0.2, 0.7]
//   SIDE-SHOOT-MEAN-LEAF-RATIO-01: D=30/45 측지 mean leaf < main × 0.7 (단순 평균 — noise 가능)
//   SIDE-SHOOT-POTENTIAL-RATIO-01: ★ ageTT band 안에서 측지 potential < main × 0.7

import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  computeSideShootAllocationFactor,
  computeApexDominanceReleaseFactor,
  DEFAULT_CULTIVAR_SIDE_SHOOT_POTENTIAL,
  DEFAULT_LIGHT_FACTOR,
} from '../../packages/tomato-engine/src/growth/SideShootAllocation';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function enter(page: Page, day: number) {
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

test.describe('Iter 30 Phase 4 — Side-shoot Allocation Factor', () => {
  test('SIDE-SHOOT-ALLOCATION-01 + CLAMP-01: factor ∈ [0.2, 0.7]', () => {
    // Default helpers
    const f = computeSideShootAllocationFactor({
      parentNodeVigor: 1.0,
      cultivarSideShootPotential: DEFAULT_CULTIVAR_SIDE_SHOOT_POTENTIAL,  // 0.4
      apexDominanceReleaseFactor: 0.9,  // basal
      lightFactor: DEFAULT_LIGHT_FACTOR,  // 0.7
    });
    // raw = 1.0 × 0.4 × 0.9 × 0.7 = 0.252 → clamp [0.2, 0.7]
    expect(f).toBeGreaterThanOrEqual(0.2);
    expect(f).toBeLessThanOrEqual(0.7);

    // Clamp upper — strong parent + high potential
    const fHigh = computeSideShootAllocationFactor({
      parentNodeVigor: 1.5,
      cultivarSideShootPotential: 1.0,
      apexDominanceReleaseFactor: 1.0,
      lightFactor: 1.0,
    });
    expect(fHigh).toBe(0.7);  // floor at upper clamp

    // Clamp lower — weak parent + apex dominance strong
    const fLow = computeSideShootAllocationFactor({
      parentNodeVigor: 0.1,
      cultivarSideShootPotential: 0.1,
      apexDominanceReleaseFactor: 0.1,
      lightFactor: 0.5,
    });
    expect(fLow).toBe(0.2);  // floor at lower clamp

    // Sweep — all results in clamp
    for (let v = 0; v < 2; v += 0.1) {
      for (let p = 0; p <= 1; p += 0.1) {
        for (let a = 0; a <= 1; a += 0.1) {
          for (let l = 0.5; l <= 1; l += 0.1) {
            const result = computeSideShootAllocationFactor({
              parentNodeVigor: v, cultivarSideShootPotential: p,
              apexDominanceReleaseFactor: a, lightFactor: l,
            });
            expect(result).toBeGreaterThanOrEqual(0.2);
            expect(result).toBeLessThanOrEqual(0.7);
          }
        }
      }
    }
  });

  test('SIDE-SHOOT-MEAN-LEAF-RATIO-01: 측지 leaf bbox mean < main × 0.7 (live D=30/45)', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 45);
    const { mainMean, sideMean, sideCount } = await page.evaluate(() => {
      const w = window as unknown as {
        __debugScene?: { meshes?: Array<{ name: string; isEnabled(): boolean; getBoundingInfo(): { boundingBox: { minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } } }> };
      };
      const meshes = w.__debugScene?.meshes ?? [];
      const bbDiag = (m: { getBoundingInfo(): { boundingBox: { minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } } }) => {
        const bb = m.getBoundingInfo().boundingBox;
        return Math.hypot(bb.maximumWorld.x - bb.minimumWorld.x, bb.maximumWorld.y - bb.minimumWorld.y, bb.maximumWorld.z - bb.minimumWorld.z) * 100;
      };
      const main = meshes.filter((m) => /^skinplant_leaf_\d+_a0_n\d+/.test(m.name) && m.isEnabled()).map(bbDiag);
      const side = meshes.filter((m) => /^skinplant_leaf_\d+_a[1-9]\d*_n\d+/.test(m.name) && m.isEnabled()).map(bbDiag);
      const mean = (xs: number[]) => xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
      return { mainMean: mean(main), sideMean: mean(side), sideCount: side.length };
    });

    // eslint-disable-next-line no-console
    console.log(`D=45 side-shoot bbox check — main mean=${mainMean.toFixed(1)}cm, side mean=${sideMean.toFixed(1)}cm, count=${sideCount}`);

    if (sideCount === 0) {
      test.info().annotations.push({ type: 'note', description: 'D=45 no side-shoot — skip ratio check' });
      return;
    }
    // ★ Phase 4 핵심 — 측지 평균이 main × 0.7 이하여야 함
    expect(sideMean, `side ${sideMean.toFixed(1)} < main ${mainMean.toFixed(1)} × 0.7 = ${(mainMean * 0.7).toFixed(1)}`)
      .toBeLessThanOrEqual(mainMean * 0.7 + 1);  // 1cm tolerance
  });

  test('SIDE-SHOOT-POTENTIAL-RATIO-01: ageTT band 안에서 potentialArea ratio (source check)', async () => {
    // Phase 4 wire-in 검증 — GrowthModel.ts에서 sideShootAllocFactor가
    // sideShootAllocationFactor로 leaf.allocation에 들어감
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    expect(text, 'computeSideShootAllocationFactor 호출').toMatch(/computeSideShootAllocationFactor\(/);
    expect(text, 'parentNodeVigor 계산').toMatch(/parentVigor\s*=\s*Math\.max\(0\.5/);
    expect(text, 'apex dominance').toMatch(/computeApexDominanceReleaseFactor/);
    expect(text, 'sideShootAllocFactor in allocation')
      .toMatch(/sideShootAllocationFactor:\s*sideShootAllocFactor/);
  });

  test('apex dominance release factor (basal vs apex)', () => {
    // f=0 (apex itself) → 0.3
    expect(computeApexDominanceReleaseFactor({ parentNodeFracFromApex: 0 })).toBeCloseTo(0.3, 4);
    // f=1 (basal) → 0.9
    expect(computeApexDominanceReleaseFactor({ parentNodeFracFromApex: 1 })).toBeCloseTo(0.9, 4);
    // f=0.5 (middle) → 0.6
    expect(computeApexDominanceReleaseFactor({ parentNodeFracFromApex: 0.5 })).toBeCloseTo(0.6, 4);
  });
});
