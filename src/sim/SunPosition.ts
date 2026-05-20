/**
 * Engine-agnostic solar position calculator for ~35°N latitude.
 * Maps hour-of-day (6–18) to sun direction, color, intensity.
 */

const LATITUDE_RAD = (35 * Math.PI) / 180;

export interface SunState {
  /** Direction TO sun from origin (unit vector). */
  dir: { x: number; y: number; z: number };
  /** Sun color in linear RGB (0–1). */
  color: { r: number; g: number; b: number };
  /** Brightness, 0 at horizon → 1 at zenith (gamma-curved). */
  intensity: number;
  /** Hour of day (5.5–18.5). */
  hour: number;
}

export function getSunState(hourOfDay: number): SunState {
  const hour = Math.max(5.5, Math.min(18.5, hourOfDay));
  const hourAngle = ((hour - 12) * 15 * Math.PI) / 180;

  const sinElev =
    Math.sin(LATITUDE_RAD) + Math.cos(LATITUDE_RAD) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(0, Math.min(1, sinElev)));
  const azimuth = -hourAngle;

  const dir = {
    x: Math.cos(elevation) * Math.sin(azimuth),
    y: Math.sin(elevation),
    z: Math.cos(elevation) * Math.cos(azimuth),
  };
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  dir.x /= len;
  dir.y /= len;
  dir.z /= len;

  const normalizedElev = elevation / (Math.PI / 2);
  const intensity = Math.pow(Math.max(0, normalizedElev), 0.5);

  // Warm low sun (2500K) → neutral noon (5500K)
  const warmth = 1 - normalizedElev;
  const w2 = warmth * warmth;
  const color = {
    r: 1.0 * (1 - w2) + 1.0 * w2,
    g: 0.97 * (1 - w2) + 0.65 * w2,
    b: 0.88 * (1 - w2) + 0.3 * w2,
  };

  return { dir, color, intensity, hour };
}

/**
 * Map a simulation day fraction to hour-of-day.
 * 0.0=6AM, 0.5=noon, 1.0=6PM.
 */
export function dayToHour(dayFraction: number): number {
  const frac = dayFraction - Math.floor(dayFraction);
  return 6 + frac * 12;
}
