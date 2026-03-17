import * as THREE from 'three';
import { Controls } from './Controls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: Controls;
  clock: THREE.Clock;
  composer: EffectComposer;

  private canvas: HTMLCanvasElement;
  private updatables: Array<{ update(dt: number, elapsed: number): void }> = [];
  private fpsEl: HTMLElement | null;
  private frameCount = 0;
  private fpsTime = 0;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;

    // Renderer — high-quality natural lighting
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tone mapping applied by OutputPass (reads from renderer settings)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87CEEB');
    this.scene.fog = new THREE.Fog('#b0d8ef', 50, 120);

    // Generate procedural sky environment map for IBL
    this.setupEnvironmentMap();

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

    // ══════════════════════════════════════
    // Post-processing pipeline
    // ══════════════════════════════════════
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;

    this.composer = new EffectComposer(this.renderer);

    // 1. Render the scene
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // 2. Bloom — subtle glow on bright areas (sky through leaves, sun highlights)
    //    Makes it look like a camera captured the scene, not a CG render
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.15,   // strength — very subtle! just enough for highlights
      0.4,    // radius — how far bloom spreads
      0.85,   // threshold — only the brightest areas bloom
    );
    this.composer.addPass(bloomPass);

    // 3. Output pass — applies tone mapping and color space conversion
    //    Reads toneMapping/exposure from renderer settings
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    // Resize
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  private onResize(): void {
    const wrap = this.canvas.parentElement!;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  addUpdatable(obj: { update(dt: number, elapsed: number): void }): void {
    this.updatables.push(obj);
  }

  /**
   * Create a procedural sky environment map for realistic indirect lighting (IBL).
   */
  private setupEnvironmentMap(): void {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileCubemapShader();

    const envScene = new THREE.Scene();

    const skyGeo = new THREE.SphereGeometry(50, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor:    { value: new THREE.Color(0.35, 0.50, 0.75) },
        horizonColor:{ value: new THREE.Color(0.65, 0.65, 0.62) },
        bottomColor: { value: new THREE.Color(0.12, 0.10, 0.07) },
        sunColor:    { value: new THREE.Color(1.0, 0.95, 0.85) },
        sunDir:      { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
        sunIntensity:{ value: 1.0 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        uniform float sunIntensity;
        varying vec3 vWorldPosition;
        void main() {
          vec3 dir = normalize(vWorldPosition);
          float y = dir.y;
          vec3 sky;
          if (y > 0.0) {
            float t = pow(y, 0.4);
            sky = mix(horizonColor, topColor, t);
          } else {
            float t = pow(-y, 0.6);
            sky = mix(horizonColor, bottomColor, t);
          }
          float sunDot = max(0.0, dot(dir, sunDir));
          float sunGlow = pow(sunDot, 8.0) * sunIntensity * 0.5;
          float sunDisc = pow(sunDot, 256.0) * sunIntensity * 3.0;
          sky += sunColor * (sunGlow + sunDisc);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(skyMesh);

    const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
    this.scene.environment = envMap;

    pmremGenerator.dispose();
    skyMat.dispose();
    skyGeo.dispose();
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
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

      // Render through post-processing pipeline
      // Toggle: use composer for Bloom+ToneMapping, or direct render for debug
      // Render through post-processing pipeline (Bloom + ToneMapping)
      this.composer.render();
    });
  }
}
