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
 */
export function computeSourceSinkProxyV1FromPlant(input: {
  nodeCount: number;
  averageLeafTargetAreaCm2: number;
  trussCount: number;
  trussSinkStrength?: number;
  heightCm: number;
  stressFactor?: number;
}): number {
  const demand = computeOrganDemand(input);
  const supply = computeAssimilateSupply(input);
  return computeSourceSinkProxyV1(supply, demand);
}
