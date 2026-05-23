import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import type { Material } from '@babylonjs/core/Materials/material';
import { setupScene, type SceneSetupHandle } from './SceneSetup';
import { applyRenderQuality } from './RenderQuality';
import { setupCamera, type CameraRig } from './CameraRig';
import { buildGreenhouseScene, type GreenhouseSceneHandle } from './GreenhouseScene';
import { useTwinStore, type LightingState } from '../store/twinStore';
import { SCENARIO } from '../data/mockScenario';
import { getSunState } from '@farmsim/tomato-engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { setShaderWindEnabled, isShaderWindEnabled } from '../plant/LeafGenerator';
import { getLabelOverlayHandle } from '../components/LabelOverlay';
import { setBootStage, logBoot, setEnvInfo, setEnvCounters, notify } from '../store/notify';
import { setSinglePlantEngineRef, setSinglePlantShowcaseRef } from '../ui/single-plant/useSinglePlantState';

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
  logBoot('log', 'engine: WebGPU 시도');
  if (!(await WebGPUEngine.IsSupportedAsync)) {
    logBoot('warn', 'engine: WebGPU 미지원 (브라우저)');
    return null;
  }
  try {
    const engine = new WebGPUEngine(canvas, {
      antialias: true,
      stencil: true,
    });
    await engine.initAsync();
    return engine;
  } catch (err) {
    console.warn('[BabylonEngine] WebGPU init failed, falling back to WebGL2:', err);
    logBoot('warn', `engine: WebGPU init 실패 — ${err instanceof Error ? err.message : 'unknown'}`);
    return null;
  }
}

/**
 * Extract a human-readable GPU device name from an Engine. WebGL2 reads
 * the WEBGL_debug_renderer_info extension; WebGPU returns its adapter
 * info if available.
 */
