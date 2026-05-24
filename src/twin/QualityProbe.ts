// QualityProbe — q7 baseline 위에 q8 의 fx 변경 4가지를 단일 항목씩 적용하며
// fps 를 측정하는 진단 도구. single-plant 모드에서 사용자가 DevTools 의
// `window.__farmsim.qualityProbe()` 로 트리거.
//
// 측정 대상:
//   q7 baseline → q7 + pcss shadow → q7 + msaa 8 → q7 + dof → q7 + glow
//   → q8 (all 4 combined, sanity check)
//   → 시작 전 quality 로 복원
//
// 마지막에 ranking 출력 — Δfps 가 큰 항목이 q7→q8 폭락의 진짜 범인.

import type { Engine } from '@babylonjs/core/Engines/engine';
import type { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneSetupHandle } from './SceneSetup';
import type { RenderFXState } from '../store/twinStore';
import { QUALITY_PRESETS, applyRenderQuality } from './RenderQuality';
import { useTwinStore } from '../store/twinStore';

export interface QualityProbeHandle {
  start: () => Promise<void>;
  abort: (reason: string) => void;
  isRunning: () => boolean;
}

interface MemoryWindow {
  memory?: { usedJSHeapSize: number };
}

interface StepResult {
  label: string;
  fps: number;
  memMB: number;
}

export function createQualityProbe(deps: {
  scene: Scene;
  engine: Engine | WebGPUEngine;
  sceneSetup: SceneSetupHandle;
  /** progressive 가 도는 중이면 측정 거부. null/undefined 면 검사 안 함. */
  progressiveIsRunning?: () => boolean;
  stepMs?: number;
}): QualityProbeHandle {
  const { scene, engine, sceneSetup, progressiveIsRunning } = deps;
  const stepMs = deps.stepMs ?? 3000;

  let running = false;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let abortReason: string | null = null;

  function clearPending(): void {
    if (pendingTimer != null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  function wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        resolve();
      }, ms);
    });
  }

  function readMem(): number {
    const mem = (performance as unknown as MemoryWindow).memory;
    return mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1;
  }

  function readFps(): number {
    const frameMs = engine.performanceMonitor?.averageFrameTime ?? -1;
    return frameMs > 0 ? 1000 / frameMs : 0;
  }

  /** stepMs/2 안정화 + stepMs/2 측정 — 측정 window 중 평균 fps. */
  async function applyAndMeasure(label: string, fx: RenderFXState): Promise<StepResult> {
    try {
      applyRenderQuality(scene, sceneSetup, engine, fx);
    } catch (err) {
      console.warn(`[QualityProbe] applyRenderQuality failed at ${label}:`, err);
    }
    // 안정화 — shadow generator 재생성, post-FX pipeline rebuild 흡수.
    await wait(stepMs / 2);
    if (!running) return { label, fps: -1, memMB: -1 };

    // 측정 window — performanceMonitor 의 rolling average 그대로 read.
    // 한 번 더 wait 후 read 해서 measurement window 가 표본수 충분하게.
    await wait(stepMs / 2);
    if (!running) return { label, fps: -1, memMB: -1 };

    const fps = readFps();
    const memMB = readMem();
    const padded = label.padEnd(22, ' ');
    console.log(`[QualityProbe] ${padded}  fps=${fps.toFixed(1)}  mem=${memMB}MB`);
    return { label, fps, memMB };
  }

  async function runSequence(): Promise<void> {
    // ---- Pre-checks ----------------------------------------------------
    const store = useTwinStore.getState();
    if (store.mode !== 'single-plant') {
      console.warn(
        '[QualityProbe] mode 가 single-plant 이 아닙니다. greenhouse 모드에서는 supporting 720 의 영향 으로 측정 의도가 흐려짐. 중단.',
      );
      running = false;
      return;
    }
    if (progressiveIsRunning?.()) {
      console.warn(
        '[QualityProbe] ProgressiveLoad 가 진행 중. complete 로그 확인 후 다시 시도 부탁.',
      );
      running = false;
      return;
    }

    const restoreQuality = store.renderQuality;
    const q7 = QUALITY_PRESETS[7];
    const q8 = QUALITY_PRESETS[8];
    if (!q7 || !q8) {
      console.warn('[QualityProbe] QUALITY_PRESETS[7/8] 미존재. 중단.');
      running = false;
      return;
    }

    console.log(
      `[QualityProbe] start (q7 baseline, stepMs=${stepMs}, restoreQuality=${restoreQuality})`,
    );
    const startedAt = performance.now();

    // ---- Step 1: q7 baseline ------------------------------------------
    const r0 = await applyAndMeasure('q7 baseline', q7.fx);
    if (!running) return;

    // ---- Steps 2-5: q7 + 단일 항목 토글 -------------------------------
    const r1 = await applyAndMeasure('q7 + pcss shadow', { ...q7.fx, shadowFilter: 'pcss' });
    if (!running) return;

    const r2 = await applyAndMeasure('q7 + msaa 8', { ...q7.fx, msaaSamples: 8 });
    if (!running) return;

    const r3 = await applyAndMeasure('q7 + dof', { ...q7.fx, dofEnabled: true });
    if (!running) return;

    const r4 = await applyAndMeasure('q7 + glow', { ...q7.fx, glowLayerEnabled: true });
    if (!running) return;

    // ---- Step 6: q8 sanity check --------------------------------------
    const r5 = await applyAndMeasure('q8 (all 4 combined)', q8.fx);
    if (!running) return;

    // ---- Restore ------------------------------------------------------
    const restorePreset = QUALITY_PRESETS[restoreQuality];
    if (restorePreset) {
      try {
        applyRenderQuality(scene, sceneSetup, engine, restorePreset.fx);
      } catch {
        // best-effort
      }
    }
    useTwinStore.getState().setRenderQuality(restoreQuality);

    // ---- Ranking ------------------------------------------------------
    const baseline = r0.fps;
    const deltas: Array<{ key: string; dfps: number }> = [
      { key: 'pcss', dfps: baseline - r1.fps },
      { key: 'msaa', dfps: baseline - r2.fps },
      { key: 'dof', dfps: baseline - r3.fps },
      { key: 'glow', dfps: baseline - r4.fps },
    ];
    deltas.sort((a, b) => b.dfps - a.dfps);
    const total = Math.round(performance.now() - startedAt);
    const rankStr = deltas
      .map((d) => `${d.key}:-${d.dfps.toFixed(1)}`)
      .join('  ');
    console.log(
      `[QualityProbe] complete  total=${total}ms  restoredQuality=${restoreQuality}`,
    );
    console.log(`[QualityProbe] ranking: ${rankStr}`);
    console.log(
      `[QualityProbe] q8 sanity: fps=${r5.fps.toFixed(1)} (single-toggle sum ≈ ${deltas
        .reduce((s, d) => s + d.dfps, 0)
        .toFixed(1)} fps drop)`,
    );

    running = false;
  }

  return {
    async start() {
      if (running) {
        console.warn('[QualityProbe] 이미 진행 중. abort 후 재시작.');
        clearPending();
        running = false;
        abortReason = 'restart';
      }
      running = true;
      abortReason = null;
      try {
        await runSequence();
      } catch (err) {
        console.error('[QualityProbe] 측정 중 예외:', err);
        running = false;
      }
    },
    abort(reason) {
      if (!running) return;
      clearPending();
      console.log(`[QualityProbe] aborted (${reason})`);
      abortReason = reason;
      running = false;
    },
    isRunning: () => running,
  };
}
