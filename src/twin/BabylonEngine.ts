import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { setupScene } from './SceneSetup';
import { setupCamera, type CameraRig } from './CameraRig';
import { buildGreenhouseScene, type GreenhouseSceneHandle } from './GreenhouseScene';
import { useTwinStore } from '../store/twinStore';
import { SCENARIO } from '../data/mockScenario';

import '@babylonjs/core/Helpers/sceneHelpers';
import '@babylonjs/core/Materials/Textures/Loaders';

export interface BabylonEngineHandle {
  scene: Scene;
  engine: Engine | WebGPUEngine;
  cameraRig: CameraRig;
  greenhouse: GreenhouseSceneHandle;
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
  cameraRig.setPreset(useTwinStore.getState().cameraPreset);
  console.log('[BabylonEngine] camera ready');

  try {
    await setupScene(scene, cameraRig.camera, { backend });
  } catch (err) {
    console.error('[BabylonEngine] setupScene failed:', err);
  }

  let greenhouse: GreenhouseSceneHandle | null = null;
  try {
    greenhouse = buildGreenhouseScene(scene);
  } catch (err) {
    console.error('[BabylonEngine] buildGreenhouseScene failed:', err);
  }

  // Bridge zone picking → store
  greenhouse?.onZoneHover((zoneId) => {
    useTwinStore.getState().hoverZone(zoneId);
    if (greenhouse) greenhouse.heatmap.setHoveredZone(zoneId);
  });
  greenhouse?.onZoneClick((zoneId) => {
    if (zoneId !== null) {
      useTwinStore.getState().selectZone(zoneId);
      if (greenhouse) greenhouse.heatmap.setSelectedZone(zoneId);
    }
  });

  // Store subscription — react to changes
  const unsubStore = useTwinStore.subscribe((s, prev) => {
    if (s.selectedZoneId !== prev.selectedZoneId && greenhouse) {
      greenhouse.heatmap.setSelectedZone(s.selectedZoneId);
    }
    if (s.heatmapVisible !== prev.heatmapVisible && greenhouse) {
      greenhouse.heatmap.setVisible(s.heatmapVisible);
    }
    if (s.fovVisible !== prev.fovVisible && greenhouse) {
      greenhouse.robot.setFovVisible(s.fovVisible);
    }
    if (s.pathTrailVisible !== prev.pathTrailVisible && greenhouse) {
      greenhouse.pathTrail.setVisible(s.pathTrailVisible);
    }
    if (s.cameraPreset !== prev.cameraPreset) {
      cameraRig.setPreset(s.cameraPreset);
    }
  });

  console.log('[BabylonEngine] starting render loop');

  let lastFpsUpdate = 0;
  let lastDayUpdate = -999;
  let lastPlayTime = performance.now();
  const hudFps = document.getElementById('hud-fps');
  const hudDay = document.getElementById('hud-day');
  const hudRobot = document.getElementById('hud-robot');

  engine.runRenderLoop(() => {
    const state = useTwinStore.getState();

    const now = performance.now();
    if (state.playing) {
      const dtSec = (now - lastPlayTime) / 1000;
      const newDay = state.currentDay + dtSec * state.playSpeed * 2;
      if (newDay >= SCENARIO.durationDays) {
        useTwinStore.getState().setDay(SCENARIO.durationDays);
        useTwinStore.getState().togglePlay();
      } else {
        useTwinStore.getState().setDay(newDay);
      }
    }
    lastPlayTime = now;

    if (greenhouse && Math.abs(state.currentDay - lastDayUpdate) > 0.05) {
      greenhouse.update(state.currentDay);
      lastDayUpdate = state.currentDay;
    }

    scene.render();

    if (hudFps && now - lastFpsUpdate > 250) {
      hudFps.textContent = `${engine!.getFps().toFixed(0)} fps`;
      if (hudDay) hudDay.textContent = `Day ${state.currentDay.toFixed(0)}`;
      if (hudRobot && greenhouse) {
        const p = greenhouse.robot.currentPosition();
        hudRobot.textContent = `UWB x:${p.x.toFixed(2)}m z:${p.z.toFixed(2)}m`;
      }
      lastFpsUpdate = now;
    }
  });

  const onResize = () => engine!.resize();
  window.addEventListener('resize', onResize);

  return {
    scene,
    engine,
    cameraRig,
    greenhouse: greenhouse!,
    backend,
    dispose() {
      window.removeEventListener('resize', onResize);
      unsubStore();
      scene.dispose();
      engine!.dispose();
    },
  };
}
