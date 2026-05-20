import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { setupScene } from './SceneSetup';
import { setupCamera } from './CameraRig';
import { buildSamplePoCScene } from './PoCContent';

import '@babylonjs/core/Helpers/sceneHelpers';
import '@babylonjs/core/Materials/Textures/Loaders';

export interface BabylonEngineHandle {
  scene: Scene;
  engine: Engine | WebGPUEngine;
  backend: 'webgpu' | 'webgl2';
  dispose: () => void;
}

async function tryWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUEngine | null> {
  if (!(await WebGPUEngine.IsSupportedAsync)) return null;
  try {
    const engine = new WebGPUEngine(canvas, {
      antialias: true,
      stencil: true,
    });
    await engine.initAsync();
    return engine;
  } catch (err) {
    console.warn('[BabylonEngine] WebGPU init failed, falling back to WebGL2:', err);
    return null;
  }
}

function createWebGL2(canvas: HTMLCanvasElement): Engine {
  return new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    powerPreference: 'high-performance',
    antialias: true,
  });
}

export async function createBabylonEngine(canvas: HTMLCanvasElement): Promise<BabylonEngineHandle> {
  console.log('[BabylonEngine] creating engine');

  let engine: Engine | WebGPUEngine | null = await tryWebGPU(canvas);
  let backend: 'webgpu' | 'webgl2' = 'webgpu';

  if (!engine) {
    console.log('[BabylonEngine] using WebGL2 fallback');
    engine = createWebGL2(canvas);
    backend = 'webgl2';
  } else {
    console.log('[BabylonEngine] using WebGPU');
  }

  const hudBackend = document.getElementById('hud-backend');
  if (hudBackend) hudBackend.textContent = backend === 'webgpu' ? 'WebGPU' : 'WebGL2';

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.7, 0.85, 1);
  scene.ambientColor = new Color3(0.15, 0.15, 0.15);

  const cameraRig = setupCamera(scene, canvas);
  console.log('[BabylonEngine] camera ready');

  try {
    await setupScene(scene, cameraRig.camera, { backend });
  } catch (err) {
    console.error('[BabylonEngine] setupScene failed:', err);
  }

  try {
    buildSamplePoCScene(scene);
  } catch (err) {
    console.error('[BabylonEngine] buildSamplePoCScene failed:', err);
  }

  console.log('[BabylonEngine] starting render loop');

  let lastFpsUpdate = 0;
  let frameCount = 0;
  const hudFps = document.getElementById('hud-fps');

  engine.runRenderLoop(() => {
    try {
      scene.render();
    } catch (err) {
      if (frameCount === 0) console.error('[BabylonEngine] first frame render error:', err);
    }
    frameCount++;

    const now = performance.now();
    if (hudFps && now - lastFpsUpdate > 250) {
      hudFps.textContent = `${engine!.getFps().toFixed(0)} fps · frames ${frameCount}`;
      lastFpsUpdate = now;
    }
  });

  const onResize = () => engine!.resize();
  window.addEventListener('resize', onResize);

  return {
    scene,
    engine,
    backend,
    dispose() {
      window.removeEventListener('resize', onResize);
      scene.dispose();
      engine!.dispose();
    },
  };
}
