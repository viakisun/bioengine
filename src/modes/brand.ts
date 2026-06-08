// ★ S141-A — Brand identity single source.
//
// 사용자 결정: 이름 'Phytosim' (식물학+시뮬레이션).
// brand.ts 단일 source — index.html, EntryScreen, LoadingScreen, TopBar에서 import.
//
// S1.a (RFP §15) — valueProps V1~V5 추가. Splash·헤더 ValueChip에서 사용.

export type ValuePropKey = 'V1' | 'V2' | 'V3' | 'V4' | 'V5';

export interface ValueProp {
  key: ValuePropKey;
  /** 한 단어 영문 식별자 (Workbench·Foundry 등). */
  name: string;
  /** 한 줄 한국어 설명 (3~6단어). */
  ko: string;
  /** 짧은 부연 (카드 본문 1줄). */
  description: string;
}

export const VALUE_PROPS: readonly ValueProp[] = [
  {
    key: 'V1',
    name: 'Decision Workbench',
    ko: '결정 검증',
    description: '사람·알고리즘이 같은 데이터를 보고 같은 결정을 검증',
  },
  {
    key: 'V2',
    name: 'Data Foundry',
    ko: '데이터 주조',
    description: '시기·조건·시점 다양한 학습/검증 데이터를 자동 주조',
  },
  {
    key: 'V3',
    name: 'Mirror Twin',
    ko: '실시간 미러',
    description: '실제 온실 상태와 실시간 동기, 가상↔실제 비교',
  },
  {
    key: 'V4',
    name: 'Reference Truth',
    ko: '표준 레퍼런스',
    description: '표준 생육 모델로서 컨소시엄 공통 baseline',
  },
  {
    key: 'V5',
    name: 'Integration Hub',
    ko: '통합 허브',
    description: '로봇 H/W·인식·작업·관제·운영을 한 환경에 연결',
  },
] as const;

export interface BrandSpec {
  name: string;
  tagline: string;
  taglineEn: string;
  description: string;
  version: string;
  status: 'preview' | 'alpha' | 'beta' | 'stable';
  /** 5 가치명제 — Splash 노출, ValueChip 헤더에서 mode-mapping 시 사용. */
  valueProps: readonly ValueProp[];
  repo?: string;
  docs?: string;
}

export const BRAND: BrandSpec = {
  name: 'Phytosim',
  tagline: '식물 생장 알고리즘 가상 환경',
  taglineEn: 'Botanical Growth Algorithm Simulation',
  description:
    '식물학적 모델에 기반한 실시간 생장 시뮬레이션. ' +
    'TOMSIM / TOMGRO / Gillaspy 문헌 backbone, 환경 변수 + 품종 형질 + 시간을 ' +
    '단일 결정적 산식으로 통합.',
  version: '0.40.0',
  status: 'preview',
  valueProps: VALUE_PROPS,
  // S8.e (RFP §16.7) — docs는 docsify 서버(:8091), repo는 사용자 입력 시 갱신.
  docs: 'http://localhost:8091/',
  repo: '#',
};

/** Get git commit hash if exposed by build (Vite define). fallback 'dev'. */
export function getBuildHash(): string {
  const w = (typeof window !== 'undefined' ? window : {}) as { __BUILD_HASH__?: string };
  return w.__BUILD_HASH__ ?? 'dev';
}
