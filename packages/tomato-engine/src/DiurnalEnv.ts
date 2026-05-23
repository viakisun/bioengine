// Diurnal environment — derive hour-by-hour PAR + temperature from a
// daily average.
//
// Why we need this: stepDaily integrates net DM from PAR_integral_mol
// over the whole day. For Single-Plant Analysis mode the user wants to
// scrub through hours and see growth respond to the diurnal cycle, so
// we split the daily integral into 24 instantaneous samples using:
//
//   - Air temperature: sinusoid with min at 02:00, max at 14:00.
//     T_now = T_avg + amp · sin(2π · (hour − 8) / 24)
//     Amplitude defaults to 6 °C (greenhouse typical).
//
//   - PAR (photon flux density): sin² envelope over the daylight window,
//     scaled so the time-integral matches PAR_integral_mol exactly.
//     ∫₀^L sin²(π · t / L) dt = L/2 ⇒
//     PAR_peak [μmol m⁻² s⁻¹]  =  PAR_integral_mol · 2 × 10⁶ / (L · 3600)
//     where L = daylight_hours.
//
// References:
//   - Heuvelink 1996 (TOMSIM) uses a similar splitter at the model
//     boundary (daily input → hourly micro-loop).
//   - Spitters 1986, Agric. For. Meteorol. 38:217 — canonical
//     instantaneous-from-daily PAR conversion.
//
// All values are pure functions of (day, hour); no state.

import type { DailyClimate } from './CoreModel';
import { ACTIVE_MODEL } from './ModelRegistry';

export interface HourlyClimate extends DailyClimate {
  /** Current hour of the day, 0..23. */
  hour: number;
  /** Instantaneous PAR at canopy top (μmol m⁻² s⁻¹). */
  PAR_now: number;
  /** Instantaneous air temperature (°C). */
  T_now: number;
}

/** Default amplitude (°C) for the diurnal temperature swing.
 *  Sourced from ACTIVE_MODEL.diurnal.temp_amplitude_C — JSON spec. */
export const DEFAULT_TEMP_AMPLITUDE_C = ACTIVE_MODEL.diurnal.temp_amplitude_C;

/** Hour-of-day at which the temperature curve crosses through T_avg
 *  on the way up. Sourced from ACTIVE_MODEL.diurnal.phase_offset_hours. */
const PHASE_OFFSET_HOURS = ACTIVE_MODEL.diurnal.phase_offset_hours;

/**
 * Compute the instantaneous PAR (μmol m⁻² s⁻¹) at the given hour, given
 * a daily PAR integral. Returns 0 before sunrise / after sunset.
 *
 * The sin² envelope guarantees ∫₀^24 PAR_now(h) · 3600 dh ≈
 *   PAR_integral_mol · 1e6 (within float rounding).
 */
export function parAtHour(
  daylight_hours: number,
  PAR_integral_mol: number,
  hour: number,
): number {
  if (PAR_integral_mol <= 0 || daylight_hours <= 0) return 0;
  // Center the daylight window on solar noon (h=12).
  const sunrise = 12 - daylight_hours / 2;
  const sunset = 12 + daylight_hours / 2;
  if (hour < sunrise || hour > sunset) return 0;
  const t = hour - sunrise;
  // sin² shape — peaks at solar noon, zero at sunrise/sunset.
  const shape = Math.sin((Math.PI * t) / daylight_hours);
  const shapeSq = shape * shape;
  // Scale so the time-integral matches PAR_integral_mol.
  //   PAR_peak · daylight·3600 / 2 [μmol m⁻²]  ==  PAR_integral_mol · 1e6 [μmol m⁻² day⁻¹]
  const PAR_peak = (PAR_integral_mol * 2e6) / (daylight_hours * 3600);
  return PAR_peak * shapeSq;
}

/**
 * Compute the instantaneous air temperature at the given hour.
 *   T(h) = T_avg + amp · sin(2π · (h − 8) / 24)
 * Min at h=2 (T_avg − amp), max at h=14 (T_avg + amp).
 */
export function tempAtHour(
  T_avg: number,
  hour: number,
  amp = DEFAULT_TEMP_AMPLITUDE_C,
): number {
  return T_avg + amp * Math.sin((2 * Math.PI * (hour - PHASE_OFFSET_HOURS)) / 24);
}

/**
 * Project a daily climate to a specific hour of the day, producing an
 * HourlyClimate sample suitable for `stepHourly`. The original daily
 * fields are preserved so downstream code can still query (e.g.) the
 * daily PAR integral.
 */
export function diurnalEnv(daily: DailyClimate, hour: number): HourlyClimate {
  const T_now = tempAtHour(daily.T_avg, hour);
  const PAR_now = parAtHour(daily.daylight_hours, daily.PAR_integral_mol, hour);
  return {
    ...daily,
    hour,
    T_now,
    PAR_now,
  };
}
