// Iter 30 Phase 4 — SideShootAllocation module.
//
// Plan §6 (sleepy-growing-pretzel.md):
//   sideShootAllocationFactor =
//     parentNode.vigor
//     × cultivar.sideShootPotential
//     × apexDominanceReleaseFactor
//     × lightFactor;
//   clamp [0.2, 0.7]
//
// 측지 leaf가 main axis 대비 _명백히_ 작도록 강제. 사용자가 제기한 R3 결함
// 중 핵심.
//
// ★ Dependency-free boundary.

/**
 * Compute side-shoot allocation factor for leaf targetArea modulation.
 *
 * Plan §6: 측지 leaf는 main axis leaf보다 항상 작아야 함 (clamp ≤ 0.7).
 * Floor 0.2로 active 측지가 0이 되지 않게 유지.
 *
 * 입력 의미:
 * - parentNodeVigor: parent main-axis node's vigor (0-1.5, Phase 1 stemVigorFactor)
 * - cultivarSideShootPotential: cultivar.growthProfile.sideShootPotential (0.0-1.0, default 0.4)
 * - apexDominanceReleaseFactor: 0.0-1.0; apex dominance 강하면 0에 가까움
 * - lightFactor: 0.5-1.0; 측지 위치의 빛 노출
 */
export function computeSideShootAllocationFactor(input: {
  parentNodeVigor: number;
  cultivarSideShootPotential: number;
  apexDominanceReleaseFactor: number;
  lightFactor: number;
}): number {
  const raw =
    Math.max(0, input.parentNodeVigor) *
    Math.max(0, Math.min(1, input.cultivarSideShootPotential)) *
    Math.max(0, Math.min(1, input.apexDominanceReleaseFactor)) *
    Math.max(0.5, Math.min(1, input.lightFactor));
  return Math.max(0.2, Math.min(0.7, raw));
}

/**
 * Default helpers — Phase 4 minimum, Phase 5 calibration pack에서 정밀화.
 */
export const DEFAULT_CULTIVAR_SIDE_SHOOT_POTENTIAL = 0.4;

/**
 * Apex dominance release factor — simple proxy based on parent node position.
 * Lower nodes (basal) experience released apex dominance → higher factor.
 * Upper nodes (apical) experience strong dominance → lower factor.
 *
 * Phase 4 minimum proxy. Phase 5 calibration may tune coefficient.
 */
export function computeApexDominanceReleaseFactor(input: {
  parentNodeFracFromApex: number;  // 0 = apex itself, 1 = basal-most
}): number {
  const f = Math.max(0, Math.min(1, input.parentNodeFracFromApex));
  // basal (f=1) → release factor 0.9; apex (f=0) → 0.3
  return 0.3 + 0.6 * f;
}

/**
 * Light factor — simple Lambert-cosine-like proxy.
 * Phase 4: default 0.7 (medium shade for side-shoots).
 * Phase 5 calibration pack may use cultivar-tuned values.
 */
export const DEFAULT_LIGHT_FACTOR = 0.7;

/**
 * Dev-only — clamp 검증.
 */
export function assertSideShootAllocationValid(
  factor: number,
  contextHint?: string,
): void {
  const where = contextHint ? ` (${contextHint})` : '';
  if (!Number.isFinite(factor) || factor < 0.2 - 1e-6 || factor > 0.7 + 1e-6) {
    console.warn(`[SideShootAllocation] factor out of [0.2, 0.7]${where}: ${factor}`);
  }
}
