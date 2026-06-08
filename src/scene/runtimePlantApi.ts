// §19 — Runtime plant API (boot 후 plant 추가/제거).
//
// 사용자 의도: phenotyping 진입 시 적은 수(default 30)만 빌드 + 슬라이더로 점진적 추가.
//   메모리/시간 안전. Boot frozen 방지.
//
// SceneInfrastructure가 boot 후 setRuntimeContext()로 (scene, engine, bedLayout, used slots) 등록.
// PhenotypingControls 가 add/removeOne 호출.

import type { Scene } from '@babylonjs/core/scene';
import type { GrowthEngine } from '@farmsim/tomato-engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createSkinMeshPlant, type SkinMeshPlantHandle } from './SkinMeshPlant';
import { SCENARIO } from '../data/mockScenario';

// 순환 import 회피 — setSinglePlantSkinMeshRef는 callback으로 주입.
type PlantRefRegister = (plant: SkinMeshPlantHandle | null, index: number) => void;

/**
 * 베드 1개의 slot 순회 순서 — 가운데(slot 45) 시작 → ±stride 양방향 교대 확장.
 *   stride=4 예: 45, 41, 49, 37, 53, 33, 57, 29, 61, ... → X=0 부근부터 좌·우 균등.
 *   로봇이 통로 가운데에서 X 양쪽으로 traverse → plant도 가운데에서 양쪽으로 채워짐.
 */
export function computeSlotOrder(stride: number): number[] {
  const center = 45;
  const out: number[] = [center];
  for (let mag = stride; mag < 90; mag += stride) {
    if (center - mag >= 0) out.push(center - mag);
    if (center + mag < 90) out.push(center + mag);
  }
  return out;
}

export interface RuntimePlantContext {
  scene: Scene;
  growthEngine: GrowthEngine;
  bedZPositions: number[];
  activeBedIndices: number[];
  stride: number;
  showcaseSlot: number;
  mainBedIdx: number;
  substrateTopY: number;
  seedBase: number;
  /** boot 후 이미 등록된 plant 목록 (extraPlants). length로 현재 카운트. */
  plants: SkinMeshPlantHandle[];
  /** Slot 순회 순서 — center-out 라운드로빈 (computeSlotOrder). */
  slotOrder: number[];
  /** SinglePlantOverlay holder register (외부에서 callback 주입). */
  registerPlantRef: PlantRefRegister;
  /** boot 시작 시점 heap (bytes) — plant 1개당 평균 메모리 추정에 사용. */
  heapAtCtxStartBytes: number;
  /** boot로 빌드한 plant 개수 — 평균 계산용. */
  initialPlantCount: number;
}

let ctx: RuntimePlantContext | null = null;

export function setRuntimePlantContext(c: RuntimePlantContext): void {
  ctx = c;
}

/** BabylonEngine에서 boot 후 호출 — useSinglePlantState 의존성 주입. */
export function setRuntimePlantRefRegister(cb: PlantRefRegister): void {
  if (ctx) ctx.registerPlantRef = cb;
}

export function getRuntimePlantContext(): RuntimePlantContext | null {
  return ctx;
}

/** 현재 plant 개수 (extras 기준, showcase 제외). */
export function getRuntimePlantCount(): number {
  return ctx?.plants.length ?? 0;
}

/** Geometry 최대 — slotOrder × activeBeds (showcase 충돌 1개 제외). */
export function getRuntimePlantMaxCount(): number {
  if (!ctx) return 0;
  return ctx.slotOrder.length * ctx.activeBedIndices.length - 1;
}

/** Heap 한계 70% 기반 안전 최대. boot 시점 평균 KB/plant로 산출.
 *  - currentHeap + (safeMax - currentCount) × avgKB ≤ limit × 0.7
 *  - safeMax = currentCount + (limit × 0.7 - currentHeap) / avgKB
 *  geometryMax와 min 비교.
 */
