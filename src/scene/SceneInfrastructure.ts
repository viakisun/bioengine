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

/** ★ S128 — extras에 lowQuality 적용 (ultra-low LOD + truss skip).
 *  build 시간 단축 (~10배) — default 작물 4 → 14 (15 plants).
 *  URL `?extraPlants=N` (0~89) override. */
function resolveExtraPlantCount(): number {
  if (typeof location !== 'undefined') {
    const param = new URLSearchParams(location.search).get('extraPlants');
    if (param !== null) {
      const n = Number.parseInt(param, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 89) return n;
    }
  }
  return 14;  // default — showcase (high) + 14 extras (ultra-low) = 15 plants
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

  // Showcase plant — SCENARIO.plants[0] in main bed.
  const showcaseSpec = SCENARIO.plants[0];
  growthEngine.addPlant({ seed: SHOWCASE_SEED, cultivarName: 'tomimaru-muchoo' });
  const skinPos = new Vector3(showcaseSpec.position[0], SUBSTRATE_TOP_Y, bedZPositions[mainBedIdx]);

  updateStageDetail('SkinMesh 빌드 (showcase)', 0.65);
  logBoot('log', 'scene: showcase plant');
  await new Promise((r) => setTimeout(r, 0));
  const skinMeshPlant = createSkinMeshPlant(scene, growthEngine, SHOWCASE_SEED, skinPos);
  skinMeshPlant.setVisible(true);

  // ★ S122 → S123 — Extra plants 다중 active bed 분산 배치.
  //   round-robin: plant i → activeBedIndices[i % activeBedIndices.length].
  //   같은 bed 내 같은 hole 충돌 방지 — SCENARIO.plants 90개 좌표 순환 사용.
  //   default 23 extras (총 24 plants), URL `?extraPlants=N`로 변경.
  const extraN = resolveExtraPlantCount();
  const extraPlants: SkinMeshPlantHandle[] = [];
  // Per-bed counter — bed당 SCENARIO.plants 순서대로 (showcase는 main bed slot 0 점유).
  const perBedNext = new Map<number, number>();
  perBedNext.set(mainBedIdx, 1);  // showcase가 slot 0 사용 중
  for (const bedIdx of activeBedIndices) {
    if (!perBedNext.has(bedIdx)) perBedNext.set(bedIdx, 0);
  }
  for (let i = 0; i < extraN; i++) {
    const bedIdx = activeBedIndices[i % activeBedIndices.length];
    const slot = perBedNext.get(bedIdx)!;
    perBedNext.set(bedIdx, slot + 1);
    const spec = SCENARIO.plants[slot];
    if (!spec) break;
    const seed = SHOWCASE_SEED + bedIdx * 100000 + slot * 1009;
    growthEngine.addPlant({ seed, cultivarName: 'tomimaru-muchoo' });
    const pos = new Vector3(spec.position[0], SUBSTRATE_TOP_Y, bedZPositions[bedIdx]);
    // ★ S128 — extras는 lowQuality: ultra-low LOD + truss skip (빠른 로딩).
    const plant = createSkinMeshPlant(scene, growthEngine, seed, pos, { lowQuality: true });
    plant.setVisible(true);
    extraPlants.push(plant);
    if (i % 4 === 0) {
      updateStageDetail(`extra plants ${i + 1}/${extraN}`, 0.65 + 0.3 * (i / extraN));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  updateStageDetail('인프라 완료', 1.0);
  logBoot('log', `scene: 인프라 완료 (plants=${1 + extraPlants.length}, beds=${bedZPositions.length}, active=${activeBedIndices.length})`);
  await new Promise((r) => setTimeout(r, 0));

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