function readGpuDevice(engine: Engine | WebGPUEngine): string {
  // WebGPU: adapter info is on the engine itself in Babylon's wrapper
  if (engine instanceof WebGPUEngine) {
    const info = (engine as unknown as { _adapterInfo?: { vendor?: string; architecture?: string } })._adapterInfo;
    if (info?.architecture) return `${info.vendor ?? 'GPU'} (${info.architecture})`;
    return 'WebGPU 어댑터';
  }
  // WebGL2 — UNMASKED_RENDERER_WEBGL via the debug extension
  try {
    const gl = (engine as { _gl?: WebGL2RenderingContext })._gl;
    if (!gl) return '알 수 없음';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
      return renderer || '알 수 없음';
    }
    return gl.getParameter(gl.RENDERER) as string;
  } catch {
    return '알 수 없음';
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

function toneMappingTypeFor(mode: LightingState['toneMapping']): number | null {
  if (mode === 'aces') return ImageProcessingConfiguration.TONEMAPPING_ACES;
  if (mode === 'standard') return ImageProcessingConfiguration.TONEMAPPING_STANDARD;
  return null;
}

/** Push a LightingState snapshot to all relevant scene objects. Idempotent. */
function applyLightingToScene(scene: Scene, setup: SceneSetupHandle, L: LightingState) {
  // Sun direction follows manualHour; intensity + color from store.
  const sunState = getSunState(L.manualHour);
  setup.sun.direction = new Vector3(-sunState.dir.x, -sunState.dir.y, -sunState.dir.z);
  setup.sun.position = new Vector3(sunState.dir.x * 12, sunState.dir.y * 12, sunState.dir.z * 12);
  setup.sun.intensity = L.sunIntensity;
  setup.sun.diffuse = Color3.FromHexString(L.sunColorHex);

  // Hemi + ambient
  setup.hemi.intensity = L.hemiIntensity;
  setup.hemi.diffuse = Color3.FromHexString(L.hemiColorHex);
  setup.hemi.groundColor = Color3.FromHexString(L.hemiGroundColorHex);
  scene.environmentIntensity = L.hdriIntensity;
  scene.ambientColor = new Color3(L.ambientGray, L.ambientGray, L.ambientGray);

  // Shadows (sun.shadowEnabled gates whether any shadow map renders)
  setup.sun.shadowEnabled = L.shadowsEnabled;
  setup.shadowGenerator.darkness = L.shadowDarkness;
  setup.shadowGenerator.bias = L.shadowBias;
  setup.shadowGenerator.normalBias = L.shadowNormalBias;

  // Tone mapping — apply to both scene's config and pipeline's config to
  // avoid the two diverging.
  const tmType = toneMappingTypeFor(L.toneMapping);
  scene.imageProcessingConfiguration.toneMappingEnabled = tmType !== null;
  if (tmType !== null) scene.imageProcessingConfiguration.toneMappingType = tmType;
  scene.imageProcessingConfiguration.exposure = L.exposure;
  scene.imageProcessingConfiguration.contrast = L.contrast;

  const pipeImg = setup.pipeline.imageProcessing;
  if (pipeImg) {
    pipeImg.toneMappingEnabled = tmType !== null;
    if (tmType !== null) pipeImg.toneMappingType = tmType;
    pipeImg.exposure = L.exposure;
    pipeImg.contrast = L.contrast;
    pipeImg.vignetteEnabled = L.vignetteEnabled;
    pipeImg.vignetteWeight = L.vignetteWeight;
  }

  // Bloom / Sharpen
  setup.pipeline.bloomEnabled = L.bloomEnabled;
  setup.pipeline.bloomThreshold = L.bloomThreshold;
  setup.pipeline.bloomWeight = L.bloomWeight;
  setup.pipeline.sharpenEnabled = L.sharpenEnabled;
  setup.pipeline.sharpen.edgeAmount = L.sharpenEdge;

  // SSAO (null on WebGPU — silently skipped)
  if (setup.ssao) {
    setup.ssao.totalStrength = L.ssaoEnabled ? L.ssaoStrength : 0;
    setup.ssao.radius = L.ssaoRadius;
  }
}

export async function createBabylonEngine(canvas: HTMLCanvasElement): Promise<BabylonEngineHandle> {
  console.log('[BabylonEngine] creating engine');
  setBootStage('engine', 'WebGPU 시도', 0.1);

  let engine: Engine | WebGPUEngine | null = await tryWebGPU(canvas);
  let backend: 'webgpu' | 'webgl2' = 'webgpu';

  if (!engine) {
    console.log('[BabylonEngine] using WebGL2 fallback');
    notify.info('WebGPU 미지원', 'WebGL2 로 시작합니다');
    engine = createWebGL2(canvas);
    backend = 'webgl2';
  } else {
    console.log('[BabylonEngine] using WebGPU');
  }
  logBoot('log', `engine: ${backend} 컨텍스트 생성 완료`);

  // Capture environment info for the BootOverlay env panel
  const gpuDevice = readGpuDevice(engine);
  setEnvInfo({
    backend,
    gpuDevice,
    viewport: { w: canvas.width, h: canvas.height },
  });
  logBoot('log', `engine: ${gpuDevice}`);

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
  logBoot('log', 'engine: 카메라 준비 완료');

  setBootStage('setup', 'IBL · 그림자 · SSAO 셋업', 0);
  let sceneSetup: SceneSetupHandle | null = null;
  try {
    sceneSetup = await setupScene(scene, cameraRig.camera, { backend });
    applyLightingToScene(scene, sceneSetup, useTwinStore.getState().lighting);
    logBoot('log', 'setup: 씬 셋업 완료');
  } catch (err) {
    console.error('[BabylonEngine] setupScene failed:', err);
    notify.error('씬 셋업 실패', err instanceof Error ? err : String(err));
  }

  setBootStage('greenhouse', '온실 인프라 빌드 시작', 0);
  let greenhouse: GreenhouseSceneHandle | null = null;
  try {
    greenhouse = await buildGreenhouseScene(scene);
    // Expose this GrowthEngine + ShowcasePlant to the SinglePlant
    // analysis panels — they read both from shared singleton refs.
    setSinglePlantEngineRef(greenhouse.growthEngine);
    setSinglePlantShowcaseRef(greenhouse.showcasePlant);
  } catch (err) {
    console.error('[BabylonEngine] buildGreenhouseScene failed:', err);
    notify.error('온실 빌드 실패', err instanceof Error ? err : String(err));
  }

  // Apply the quality preset (level 10 by default) AFTER greenhouse is
  // built so the shadow generator's caster list — recreated when we
  // upgrade the shadow resolution — picks up every plant/structure mesh.
  if (sceneSetup) {
    setBootStage('quality', '렌더 품질 적용', 0);
    try {
      applyRenderQuality(scene, sceneSetup, engine, useTwinStore.getState().renderFX);
      logBoot('log', 'quality: 렌더 품질 적용 완료');
    } catch (err) {
      console.error('[BabylonEngine] applyRenderQuality boot failed:', err);
      notify.error('렌더 품질 적용 실패', err instanceof Error ? err : String(err));
    }
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

  // Phase 5 — savedRenderQuality holds the user's pre-boost quality
  // so greenhouse-mode 복귀 시 복원할 수 있음. null = 아직 boost 안 됨.
  let savedRenderQuality: number | null = null;

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
    if (s.showSkeleton !== prev.showSkeleton && greenhouse) {
      greenhouse.showcasePlant.setSkeletonMode(s.showSkeleton);
    }
    if (s.lighting !== prev.lighting && sceneSetup) {
      applyLightingToScene(scene, sceneSetup, s.lighting);
    }
    if (s.renderFX !== prev.renderFX && sceneSetup) {
      try {
        applyRenderQuality(scene, sceneSetup, engine, s.renderFX);
      } catch (err) {
        console.error('[BabylonEngine] applyRenderQuality failed:', err);
      }
    }

    // App-mode handler — Phase 1 (Overlay) + Phase 5 (render boost).
    // WebGPU 호환 partial-boost: DOF / MotionBlur 가 WebGPU PrePass
    // 깨뜨리므로 RenderQuality.ts 안에서 자동 스킵 + notify.warn. 나머지
    // FX (shadow 8192 / MSAA 8 / SSAO 32 / 모든 PBR / clearcoat / SSS /
    // grain / glow 등) 는 Lv 10 그대로 활성.
    if (s.mode !== prev.mode && greenhouse) {
      if (s.mode === 'single-plant') {
        greenhouse.setSingleFocusMode(true);
        cameraRig.setPreset('single-plant');
        if (savedRenderQuality === null) savedRenderQuality = prev.renderQuality;
        useTwinStore.getState().setRenderQuality(10);
      } else if (s.mode === 'greenhouse') {
        greenhouse.setSingleFocusMode(false);
        cameraRig.setPreset('overview');
        if (savedRenderQuality !== null) {
          useTwinStore.getState().setRenderQuality(savedRenderQuality);
          savedRenderQuality = null;
        }
      }
    }
  });

  // store.subscribe 는 *변경* 만 감지하므로 directURL (예: #single-plant)
  // 으로 진입했을 때 initial mode 에 대한 핸들러는 fire 안 함. 따라서
  // 부팅 직후 한 번 현재 mode 를 평가해서 setSingleFocusMode 적용.
  if (greenhouse) {
    const initialState = useTwinStore.getState();
    if (initialState.mode === 'single-plant') {
      greenhouse.setSingleFocusMode(true);
      cameraRig.setPreset('single-plant');
      // Phase 5: 자동 quality 10 boost (WebGPU 호환 partial — DOF/
      // MotionBlur 만 RenderQuality 안에서 skip).
      savedRenderQuality = initialState.renderQuality;
      useTwinStore.getState().setRenderQuality(10);
    }
    // Initial skeleton overlay state (Plan 3a) — subscribe only fires
    // on change, so re-apply at boot if the store says true.
    if (initialState.showSkeleton) {
      greenhouse.showcasePlant.setSkeletonMode(true);
    }
  }

  console.log('[BabylonEngine] starting render loop');

  // 'shaders' — first-frame shader compilation. Babylon doesn't expose
  // an explicit progress signal here, so we just mark the stage as
  // active with an indeterminate spinner ('progress' starts at 0.1 so
  // the bar visibly moves). executeWhenReady fires once every async
  // texture/mesh asset has finished loading AND the first frame's
  // shader permutations have compiled.
  setBootStage('shaders', '셰이더 컴파일 (Babylon executeWhenReady 대기)', 0.1);
  scene.executeWhenReady(() => {
    setBootStage('ready', '준비 완료', 1);
    const total = (performance.now() - useTwinStore.getState().boot.startedAt) / 1000;
    logBoot('log', `ready: 총 부팅 ${total.toFixed(2)}초`);
  });

  // Env counters refreshed every 500ms during boot, less often after
  // ready (every 2s — for the dev panel if anyone keeps it open).
  let lastCountersUpdate = 0;

  let lastFpsUpdate = 0;
  let lastDayUpdate = -999;
  let lastPlayTime = performance.now();
  const hudFps = document.getElementById('hud-fps');
  const hudDay = document.getElementById('hud-day');
  const hudRobot = document.getElementById('hud-robot');

  // Resolve cached leaf material once for per-frame wind uniform update
  let cachedLeafMatRef: Material | null = null;
  function getLeafMatForUniform(): Material | null {
    if (!cachedLeafMatRef && scene) {
      cachedLeafMatRef = scene.getMaterialByName('leafMat');
    }
    return cachedLeafMatRef;
  }

  // Reusable interaction-uniform buffers — avoid per-frame allocations.
  // Babylon's Effect.setArray4 requires number[] (not Float32Array).
  const INTERACTION_MAX = 8;
  const interactionFloats: number[] = new Array(INTERACTION_MAX * 4).fill(0);
  let lastInteractionTick = performance.now();

  engine.runRenderLoop(() => {
    const state = useTwinStore.getState();

    // App-mode idle — lobby 일 때는 render tick 전부 skip.
    // 메쉬는 그대로 보존 + render 작업만 정지 → 다시 모드 진입 시
    // 재부팅 없이 즉시 활성.
    if (state.mode === 'lobby') return;

    const now = performance.now();
    const dtInter = (now - lastInteractionTick) / 1000;
    lastInteractionTick = now;

    // Env counter polling — 500ms during boot, 2s after ready.
    const counterInterval = state.boot.currentStage === 'ready' ? 2000 : 500;
    if (now - lastCountersUpdate > counterInterval) {
      lastCountersUpdate = now;
      try {
        let triangles = 0;
        for (const m of scene.meshes) {
          if (m.isEnabled() && m.isVisible) {
            triangles += m.getTotalIndices() / 3;
          }
        }
        const perfMemory = (performance as unknown as {
          memory?: { usedJSHeapSize: number };
        }).memory;
        setEnvCounters({
          meshes: scene.meshes.length,
          triangles: Math.round(triangles),
          textures: scene.textures.length,
          materials: scene.materials.length,
          memoryMB: perfMemory ? Math.round(perfMemory.usedJSHeapSize / 1024 / 1024) : null,
        });
      } catch {
        // ignore — non-fatal
      }
    }

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
            eff.setArray4('interactionData', interactionFloats);
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

      // Sun + ambient are driven by store.lighting (see applyLightingToScene
      // in the subscribe handler) — they no longer follow currentDay here.

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
