// ★ S136 — Mode registry.
//
// 등록된 모드만 ModeSelector에 표시. 신규 mode 추가 시 여기에 entry 추가하면
// 자동으로 진입 카드 등장. lazy import는 Tier 3 (S140-B code splitting)에서.
//
// S1.b (RFP §15) — Workbench·Foundry·Twin 3 모드 신규 등록.
//   기존 single-plant·greenhouse는 호환성 보존 (legacy 카드로 카테고리 분리).

import type { ModeSpec, ModeKey } from './types';

export const MODES: Record<ModeKey, ModeSpec> = {
  'workbench': {
    key: 'workbench',
    name: 'Workbench',
    description: '단일 작물·구역 + 시간 슬라이더 + 의사결정/H/W/calibration 검증.',
    icon: '🔬',
    defaultQuality: {
      level: 'high',
      extraPlants: 0,
      showGreenhouseInfra: false,
    },
    availableQualityLevels: ['high'],
    valueProps: ['V1', 'V4'],
    availability: 'ready',
  },
  'foundry': {
    key: 'foundry',
    name: 'Foundry',
    description: '헤드리스 배치로 학습/검증 데이터 자동 주조 (COCO/mask/depth).',
    icon: '🏭',
    defaultQuality: {
      level: 'medium',
      extraPlants: 0,
      showGreenhouseInfra: false,
    },
    availableQualityLevels: ['low', 'medium', 'high'],
    valueProps: ['V2'],
    availability: 'ready', // S5 mvp — Matrix Setup UI 진입 가능
  },
  'twin': {
    key: 'twin',
    name: 'Twin',
    description: '실제 온실과 실시간 미러 + 비아 관제 임베드 + 다구역 표시.',
    icon: '🌐',
    defaultQuality: {
      level: 'medium',
      extraPlants: 29,
      showGreenhouseInfra: true,
    },
    availableQualityLevels: ['low', 'medium', 'high'],
    valueProps: ['V3', 'V5'],
    availability: 'ready', // S6 mvp — zone heatmap + WireStatus + KPI 진입 가능
  },
  'single-plant': {
    key: 'single-plant',
    name: '단일 식물 모드 (legacy)',
    description: '시간을 따라 단일 토마토의 성장을 자세히 관찰. 풀 디테일 + 분석 UI.',
    icon: '🌱',
    defaultQuality: {
      level: 'high',
      extraPlants: 0,
      showGreenhouseInfra: false,
    },
    availableQualityLevels: ['high'],
    valueProps: ['V4'],
    availability: 'ready',
  },
  'greenhouse': {
    key: 'greenhouse',
    name: '온실 모드 (legacy)',
    description: '온실 전체 + 다중 식물 관찰. 작물 수 / 베드 수에 따라 성능 trade.',
    icon: '🏠',
    defaultQuality: {
      level: 'medium',
      // ★ S136-D — extras 14 → 29 (총 30 plants). 베드 전체 spread.
      //   showcase (high LOD) + 29 extras (lowQuality) = 30 plants.
      //   URL `?extraPlants=N`으로 사용자 조정.
      extraPlants: 29,
      showGreenhouseInfra: true,
    },
    availableQualityLevels: ['low', 'medium', 'high'],
    valueProps: ['V3'],
    availability: 'ready',
  },
};

export const MODE_KEYS = Object.keys(MODES) as ModeKey[];

/** 신규 모드 (RFP §15 정체성) — Splash 상단 노출. */
export const PRIMARY_MODE_KEYS: readonly ModeKey[] = ['workbench', 'foundry', 'twin'] as const;

/** Legacy 모드 — Splash 하단에 작은 카테고리로 노출. */
export const LEGACY_MODE_KEYS: readonly ModeKey[] = ['single-plant', 'greenhouse'] as const;

export function getMode(key: ModeKey): ModeSpec {
  const m = MODES[key];
  if (!m) throw new Error(`Unknown mode: ${key}`);
  return m;
}

/** URL ?mode=N override. default 'single-plant' (Iter 35 단일 모드 호환). */
export function resolveDefaultMode(): ModeKey {
  if (typeof location !== 'undefined') {
    const param = new URLSearchParams(location.search).get('mode');
    if (
      param === 'single-plant' ||
      param === 'greenhouse' ||
      param === 'workbench' ||
      param === 'foundry' ||
      param === 'twin'
    ) {
      return param as ModeKey;
    }
  }
  return 'single-plant';
}
