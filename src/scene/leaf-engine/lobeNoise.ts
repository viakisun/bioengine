// Iter 36 v5 Phase D — Large lobe noise (사용자 botanical reference §5).
//
// "큰 갈라짐 lobe: 전체 형태를 울퉁불퉁하게 만듦. 빈도 낮음, 진폭 큼."
//
// smoothNoise — sin 합성 (Perlin 대신 단순 Fourier — deterministic + 가벼움).
// 산식: lobeNoise(u) = lobeAmp × Σ sin(2π × freq × u + phase) (소수의 freq 누적)

/**
 * Lobe noise — 잎 outline에 추가될 큰 갈라짐 (낮은 빈도, 큰 진폭).
 *
 * @param u 잎 길이 0-1 (base → tip).
 * @param amp lobe 진폭 (잎 폭 대비, ResolvedLeafParams.lobeDepth).
 * @param seed deterministic seed (per leaf instance ID).
 */
export function lobeNoise(u: number, amp: number, seed: number): number {
  // 2-3 freq 합성 (사용자 §5 "lobeFrequency 낮음")
  const freq1 = 2.0 + (seed % 1.5);    // 2.0-3.5 Hz
  const freq2 = 3.7 + ((seed * 7) % 1.2); // 3.7-4.9 Hz
  const freq3 = 5.1 + ((seed * 13) % 1.0); // 5.1-6.1 Hz

  const phase1 = (seed * 0.7) % (Math.PI * 2);
  const phase2 = (seed * 1.3) % (Math.PI * 2);
  const phase3 = (seed * 2.1) % (Math.PI * 2);

  const v = (
    Math.sin(2 * Math.PI * freq1 * u + phase1) * 0.5 +
    Math.sin(2 * Math.PI * freq2 * u + phase2) * 0.3 +
    Math.sin(2 * Math.PI * freq3 * u + phase3) * 0.2
  );

  // [-1, 1] → [0, amp] (잎 outline은 항상 _바깥쪽으로_ 갈라짐 — 안쪽으로 패임 0).
  // 산식: Math.max(0, v) × amp.
  return Math.max(0, v) * amp;
}
