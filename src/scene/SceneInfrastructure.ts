// SceneInfrastructure — Iter 35 single-plant scene host.
//
// Iter 35 PR 2 Phase I: SkinMeshPlant이 _기본 visible_ (사용자 결정 — "skin이
// 메인"). ShowcasePlant 완전 제거 (archive). 단일 plant = SkinMeshPlant.

import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GrowthEngine } from '@farmsim/tomato-engine';
import { SCENARIO } from '../data/mockScenario';
import { logBoot, updateStageDetail } from '../state/notify';
import { createSkinMeshPlant, type SkinMeshPlantHandle } from './SkinMeshPlant';
import { createCocopeatBags } from './greenhouse/CocopeatBags';
import { getActiveMode } from '../modes/activeMode';
import { setRuntimePlantContext, computeSlotOrder } from './runtimePlantApi';
import { PlantManager } from './PlantManager';
import {
  resolveSceneOptions,
  type SceneOptions,
} from './sceneOptions';
import {
  createGreenhouseBuilding,
  defaultBedZPositions,
  defaultAisleZPositions,
  BED_DEPTH,
} from './greenhouse/GreenhouseBuilding';
import { createBedStands } from './greenhouse/BedStands';
import { createTubeRail } from './greenhouse/TubeRail';

// Showcase seed — Iter 33 V1 baseline. 별도 파일 분리 (순환 import 회피).
export { SHOWCASE_SEED } from './showcaseSeed';
import { SHOWCASE_SEED } from './showcaseSeed';

/**
 * Substrate top Y — 기존 CocopeatBags 모듈의 `SUBSTRATE_TOP_Y` 상수.
 * Plant root y 위치 (bedY + bag height + mound apex rise).
 *
 *   SCENARIO.bedY = 0.95
 *   BAG_HEIGHT    = 0.10
 *   MOUND_APEX    = 0.012
 *   → 1.062
 */
export const SUBSTRATE_TOP_Y = SCENARIO.bedY + 0.10 + 0.012;

export interface SceneInfrastructureHandle {
  growthEngine: GrowthEngine;
  /** Iter 35 PR 2: SkinMeshPlant — primary plant renderer.
   *  SDF + marching cubes single watertight stem mesh. Default visible. */
  skinMeshPlant: SkinMeshPlantHandle;
  /** ★ S118 — multi-plant 추가 (포트 건너뛰며 심기). */
  extraPlants: SkinMeshPlantHandle[];
  /** §21 — PlantManager 인스턴스 (bedLayout 모드에서만 생성). runtime add/remove. */
  plantManager: PlantManager | null;
  /** §21 — boot 시 사용된 SceneOptions (update의 base). */
  sceneOptions: SceneOptions;
  /** §21 S4 — runtime 부분 업데이트. patch에 있는 필드만 적용.
   *  지원: initialPlantCount, qualityPreset, cultivation.deleafHeightCm.
   *  V2 후보: plantQuality, bedLayout, activeBedIndices, robot.traverseEnabled. */
  update: (patch: Partial<SceneOptions>) => Promise<void>;
}

// §21 — URL parsing은 resolveSceneOptions (sceneOptions.ts) 으로 통합. 기존 6개 resolveXxx 제거.

/**
 * §21 S3 — buildScene 신규 진입점.
 *   기존 buildSceneInfrastructure는 alias로 유지 (S5에서 호출 site 갱신).
 *   options 미지정 시 URL 자동 resolve (legacy 호환).
 */
export async function buildScene(scene: Scene, options?: SceneOptions): Promise<SceneInfrastructureHandle> {
  return buildSceneInfrastructure(scene, options);
}

