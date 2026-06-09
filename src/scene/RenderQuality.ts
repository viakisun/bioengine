import { createLogger } from '../utils/logger';
const log = createLogger('engine');

/**
 * Render-quality 10-level preset table + applier.
 *
 * The quality slider in the sidebar is the single knob that drives:
 *   - Shadow generator (resolution + filter)
 *   - MSAA samples on the default rendering pipeline
 *   - Hardware-scale (super-sampling at the high end)
 *   - SSAO sample density
 *   - Advanced post-FX: TAA, SSR, DOF, God Rays, Motion Blur, Glow,
 *     Lens Flare, Color LUT, Chromatic Aberration, Film Grain
 *   - Leaf subsurface translucency
 *   - Active bed count (plant population)
 *
 * Level 5 = the visual baseline that the prior commit (363dc29) used.
 * Level 10 (default) = sustains every effect Babylon's standard pipeline
 * can produce in a browser, deliberately heavy.
 *
 * Important: applyRenderQuality is called from the store subscriber in
 * BabylonEngine. Re-creation of the ShadowGenerator and re-arming of all
 * shadow casters happens here so the rest of the engine can stay simple.
 */

import { Scene } from '@babylonjs/core/scene';
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { MotionBlurPostProcess } from '@babylonjs/core/PostProcesses/motionBlurPostProcess';
import { VolumetricLightScatteringPostProcess } from '@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess';
import { ColorGradingTexture } from '@babylonjs/core/Materials/Textures/colorGradingTexture';
import { LensFlareSystem } from '@babylonjs/core/LensFlares/lensFlareSystem';
import { LensFlare } from '@babylonjs/core/LensFlares/lensFlare';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { SceneSetupHandle } from './SceneSetup';
import type { LightingState, RenderFXState, ShadowFilterKind } from '../state/twinStore';
import { notify, logBoot, updateStageDetail } from '../state/notify';
import { useTwinStore } from '../state/twinStore';

// ===========================================================================
// Defaults + preset table
// ===========================================================================

/** Defaults — matches commit 363dc29 exactly (= level 5 in the matrix). */
export const RENDER_FX_DEFAULTS: RenderFXState = {
  shadowResolution: 2048,
  shadowFilter: 'pcf-med',
  msaaSamples: 4,
  hardwareScale: 1.0,
  taaEnabled: false,
  ssrEnabled: false,
  dofEnabled: false,
  godRaysEnabled: false,
  motionBlurEnabled: false,
  colorLutEnabled: false,
  chromaticAberrationEnabled: false,
  grainEnabled: false,
  glowLayerEnabled: false,
  lensFlareEnabled: false,
  ssaoSamples: 16,
  leafSSSIntensity: 0.28,
  activeBedCount: 2,
};

interface QualityPreset {
  lightingPatch: Partial<LightingState>;
  fx: RenderFXState;
  label: string;
  hint: string;
}

const baseLightingFor = (extra: Partial<LightingState> = {}): Partial<LightingState> => ({
  ...extra,
});

