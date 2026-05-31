// SceneInfrastructure — Iter 35 single-plant scene host.
//
// 기존 `GreenhouseScene.ts` (563 lines, 13 beds + frame + roof + walls + wires +
// supporting plants) 의 _shared subset_ 만 추출:
//   - 단순 ground mesh
//   - GrowthEngine + environment (1 plant)
//   - ShowcasePlant + SkinMeshPlant (single)
//
// 13 beds / greenhouse 골조 / cocopeat / tube rail / 와이어 / supporting plants
// 모두 `src/_archive/twin/`로 archive됨 (Iter 35 Phase C).

import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GrowthEngine } from '@farmsim/tomato-engine';
import { SCENARIO } from '../data/mockScenario';
import { logBoot, updateStageDetail } from '../store/notify';
import { createShowcasePlant, type ShowcasePlantHandle } from './ShowcasePlant';
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
const SUBSTRATE_TOP_Y = SCENARIO.bedY + 0.10 + 0.012;

export interface SceneInfrastructureHandle {
  growthEngine: GrowthEngine;
  showcasePlant: ShowcasePlantHandle;
  /** SSOT Phase 4 — Implicit skin mesh sibling view. Same seed/position
   *  as showcasePlant, default hidden. Toggle via useImplicitMesh store. */
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
  logBoot('log', 'scene: GrowthEngine + showcase plant');
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

  // Showcase position — 기존 GreenhouseScene에서 main bed Z=0 + bed의 중앙 X.
  // Iter 35: 단일 plant이므로 origin 위.
  const showcasePos = new Vector3(0, SUBSTRATE_TOP_Y, 0);

  updateStageDetail('Showcase mesh 빌드', 0.6);
  logBoot('log', 'scene: ShowcasePlant + SkinMeshPlant');
  await new Promise((r) => setTimeout(r, 0));

  const showcasePlant = createShowcasePlant(
    scene,
    growthEngine,
    SHOWCASE_SEED,
    showcasePos,
  );

  // SSOT Phase 4 — sibling SkinMeshPlant at the same world position,
  // sharing GrowthEngine + PlantBase. Default hidden; toggle via store.
  const skinMeshPlant = createSkinMeshPlant(
    scene,
    growthEngine,
    SHOWCASE_SEED,
    showcasePos,
  );
  skinMeshPlant.setVisible(false);

  updateStageDetail('인프라 완료', 1.0);
  logBoot('log', 'scene: 인프라 완료');
  await new Promise((r) => setTimeout(r, 0));

  return {
    growthEngine,
    showcasePlant,
    skinMeshPlant,
  };
}
