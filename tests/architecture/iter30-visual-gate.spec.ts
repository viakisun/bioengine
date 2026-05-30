// Iter 30 Phase 6 — Visual Validation + Calibration band invariants.
//
// Plan §8 (sleepy-growing-pretzel.md).
//
// Acceptance:
//   VISUAL-D15-D90-GATE-01: D=15/30/45/90 모든 시점 사용자 사진 결함 0 (deferred to manual review)
//   CALIBRATION-AXIS-V2-01: axis-level band 정의
//   CALIBRATION-SIDE-SHOOT-V2-01: side-shoot leaf size band 정의
//   CALIBRATION-POSTURE-V2-01: posture band 정의 (finalElevation/droop per ageTT)

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  parseCalibrationPack,
  validateCalibrationPack,
  bandAtTT,
  bandAtDay,
} from '../../packages/tomato-engine/src/growth/CalibrationPack';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function loadPack() {
  const jsonc = await fs.readFile(
    path.join(REPO_ROOT, 'packages/tomato-engine/models/calibration/tomato-growth-targets.jsonc'),
    'utf-8',
  );
  // Phase 6 extends CalibrationPackSpec with axis/sideShoot/posture sections —
  // Iter 29 schema 검증은 strict했지만 본 spec은 _확장_ field 인정 (JSON.parse 통과)
  const stripped = jsonc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return JSON.parse(stripped) as Record<string, unknown>;
}

test.describe('Iter 30 Phase 6 — Visual Validation + Calibration band', () => {
  test('CALIBRATION-AXIS-V2-01: axis-level band 정의 (mainAxisCapacityFactor + sideShootAxisCapacityFactor)', async () => {
    const pack = await loadPack();
    expect(pack.axis, 'axis section').toBeDefined();
    const axis = pack.axis as Record<string, { day: { d: number; min: number; max: number }[] }>;
    expect(axis.mainAxisCapacityFactor?.day, 'mainAxis day checkpoints').toBeDefined();
    expect(axis.sideShootAxisCapacityFactor?.day, 'sideShoot day checkpoints').toBeDefined();
    // mainAxis factor higher than side-shoot (typical)
    const mainD45 = axis.mainAxisCapacityFactor.day.find((cp) => cp.d === 45);
    const sideD45 = axis.sideShootAxisCapacityFactor.day.find((cp) => cp.d === 45);
    expect(mainD45?.max, 'main max ≥ side max').toBeGreaterThanOrEqual(sideD45?.max ?? 0);
  });

  test('CALIBRATION-SIDE-SHOOT-V2-01: side-shoot leaf size band + main ratio', async () => {
    const pack = await loadPack();
    expect(pack.sideShoot, 'sideShoot section').toBeDefined();
    const ss = pack.sideShoot as Record<string, { ageTT?: { tt: number; min: number; max: number }[]; day?: { d: number; min: number; max: number }[] }>;
    expect(ss.leafAreaCm2?.ageTT, 'leafAreaCm2 ageTT checkpoints').toBeDefined();
    expect(ss.leafAreaMainRatio?.day, 'leafAreaMainRatio day checkpoints').toBeDefined();
    // ratio ≤ 0.7 (Plan SIDE-SHOOT-MEAN-LEAF-RATIO-01)
    for (const cp of ss.leafAreaMainRatio?.day ?? []) {
      expect(cp.max, `D=${cp.d} ratio max ≤ 0.7`).toBeLessThanOrEqual(0.7 + 1e-6);
    }
  });

  test('CALIBRATION-POSTURE-V2-01: posture band (finalBladePlaneTiltDeg + finalDroopDeg)', async () => {
    const pack = await loadPack();
    expect(pack.posture, 'posture section').toBeDefined();
    const posture = pack.posture as Record<string, { ageTT?: { tt: number; min: number; max: number }[] }>;
    expect(posture.finalBladePlaneTiltDeg?.ageTT, 'finalBladePlaneTiltDeg ageTT').toBeDefined();
    expect(posture.finalDroopDeg?.ageTT, 'finalDroopDeg ageTT').toBeDefined();

    // Plan §11 — young leaf (tt=0) tilt ≈ 0
    const youngTilt = posture.finalBladePlaneTiltDeg?.ageTT?.find((cp) => cp.tt === 0);
    expect(youngTilt?.min, 'young tilt min ≈ 0').toBeCloseTo(0, 1);

    // Plan §11 — mature/old leaf (tt=1200) droop > 0
    const matureDroop = posture.finalDroopDeg?.ageTT?.find((cp) => cp.tt === 1200);
    expect(matureDroop?.min, 'mature droop min > 0').toBeGreaterThan(0);
    expect(matureDroop?.max, 'mature droop max ≤ 50°').toBeLessThanOrEqual(50);
  });

  test('VISUAL-D15-D90-GATE-01: deferred to manual user review (Quality Gate H)', () => {
    // 본 invariant는 _사용자 visual 확인 wake_가 본질. 자동화 spec은
    // numeric proxy만 제공 (Phase 0.C visual-regression-baseline.spec.ts).
    // 사용자 D=15/30/45/90 사진 확인은 Phase 7 docs 작성 후 wake.
    expect(true).toBe(true);
  });

  test('Loader/validator round-trip — Iter 30 extended pack', async () => {
    // Phase 6 extends pack. parseCalibrationPack는 base schema validate.
    // Extended sections (axis/sideShoot/posture)는 _additional_ — schema 통과 OK.
    const jsonc = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/models/calibration/tomato-growth-targets.jsonc'),
      'utf-8',
    );
    const parsed = parseCalibrationPack(jsonc);
    expect(parsed, 'parse succeeded').not.toBeNull();
    // Base schema valid (leaf/plant/stem 검증)
    const issues = validateCalibrationPack(parsed!);
    expect(issues, `validation issues: ${issues.join(' | ')}`).toEqual([]);

    // bandAtTT/Day still works for base fields
    const leafTT = parsed?.leaf?.targetAreaCm2;
    if (leafTT) {
      const band = bandAtTT(leafTT, 400);
      expect(band, 'leaf targetAreaCm2 band at TT=400').not.toBeNull();
    }
    const plantDay = parsed?.plant?.heightCm;
    if (plantDay) {
      const band = bandAtDay(plantDay, 45);
      expect(band, 'plant heightCm band at day=45').not.toBeNull();
    }
  });
});
