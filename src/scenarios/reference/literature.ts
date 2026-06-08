// S3.c (RFP §15) — Reference Truth 표준 범위 (mvp).
//
// docs/proposal/06-reference-truth-railway.md §2 검증 변수 9종.
// 본 mvp는 inline 더미 (TOMSIM/TOMGRO/Gillaspy 등 문헌 평균치 근사).
// S3+ 슬라이스에서 reference/literature.json + measurements/ 정식 도입.

export interface VarRange {
  day: number;
  min: number;
  max: number;
  median: number;
}

export interface VarDef {
  key: string;
  name: string;
  unit: string;
  ranges: VarRange[];
  /** mvp: 시뮬 측정값 (S3+에서 growth-calibration scripts 실제 호출). */
  simulatedSamples?: VarRange[];
}

export const LITERATURE: readonly VarDef[] = [
  {
    key: 'height',
    name: '초장',
    unit: 'cm',
    ranges: [
      { day: 7, min: 5, max: 12, median: 8 },
      { day: 14, min: 15, max: 25, median: 20 },
      { day: 28, min: 35, max: 55, median: 45 },
      { day: 42, min: 65, max: 90, median: 78 },
      { day: 56, min: 95, max: 135, median: 115 },
      { day: 84, min: 175, max: 230, median: 205 },
      { day: 112, min: 230, max: 295, median: 265 },
    ],
    simulatedSamples: [
      { day: 7, min: 7, max: 7, median: 7 },
      { day: 14, min: 19, max: 19, median: 19 },
      { day: 28, min: 47, max: 47, median: 47 },
      { day: 42, min: 80, max: 80, median: 80 },
      { day: 56, min: 119, max: 119, median: 119 },
      { day: 84, min: 215, max: 215, median: 215 },
      { day: 112, min: 270, max: 270, median: 270 },
    ],
  },
  {
    key: 'nodeCount',
    name: '마디 수',
    unit: 'count',
    ranges: [
      { day: 7, min: 2, max: 4, median: 3 },
      { day: 14, min: 4, max: 7, median: 5 },
      { day: 28, min: 8, max: 12, median: 10 },
      { day: 42, min: 13, max: 17, median: 15 },
      { day: 56, min: 18, max: 22, median: 20 },
      { day: 84, min: 28, max: 34, median: 31 },
      { day: 112, min: 38, max: 46, median: 42 },
    ],
    simulatedSamples: [
      { day: 7, min: 3, max: 3, median: 3 },
      { day: 14, min: 6, max: 6, median: 6 },
      { day: 28, min: 11, max: 11, median: 11 },
      { day: 42, min: 16, max: 16, median: 16 },
      { day: 56, min: 21, max: 21, median: 21 },
      { day: 84, min: 32, max: 32, median: 32 },
      { day: 112, min: 43, max: 43, median: 43 },
    ],
  },
  {
    key: 'firstTrussDAS',
    name: '첫 화방 출현',
    unit: 'DAS',
    ranges: [
      { day: 0, min: 28, max: 42, median: 35 },
    ],
    simulatedSamples: [{ day: 0, min: 36, max: 36, median: 36 }],
  },
  {
    key: 'fruitDiameter',
    name: '과실 직경 (T1 평균)',
    unit: 'mm',
    ranges: [
      { day: 60, min: 18, max: 28, median: 23 },
      { day: 75, min: 35, max: 50, median: 42 },
      { day: 90, min: 55, max: 75, median: 65 },
    ],
    simulatedSamples: [
      { day: 60, min: 22, max: 22, median: 22 },
      { day: 75, min: 44, max: 44, median: 44 },
      { day: 90, min: 64, max: 64, median: 64 },
    ],
  },
  {
    key: 'leafCount',
    name: '잎 수',
    unit: 'count',
    ranges: [
      { day: 28, min: 8, max: 14, median: 11 },
      { day: 56, min: 16, max: 22, median: 19 },
      { day: 84, min: 22, max: 30, median: 26 },
      { day: 112, min: 24, max: 32, median: 28 },
    ],
    simulatedSamples: [
      // S3.b 보정 전: W16(D112) +27~74% 초과 → S3.b에서 ±20% 안으로 조정 예정.
      { day: 28, min: 14, max: 14, median: 14 },
      { day: 56, min: 24, max: 24, median: 24 },
      { day: 84, min: 32, max: 32, median: 32 },
      { day: 112, min: 36, max: 36, median: 36 },
    ],
  },
  {
    key: 'LAI',
    name: 'LAI',
    unit: 'm²/m²',
    ranges: [
      { day: 56, min: 1.8, max: 2.6, median: 2.2 },
      { day: 84, min: 2.6, max: 3.6, median: 3.1 },
      { day: 112, min: 2.8, max: 3.8, median: 3.3 },
    ],
    simulatedSamples: [
      { day: 56, min: 2.3, max: 2.3, median: 2.3 },
      { day: 84, min: 3.2, max: 3.2, median: 3.2 },
      { day: 112, min: 3.5, max: 3.5, median: 3.5 },
    ],
  },
  {
    key: 'stemDiameter',
    name: '줄기 직경 (base)',
    unit: 'mm',
    ranges: [
      { day: 56, min: 6, max: 10, median: 8 },
      { day: 84, min: 9, max: 13, median: 11 },
      { day: 112, min: 10, max: 14, median: 12 },
    ],
    simulatedSamples: [
      { day: 56, min: 9, max: 9, median: 9 },
      { day: 84, min: 12, max: 12, median: 12 },
      { day: 112, min: 13, max: 13, median: 13 },
    ],
  },
  {
    key: 'trussInterval',
    name: '화방 간격',
    unit: 'nodes',
    ranges: [
      { day: 56, min: 2.5, max: 3.5, median: 3.0 },
      { day: 84, min: 2.8, max: 3.8, median: 3.3 },
      { day: 112, min: 3.0, max: 4.0, median: 3.5 },
    ],
    simulatedSamples: [
      { day: 56, min: 3.1, max: 3.1, median: 3.1 },
      { day: 84, min: 3.4, max: 3.4, median: 3.4 },
      { day: 112, min: 3.6, max: 3.6, median: 3.6 },
    ],
  },
  {
    key: 'ripeStage',
    name: '과실 색 (ripeStage)',
    unit: '0~5',
    ranges: [
      { day: 75, min: 0.5, max: 1.5, median: 1.0 },
      { day: 90, min: 1.5, max: 3.0, median: 2.2 },
      { day: 105, min: 3.0, max: 4.5, median: 3.8 },
    ],
    simulatedSamples: [
      { day: 75, min: 1.2, max: 1.2, median: 1.2 },
      { day: 90, min: 2.4, max: 2.4, median: 2.4 },
      { day: 105, min: 3.9, max: 3.9, median: 3.9 },
    ],
  },
] as const;

/** ±20% 초과 여부 판정. */
export function isWithinTolerance(simMedian: number, refMedian: number, refMin: number, refMax: number): {
  withinBand: boolean;
  deviationPct: number;
} {
  const deviationPct = ((simMedian - refMedian) / refMedian) * 100;
  return {
    withinBand: simMedian >= refMin && simMedian <= refMax,
    deviationPct,
  };
}
