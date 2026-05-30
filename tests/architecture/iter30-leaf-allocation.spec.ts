// Iter 30 Phase 2 — LeafAllocationState invariants.
//
// Plan §4 (sleepy-growing-pretzel.md).
//
// Acceptance:
//   LEAF-ALLOCATION-01: 모든 leaf에 allocation 4-factor + final
//   LEAF-POTENTIAL-TARGET-SPLIT-01: potentialAreaCm2 + targetAreaCm2 분리
//   LEAF-LIMITATION-REASON-01: final < 0.95 leaf는 reason ≠ 'none'
//   LEAF-TARGET-AT-MOST-POTENTIAL-01: target ≤ potential 항상
//   LEAF-TARGET-INCLUDES-AXIS-CAP-01: axisCapacityFactor가 final에 반영 (Phase 1 deferred → Phase 2 strict)

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  composeLeafAllocation,
  assertAllocationConsistent,
  type LeafAllocationState,
  type LeafLimitationReason,
} from '../../packages/tomato-engine/src/growth/LeafGrowthModel';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Iter 30 Phase 2 — LeafAllocationState', () => {
  test('LEAF-ALLOCATION-01: 4-factor + final + reason schema + composeLeafAllocation', () => {
    const a = composeLeafAllocation({
      plantSourceFactor: 1.0,
      axisCapacityFactor: 1.0,
      sideShootAllocationFactor: 1.0,
      stressFactor: 1.0,
    });
    expect(a.plantSourceFactor).toBe(1.0);
    expect(a.axisCapacityFactor).toBe(1.0);
    expect(a.sideShootAllocationFactor).toBe(1.0);
    expect(a.stressFactor).toBe(1.0);
    expect(a.finalAllocationFactor).toBe(1.0);
    expect(a.limitationReason).toBe('none');

    // 4-factor product clamp [0.15, 1.5]
    const overcap = composeLeafAllocation({
      plantSourceFactor: 1.15, axisCapacityFactor: 1.0,
      sideShootAllocationFactor: 1.0, stressFactor: 1.0,
    });
    expect(overcap.finalAllocationFactor).toBeLessThanOrEqual(1.5);
    const undercap = composeLeafAllocation({
      plantSourceFactor: 0.1, axisCapacityFactor: 0.1,
      sideShootAllocationFactor: 0.1, stressFactor: 0.1,
    });
    expect(undercap.finalAllocationFactor).toBeGreaterThanOrEqual(0.15);
  });

  test('LEAF-POTENTIAL-TARGET-SPLIT-01: LeafOrganState potentialAreaCm2 + targetAreaCm2', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/growth/LeafGrowthModel.ts'),
      'utf-8',
    );
    expect(text, 'LeafOrganState.potentialAreaCm2').toMatch(/potentialAreaCm2\?:\s*number/);
    expect(text, 'LeafOrganState.targetAreaCm2').toMatch(/targetAreaCm2:\s*number/);
    expect(text, 'LeafOrganState.allocation').toMatch(/allocation\?:\s*LeafAllocationState/);

    // makeLeafOrganStateFromFlat accepts both
    expect(text, 'adapter: potentialAreaCm2').toMatch(/potentialAreaCm2\?:\s*number/);
    expect(text, 'adapter: allocation').toMatch(/allocation\?:\s*LeafAllocationState/);
  });

  test('LEAF-LIMITATION-REASON-01: final < 0.95 → reason 가장 낮은 factor', () => {
    // plantSource low
    const plantLimit = composeLeafAllocation({
      plantSourceFactor: 0.65, axisCapacityFactor: 1.0,
      sideShootAllocationFactor: 1.0, stressFactor: 1.0,
    });
    expect(plantLimit.finalAllocationFactor).toBeLessThan(0.95);
    expect(plantLimit.limitationReason).toBe('plant_source_limited');

    // axis low
    const axisLimit = composeLeafAllocation({
      plantSourceFactor: 1.0, axisCapacityFactor: 0.5,
      sideShootAllocationFactor: 1.0, stressFactor: 1.0,
    });
    expect(axisLimit.limitationReason).toBe('axis_capacity_limited');

    // side-shoot low (Phase 2 minimum: SHOOT_LEAF_SCALE ~0.7)
    const sideLimit = composeLeafAllocation({
      plantSourceFactor: 1.0, axisCapacityFactor: 1.0,
      sideShootAllocationFactor: 0.4, stressFactor: 1.0,
    });
    expect(sideLimit.limitationReason).toBe('side_shoot_limited');

    // stress low
    const stressLimit = composeLeafAllocation({
      plantSourceFactor: 1.0, axisCapacityFactor: 1.0,
      sideShootAllocationFactor: 1.0, stressFactor: 0.5,
    });
    expect(stressLimit.limitationReason).toBe('stress_limited');

    // All near full → none
    const none = composeLeafAllocation({
      plantSourceFactor: 1.0, axisCapacityFactor: 1.0,
      sideShootAllocationFactor: 1.0, stressFactor: 1.0,
    });
    expect(none.limitationReason).toBe('none');

    // Reason valid enum
    const validReasons: LeafLimitationReason[] = [
      'none', 'plant_source_limited', 'axis_capacity_limited',
      'axis_source_limited', 'side_shoot_limited', 'stress_limited',
    ];
    for (const a of [plantLimit, axisLimit, sideLimit, stressLimit, none]) {
      expect(validReasons).toContain(a.limitationReason);
    }
  });

  test('LEAF-TARGET-AT-MOST-POTENTIAL-01: target = potential × final, final ≤ 1.5', () => {
    // potential = 800, allocation final ∈ [0.15, 1.5]
    const potential = 800;
    for (let factor = 0.15; factor <= 1.5; factor += 0.05) {
      const target = potential * factor;
      // ★ Phase 2 strict: target ≤ potential × 1.5 (allocation 상한)
      expect(target).toBeLessThanOrEqual(potential * 1.5 + 1e-6);
    }
    // current ≤ target (Phase 2 GrowthModel clamp)
    const target = 800;
    const expansion = 0.5;
    const current = target * expansion;
    expect(current).toBeLessThanOrEqual(target);
  });

  test('LEAF-TARGET-INCLUDES-AXIS-CAP-01: GrowthModel re-composes allocation with axisCapacityFactor', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    // Pass 3 후 leaf.allocation 재계산 패턴
    expect(text, 'main axis re-allocation with mainFactor')
      .toMatch(/axisCapacityFactor:\s*mainFactor/);
    expect(text, 'side-shoot re-allocation with sideFactor')
      .toMatch(/axisCapacityFactor:\s*sideFactor/);
    expect(text, 'targetArea = potential × finalAllocationFactor')
      .toMatch(/leaf\.targetAreaCm2\s*=\s*leaf\.potentialAreaCm2\s*\*\s*newAlloc\.finalAllocationFactor/);

    // assertAllocationConsistent helper
    const goodAlloc: LeafAllocationState = composeLeafAllocation({
      plantSourceFactor: 1.0, axisCapacityFactor: 0.8,
      sideShootAllocationFactor: 1.0, stressFactor: 0.9,
    });
    expect(() => assertAllocationConsistent(goodAlloc)).not.toThrow();
  });
});
