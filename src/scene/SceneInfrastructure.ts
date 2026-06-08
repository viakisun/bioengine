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
}

/** ★ S136-B — Active mode quality.extraPlants 우선, URL이 override.
 *  greenhouse mode default: 14 plants, single-plant: 0.
 *  URL `?extraPlants=N` (0~89) 있으면 mode 무시 (debug 용). */
function resolveExtraPlantCount(): number {
  if (typeof location !== 'undefined') {
    const param = new URLSearchParams(location.search).get('extraPlants');
    if (param !== null) {
      const n = Number.parseInt(param, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 89) return n;
    }
  }
  // Active mode quality config 우선
  return getActiveMode().quality.extraPlants ?? 0;
}

function resolveActiveBedCount(): number {
  if (typeof location !== 'undefined') {
    const param = new URLSearchParams(location.search).get('activeBeds');
    if (param !== null) {
      const n = Number.parseInt(param, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 13) return n;
    }
  }
  return 3;
}

/** §19 phenotyping — `?activeBedIds=4,5,6,7,8,9` 직접 지정 (priority over count). */
function resolveActiveBedIds(totalBeds: number): number[] | null {
  if (typeof location === 'undefined') return null;
  const param = new URLSearchParams(location.search).get('activeBedIds');
  if (!param) return null;
  const ids = param
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n < totalBeds);
  return ids.length > 0 ? ids.sort((a, b) => a - b) : null;
}

/** §19 phenotyping — `?bedLayout=L-R-S` (leftCols-rightCols-stride). */
function resolveBedLayout(): { leftCols: number; rightCols: number; stride: number } | null {
  if (typeof location === 'undefined') return null;
  const param = new URLSearchParams(location.search).get('bedLayout');
  if (!param) return null;
  const parts = param.split('-').map((s) => Number.parseInt(s.trim(), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return { leftCols: parts[0], rightCols: parts[1], stride: Math.max(1, parts[2]) };
}

/** §19 — `?initialPlants=N` (boot 시 phenotyping plant 개수). default 30. */
function resolveInitialPlants(): number {
  if (typeof location === 'undefined') return 30;
  const param = new URLSearchParams(location.search).get('initialPlants');
  if (param === null) return 30;
  const n = Number.parseInt(param, 10);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

export async function buildSceneInfrastructure(scene: Scene): Promise<SceneInfrastructureHandle> {
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
  // §19 phenotyping — URL `?activeBedIds=4,5,6,7,8,9` 우선, 없으면 기존 `?activeBeds=count`.
  const explicitBedIds = resolveActiveBedIds(bedZPositions.length);
  const activeBedIndices = explicitBedIds ?? activeBedsAroundMain(
    mainBedIdx,
    resolveActiveBedCount(),
    bedZPositions.length,
  );
  const bedLayout = resolveBedLayout();
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
  const bedLayoutEarly = resolveBedLayout();
  const showcaseQuality = bedLayoutEarly ? 'medium' : 'high';
  const t0 = performance.now();
  const skinMeshPlant = createSkinMeshPlant(scene, growthEngine, SHOWCASE_SEED, skinPos, { quality: showcaseQuality });
  skinMeshPlant.setVisible(true);
  const showcaseMs = performance.now() - t0;
  logBoot('log', `scene: showcase plant build ${showcaseMs.toFixed(0)}ms (quality=${showcaseQuality})`);
  updateStageDetail('SkinMesh 빌드 (showcase) 완료', 0.65);
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // ★ S136-C / §19 — Extras 배치.
  //   bedLayout 모드 (phenotyping): 좌·우 분리 + hole stride. 활성 베드 모두 채움.
  //   legacy 모드: ?extraPlants=N 기반 stride 분산.
  const extraQuality = getActiveMode().quality.level;
  const extraPlants: SkinMeshPlantHandle[] = [];
  const SHOWCASE_SLOT = 45;

  if (bedLayout) {
    // §19 phenotyping — boot 시 적은 수(default 30)만 빌드, 나머지는 PhenotypingControls 슬라이더로 runtime 추가.
    //   slotOrder = center-out (slot 45 → ±stride → ±2*stride). 로봇 통로 가운데부터 분포.
    //   순서: round 0에서 각 active bed slot 45 → round 1 각 bed slot 45-stride → ...
    const slotOrder = computeSlotOrder(bedLayout.stride);
    const totalMax = slotOrder.length * activeBedIndices.length - 1;
    const initialN = Math.min(resolveInitialPlants(), totalMax);
    const buildTimesMs: number[] = [];
    const t0Total = performance.now();
    const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const heap0 = perfMem?.usedJSHeapSize ?? 0;
    const heapLimit = perfMem?.jsHeapSizeLimit ?? 0;
    logBoot(
      'log',
      `[phenotyping] boot: initial=${initialN}/${totalMax} plants · heap=${(heap0 / 1024 / 1024).toFixed(1)}MB / limit=${(heapLimit / 1024 / 1024).toFixed(0)}MB · 나머지는 slider`,
    );

    let placedIdx = 0;
    let virtIdx = 0; // slotOrder × beds 순회 인덱스 (showcase skip 시 +1)
    while (placedIdx < initialN) {
      const beds = activeBedIndices.length;
      const round = Math.floor(virtIdx / beds);
      if (round >= slotOrder.length) break;
      const bedIdx = activeBedIndices[virtIdx % beds];
      const slot = slotOrder[round];
      virtIdx++;
      if (bedIdx === mainBedIdx && slot === SHOWCASE_SLOT) continue;
      const spec = SCENARIO.plants[slot];
      if (!spec) continue;
      const seed = SHOWCASE_SEED + bedIdx * 100000 + slot * 1009;
      growthEngine.addPlant({ seed, cultivarName: 'tomimaru-muchoo' });
      const pos = new Vector3(spec.position[0], SUBSTRATE_TOP_Y, bedZPositions[bedIdx]);
      const tPlant0 = performance.now();
      const plant = createSkinMeshPlant(scene, growthEngine, seed, pos, { quality: 'medium' });
      plant.setVisible(true);
      buildTimesMs.push(performance.now() - tPlant0);
      extraPlants.push(plant);
      placedIdx++;
      if (placedIdx % 4 === 0 || placedIdx === initialN) {
        const elapsed = (performance.now() - t0Total) / 1000;
        updateStageDetail(`phenotyping ${placedIdx}/${initialN}`, 0.65 + 0.3 * (placedIdx / Math.max(1, initialN)));
        if (placedIdx % 8 === 0) {
          const avgMs = buildTimesMs.reduce((a, b) => a + b, 0) / buildTimesMs.length;
          const heapNow = perfMem?.usedJSHeapSize ?? 0;
          logBoot('log', `[phenotyping] ${placedIdx}/${initialN} · avg=${avgMs.toFixed(0)}ms · heap+${((heapNow - heap0) / 1024 / 1024).toFixed(1)}MB · ${elapsed.toFixed(0)}s`);
        }
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    }
    const totalS = (performance.now() - t0Total) / 1000;
    logBoot('log', `[phenotyping] boot DONE — ${placedIdx}/${totalMax} (slider로 늘림) · ${totalS.toFixed(1)}s`);

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
      initialPlantCount: placedIdx,
    });
  } else {
    // Legacy: ?extraPlants=N stride 분산.
    const extraN = resolveExtraPlantCount();
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

  return {
    growthEngine,
    skinMeshPlant,
    extraPlants,
  };
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