export const QUALITY_PRESETS: Record<number, QualityPreset> = {
  1: {
    label: 'Minimum',
    hint: '저사양 / 모바일 친화',
    lightingPatch: baseLightingFor({
      bloomEnabled: false, sharpenEnabled: false,
      vignetteEnabled: false, ssaoEnabled: false,
      shadowsEnabled: false,
    }),
    fx: { ...RENDER_FX_DEFAULTS,
      shadowResolution: 0, shadowFilter: 'none',
      msaaSamples: 1, hardwareScale: 0.5,
      ssaoSamples: 8, activeBedCount: 1,
    },
  },
  2: {
    label: 'Very Low',
    hint: '5년+ 기기',
    lightingPatch: baseLightingFor({
      bloomEnabled: false, sharpenEnabled: false,
      vignetteEnabled: true, vignetteWeight: 0.6,
      ssaoEnabled: false,
    }),
    fx: { ...RENDER_FX_DEFAULTS,
      shadowResolution: 512, shadowFilter: 'hard',
      msaaSamples: 1, hardwareScale: 0.75,
      ssaoSamples: 8, activeBedCount: 1,
    },
  },
  3: {
    label: 'Low',
    hint: '일반 노트북',
    lightingPatch: baseLightingFor({
      bloomEnabled: true, bloomThreshold: 0.95, bloomWeight: 0.18,
      sharpenEnabled: false,
      vignetteEnabled: true, vignetteWeight: 1.0,
      ssaoEnabled: false,
    }),
    fx: { ...RENDER_FX_DEFAULTS,
      shadowResolution: 1024, shadowFilter: 'pcf-lo',
      msaaSamples: 2, hardwareScale: 1.0,
      ssaoSamples: 8, activeBedCount: 1,
    },
  },
  4: {
    label: 'Medium-Low',
    hint: '미드 노트북',
    lightingPatch: baseLightingFor({
      bloomEnabled: true, bloomThreshold: 0.9, bloomWeight: 0.25,
      sharpenEnabled: true, sharpenEdge: 0.15,
      vignetteEnabled: true, vignetteWeight: 1.3,
      ssaoEnabled: false,
    }),
    fx: { ...RENDER_FX_DEFAULTS,
      shadowResolution: 2048, shadowFilter: 'pcf-lo',
      msaaSamples: 4, hardwareScale: 1.0,
      ssaoSamples: 12, activeBedCount: 2,
    },
  },
  5: {
    label: 'Medium (baseline)',
    hint: '종전 셋팅과 일치 (363dc29)',
    lightingPatch: baseLightingFor({}),  // empty = use LIGHTING_DEFAULTS
    fx: { ...RENDER_FX_DEFAULTS },
  },
  6: {
    label: 'High',
    hint: 'M1/M2 / 게이밍 노트북',
    lightingPatch: baseLightingFor({
      bloomWeight: 0.4,
      sharpenEdge: 0.25,
      vignetteWeight: 1.8,
      ssaoStrength: 1.5,
    }),
    fx: { ...RENDER_FX_DEFAULTS,
      shadowResolution: 4096, shadowFilter: 'pcf-hi',
      msaaSamples: 4,
      ssaoSamples: 16,
      taaEnabled: true,
      activeBedCount: 3,
    },
  },
  7: {
    label: 'Very High',
    hint: '데스크탑 GPU',
    lightingPatch: baseLightingFor({
      bloomWeight: 0.5,
      sharpenEdge: 0.3,
      vignetteWeight: 2.0,
      ssaoStrength: 2.0,
    }),
    fx: { ...RENDER_FX_DEFAULTS,
      shadowResolution: 4096, shadowFilter: 'pcf-hi',
      msaaSamples: 4,
      ssaoSamples: 24,
      taaEnabled: true, ssrEnabled: true,
      activeBedCount: 4,
    },
  },
  8: {
    label: 'Ultra',
    hint: 'RTX급',
    lightingPatch: baseLightingFor({
      bloomThreshold: 0.7, bloomWeight: 0.6,
      sharpenEdge: 0.35,
      vignetteWeight: 2.2,
      ssaoStrength: 2.5,
    }),
    // QualityProbe 측정 결과 (3 runs 평균): glow layer 가 q7→q8 폭락의 진짜
    // 범인 (Δ -23.1 fps). PBR + bloom (q3+) 으로 빛 효과 이미 표현되므로
    // 시각 손실 < cost 회복. q9/q10 의 glow 는 그대로 유지 — hardwareScale
    // 1.25 가 비용 흡수.
    fx: { ...RENDER_FX_DEFAULTS,
      shadowResolution: 4096, shadowFilter: 'pcss',
      msaaSamples: 8,
      ssaoSamples: 24,
      taaEnabled: true, ssrEnabled: true, dofEnabled: true,
      activeBedCount: 6,
    },
  },
  9: {
    label: 'Extreme',
    hint: '고사양 데스크탑',
    lightingPatch: baseLightingFor({
      bloomThreshold: 0.65, bloomWeight: 0.7,
      sharpenEdge: 0.4,
      vignetteWeight: 2.4,
      ssaoStrength: 3.0,
      exposure: 1.05,
    }),
    fx: { ...RENDER_FX_DEFAULTS,
      shadowResolution: 8192, shadowFilter: 'pcss',
      msaaSamples: 8,
      hardwareScale: 1.25,
      ssaoSamples: 32,
      taaEnabled: true, ssrEnabled: true, dofEnabled: true,
      godRaysEnabled: true,
      glowLayerEnabled: true, lensFlareEnabled: true,
      leafSSSIntensity: 0.34,
      activeBedCount: 8,
    },
  },
  10: {
    label: 'Showpiece (Babylon web 한계)',
    hint: '전시/시네마틱 — M2 Max+ 권장',
    lightingPatch: baseLightingFor({
      bloomThreshold: 0.6, bloomWeight: 0.75,
      sharpenEdge: 0.5,
      vignetteWeight: 2.5,
      ssaoStrength: 3.0,
      exposure: 1.1,
    }),
    fx: { ...RENDER_FX_DEFAULTS,
      // shadow 8192 (256MB texture) + MSAA 8 + hardwareScale 1.5 가
      // 결합되면 M-series Mac 의 WebGPU 메모리 한도 초과 → renderer
      // crash / Safari page reload. 절반 정도로 다운 (시각 손실 최소).
      shadowResolution: 4096, shadowFilter: 'pcss-contact',
      msaaSamples: 4,
      hardwareScale: 1.25,
      ssaoSamples: 32,
      taaEnabled: true, ssrEnabled: true, dofEnabled: true,
      godRaysEnabled: true, motionBlurEnabled: true,
      colorLutEnabled: true,
      chromaticAberrationEnabled: true, grainEnabled: true,
      glowLayerEnabled: true, lensFlareEnabled: true,
      leafSSSIntensity: 0.38,
      activeBedCount: 13,
    },
  },
};

