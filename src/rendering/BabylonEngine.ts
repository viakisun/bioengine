import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import type { Material } from '@babylonjs/core/Materials/material';
import { setupScene, type SceneSetupHandle } from './SceneSetup';
import { applyRenderQuality } from './RenderQuality';
import { setupCamera, type CameraRig } from './CameraRig';
import { buildSceneInfrastructure, type SceneInfrastructureHandle } from './SceneInfrastructure';
// Iter 35: GreenhouseContent (zones/heatmap/robot/path/supporting) + ProgressiveLoad
//   제거 — single-plant only (Phase B+C, 사용자 결정).
import { createQualityProbe, type QualityProbeHandle } from './QualityProbe';
import { useTwinStore, type LightingState } from '../store/twinStore';
import { SCENARIO } from '../data/mockScenario';
import { getSunState } from '@farmsim/tomato-engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { setShaderWindEnabled, isShaderWindEnabled } from '../plant/LeafGenerator';
// Iter 35: LabelOverlay archived — single-plant only.
// Iter 20 — hotkey for petiole-stem junction overlay ('d'/'D'/'ㅇ').
import { installDockingOverlayHotkey } from './dockingOverlay/hotkeyToggle';
import { setBootStage, logBoot, setEnvInfo, setEnvCounters, notify } from '../store/notify';
import { setSinglePlantEngineRef, setSinglePlantSkinMeshRef } from '../ui/single-plant/useSinglePlantState';
import { createLogger } from '../utils/logger';
const log = createLogger('engine');

import '@babylonjs/core/Helpers/sceneHelpers';
import '@babylonjs/core/Materials/Textures/Loaders';

export interface BabylonEngineHandle {
  scene: Scene;
  engine: Engine | WebGPUEngine;
  cameraRig: CameraRig;
  greenhouse: SceneInfrastructureHandle;
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
    log.warn('WebGPU init failed, falling back to WebGL2:', err);
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
  log.debug('creating engine');
  setBootStage('engine', 'WebGPU 시도', 0.1);

  let engine: Engine | WebGPUEngine | null = await tryWebGPU(canvas);
  let backend: 'webgpu' | 'webgl2' = 'webgpu';

