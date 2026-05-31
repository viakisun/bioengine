// Iter 36 v5 Phase D — Leaflet pose variation (사용자 botanical reference §6).
//
// "각 소엽의 방향도 달라야 한다."
//   - 부착 각도: 줄기 아래쪽 45-85°, 중간 35-70°, 어린 위쪽 20-55°
//   - pitch: 어린 위로 살짝 들림, 성숙 수평, 오래된 아래로
//   - roll: 좌우 가장자리 -20°~20° 말림
//   - twist: 소엽 끝 -15°~15° 비틀림
//
// "왼쪽 소엽은 조금 처지고, 오른쪽 소엽은 조금 위로 들리고, 끝소엽은 빛 방향으로 살짝 틀어짐"
//   → 같은 평면 _배치 금지_ — 자연스러운 high-frequency variation.

import type { LeafletPosition } from '../../plant/skeleton/PlantSkeletonGraph';

export interface LeafletPose {
  /** 부착 각도 (rachis 기준 deg). */
  attachAngleDeg: number;
  /** Pitch (위/아래 각도 deg). */
  pitchDeg: number;
  /** Roll (좌우 말림 deg). */
  rollDeg: number;
  /** Twist (소엽 끝 비틀림 deg). */
  twistDeg: number;
}

/**
 * Leaflet pose 산출 — botanical model 기반 deterministic noise.
 *
 * @param position 소엽 종류 (terminal/primary/secondary/intercalary).
 * @param rachisU 엽축 0-1 위치 (root=0, tip=1).
 * @param poseDroopDeg ResolvedLeafParams.poseDroopDeg (preset 기반 baseline).
 * @param seed deterministic seed (per leaflet instance).
 */
export function computeLeafletPose(
  position: LeafletPosition,
  rachisU: number,
  poseDroopDeg: number,
  seed: number,
): LeafletPose {
  // 부착 각도 — terminal은 끝 (0°), primary는 좌우 (60° base), secondary/intercalary는 더 옆.
  let attachAngleDeg: number;
  switch (position) {
    case 'terminal':
      attachAngleDeg = 0;
      break;
    case 'primary':
      attachAngleDeg = 60 + (seed % 10) - 5;  // 55-65°
      break;
    case 'secondary':
      attachAngleDeg = 70 + (seed % 15);       // 70-85°
      break;
    case 'intercalary':
      attachAngleDeg = 75 + (seed % 10);       // 75-85°
      break;
  }

  // Pitch — preset poseDroopDeg + per-leaflet noise (±5°).
  // 자연스러움 위해 rachisU별 약간 다름 (사용자 §6 "왼쪽 처짐, 오른쪽 들림")
  const pitchNoise = (Math.sin(seed * 1.3 + rachisU * 6) * 5);
  const pitchDeg = poseDroopDeg + pitchNoise;

  // Roll — 좌우 가장자리 -20°~20° (사용자 §6 표).
  const rollDeg = (Math.sin(seed * 2.7) * 18);

  // Twist — 소엽 끝 -15°~15°.
  const twistDeg = (Math.sin(seed * 3.1 + rachisU * 4) * 12);

  return { attachAngleDeg, pitchDeg, rollDeg, twistDeg };
}
