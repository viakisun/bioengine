// §21 S2 — PlantManager 클래스 + R1~R4 fix 캡슐화.
//
// 기존 runtimePlantApi.ts 의 module-level singleton + 9 export 함수를 단일 클래스로 정리.
// §20 분석에서 발견한 4 버그를 클래스 내부에 캡슐화:
//
//   R1 — safeBudget ≤ 0 시 status='at-limit' + reason 반환 (그냥 currentCount 반환 X)
//   R2 — avgKB 분모를 currentCount 로 (initialPlantCount 고정 X)
//   R3 — setCount 무한 loop guard (consecutive 실패 3회 break + onAbort)
//   R4 — console.warn 상세 + onAbort callback → UI 가시성
//
// S3 buildScene 안에서 인스턴스 생성. S5 PhenotypingControls·MemoryStats가 method 호출.

import type { Scene } from '@babylonjs/core/scene';
import type { GrowthEngine } from '@farmsim/tomato-engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createSkinMeshPlant, type SkinMeshPlantHandle } from './SkinMeshPlant';
import { SCENARIO } from '../data/mockScenario';
import { createLogger } from '../utils/logger';

const log = createLogger('plant');

// §21 S4 — Scene handle holder (PhenotypingControls·MemoryStats가 PlantManager 접근용).
//   순환 import 회피 위해 SceneInfrastructureHandle은 type only export.
import type { SceneInfrastructureHandle } from './SceneInfrastructure';

let activeSceneHandle: SceneInfrastructureHandle | null = null;
export function setActiveSceneHandle(handle: SceneInfrastructureHandle | null): void {
  activeSceneHandle = handle;
}
export function getActiveSceneHandle(): SceneInfrastructureHandle | null {
  return activeSceneHandle;
}
export function getActivePlantManager(): PlantManager | null {
  return activeSceneHandle?.plantManager ?? null;
}

export type PlantRefRegister = (plant: SkinMeshPlantHandle | null, index: number) => void;

export type SafeMaxStatus = 'ok' | 'near-limit' | 'at-limit' | 'no-mem-api';

export interface SafeMaxResult {
  /** Slider max로 사용할 값 (geomMax와 safeBudget 중 작은 쪽). */
  value: number;
  status: SafeMaxStatus;
  /** at-limit 시 사용자 노출 — e.g. "heap 70% (used 1432MB / limit 2048MB)". */
  reason?: string;
}

export interface PlantManagerOpts {
  bedZPositions: number[];
  activeBedIndices: number[];
  slotOrder: number[];
  mainBedIdx: number;
  showcaseSlot: number;
  substrateTopY: number;
  seedBase: number;
  plantQuality: 'low' | 'medium' | 'high';
  /** SinglePlantOverlay holder register. boot/runtime 어디서든 동일 callback. */
  registerPlantRef: PlantRefRegister;
}

export interface SetCountOpts {
  onProgress?: (current: number, target: number) => void;
  onAbort?: (current: number, target: number, reason: string) => void;
}

/**
 * 베드 1개 slot 순서 — center → ±stride 양방향 linear 확장.
 *   stride=2 + totalSlots=150 예: 75, 73, 77, 71, 79, 69, 81, ...
 *   로봇 통로 가운데(X=0) 부근부터 plant 분포.
 *
 * @param stride slot index step (1=연속, 2=하나 건너 하나, ...)
 * @param totalSlots SCENARIO.plants.length (default 150 — 30 bags × 5 holes).
 *   이전 90 default (3 holes/bag) 시 center=45였음. 변경 시 _호환성 유지_ 위해
 *   totalSlots 명시 주입.
 */
export function computeSlotOrder(stride: number, totalSlots: number = 150): number[] {
  const center = Math.floor(totalSlots / 2);
  const out: number[] = [center];
  for (let mag = stride; mag < totalSlots; mag += stride) {
    if (center - mag >= 0) out.push(center - mag);
    if (center + mag < totalSlots) out.push(center + mag);
  }
  return out;
}

