import { createLogger } from '../utils/logger';
const log = createLogger('growth');
// Iter 30 Phase 5 — LeafPostureModel module.
//
// Plan §7 (sleepy-growing-pretzel.md), R5 light-facing + gravity droop 분리.
//
// 이전 (Iter 29 Phase 2A까지):
//   posture.droopDeg = droopExtra (legacy weight + age + waterStress + senescence
//                                    합산 _단일_ 스칼라)
// 자연스러운 토마토 잎: 상부광 향한 leaf blade plane ≈ ground-parallel +
// 무게/노화에 따른 처짐.
//
// Phase 5 (Plan §11 + 사용자 권장 9-필드):
//   azimuthDeg                       — phyllotaxy spiral (Phase 0.D stem-local frame)
//   lightSeekingBladePlaneTiltDeg    — blade plane이 ground-parallel 향하는 목표 (상부광 = 0°)
//   lightSeekingNormal               — blade upward normal (보통 (0, 1, 0))
//   petioleBaseElevationDeg          — 마디에서 잎자루 base elevation
//   gravityDroopDeg                  — f(currentArea, rachisLength, age)
//   senescenceDroopDeg               — f(senescence.progress)
//   waterStressDroopDeg              — f(waterStress)
//   finalBladePlaneTiltDeg           — = lightSeekingTilt + finalDroopDeg
//   finalDroopDeg                    — = gravity + senescence + waterStress
//   twistDeg
//   curl (deformation parameter)
//
// ★ Dependency-free boundary.

import type { LeafPostureState } from './LeafGrowthModel';

/**
 * Plan §11 (사용자 권장 v1 산식) — gravity droop from leaf mass + length.
 *
 *   areaRatio = sqrt(currentArea / referenceArea)        — area effect
 *   rachisRatio = pow(rachisLen / referenceRachis, 0.8)  — moment arm effect
 *   gravityDroopDeg = areaRatio × rachisRatio × ageFactor × droopSensitivity × 20°
 *
 * clamp [0, 45°].
 *
 * @param currentAreaCm2  현재 leaf area
 * @param referenceAreaCm2  cultivar reference (default 700)
 * @param rachisLengthM  rachis length (cultivar reference 0.30m default)
 * @param referenceRachisLengthM  cultivar reference
 * @param ageFactor  (1 + ageTT / 1000), clamp [1.0, 1.5]
 * @param droopSensitivity  cultivar.growthProfile.droopSensitivity (default 1.0)
 */
export function computeGravityDroopDeg(input: {
  currentAreaCm2: number;
  referenceAreaCm2?: number;
  rachisLengthM?: number;
  referenceRachisLengthM?: number;
  ageFactor?: number;
  droopSensitivity?: number;
}): number {
  const refArea = input.referenceAreaCm2 ?? 700;
  const refRachis = input.referenceRachisLengthM ?? 0.30;
  const rachisM = input.rachisLengthM ?? 0.30;
  const sens = input.droopSensitivity ?? 1.0;
  const ageF = input.ageFactor ?? 1.0;

  const areaRatio = Math.sqrt(Math.max(0, input.currentAreaCm2) / Math.max(1, refArea));
  const rachisRatio = Math.pow(Math.max(0.01, rachisM) / refRachis, 0.8);
  const raw = areaRatio * rachisRatio * ageF * sens * 20;
  return Math.max(0, Math.min(45, raw));
}

/**
 * Plan §11 — petiole base elevation 산식.
 * Primordium → 35° (가파른 upright)
 * Mature → 12° (수평 가까운 자세)
 */
export function computePetioleBaseElevationDeg(input: {
  expansionProgress: number;  // 0-1
}): number {
  const p = Math.max(0, Math.min(1, input.expansionProgress));
  return 35 - 23 * p;
}

/**
 * Plan §11 — water stress droop.
 *   waterStress 0..1 → 0..30° droop
 */
export function computeWaterStressDroopDeg(waterStress: number): number {
  return Math.max(0, Math.min(30, waterStress * 30));
}

/**
 * Plan §11 (사용자 review 7번 — 부호 일관성) — compose final posture.
 *
 *   finalDroopDeg = gravity + senescence + waterStress  (모두 +로 누적)
 *   finalBladePlaneTiltDeg = lightSeekingBladePlaneTiltDeg + finalDroopDeg
 *     상부광 lightSeeking=0° → blade plane이 처짐만큼 +로 tilt
 *
 * ★ Iter 34 C3 — input azimuthDeg/twistDeg + output 4 deprecated 필드
 *   (azimuthDeg/petioleElevationDeg/droopDeg/twistDeg) 제거. R26 이후 미사용.
 */
export function composePosture(input: {
  lightSeekingBladePlaneTiltDeg?: number;  // 상부광 default 0°
  petioleBaseElevationDeg: number;
  gravityDroopDeg: number;
  senescenceDroopDeg: number;
  waterStressDroopDeg: number;
  curl: number;
}): LeafPostureState {
  const lightTilt = input.lightSeekingBladePlaneTiltDeg ?? 0;
  const finalDroopDeg =
    input.gravityDroopDeg +
    input.senescenceDroopDeg +
    input.waterStressDroopDeg;
  const finalBladePlaneTiltDeg = lightTilt + finalDroopDeg;
  return {
    curl: input.curl,
    // ── Iter 30 Phase 5 — 9-필드 분해 (LeafPostureState 확장) ──
    lightSeekingBladePlaneTiltDeg: lightTilt,
    lightSeekingNormal: { x: 0, y: 1, z: 0 },
    petioleBaseElevationDeg: input.petioleBaseElevationDeg,
    gravityDroopDeg: input.gravityDroopDeg,
    senescenceDroopDeg: input.senescenceDroopDeg,
    waterStressDroopDeg: input.waterStressDroopDeg,
    finalBladePlaneTiltDeg,
    finalDroopDeg,
  };
}

/**
 * Dev-only — Phase 5 posture composition 항등식 검증.
 */
export function assertPostureCompositionValid(
  posture: LeafPostureState,
  contextHint?: string,
): void {
  const where = contextHint ? ` (${contextHint})` : '';
  // Optional fields - check only if defined
  if (
    posture.gravityDroopDeg !== undefined &&
    posture.senescenceDroopDeg !== undefined &&
    posture.waterStressDroopDeg !== undefined &&
    posture.finalDroopDeg !== undefined
  ) {
    const sum = posture.gravityDroopDeg + posture.senescenceDroopDeg + posture.waterStressDroopDeg;
    if (Math.abs(posture.finalDroopDeg - sum) > 1e-6) {
      log.warn(
        `finalDroopDeg=${posture.finalDroopDeg.toFixed(4)} ` +
        `vs sum=${sum.toFixed(4)}${where}`,
      );
    }
  }
  if (
    posture.lightSeekingBladePlaneTiltDeg !== undefined &&
    posture.finalDroopDeg !== undefined &&
    posture.finalBladePlaneTiltDeg !== undefined
  ) {
    const expectedTilt = posture.lightSeekingBladePlaneTiltDeg + posture.finalDroopDeg;
    if (Math.abs(posture.finalBladePlaneTiltDeg - expectedTilt) > 1e-6) {
      log.warn(
        `finalBladePlaneTiltDeg=${posture.finalBladePlaneTiltDeg.toFixed(4)} ` +
        `vs expected=${expectedTilt.toFixed(4)}${where}`,
      );
    }
  }
}
