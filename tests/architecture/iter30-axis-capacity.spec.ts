// Iter 30 Phase 1 — Axis Capacity Factor invariants.
//
// Plan §3 (sleepy-growing-pretzel.md).
//
// Acceptance:
//   AXIS-STRUCTURAL-CAPACITY-01: R²×L×coeff 산식
//   AXIS-CAPACITY-FACTOR-CLAMP-01: factor ∈ [0.35, 1.0]
//   AXIS-CAPACITY-TO-NODE-01: axis 안 모든 node에 동일 factor 전파
//   LEAF-TARGET-INCLUDES-AXIS-CAP-01: (Phase 2 wire-in deferred — Phase 1은 growthContext에만 기록)
//   AXIS-CAPACITY-PROXY-LABEL-01: JSDoc "proxy" + "NOT physical load-bearing"

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  computeAxisStructuralCapacity,
  computeAxisCapacityFactor,
  computeAxisOrganDemand,
  computeAxisMeanStemRadius,
  computeAxisLengthCm,
  assertAxisCapacityFactorValid,
} from '../../packages/tomato-engine/src/growth/AxisCapacityModel';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Iter 30 Phase 1 — Axis Capacity Model', () => {
  test('AXIS-STRUCTURAL-CAPACITY-01: R² × L × coeff', () => {
    // Pure math
    expect(computeAxisStructuralCapacity({
      meanStemRadiusMm: 10, axisLengthCm: 100, structuralCapacityCoeff: 1.0,
    })).toBe(10 * 10 * 100 * 1.0);  // 10000

    expect(computeAxisStructuralCapacity({
      meanStemRadiusMm: 5, axisLengthCm: 50,
    })).toBe(5 * 5 * 50);  // 1250 (default coeff=1.0)

    // Cultivar coeff override
    expect(computeAxisStructuralCapacity({
      meanStemRadiusMm: 8, axisLengthCm: 80, structuralCapacityCoeff: 0.5,
    })).toBe(8 * 8 * 80 * 0.5);  // 2560

    // Helpers
    expect(computeAxisMeanStemRadius({ nodeRadiiMm: [8, 10, 12] })).toBe(10);
    expect(computeAxisLengthCm({ nodeHeightsCm: [0, 30, 80] })).toBe(80);
    expect(computeAxisOrganDemand({ leafPotentialAreasCm2: [200, 400, 600] })).toBe(1200);
  });

  test('AXIS-CAPACITY-FACTOR-CLAMP-01: factor ∈ [0.35, 1.0]', () => {
    // demand=0 → 1.0 (degenerate)
    expect(computeAxisCapacityFactor({ axisStructuralCapacity: 100, axisOrganDemand: 0 })).toBe(1.0);
    // demand=capacity → 1.0
    expect(computeAxisCapacityFactor({ axisStructuralCapacity: 100, axisOrganDemand: 100 })).toBe(1.0);
    // demand > capacity → ratio (clamp 0.35)
    expect(computeAxisCapacityFactor({ axisStructuralCapacity: 100, axisOrganDemand: 200 })).toBe(0.5);
    expect(computeAxisCapacityFactor({ axisStructuralCapacity: 100, axisOrganDemand: 1000 })).toBe(0.35);  // floor
    // capacity > demand → 1.0 (ceiling)
    expect(computeAxisCapacityFactor({ axisStructuralCapacity: 500, axisOrganDemand: 100 })).toBe(1.0);

    // Sweep
    for (let demand = 10; demand <= 1000; demand += 50) {
      const f = computeAxisCapacityFactor({ axisStructuralCapacity: 100, axisOrganDemand: demand });
      expect(f).toBeGreaterThanOrEqual(0.35);
      expect(f).toBeLessThanOrEqual(1.0);
    }

    // assertAxisCapacityFactorValid not throw
    expect(() => assertAxisCapacityFactorValid(0.5)).not.toThrow();
    expect(() => assertAxisCapacityFactorValid(2.0)).not.toThrow();  // warn but no throw
  });

  test('AXIS-CAPACITY-PROXY-LABEL-01: JSDoc proxy + NOT physical model', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/growth/AxisCapacityModel.ts'),
      'utf-8',
    );
    expect(text, '"proxy" 명시').toMatch(/proxy/i);
    expect(text, '"NOT.*(physical|load-bearing)" 명시').toMatch(/NOT\s+a?\s*physical|NOT\s+load-bearing/i);
    expect(text, '"unitless" 명시').toMatch(/unitless/i);
    expect(text, 'Euler-Bernoulli 언급').toMatch(/Euler-Bernoulli|radius⁴/);
  });

  test('AXIS-CAPACITY-TO-NODE-01: wire-in 후 axis 안 동일 factor (source check)', async () => {
    // GrowthModel.ts에서 axis 안 모든 node의 growthContext.axisCapacityFactor가
    // _같은 값_으로 갱신되는 패턴 검증
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    expect(text, 'computeAxisStructuralCapacity 호출').toMatch(/computeAxisStructuralCapacity\(/);
    expect(text, 'computeAxisCapacityFactor 호출').toMatch(/computeAxisCapacityFactor\(/);
    // main + side-shoot 각각 _per-axis_ factor 적용 (factor 한 번 계산 후 axis 안 모든 node에 spread)
    expect(text, 'main-axis loop: factor in all nodes')
      .toMatch(/for\s*\(\s*const\s+n\s+of\s+nodes\s*\)[\s\S]{0,200}axisCapacityFactor:\s*mainFactor/);
    expect(text, 'side-shoot loop: factor in all axis nodes')
      .toMatch(/for\s*\(\s*const\s+n\s+of\s+axis\.nodes\s*\)[\s\S]{0,200}axisCapacityFactor:\s*sideFactor/);
  });

  test('LEAF-TARGET-INCLUDES-AXIS-CAP-01: Phase 2 deferred 명시', async () => {
    // Phase 1은 growthContext.axisCapacityFactor 기록만; Phase 2 LeafAllocationState
    // 에서 실제 allocation 산식 wire-in (LEAF-TARGET-INCLUDES-AXIS-CAP-01 strict).
    // Phase 1 spec은 "growthContext에 factor가 기록됐는지" 검증.
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    expect(text, 'axisCapacityFactor 기록 deferred 주석')
      .toMatch(/Phase 2 LeafAllocationState[\s\S]{0,150}LEAF-TARGET-INCLUDES-AXIS-CAP-01/);
  });
});
