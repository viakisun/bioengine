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

/** Showcase seed — Iter 33 V1 baseline tomato plant. */
export const SHOWCASE_SEED = 20260520;

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
  /** Iter 35 PR 2: SkinMeshPlant — 유일 plant renderer (ShowcasePlant archived).
   *  SDF + marching cubes single watertight stem mesh. Default visible. */
  skinMeshPlant: SkinMeshPlantHandle;
}

export async function buildSceneInfrastructure(scene: Scene): Promise<SceneInfrastructureHandle> {
  updateStageDetail('바닥', 0.05);
  logBoot('log', 'scene: 바닥 mesh');

  // Simple ground disk — Iter 35: greenhouse 골조 부재이므로 단순 floor만.
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: 8, height: 8, subdivisions: 4 },
    scene,
  );
  const groundMat = new PBRMaterial('groundMat', scene);
  groundMat.albedoColor = Color3.FromHexString('#d9d3bf');
  groundMat.metallic = 0;
  groundMat.roughness = 0.88;
  groundMat.environmentIntensity = 0.6;
  ground.material = groundMat;
  ground.receiveShadows = true;

  updateStageDetail('생장 엔진 + 식물 1', 0.4);
  logBoot('log', 'scene: GrowthEngine + skin plant');
  await new Promise((r) => setTimeout(r, 0));

  // Iter 35: single-plant — GrowthEngine에 1 plant만 등록 (기존 30 plants 대신).
  const growthEngine = new GrowthEngine();
  growthEngine.setEnvironment({
    temperatureC: 23,
    humidity: 0.7,
    lightHoursPerDay: 14,
    co2ppm: 800,
    substrateWater: 0.6,
    nutrientEC: 3.0,
  });
  growthEngine.addPlant({
    seed: SHOWCASE_SEED,
    cultivarName: 'tomimaru-muchoo',
  });

  // Skin position — origin (single plant).
  const skinPos = new Vector3(0, SUBSTRATE_TOP_Y, 0);

  updateStageDetail('SkinMesh 빌드', 0.6);
  logBoot('log', 'scene: SkinMeshPlant');
  await new Promise((r) => setTimeout(r, 0));

  // ★ Iter 35 PR 2 Phase I: SkinMesh default visible — ShowcasePlant 완전 제거.
  const skinMeshPlant = createSkinMeshPlant(
    scene,
    growthEngine,
    SHOWCASE_SEED,
    skinPos,
  );
  skinMeshPlant.setVisible(true);

  updateStageDetail('인프라 완료', 1.0);
  logBoot('log', 'scene: 인프라 완료');
  await new Promise((r) => setTimeout(r, 0));

  return {
    growthEngine,
    skinMeshPlant,
  };
}
