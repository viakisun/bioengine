import * as THREE from 'three';
import { getSunState, dayToHour } from './SunPosition';

// Polycarbonate greenhouse transmits ~75-82% of PAR
const GREENHOUSE_TRANSMISSION = 0.78;

export class LightingSystem {
  private sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  private fill: THREE.DirectionalLight;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ── Ambient ──
    // MINIMAL — just enough to prevent pure-black areas
    // Real greenhouse: even shadow areas receive some scattered light
    this.ambient = new THREE.AmbientLight(0xfff8f0, 0.15);
    scene.add(this.ambient);

    // ── Hemisphere ──
    // Sky: warm neutral (polycarbonate scatters + warms daylight)
    // Ground: dark (keeps leaf undersides dark)
    this.hemi = new THREE.HemisphereLight(
      0xe8e4d8,  // sky — warm scattered daylight through polycarbonate
      0x3a3530,  // ground — dark, minimal upward bounce
      0.35,
    );
    scene.add(this.hemi);

    // ── Primary sun (directional) — THE dominant light ──
    // This must be clearly the strongest light source.
    // Everything else is subordinate.
    this.sun = new THREE.DirectionalLight(0xfff8e0, 4.0);
    this.sun.position.set(8, 15, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.camera.left = -6;
    this.sun.shadow.camera.right = 6;
    this.sun.shadow.camera.top = 8;
    this.sun.shadow.camera.bottom = -1;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // ── Fill light ──
    // Very weak — represents light entering from greenhouse side walls
    this.fill = new THREE.DirectionalLight(0xe0dcd0, 0.2);
    this.fill.position.set(-6, 3, -4);
    scene.add(this.fill);

    // Set initial position (noon)
    this.update(12);
  }

  update(hourOfDay: number): void {
    const state = getSunState(hourOfDay);

    // Sun position
    const sunPos = state.direction.clone().multiplyScalar(35);
    this.sun.position.copy(sunPos);
    this.sun.color.copy(state.color);
    // Sun is THE key light — 67%+ of total illumination
    this.sun.intensity = state.intensity * 4.5 * GREENHOUSE_TRANSMISSION;

    // Hemisphere: mild adjustment with time of day
    const skyWarmth = 1 - state.intensity;
    const skyColor = new THREE.Color(0xe8e4d8);
    const sunsetSky = new THREE.Color(0xddaa77);
    skyColor.lerp(sunsetSky, skyWarmth * 0.4);
    this.hemi.color.copy(skyColor);
    this.hemi.intensity = 0.2 + state.intensity * 0.2;

    // Ambient: barely noticeable
    this.ambient.intensity = 0.10 + state.intensity * 0.08;

    // Fill: very subtle
    this.fill.intensity = 0.1 + (1 - state.intensity) * 0.15;
  }

  /** Update from simulation day (fractional) */
  updateFromDay(day: number): void {
    this.update(dayToHour(day));
  }
}

// Backward compatibility
export function setupLighting(scene: THREE.Scene): LightingSystem {
  return new LightingSystem(scene);
}
