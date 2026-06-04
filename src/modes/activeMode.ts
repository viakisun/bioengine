// ★ S136-B — Active mode + quality config holder.
//
// App에서 mode 선택 → setActiveMode() 호출 → SceneInfrastructure가 getActiveMode()로 읽음.
// 이렇게 module-level holder로 우회 (BabylonEngine async init이라 props로 전달 어려움).

import type { ModeKey, ModeQualityConfig } from './types';
import { MODES, resolveDefaultMode } from './registry';

interface ActiveMode {
  mode: ModeKey;
  quality: ModeQualityConfig;
}

let _active: ActiveMode | null = null;

export function setActiveMode(mode: ModeKey, quality: ModeQualityConfig): void {
  _active = { mode, quality };
}

/** Get active mode. fallback: default mode + default quality. */
export function getActiveMode(): ActiveMode {
  if (_active) return _active;
  const mode = resolveDefaultMode();
  return { mode, quality: MODES[mode].defaultQuality };
}
