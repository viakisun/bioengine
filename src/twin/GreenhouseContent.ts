// GreenhouseContent — greenhouse 모드에만 존재하는 컨텐츠 일괄 build/dispose.
//
// 영역: supporting plants + heatmap + robot + pathTrail + plantLOD.
// 부팅 시 mode 가 'greenhouse' 이거나 'greenhouse' 진입 시점에 build,
// 'single-plant' 진입 시점에 dispose. SharedEnvironment (인프라/조명/IBL/
// showcase root) 는 별도 영역으로 mode 무관 영구 유지.

import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GrowthEngine } from '@farmsim/tomato-engine';
import { SCENARIO } from '../data/mockScenario';
import { useTwinStore } from '../store/twinStore';
import { logBoot, updateStageDetail } from '../store/notify';
import { createSupportingPlant, type SupportingPlantHandle } from './SupportingPlant';
import { createHeatmap, type HeatmapHandle } from './Heatmap';
import { createRobot, type RobotHandle } from './Robot';
import { createPathTrail, type PathTrailHandle } from './PathTrail';
import { createPlantLODManager, type PlantLODManagerHandle } from './PlantLODManager';
import { attachZonePicker } from './ZonePicker';
import { SUBSTRATE_TOP_Y } from './CocopeatBags';

/**
 * SharedEnvironment 가 결정한 좌표/구성 상수들. greenhouse content build 가
 * supporting plant 좌표 계산에 사용. 영구 영역에서 한 번 계산 후 mode-content
 * 로 넘김.
 */
export interface SharedEnvContext {
  scene: Scene;
  growthEngine: GrowthEngine;
  bedZPositions: number[];        // 13 entries
  activeBedIndices: number[];     // ACTIVE_BED_INDICES
  mainBedIdx: number;             // BED_Z_POSITIONS.indexOf(0)
  plantBlock: number;             // SCENARIO.plantCount
  showcasePlantIndex: number;
  showcaseSeed: number;
  /** Seed for a given (bedIdx, slot). Same function as GreenhouseScene 의 plantSeedFor. */
  plantSeedFor: (bedIdx: number, slot: number) => number;
  /** Cultivar pick for a given (bedIdx, slot). */
  pickCultivar: (bedIdx: number, slot: number) => string;
}

export interface GreenhouseContentHandle {
  supportingPlants: SupportingPlantHandle[];
  heatmap: HeatmapHandle;
  robot: RobotHandle;
  pathTrail: PathTrailHandle;
  plantLOD: PlantLODManagerHandle;
  /** zone hover callback 등록 (예전 GreenhouseSceneHandle 위치). */
  onZoneHover: (cb: (zoneId: number | null) => void) => void;
  onZoneClick: (cb: (zoneId: number | null) => void) => void;
  /** Per-frame update — heatmap/robot/pathTrail + supporting × N. */
  update: (day: number) => void;
  /** 모든 mesh/material/texture + GrowthEngine entry 일괄 해제. After dispose 호출 금지. */
  dispose: () => void;
}

/**
 * Build the greenhouse-mode content (supporting × N + heatmap/robot/pathTrail/plantLOD).
 * GrowthEngine 에 supporting plant 의 entry 를 add 함 (dispose 시 동일 entry removePlant).
 *
 * 진행 도중 setBootStage('plants', ...) 로 BootOverlay 갱신.
 */
