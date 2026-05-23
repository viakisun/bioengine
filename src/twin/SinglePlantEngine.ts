// SinglePlantEngine — lightweight Babylon scene for the single-plant
// analysis mode. One Tomimaru Muchoo plant, diurnal lighting, no
// greenhouse infrastructure (saves ~5000 meshes + 8192 shadow map vs
// the full GreenhouseLayout boot).
//
// Connected to the store via:
//   - singlePlantMinute drives lighting + (eventually) the rendered
//     ShowcasePlant via engine.simulatePlantToMinute.
//   - singlePlantCamera switches camera presets.

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { GrowthEngine, getSunState, type Cultivar } from '@farmsim/tomato-engine';
import { createShowcasePlant, type ShowcasePlantHandle } from './ShowcasePlant';
import { SUBSTRATE_TOP_Y } from './CocopeatBags';

import '@babylonjs/core/Helpers/sceneHelpers';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { setEnvInfo, setEnvCounters } from '../store/notify';

export interface SinglePlantEngineHandle {
  scene: Scene;
  engine: Engine;
  growthEngine: GrowthEngine;
  plant: ShowcasePlantHandle;
  cultivar: Cultivar;
  /** Update the sun direction + intensity for a given fractional hour. */
  setHour: (fracHour: number) => void;
  /** Switch camera preset. */
  setCamera: (preset: 'free' | 'truss' | 'fruit' | 'top') => void;
  dispose: () => void;
}

const PLANT_SEED = 1001;
const CULTIVAR_NAME = 'tomimaru-muchoo';

