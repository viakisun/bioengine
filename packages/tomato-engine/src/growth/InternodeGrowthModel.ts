import { createLogger } from '../utils/logger';
const log = createLogger('growth');
// Iter 29 Phase 1 — InternodeGrowthModel module.
//
// Plan §4.1 (sleepy-growing-pretzel.md):
//   targetInternodeLength = cultivar.baseInternodeLengthCm
//     × nodePositionFactor × temperatureFactor × lightFactor × vigorFactor
//   internode.currentLengthCm = internode.targetLengthCm
//     × expansionCurve(internode.ageTT, internode.expansionDurationTT)
//
// Phase 1 stays _minimum_ — provides the InternodeState struct definition
// + lightweight expansionProgress helper. Existing complex internode
// elongation logic in GrowthModel.ts (Pass 1) remains there for Phase 1.
// Phase 2+ migrates the full computation here.
//
// ★ Module boundary (Phase 1 GROWTH-MODULE-BOUNDARY-01):
//   InternodeState is the canonical structural representation. Existing
//   `node.internodeLenCm` (legacy alias) is preserved for backward compat.

/**
 * Per-phytomer internode state. Phase 1 minimum (3 fields).
 * Phase 2+: add expansionDurationTT, temperatureFactor, vigorFactor.
 */
export interface InternodeState {
  /** Target internode length (cm) — final length once fully elongated. */
  targetLengthCm: number;
  /** Current internode length (cm) — partially elongated value. */
  currentLengthCm: number;
  /** Elongation progress 0..1 (currentLengthCm / targetLengthCm). */
  expansionProgress: number;
}

/**
 * Build an InternodeState from the legacy GrowthModel.ts internodeData
 * computation result. Phase 1 transitional adapter — keeps existing biology
 * unchanged but exposes the canonical 3-field shape on every node.
 *
 * @param finalLen  target internode length (cm) — from existing pass 1
 * @param currentLen current elongated length (cm) — from existing pass 1
 */
export function makeInternodeState(finalLen: number, currentLen: number): InternodeState {
  const target = Math.max(0, finalLen);
  const current = Math.max(0, Math.min(target, currentLen));
  const progress = target > 0 ? current / target : 0;
  return {
    targetLengthCm: target,
    currentLengthCm: current,
    expansionProgress: progress,
  };
}

/**
 * Dev-only invariant — Plan §1 INTERNODE-STATE-01: currentLengthCm ≤ targetLengthCm.
 */
export function assertInternodeStateValid(
  internode: InternodeState,
  contextHint?: string,
): void {
  const where = contextHint ? ` (${contextHint})` : '';
  if (!Number.isFinite(internode.targetLengthCm) || internode.targetLengthCm < 0) {
    log.warn(`targetLengthCm invalid${where}: ${internode.targetLengthCm}`);
    return;
  }
  if (internode.currentLengthCm > internode.targetLengthCm + 1e-6) {
    log.warn(
      `currentLengthCm=${internode.currentLengthCm} ` +
      `> targetLengthCm=${internode.targetLengthCm}${where}`,
    );
  }
}
