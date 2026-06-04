// ★ S136 — Mode registry.
//
// 등록된 모드만 ModeSelector에 표시. 신규 mode 추가 시 여기에 entry 추가하면
// 자동으로 진입 카드 등장. lazy import는 Tier 3 (S140-B code splitting)에서.

import type { ModeSpec, ModeKey } from './types';

export const MODES: Record<ModeKey, ModeSpec> = {
  'single-plant': {
    key: 'single-plant',
    name: '단일 식물 모드',
    description: '시간을 따라 단일 토마토의 성장을 자세히 관찰. 풀 디테일 + 분석 UI.',
    icon: '🌱',
    defaultQuality: {
      level: 'high',
      extraPlants: 0,
      showGreenhouseInfra: false,
    },
    availableQualityLevels: ['high'],  // single-plant은 풀 디테일 우선
  },
  'greenhouse': {
    key: 'greenhouse',
    name: '온실 모드',
    description: '온실 전체 + 다중 식물 관찰. 작물 수 / 베드 수에 따라 성능 trade.',
    icon: '🏠',
    defaultQuality: {
      level: 'medium',
      extraPlants: 14,
      showGreenhouseInfra: true,
    },
    availableQualityLevels: ['low', 'medium', 'high'],
  },
};

export const MODE_KEYS = Object.keys(MODES) as ModeKey[];

export function getMode(key: ModeKey): ModeSpec {
  const m = MODES[key];
  if (!m) throw new Error(`Unknown mode: ${key}`);
  return m;
}

/** URL ?mode=N override. default 'single-plant' (Iter 35 단일 모드 호환). */
export function resolveDefaultMode(): ModeKey {
  if (typeof location !== 'undefined') {
    const param = new URLSearchParams(location.search).get('mode');
    if (param === 'single-plant' || param === 'greenhouse') return param;
  }
  return 'single-plant';
}