export async function buildSceneInfrastructure(scene: Scene, options?: SceneOptions): Promise<SceneInfrastructureHandle> {
  const opts: SceneOptions = options ?? resolveSceneOptions(
    typeof location !== 'undefined' ? location.search : '',
  );
  updateStageDetail('바닥', 0.03);
  logBoot('log', 'scene: 바닥 mesh');

  // ★ S119 — Greenhouse 전체 footprint 커버 (24m × 34m). 이전 8m 단순 floor.
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: 50, height: 28, subdivisions: 4 },
    scene,
  );
  const groundMat = new PBRMaterial('groundMat', scene);
  groundMat.albedoColor = Color3.FromHexString('#d9d3bf');
  groundMat.metallic = 0;
  groundMat.roughness = 0.88;
  groundMat.environmentIntensity = 0.6;
  ground.material = groundMat;
  ground.receiveShadows = true;

  // ★ S119 — Greenhouse building (frame + roof + walls + overhead wires + strings).
  updateStageDetail('온실 건물 + 유인줄', 0.15);
  logBoot('log', 'scene: greenhouse building');
  await new Promise((r) => setTimeout(r, 0));
  const bedZPositions = defaultBedZPositions();
  const aisleZPositions = defaultAisleZPositions();
  const mainBedIdx = Math.floor(bedZPositions.length / 2);  // center bed
  // §21 — opts 우선. 미지정 시 activeBedCount 기반 default.
  const activeBedIndices = opts.activeBedIndices ?? activeBedsAroundMain(
    mainBedIdx,
    opts.activeBedCount,
    bedZPositions.length,
  );
  const bedLayout = opts.bedLayout;
  createGreenhouseBuilding(scene, {
    bedZPositions,
    activePlantBedIndices: activeBedIndices,
    substrateTopY: SUBSTRATE_TOP_Y,
  });

  // ★ S120 — Bed stands (다리) + tube rails (통로 레일).
  updateStageDetail('베드 다리 + 튜브레일', 0.25);
  logBoot('log', 'scene: bed stands + tube rails');
  await new Promise((r) => setTimeout(r, 0));
  const frameMat = new PBRMaterial('bedStandMat', scene);
  frameMat.albedoColor = Color3.FromHexString('#c8c8c0');
  frameMat.metallic = 0.85;
  frameMat.roughness = 0.3;
  for (const [bedIdx, bedZ] of bedZPositions.entries()) {
    createBedStands(scene, {
      centerZ: bedZ,
      lengthM: SCENARIO.bedLengthM,
      bedTopY: SCENARIO.bedY,
      bedDepthM: BED_DEPTH,
      material: frameMat,
      instanceTag: `bed${bedIdx}`,
    });
  }
  for (const [aisleIdx, aisleZ] of aisleZPositions.entries()) {
    createTubeRail(scene, {
      centerZ: aisleZ,
      lengthM: SCENARIO.bedLengthM,
      instanceTag: `aisle${aisleIdx}`,
    });
  }

  // ★ S119 — Cocopeat bags per active bed.
  updateStageDetail('Cocopeat bags', 0.4);
  logBoot('log', 'scene: cocopeat bags');
  await new Promise((r) => setTimeout(r, 0));
  for (const bedIdx of activeBedIndices) {
    createCocopeatBags(scene, { centerZ: bedZPositions[bedIdx], instanceTag: `bed${bedIdx}` });
  }

  // ★ Engine + plants.
  updateStageDetail('생장 엔진 + 식물', 0.5);
  logBoot('log', 'scene: GrowthEngine + plants');
  await new Promise((r) => setTimeout(r, 0));

  const growthEngine = new GrowthEngine();
  growthEngine.setEnvironment({
    temperatureC: 23,
    humidity: 0.7,
    lightHoursPerDay: 14,
    co2ppm: 800,
    substrateWater: 0.6,
    nutrientEC: 3.0,
  });

  // ★ S136-C — Showcase plant at bed CENTER (slot 45 = middle), not corner.
  //   이전: SCENARIO.plants[0] (X=-14.9, 베드 _왼쪽 끝_) → camera 화면 밖.
  //   이제: SCENARIO.plants[45] (X≈0, 베드 _중앙_) → 사용자 즉시 시야.
  const showcaseSpec = SCENARIO.plants[45];
  growthEngine.addPlant({ seed: SHOWCASE_SEED, cultivarName: 'tomimaru-muchoo' });
  const skinPos = new Vector3(showcaseSpec.position[0], SUBSTRATE_TOP_Y, bedZPositions[mainBedIdx]);

  // ★ S143 — showcase build 시작 표시 (0.55) → yield 1 frame → build → 완료 표시 (0.65).
  //   이전: 0.65 표시 + setTimeout(0) yield 후 즉시 sync build → React render commit 못 받아
  //   사용자가 0.5 정체 후 95%로 점프하는 것처럼 보임.
  //   변경: requestAnimationFrame 기반 yield (16ms+) — React commit 보장.
  updateStageDetail('SkinMesh 빌드 (showcase) 시작', 0.55);
  logBoot('log', 'scene: showcase plant');
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  // ★ S138 — showcase는 default 'high'. §19 phenotyping은 'medium' (truss·fruit 보이도록).
  //   'low'는 truss(꽃/과실) skip 되어 토마토 안 보임.
  const showcaseQuality = bedLayout ? 'medium' : 'high';
  const t0 = performance.now();
  const skinMeshPlant = createSkinMeshPlant(scene, growthEngine, SHOWCASE_SEED, skinPos, { quality: showcaseQuality });
  skinMeshPlant.setVisible(true);
  const showcaseMs = performance.now() - t0;
  logBoot('log', `scene: showcase plant build ${showcaseMs.toFixed(0)}ms (quality=${showcaseQuality})`);
  updateStageDetail('SkinMesh 빌드 (showcase) 완료', 0.65);
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // ★ S136-C / §19 / §21 — Extras 배치.
  //   bedLayout 모드: PlantManager + buildInitial (S2/S3).
  //   legacy 모드: ?extraPlants=N 기반 stride 분산 (변경 없음).
  const extraQuality = getActiveMode().quality.level;
  let extraPlants: SkinMeshPlantHandle[] = [];
  let plantManager: PlantManager | null = null;
  const SHOWCASE_SLOT = 45;

  if (bedLayout) {
    // §21 — PlantManager + buildInitial (center-out round-robin, R1~R4 fix 캡슐화).
    const slotOrder = computeSlotOrder(bedLayout.stride);
    const totalMax = slotOrder.length * activeBedIndices.length - 1;
    const initialN = Math.min(opts.initialPlantCount, totalMax);

    plantManager = new PlantManager(scene, growthEngine, {
      bedZPositions,
      activeBedIndices,
      slotOrder,
      mainBedIdx,
      showcaseSlot: SHOWCASE_SLOT,
      substrateTopY: SUBSTRATE_TOP_Y,
      seedBase: SHOWCASE_SEED,
      plantQuality: 'medium',
      // registerPlantRef는 BabylonEngine boot 후 주입 (setRuntimePlantRefRegister 흐름 유지).
      registerPlantRef: () => {},
    });

    const t0Total = performance.now();
    const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const heap0 = perfMem?.usedJSHeapSize ?? 0;
    const heapLimit = perfMem?.jsHeapSizeLimit ?? 0;
    logBoot(
      'log',
      `[phenotyping] boot: initial=${initialN}/${totalMax} plants · heap=${(heap0 / 1024 / 1024).toFixed(1)}MB / limit=${(heapLimit / 1024 / 1024).toFixed(0)}MB · 나머지는 slider`,
    );

    await plantManager.buildInitial(initialN, (placed, target, lastMs, heapDeltaMB) => {
      updateStageDetail(`phenotyping ${placed}/${target}`, 0.65 + 0.3 * (placed / Math.max(1, target)));
      if (placed % 8 === 0) {
        logBoot('log', `[phenotyping] ${placed}/${target} · last=${lastMs.toFixed(0)}ms · heap+${heapDeltaMB.toFixed(1)}MB`);
      }
    });

    const totalS = (performance.now() - t0Total) / 1000;
    logBoot('log', `[phenotyping] boot DONE — ${plantManager.getCount()}/${totalMax} (slider로 늘림) · ${totalS.toFixed(1)}s`);

    // extraPlants는 manager의 plants array reference 공유 (runtime ctx.plants와 동일).
    extraPlants = plantManager.getPlants();

    // 호환 — 기존 runtimePlantApi.ctx 등록 (PhenotypingControls·MemoryStats가 S5 전까지 의존).
    setRuntimePlantContext({
      scene,
      growthEngine,
      bedZPositions,
      activeBedIndices,
      stride: bedLayout.stride,
      showcaseSlot: SHOWCASE_SLOT,
      mainBedIdx,
      substrateTopY: SUBSTRATE_TOP_Y,
      seedBase: SHOWCASE_SEED,
      plants: extraPlants,
      slotOrder,
      registerPlantRef: () => {},
      heapAtCtxStartBytes: heap0,
      initialPlantCount: plantManager.getCount(),
    });
  } else {
    // Legacy: ?extraPlants=N stride 분산. opts.extraPlants 우선, 없으면 mode default.
    const extraN = opts.extraPlants ?? (getActiveMode().quality.extraPlants ?? 0);
    const plantsPerBed = Math.max(1, Math.ceil(extraN / activeBedIndices.length));
    const stride = Math.max(1, Math.floor(90 / plantsPerBed));
    let extraIdx = 0;
    for (let perBed = 0; perBed < plantsPerBed && extraIdx < extraN; perBed++) {
      for (const bedIdx of activeBedIndices) {
        if (extraIdx >= extraN) break;
        let slot = (perBed * stride + Math.floor(stride / 2)) % 90;
        if (bedIdx === mainBedIdx && slot === SHOWCASE_SLOT) slot = (slot + 1) % 90;
        const spec = SCENARIO.plants[slot];
        if (!spec) continue;
        const seed = SHOWCASE_SEED + bedIdx * 100000 + slot * 1009;
        growthEngine.addPlant({ seed, cultivarName: 'tomimaru-muchoo' });
        const pos = new Vector3(spec.position[0], SUBSTRATE_TOP_Y, bedZPositions[bedIdx]);
        const plant = createSkinMeshPlant(scene, growthEngine, seed, pos, { quality: extraQuality });
        plant.setVisible(true);
        extraPlants.push(plant);
        extraIdx++;
        updateStageDetail(`extra plants ${extraIdx}/${extraN}`, 0.65 + 0.3 * (extraIdx / extraN));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    }
  }

  updateStageDetail('인프라 완료', 1.0);
  logBoot('log', `scene: 인프라 완료 (plants=${1 + extraPlants.length}, beds=${bedZPositions.length}, active=${activeBedIndices.length})`);
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // §21 S4 — SceneHandle.update(patch). 현재 mvp 지원 필드만 분기. 미지원은 무시.
  const handle: SceneInfrastructureHandle = {
    growthEngine,
    skinMeshPlant,
    extraPlants,
    plantManager,
    sceneOptions: opts,
    update: async (patch: Partial<SceneOptions>) => {
      // initialPlantCount → PlantManager.setCount
      if (patch.initialPlantCount !== undefined && plantManager) {
        await plantManager.setCount(patch.initialPlantCount);
        handle.sceneOptions = { ...handle.sceneOptions, initialPlantCount: patch.initialPlantCount };
      }
      // qualityPreset → twinStore.setRenderFX (BabylonEngine subscribe가 자동 apply)
      if (patch.qualityPreset !== undefined && patch.qualityPreset !== null) {
        const { useTwinStore } = await import('../state/twinStore');
        const { QUALITY_PRESETS } = await import('./RenderQuality');
        const preset = QUALITY_PRESETS[patch.qualityPreset];
        if (preset) {
          useTwinStore.getState().setRenderFX(preset.fx);
          handle.sceneOptions = { ...handle.sceneOptions, qualityPreset: patch.qualityPreset };
        }
      }
      // cultivation.deleafHeightCm → twinStore.setDefoliationHeightCm
      if (patch.cultivation?.deleafHeightCm !== undefined) {
        const { useTwinStore } = await import('../state/twinStore');
        useTwinStore.getState().setDefoliationHeightCm(patch.cultivation.deleafHeightCm);
        handle.sceneOptions = {
          ...handle.sceneOptions,
          cultivation: { ...(handle.sceneOptions.cultivation ?? {}), ...patch.cultivation },
        };
      }
    },
  };
  return handle;
}

/** Active beds around the main (center) bed. */
function activeBedsAroundMain(mainIdx: number, count: number, total: number): number[] {
  const result: number[] = [mainIdx];
  let offset = 1;
  while (result.length < count && offset <= total) {
    if (mainIdx - offset >= 0) result.push(mainIdx - offset);
    if (result.length >= count) break;
    if (mainIdx + offset < total) result.push(mainIdx + offset);
    offset++;
  }
  return result.sort((a, b) => a - b);
}
