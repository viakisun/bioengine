// Iter 36 v5 Phase D — Correlation rules (사용자 botanical reference §8).
//
// "잎이 클수록 → 소엽 수↑ → intercalary↑ → 톱니↑ → 처짐↑"
// "어린 잎일수록 → 작음 → 둥근 소엽 → 톱니 약함 → 잎자루 위로 들림"
//
// complexity seed (0-1)가 _묶음 산식_의 입력. linear lerp으로 다음 fields를 동시
// 변경 — 완전 random 시 잎이 _이상해짐_. 묶음 변화가 자연스러움 핵심.

import type { AgePresetParams } from './agePresets';

export interface ResolvedLeafParams {
  /** 최종 잎 길이 (m). */
  leafLengthM: number;
  /** 최종 primary leaflet pairs. */
  primaryPairs: number;
  /** 최종 intercalary leaflet 수. */
  intercalaryCount: number;
  /** 최종 secondary leaflet 수. */
  secondaryCount: number;
  /** 최종 aspect ratio. */
  aspectRatio: number;
  /** 최종 톱니 진폭. */
  serrationAmp: number;
  /** 최종 톱니 빈도 (큰 소엽 한쪽당 개수). */
  serrationFreq: number;
  /** 최종 lobe 깊이. */
  lobeDepth: number;
  /** 좌우 비대칭 (0=대칭, 0.08=8% rachis offset). */
  asymmetry: number;
  /** Pose droop deg (음수=위로, 양수=처짐). */
  poseDroopDeg: number;
  /** 색 baseline. */
  color: AgePresetParams['color'];
  /** Optional: curl 강도. */
  curl?: number;
  /** Optional: potato-leaf smoothMargin. */
  smoothMargin?: boolean;
}

/**
 * Linear lerp helper — range [min, max]에서 t (0-1) 만큼 보간.
 * t를 [0, 1]로 clamp.
 */
function lerp(range: readonly [number, number], t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return range[0] + (range[1] - range[0]) * clamped;
}

/**
 * Correlation 산식 적용 — complexity seed 0-1을 _묶음 변화_로 변환.
 *
 * 사용자 §8 직접 매핑:
 *   - leafLength: complexity 0 → range[0], 1 → range[1] (linear)
 *   - primaryPairs: 동일 (floor)
 *   - intercalary: complexity^2 (큰 잎에서 더 빠르게 증가)
 *   - serration: complexity (선형)
 *   - asymmetry: 0.02 + complexity × 0.06 (2-8%)
 *   - lobeDepth: complexity (선형)
 *   - droop: 음수 (어린) → 양수 (성숙)
 */
export function applyCorrelation(
  complexity: number,
  preset: AgePresetParams,
): ResolvedLeafParams {
  const c = Math.max(0, Math.min(1, complexity));

  // 잎 길이 — linear, potato-leaf factor 적용.
  const leafLengthCm = lerp(preset.leafLengthCmRange, c);
  const factor = preset.leafLengthFactor ?? 1.0;
  const leafLengthM = (leafLengthCm * factor) / 100;

  // leaflet 수 — floor, potato-leaf factor 적용.
  const leafletFactor = preset.leafletCountFactor ?? 1.0;
  const primaryPairs = Math.floor(lerp(preset.majorLeafletPairsRange, c) * leafletFactor);
  // intercalary는 complexity^2 — 큰 잎에서 더 빠르게 증가 (§8 "잎이 클수록 → intercalary↑")
  const intercalaryCount = Math.floor(lerp(preset.intercalaryRange, c * c) * leafletFactor);
  const secondaryRange = preset.secondaryRange ?? [0, 0];
  const secondaryCount = Math.floor(lerp(secondaryRange, c) * leafletFactor);

  // shape parameters — linear.
  const aspectRatio = lerp(preset.aspectRatioRange, c);
  const serrationAmp = lerp(preset.serrationAmpRange, c);
  // serration frequency — 사용자 §4 표 ("큰 소엽 10-28개 / 작은 5-16개")
  const serrationFreq = Math.floor(10 + c * 18);  // 10-28
  const lobeDepth = lerp(preset.lobeDepthRange, c);

  // 좌우 비대칭 — 0.02 + c × 0.06 (사용자 §8 "복잡한 잎일수록 좌우 비대칭 증가").
  const asymmetry = (preset.asymmetry ?? 0) + 0.02 + c * 0.06;

  // pose droop — preset range linear.
  const poseDroopDeg = lerp(preset.poseDroopDegRange, c);

  return {
    leafLengthM,
    primaryPairs: Math.max(1, primaryPairs),
    intercalaryCount: Math.max(0, intercalaryCount),
    secondaryCount: Math.max(0, secondaryCount),
    aspectRatio,
    serrationAmp,
    serrationFreq,
    lobeDepth,
    asymmetry,
    poseDroopDeg,
    color: preset.color,
    curl: preset.curl,
    smoothMargin: preset.smoothMargin,
  };
}
