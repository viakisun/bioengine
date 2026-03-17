import * as THREE from 'three';

/**
 * Simplified solar position calculator for ~35°N latitude (Korean greenhouse).
 * Maps hour-of-day (6-18) to sun direction, color temperature, and intensity.
 */

const LATITUDE_RAD = 35 * Math.PI / 180;

export interface SunState {
  direction: THREE.Vector3;  // normalized direction TO sun
  color: THREE.Color;
  intensity: number;         // 0-1 (peak at noon)
}

export function getSunState(hourOfDay: number): SunState {
  // Clamp to daylight hours
  const hour = Math.max(5.5, Math.min(18.5, hourOfDay));

  // Hour angle: 0 at noon, negative morning, positive afternoon
  const hourAngle = (hour - 12) * 15 * Math.PI / 180;

  // Simplified solar elevation (assumes equinox-like declination ~0)
  const sinElev = Math.sin(LATITUDE_RAD) * 1.0 + Math.cos(LATITUDE_RAD) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(0, Math.min(1, sinElev)));

  // Azimuth: east at 6AM (π/2), south at noon (0), west at 6PM (-π/2)
  const azimuth = -hourAngle;

  // Direction vector (pointing TO sun from origin)
  const direction = new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  ).normalize();

  // Intensity: peaks at noon, falls off at sunrise/sunset
  const normalizedElev = elevation / (Math.PI / 2); // 0 at horizon, 1 at zenith
  const intensity = Math.pow(Math.max(0, normalizedElev), 0.5);

  // Color temperature: warm at low elevation, neutral at high
  // Sunrise/sunset: ~2500K (orange), Noon: ~5500K (white-yellow)
  const warmth = 1 - normalizedElev; // 1=warm(low sun), 0=neutral(high sun)
  const color = new THREE.Color();

  // Interpolate from warm orange (2500K) to daylight white (5500K)
  const warmColor = new THREE.Color(1.0, 0.65, 0.3);   // 2500K approximation
  const noonColor = new THREE.Color(1.0, 0.97, 0.88);   // 5500K approximation
  color.lerpColors(noonColor, warmColor, warmth * warmth);

  return { direction, color, intensity };
}

/**
 * Map simulation day progress to hour of day.
 * Each sim-day cycles through one daylight period.
 * Using fractional part of day: 0.0=6AM, 0.5=noon, 1.0=6PM
 */
export function dayToHour(dayFraction: number): number {
  const frac = dayFraction - Math.floor(dayFraction);
  return 6 + frac * 12; // 6AM to 6PM
}