const SAFETY_RATIO = 0.7;
const NEAR_LIMIT_RATIO = 0.6;

interface PerfMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function perfMem(): PerfMemory | null {
  return (
    (performance as unknown as { memory?: PerfMemory }).memory ?? null
  );
}

export class PlantManager {
  private readonly scene: Scene;
  private readonly growthEngine: GrowthEngine;
  private readonly opts: PlantManagerOpts;
  private readonly plants: SkinMeshPlantHandle[] = [];
  /** boot 시작 시점 heap (R2: avgKB 계산 baseline). */
  private heapAtStartBytes: number;

  constructor(scene: Scene, growthEngine: GrowthEngine, opts: PlantManagerOpts) {
    this.scene = scene;
    this.growthEngine = growthEngine;
    this.opts = opts;
    this.heapAtStartBytes = perfMem()?.usedJSHeapSize ?? 0;
  }

  // ── 조회 ──────────────────────────────────────────────────────────

  getCount(): number {
    return this.plants.length;
  }

  /** boot 후 SceneInfrastructure에서 plants array reference 공유용. */
  getPlants(): SkinMeshPlantHandle[] {
    return this.plants;
  }

  /** BabylonEngine boot 직후 SinglePlantOverlay register 주입 (PlantRefRegister callback 교체). */
  setRegisterPlantRef(cb: PlantRefRegister): void {
    this.opts.registerPlantRef = cb;
  }

  /** Geometry 최대 — slotOrder × activeBeds (showcase 1 제외). */
  getGeomMax(): number {
    return this.opts.slotOrder.length * this.opts.activeBedIndices.length - 1;
  }

  /** Heap 한계 70% 기반 안전 max + status. R1 fix: at-limit 시 reason 명시. */
  getSafeMax(): SafeMaxResult {
    const geomMax = this.getGeomMax();
    const mem = perfMem();
    if (!mem) {
      return { value: geomMax, status: 'no-mem-api' };
    }

    const currentCount = this.plants.length;
    const usedMB = mem.usedJSHeapSize / 1024 / 1024;
    const limitMB = mem.jsHeapSizeLimit / 1024 / 1024;
    const safeBudgetBytes = mem.jsHeapSizeLimit * SAFETY_RATIO - mem.usedJSHeapSize;

    // R1: heap 70% 초과 → at-limit. value = currentCount + reason.
    if (safeBudgetBytes <= 0) {
      return {
        value: currentCount,
        status: 'at-limit',
        reason: `heap ${(SAFETY_RATIO * 100).toFixed(0)}% (used ${usedMB.toFixed(0)}MB / limit ${limitMB.toFixed(0)}MB)`,
      };
    }

    // R2: avgKB 분모를 currentCount (boot 30 고정 X).
    const avgBytesPerPlant = this.avgBytesPerPlant();
    const safeAddable = Math.floor(safeBudgetBytes / avgBytesPerPlant);
    const value = Math.min(geomMax, currentCount + safeAddable);

    const usageRatio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
    const status: SafeMaxStatus = usageRatio >= NEAR_LIMIT_RATIO ? 'near-limit' : 'ok';

    return { value, status };
  }

  /** R2: 분모 = currentCount. 0이면 1로 보호. */
  getAvgKBPerPlant(): number {
    const mem = perfMem();
    if (!mem) return 0;
    const delta = mem.usedJSHeapSize - this.heapAtStartBytes;
    const n = Math.max(1, this.plants.length);
    return delta / n / 1024;
  }

  private avgBytesPerPlant(): number {
    const mem = perfMem();
    if (!mem) return 1024 * 1024;
    const delta = mem.usedJSHeapSize - this.heapAtStartBytes;
    const n = Math.max(1, this.plants.length);
    return delta > 0 ? delta / n : 1024 * 1024;
  }

  // ── 변경 ──────────────────────────────────────────────────────────

