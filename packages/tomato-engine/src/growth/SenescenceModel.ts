// Iter 29 Phase 2A — SenescenceModel module.
//
// Plan §12 (sleepy-growing-pretzel.md):
//   senescenceStartTT = leaf.initiationTT + cultivar.leafLifespanTT × senescenceStartRatio
//   senescenceProgress = normalizedSigmoid(leaf.ageTT - senescenceStartTT, durationTT)
//
// LEAF-SENESCENCE-TT-01: TT-based 완전 전환 (day-based `age > 60` 제거).
// LEAF-SENESCENCE-PLANTBASE-01: PlantBase가 colorDullness, visibleAreaFactor,
//   curl, droop _모두_ 계산. Skin은 _값을 적용만_.
//
// ★ Dependency-free boundary.

import type { LeafSenescenceState } from './LeafGrowthModel';

/**
 * Plan §12 — compute senescenceStartTT.
 * Tomato leaves typically begin senescence at ~70% of total lifespan.
 *
 * @param initiationTT          leaf initiation TT (GDD)
 * @param leafLifespanTT        cultivar lifespan (GDD)
 * @param senescenceStartRatio  fraction of lifespan before senescence (default 0.7)
 */
export function computeSenescenceStartTT(
  initiationTT: number,
  leafLifespanTT: number,
  senescenceStartRatio: number = 0.7,
): number {
  return initiationTT + leafLifespanTT * senescenceStartRatio;
}

/**
 * Plan §12 — sigmoid senescence progress.
 * sigmoid((ageTT - (senescenceStartTT - initiationTT)), durationTT)
 * → since ageTT = currentTT - initiationTT, we use `delta = ageTT - startOffset`
 *   where startOffset = senescenceStartTT - initiationTT.
 *
 * Phase 2A returns 0 if leaf not yet entered senescence.
 *
 * @param ageTT                   leaf age (GDD since initiation)
 * @param senescenceStartOffsetTT (senescenceStartTT - initiationTT) in GDD
 * @param senescenceDurationTT    GDD over which senescence progresses 0→1
 * @param steepness               sigmoid steepness (default 0.012)
 */
export function computeSenescenceProgress(
  ageTT: number,
  senescenceStartOffsetTT: number,
  senescenceDurationTT: number,
  steepness: number = 0.012,
): number {
  const delta = ageTT - senescenceStartOffsetTT;
  if (delta <= 0) return 0;
  // midpoint at half-duration
  const midpoint = senescenceDurationTT * 0.5;
  const x = steepness * (delta - midpoint);
  return Math.max(0, Math.min(1, 1 / (1 + Math.exp(-x))));
}

/**
 * Plan LEAF-SENESCENCE-PLANTBASE-01 — derive colorDullness from progress.
 * Chlorophyll degradation is roughly linear vs progress, with a brief
 * delay before visible yellowing (threshold ~0.15).
 */
export function computeColorDullness(progress: number): number {
  if (progress <= 0.15) return 0;
  return Math.min(1, (progress - 0.15) / 0.7);
}

/**
 * Plan LEAF-SENESCENCE-PLANTBASE-01 — derive visibleAreaFactor.
 * Leaf area visible scales down as senescence advances; floor at 0.15
 * because partial yellowed leaves remain attached.
 */
export function computeVisibleAreaFactor(progress: number): number {
  if (progress <= 0.5) return 1;
  return Math.max(0.15, 1 - (progress - 0.5) * 1.7);
}

/**
 * Plan LEAF-SENESCENCE-PLANTBASE-01 — senescence curl (0..1).
 * Real biology: chlorophyll/turgor loss causes blade margins to curl in.
 */
export function computeSenescenceCurl(progress: number): number {
  if (progress <= 0.2) return 0;
  return Math.min(0.6, (progress - 0.2) * 0.75);
}

/**
 * Plan LEAF-SENESCENCE-PLANTBASE-01 — senescence droop (degrees).
 * Matches existing yellowing × 25 deg legacy formula at progress=1.
 */
export function computeSenescenceDroopDeg(progress: number): number {
  return Math.min(35, progress * 35);
}

/**
 * Build a full LeafSenescenceState from progress alone.
 * One-stop derivation — PlantBase calls this, Skin reads the fields.
 */
export function makeSenescenceState(progress: number): LeafSenescenceState {
  const p = Math.max(0, Math.min(1, progress));
  return {
    progress: p,
    colorDullness: computeColorDullness(p),
    visibleAreaFactor: computeVisibleAreaFactor(p),
    curl: computeSenescenceCurl(p),
    droopDeg: computeSenescenceDroopDeg(p),
  };
}
