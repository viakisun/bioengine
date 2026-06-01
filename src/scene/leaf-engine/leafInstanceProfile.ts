// Iter 39 Phase F4 — LeafInstanceProfile (per-compound-leaf variation).
//
// 사용자 plan v1 비판 #4 핵심: "leaf-level variation + leaflet-level variation
// _분리_. 현재 plan은 leaflet 단위 jitter만 있고 한 잎 전체 성격이 부족 → 각 잎이
// 같은 템플릿 복사본처럼 보임".
//
// 본 module은 _잎 1장당 1번_ 산출되는 macro-level traits를 정의:
//   - rachisCurvature, leafDroopDeg, leftRightImbalance, spacingBias,
//     opennessFactor, overallTwist
//
// addLeafletNodesForLeaf가 이 profile을 받아 primaryUs jitter / leaflet sf에
// 적용 → 각 잎의 _전체 성격_ 차이 (asymmetric, drooped, twisted 등).
// Per-leaflet jitter (buildLeafletMeshes의 aspectJitter/sharpnessJitter)는
// 별도로 _그 위에_ 적용 → 같은 잎 안의 미세 variation.
//
// Deterministic: leafNodeIdx + globalSeed 기반 — same plant seed → same profile.

export interface LeafInstanceProfile {
  /** Rachis 휘어짐 (-0.15 ~ 0.15). 음수 좌측 / 양수 우측. */
  rachisCurvature: number;
  /** 전체 잎 처짐 (deg). young -10 ~ mature 30. */
  leafDroopDeg: number;
  /** 좌우 leaflet 크기 imbalance (-0.20 ~ 0.20). */
  leftRightImbalance: number;
  /** Primary leaflet 간격 bias (-0.05 ~ 0.05 in rachisU). */
  spacingBias: number;
  /** 펼쳐짐 정도 (0.2 ~ 1.0). maturity 연동. young 접힘, mature open. */
  opennessFactor: number;
  /** 전체 회전 (-0.10 ~ 0.10 rad). */
  overallTwist: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Compute leaf-level variation profile.
 *
 * @param leafNodeIdx — stem nodeIdx (deterministic seed source)
 * @param maturity    — expansionProgress 0~1 (어린~성숙)
 * @param nodePositionT — 줄기 위치 0(base) ~ 1(apex). nodePositionGradient input과 동일.
 * @param globalSeed  — plant seed (same plant → same profile)
 */
export function computeLeafInstanceProfile(
  leafNodeIdx: number,
  maturity: number,
  nodePositionT: number,
  globalSeed: number,
): LeafInstanceProfile {
  // Deterministic per-leaf seed
  const seed = (globalSeed * 1009 + leafNodeIdx * 31) >>> 0;
  const h = (i: number): number => ((seed * (i * 7919 + 1) + 49297) % 1000) / 1000;
  const signed = (i: number): number => h(i) * 2 - 1;  // -1 ~ +1

  // ── leaf-level traits ──
  // rachisCurvature: 잎이 약간 휘었음. seed별 ±0.15.
  const rachisCurvature = signed(1) * 0.15;

  // leafDroopDeg: maturity 의존 — young -10° (위로), mature +30° (처짐).
  //   + per-leaf noise ±8°
  const droopBase = lerp(-10, 30, maturity);
  const droopNoise = signed(2) * 8;
  const leafDroopDeg = droopBase + droopNoise;

  // leftRightImbalance: 좌우 leaflet 크기/배치 불균형 ±0.20.
  //   apex 부근 잎은 더 비대칭 (young 잎 더 불규칙)
  const imbalanceBase = signed(3) * 0.20;
  const apexBoost = nodePositionT > 0.85 ? 1.3 : 1.0;
  const leftRightImbalance = imbalanceBase * apexBoost;

  // spacingBias: primary 간격 bias.
  const spacingBias = signed(4) * 0.05;

  // opennessFactor: 펼쳐짐 정도. young (maturity<0.3) → 0.2, mature → 1.0
  //   + per-leaf noise ±0.1
  const opennessBase = lerp(0.2, 1.0, smoothstep(0.15, 0.85, maturity));
  const opennessNoise = signed(5) * 0.1;
  const opennessFactor = Math.max(0.15, Math.min(1.05, opennessBase + opennessNoise));

  // overallTwist: 잎 전체 회전 ±0.10 rad
  const overallTwist = signed(6) * 0.10;

  return {
    rachisCurvature,
    leafDroopDeg,
    leftRightImbalance,
    spacingBias,
    opennessFactor,
    overallTwist,
  };
}
