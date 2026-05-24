// SimulationContext — the slim time/biology bundle that the structural
// path (GrowthModel.computePlantState) consumes so it doesn't have to
// recompute GDD independently of CoreModel.
//
// Why this exists: before v3.0, GrowthModel computed visible node count
// from calendar days (genome.nodeStartDay + genome.nodeInterval), while
// CoreModel computed everything else from GDD. The two clocks drifted
// apart under non-default climates. SimulationContext is the single
// owner of TT — GrowthModel reads it instead of deriving it.
//
// Phase 1: minimal — just `day` and `TT`. Phase 4 grows it to carry
// scenario + training references too.

import type { Cultivar } from './Cultivar';
import type { PlantPhysiologyState } from './CoreModel';
import { ACTIVE_MODEL } from './ModelRegistry';

export interface SimulationContext {
  /** Days since transplant (fractional supported). */
  day: number;
  /** Accumulated growing degree-days above T_base, owned by CoreModel
   *  during true simulation. Structural-only paths receive an
   *  approximation derived from day × mean (T - T_base). */
  TT: number;
  cultivar: Cultivar;
  /** Optional — full physiology state for the same plant at the same
   *  day. When present, callers that need fruit cohort information
   *  (Phase 3+) read it from here instead of overlaying after the fact. */
  physiologyState?: PlantPhysiologyState;
}

/**
 * Approximate TT from a constant air temperature. Used when the
 * caller can only supply a calendar day + ambient temperature (the
 * Greenhouse / multi-plant fast path) and has no live CoreModel state.
 *
 * Matches CoreModel.stepDaily's accumulation under DEFAULT_CLIMATE
 * (constant temperature, daily integration). For diurnal climates the
 * result is within a few percent of the true TT.
 */
export function approximateTT(day: number, T_avg_C: number, cultivar: Cultivar): number {
  const T_eff = Math.max(
    0,
    Math.min(ACTIVE_MODEL.thermalTime.T_max_dev_C, T_avg_C) - cultivar.T_base,
  );
  return Math.max(0, day) * T_eff;
}

/**
 * Phytomer count from accumulated TT under the cultivar's phyllochron
 * (Heuvelink 1996). Returns a fractional value — caller floors it for
 * a discrete node count and uses the fractional part as the newest
 * node's emergence fraction (0..1).
 */
export function phytomerCountFromTT(TT: number, cultivar: Cultivar): number {
  const org = ACTIVE_MODEL.organogenesis;
  const usableTT = Math.max(0, TT - org.TT_at_transplant);
  return org.initialNodeCountAtTransplant + usableTT / cultivar.phyllochronGDD;
}
