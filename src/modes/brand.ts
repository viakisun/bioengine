// ★ S141-A — Brand identity single source.
//
// 사용자 결정: 이름 'Phytosim' (식물학+시뮬레이션).
// brand.ts 단일 source — index.html, EntryScreen, LoadingScreen, TopBar에서 import.

export interface BrandSpec {
  name: string;
  tagline: string;
  taglineEn: string;
  description: string;
  version: string;
  status: 'preview' | 'alpha' | 'beta' | 'stable';
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
  // repo / docs는 후속에서 정식 URL 추가
};

/** Get git commit hash if exposed by build (Vite define). fallback 'dev'. */
export function getBuildHash(): string {
  const w = (typeof window !== 'undefined' ? window : {}) as { __BUILD_HASH__?: string };
  return w.__BUILD_HASH__ ?? 'dev';
}
