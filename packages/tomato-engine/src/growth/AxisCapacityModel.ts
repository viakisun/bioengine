import { createLogger } from '../utils/logger';
const log = createLogger('growth');
// Iter 30 Phase 1 — AxisCapacityModel module.
//
// Plan §3 (sleepy-growing-pretzel.md):
//   각 axis의 structural capacity를 계산해서 node로 전파.
//   targetAreaCm2 산식에 axisCapacityFactor를 곱하면 약한 stem이 큰 잎을
//   키우지 못함.
//
// ★ 정직 표기 (사용자 review 3번):
//   axisStructuralCapacity는 _proxy_, NOT physical load-bearing model.
//   radius²×length×coeff는 transport+support의 coarse 근사. true bending
//   stiffness는 radius⁴ (Euler-Bernoulli), 그러나 cultivar.structuralCapacityCoeff
//   가 mismatch를 흡수. Return value는 unitless (Newton/kg·m 아님).
//
// ★ Dependency-free boundary.

/**
 * ★ Structural capacity _proxy_, NOT a physical load-bearing model.
 *
 * Uses radius² × axis length as a coarse proxy for transport + support
 * capacity. True bending stiffness scales with radius⁴ (Euler-Bernoulli),
 * but the cultivar-driven `structuralCapacityCoeff` absorbs the
 * mismatch and lets calibration pack tune the relationship empirically.
 *
 * The return value is a unitless proxy used to derive
 * `axisCapacityFactor = clamp(proxy / demand, 0.35, 1.0)` — NOT a Newton or
 * kg·m unit.
 *
 * @param meanStemRadiusMm  axis 평균 줄기 반경 (mm)
 * @param axisLengthCm      axis 총 길이 (cm)
 * @param structuralCapacityCoeff  cultivar override (default 1.0)
 */
export function computeAxisStructuralCapacity(input: {
  meanStemRadiusMm: number;
  axisLengthCm: number;
  structuralCapacityCoeff?: number;
}): number {
  const coeff = input.structuralCapacityCoeff ?? 1.0;
  const r = Math.max(0, input.meanStemRadiusMm);
  const L = Math.max(0, input.axisLengthCm);
  return r * r * L * coeff;
}

/**
 * Axis capacity factor — `clamp(capacity / demand, 0.35, 1.0)`.
 *
 * demand가 capacity보다 작으면 1.0 (여유), 크면 비율로 감소 (clamp 0.35
 * floor). targetAreaCm2 계산에 곱셈으로 통합되어 약한 axis의 잎 크기를
 * 자동 억제.
 *
 * Phase 0.A 4-stage 산식에서 `allocationFactor`에 흡수:
 *   allocationFactor = sourceSinkProxyV1 × stressFactor × axisCapacityFactor
 */
export function computeAxisCapacityFactor(input: {
  axisStructuralCapacity: number;
  axisOrganDemand: number;
}): number {
  if (input.axisOrganDemand <= 0) return 1.0;
  return Math.max(0.35, Math.min(1.0,
    input.axisStructuralCapacity / input.axisOrganDemand,
  ));
}

/**
 * Helper — compute axis organ demand as sum of leaf potential areas on axis.
 *
 * Phase 1: leaf demand only. Phase 4+: + truss demand × sinkStrength.
 */
export function computeAxisOrganDemand(input: {
  leafPotentialAreasCm2: readonly number[];
}): number {
  return input.leafPotentialAreasCm2.reduce((s, a) => s + Math.max(0, a), 0);
}

/**
 * Helper — compute mean stem radius across an axis's nodes.
 */
export function computeAxisMeanStemRadius(input: {
  nodeRadiiMm: readonly number[];
}): number {
  if (input.nodeRadiiMm.length === 0) return 0;
  const sum = input.nodeRadiiMm.reduce((s, r) => s + Math.max(0, r), 0);
  return sum / input.nodeRadiiMm.length;
}

/**
 * Helper — compute axis length from node heights (top - bottom).
 * For main-axis nodes, axisLengthCm ≈ max(heightCm) - min(heightCm) + hypocotyl.
 */
export function computeAxisLengthCm(input: {
  nodeHeightsCm: readonly number[];
}): number {
  if (input.nodeHeightsCm.length === 0) return 0;
  const max = Math.max(...input.nodeHeightsCm);
  const min = Math.min(...input.nodeHeightsCm);
  return Math.max(0, max - min);
}

/**
 * Dev-only assertion — axisCapacityFactor ∈ [0.35, 1.0] (Phase 1 AXIS-CAPACITY-FACTOR-CLAMP-01).
 */
export function assertAxisCapacityFactorValid(
  factor: number,
  contextHint?: string,
): void {
  const where = contextHint ? ` (${contextHint})` : '';
  if (!Number.isFinite(factor) || factor < 0.35 - 1e-6 || factor > 1.0 + 1e-6) {
    log.warn(`axisCapacityFactor out of [0.35, 1.0]${where}: ${factor}`);
  }
}