export function getRuntimePlantSafeMaxCount(safetyRatio = 0.7): number {
  if (!ctx) return 0;
  const geomMax = getRuntimePlantMaxCount();
  const perfMem = (performance as unknown as {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  if (!perfMem) return geomMax;

  const currentCount = ctx.plants.length;
  const currentHeap = perfMem.usedJSHeapSize;
  const limit = perfMem.jsHeapSizeLimit;
  const heapDeltaBytes = currentHeap - ctx.heapAtCtxStartBytes;
  const initialN = Math.max(1, ctx.initialPlantCount);

  // 평균 KB/plant (boot 기준). 0보다 작거나 평균 못 잡으면 보수적 1MB.
  const avgBytesPerPlant = heapDeltaBytes > 0 ? heapDeltaBytes / initialN : 1024 * 1024;
  const safeBudget = limit * safetyRatio - currentHeap;
  if (safeBudget <= 0) return currentCount;

  const safeAddable = Math.floor(safeBudget / avgBytesPerPlant);
  return Math.min(geomMax, currentCount + safeAddable);
}

/** 디버그용 — 현재 추정 KB/plant. */
export function getRuntimeAvgKBPerPlant(): number {
  if (!ctx) return 0;
  const perfMem = (performance as unknown as {
    memory?: { usedJSHeapSize: number };
  }).memory;
  if (!perfMem) return 0;
  const delta = perfMem.usedJSHeapSize - ctx.heapAtCtxStartBytes;
  const n = Math.max(1, ctx.initialPlantCount);
  return delta / n / 1024;
}

/** plants.length 기반 deterministic resolve — round-robin (slotOrder × beds).
 *  같은 round (slot index)에서 모든 active bed에 plant 분배 → 통로 따라 균등 분포.
 *  showcase slot 충돌은 skip하고 다음 슬롯으로.
 */
function resolveSlotAt(c: RuntimePlantContext, plantIdx: number): { bedIdx: number; slot: number } | null {
  // plantIdx 0,1,2,... 에 대해 (round, bedRot) 계산.
  //   bedsPerRound = activeBeds.length, total slots = slotOrder.length * bedsPerRound.
  //   round = floor(idx / bedsPerRound), bedRot = idx % bedsPerRound.
  //   단 showcase slot 충돌 시 skip — idx 1만큼 더 진행.
  let idx = plantIdx;
  const beds = c.activeBedIndices.length;
  for (let attempt = 0; attempt < c.slotOrder.length * beds + 5; attempt++) {
    const round = Math.floor(idx / beds);
    if (round >= c.slotOrder.length) return null;
    const bedRot = idx % beds;
    const bedIdx = c.activeBedIndices[bedRot];
    const slot = c.slotOrder[round];
    if (bedIdx === c.mainBedIdx && slot === c.showcaseSlot) {
      idx++; // skip
      continue;
    }
    if (!SCENARIO.plants[slot]) {
      idx++;
      continue;
    }
    return { bedIdx, slot };
  }
  return null;
}

/** 1개 추가. 성공 시 새 plant index, 실패 시 -1. */
export function addOneRuntimePlant(): number {
  if (!ctx) {
    // eslint-disable-next-line no-console
    console.warn('[runtimePlantApi] addOne: ctx not ready');
    return -1;
  }
  // Heap 70% 가드 — limit의 70% 초과 시 add 거부.
  const perfMem = (performance as unknown as {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  if (perfMem && perfMem.usedJSHeapSize > perfMem.jsHeapSizeLimit * 0.7) {
    // eslint-disable-next-line no-console
    console.warn(
      `[runtimePlantApi] addOne: heap 70% 초과 — ${(perfMem.usedJSHeapSize / 1024 / 1024).toFixed(0)}MB / ${(perfMem.jsHeapSizeLimit / 1024 / 1024).toFixed(0)}MB`,
    );
    return -1;
  }
  const target = resolveSlotAt(ctx, ctx.plants.length);
  if (!target) {
    // eslint-disable-next-line no-console
    console.warn(`[runtimePlantApi] addOne: no slot at idx=${ctx.plants.length}`);
    return -1;
  }
  const { bedIdx, slot } = target;
  const spec = SCENARIO.plants[slot];
  if (!spec) return -1;
  const seed = ctx.seedBase + bedIdx * 100000 + slot * 1009;
  try {
    ctx.growthEngine.addPlant({ seed, cultivarName: 'tomimaru-muchoo' });
    const pos = new Vector3(spec.position[0], ctx.substrateTopY, ctx.bedZPositions[bedIdx]);
    const plant = createSkinMeshPlant(ctx.scene, ctx.growthEngine, seed, pos, { quality: 'medium' });
    plant.setVisible(true);
    ctx.plants.push(plant);
    ctx.registerPlantRef(plant, ctx.plants.length);
    return ctx.plants.length - 1;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[runtimePlantApi] addOne failed at bed=${bedIdx} slot=${slot}:`, e);
    return -1;
  }
}

/** 마지막 1개 제거. 성공 시 true. */
export function removeOneRuntimePlant(): boolean {
  if (!ctx || ctx.plants.length === 0) return false;
  const last = ctx.plants.pop();
  if (!last) return false;
  ctx.registerPlantRef(null, ctx.plants.length + 1);
  try {
    last.root.dispose(false, true);
  } catch {
    /* */
  }
  return true;
}

/** target 개수까지 add/remove 반복. 0 → target = +N개, target → 0 = -N개. */
export async function setRuntimePlantCount(target: number, opts?: { onProgress?: (cur: number, target: number) => void }): Promise<void> {
  if (!ctx) return;
  const max = getRuntimePlantMaxCount();
  const clamped = Math.max(0, Math.min(max, target));
  // 점진적 — 매 plant마다 1 frame yield (UI 안 멈춤).
  while (ctx.plants.length < clamped) {
    addOneRuntimePlant();
    opts?.onProgress?.(ctx.plants.length, clamped);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  while (ctx.plants.length > clamped) {
    removeOneRuntimePlant();
    opts?.onProgress?.(ctx.plants.length, clamped);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
}