  if (!engine) {
    log.debug('using WebGL2 fallback');
    notify.info('WebGPU 미지원', 'WebGL2 로 시작합니다');
    engine = createWebGL2(canvas);
    backend = 'webgl2';
  } else {
    log.debug('using WebGPU');
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
  // Iter 20 PR 6 — install 'd'/'D'/'ㅇ' hotkey toggle for docking overlay.
  installDockingOverlayHotkey();

  // Shader-side wind only supported on WebGL2 (PBRCustomMaterial GLSL
  // injection fails to compile on Babylon 9 WebGPU backend). WebGPU
  // gets a CPU sine fallback later.
  setShaderWindEnabled(backend === 'webgl2');
  log.debug(`shader wind: ${isShaderWindEnabled() ? 'ON (WebGL2)' : 'OFF (WebGPU fallback)'}`);

  const scene = new Scene(engine);
  // Light-theme UI background is #e8e6df — pick a slightly cooler creme
  // (more grey-cyan) for the canvas so the bed/plants stand out without
  // a hard edge against the surrounding panels.
  scene.clearColor = new Color4(0.86, 0.87, 0.85, 1);
  scene.ambientColor = new Color3(0.22, 0.22, 0.22);

  // dev 진단 편의 — playwright / DevTools 에서 scene/engine/store 접근 가능.
  // + qualityProbe() — q7↔q8 fps 폭락 원인 분석 (single-plant 모드 진입 후
  //   DevTools 에서 `__farmsim.qualityProbe()` 한 줄로 트리거).
  let qualityProbe: QualityProbeHandle | null = null;
  (globalThis as { __farmsim?: unknown; __twinStore?: unknown }).__farmsim = {
    engine,
    scene,
    qualityProbe(): Promise<void> {
      if (!qualityProbe) {
        if (!sceneSetup) {
          log.warn('sceneSetup 미완료 — 부팅 후 다시 시도');
          return Promise.resolve();
        }
        qualityProbe = createQualityProbe({
          scene,
          engine,
          sceneSetup,
          progressiveIsRunning: () => false, // Iter 35: ProgressiveLoad 제거
        });
      }
      return qualityProbe.start();
    },
    isProbeRunning(): boolean {
      return qualityProbe?.isRunning() ?? false;
    },
  };
  (globalThis as { __twinStore?: unknown }).__twinStore = useTwinStore;

  const cameraRig = setupCamera(scene, canvas);
  cameraRig.setPreset(useTwinStore.getState().cameraPreset);
  // Dev-only: expose scene + camera for headless capture / debugging.
  if (import.meta.env?.DEV) {
    (globalThis as { __scene?: unknown }).__scene = scene;
    (globalThis as { __camera?: unknown }).__camera = cameraRig.camera;
    // Plant Morphology Engine — Leaf Module v0.1 dev hook.
    // Playwright + DevTools entry point for V9-V12 verification.
    void import('../plant/leaf/devHook').then((m) => {
      (globalThis as { __leafModule?: unknown }).__leafModule = m.makeLeafModuleDevHook(scene);
    });
  }
  log.debug('camera ready');
  logBoot('log', 'engine: 카메라 준비 완료');

  setBootStage('setup', 'IBL · 그림자 · SSAO 셋업', 0);
  let sceneSetup: SceneSetupHandle | null = null;
  try {
    sceneSetup = await setupScene(scene, cameraRig.camera, { backend });
    applyLightingToScene(scene, sceneSetup, useTwinStore.getState().lighting);
    logBoot('log', 'setup: 씬 셋업 완료');
  } catch (err) {
    log.error('setupScene failed:', err);
    notify.error('씬 셋업 실패', err instanceof Error ? err : String(err));
  }

  setBootStage('greenhouse', '온실 인프라 빌드 시작', 0);
  let greenhouse: SceneInfrastructureHandle | null = null;
  try {
    greenhouse = await buildSceneInfrastructure(scene);
    setSinglePlantEngineRef(greenhouse.growthEngine);
    setSinglePlantSkinMeshRef(greenhouse.skinMeshPlant);
  } catch (err) {
    log.error('buildSceneInfrastructure failed:', err);
    notify.error('Scene 빌드 실패', err instanceof Error ? err : String(err));
  }

  // Iter 35: ProgressiveLoad + applyMode + greenhouseContent 제거 — single-plant only.
  //   환경/quality 즉시 적용 (사용자 결정). greenhouseContent는 mount 안 함.
  function applyInitialMode(): void {
    cameraRig.setPreset('single-plant');
  }

  // Apply the quality preset AFTER greenhouse is built so the shadow
  // generator's caster list — recreated when we upgrade the shadow
  // resolution — picks up every plant/structure mesh.
  if (sceneSetup) {
    setBootStage('quality', '렌더 품질 적용', 0);
    try {
      applyRenderQuality(scene, sceneSetup, engine, useTwinStore.getState().renderFX);
      logBoot('log', 'quality: 렌더 품질 적용 완료');
    } catch (err) {
      log.error('applyRenderQuality boot failed:', err);
      notify.error('렌더 품질 적용 실패', err instanceof Error ? err : String(err));
    }
  }

  // Store subscription — react to changes
  // Iter 35: greenhouseContent 분기 (zone/heatmap/fov/pathTrail) 모두 제거 — single-plant only.
  const unsubStore = useTwinStore.subscribe((s, prev) => {
    if (s.cameraPreset !== prev.cameraPreset) {
      cameraRig.setPreset(s.cameraPreset);
    }
    if (s.analysisMode !== prev.analysisMode && greenhouse) {
      greenhouse.skinMeshPlant.setSegmentationMode(s.analysisMode);
    }
    if (s.showSkeleton !== prev.showSkeleton && greenhouse) {
      greenhouse.skinMeshPlant.setSkeletonMode(s.showSkeleton);
    }
    if (s.skeleton !== prev.skeleton && greenhouse) {
      greenhouse.skinMeshPlant.setSkeletonConfig(s.skeleton);
    }
    // Iter 35 PR 2: useImplicitMesh subscription 제거 — SkinMesh가 유일 renderer.
    if (s.lighting !== prev.lighting && sceneSetup) {
      applyLightingToScene(scene, sceneSetup, s.lighting);
    }
    if (s.renderFX !== prev.renderFX && sceneSetup) {
      try {
        applyRenderQuality(scene, sceneSetup, engine, s.renderFX);
      } catch (err) {
        log.error('applyRenderQuality failed:', err);
      }
    }
    // Iter 35: ProgressiveLoad 제거 — mode 단일이므로 mode-change 분기도 제거.
  });

  // Initial single-plant setup — camera preset + skeleton config.
  if (greenhouse) {
    const initialState = useTwinStore.getState();
    applyInitialMode();
    greenhouse.skinMeshPlant.setSkeletonConfig(initialState.skeleton);
    if (initialState.showSkeleton) {
      greenhouse.skinMeshPlant.setSkeletonMode(true);
    }
  }

  log.debug('starting render loop');

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
  // Iter 35: hudRobot 제거 — single-plant only.

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

    // Iter 35: lobby mode 부재 — render tick idle 분기 제거.

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

    // Iter 35: robot interaction + plantLOD 제거 — single-plant only (greenhouseContent 부재).
    // Drain stale interactions (age beyond lifetime drops them).
    useTwinStore.getState().tickInteractions(dtInter);

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
      // don't appear locked-frame static.
      // ★ Iter 35 PR 2 Phase I — wind sway target: showcase.root → skinMeshPlant.root.
      const t = now / 1000;
      const baseAmp = 0.012 * state.windStrength;
      const baseFreq = 0.7;
      const plant = greenhouse.skinMeshPlant.root;
      const plantSway = Math.sin(t * baseFreq + plant.position.x * 0.3) * baseAmp;
      plant.rotation.z = plantSway;
      plant.rotation.x = Math.sin(t * baseFreq * 1.3 + plant.position.z * 0.4) * baseAmp * 0.5;
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
      // Iter 35 PR 2: SkinMesh가 유일 plant renderer — 항상 update (toggle 부재).
      greenhouse.skinMeshPlant.update(state.currentDay);
      // Iter 35: LabelOverlay + greenhouseContent.update 제거 — single-plant only.

      // Sun + ambient are driven by store.lighting (see applyLightingToScene
      // in the subscribe handler) — they no longer follow currentDay here.

      lastDayUpdate = state.currentDay;
    }

    scene.render();

    if (now - lastFpsUpdate > 250) {
      const fps = engine!.getFps();
      const store = useTwinStore.getState();
      store.publishFps(fps);
      // Iter 35: robot publishRobotState + hudRobot 제거 — single-plant only.
      // Legacy hud spans — kept for old verify scripts. Cheap text writes.
      if (hudFps) hudFps.textContent = `${fps.toFixed(0)} fps`;
      if (hudDay) hudDay.textContent = `Day ${state.currentDay.toFixed(0)}`;
      lastFpsUpdate = now;
    }

    // Iter 35: LabelOverlay project 3D→2D 제거 — single-plant only.
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
