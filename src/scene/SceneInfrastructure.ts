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
import {
  createGreenhouseBuilding,
  defaultBedZPositions,
  defaultAisleZPositions,
  BED_DEPTH,
} from './greenhouse/GreenhouseBuilding';
import { createBedStands } from './greenhouse/BedStands';
import { createTubeRail } from './greenhouse/TubeRail';

/** Showcase seed — Iter 33 V1 baseline tomato plant.
 *  ★ S116 — URL `?seed=N` override 지원. 사용자: 동일 seed 매 view → "main stem 하드코딩 인상".
 *  Override 시 different genome → different sway phase/amp → different stem curve.
 *  e.g. localhost:8090?seed=42, ?seed=999 비교 가능. Test/snapshot은 default 그대로. */
const SHOWCASE_SEED_DEFAULT = 20260520;
function resolveShowcaseSeed(): number {
  if (typeof location !== 'undefined') {
    const param = new URLSearchParams(location.search).get('seed');
    if (param !== null) {
      const n = Number.parseInt(param, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return SHOWCASE_SEED_DEFAULT;
}
export const SHOWCASE_SEED = resolveShowcaseSeed();

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
  const activeBedCount = resolveActiveBedCount();
  const mainBedIdx = Math.floor(bedZPositions.length / 2);  // center bed
  const activeBedIndices = activeBedsAroundMain(mainBedIdx, activeBedCount, bedZPositions.length);
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
  // ★ S138 — showcase는 mode quality와 무관하게 항상 'high' (사용자가 자세히 관찰).
  const t0 = performance.now();
  const skinMeshPlant = createSkinMeshPlant(scene, growthEngine, SHOWCASE_SEED, skinPos, { quality: 'high' });
  skinMeshPlant.setVisible(true);
  logBoot('log', `scene: showcase plant build ${(performance.now() - t0).toFixed(0)}ms`);
  updateStageDetail('SkinMesh 빌드 (showcase) 완료', 0.65);
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // ★ S136-C — Extras를 베드 _전체 길이_에 _간격 두고_ 분산.
  //   이전 (S122-S123): slot 0,1,2,... → 모두 X=-14.9~-13.1 좁은 1.8m 코너에 클러스터.
  //   이제: stride 기반 — bed당 plant N개를 30m 베드 전체에 균등 분포.
  //   showcase는 slot 45 (중앙), extras는 그 주위에 stride 간격.
  const extraN = resolveExtraPlantCount();
  // ★ S138 — extras quality는 mode quality.level 그대로 따름.
  //   greenhouse low → 'low' (이전 lowQuality 동등)
  //   greenhouse medium → 'medium' (S138 신규: 중간 비용)
  //   greenhouse high → 'high' (showcase 동급 — 비용 큼)
  const extraQuality = getActiveMode().quality.level;
  const extraPlants: SkinMeshPlantHandle[] = [];
  // 각 active bed당 plant 수 계산 후 stride 분산.
  const plantsPerBed = Math.max(1, Math.ceil(extraN / activeBedIndices.length));
  // SCENARIO에 90 positions per bed. Stride = floor(90 / plantsPerBed) → 균등 분포.
  const stride = Math.max(1, Math.floor(90 / plantsPerBed));
  // 각 bed에서 stride 간격으로 slot 사용. showcase 슬롯 45 충돌 회피.
  const SHOWCASE_SLOT = 45;
  let extraIdx = 0;
  for (let perBed = 0; perBed < plantsPerBed && extraIdx < extraN; perBed++) {
    for (const bedIdx of activeBedIndices) {
      if (extraIdx >= extraN) break;
      // stride 기반 slot — perBed가 진행할수록 다른 위치
      let slot = (perBed * stride + Math.floor(stride / 2)) % 90;
      // showcase slot 충돌 시 +1 시프트
      if (bedIdx === mainBedIdx && slot === SHOWCASE_SLOT) slot = (slot + 1) % 90;
      const spec = SCENARIO.plants[slot];
      if (!spec) continue;
      const seed = SHOWCASE_SEED + bedIdx * 100000 + slot * 1009;
      growthEngine.addPlant({ seed, cultivarName: 'tomimaru-muchoo' });
      const pos = new Vector3(spec.position[0], SUBSTRATE_TOP_Y, bedZPositions[bedIdx]);
      // ★ S138 — extras quality는 mode quality.level (low/medium/high) 그대로.
      const plant = createSkinMeshPlant(scene, growthEngine, seed, pos, { quality: extraQuality });
      plant.setVisible(true);
      extraPlants.push(plant);
      extraIdx++;
      // ★ S143 — extras 매 plant마다 progress + yield (이전 매 4 plants).
      //   high quality 시 plant 1개 build ~1-3초 → 4 plants gap 8-12초 → UI 멈춘 듯 보임.
      //   매 plant yield + 1 frame raf로 React render commit 보장.
      updateStageDetail(`extra plants ${extraIdx}/${extraN}`, 0.65 + 0.3 * (extraIdx / extraN));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
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