export function createSinglePlantEngine(canvas: HTMLCanvasElement): SinglePlantEngineHandle {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: 'high-performance',
  });

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.96, 0.96, 0.94, 1);
  scene.ambientColor = new Color3(0.25, 0.25, 0.25);

  // Capture env info for the StatusBar
  let gpuDevice = 'WebGL2';
  try {
    const gl = (engine as { _gl?: WebGL2RenderingContext })._gl;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpuDevice = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
    }
  } catch { /* ignore */ }
  setEnvInfo({
    backend: 'webgl2',
    gpuDevice,
    viewport: { w: canvas.width, h: canvas.height },
  });

  // Camera — arc-rotate around the plant
  const camera = new ArcRotateCamera(
    'spCam',
    Math.PI * 1.05,           // alpha — slightly off-axis
    Math.PI * 0.42,           // beta — looking slightly down
    3.5,                      // radius (m)
    new Vector3(0, 1.2, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 0.6;
  camera.upperRadiusLimit = 8;
  camera.wheelDeltaPercentage = 0.01;
  camera.minZ = 0.05;
  camera.maxZ = 80;
  scene.activeCamera = camera;

  // Lighting — directional sun + hemi ambient
  const sun = new DirectionalLight('spSun', new Vector3(-0.4, -1, -0.3), scene);
  sun.intensity = 3.5;
  sun.diffuse = Color3.FromHexString('#fff5dd');
  sun.position = new Vector3(4, 12, 3);

  const hemi = new HemisphericLight('spHemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.45;
  hemi.diffuse = Color3.FromHexString('#dde6ff');
  hemi.groundColor = Color3.FromHexString('#7a8270');

  // Shadows
  const shadowGen = new ShadowGenerator(2048, sun);
  shadowGen.usePercentageCloserFiltering = true;
  shadowGen.bias = 0.001;
  shadowGen.normalBias = 0.02;

  // Ground — small disc so the plant doesn't look like it's floating
  const ground = MeshBuilder.CreateGround('spGround', { width: 6, height: 6, subdivisions: 2 }, scene);
  const groundMat = new PBRMaterial('spGroundMat', scene);
  groundMat.albedoColor = Color3.FromHexString('#d9d3bf');
  groundMat.metallic = 0;
  groundMat.roughness = 0.92;
  ground.material = groundMat;
  ground.receiveShadows = true;

  // Cocopeat-bag stand-in — a brown puck under the plant root
  const bag = MeshBuilder.CreateCylinder('spBag', { height: 0.2, diameter: 0.55, tessellation: 24 }, scene);
  bag.position = new Vector3(0, 0.1, 0);
  const bagMat = new PBRMaterial('spBagMat', scene);
  bagMat.albedoColor = Color3.FromHexString('#5a4530');
  bagMat.metallic = 0;
  bagMat.roughness = 0.95;
  bag.material = bagMat;

  // Growth engine + plant
  const growthEngine = new GrowthEngine();
  growthEngine.setEnvironment({
    temperatureC: 22,
    humidity: 0.7,
    lightHoursPerDay: 14,
    co2ppm: 800,
    substrateWater: 0.6,
    nutrientEC: 3.0,
  });
  growthEngine.addPlant({ seed: PLANT_SEED, cultivarName: CULTIVAR_NAME });
  const cultivar = growthEngine.getCultivarFor(PLANT_SEED)!;

  const plant = createShowcasePlant(
    scene,
    growthEngine,
    PLANT_SEED,
    new Vector3(0, SUBSTRATE_TOP_Y, 0),
  );
  // Drop any descendant meshes into the shadow caster list
  plant.root.getChildMeshes().forEach((m) => shadowGen.addShadowCaster(m, true));

  // Diurnal sun position — re-derive from the model's SunPosition util
  function setHour(fracHour: number) {
    const sunState = getSunState(fracHour);
    const dir = new Vector3(-sunState.dir.x, -sunState.dir.y, -sunState.dir.z);
    sun.direction = dir;
    sun.position = new Vector3(sunState.dir.x * 12, sunState.dir.y * 12, sunState.dir.z * 12);
    // Sun intensity follows |dir.y| — night drops to ~0
    sun.intensity = Math.max(0.3, 3.5 * Math.max(0, sunState.dir.y));
    // Hemi gets a small night-bump so the plant doesn't go pitch black
    hemi.intensity = 0.3 + Math.max(0, sunState.dir.y) * 0.4;
  }
  setHour(12);

  // Camera presets
  function setCamera(preset: 'free' | 'truss' | 'fruit' | 'top') {
    switch (preset) {
      case 'free':
        camera.target = new Vector3(0, 1.2, 0);
        camera.alpha = Math.PI * 1.05;
        camera.beta = Math.PI * 0.42;
        camera.radius = 3.5;
        break;
      case 'truss':
        camera.target = new Vector3(0, 1.3, 0);
        camera.alpha = Math.PI * 1.15;
        camera.beta = Math.PI * 0.5;
        camera.radius = 1.4;
        break;
      case 'fruit':
        camera.target = new Vector3(0, 1.35, 0);
        camera.alpha = Math.PI * 1.1;
        camera.beta = Math.PI * 0.5;
        camera.radius = 0.5;
        break;
      case 'top':
        camera.target = new Vector3(0, 1.5, 0);
        camera.alpha = 0;
        camera.beta = 0.01;
        camera.radius = 4;
        break;
    }
  }

  let lastCounterTick = 0;
  engine.runRenderLoop(() => {
    scene.render();
    const now = performance.now();
    if (now - lastCounterTick > 1000) {
      lastCounterTick = now;
      let tris = 0;
      for (const m of scene.meshes) {
        if (m.isEnabled() && m.isVisible) tris += m.getTotalIndices() / 3;
      }
      const memory = (performance as unknown as {
        memory?: { usedJSHeapSize: number };
      }).memory;
      setEnvCounters({
        meshes: scene.meshes.length,
        triangles: Math.round(tris),
        textures: scene.textures.length,
        materials: scene.materials.length,
        memoryMB: memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null,
      });
    }
  });

  function onResize() { engine.resize(); }
  window.addEventListener('resize', onResize);

  return {
    scene,
    engine,
    growthEngine,
    plant,
    cultivar,
    setHour,
    setCamera,
    dispose: () => {
      window.removeEventListener('resize', onResize);
      plant.root.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
