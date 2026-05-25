// FruitGrowth — Gillaspy 1993 three-phase tomato fruit development.
//
// References:
//   - Gillaspy, Ben-David, Gruissem 1993, Plant Cell 5:1439-1451
//     (3-phase fruit growth canonical reference)
//   - Anaya-Ramirez 2024, Comput. Electron. Agric.
//     (Gompertz fit to tomato fruit fresh-weight growth)
//   - Marcelis 1996, Frontiers PS 2015 (abortion thresholds)
//
// Three phases:
//   Phase I — Fruit set (anthesis → fertilization), ~7 days, hormonal.
//   Phase II — Cell division (~10-14 days post-anthesis), determines
//              final cell count. Drives early growth.
//   Phase III — Cell expansion (~6-7 weeks), >90% of final volume,
//               water/turgor-driven. Asymptotic.
//   Ripening — ethylene-triggered, fresh weight stable, color changes.
//
// We model phases II + III + ripening with a single Gompertz curve on
// FRESH weight; the dry-weight track is driven by sink allocation
// (Phase 2 SinkAllocation.ts).
//
// Abortion model: a fruit aborts if it consistently fails to keep up
// with potential growth (Marcelis 1996; Frontiers 2015).

import type { Cultivar, CultivarSample } from './Cultivar';
import type { FruitCohort, TrussCohort } from './CoreModel';
import { ACTIVE_BOTANICAL } from './ModelRegistry';

// ─────────────────────────────────────────────────────────────────────
// abortion check 전용 — actual:potential ratio for abortion gate.
// Marcelis 1996 / Frontiers 2015. CoreModel.ts:424 에서만 사용.
// 본 plan에서 변경 없음.
// ─────────────────────────────────────────────────────────────────────

/** Potential fruit fresh weight as a function of GDD since fertilization.
 *
 *  Gompertz: W(t) = a · exp(−exp(−b·(t − τ)))
 *    a = asymptote (potentialMassG, sampled per fruit from cultivar)
 *    b = rate parameter (per GDD)
 *    τ = inflection point (GDD past which growth decelerates)
 *
 *  Reference: Anaya-Ramirez 2024 fits Gompertz to tomato fresh-weight
 *  growth with R² > 0.99 across cultivars.
 */
export function potentialFreshWeight(
  gddSinceFert: number,
  genome: CultivarSample,
  cultivar: Cultivar,
): number {
  if (gddSinceFert <= 0) return 0;
  const a = genome.potentialMassG;
  const b = cultivar.gompertzRateB * genome.ripeningSpeedFactor;
  const totalGrowthGDD = cultivar.cellDivisionDurationGDD + cultivar.cellExpansionDurationGDD;
  const tau = totalGrowthGDD * cultivar.gompertzInflectionC;
  const exponentScale = ACTIVE_BOTANICAL.tomato.fruitDevelopment.gompertz.exponentScaling;
  return a * Math.exp(-Math.exp(-b * (gddSinceFert - tau) * exponentScale));
}

/** Daily potential growth rate (g FW / day) at this point in the
 *  Gompertz curve. Used for abortion threshold (NOT for sink demand).
 */
export function potentialDailyGrowthFW(
  gddSinceFert: number,
  gddPerDay: number,
  genome: CultivarSample,
  cultivar: Cultivar,
): number {
  const w0 = potentialFreshWeight(gddSinceFert, genome, cultivar);
  const w1 = potentialFreshWeight(gddSinceFert + gddPerDay, genome, cultivar);
  return Math.max(0, w1 - w0);
}

// ─────────────────────────────────────────────────────────────────────
// sink-demand limit 전용 (Iter 5b) — Gompertz trajectory가 per-step에서
// 허용하는 최대 DM 증가량을 반환. SinkAllocation으로 전달되어 fruit
// demand의 raw 값을 clamp + CoreModel의 cumulative W_dry trajectory cap.
//
// 기존 abortion 함수와 분리하는 이유:
// - abortion: cultivar (live) + genome (per-fruit sample) 의 mutable 객체에 의존
// - sink-demand: plain GompertzMassParams 만 받아 ACTIVE_BOTANICAL 또는
//   resolvedBotanical에서 합성한 값으로 호출 가능 (cultivar 객체 불요)
// ─────────────────────────────────────────────────────────────────────

/** Gompertz mass-curve parameters. CoreModel이 cultivar +
 *  resolvedBotanical에서 합성해 본 함수들에 전달. */
export interface GompertzMassParams {
  rateB: number;                      // cultivar.gompertzRateB or resolvedBotanical.gompertz.rateB.mu
  inflectionC: number;                // similar
  exponentScaling: number;            // resolvedBotanical.fruitDevelopment.gompertz.exponentScaling
  cellDivisionDurationGDD: number;    // cultivar.cellDivisionDurationGDD
  cellExpansionDurationGDD: number;   // cultivar.cellExpansionDurationGDD
}

/** Gompertz fresh mass (g) at gddSinceFert. 0 if gddSinceFert <= 0.
 *  Bounded above by potentialMassG asymptote.
 *  CoreModel cumulative W_dry trajectory cap 계산에 사용. */
export function potentialFreshMassG(
  gddSinceFert: number,
  potentialMassG: number,
  p: GompertzMassParams,
): number {
  if (gddSinceFert <= 0) return 0;
  const totalGrowthGDD = p.cellDivisionDurationGDD + p.cellExpansionDurationGDD;
  const tau = totalGrowthGDD * p.inflectionC;
  return potentialMassG * Math.exp(-Math.exp(-p.rateB * (gddSinceFert - tau) * p.exponentScaling));
}

