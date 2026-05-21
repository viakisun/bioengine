import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { setupScene, type SceneSetupHandle } from './SceneSetup';
import { setupCamera, type CameraRig } from './CameraRig';
import { buildGreenhouseScene, type GreenhouseSceneHandle } from './GreenhouseScene';
import { useTwinStore } from '../store/twinStore';
import { SCENARIO } from '../data/mockScenario';
import { getSunState, dayToHour } from '@farmsim/tomato-engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { getLabelOverlayHandle } from '../components/LabelOverlay';

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

  let sceneSetup: SceneSetupHandle | null = null;
  try {
    sceneSetup = await setupScene(scene, cameraRig.camera, { backend });
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
    if (s.analysisMode !== prev.analysisMode && greenhouse) {
      greenhouse.showcasePlant.setSegmentationMode(s.analysisMode);
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

      // Publish current label set (showcase plant + robot)
      const labelHandleSet = getLabelOverlayHandle();
      if (labelHandleSet) {
        const showcaseState = greenhouse.showcasePlant.currentState();
        const showcasePos = greenhouse.showcasePlant.root.position;
        const robotPos = greenhouse.robot.currentPosition();
        const robotTask = greenhouse.robot.currentTask();
        const labels: Parameters<typeof labelHandleSet.setLabels>[0] = [];
        if (showcaseState) {
          labels.push({
            id: 'showcase',
            worldX: showcasePos.x,
            worldY: showcaseState.heightCm / 100 + 0.25,
            worldZ: showcasePos.z,
            text: `식물 #${showcaseState.seed.toString().slice(-4)} · ${showcaseState.currentStage.name} · ${showcaseState.heightCm.toFixed(0)}cm`,
            color: '#6ee7b7',
          });
        }
        labels.push({
          id: 'robot',
          worldX: robotPos.x,
          worldY: 1.7,
          worldZ: robotPos.z,
          text: robotTask === 'capturing' ? '🎯 촬영 중'
            : robotTask === 'returning' ? '↩ 복귀'
              : '○ 대기',
          color: robotTask === 'capturing' ? '#fbbf24'
            : robotTask === 'returning' ? '#60a5fa'
              : '#6ee7b7',
        });
        labelHandleSet.setLabels(labels);
      }


      // Drive sun + ambient by the day fraction (one sim-day = one sunlight cycle)
      const sun = sceneSetup?.sun;
      const hemi = sceneSetup?.hemi;
      if (sun && hemi) {
        const hour = dayToHour(state.currentDay);
        const sunState = getSunState(hour);
        sun.direction = new Vector3(-sunState.dir.x, -sunState.dir.y, -sunState.dir.z);
        sun.position = new Vector3(
          sunState.dir.x * 12,
          sunState.dir.y * 12,
          sunState.dir.z * 12
        );
        sun.intensity = 0.8 + sunState.intensity * 3.0;
        sun.diffuse = new Color3(sunState.color.r, sunState.color.g, sunState.color.b);
        // Hemisphere/ambient gets a warmer tint at low sun
        hemi.intensity = 0.25 + sunState.intensity * 0.45;
        hemi.diffuse = new Color3(
          0.85 + sunState.color.r * 0.15,
          0.82 + sunState.color.g * 0.18,
          0.78 + sunState.color.b * 0.22
        );
      }

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

    // Project 3D label positions to 2D screen
    const labelHandle = getLabelOverlayHandle();
    if (labelHandle && greenhouse) {
      const canvasW = engine!.getRenderWidth();
      const canvasH = engine!.getRenderHeight();
      const dpr = engine!.getHardwareScalingLevel();
      const cssW = canvasW * dpr;
      const cssH = canvasH * dpr;
      const transform = scene.getTransformMatrix();
      const viewport = cameraRig.camera.viewport.toGlobal(canvasW, canvasH);
      labelHandle.project((x, y, z) => {
        const projected = Vector3.Project(
          new Vector3(x, y, z),
          Matrix.Identity(),
          transform,
          viewport
        );
        // projected.x/y are in render-target pixels; convert to CSS pixels
        return { x: projected.x / dpr, y: projected.y / dpr, depth: projected.z };
      });
      void cssW; void cssH;
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