export async function buildGreenhouseContent(
  ctx: SharedEnvContext,
): Promise<GreenhouseContentHandle> {
  const { scene, growthEngine, activeBedIndices, mainBedIdx, plantBlock,
    showcasePlantIndex, plantSeedFor, pickCultivar, bedZPositions } = ctx;

  // ---- 1. GrowthEngine 에 supporting plants entry 등록 ---------------
  // (showcase 는 SharedEnvironment build 시 이미 등록됨 — 여기선 건드리지 않음)
  const supportingSeeds: number[] = [];
  const totalToAdd = activeBedIndices.length * plantBlock;
  let addedSoFar = 0;
  for (const bedIdx of activeBedIndices) {
    for (let slot = 0; slot < plantBlock; slot++) {
      if (bedIdx === mainBedIdx && slot === showcasePlantIndex) continue;
      const seed = plantSeedFor(bedIdx, slot);
      growthEngine.addPlant({ seed, cultivarName: pickCultivar(bedIdx, slot) });
      supportingSeeds.push(seed);
      addedSoFar++;
      if (addedSoFar % 20 === 0) {
        updateStageDetail(
          `${addedSoFar}/${totalToAdd} 식물 등록`,
          (addedSoFar / totalToAdd) * 0.4,
          [{ label: 'GrowthEngine', value: `${addedSoFar}/${totalToAdd}` }],
        );
        logBoot('log', `plants: ${addedSoFar}/${totalToAdd} 등록`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  updateStageDetail(`${totalToAdd}/${totalToAdd} 식물 등록 완료`, 0.4);
  logBoot('log', `plants: 등록 완료 (${totalToAdd}개)`);
  await new Promise((r) => setTimeout(r, 0));

  // ---- 2. SupportingPlant mesh build ---------------------------------
  const supportingPlants: SupportingPlantHandle[] = [];
  // parallel to supportingPlants. For main-bed plants this is the
  // SCENARIO.plants index (drives health label per day). For sister
  // beds it's -1.
  const supportingPlantSlotIds: number[] = [];
  let supportIdx = 0;
  const totalSupports = activeBedIndices.length * plantBlock - 1; // minus showcase slot

  updateStageDetail('Supporting 식물 메쉬 빌드 시작', 0.5);
  logBoot('log', `plants: Supporting ${totalSupports}개 빌드 시작`);
  await new Promise((r) => setTimeout(r, 0));

  for (const bedIdx of activeBedIndices) {
    const bedZ = bedZPositions[bedIdx];
    const isMainBed = bedIdx === mainBedIdx;
    for (let slot = 0; slot < plantBlock; slot++) {
      if (isMainBed && slot === showcasePlantIndex) continue;
      const spec = SCENARIO.plants[slot];
      const rebuildOffset = (supportIdx / totalSupports) * 2.0;
      supportingPlants.push(
        createSupportingPlant(
          scene,
          growthEngine,
          plantSeedFor(bedIdx, slot),
          new Vector3(spec.position[0], SUBSTRATE_TOP_Y, bedZ),
          rebuildOffset,
        ),
      );
      supportingPlantSlotIds.push(isMainBed ? slot : -1);
      supportIdx++;
      if (supportIdx % 20 === 0) {
        const supportFrac = supportIdx / totalSupports;
        updateStageDetail(
          `Supporting ${supportIdx}/${totalSupports} 빌드`,
          0.5 + supportFrac * 0.5,
          [{ label: 'Supporting', value: `${supportIdx}/${totalSupports}` }],
        );
        logBoot('log', `plants: ${supportIdx}/${totalSupports} 빌드`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  updateStageDetail(`Supporting 빌드 완료 (${totalSupports}개)`, 1.0);
  logBoot('log', `plants: 빌드 완료 (supporting ${totalSupports}개)`);

  // ---- 3. heatmap / robot / pathTrail ------------------------------
  const heatmap = createHeatmap(scene);
  const robot = createRobot(scene);
  const pathTrail = createPathTrail(scene);

  let hoverCb: ((zoneId: number | null) => void) | null = null;
  let clickCb: ((zoneId: number | null) => void) | null = null;

  attachZonePicker(
    scene,
    heatmap.mesh,
    (zoneId) => {
      heatmap.setHoveredZone(zoneId);
      hoverCb?.(zoneId);
    },
    (zoneId) => clickCb?.(zoneId),
  );

  // ---- 4. plant LOD manager (distance-based billboard swap) --------
  const plantLOD = createPlantLODManager(scene, scene.activeCamera!, supportingPlants);

  // ---- 5. per-frame update ----------------------------------------
  function update(day: number): void {
    heatmap.update(day);
    robot.update(day);
    pathTrail.update(day);
    // Supporting plants — health label / water stress 주입 + rebuild.
    const dayIdx = Math.max(0, Math.min(SCENARIO.durationDays, Math.floor(day)));
    const waterStressOverride = useTwinStore.getState().waterStressOverride;
    for (let i = 0; i < supportingPlants.length; i++) {
      const slotId = supportingPlantSlotIds[i];
      if (slotId < 0) {
        // Sister-bed plant — no scenario health track; default 'normal'.
        supportingPlants[i].update(day, 'normal', waterStressOverride);
        continue;
      }
      const plant = SCENARIO.plants[slotId];
      const snap = plant.daily[Math.min(plant.daily.length - 1, dayIdx)];
      supportingPlants[i].update(day, snap.health, waterStressOverride);
    }
  }

  // ---- 6. dispose (mode 전환 시 일괄 해제) -------------------------
  function dispose(): void {
    // 각 supporting plant 의 mesh + truss TransformNode 해제.
    for (const sp of supportingPlants) sp.dispose();
    supportingPlants.length = 0;
    supportingPlantSlotIds.length = 0;
    // GrowthEngine entry 도 함께 제거 — single-plant 모드에선 720개 entry 사라짐.
    for (const seed of supportingSeeds) growthEngine.removePlant(seed);
    supportingSeeds.length = 0;
    // visualization sub-systems
    plantLOD.dispose();
    pathTrail.dispose();
    robot.dispose();
    heatmap.dispose();
    hoverCb = null;
    clickCb = null;
  }

  return {
    supportingPlants,
    heatmap,
    robot,
    pathTrail,
    plantLOD,
    onZoneHover(cb) { hoverCb = cb; },
    onZoneClick(cb) { clickCb = cb; },
    update,
    dispose,
  };
}