export function activeBedsForCount(count: number, total: number): number[] {
  if (count >= total) return Array.from({ length: total }, (_, i) => i);
  const center = Math.floor(total / 2);
  // Balanced around center: 1, 2 around, 3 (one extra below), 4 each side, etc.
  const out = new Set<number>([center]);
  let step = 1;
  while (out.size < count) {
    const a = center - step;
    const b = center + step;
    if (a >= 0 && out.size < count) out.add(a);
    if (b < total && out.size < count) out.add(b);
    step++;
  }
  return Array.from(out).sort((a, b) => a - b);
}

// ===========================================================================
// Applier — pushes a RenderFXState into the live Babylon scene
// ===========================================================================

/**
 * Runtime objects we create/destroy per quality level. Stored on the
 * scene metadata so the next call can find/dispose them.
 */
interface RuntimeFXHandles {
  glowLayer?: GlowLayer | null;
  motionBlur?: MotionBlurPostProcess | null;
  godRays?: VolumetricLightScatteringPostProcess | null;
  lensFlare?: LensFlareSystem | null;
  shadowGen?: ShadowGenerator | null;
}

const FX_HANDLES_KEY = '__farmsimRenderFX';
function fxHandles(scene: Scene): RuntimeFXHandles {
  const meta = scene.metadata ?? (scene.metadata = {});
  if (!meta[FX_HANDLES_KEY]) meta[FX_HANDLES_KEY] = {};
  return meta[FX_HANDLES_KEY] as RuntimeFXHandles;
}

/** Collect every mesh that should cast a shadow in this scene. */
function collectShadowCasters(scene: Scene): Mesh[] {
  const casters: Mesh[] = [];
  // ★ S143 — showcase seed (SceneInfrastructure.SHOWCASE_SEED = 20260520).
  //   greenhouse 모드에서 extras는 shadow caster 제외 (사용자 _showcase_만 자세히 봄).
  const SHOWCASE_SEED = 20260520;
  for (const m of scene.meshes) {
    // skip ground / heatmap / very thin lines / non-mesh
    if (!m || (m as Mesh).getTotalVertices?.() === 0) continue;
    const name = m.name ?? '';
    if (name === 'ground' || name === 'heatmap' || name.startsWith('wire_')
        || name.startsWith('strings_') || name.startsWith('roof_')
        || name.startsWith('wall_') || name.startsWith('endwall_')
        || name === 'skybox') continue;
    // ★ S143 — Boot profile 측정 결과: 3204 meshes 모두 shadow caster로 등록 시
    //   mesh.isReady() polling 12-13초 (shadow depth pass effect compile per caster).
    //   다음 mesh는 _shadow 의미 미미_ + caster 폭증 원인 → 제외.
    //   (1) truss organs (fruit/calyx/flower/petal_remnant) — ~2793 작은 mesh.
    //   (2) calyx instance source — InstancedMesh shadow 미지원.
    //   (3) extras skinplant (showcase 외) — 멀리 있어 detail shadow 무의미.
    if (name.startsWith('skinplant_truss_')) continue;
    if (name === 'calyx_src') continue;
    if (name.startsWith('skinplant_') && !name.includes(`_${SHOWCASE_SEED}_`)) continue;
    casters.push(m as Mesh);
  }
  return casters;
}

