// Growth Calibration Platform — status ORDER tables + stageDelta helper.
//
// SSOT 원칙 #17 (status enum ordinality): phenology 비교는 단순
// 일치/불일치가 아닌 stage distance로. visible_bud vs flowering = small gap,
// visible_bud vs green_expanding = significant gap.
//
// stageDelta(order, actual, sim) returns simIndex - actualIndex:
//   +N: simulation이 N stage 앞서감 (빠름)
//    0: 일치
//   -N: simulation이 N stage 뒤짐 (늦음)

import type { TrussStatus, FruitStatus, LeafStatus } from './types';

// ── Status ORDER tables (Schema 6) ────────────────────────────────────

// Single ordered list — accommodates both abstract stages (fruit_expanding,
// ripening) and finer-grained fruit-stage descriptors (small_green,
// green_expanding, breaker, red). Reference Pack CSVs use the granular
// names; engine code may emit either. stageDelta works on whichever value
// is present.
export const TRUSS_STATUS_ORDER: readonly TrussStatus[] = [
  'not_visible',      // 0 — 미발생
  'visible_bud',      // 1 — 화방 봉오리 가시
  'flowering',        // 2 — 개화
  'fruit_set',        // 3 — 착과
  'small_green',      // 4 — 작은 녹과 시기 (early fruit_expanding)
  'green_expanding',  // 5 — 녹과 비대 (fruit_expanding alias)
  'fruit_expanding',  // 6 — 비대 (abstract; same kingdom as green_expanding)
  'breaker',          // 7 — 색 전환 시작 (ripening 시작)
  'ripening',         // 8 — 익는 중 (abstract)
  'red',              // 9 — 적색 완료
  'harvest_ready',    // 10 — 수확 가능
  'senescent',        // 11 — 노화
] as const;

export const FRUIT_STATUS_ORDER: readonly FruitStatus[] = [
  'flower',          // 0 — 꽃
  'fruit_set',       // 1 — 착과
  'small_green',     // 2 — 작은 녹과
  'green_expanding', // 3 — 비대 녹과
  'breaker',         // 4 — 색 전환 시작
  'turning',         // 5 — 색 전환 중
  'red',             // 6 — 적색 완료
  'overripe',        // 7 — 과숙
  'harvested',       // 8 — 수확됨 (terminal)
  'aborted',         // 9 — 낙과 (out-of-band, stageDelta 의미 없음)
] as const;

export const LEAF_STATUS_ORDER: readonly LeafStatus[] = [
  'emerging',        // 0
  'expanding',       // 1
  'expanded',        // 2
  'mature',          // 3
  'senescing',       // 4
  'shed',            // 5 (terminal)
] as const;

// ── stageDelta helper ─────────────────────────────────────────────────

/**
 * Ordinal distance between two status values along the given ORDER table.
 * Returns simIndex - actualIndex:
 *   +N: simulation N stage ahead (faster than real)
 *    0: exact match
 *   -N: simulation N stage behind (slower than real)
 *
 * Returns NaN if either status is not in the order (e.g. 'aborted').
 */
export function stageDelta<T extends string>(
  order: readonly T[], actual: T, simulated: T,
): number {
  const a = order.indexOf(actual);
  const s = order.indexOf(simulated);
  if (a < 0 || s < 0) return NaN;
  return s - a;
}

/**
 * Map a stageDelta magnitude to severity.
 *   |delta| ≤ 1 → 'low'
 *   |delta| === 2 → 'medium'
 *   |delta| ≥ 3 → 'high'
 *
 * NaN → 'high' (out-of-order, treat as severe diagnostic).
 */
export function stageDeltaSeverity(delta: number): 'low' | 'medium' | 'high' {
  if (Number.isNaN(delta)) return 'high';
  const mag = Math.abs(delta);
  if (mag <= 1) return 'low';
  if (mag === 2) return 'medium';
  return 'high';
}

/**
 * Score [0..1] decaying with stage distance. Used by the comparison engine
 * for phenology cells (in addition to numeric similarity).
 *   |delta| = 0 → 1.00
 *   |delta| = 1 → 0.61
 *   |delta| = 2 → 0.37
 *   |delta| = 3 → 0.22
 *   |delta| = 4 → 0.14
 */
export function stageDeltaScore(delta: number): number {
  if (Number.isNaN(delta)) return 0;
  return Math.exp(-Math.abs(delta) / 2);
}

// ── Convenience predicates ────────────────────────────────────────────

export function trussStageDelta(actual: TrussStatus, simulated: TrussStatus): number {
  return stageDelta(TRUSS_STATUS_ORDER, actual, simulated);
}

export function fruitStageDelta(actual: FruitStatus, simulated: FruitStatus): number {
  return stageDelta(FRUIT_STATUS_ORDER, actual, simulated);
}

export function leafStageDelta(actual: LeafStatus, simulated: LeafStatus): number {
  return stageDelta(LEAF_STATUS_ORDER, actual, simulated);
}

/**
 * Check whether a status falls within an inclusive allowed range
 * [allowedMin, allowedMax] along the ORDER table. Used by the comparison
 * engine for "allowed_status_min/max" cells in the reference pack CSVs.
 */
export function statusInRange<T extends string>(
  order: readonly T[],
  value: T,
  allowedMin: T,
  allowedMax: T,
): boolean {
  const v = order.indexOf(value);
  const lo = order.indexOf(allowedMin);
  const hi = order.indexOf(allowedMax);
  if (v < 0 || lo < 0 || hi < 0) return false;
  return v >= lo && v <= hi;
}
