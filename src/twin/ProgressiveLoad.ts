import { log } from '../utils/logger';
// ProgressiveLoad — single-plant 모드 진입 시 단계별로 환경 → skeleton →
// lush → quality 점진 적용하면서 매 단계 metric (FPS / heap / mesh count)
// 을 console.log 로 남기는 orchestrator.
//
// 사용자가 cost 가 어디서 폭증하는지 직접 모니터링하는 영구 도구.
// 테스트 한정 아님 — prod 진입 시마다 동작.

import type { Engine } from '@babylonjs/core/Engines/engine';
import type { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import type { Scene } from '@babylonjs/core/scene';
import type { ShowcasePlantHandle } from './ShowcasePlant';
import { useTwinStore } from '../store/twinStore';

export interface ProgressiveLoadHandle {
  /** start a fresh sequence. 이미 도는 중이면 abort 후 새로 시작. */
  start: (opts: { savedQuality: number; currentDay: number }) => void;
  /** mode 전환 / 사용자 quality 변경 시 호출. pending step 취소. */
  abort: (reason: string) => void;
  isRunning: () => boolean;
}

interface PerfMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

interface MemoryWindow {
  memory?: PerfMemory;
}

export function createProgressiveLoad(deps: {
  scene: Scene;
  engine: Engine | WebGPUEngine;
  showcase: ShowcasePlantHandle;
  stepMs?: number;
}): ProgressiveLoadHandle {
  const { scene, engine, showcase } = deps;
  const stepMs = deps.stepMs ?? 2000;

  let running = false;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let currentStageName = '(none)';

  function clearPending(): void {
    if (pendingTimer != null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  function measure(stageLabel: string): void {
    const frameMs = engine.performanceMonitor?.averageFrameTime ?? -1;
    const fps = frameMs > 0 ? (1000 / frameMs).toFixed(1) : '0.0';
    const mem = (window as unknown as MemoryWindow).memory ??
                (performance as unknown as MemoryWindow).memory;
    const heapMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1;
    const meshes = scene.meshes.length;
    const materials = scene.materials.length;
    const t = Math.round(performance.now() - startedAt);
    const padded = stageLabel.padEnd(14, ' ');
    log.dev(
      `[ProgressiveLoad] ${padded}  fps=${fps}  mem=${heapMB}MB  meshes=${meshes}  materials=${materials}  t=${t}ms`,
    );
  }

  function wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        resolve();
      }, ms);
    });
  }

  async function runSequence(savedQuality: number, currentDay: number): Promise<void> {
    startedAt = performance.now();
    log.dev(`[ProgressiveLoad] start (savedQuality=${savedQuality})`);

    // ---- Stage 1: env-only ------------------------------------------
    // Showcase lush + skeleton 둘 다 OFF. quality 1 적용.
    // 환경 (인프라 + IBL + 조명) 만 보임.
    currentStageName = 'env-only';
    showcase.setLushEnabled(false);
    showcase.setSkeletonEnabled(false);
    useTwinStore.getState().setRenderQuality(1);
    await wait(stepMs);
    if (!running) return;
    measure('env-only');

    // ---- Stage 2: skeleton-on ---------------------------------------
    // Skeleton overlay ON, lush 여전히 OFF.
    // 사용자가 골격 시각화로 plant 의 anatomy 를 본 후 다음 단계로.
    currentStageName = 'skeleton-on';
    // skeleton 은 lastState 가 필요 — showcase.update(currentDay) 호출로 lastState 설정.
    // (lush mesh 빌드도 같이 일어남, 그러나 lushGroup.setEnabled(false) 라 안 보임.)
    showcase.update(currentDay);
    showcase.setSkeletonEnabled(true);
    showcase.setLushEnabled(false);
    await wait(stepMs);
    if (!running) return;
    measure('skeleton-on');

    // ---- Stage 3: lush ----------------------------------------------
    // Skeleton OFF, lush ON.
    currentStageName = 'lush';
    showcase.setSkeletonEnabled(false);
    showcase.setLushEnabled(true);
    await wait(stepMs);
    if (!running) return;
    measure('lush');

    // ---- Stages 4..N: quality 2 → ... → savedQuality ----------------
    for (let q = 2; q <= savedQuality; q++) {
      currentStageName = `quality-${q}`;
      useTwinStore.getState().setRenderQuality(q);
      await wait(stepMs);
      if (!running) return;
      measure(`quality-${q}`);
    }

    // ---- Done -------------------------------------------------------
    const total = Math.round(performance.now() - startedAt);
    const frameMs = engine.performanceMonitor?.averageFrameTime ?? -1;
    const fps = frameMs > 0 ? (1000 / frameMs).toFixed(1) : '0.0';
    const mem = (window as unknown as MemoryWindow).memory ??
                (performance as unknown as MemoryWindow).memory;
    const heapMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1;
    log.info(
      `[ProgressiveLoad] complete  total=${total}ms  finalFps=${fps}  finalMem=${heapMB}MB`,
    );
    running = false;
  }

  return {
    start({ savedQuality, currentDay }) {
      // 진행 중이면 abort 후 새로 시작.
      if (running) {
        clearPending();
        log.dev(`[ProgressiveLoad] aborted at stage=${currentStageName}  (restart)`);
      }
      running = true;
      void runSequence(Math.max(1, Math.min(10, savedQuality)), currentDay);
    },
    abort(reason) {
      if (!running) return;
      clearPending();
      log.dev(`[ProgressiveLoad] aborted at stage=${currentStageName}  (${reason})`);
      running = false;
    },
    isRunning: () => running,
  };
}
