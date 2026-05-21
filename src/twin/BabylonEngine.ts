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
import { setShaderWindEnabled, isShaderWindEnabled } from '../plant/LeafGenerator';
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
  useTwinStore.getState().publishBackend(backend);

  // Shader-side wind only supported on WebGL2 (PBRCustomMaterial GLSL
  // injection fails to compile on Babylon 9 WebGPU backend). WebGPU
  // gets a CPU sine fallback later.
  setShaderWindEnabled(backend === 'webgl2');
  console.log(`[BabylonEngine] shader wind: ${isShaderWindEnabled() ? 'ON (WebGL2)' : 'OFF (WebGPU fallback)'}`);

  const scene = new Scene(engine);
  // Light-theme UI background is #e8e6df — pick a slightly cooler creme
  // (more grey-cyan) for the canvas so the bed/plants stand out without
  // a hard edge against the surrounding panels.
  scene.clearColor = new Color4(0.86, 0.87, 0.85, 1);
  scene.ambientColor = new Color3(0.22, 0.22, 0.22);

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
      // Pan the camera to the selected zone's center so clicking a
      // zone card / chip in the UI immediately frames it in 3D.
      if (s.selectedZoneId !== null) {
        const zone = SCENARIO.zones[s.selectedZoneId];
        if (zone) cameraRig.focusZone((zone.startX + zone.endX) / 2);
      }
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

  // Resolve cached leaf material once for per-frame wind uniform update
  let cachedLeafMatRef: any = null;
  function getLeafMatForUniform() {
    if (!cachedLeafMatRef && scene) {
      cachedLeafMatRef = scene.getMaterialByName('leafMat');
    }
    return cachedLeafMatRef;
  }

  // Reusable interaction-uniform buffers — avoid per-frame allocations.
  const INTERACTION_MAX = 8;
  const interactionFloats = new Float32Array(INTERACTION_MAX * 4);
  let lastInteractionTick = performance.now();

  engine.runRenderLoop(() => {
    const state = useTwinStore.getState();

    const now = performance.now();
    const dtInter = (now - lastInteractionTick) / 1000;
    lastInteractionTick = now;

    // Robot contributes a continuous interaction while capturing —
    // the camera head's world position pushes leaves immediately
    // around it. While idle/returning the robot doesn't disturb plants.
    if (greenhouse) {
      const task = greenhouse.robot.currentTask();
      if (task === 'capturing') {
        const rp = greenhouse.robot.currentPosition();
        useTwinStore.getState().addInteraction({
          position: [rp.x, rp.y + 0.6, rp.z],
          radius: 0.55,
          strength: 0.8,
          lifetime: 1.2,
        });
      }
    }
    // Drain stale interactions (age beyond lifetime drops them).
    useTwinStore.getState().tickInteractions(dtInter);

    // Phase D — LOD distance check (10Hz throttled internally).
    if (greenhouse) {
      greenhouse.plantLOD.update(cameraRig.camera.globalPosition);
    }

    // Push wind + interaction uniforms each frame — WebGL2 only.
    // On WebGPU we use the CPU sine fallback further down.
    if (isShaderWindEnabled()) {
      const lm = getLeafMatForUniform();
      if (lm && typeof lm.getEffect === 'function') {
        const eff = lm.getEffect();
        if (eff) {
          eff.setFloat('windTime', now / 1000);
          eff.setFloat('windStrength', state.windStrength);
          eff.setFloat('flutterStrength', state.flutterStrength);
          eff.setVector3(
            'windDir',
            new Vector3(state.windDirection[0], state.windDirection[1], state.windDirection[2])
          );

          // Pack at most INTERACTION_MAX interaction vec4s.
          // w = exp-decayed strength so the shader doesn't need timing.
          const active = state.interactions.slice(0, INTERACTION_MAX);
          for (let i = 0; i < active.length; i++) {
            const p = active[i];
            const decay = Math.exp(-p.age * 2);
            const o = i * 4;
            interactionFloats[o] = p.position[0];
            interactionFloats[o + 1] = p.position[1];
            interactionFloats[o + 2] = p.position[2];
            interactionFloats[o + 3] = p.strength * decay;
          }
          eff.setInt('interactionCount', active.length);
          if (active.length > 0) {
            eff.setArray4('interactionData', interactionFloats as unknown as number[]);
          }
        }
      }
    } else if (greenhouse) {
      // WebGPU fallback — gently rock the plant root TransformNodes so
      // the whole plant breathes. Only z-axis tilt (subtle) so leaves
      // don't appear locked-frame static. Strength is scaled down vs
      // shader path because we're rotating the whole hierarchy.
      const t = now / 1000;
      const baseAmp = 0.012 * state.windStrength;
      const baseFreq = 0.7;
      const showcase = greenhouse.showcasePlant.root;
      const showcaseSway = Math.sin(t * baseFreq + showcase.position.x * 0.3) * baseAmp;
      showcase.rotation.z = showcaseSway;
      showcase.rotation.x = Math.sin(t * baseFreq * 1.3 + showcase.position.z * 0.4) * baseAmp * 0.5;
      for (const sp of greenhouse.supportingPlants) {
        const r = sp.root;
        const phase = r.position.x * 0.25 + r.position.z * 0.4;
        r.rotation.z = Math.sin(t * baseFreq + phase) * baseAmp;
        r.rotation.x = Math.sin(t * baseFreq * 1.3 + phase * 1.7) * baseAmp * 0.5;
      }
    }

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

    if (now - lastFpsUpdate > 250) {
      const fps = engine!.getFps();
      const store = useTwinStore.getState();
      store.publishFps(fps);
      if (greenhouse) {
        const p = greenhouse.robot.currentPosition();
        const task = greenhouse.robot.currentTask();
        store.publishRobotState(p.x, p.z, task);
      }
      // Legacy hud spans — kept for old verify scripts. Cheap text writes.
      if (hudFps) hudFps.textContent = `${fps.toFixed(0)} fps`;
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