function applyShadowFilter(gen: ShadowGenerator, kind: ShadowFilterKind): void {
  gen.usePoissonSampling = false;
  gen.useExponentialShadowMap = false;
  gen.useBlurExponentialShadowMap = false;
  gen.useCloseExponentialShadowMap = false;
  gen.useBlurCloseExponentialShadowMap = false;
  gen.usePercentageCloserFiltering = false;
  gen.useContactHardeningShadow = false;
  switch (kind) {
    case 'none':       /* nothing — only used when shadowGen is null */ break;
    case 'hard':       /* no extra flag — default = hard PCF 1-tap */ break;
    case 'pcf-lo':
      gen.usePercentageCloserFiltering = true;
      gen.filteringQuality = ShadowGenerator.QUALITY_LOW;
      break;
    case 'pcf-med':
      gen.usePercentageCloserFiltering = true;
      gen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      break;
    case 'pcf-hi':
      gen.usePercentageCloserFiltering = true;
      gen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
      break;
    case 'pcss':
      gen.useContactHardeningShadow = true;
      gen.contactHardeningLightSizeUVRatio = 0.05;
      gen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      break;
    case 'pcss-contact':
      gen.useContactHardeningShadow = true;
      gen.contactHardeningLightSizeUVRatio = 0.08;
      gen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
      break;
  }
}

