// Notification + boot-log helpers — call from anywhere (React or not).
//
// Why a thin wrapper:
//   - BabylonEngine, RenderQuality, SceneSetup etc. live outside React,
//     can't useTwinStore(). They need plain function imports.
//   - One-line call sites: `notify.warn('God Rays 비활성화', '...')`.
//   - id 자동 생성 (title 해시) — 같은 경고가 반복 발생해도 중복 알림 안 쌓임.
//
// Usage:
//   import { notify, logBoot, setBootStage, updateStageDetail } from '@/store/notify';
//   notify.info('WebGPU 미지원', 'WebGL2 로 시작합니다');
//   logBoot('log', 'engine: WebGPU 시도');
//   setBootStage('plants', '식물 등록 시작', 0);

import { useTwinStore, type BootStage, type LiveLogLevel } from './twinStore';

/** Stable id from a title — duplicate notifications collapse into one. */
function hashId(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (h * 31 + title.charCodeAt(i)) | 0;
  }
  return `n_${(h >>> 0).toString(36)}`;
}

export const notify = {
  info(title: string, body?: string): void {
    useTwinStore.getState().pushNotification({
      id: hashId('info:' + title),
      level: 'info',
      title,
      body,
    });
  },
  warn(title: string, body?: string): void {
    useTwinStore.getState().pushNotification({
      id: hashId('warn:' + title),
      level: 'warn',
      title,
      body,
    });
  },
  /**
   * Error notification. Pass either an Error object (stack auto-extracted)
   * or just title + optional body string. Title alone is fine for non-throw
   * paths.
   */
  error(title: string, err?: Error | string): void {
    const body = err instanceof Error ? err.message : err;
    const stack = err instanceof Error ? err.stack : undefined;
    useTwinStore.getState().pushNotification({
      id: hashId('error:' + title),
      level: 'error',
      title,
      body,
      stack,
    });
  },
  /**
   * Consolidated WebGPU-incompat warning. Each call adds an effect name
   * to the running list and republishes a single notification (fixed id)
   * — prevents 6 stacked toasts when Lv 10 boost flips on multiple FX
   * at once.
   */
  warnWebGPUUnsupported(effectName: string): void {
    webgpuUnsupportedFx.add(effectName);
    const list = Array.from(webgpuUnsupportedFx).join(', ');
    useTwinStore.getState().pushNotification({
      id: 'n_webgpu_fx_unsupported',
      level: 'warn',
      title: 'WebGPU 백엔드 호환 제한',
      body: `${list} 비활성화 — Babylon WebGPU 가 PrePass / sampler-bind 등을 미지원`,
    });
  },
};

const webgpuUnsupportedFx = new Set<string>();

export function logBoot(level: LiveLogLevel, message: string): void {
  useTwinStore.getState().logBoot(level, message);
}

export function setBootStage(stage: BootStage, detail?: string, progress?: number): void {
  useTwinStore.getState().setBootStage(stage, detail, progress);
}

export function updateStageDetail(
  detail: string,
  progress?: number,
  subCounters?: Array<{ label: string; value: number | string }>,
): void {
  useTwinStore.getState().updateStageDetail(detail, progress, subCounters);
}

export function setBootEta(min: number | null, max: number | null): void {
  useTwinStore.getState().setBootEta(min, max);
}

export function setEnvInfo(patch: Parameters<ReturnType<typeof useTwinStore.getState>['setEnvInfo']>[0]): void {
  useTwinStore.getState().setEnvInfo(patch);
}

export function setEnvCounters(counters: Parameters<ReturnType<typeof useTwinStore.getState>['setEnvCounters']>[0]): void {
  useTwinStore.getState().setEnvCounters(counters);
}
