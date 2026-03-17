import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Controls {
  controls: OrbitControls;

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.controls = new OrbitControls(camera, canvas);
    this.controls.target.set(0, 1.0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.52; // Slightly above ground
    this.controls.minPolarAngle = 0.1;
  }

  focusOnPlant(x: number, heightMeters: number): void {
    this.controls.target.set(x, heightMeters * 0.5, 0);
  }

  update(): void {
    this.controls.update();
  }
}
