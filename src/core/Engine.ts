import * as THREE from 'three';
import { Controls } from './Controls';

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: Controls;
  clock: THREE.Clock;

  private canvas: HTMLCanvasElement;
  private updatables: Array<{ update(dt: number, elapsed: number): void }> = [];
  private fpsEl: HTMLElement | null;
  private frameCount = 0;
  private fpsTime = 0;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#6090a0');
    this.scene.fog = new THREE.Fog('#6090a0', 40, 90);

    // Camera
    const wrap = this.canvas.parentElement!;
    const aspect = wrap.clientWidth / wrap.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.05, 200);
    this.camera.position.set(2, 1.5, 3);

    // Controls
    this.controls = new Controls(this.camera, this.canvas);

    // Clock
    this.clock = new THREE.Clock();

    // FPS counter
    this.fpsEl = document.getElementById('fps-counter');

    // Resize
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  private onResize(): void {
    const wrap = this.canvas.parentElement!;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  addUpdatable(obj: { update(dt: number, elapsed: number): void }): void {
    this.updatables.push(obj);
  }

  start(): void {
    this.renderer.setAnimationLoop((time) => {
      const dt = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();

      // Update FPS
      this.frameCount++;
      this.fpsTime += dt;
      if (this.fpsTime >= 0.5) {
        const fps = Math.round(this.frameCount / this.fpsTime);
        if (this.fpsEl) this.fpsEl.textContent = `${fps} fps`;
        this.frameCount = 0;
        this.fpsTime = 0;
      }

      // Update all registered objects
      for (const obj of this.updatables) {
        obj.update(dt, elapsed);
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
}
