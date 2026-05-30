// Iter 30 Phase 5 — Leaf Posture Composition (9-필드) invariants.
//
// Plan §7 (sleepy-growing-pretzel.md), R5 light-facing + gravity 분리.
//
// Acceptance:
//   LEAF-LIGHT-ORIENTATION-01: 상부광 + droop 0 mature leaf finalBladePlaneTiltDeg → 0° 근처
//   LEAF-GRAVITY-DROOP-01: currentArea ↑ → gravityDroopDeg 단조 ↑
//   LEAF-AGE-DROOP-01: 같은 area라도 ageTT ↑ → finalDroopDeg ↑
//   LEAF-POSTURE-COMPOSITION-01: 두 항등식 (finalDroop = sum + finalTilt = lightSeek + finalDroop)
//   LEAF-POSTURE-9-FIELDS-01: 9-필드 schema 모두 정의
//   LEAF-LEGACY-DROOPEXTRA-01: legacy node.droopExtra 보존 (≈ finalDroopDeg)
//   LEAF-POSTURE-SIGN-CONVENTION-01: 부호 일관성 (droop +로 누적)

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  computeGravityDroopDeg,
  computePetioleBaseElevationDeg,
  computeWaterStressDroopDeg,
  composePosture,
  assertPostureCompositionValid,
} from '../../packages/tomato-engine/src/growth/LeafPostureModel';
import type { LeafPostureState } from '../../packages/tomato-engine/src/growth/LeafGrowthModel';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Iter 30 Phase 5 — Leaf Posture Composition (9-필드)', () => {
  test('LEAF-LIGHT-ORIENTATION-01: 상부광 + 0 droop mature leaf → finalBladePlaneTiltDeg ≈ 0°', () => {
    const posture = composePosture({
      azimuthDeg: 0,
      twistDeg: 0,
      lightSeekingBladePlaneTiltDeg: 0,  // 상부광
      petioleBaseElevationDeg: 12,
      gravityDroopDeg: 0,
      senescenceDroopDeg: 0,
      waterStressDroopDeg: 0,
      curl: 0,
    });
    expect(posture.finalBladePlaneTiltDeg).toBe(0);
    expect(posture.finalDroopDeg).toBe(0);
  });

  test('LEAF-GRAVITY-DROOP-01: currentArea 증가 시 gravityDroopDeg 단조 증가', () => {
    let prev = -1;
    for (let area = 0; area <= 1000; area += 100) {
      const droop = computeGravityDroopDeg({
        currentAreaCm2: area,
        referenceAreaCm2: 700,
      });
      expect(droop, `area=${area} droop=${droop}`).toBeGreaterThanOrEqual(prev - 1e-6);
      expect(droop).toBeGreaterThanOrEqual(0);
      expect(droop).toBeLessThanOrEqual(45);
      prev = droop;
    }
    // 큰 area는 더 큰 droop
    const small = computeGravityDroopDeg({ currentAreaCm2: 200, referenceAreaCm2: 700 });
    const large = computeGravityDroopDeg({ currentAreaCm2: 900, referenceAreaCm2: 700 });
    expect(large).toBeGreaterThan(small);
  });

  test('LEAF-AGE-DROOP-01: 같은 area라도 ageTT(ageFactor) 증가 → gravityDroop 증가', () => {
    const young = computeGravityDroopDeg({
      currentAreaCm2: 500, referenceAreaCm2: 700, ageFactor: 1.0,
    });
    const mature = computeGravityDroopDeg({
      currentAreaCm2: 500, referenceAreaCm2: 700, ageFactor: 1.5,
    });
    expect(mature).toBeGreaterThan(young);
  });

  test('LEAF-POSTURE-COMPOSITION-01: 두 항등식 (sum + tilt)', () => {
    const samples = [
      { g: 5, s: 0, w: 0 },
      { g: 10, s: 15, w: 0 },
      { g: 20, s: 10, w: 8 },
      { g: 0, s: 0, w: 0 },
    ];
    for (const { g, s, w } of samples) {
      const p = composePosture({
        azimuthDeg: 60,
        twistDeg: 5,
        lightSeekingBladePlaneTiltDeg: 0,
        petioleBaseElevationDeg: 20,
        gravityDroopDeg: g,
        senescenceDroopDeg: s,
        waterStressDroopDeg: w,
        curl: 0.1,
      });
      const expectedSum = g + s + w;
      expect(p.finalDroopDeg, `gravity+sen+water=${expectedSum} vs final=${p.finalDroopDeg}`)
        .toBeCloseTo(expectedSum, 6);
      expect(p.finalBladePlaneTiltDeg, `lightSeek(0) + finalDroop=${expectedSum} vs tilt=${p.finalBladePlaneTiltDeg}`)
        .toBeCloseTo(0 + expectedSum, 6);
      // assertPostureCompositionValid not throw
      expect(() => assertPostureCompositionValid(p)).not.toThrow();
    }
  });

  test('LEAF-POSTURE-9-FIELDS-01: 9 필드 모두 정의', () => {
    const p = composePosture({
      azimuthDeg: 90, twistDeg: 0,
      lightSeekingBladePlaneTiltDeg: 0,
      petioleBaseElevationDeg: 20,
      gravityDroopDeg: 10, senescenceDroopDeg: 5, waterStressDroopDeg: 2,
      curl: 0.15,
    });
    // 9 필드 (optional이지만 composePosture는 모두 populate)
    expect(p.azimuthDeg).toBeDefined();
    expect(p.lightSeekingBladePlaneTiltDeg).toBeDefined();
    expect(p.lightSeekingNormal).toBeDefined();
    expect(p.petioleBaseElevationDeg).toBeDefined();
    expect(p.gravityDroopDeg).toBeDefined();
    expect(p.senescenceDroopDeg).toBeDefined();
    expect(p.waterStressDroopDeg).toBeDefined();
    expect(p.finalBladePlaneTiltDeg).toBeDefined();
    expect(p.finalDroopDeg).toBeDefined();
    expect(p.twistDeg).toBeDefined();
    expect(p.curl).toBeDefined();

    // LeafPostureState 인터페이스 schema check (source)
    return fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/growth/LeafGrowthModel.ts'),
      'utf-8',
    ).then((text) => {
      expect(text).toMatch(/lightSeekingBladePlaneTiltDeg\?:\s*number/);
      expect(text).toMatch(/lightSeekingNormal\?:/);
      expect(text).toMatch(/petioleBaseElevationDeg\?:\s*number/);
      expect(text).toMatch(/gravityDroopDeg\?:\s*number/);
      expect(text).toMatch(/senescenceDroopDeg\?:\s*number/);
      expect(text).toMatch(/waterStressDroopDeg\?:\s*number/);
      expect(text).toMatch(/finalBladePlaneTiltDeg\?:\s*number/);
      expect(text).toMatch(/finalDroopDeg\?:\s*number/);
    });
  });

  test('LEAF-LEGACY-DROOPEXTRA-01: legacy droopDeg = finalDroopDeg (alias)', () => {
    const p = composePosture({
      azimuthDeg: 0, twistDeg: 0,
      lightSeekingBladePlaneTiltDeg: 0,
      petioleBaseElevationDeg: 12,
      gravityDroopDeg: 10, senescenceDroopDeg: 8, waterStressDroopDeg: 5,
      curl: 0,
    });
    // Legacy alias: droopDeg = finalDroopDeg = 23
    expect(p.droopDeg).toBe(p.finalDroopDeg);
    expect(p.droopDeg).toBe(23);
  });

  test('LEAF-POSTURE-SIGN-CONVENTION-01: droop 양수 누적 시 finalBladePlaneTiltDeg 단조 증가', () => {
    // 부호 일관성: droop이 증가하면 finalBladePlaneTiltDeg도 증가
    const samples: { g: number; expected: number }[] = [
      { g: 0, expected: 0 },
      { g: 5, expected: 5 },
      { g: 10, expected: 10 },
      { g: 20, expected: 20 },
      { g: 30, expected: 30 },
    ];
    for (const { g, expected } of samples) {
      const p = composePosture({
        azimuthDeg: 0, twistDeg: 0,
        lightSeekingBladePlaneTiltDeg: 0,
        petioleBaseElevationDeg: 12,
        gravityDroopDeg: g, senescenceDroopDeg: 0, waterStressDroopDeg: 0,
        curl: 0,
      });
      expect(p.finalBladePlaneTiltDeg).toBeCloseTo(expected, 6);
    }
    // 단조 증가 verify
    let prev = -1;
    for (const { g } of samples) {
      const p = composePosture({
        azimuthDeg: 0, twistDeg: 0,
        lightSeekingBladePlaneTiltDeg: 0,
        petioleBaseElevationDeg: 12,
        gravityDroopDeg: g, senescenceDroopDeg: 0, waterStressDroopDeg: 0,
        curl: 0,
      });
      expect(p.finalBladePlaneTiltDeg).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = p.finalBladePlaneTiltDeg!;
    }
  });

  test('Helpers — petioleBaseElevation + waterStressDroop sanity', () => {
    // primordium (progress=0) → 35°
    expect(computePetioleBaseElevationDeg({ expansionProgress: 0 })).toBeCloseTo(35, 4);
    // mature (progress=1) → 12°
    expect(computePetioleBaseElevationDeg({ expansionProgress: 1 })).toBeCloseTo(12, 4);
    // mid → 23.5°
    expect(computePetioleBaseElevationDeg({ expansionProgress: 0.5 })).toBeCloseTo(23.5, 4);

    // waterStress 0 → 0°
    expect(computeWaterStressDroopDeg(0)).toBe(0);
    // waterStress 1 → 30°
    expect(computeWaterStressDroopDeg(1)).toBe(30);
    // waterStress 0.5 → 15°
    expect(computeWaterStressDroopDeg(0.5)).toBe(15);
  });
});
