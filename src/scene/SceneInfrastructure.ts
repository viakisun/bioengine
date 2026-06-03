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

/** ★ S118 — multi-plant extra count (성능 trade). default 4 (1구 건너 1구 첫 bed 일부).
 *  URL `?extraPlants=N` override. N=0 시 single plant 동작 (이전과 동일). */
function resolveExtraPlantCount(): number {
  if (typeof location !== 'undefined') {
    const param = new URLSearchParams(location.search).get('extraPlants');
    if (param !== null) {
      const n = Number.parseInt(param, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 30) return n;
    }
  }
  return 4;  // default — 4 extra (showcase 1 + extra 4 = 5 plants total)
}

export async function buildSceneInfrastructure(scene: Scene): Promise<SceneInfrastructureHandle> {
  updateStageDetail('바닥', 0.05);
  logBoot('log', 'scene: 바닥 mesh');

  // ★ S118 — multi-plant 시 ground 확장. single plant 시 기존 8m 유지.
  const extraN = resolveExtraPlantCount();
  const groundWidth = extraN > 0 ? 32 : 8;
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: groundWidth, height: extraN > 0 ? 6 : 8, subdivisions: 4 },
    scene,
  );
  const groundMat = new PBRMaterial('groundMat', scene);
  groundMat.albedoColor = Color3.FromHexString('#d9d3bf');
  groundMat.metallic = 0;
  groundMat.roughness = 0.88;
  groundMat.environmentIntensity = 0.6;
  ground.material = groundMat;
  ground.receiveShadows = true;

  updateStageDetail('생장 엔진 + 식물', 0.3);
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

  // ★ S118 — 첫 plant (showcase): SCENARIO.plants[0] 위치 (실제 cocopeat hole 좌표).
  //   _이전_: world origin (0,0,0). _이제_: SCENARIO 기반 hole 좌표.
  const showcaseSpec = SCENARIO.plants[0];
  growthEngine.addPlant({ seed: SHOWCASE_SEED, cultivarName: 'tomimaru-muchoo' });
  const skinPos = new Vector3(showcaseSpec.position[0], SUBSTRATE_TOP_Y, 0);

  updateStageDetail('SkinMesh 빌드', 0.5);
  logBoot('log', 'scene: showcase plant');
  await new Promise((r) => setTimeout(r, 0));

  const skinMeshPlant = createSkinMeshPlant(scene, growthEngine, SHOWCASE_SEED, skinPos);
  skinMeshPlant.setVisible(true);

  // ★ S118 — Multi-plant: SCENARIO.plants 다음 N개 추가 (모두 1구 건너 hole에 위치).
  //   SCENARIO PLANT_HOLE_OFFSETS = [-0.4, 0.0, +0.4] (3 holes per bag) — 자동 alternating.
  //   각 plant: addPlant + SkinMeshPlant 인스턴스.
  const extraPlants: SkinMeshPlantHandle[] = [];
  for (let i = 0; i < extraN; i++) {
    const spec = SCENARIO.plants[i + 1];
    if (!spec) break;
    const seed = SHOWCASE_SEED + (i + 1) * 1009;
    growthEngine.addPlant({ seed, cultivarName: 'tomimaru-muchoo' });
    const pos = new Vector3(spec.position[0], SUBSTRATE_TOP_Y, 0);
    const plant = createSkinMeshPlant(scene, growthEngine, seed, pos);
    plant.setVisible(true);
    extraPlants.push(plant);
    if (i % 2 === 0) {
      updateStageDetail(`extra plants ${i + 1}/${extraN}`, 0.5 + 0.2 * (i / extraN));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ★ S118 — Cocopeat bag row (greenhouse 환경 데이터, archive에서 복원).
  updateStageDetail('Cocopeat bags', 0.8);
  logBoot('log', 'scene: cocopeat bags');
  await new Promise((r) => setTimeout(r, 0));
  createCocopeatBags(scene, { centerZ: 0, instanceTag: 'main' });

  updateStageDetail('인프라 완료', 1.0);
  logBoot('log', `scene: 인프라 완료 (plants total=${1 + extraPlants.length})`);
  await new Promise((r) => setTimeout(r, 0));

  return {
    growthEngine,
    skinMeshPlant,
    extraPlants,
  };
}