export function applyRenderQuality(
  scene: Scene,
  setup: SceneSetupHandle,
  engine: Engine | WebGPUEngine,
  fx: RenderFXState,
): void {
  const handles = fxHandles(scene);
  // Some Babylon features have strict WebGPU bind-group requirements
  // that the WebGL2 backend silently tolerates (null textures on lens
  // flares, texture_2d_array samplers on the color LUT). We skip those
  // on WebGPU so the renderer doesn't panic every frame.
  const isWebGPU = (engine as { isWebGPU?: boolean }).isWebGPU === true;

  // Hardware scale (SSAA at >1, downscale at <1). Babylon's setter takes
  // the inverse — scale=1.5 means render 50% larger → setHardwareScalingLevel(1/1.5).
  engine.setHardwareScalingLevel(1 / Math.max(0.25, fx.hardwareScale));

  // MSAA
  setup.pipeline.samples = fx.msaaSamples;

  // Shadow generator — recreate if resolution changed, otherwise just
  // update filter + bias on the existing one. ShadowGen 8192 can take
  // 5-15s on integrated GPUs, so report stage progress along the way.
  const isBooting = useTwinStore.getState().boot.currentStage !== 'ready';
  const existingGen = setup.shadowGenerator;
  const wantsShadows = fx.shadowResolution > 0;
  if (!wantsShadows) {
    setup.sun.shadowEnabled = false;
  } else {
    setup.sun.shadowEnabled = true;
    const currentRes = existingGen.getShadowMap()?.getSize().width ?? 0;
    if (currentRes !== fx.shadowResolution) {
      if (isBooting) {
        updateStageDetail(`그림자맵 ${currentRes}→${fx.shadowResolution} 업그레이드`, 0.2);
        logBoot('log', `quality: 그림자맵 ${currentRes}→${fx.shadowResolution}`);
      }
      // Try to (re)create; fall back to 4096 if 8192 fails (VRAM)
      let res = fx.shadowResolution;
      let gen: ShadowGenerator | null = null;
      try {
        existingGen.dispose();
        gen = new ShadowGenerator(res, setup.sun);
      } catch (err) {
        log.warn(`Shadow ${res} failed, falling back`, err);
        if (res > 4096) {
          res = 4096;
          notify.warn('그림자맵 다운그레이드', `${fx.shadowResolution} → ${res} (VRAM 부족)`);
          try { gen = new ShadowGenerator(res, setup.sun); } catch { gen = null; }
        }
      }
      if (gen) {
        applyShadowFilter(gen, fx.shadowFilter);
        gen.bias = 0.001;
        gen.normalBias = 0.02;
        // Re-arm casters
        if (isBooting) updateStageDetail(`그림자 caster 등록 (${res}×${res})`, 0.5);
        for (const m of collectShadowCasters(scene)) gen.addShadowCaster(m, true);
        // Swap into the SceneSetupHandle so future calls see the new gen.
        (setup as { shadowGenerator: ShadowGenerator }).shadowGenerator = gen;
        handles.shadowGen = gen;
        if (isBooting) logBoot('log', `quality: 그림자 caster ${res}×${res} 등록 완료`);
      }
    } else {
      applyShadowFilter(existingGen, fx.shadowFilter);
    }
  }
  if (isBooting) updateStageDetail('post-FX 적용', 0.8);

  // SSAO sample density (only on WebGL2 — null on WebGPU)
  if (setup.ssao) {
    setup.ssao.samples = fx.ssaoSamples;
  }

  // Default pipeline post-FX toggles built into Babylon
  setup.pipeline.chromaticAberrationEnabled = fx.chromaticAberrationEnabled;
  if (fx.chromaticAberrationEnabled) {
    // 30 = Babylon glitch-art default. 시네마틱 렌즈 결함 톤은 1-2.
    setup.pipeline.chromaticAberration.aberrationAmount = 1.5;
    setup.pipeline.chromaticAberration.radialIntensity = 0.6;
  }
  setup.pipeline.grainEnabled = fx.grainEnabled;
  if (fx.grainEnabled) {
    // 8 = TV 노이즈. 35mm 필름 그레인 톤은 2-4.
    setup.pipeline.grain.intensity = 3;
    setup.pipeline.grain.animated = true;
  }
  // DOF needs the depth+geometry PrePass. WebGPU's PrePassRenderer
  // throws on createInternalTextures (TextureView descriptor undefined),
  // so disable on WebGPU. WebGL2 keeps the full effect.
  if (fx.dofEnabled && isWebGPU) {
    notify.warnWebGPUUnsupported('DOF');
  }
  const dofEnabledEffective = fx.dofEnabled && !isWebGPU;
  setup.pipeline.depthOfFieldEnabled = dofEnabledEffective;
  if (dofEnabledEffective) {
    setup.pipeline.depthOfField.fStop = 1.4;
    setup.pipeline.depthOfField.focalLength = 50;
    setup.pipeline.depthOfField.focusDistance = 6000;
  }

  // Glow layer (instanced once, kept around)
  if (fx.glowLayerEnabled && !handles.glowLayer) {
    const gl = new GlowLayer('fx_glow', scene);
    gl.intensity = 0.3;
    handles.glowLayer = gl;
    // Boost fruit emissive a little so it actually glows
    const fruitMat = scene.getMaterialByName('fruitMat');
    if (fruitMat && 'emissiveColor' in fruitMat) {
      (fruitMat as { emissiveColor: Color3 }).emissiveColor = Color3.FromHexString('#3a1010');
    }
  } else if (!fx.glowLayerEnabled && handles.glowLayer) {
    handles.glowLayer.dispose();
    handles.glowLayer = null;
  }

  // Motion blur — also needs PrePass (motion vector RT). WebGPU skip.
  if (fx.motionBlurEnabled && isWebGPU) {
    notify.warnWebGPUUnsupported('Motion Blur');
  }
  const motionBlurEnabledEffective = fx.motionBlurEnabled && !isWebGPU;
  if (motionBlurEnabledEffective && !handles.motionBlur && scene.activeCamera) {
    const mb = new MotionBlurPostProcess('fx_motionBlur', scene, 1.0, scene.activeCamera);
    mb.motionStrength = 0.5;
    handles.motionBlur = mb;
  } else if (!motionBlurEnabledEffective && handles.motionBlur) {
    handles.motionBlur.dispose();
    handles.motionBlur = null;
  }

  // Volumetric god rays from the sun.
  // WebGPU panics on VLS the same way it does on LensFlare: the
  // post-process's internal RTT renders meshes whose materials never
  // bind the `diffuseSampler` slot it expects, so createBindGroup
  // throws every frame. WebGL2 tolerates the missing binding. Skip
  // on WebGPU until Babylon's VLS pipeline learns to skip the bind.
  // Warn-once when user-enabled FX gets silently disabled on WebGPU.
  // notify.warn dedups by title hash, so repeated calls collapse into one.
  if (fx.godRaysEnabled && isWebGPU) {
    notify.warnWebGPUUnsupported('God Rays');
  }
  if (fx.lensFlareEnabled && isWebGPU) {
    notify.warnWebGPUUnsupported('Lens Flare');
  }
  if (fx.colorLutEnabled && isWebGPU) {
    notify.warnWebGPUUnsupported('Color LUT');
  }

  if (fx.godRaysEnabled && !handles.godRays && scene.activeCamera && !isWebGPU) {
    // VLS constructor: (name, ratio, camera, mesh?, samples?, samplingMode?,
    //                   engine?, reusable?, scene?).
    const godRays = new VolumetricLightScatteringPostProcess(
      'fx_godRays', 1.0, scene.activeCamera, undefined, 80, undefined, undefined, undefined, scene,
    );
    godRays.exposure = 0.18;
    godRays.decay = 0.96;
    godRays.weight = 0.5;
    godRays.density = 0.92;
    if (godRays.mesh && setup.sun) {
      const dir = setup.sun.direction.normalizeToNew().scale(-60);
      godRays.mesh.position = new Vector3(dir.x, dir.y, dir.z);
    }
    handles.godRays = godRays;
  } else if ((!fx.godRaysEnabled || isWebGPU) && handles.godRays && scene.activeCamera) {
    handles.godRays.dispose(scene.activeCamera);
    handles.godRays = null;
  }

  // Lens flare on the sun direction.
  // WebGPU rejects the empty-URL flare textures Babylon's LensFlare ctor
  // sets up (createBindGroup panics on the null texture every frame);
  // WebGL2 silently tolerates them, so we just skip on WebGPU. To fully
  // enable on WebGPU, ship real flare PNG assets and pass their URLs as
  // the 4th arg below.
  if (fx.lensFlareEnabled && !handles.lensFlare && !isWebGPU) {
    const lf = new LensFlareSystem('fx_lensFlare', setup.sun, scene);
    new LensFlare(0.25, 0,   new Color3(1, 1, 1),     '', lf);
    new LensFlare(0.10, 0.4, new Color3(1, 0.8, 0.4), '', lf);
    new LensFlare(0.07, 0.7, new Color3(0.5, 0.4, 1), '', lf);
    new LensFlare(0.12, 1.0, new Color3(1, 0.6, 0.6), '', lf);
    handles.lensFlare = lf;
  } else if ((!fx.lensFlareEnabled || isWebGPU) && handles.lensFlare) {
    handles.lensFlare.dispose();
    handles.lensFlare = null;
  }

  // Color LUT — disabled on WebGPU until Babylon ships a texture_2d_array
  // sampler-compat fix for ColorGradingTexture. Skip silently there;
  // WebGL2 keeps the full effect.
  const ip = setup.pipeline.imageProcessing;
  if (ip) {
    if (fx.colorLutEnabled && !isWebGPU) {
      if (!ip.colorGradingTexture) {
        try {
          const lut = new ColorGradingTexture('/luts/cinematic.3dl', scene);
          ip.colorGradingTexture = lut;
          ip.colorGradingEnabled = true;
        } catch (err) {
          log.warn('Color LUT load failed', err);
        }
      } else {
        ip.colorGradingEnabled = true;
      }
    } else {
      ip.colorGradingEnabled = false;
    }
  }

  // Leaf SSS — push translucency into all cached leaf variants.
  for (const leafMat of scene.materials) {
    if (!leafMat.name.startsWith('leafMat') || !('subSurface' in leafMat)) continue;
    const ss = (leafMat as {
      subSurface: { translucencyIntensity: number; isTranslucencyEnabled: boolean };
    }).subSurface;
    ss.isTranslucencyEnabled = true;
    ss.translucencyIntensity = fx.leafSSSIntensity;
  }

  // Ensure canvas matches the new HW scale
  engine.resize();
}
