// Photosynthesis — simplified Goudriaan/Rabbinge canopy model with
// Beer-Lambert light interception.
//
// References:
//   - Goudriaan & van Laar 1994, Modelling Potential Crop Growth
//     Processes (canopy integration recipe)
//   - Heuvelink 1996, Ann. Bot. 77:71–80 (TOMSIM canopy assimilation)
//   - de Pury & Farquhar 1997 (sun/shade canopy — left for Phase A)
//
// Phase 2 scope: bulk-canopy form. Each plant has a single LAI value
// and a single average light absorption / assimilation rate. Phase A
// of the roadmap (after this plan) will swap in proper Farquhar +
// sun/shade leaf partitioning if/when needed.

import type { DailyClimate } from './CoreModel';
import type { HourlyClimate } from './DiurnalEnv';

/** Beer-Lambert canopy light interception fraction.
 *  f_abs = 1 - exp(-k · LAI)
 *  k = 0.7 — standard extinction coefficient for tomato canopy with
 *  spherical leaf angle distribution.
 */
export function canopyAbsorbedFraction(LAI: number, k = 0.7): number {
  if (LAI <= 0) return 0;
  return 1 - Math.exp(-k * LAI);
}

/** Daily gross canopy photosynthesis (g CH2O fixed per m² ground per day).
 *
 * Light-Use-Efficiency (LUE) form, calibrated to TOMSIM observed
 * yields. LUE = 3.5 g DM per mol PAR absorbed is the standard tomato
 * value (Heuvelink 1996 reports 2.8 g DM/MJ PAR = ~3.5 g/mol).
 * Equivalent to the Goudriaan rectangular hyperbola integrated over
 * the canopy when CO2 is enrichment-limited (~800 ppm typical Korean
 * smart farm).
 *
 *   P_gross = LUE · f_abs · PAR_integral_mol
 *   f_abs   = 1 - exp(-k · LAI)
 *
 * @param env Daily climate inputs.
 * @param LAI Leaf area index (m²/m²).
 * @param LUE Light-use efficiency (g DM / mol PAR absorbed). Default
 *            3.5 for protected-culture tomato; CO2 enrichment can push
 *            this to 4.0+.
 * @returns Gross daily assimilation in **g CH2O per m² per day**.
 */
export function dailyGrossAssimilation(
  env: DailyClimate,
  LAI: number,
  LUE = 3.5,
): number {
  if (LAI <= 0 || env.PAR_integral_mol <= 0) return 0;
  const f_abs = canopyAbsorbedFraction(LAI);
  const PAR_abs_mol = env.PAR_integral_mol * f_abs;
  return LUE * PAR_abs_mol;
}

/** Maintenance respiration (g DM / m² / day) — Q10 temperature response.
 *  R_m = sum over organs of (m_i · W_i · Q10^((T-20)/10))
 *  Phase 2: use a single bulk rate. Standard tomato whole-plant
 *  maintenance coefficient is ~0.015 g DM / g DM / day at 20°C with
 *  Q10 = 2.0.
 */
export function maintenanceRespiration(
  W_total_g: number,
  T_avg: number,
  m_ref = 0.015,
  Q10 = 2.0,
): number {
  return W_total_g * m_ref * Math.pow(Q10, (T_avg - 20) / 10);
}

/**
 * Instantaneous gross canopy photosynthesis at the given PAR.
 *
 *   A_canopy [g DM / m² / s]  =  LUE [g/mol] · f_abs · PAR_now [μmol/m²/s] · 1e-6
 *
 * Multiply by seconds in the integration step to get DM accumulated.
 * Per-hour, that's × 3600. This is the hour-grained counterpart of
 * `dailyGrossAssimilation` — both call into the same Beer-Lambert /
 * LUE formulation, just at different time scales.
 */
export function hourlyGrossAssimilation(
  PAR_now_umol: number,
  LAI: number,
  LUE = 3.5,
): number {
  if (LAI <= 0 || PAR_now_umol <= 0) return 0;
  const f_abs = canopyAbsorbedFraction(LAI);
  // μmol/m²/s × f_abs × 3600 s/hr = μmol/m²/hr absorbed → /1e6 = mol/m²/hr
  const PAR_abs_mol_per_hr = (PAR_now_umol * f_abs * 3600) / 1e6;
  return LUE * PAR_abs_mol_per_hr;
}

/** Hourly net new dry matter per plant (g DM / hr).
 *
 *  Same form as `dailyNetDM` but uses the diurnal-sampled instantaneous
 *  PAR + temperature instead of the daily integral. Used by
 *  `stepHourly` for sub-daily time resolution.
 */
export function hourlyNetDM(
  env: HourlyClimate,
  LAI: number,
  W_total_g: number,
  plantFootprintM2 = 0.4,
  Cf = 0.7,
): number {
  const P_gross_per_m2 = hourlyGrossAssimilation(env.PAR_now, LAI);
  const P_gross_per_plant = P_gross_per_m2 * plantFootprintM2;
  // Maintenance respiration uses T_now and is in g/day → divide by 24
  const R_m_per_hr = maintenanceRespiration(W_total_g, env.T_now) / 24;
  return Cf * (P_gross_per_plant - R_m_per_hr);
}

/** Net new dry matter per plant per day (g DM).
 *
 *  ΔW = Cf · (P_gross_canopy_g - R_m)
 *
 *  P_gross is in g DM per m² ground; we treat one plant's footprint
 *  as cultivar-specific (here we let caller pass it explicitly).
 *
 *  @param plantFootprintM2 Effective ground area per plant (m²). Typical
 *                          K-smartfarm density ~2.5 plants/m² → 0.4 m².
 *  @param Cf Conversion efficiency, glucose → biomass. Heuvelink: 0.7.
 */
export function dailyNetDM(
  env: DailyClimate,
  LAI: number,
  W_total_g: number,
  plantFootprintM2 = 0.4,
  Cf = 0.7,
): number {
  const P_gross_per_m2 = dailyGrossAssimilation(env, LAI);
  const P_gross_per_plant = P_gross_per_m2 * plantFootprintM2;
  const R_m = maintenanceRespiration(W_total_g, env.T_avg);
  return Cf * (P_gross_per_plant - R_m);
}
