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
// Iter 35 PR 2 Phase O: QualityProbe archived (Skin 무관 general FX 측정).
import { useTwinStore, type LightingState } from '../state/twinStore';
import { SCENARIO } from '../data/mockScenario';
import { getSunState } from '@farmsim/tomato-engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { setShaderWindEnabled, isShaderWindEnabled } from './leaf/LeafMaterial';
// Iter 35: LabelOverlay archived — single-plant only.
// Iter 20 — hotkey for petiole-stem junction overlay ('d'/'D'/'ㅇ').
import { installDockingOverlayHotkey } from './dockingOverlay/hotkeyToggle';
import { setBootStage, logBoot, setEnvInfo, setEnvCounters, notify } from '../state/notify';
import { setSinglePlantEngineRef, setSinglePlantSkinMeshRef } from '../hud/single-plant/useSinglePlantState';
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
  // Iter 35 PR 2 Phase O: qualityProbe() + isProbeRunning() 제거 (QualityProbe archived).
  (globalThis as { __farmsim?: unknown; __twinStore?: unknown }).__farmsim = {
    engine,
    scene,
  };
  (globalThis as { __twinStore?: unknown }).__twinStore = useTwinStore;

  // ★ S143 — Boot profile: 단계별 timestamps + shader/texture/frame 카운터.
  //   probe (window.__bootProfile)로 ready 후 분해 측정 읽음.
  interface BootProfile {
    startMs: number;
    events: Array<{ ts: number; name: string; data?: unknown }>;
    shader: { count: number; totalMs: number; activeStart: number };
    texture: { count: number };
    frame: { firstRenderTs: number | null; renderCount: number };
    sceneReady: number | null;
    executeWhenReady: number | null;
    // ★ S143 — readiness poll: executeWhenReady가 기다리는 mesh/texture/material.
    readinessPoll: Array<{
      ts: number;
      meshNotReady: number;
      textureNotReady: number;
      sampleMeshes: string[];      // top 10 names by occurrence
      sampleTextures: string[];
    }>;
  }
  const bp: BootProfile = {
    startMs: useTwinStore.getState().boot.startedAt,
    events: [],
    shader: { count: 0, totalMs: 0, activeStart: 0 },
    texture: { count: 0 },
    frame: { firstRenderTs: null, renderCount: 0 },
    sceneReady: null,
    executeWhenReady: null,
    readinessPoll: [],
  };
  function mark(name: string, data?: unknown): void {
    bp.events.push({ ts: performance.now() - bp.startMs, name, data });
  }
  (globalThis as { __bootProfile?: BootProfile }).__bootProfile = bp;
  mark('engine_canvas_attached');

  // Hook engine shader compile observables (per-compile timing).
  engine.onBeforeShaderCompilationObservable.add(() => {
    bp.shader.activeStart = performance.now();
  });
  engine.onAfterShaderCompilationObservable.add(() => {
    if (bp.shader.activeStart > 0) {
      bp.shader.totalMs += performance.now() - bp.shader.activeStart;
      bp.shader.count++;
      bp.shader.activeStart = 0;
    }
  });

  const cameraRig = setupCamera(scene, canvas);
  // Iter 35 PR 4 Phase Q2: cameraPreset store field 제거 — 기본 'single-plant' preset.
  cameraRig.setPreset('single-plant');
  // Dev-only: expose scene + camera for headless capture / debugging.
  if (import.meta.env?.DEV) {
    (globalThis as { __scene?: unknown }).__scene = scene;
    (globalThis as { __camera?: unknown }).__camera = cameraRig.camera;
    // Iter 36 v5 Phase C — Plant Morphology Engine Leaf Module v0.1 dev hook
    // (src/plant/leaf/devHook) archived. Skin path는 LeafGenerator + skeleton
    // 3-tier로 단일화 — 외부 dev hook 부재.
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

  // ★ S143 — texture + scene observers (boot profile).
  scene.onNewTextureAddedObservable.add(() => { bp.texture.count++; });
  scene.onReadyObservable.add(() => {
    if (bp.sceneReady === null) {
      bp.sceneReady = performance.now() - bp.startMs;
      mark('scene_onReady');
    }
  });
  scene.onAfterRenderObservable.add(() => {
    if (bp.frame.firstRenderTs === null) {
      bp.frame.firstRenderTs = performance.now() - bp.startMs;
      mark('first_after_render');
    }
    bp.frame.renderCount++;
  });

  mark('greenhouse_stage_begin');
  setBootStage('greenhouse', '온실 인프라 빌드 시작', 0);
  let greenhouse: SceneInfrastructureHandle | null = null;
  try {
    greenhouse = await buildSceneInfrastructure(scene);
    mark('greenhouse_build_complete');
    setSinglePlantEngineRef(greenhouse.growthEngine);
    setSinglePlantSkinMeshRef(greenhouse.skinMeshPlant, 0);
    // ★ S126 — extra plants도 등록 (index 1+). SinglePlantOverlay에서 update 받음.
    for (let i = 0; i < greenhouse.extraPlants.length; i++) {
      setSinglePlantSkinMeshRef(greenhouse.extraPlants[i], i + 1);
    }
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
    // Iter 35 PR 4 Phase Q2: cameraPreset + analysisMode subscribe 제거 (store fields 부재).
    if (s.showSkeleton !== prev.showSkeleton && greenhouse) {
      greenhouse.skinMeshPlant.setSkeletonMode(s.showSkeleton);
    }
    if (s.skeleton !== prev.skeleton && greenhouse) {
      greenhouse.skinMeshPlant.setSkeletonConfig(s.skeleton);
    }
    // ★ Iter 39 Phase J0-1 — Isolated Leaf Debug Mode 적용.
    //   strict: lush mesh OFF + skeleton ON (target leaf 외 모두 hide는
    //     SkeletonOverlay 자체에서 처리).
    //   context: lush ON 유지 (alpha dim은 overlay/skin 측 향후 처리),
    //     skeleton ON 강제.
    //   off: 사용자 토글 그대로.
    if (s.isolatedLeafMode !== prev.isolatedLeafMode && greenhouse) {
      const m = s.isolatedLeafMode.mode;
      if (m === 'strict') {
        greenhouse.skinMeshPlant.setLushEnabled(false);
        greenhouse.skinMeshPlant.setSkeletonEnabled(true);
      } else if (m === 'context') {
        greenhouse.skinMeshPlant.setLushEnabled(true);
        greenhouse.skinMeshPlant.setSkeletonEnabled(true);
      }
      // off: 토글 미강제 (사용자 showSkeleton 그대로).
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
    // ★ Iter 39 Phase J0-1 — Boot 시 URL query로 진입한 isolated mode 적용.
    const m0 = initialState.isolatedLeafMode.mode;
    if (m0 === 'strict') {
      greenhouse.skinMeshPlant.setLushEnabled(false);
      greenhouse.skinMeshPlant.setSkeletonEnabled(true);
    } else if (m0 === 'context') {
      greenhouse.skinMeshPlant.setSkeletonEnabled(true);
    }
  }

  log.debug('starting render loop');

  // 'shaders' — first-frame shader compilation + GPU upload.
  // ★ S143 — Boot profile 측정 결과:
  //   shaders stage begin     @ ~1.3s
  //   first_after_render       @ ~4.3s   ← 화면 실제 표시
  //   scene.executeWhenReady   @ ~15.5s  ← Babylon internal mesh.isReady polling 완료
  //   첫 frame이 그려지면 _이미 ready_ (사용자 시각 기준). executeWhenReady의 추가
  //   ~11초는 background polling (모든 PBR material isReadyForSubMesh + envTexture
  //   prefiltering + per-frame mesh.isReady() 검증). user 인지에 도달 X.
  //   → ready 정의를 _first_after_render_로 변경. executeWhenReady는 logBoot only.
  mark('shaders_stage_begin');
  setBootStage('shaders', '셰이더 컴파일 · GPU 업로드', 0.1);
  const shadersStart = performance.now();
  const RAMP_DUR_MS = 5_000;  // first frame까지 ~3-4초 → ramp 5초로
  let isReady = false;
  const rampTick = window.setInterval(() => {
    if (isReady) return;
    const elapsedMs = performance.now() - shadersStart;
    const t = Math.min(1, elapsedMs / RAMP_DUR_MS);
    const progress = 0.1 + 0.8 * (1 - Math.pow(1 - t, 2));
    const elapsedS = (elapsedMs / 1000).toFixed(1);
    useTwinStore.getState().updateStageDetail(
      `셰이더 컴파일 · GPU 업로드 (${elapsedS}s)`,
      Math.min(0.9, progress),
    );
  }, 200);

  // ★ S143 — Ready 신호 = 첫 frame 그려진 시점.
  //   onAfterRenderObservable이 화면에 paint 후 호출 → 사용자가 _이미 보는 상태_.
  //   safety: 2 frame 후 ready (첫 frame이 partial일 수 있음).
  let firstRenderCount = 0;
  const readyObs = scene.onAfterRenderObservable.add(() => {
    firstRenderCount++;
    if (firstRenderCount < 2 || isReady) return;
    isReady = true;
    window.clearInterval(rampTick);
    window.clearInterval(readyPoll);
    bp.executeWhenReady = performance.now() - bp.startMs;
    mark('ready_first_frame');
    setBootStage('ready', '준비 완료', 1);
    const total = (performance.now() - useTwinStore.getState().boot.startedAt) / 1000;
    logBoot('log', `ready: 첫 frame 그려진 시점 (총 ${total.toFixed(2)}초)`);
    scene.onAfterRenderObservable.remove(readyObs);
  });

  // ★ S143 — readiness polling: executeWhenReady가 _구체적으로 무엇_을 기다리는지.
  //   매 200ms scene.meshes / textures 순회. not-ready 항목 카운트 + 이름 sample.
  const readyPoll = window.setInterval(() => {
    if (isReady) return;
    let meshNotReady = 0;
    let textureNotReady = 0;
    const meshNames: string[] = [];
    const texNames: string[] = [];
    for (const m of scene.meshes) {
      try {
        if (!m.isReady(true)) {
          meshNotReady++;
          if (meshNames.length < 10) meshNames.push(m.name);
        }
      } catch {
        // isReady가 throw 시 not-ready로 간주
        meshNotReady++;
        if (meshNames.length < 10) meshNames.push(`${m.name}#throw`);
      }
    }
    for (const t of scene.textures) {
      if (!t.isReady()) {
        textureNotReady++;
        if (texNames.length < 10) texNames.push(t.name ?? 'unnamed');
      }
    }
    bp.readinessPoll.push({
      ts: performance.now() - bp.startMs,
      meshNotReady,
      textureNotReady,
      sampleMeshes: meshNames,
      sampleTextures: texNames,
    });
  }, 200);
  // executeWhenReady는 background 검증용 — 모든 mesh.isReady() 완료 시 fire.
  // 사용자에게는 _이미 ready_ 표시됐고 화면 보임. 진단 log only.
  scene.executeWhenReady(() => {
    mark('background_execute_when_ready');
    const elapsedS = ((performance.now() - bp.startMs) / 1000).toFixed(2);
    logBoot('log', `background: Babylon executeWhenReady ${elapsedS}초 (모든 mesh.isReady)`);
  });

  // Env counters refreshed every 500ms during boot, less often after
  // ready (every 2s — for the dev panel if anyone keeps it open).
  let lastCountersUpdate = 0;

  let lastFpsUpdate = 0;
  // Iter 35 PR 4 Phase P: lastDayUpdate 제거 — SinglePlantOverlay useEffect [minute]가
  //   유일 skin.update path (TOMGRO 일관성).
  let lastPlayTime = performance.now();
  const hudFps = document.getElementById('hud-fps');
  // Iter 35 PR 4 Phase Q2: hudDay 제거 — singlePlantMinute 표시는 BottomPlaybackBar 담당.
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

    // Iter 35 PR 4 Phase Q2: interactions/robot/plantLOD 모두 제거 (store fields 부재).

    // Push wind uniforms each frame — WebGL2 only.
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
          // Iter 35 PR 4 Phase Q2: interaction uniforms 제거 (interactions field 부재).
          eff.setInt('interactionCount', 0);
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

    // Iter 35 PR 4 Phase Q2: playback (state.playing/currentDay/playSpeed/setDay/togglePlay)
    //   제거 — SinglePlantOverlay의 playback loop (singlePlantMinute 기반)이 대체.

    // Iter 35 PR 4 Phase P: BabylonEngine의 skin.update 호출 _제거_.
    //   기존 호출 (physiology 없음) → Sigmoid path (낙과 필터 없음) → 부정확한
    //   fruit count. SinglePlantOverlay.useEffect [minute]가 physiology 포함
    //   simulatePlantToMinute 호출 → TOMGRO path (낙과/수확 필터) → 정확.
    //   사용자 보고 "첫 진입 fruit 많은데 click 시 줄어듦" 해소.
    //
    // Sun + ambient은 store.lighting subscribe로 처리 (currentDay 무관).

    scene.render();

    if (now - lastFpsUpdate > 250) {
      const fps = engine!.getFps();
      const store = useTwinStore.getState();
      store.publishFps(fps);
      // Iter 35 PR 4 Phase Q2: hudDay (currentDay 표시) 제거 — singlePlantMinute로 대체.
      // Legacy hud spans — kept for old verify scripts. Cheap text writes.
      if (hudFps) hudFps.textContent = `${fps.toFixed(0)} fps`;
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
