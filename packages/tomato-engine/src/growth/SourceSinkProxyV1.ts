// Iter 29 Phase 2B — SourceSinkProxyV1 module.
//
// Plan §6.4 (sleepy-growing-pretzel.md):
//   sourceSinkRatio = assimilateSupply / totalOrganDemand
//   sourceSinkProxyV1 = clamp(sourceSinkRatio, 0.65, 1.15)
//
// ★ 정직 표기 (LEAF-SOURCESINK-PROXY-02 강제):
//
//   Lightweight source-sink proxy v1.
//   This is NOT a full TOMSIM/TOMGRO carbon partition model.
//   It only approximates relative organ competition for visual growth state.
//   Future v2 may add light interception, LAI integration, fruit demand cascade.
//
// ★ Dependency-free boundary — pure functions only.
//
// References:
//   - Marcelis 1996 (sink strength theory)
//   - Heuvelink 1996 TOMSIM (inspiration; full carbon partition not modeled here)
//   - Plan §6.4

/**
 * Plan §6.4 — organ demand proxy.
 *
 * Lightweight scalar approximating the "sink" side of the source-sink
 * balance. Phase 2B v1: nodeCount × averageLeafTargetArea + trussCount ×
 * approximateTrussSinkStrength.
 *
 * NOT a full carbon partition model.
 */
export function computeOrganDemand(input: {
  nodeCount: number;
  averageLeafTargetAreaCm2: number;
  trussCount: number;
  /** Cultivar truss sink strength (relative to fruit=1.0). Marcelis 1996. */
  trussSinkStrength?: number;
}): number {
  const trussSink = input.trussSinkStrength ?? 1.0;
  const leafComponent = Math.max(0, input.nodeCount) * Math.max(0, input.averageLeafTargetAreaCm2);
  const trussComponent = Math.max(0, input.trussCount) * trussSink * 100; // 100 = leaf-area-equivalent scale
  return leafComponent + trussComponent;
}

/**
 * Plan §6.4 — assimilate supply proxy.
 *
 * Lightweight scalar approximating the "source" side. Phase 2B v1:
 * heightCm² × baseSupplyCoefficient. Real biology: LAI × incidentLight ×
 * photosynthesisRate × stress, all in Phase 2C+ when calibration pack 갖춘다.
 *
 * NOT a full photosynthesis model.
 */
export function computeAssimilateSupply(input: {
  heightCm: number;
  /** Plant-level water/light/disease stress composite (0..1). */
  stressFactor?: number;
}): number {
  const stress = input.stressFactor ?? 0;
  const baseSupply = Math.max(0, input.heightCm) ** 2 * 0.5;
  return baseSupply * (1 - stress);
}

/**
 * Plan §6.4 — sourceSinkProxyV1.
 *
 *   clamp(supply / demand, 0.65, 1.15)
 *
 * Applied multiplicatively to targetLeafAreaCm2 — pulls down when demand
 * dominates (lots of organs, low supply), pushes up when supply abundant.
 *
 * Phase 2B v1 clamp narrows extreme regime. Phase 5+ calibration may widen.
 *
 * @param supply  computeAssimilateSupply result
 * @param demand  computeOrganDemand result
 * @returns clamped ratio
 */
export function computeSourceSinkProxyV1(supply: number, demand: number): number {
  if (demand <= 0) return 1.0;
  const ratio = supply / demand;
  return Math.max(0.65, Math.min(1.15, ratio));
}

/**
 * Combine the three steps for the canonical path.
 *
 * Phase 2B v1: returns 1.0 when input is degenerate (avoids breaking Phase 2A
 * baseline if used as multiplier in a code path that hasn't migrated yet —
 * LEAF-SOURCESINK-PROXY-03 disable-test invariant).
 *
 * Iter 30 Phase 3: + cultivar.sourceSinkSensitivity 적용 (SOURCESINK-SENSITIVITY-USED-01).
 * sensitivity 높을수록 demand 비중↑ → proxy 낮아짐 → 잎 작아짐.
 */
export function computeSourceSinkProxyV1FromPlant(input: {
  nodeCount: number;
  averageLeafTargetAreaCm2: number;
  trussCount: number;
  trussSinkStrength?: number;
  heightCm: number;
  stressFactor?: number;
  /** Iter 30 Phase 3 — cultivar.growthProfile.sourceSinkSensitivity (default 0.35). */
  sourceSinkSensitivity?: number;
}): number {
  const sensitivity = input.sourceSinkSensitivity ?? 0.35;
  // Demand 가중치 = baseline + sensitivity 보정 (sensitivity 0.35 = 1.0, 0.45 = 1.29)
  const sensitivityMultiplier = sensitivity / 0.35;
  const baseDemand = computeOrganDemand(input);
  const demand = baseDemand * sensitivityMultiplier;
  const supply = computeAssimilateSupply(input);
  return computeSourceSinkProxyV1(supply, demand);
}

// ============================================================
// Iter 30 Phase 3 — Per-axis SourceSinkProxy
// ============================================================

/**
 * Per-axis source-sink proxy.
 *
 * Plan §5 (sleepy-growing-pretzel.md). 측지가 _더 약한 axis_라는 정보가
 * leaf까지 전달되도록 axis 단위로 별도 proxy.
 *
 * supply = stem-volume proxy × parentVigorFactor (측지일 때 parent main axis vigor).
 * demand = axis leaf area + truss demand.
 *
 * Clamp [0.5, 1.15] — main axis 1.15 ceiling 동일, floor 0.5 (측지는 더 낮을 수 있음).
 */
export function computeAxisSourceSinkProxyV1(input: {
  axisLeafCount: number;
  axisAvgLeafTargetAreaCm2: number;
  axisTrussCount: number;
  axisMeanStemRadiusMm: number;
  axisLengthCm: number;
  parentVigorFactor: number;  // side-shoot only; main = 1.0
  /** cultivar.growthProfile.sourceSinkSensitivity */
  sourceSinkSensitivity?: number;
}): number {
  const sensitivity = input.sourceSinkSensitivity ?? 0.35;
  const sensitivityMultiplier = sensitivity / 0.35;

  const baseDemand =
    input.axisLeafCount * input.axisAvgLeafTargetAreaCm2 +
    input.axisTrussCount * 100;
  const demand = baseDemand * sensitivityMultiplier;

  // axis supply = stem-volume proxy × parent vigor (측지가 약한 parent에서 적게 받음)
  const supply =
    input.axisMeanStemRadiusMm * input.axisMeanStemRadiusMm *
    input.axisLengthCm * 0.5 *
    input.parentVigorFactor;

  if (demand <= 0) return 1.0;
  return Math.max(0.5, Math.min(1.15, supply / demand));
}
