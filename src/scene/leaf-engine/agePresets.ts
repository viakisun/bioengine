// Iter 36 v5 Phase D — Age preset table (사용자 botanical reference §7).
//
// 5 presets — leafLength + leafletPairs + intercalary + aspectRatio + serration +
// lobeDepth + droop pose + color baseline. Rendering engine이 각 leaf의 agePreset
// (skeleton LeafBladeRef.agePreset)에 따라 lookup → procedural variation 적용.
//
// Conservative 분리 (사용자 결정): 모든 shape parameter는 _rendering engine 내부_.
// Skeleton에는 agePreset key만 (구조 데이터).

export interface AgePresetParams {
  /** 잎 전체 길이 range (cm). [min, max] */
  leafLengthCmRange: readonly [number, number];
  /** 큰 좌우 소엽 pairs range. */
  majorLeafletPairsRange: readonly [number, number];
  /** 큰 소엽 사이 작은 소엽 수 range. */
  intercalaryRange: readonly [number, number];
  /** Secondary leaflet count range (default 0). */
  secondaryRange?: readonly [number, number];
  /** 소엽 aspect ratio range (둥근 1.2 ↔ 길쭉한 4.0). */
  aspectRatioRange: readonly [number, number];
  /** 톱니 진폭 range (잎 폭 대비 0.005-0.06). */
  serrationAmpRange: readonly [number, number];
  /** 큰 lobe 깊이 range (잎 폭 대비 0.03-0.25). */
  lobeDepthRange: readonly [number, number];
  /** Pose droop deg range (음수=위로, 양수=처짐). */
  poseDroopDegRange: readonly [number, number];
  /** 색 baseline (rendering engine이 material 선택). */
  color: 'bright-light-green' | 'green' | 'green-with-yellowing';
  /** Optional: curl 강도 (오래된 잎). */
  curl?: number;
  /** Optional: asymmetry 강도 (복잡한 잎). */
  asymmetry?: number;
  /** Optional: potato-leaf 특수 마진. */
  smoothMargin?: boolean;
  /** Optional: leafLength factor (potato-leaf 1.2× 등). */
  leafLengthFactor?: number;
  /** Optional: leafletCount factor (potato-leaf 0.7×). */
  leafletCountFactor?: number;
}

/**
 * Age preset table — 사용자 botanical reference §7 직접 인용.
 *
 * 5 presets:
 *   1. young — 어린/위쪽 새잎 (2-8cm, 1-2 pairs, 둥근 소엽)
 *   2. mature — 보통 성숙 잎 (10-25cm, 2-4 pairs) ★ 기본 60-70%
 *   3. old — 오래된 아래쪽 잎 (14-28cm, 3-4 pairs, 처짐 + curl)
 *   4. complex — 복잡한 잎 (16-30cm, 4 pairs + 많은 intercalary + 비대칭)
 *   5. potato-leaf — 감자 잎 타입 (smoothMargin, 적은 leaflet)
 */
export const AGE_PRESETS = {
  young: {
    leafLengthCmRange: [2, 8],
    majorLeafletPairsRange: [1, 2],
    intercalaryRange: [0, 2],
    aspectRatioRange: [1.2, 1.8],
    serrationAmpRange: [0.005, 0.015],
    lobeDepthRange: [0.03, 0.08],
    poseDroopDegRange: [-15, -5],   // 위로 들림
    color: 'bright-light-green',
  },
  mature: {
    leafLengthCmRange: [10, 25],
    majorLeafletPairsRange: [2, 4],
    intercalaryRange: [2, 6],
    aspectRatioRange: [1.8, 3.0],
    serrationAmpRange: [0.02, 0.04],
    lobeDepthRange: [0.07, 0.14],
    poseDroopDegRange: [-5, 15],
    color: 'green',
  },
  old: {
    leafLengthCmRange: [14, 28],
    majorLeafletPairsRange: [3, 4],
    intercalaryRange: [3, 8],
    aspectRatioRange: [2.0, 3.5],
    serrationAmpRange: [0.03, 0.06],
    lobeDepthRange: [0.10, 0.20],
    poseDroopDegRange: [15, 35],     // 아래로 처짐
    color: 'green-with-yellowing',
    curl: 0.4,
  },
  complex: {
    leafLengthCmRange: [16, 30],
    majorLeafletPairsRange: [4, 4],
    intercalaryRange: [5, 10],
    secondaryRange: [3, 8],
    aspectRatioRange: [2.2, 3.5],
    serrationAmpRange: [0.04, 0.06],
    lobeDepthRange: [0.14, 0.25],
    poseDroopDegRange: [0, 20],
    color: 'green',
    asymmetry: 0.3,
  },
  'potato-leaf': {
    leafLengthCmRange: [12, 28],
    majorLeafletPairsRange: [2, 3],
    intercalaryRange: [0, 1],
    aspectRatioRange: [1.3, 2.2],
    serrationAmpRange: [0.0, 0.01],
    lobeDepthRange: [0.0, 0.03],
    poseDroopDegRange: [-5, 15],
    color: 'green',
    smoothMargin: true,
    leafLengthFactor: 1.2,
    leafletCountFactor: 0.7,
  },
} as const satisfies Record<string, AgePresetParams>;

export type AgePresetKey = keyof typeof AGE_PRESETS;
