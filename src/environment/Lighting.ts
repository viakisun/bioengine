import * as THREE from 'three';
import { getSunState, dayToHour } from './SunPosition';

const GREENHOUSE_TRANSMISSION = 0.75; // polycarbonate ~75% light transmission

export class LightingSystem {
  private sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  private fill: THREE.DirectionalLight;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Ambient fill (lower for natural lighting)
    this.ambient = new THREE.AmbientLight(0x606860, 0.35);
    scene.add(this.ambient);

    // Hemisphere (sky/ground bounce)
    this.hemi = new THREE.HemisphereLight(0xaaccdd, 0x335522, 0.6);
    scene.add(this.hemi);

    // Sun — dynamic position
    this.sun = new THREE.DirectionalLight(0xfff5e0, 1.8);
    this.sun.position.set(8, 12, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 12;
    this.sun.shadow.camera.bottom = -2;
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun);

    // Fill light — warm ground bounce
    this.fill = new THREE.DirectionalLight(0xf0e0c0, 0.2);
    this.fill.position.set(-4, 2, -3);
    scene.add(this.fill);

    // Set initial position (noon)
    this.update(12);
  }

  update(hourOfDay: number): void {
    const state = getSunState(hourOfDay);

    // Sun position (scale direction to distant point)
    const sunPos = state.direction.clone().multiplyScalar(30);
    this.sun.position.copy(sunPos);
    this.sun.color.copy(state.color);
    this.sun.intensity = state.intensity * 2.2 * GREENHOUSE_TRANSMISSION;

    // Hemisphere sky color shifts with time of day
    const skyWarmth = 1 - state.intensity;
    const skyColor = new THREE.Color(0xaaccdd);
    const sunsetSky = new THREE.Color(0xdd9966);
    skyColor.lerp(sunsetSky, skyWarmth * 0.6);
    this.hemi.color.copy(skyColor);
    this.hemi.intensity = 0.4 + state.intensity * 0.4;

    // Ambient adjusts slightly
    this.ambient.intensity = 0.25 + state.intensity * 0.15;
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