/** Step fresh growth (g/step) = freshMass(end of step) - freshMass(start of step).
 *  Always ≥ 0.
 *
 *  daily step: stepGdd = T_eff_day (e.g. 12 GDD @ 22°C)
 *  minutely step: stepGdd = T_eff_per_min (very small)
 *  → 같은 함수로 daily + minutely 양쪽 호출. */
export function potentialStepFreshGrowthG(
  gddSinceFertAtStepEnd: number,
  stepGdd: number,
  potentialMassG: number,
  p: GompertzMassParams,
): number {
  if (stepGdd <= 0) return 0;
  const wEnd = potentialFreshMassG(gddSinceFertAtStepEnd, potentialMassG, p);
  const wStart = potentialFreshMassG(gddSinceFertAtStepEnd - stepGdd, potentialMassG, p);
  return Math.max(0, wEnd - wStart);
}

/** Step dry demand (g/step) = potentialStepFreshGrowthG × fruitDryMatterRatio.
 *  SinkAllocation에 전달되는 per-fruit per-step max demand. */
export function potentialStepDryDemandG(
  gddSinceFertAtStepEnd: number,
  stepGdd: number,
  potentialMassG: number,
  dryMatterRatio: number,
  p: GompertzMassParams,
): number {
  return potentialStepFreshGrowthG(gddSinceFertAtStepEnd, stepGdd, potentialMassG, p)
    * dryMatterRatio;
}

/** Abortion-threshold check. A fruit aborts if its actual:potential
 *  growth ratio sits below `threshold` for `lagDays` consecutive days.
 *
 *  Phase 2 sink allocation already prevents underfed fruit from getting
 *  much DM; this layer turns persistent starvation into outright
 *  abortion (the fruit drops off the plant — Marcelis 1996).
 *
 *  We track the rolling count of "starved days" on the fruit itself
 *  (extension fields below).
 */
export interface AbortionState {
  starvedDays: number;
}

/** Default abortion threshold and lag. Frontiers 2015 reports tomato
 *  fruit abortion triggered at ~25-30% of potential growth for ~3-5
 *  days under low-PAR / high-load conditions. */
// Now sourced from ACTIVE_MODEL.abortion — JSON model spec. Re-exported
// as constants for back-compat with callers that import these names.
import { ACTIVE_MODEL } from './ModelRegistry';

// Iter 6f (SSOT #61): ACTIVE_MODEL.abortion is the global fallback for
// cultivar adapter only. CoreModel must read cultivar.abortion* directly
// (never these legacy const exports). Kept exported for back-compat.
export const ABORTION_THRESHOLD = ACTIVE_MODEL.abortion.threshold_ratio;
export const ABORTION_LAG_DAYS = ACTIVE_MODEL.abortion.lag_days;

/** Decide whether a fruit should abort given its actual recent DM
 *  growth vs potential.
 *
 *  `dtDays` is the integration step size in days. Pass 1.0 for a daily
 *  step, 1/24 for hourly, 1/1440 for minutely. The counter still has
 *  units of days, so the abort threshold is time-resolution invariant.
 *
 *  Iter 6f (SSOT #61): `params` is REQUIRED — caller must pass
 *  cultivar.abortionThresholdRatio + cultivar.abortionLagDays.
 */
export function updateAbortionTracker(
  actualDM: number,
  potentialDM: number,
  previousStarved: number,
  dtDays: number,
  params: { thresholdRatio: number; lagDays: number },
): { starvedDays: number; abort: boolean } {
  // potentialDM=0 의도 (SSOT #61): pre-fruit / early flower OR phase
  // transition 순간에 potential=0이면 "이번 step starvation 카운트 안 함"
  // = ratio=1 fallback 의도. starvedDays 변동 없음.
  if (potentialDM <= 0) {
    return { starvedDays: previousStarved, abort: false };
  }
  const ratio = actualDM / potentialDM;
  if (ratio < params.thresholdRatio) {
    const next = previousStarved + dtDays;
    return { starvedDays: next, abort: next >= params.lagDays };
  }
  // Decay the starved counter when feeding is back to normal.
  // Decay rate matches the integration step so a single full day of
  // healthy feeding cancels a full day of starvation.
  return { starvedDays: Math.max(0, previousStarved - dtDays), abort: false };
}

/** Acropetal ripening offset on a truss (basal earlier than distal).
 *
 *  Reference: Nature Sci Rep 2022 — "metachronous ripening" pattern.
 *  Basal fruit (index 0) opens first and ripens first; distal fruit
 *  (highest index) opens last and ripens last. Total spread within a
 *  truss is `cultivar.trussRipeningSpreadGDD` (7-14 days × GDD/day).
 *
 *  Returns GDD offset to apply to this fruit's ripening clock
 *  (negative = head start; positive = delayed).
 */
export function acropetalGDDOffset(
  fruit: FruitCohort,
  truss: TrussCohort,
  cultivar: Cultivar,
): number {
  if (truss.fruits.length <= 1) return 0;
  const positionFrac = fruit.index / (truss.fruits.length - 1);
  // basal (index 0) → -spread/2, distal → +spread/2
  return (positionFrac - 0.5) * cultivar.trussRipeningSpreadGDD;
}