  /** 비동기 add/remove 반복. R3: consecutive 실패 3회 break + onAbort. */
  async setCount(target: number, hooks?: SetCountOpts): Promise<void> {
    const geomMax = this.getGeomMax();
    const clamped = Math.max(0, Math.min(geomMax, target));
    let consecutiveFails = 0;

    while (this.plants.length < clamped) {
      const before = this.plants.length;
      const result = this.addOne();
      if (result < 0 || this.plants.length === before) {
        consecutiveFails++;
        if (consecutiveFails >= 3) {
          const safe = this.getSafeMax();
          const reason =
            safe.status === 'at-limit'
              ? safe.reason ?? 'heap limit reached'
              : 'add-failed';
          // eslint-disable-next-line no-console
          console.warn(
            `[PlantManager] setCount aborted at ${before}/${clamped} — ${reason}`,
          );
          hooks?.onAbort?.(before, clamped, reason);
          return;
        }
      } else {
        consecutiveFails = 0;
      }
      hooks?.onProgress?.(this.plants.length, clamped);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }

    while (this.plants.length > clamped) {
      const before = this.plants.length;
      const ok = this.removeOne();
      if (!ok || this.plants.length === before) {
        // remove 실패는 거의 없지만 안전망.
        consecutiveFails++;
        if (consecutiveFails >= 3) {
          hooks?.onAbort?.(before, clamped, 'remove-failed');
          return;
        }
      }
      hooks?.onProgress?.(this.plants.length, clamped);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  }

  // ── boot 시 사용 (S3에서 호출) ─────────────────────────────────────

  /** boot 시점 plant N개 직접 추가 (showcase 충돌 skip).
   *  setCount와 달리 yield 빈도 가능 + onProgress 호출. */
  async buildInitial(
    targetCount: number,
    onProgress?: (placed: number, target: number, lastMs: number, heapDeltaMB: number) => void,
  ): Promise<void> {
    const startHeap = perfMem()?.usedJSHeapSize ?? 0;
    const total = Math.min(targetCount, this.getGeomMax());
    while (this.plants.length < total) {
      const t0 = performance.now();
      const result = this.addOne();
      if (result < 0) {
        // boot에서 add 실패는 비정상 — 즉시 중단.
        // eslint-disable-next-line no-console
        console.warn(`[PlantManager] buildInitial stopped at ${this.plants.length}/${total}`);
        return;
      }
      const lastMs = performance.now() - t0;
      const heapNow = perfMem()?.usedJSHeapSize ?? 0;
      const heapDeltaMB = (heapNow - startHeap) / 1024 / 1024;
      onProgress?.(this.plants.length, total, lastMs, heapDeltaMB);
      if (this.plants.length % 4 === 0 || this.plants.length === total) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    }
  }

  // ── 정리 ──────────────────────────────────────────────────────────

  dispose(): void {
    for (const p of this.plants) {
      try {
        p.root.dispose(false, true);
      } catch {
        /* */
      }
    }
    this.plants.length = 0;
  }

  // ── 내부 helper ────────────────────────────────────────────────────

  /** plants.length 기반 slot resolve (round-robin + showcase skip).
   *
   * ★ BUG FIX (2026-06-09): 이전 산식이 `idx = plants.length`로 매 호출 reset →
   * showcase skip이 _누적 안 됨_ → bed 6 (mainBed) slot 45 자리가 _bed 7로
   * 옮겨지지만 다음 plant가 _bed 7을 다시 사용_ → 중복 좌표 (사용자 발견:
   * idx=2, idx=3 모두 bed 7 slot 45). Fix: plants.length를 _virtual cursor_로
   * 변환 — showcase 자리를 _건너뛰는 1+1 offset_ 적용. 결과: 각 (bed, slot)
   * 조합 _완전 유니크_, 비어있는 자리 = showcase (별도 plant).
   */
  private resolveNextSlot(): { bedIdx: number; slot: number } | null {
    const beds = this.opts.activeBedIndices.length;
    // Showcase 자리의 _virtual cursor 위치_ 산출 (slot-major iteration).
    const showcaseRound = this.opts.slotOrder.indexOf(this.opts.showcaseSlot);
    const showcaseBedRot = this.opts.activeBedIndices.indexOf(this.opts.mainBedIdx);
    const showcaseCursor = showcaseRound >= 0 && showcaseBedRot >= 0
      ? showcaseRound * beds + showcaseBedRot
      : -1;
    // plants.length → cursor: showcase 자리를 _건너뛰는 1 offset_.
    let cursor = this.plants.length;
    if (showcaseCursor >= 0 && cursor >= showcaseCursor) cursor++;
    for (let attempt = 0; attempt < this.opts.slotOrder.length * beds + 5; attempt++) {
      const round = Math.floor(cursor / beds);
      if (round >= this.opts.slotOrder.length) return null;
      const bedRot = cursor % beds;
      const bedIdx = this.opts.activeBedIndices[bedRot];
      const slot = this.opts.slotOrder[round];
      if (bedIdx === this.opts.mainBedIdx && slot === this.opts.showcaseSlot) {
        cursor++;
        continue;  // safety — 이론상 도달 불가 (위 offset으로 skip 처리), 방어용.
      }
      if (!SCENARIO.plants[slot]) {
        cursor++;
        continue;
      }
      return { bedIdx, slot };
    }
    return null;
  }

  /** 1개 추가. 성공 시 새 plant index, 실패 시 -1. */
  private addOne(): number {
    // R1 가드 — heap 70% 초과 시 add 거부.
    const mem = perfMem();
    if (mem && mem.usedJSHeapSize > mem.jsHeapSizeLimit * SAFETY_RATIO) {
      log.warn(
        `addOne rejected: heap ${(SAFETY_RATIO * 100).toFixed(0)}% — used ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(0)}MB / ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0)}MB`,
      );
      return -1;
    }

    const target = this.resolveNextSlot();
    if (!target) {
      log.warn(`addOne: no slot at idx=${this.plants.length}`);
      return -1;
    }
    const { bedIdx, slot } = target;
    const spec = SCENARIO.plants[slot];
    if (!spec) return -1;
    const seed = this.opts.seedBase + bedIdx * 100000 + slot * 1009;
    try {
      this.growthEngine.addPlant({ seed, cultivarName: 'tomimaru-muchoo' });
      const pos = new Vector3(spec.position[0], this.opts.substrateTopY, this.opts.bedZPositions[bedIdx]);
      const plant = createSkinMeshPlant(this.scene, this.growthEngine, seed, pos, {
        quality: this.opts.plantQuality,
      });
      plant.setVisible(true);
      this.plants.push(plant);
      this.opts.registerPlantRef(plant, this.plants.length);
      // 작물 위치 디버그 로그 (사용자 요청 "어디에 있는거냐" 진단용).
      // debug level — default silent, ?debug=plant URL 시만 출력. 진단 완료 후
      // spam 방지 + opt-in 유지 (다시 진단 필요 시 즉시 노출 가능).
      const idx = this.plants.length - 1;
      log.debug(
        `add idx=${String(idx).padStart(3)} bed=${bedIdx} slot=${String(slot).padStart(2)} `
        + `X=${pos.x.toFixed(3)} Y=${pos.y.toFixed(3)} Z=${pos.z.toFixed(3)} seed=${seed}`,
      );
      return this.plants.length - 1;
    } catch (e) {
      log.error(`addOne failed at bed=${bedIdx} slot=${slot}:`, e);
      return -1;
    }
  }

  /** 마지막 1개 제거. */
  private removeOne(): boolean {
    if (this.plants.length === 0) return false;
    const last = this.plants.pop();
    if (!last) return false;
    this.opts.registerPlantRef(null, this.plants.length + 1);
    try {
      last.root.dispose(false, true);
    } catch {
      /* */
    }
    return true;
  }
}
