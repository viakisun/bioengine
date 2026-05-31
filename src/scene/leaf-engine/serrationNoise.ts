// Iter 36 v5 Phase D — Small serration noise (사용자 botanical reference §5).
//
// "작은 톱니 serration: 가장자리를 잘게 거칠게 만듦. 빈도 높음, 진폭 작음."
//
// triangleWave — sawtooth로 toothed edge 시뮬. deterministic seed.

/**
 * Triangle wave — period 1 단위로 톱니 형성. 결과 [0, 1].
 */
function triangleWave(x: number): number {
  const f = x - Math.floor(x);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

/**
 * Serration noise — 잎 outline에 추가될 작은 톱니 (높은 빈도, 작은 진폭).
 *
 * @param u 잎 길이 0-1.
 * @param amp 톱니 진폭 (잎 폭 대비, ResolvedLeafParams.serrationAmp).
 * @param freq 톱니 빈도 (큰 소엽 한쪽당 10-28, ResolvedLeafParams.serrationFreq).
 * @param seed deterministic seed.
 */
export function serrationNoise(u: number, amp: number, freq: number, seed: number): number {
  // 빈도가 0 (potato-leaf smoothMargin)이면 0 반환 (smooth edge).
  if (amp <= 0 || freq <= 0) return 0;
  // phase shift per seed — 같은 amp/freq라도 잎별 다른 톱니 위치.
  const phase = (seed * 0.5) % 1.0;
  // triangleWave: 0-1 range → -0.5~0.5 (양수만 사용 — 톱니는 바깥쪽으로).
  const t = triangleWave(u * freq + phase);
  return t * amp;
}
