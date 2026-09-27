import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import type { Material } from '@babylonjs/core/Materials/material';
import { setupScene, type SceneSetupHandle } from './SceneSetup';
import { applyRenderQuality, QUALITY_PRESETS } from './RenderQuality';
import { setupCamera, type CameraRig } from './CameraRig';
import { buildSceneInfrastructure, type SceneInfrastructureHandle, SHOWCASE_SEED } from './SceneInfrastructure';
import { resolveSceneOptions } from './sceneOptions';
import { useTwinStore, type LightingState } from '../state/twinStore';
import { SCENARIO } from '../data/mockScenario';
import { getSunState } from '@farmsim/tomato-engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import { setShaderWindEnabled, isShaderWindEnabled } from './leaf/LeafMaterial';
// Hotkey for the petiole-stem junction overlay ('d' / 'D' / 'ㅇ').
import { installDockingOverlayHotkey } from './dockingOverlay/hotkeyToggle';
import { setBootStage, logBoot, setEnvInfo, setEnvCounters, notify } from '../state/notify';
import { setSinglePlantEngineRef, setSinglePlantSkinMeshRef, setCameraRigRef } from '../hud/single-plant/useSinglePlantState';
import { setActiveSceneHandle } from './PlantManager';
import { createRobot } from './robot/Robot';
import { railRef, initRobotRail, gimbalCameraRef, tickSmoothMotion } from './robot/robotControlState';
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
    // Phenotyping survey reads gimbal-cam viewport pixels via drawImage on the
    // main canvas — requires preserveDrawingBuffer:true so the rendered
    // contents are retained until the next render.  Small perf cost (~1%).
    preserveDrawingBuffer: true,
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

  const pipelineImageProcessing = setup.pipeline.imageProcessing;
  if (pipelineImageProcessing) {
    pipelineImageProcessing.toneMappingEnabled = tmType !== null;
    if (tmType !== null) pipelineImageProcessing.toneMappingType = tmType;
    pipelineImageProcessing.exposure = L.exposure;
    pipelineImageProcessing.contrast = L.contrast;
    pipelineImageProcessing.vignetteEnabled = L.vignetteEnabled;
    pipelineImageProcessing.vignetteWeight = L.vignetteWeight;
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

  // Phase A — Fog (subtle linear distance fog).
  if (L.fogEnabled) {
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = Color3.FromHexString(L.fogColorHex);
    scene.fogStart = L.fogStart;
    scene.fogEnd = L.fogEnd;
  } else {
    scene.fogMode = Scene.FOGMODE_NONE;
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
  scene.ambientColor = new Color3(0.12, 0.12, 0.12);

  // Dev / probe convenience — Playwright / DevTools can reach scene / engine / store.
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
    // ★ S144-A — Ready_first_frame 시점의 visual readiness snapshot.
    //   회귀 위험 검증: env / shadow / showcase material이 첫 frame에 모두 ready인지.
    //   4개 모두 true → 시각 회귀 없음. 일부 false → S144-B로 ready 조건 보강.
    readyVisualState: {
      envTextureReady: boolean | null;
      shadowMapReady: boolean | null;
      showcaseMeshReady: boolean | null;
      showcaseMaterialReady: boolean | null;
      showcaseMeshName: string | null;  // 디버그용 — capture된 mesh 식별
    } | null;
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
    readyVisualState: null,
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
  // Module holder — CameraDock calls setPreset; CameraRig is typed
  // (PresetView) while the holder takes a string, so we cast.
  setCameraRigRef({
    setPreset: (n: string) => cameraRig.setPreset(n as Parameters<typeof cameraRig.setPreset>[0]),
    setEePresetDynamic: cameraRig.setEePresetDynamic,
  });
  cameraRig.setPreset('single-plant');
  // Dev-only: expose scene + camera for headless capture / debugging.
  if (import.meta.env?.DEV) {
    (globalThis as { __scene?: unknown }).__scene = scene;
    (globalThis as { __camera?: unknown }).__camera = cameraRig.camera;
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
  // §21 — URL → SceneOptions 명시 변환 후 buildSceneInfrastructure에 전달.
  //   outer scope에 두어 robot/quality 분기에서도 재사용.
  const sceneOptions = resolveSceneOptions(
    typeof location !== 'undefined' ? location.search : '',
  );
  let greenhouse: SceneInfrastructureHandle | null = null;
  try {
    greenhouse = await buildSceneInfrastructure(scene, sceneOptions);
    mark('greenhouse_build_complete');
    setSinglePlantEngineRef(greenhouse.growthEngine);
    setSinglePlantSkinMeshRef(greenhouse.skinMeshPlant, 0);
    // §21 — PlantManager.registerPlantRef 주입 (runtime add 시 SinglePlantOverlay 등록).
    greenhouse.plantManager?.setRegisterPlantRef(setSinglePlantSkinMeshRef);
    setActiveSceneHandle(greenhouse);

    // W2.e·f (§18) — 신규 Robot mesh (Babylon 9 스타일) — chassis + arm + effector.
    //   §21 — URL parsing 대신 sceneOptions 사용. profile/traverse/gimbalView 모두 옵션에서.
    try {
      const robotOpts = sceneOptions.robot;
      const profile = robotOpts.profile === 'none' ? 'agv-arm' : robotOpts.profile;
      const robot = createRobot(scene, { z: -0.8, y: 0.3, x: robotOpts.startX, profile });

      // Rail ping-pong traverse — enabled when robotOpts.traverseEnabled.
      // Phenotyping convention: outbound (+X) shoots the left (Z+) bed,
      // return (-X) shoots the right (Z−) bed.
      //
      // Mode dispatch: 'auto' / 'paused' / 'manual' from the store.
      // railX itself lives in a module-scope `railRef` so the React tree
      // doesn't re-render at 60fps; UI subscribes only to mode/speed/gimbal.
      if (robotOpts.traverseEnabled) {
        const TRAVERSE_RANGE = robotOpts.traverseRangeM;
        // Boot 시 store에 default speed 시드 (race-free: action 호출만)
        useTwinStore.getState().setRobotSpeed(robotOpts.traverseSpeedMps);
        initRobotRail(robotOpts.startX, TRAVERSE_RANGE);
        robot.setGimbalLookSide('left'); // 초기 lens 방향

        scene.onBeforeRenderObservable.add(() => {
          const r = useTwinStore.getState().robot;
          const dt = scene.getEngine().getDeltaTime() / 1000;

          if (r.mode === 'auto') {
            railRef.current += railRef.dir * r.speedMps * dt;
            if (railRef.current > TRAVERSE_RANGE) {
              railRef.current = TRAVERSE_RANGE;
              railRef.dir = -1;
              if (!r.gimbal.manualOverride) robot.setGimbalLookSide('right');
            } else if (railRef.current < -TRAVERSE_RANGE) {
              railRef.current = -TRAVERSE_RANGE;
              railRef.dir = 1;
              if (!r.gimbal.manualOverride) robot.setGimbalLookSide('left');
            }
          } else if (r.mode === 'manual') {
            // Smooth-motion target driven by survey runner (or any external caller).
            // setRail/nudgeRail clear target → tickSmoothMotion is no-op.
            tickSmoothMotion(dt);
          }
          // mode === 'paused': no motion.

          robot.setRailPosition(railRef.current);

          // Gimbal 동기: manualOverride면 store 값으로 pan 덮어쓰기. pitch는 항상 store.
          if (r.gimbal.manualOverride) {
            robot.setGimbalPan(r.gimbal.panRad);
          }
          robot.setGimbalPitch(r.gimbal.pitchRad);
        });
      }

      // §19 phenotyping — 짐벌 카메라 mini-viewport (좌상단 384×288 @ 1600×900).
      //   robotOpts.gimbalView 시 활성. UniversalCamera + parent=gimbalPitchPivot.
      if (profile === 'phenotyping' && robotOpts.gimbalView) {
        // PTZ-standard mount: the lens sits exactly on the rotation axes
        // (local X=0, Z=0), so view origin = pan/pitch intersection =
        // robot X/Z center.  Panning rotates the camera in place (no swing).
        // Robot self-meshes are excluded by layerMask, so the lens/body
        // never appears in frame.
        const gimbalCam = new UniversalCamera(
          'gimbal-cam',
          new Vector3(0, 0, 0),
          scene,
        );
        // pitch pivot 자식으로 부착해 pan + pitch 모두 자동 적용.
        gimbalCam.parent = robot.gimbalPitchPivot;
        gimbalCam.setTarget(new Vector3(0, 0, 1.5));
        gimbalCam.fov = (60 * Math.PI) / 180;
        gimbalCam.minZ = 0.1;
        gimbalCam.maxZ = 60;
        // Viewport 는 GimbalView (DOM PiP) 가 자기 bounding rect 으로 동적 동기.
        //   초기값은 좌상단 PiP 위치/크기 (74,58 → 236×138 on 1600×900 canvas).
        gimbalCam.viewport = new Viewport(0.046, 0.782, 0.148, 0.153);
        gimbalCameraRef.current = gimbalCam;
        // Dev/probe hook — Playwright probes read gimbal cam pose to verify aim.
        if (typeof window !== 'undefined') {
          (window as unknown as { __gimbalCam: typeof gimbalCam }).__gimbalCam = gimbalCam;
        }

        // Robot 전체를 gimbalCam에서 제외 — chassis · strut · wheel · gimbal mount · lens 등.
        //   layerMask 비트 0x10000000 = robot 전용. main cam은 default 0x0FFFFFFF에 포함됨.
        const ROBOT_LAYER = 0x10000000;
        const robotMeshes = robot.root.getChildMeshes(false);
        for (const m of robotMeshes) m.layerMask = ROBOT_LAYER;
        gimbalCam.layerMask = 0x0FFFFFFF; // robot 비트 제외, 나머지 (default 0x0FFFFFFF) 포함
        cameraRig.camera.layerMask = 0xFFFFFFFF; // 메인은 모두 보임

        // ── PiP render path ──
        // Two modes share this gimbalCam:
        //
        //   'in-canvas' (legacy): gimbalCam is added to scene.activeCameras.
        //     Each frame Babylon renders main + gimbal sub-region; the
        //     `<GimbalView>` React panel is a transparent <div> over that
        //     region.  Has the multi-camera viewport class of bugs we just
        //     escaped — kept for fallback / comparison only.
        //
        //   'stream' (default): gimbalCam stays OUT of scene.activeCameras.
        //     The new GimbalCameraStreamer (tooling/vite/plugins/camStream relayed
        //     WS pipeline) attaches a private capture camera + RTT to render
        //     the same view 320×180 and stream JPEG frames.  React PiP shows
        //     an <img> consumer.  No multi-cam render → no scissor needed.
        //
        // Hot-swap: re-subscribes on twinStore.phenotypingSurvey.pipMode change.
        let scissorHook: import('@babylonjs/core/Misc/observable').Observer<import('@babylonjs/core/Cameras/camera').Camera> | null = null;
        let streamer: import('../phenotyping/streaming/gimbalCameraStreamer').GimbalCameraStreamer | null = null;
        const applyPipMode = (mode: 'stream' | 'in-canvas'): void => {
          const wantInCanvas = mode === 'in-canvas';
          const hasGimbalActive = (scene.activeCameras ?? []).includes(gimbalCam);
          if (wantInCanvas && !hasGimbalActive) {
            scene.activeCameras = [cameraRig.camera, gimbalCam];
          } else if (!wantInCanvas && hasGimbalActive) {
            scene.activeCameras = [cameraRig.camera];
          }
          // Stream mode → spin up GimbalCameraStreamer (capture cam + RTT + WS).
          // Lazy-imported so the WS / encode code only loads when the user
          // sticks with 'stream' (default — vast majority of sessions).
          if (!wantInCanvas && !streamer) {
            void import('../phenotyping/streaming/gimbalCameraStreamer').then(({ GimbalCameraStreamer }) => {
              if (streamer) return;
              streamer = new GimbalCameraStreamer({
                scene,
                gimbalCamera: gimbalCam,
                streamId: 'phenotyping/gimbal',
              });
              streamer.start();
            }).catch((err) => {
              log.warn('streamer init failed', err);
            });
          } else if (wantInCanvas && streamer) {
            streamer.dispose();
            streamer = null;
          }
          if (wantInCanvas && !scissorHook) {
            // WebGL scissor-clear: gl.clear()는 viewport와 무관 — 전체 framebuffer
            // clear.  scissor 영역만 clear되도록 SCISSOR_TEST 활성화.
            scissorHook = scene.onBeforeCameraRenderObservable.add((cam) => {
              if (cam !== gimbalCam) return;
              const e = scene.getEngine();
              const w = e.getRenderWidth();
              const h = e.getRenderHeight();
              const vp = gimbalCam.viewport;
              const sx = Math.round(vp.x * w);
              const sy = Math.round(vp.y * h);
              const sw = Math.round(vp.width * w);
              const sh = Math.round(vp.height * h);
              if (typeof (e as unknown as { enableScissor?: (x: number, y: number, w: number, h: number) => void }).enableScissor === 'function') {
                const ee = e as unknown as { enableScissor: (x: number, y: number, w: number, h: number) => void; disableScissor: () => void };
                ee.enableScissor(sx, sy, sw, sh);
                e.clear(scene.clearColor, true, true, false);
                ee.disableScissor();
              } else {
                const gl = (e as unknown as { _gl?: WebGL2RenderingContext })._gl;
                if (!gl) return;
                gl.enable(gl.SCISSOR_TEST);
                gl.scissor(sx, sy, sw, sh);
                e.clear(scene.clearColor, true, true, false);
                gl.disable(gl.SCISSOR_TEST);
              }
            });
          } else if (!wantInCanvas && scissorHook) {
            scene.onBeforeCameraRenderObservable.remove(scissorHook);
            scissorHook = null;
          }
        };
        // Initial: subscribe to twinStore.
        try {
          const { useTwinStore } = await import('../state/twinStore');
          applyPipMode(useTwinStore.getState().phenotypingSurvey.pipMode);
          useTwinStore.subscribe((s, prev) => {
            if (s.phenotypingSurvey.pipMode !== prev.phenotypingSurvey.pipMode) {
              applyPipMode(s.phenotypingSurvey.pipMode);
            }
          });
        } catch {
          // Fallback to legacy in-canvas if store import fails
          applyPipMode('in-canvas');
        }
      }
    } catch (e) {
      log.warn('createRobot failed', e);
    }
    // ★ S126 — extra plants도 등록 (index 1+). SinglePlantOverlay에서 update 받음.
    for (let i = 0; i < greenhouse.extraPlants.length; i++) {
      setSinglePlantSkinMeshRef(greenhouse.extraPlants[i], i + 1);
    }
  } catch (err) {
    log.error('buildSceneInfrastructure failed:', err);
    notify.error('Scene 빌드 실패', err instanceof Error ? err : String(err));
  }

  function applyInitialMode(): void {
    cameraRig.setPreset('single-plant');
  }

  // Apply the quality preset AFTER greenhouse is built so the shadow
  // generator's caster list — recreated when we upgrade the shadow
  // resolution — picks up every plant/structure mesh.
  if (sceneSetup) {
    setBootStage('quality', '렌더 품질 적용', 0);
    try {
      // URL `?qualityPreset=N` forces the RenderFX preset.  N=1 (Minimum,
      // shadow off, MSAA 1, hardware 0.5x) is the lightest tier — useful
      // when 100+ plants stress the device.
      if (sceneOptions.qualityPreset !== null && QUALITY_PRESETS[sceneOptions.qualityPreset]) {
        useTwinStore.getState().setRenderFX(QUALITY_PRESETS[sceneOptions.qualityPreset].fx);
        logBoot('log', `quality: preset ${sceneOptions.qualityPreset} (${QUALITY_PRESETS[sceneOptions.qualityPreset].label}) 강제 적용`);
      }
      applyRenderQuality(scene, sceneSetup, engine, useTwinStore.getState().renderFX);
      logBoot('log', 'quality: 렌더 품질 적용 완료');
    } catch (err) {
      log.error('applyRenderQuality boot failed:', err);
      notify.error('렌더 품질 적용 실패', err instanceof Error ? err : String(err));
    }
  }

  // Store subscription — react to changes.
  const unsubStore = useTwinStore.subscribe((s, prev) => {
    if (s.showSkeleton !== prev.showSkeleton && greenhouse) {
      greenhouse.skinMeshPlant.setSkeletonMode(s.showSkeleton);
    }
    if (s.skeleton !== prev.skeleton && greenhouse) {
      greenhouse.skinMeshPlant.setSkeletonConfig(s.skeleton);
    }
    // Isolated Leaf Debug Mode:
    //   strict: lush mesh OFF + skeleton ON (SkeletonOverlay handles the
    //     "hide everything except target leaf" half).
    //   context: keep lush ON, force skeleton ON.  Alpha dimming for the
    //     surrounding leaves lives in the overlay / skin layer.
    //   off: user toggle wins.
    if (s.isolatedLeafMode !== prev.isolatedLeafMode && greenhouse) {
      const m = s.isolatedLeafMode.mode;
      if (m === 'strict') {
        greenhouse.skinMeshPlant.setLushEnabled(false);
        greenhouse.skinMeshPlant.setSkeletonEnabled(true);
      } else if (m === 'context') {
        greenhouse.skinMeshPlant.setLushEnabled(true);
        greenhouse.skinMeshPlant.setSkeletonEnabled(true);
      }
      // 'off' is intentional no-op so the user's showSkeleton stays in charge.
    }
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
  });

  // Initial single-plant setup — camera preset + skeleton config.
  if (greenhouse) {
    const initialState = useTwinStore.getState();
    applyInitialMode();
    greenhouse.skinMeshPlant.setSkeletonConfig(initialState.skeleton);
    if (initialState.showSkeleton) {
      greenhouse.skinMeshPlant.setSkeletonMode(true);
    }
    // Apply the isolated mode entered via URL query at boot.
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

  // ★ S143 + S144-B — Ready 신호 = 첫 frame 그려진 시점 + visual readiness 확인.
  //   onAfterRenderObservable이 화면에 paint 후 호출 → 사용자가 _이미 보는 상태_.
  //   safety: 2 frame 후 + env/shadow/showcase ready 모두 true.
  //   S144-A 측정 결과: showcase mesh/material이 첫 frame에 not-ready (effect compile).
  //   → showcase mesh.isReady(true) true 될 때까지 추가 frame 대기.
  //   10초 force-ready timeout: 영원히 ready 안 되는 edge case 차단 (warn 로그).
  let firstRenderCount = 0;
  const readyTimeoutMs = 10_000;
  const readyDeadline = performance.now() + readyTimeoutMs;
  function captureReadyVisualState(): void {
    try {
      const env = scene.environmentTexture;
      const showcaseSkinName = `skinplant_skin_${SHOWCASE_SEED}`;
      const showcaseMesh = scene.meshes.find((m) => m.name === showcaseSkinName)
        ?? scene.meshes.find((m) => (m.name ?? '').includes(`_${SHOWCASE_SEED}_`))
        ?? null;
      const mat = showcaseMesh?.material;
      const subMesh = showcaseMesh?.subMeshes?.[0];
      bp.readyVisualState = {
        envTextureReady: env ? env.isReady() : null,
        shadowMapReady: sceneSetup?.shadowGenerator?.getShadowMap()?.isReady() ?? null,
        showcaseMeshReady: showcaseMesh ? showcaseMesh.isReady(true) : null,
        showcaseMaterialReady: mat && subMesh
          ? mat.isReadyForSubMesh(showcaseMesh, subMesh, false)
          : (mat ? mat.isReady(showcaseMesh ?? undefined, false) : null),
        showcaseMeshName: showcaseMesh?.name ?? null,
      };
    } catch (err) {
      log.warn('readyVisualState capture failed:', err);
    }
  }
  const readyObs = scene.onAfterRenderObservable.add(() => {
    if (isReady) return;
    firstRenderCount++;
    if (firstRenderCount < 2) return;
    // ★ S144-B — Visual readiness check before signaling ready.
    const env = scene.environmentTexture;
    const envOK = !env || env.isReady();
    const shadowMap = sceneSetup?.shadowGenerator?.getShadowMap();
    const shadowOK = !shadowMap || shadowMap.isReady();
    const showcaseSkinName = `skinplant_skin_${SHOWCASE_SEED}`;
    const showcaseMesh = scene.meshes.find((m) => m.name === showcaseSkinName)
      ?? scene.meshes.find((m) => (m.name ?? '').includes(`_${SHOWCASE_SEED}_`));
    const showcaseOK = !showcaseMesh || showcaseMesh.isReady(true);
    const timeoutHit = performance.now() > readyDeadline;
    if (!timeoutHit && (!envOK || !shadowOK || !showcaseOK)) return;
    isReady = true;
    window.clearInterval(rampTick);
    window.clearInterval(readyPoll);
    bp.executeWhenReady = performance.now() - bp.startMs;
    captureReadyVisualState();
    mark('ready_first_frame');
    setBootStage('ready', '준비 완료', 1);
    const total = (performance.now() - useTwinStore.getState().boot.startedAt) / 1000;
    if (timeoutHit) {
      logBoot('warn', `ready: 10초 timeout — visual readiness 미확정 신호 (총 ${total.toFixed(2)}초)`);
    } else {
      logBoot('log', `ready: 첫 frame + visual readiness 확정 (총 ${total.toFixed(2)}초)`);
    }
    if (bp.readyVisualState) {
      const v = bp.readyVisualState;
      logBoot('log',
        `readyVisualState: env=${v.envTextureReady} shadow=${v.shadowMapReady} ` +
        `mesh=${v.showcaseMeshReady} mat=${v.showcaseMaterialReady} (${v.showcaseMeshName ?? '?'})`,
      );
    }
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
  let lastPlayTime = performance.now();
  const hudFps = document.getElementById('hud-fps');

  // Resolve cached leaf materials for per-frame wind uniform update.
  let cachedLeafMatCount = -1;
  let cachedLeafMatRefs: Material[] = [];
  function getLeafMatsForUniform(): Material[] {
    if (cachedLeafMatCount !== scene.materials.length) {
      cachedLeafMatCount = scene.materials.length;
      cachedLeafMatRefs = scene.materials.filter((m) =>
        m.name === 'leafMat' || m.name.startsWith('leafMat_')
      );
    }
    return cachedLeafMatRefs;
  }

  // Reusable interaction-uniform buffers — avoid per-frame allocations.
  // Babylon's Effect.setArray4 requires number[] (not Float32Array).
  const INTERACTION_MAX = 8;
  const interactionFloats: number[] = new Array(INTERACTION_MAX * 4).fill(0);
  let lastInteractionTick = performance.now();

  engine.runRenderLoop(() => {
    const state = useTwinStore.getState();
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

    // Push wind uniforms each frame — WebGL2 only.
    // On WebGPU we use the CPU sine fallback further down.
    if (isShaderWindEnabled()) {
      for (const lm of getLeafMatsForUniform()) {
        if (typeof lm.getEffect !== 'function') continue;
        const eff = lm.getEffect();
        if (eff) {
          eff.setFloat('windTime', now / 1000);
          eff.setFloat('windStrength', state.windStrength);
          eff.setFloat('flutterStrength', state.flutterStrength);
          eff.setVector3(
            'windDir',
            new Vector3(state.windDirection[0], state.windDirection[1], state.windDirection[2])
          );
          // Interactions are not wired through the store today; pass 0 so the
          // shader's interactionCount uniform always has a defined value.
          eff.setInt('interactionCount', 0);
        }
      }
    } else if (greenhouse) {
      // WebGPU fallback — gently rock the plant root TransformNodes so
      // the whole plant breathes. Only z-axis tilt (subtle) so leaves
      // don't appear locked-frame static.
      const t = now / 1000;
      const baseAmp = 0.012 * state.windStrength;
      const baseFreq = 0.7;
      const plant = greenhouse.skinMeshPlant.root;
      const plantSway = Math.sin(t * baseFreq + plant.position.x * 0.3) * baseAmp;
      plant.rotation.z = plantSway;
      plant.rotation.x = Math.sin(t * baseFreq * 1.3 + plant.position.z * 0.4) * baseAmp * 0.5;
    }

    // Playback runs in SinglePlantOverlay (singlePlantMinute-driven), and
    // sun + ambient updates come from the store.lighting subscription —
    // so the render loop only paints the current state.
    scene.render();

    if (now - lastFpsUpdate > 250) {
      const fps = engine!.getFps();
      const store = useTwinStore.getState();
      store.publishFps(fps);
      // Legacy hud spans — kept for old verify scripts. Cheap text writes.
      if (hudFps) hudFps.textContent = `${fps.toFixed(0)} fps`;
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
