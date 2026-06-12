import { createLogger } from '../utils/logger';
const log = createLogger('scene');
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { GradientMaterial } from '@babylonjs/materials/gradient/gradientMaterial';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { notify, logBoot, updateStageDetail } from '../state/notify';

import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
import '@babylonjs/core/PostProcesses/postProcess';
import '@babylonjs/core/PostProcesses/postProcessManager';
import '@babylonjs/core/PostProcesses/blurPostProcess';
import '@babylonjs/core/PostProcesses/passPostProcess';
import '@babylonjs/core/PostProcesses/fxaaPostProcess';
import '@babylonjs/core/PostProcesses/extractHighlightsPostProcess';
import '@babylonjs/core/PostProcesses/bloomMergePostProcess';
import '@babylonjs/core/PostProcesses/bloomEffect';
import '@babylonjs/core/PostProcesses/sharpenPostProcess';
import '@babylonjs/core/PostProcesses/imageProcessingPostProcess';

export interface SceneSetupHandle {
  sun: DirectionalLight;
  hemi: HemisphericLight;
  shadowGenerator: ShadowGenerator;
  pipeline: DefaultRenderingPipeline;
  ssao: SSAO2RenderingPipeline | null;
}

export interface SceneSetupOptions {
  backend: 'webgpu' | 'webgl2';
}

export async function setupScene(
  scene: Scene,
  camera: Camera,
  options: SceneSetupOptions = { backend: 'webgl2' }
): Promise<SceneSetupHandle> {
  log.debug(`starting setup (backend=${options.backend})`);

  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.05;       // Phase A
  scene.imageProcessingConfiguration.contrast = 1.2;        // 1.1 → 1.2 (depth)

  // Phase A — Fog (subtle linear distance fog). 동적 값은 applyLightingToScene 에서.
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString('#dce4ec');
  scene.fogStart = 15;
  scene.fogEnd = 45;

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.55;                                    // Phase A: 0.34 → 0.55
  hemi.diffuse = Color3.FromHexString('#e8e4d8');
  hemi.groundColor = Color3.FromHexString('#3a3530');
  hemi.specular = new Color3(0.4, 0.4, 0.4);

  // Sun direction more lateral — gives diagonal cast shadows instead of
  // straight-down stamps; also creates proper rim highlights on fruits.
  const sunDir = new Vector3(-0.55, -0.85, -0.45).normalize();
  const sun = new DirectionalLight('sun', sunDir, scene);
  sun.intensity = 3.4;                                      // Phase A: 3.0 → 3.4
  sun.diffuse = Color3.FromHexString('#fff6d8');
  sun.specular = new Color3(1, 1, 1);
  sun.position = new Vector3(8, 12, 6);
  sun.shadowMinZ = 0.5;
  sun.shadowMaxZ = 40;

  const shadowGenerator = new ShadowGenerator(2048, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadowGenerator.darkness = 0.18;
  shadowGenerator.bias = 0.002;
  shadowGenerator.normalBias = 0.02;

  setupSky(scene);
  setupIBL(scene);

  const pipeline = new DefaultRenderingPipeline('default', true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.fxaaEnabled = true;

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.78;  // Phase A
  pipeline.bloomWeight = 0.42;     // Phase A
  pipeline.bloomKernel = 48;
  pipeline.bloomScale = 0.5;

  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.32;  // Phase A
  pipeline.sharpen.colorAmount = 1.0;

  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.05;   // Phase A
  pipeline.imageProcessing.contrast = 1.15;   // Phase A
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.0;  // Phase A
  pipeline.imageProcessing.vignetteStretch = 0.5;
  pipeline.imageProcessing.vignetteColor.set(0, 0, 0, 1);

  updateStageDetail('SSAO 파이프라인', 0.7);
  let ssao: SSAO2RenderingPipeline | null = null;
  if (options.backend === 'webgl2' && SSAO2RenderingPipeline.IsSupported) {
    try {
      ssao = new SSAO2RenderingPipeline('ssao', scene, 0.75, [camera]);
      ssao.radius = 0.42;
      ssao.totalStrength = 1.35;
      ssao.samples = 16;
      ssao.maxZ = 30;
      ssao.minZAspect = 0.5;
      ssao.expensiveBlur = true;
      ssao.bilateralSoften = 0.5;
      ssao.bilateralTolerance = 0.15;
      log.debug('SSAO2 enabled (WebGL2)');
      logBoot('log', 'setup: SSAO2 활성화 (WebGL2)');
    } catch (err) {
      log.warn('SSAO2 init failed:', err);
      notify.warn('SSAO 초기화 실패', err instanceof Error ? err.message : String(err));
    }
  } else {
    log.debug(`SSAO2 skipped (backend=${options.backend} or unsupported)`);
    if (options.backend === 'webgpu') {
      notify.warnWebGPUUnsupported('SSAO');
    }
  }

  updateStageDetail('환경 텍스처 (IBL)', 0.9);
  logBoot('log', 'setup: IBL 환경 텍스처');
  log.debug('setup complete');

  return { sun, hemi, shadowGenerator, pipeline, ssao };
}

function setupIBL(scene: Scene) {
  try {
    const env = CubeTexture.CreateFromPrefilteredData('/hdri/environment.env', scene);
    env.gammaSpace = false;
    env.level = 1.0;
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.7;  // Phase A: 0.42 → 0.7 (IBL 반사/굴절 살림)
    log.debug('IBL loaded from /hdri/environment.env');
  } catch (err) {
    log.warn('local IBL load failed:', err);
  }
}

function setupSky(scene: Scene) {
  try {
    const sky = new GradientMaterial('sky', scene);
    sky.topColor = Color3.FromHexString('#a8c8e8');
    sky.bottomColor = Color3.FromHexString('#f0e8d8');
    sky.offset = 0.35;
    sky.smoothness = 0.6;
    sky.backFaceCulling = false;
    sky.disableLighting = true;

    const skybox = MeshBuilder.CreateSphere('skybox', { diameter: 500, segments: 16 }, scene);
    skybox.material = sky;
    skybox.infiniteDistance = true;
    skybox.isPickable = false;
    skybox.receiveShadows = false;
    skybox.applyFog = false;
  } catch (err) {
    log.warn('GradientMaterial sky failed, falling back to clearColor:', err);
  }
}
