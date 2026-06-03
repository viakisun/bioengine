// SSOT — Per-Leaflet Position Profile (Iter 39 Phase L2-3, L4-5).
// See: docs/architecture/LEAF_MESH_PIPELINE_AUDIT.md Section 4
//
// _pure module_ — Babylon dependency 0. unit test 가능.
//
// ★ Iter 39 L4-5 (S33) — applyPositionProfile은 spec.profileByPosition 받음
//   (PROFILE_BY_POSITION 상수 deprecated). botanical data는 src/data/leaf/
//   specs/*.json SSOT.
//
// L2-0 audit 진단: leafletRef.position이 _terminal flag만_ 사용. primary/
// intercalary _shape 차별화 없음_. L2-3 fix: profileByPosition 도입.
//
// 사용자 v3 #3 — targetSizeM SSOT:
//   leafletRef.targetSizeM = 절대 길이 source of truth (skeleton SSOT)
//   profileByPosition = _shape 비율_만 (lengthScale 폐기 — 이중 적용 방지)

export type LeafletPosition = 'terminal' | 'primary' | 'intercalary' | 'secondary';

// ─── L2-4b: Mesh Quality Profile (사용자 v3 #5) ───────────────────────────
//
// Resolution 전역 상수 _금지_. quality flag + dict.
// **default는 'low' 유지** — production 회귀 0. 'high'는 hero/near plant
// opt-in.
//
// 현재 shapeProfile samples만 quality 조정 (lengthSegs = samples - 1).
// COLS (LeafletPlaneChunk 내부 hardcode 9)는 patkage 변경 필요 → 후속 phase.

export type LeafMeshQuality = 'low' | 'high';

export interface LeafMeshResolution {
  /** buildShapeProfile.samples — lengthSegs = samples - 1. */
  shapeProfileSamples: number;
}

export const LEAF_MESH_RESOLUTION: Record<LeafMeshQuality, LeafMeshResolution> = {
  low:  { shapeProfileSamples: 16 },  // ★ default — 현재 production 동일 (lengthSegs 15)
  high: { shapeProfileSamples: 23 },  // hero/near plant opt-in (lengthSegs 22, +44%)
};

/** Default quality. production 회귀 0 (v3 #5 핵심). */
export const DEFAULT_LEAF_MESH_QUALITY: LeafMeshQuality = 'low';

export interface LeafletShapeProfile {
  /** length 대비 폭 비율. aspectRatio = 1 / widthRatio. */
  widthRatio: number;
  /** outline lobe 깊이 (잎 폭 대비). */
  lobeDepth: number;
  /** edge serration 진폭 (잎 폭 대비). */
  serrationAmp: number;
  /** edge serration 빈도. */
  serrationFreq: number;
  /** sin^shapePower exponent (1.0 round ↔ 2.0 sharp). */
  tipSharpness: number;
  /** base taper (L2-4 cap topology에서 사용 예정). */
  baseTaper: number;
}

/**
 * Per-position shape profile.
 *
 * 차별화 원칙:
 *   terminal     = 가장 elaborate (큰 widthRatio, 깊은 lobe, 많은 serration)
 *   primary      = 중간 (전형적 토마토 leaflet)
 *   intercalary  = 단순한 보조엽 (얕은 lobe, 적은 serration, round tip)
 *   secondary    = primary와 비슷 (현재 disabled)
 */
export const PROFILE_BY_POSITION: Record<LeafletPosition, LeafletShapeProfile> = {
  terminal: {
    widthRatio:    0.42,
    lobeDepth:     0.14,
    serrationAmp:  0.05,
    serrationFreq: 22,
    tipSharpness:  1.65,
    baseTaper:     0.65,
  },
  primary: {
    widthRatio:    0.38,
    lobeDepth:     0.12,
    serrationAmp:  0.045,
    serrationFreq: 20,
    tipSharpness:  1.55,
    baseTaper:     0.60,
  },
  intercalary: {
    widthRatio:    0.34,
    lobeDepth:     0.07,
    serrationAmp:  0.025,
    serrationFreq: 16,
    tipSharpness:  1.30,
    baseTaper:     0.50,
  },
  secondary: {
    widthRatio:    0.36,
    lobeDepth:     0.10,
    serrationAmp:  0.04,
    serrationFreq: 18,
    tipSharpness:  1.45,
    baseTaper:     0.55,
  },
};

/**
 * Endpoint taper weights (Iter 39 Phase L2-4a — cap topology, ★ L6-A-1 분리).
 *
 * LeafletPlaneChunk row 인덱스 t (0=base, 1=tip)에서 noise에 곱할 가중치.
 * sin(πt)는 t=0/1에서 0, t=0.5에서 1 → 끝쪽 noise suppress.
 *
 * ★ L6-A-1 (S46): lobe와 serration의 taper 정책 _분리_:
 *   - lobe (큰 결각): full sin(πt) — 끝에서 완전 사라짐 (자연스러움)
 *   - serration (작은 톱니): max(serrationTaperMin, sin(πt)) — 끝에서도 일부 보존
 *
 * 이유: L2-4a 도입 후 _잎 끝 톱니가 완전히 사라짐_ → "잘린 종이" 인상.
 *   큰 결각은 끝에서 줄어드는 것이 botanical 사실. 작은 톱니는 끝까지 가시.
 */

/** Lobe taper — full sin(πt). t=0/1에서 0, t=0.5에서 1. */
export function lobeTaperWeight(t: number): number {
  return Math.sin(t * Math.PI);
}

/**
 * Serration taper — floor 보존. t=0/1에서 minWeight, t=0.5에서 max(minWeight, 1)=1.
 * minWeight=0이면 lobe와 동일. minWeight=1이면 no taper (끝까지 톱니 full).
 *
 * @param t          row index normalized [0, 1]
 * @param minWeight  spec.shapeProfileRules.serrationTaperMin (0~1)
 */
export function serrationTaperWeight(t: number, minWeight: number): number {
  return Math.max(minWeight, Math.sin(t * Math.PI));
}

/**
 * @deprecated L6-A-1 부터 lobe/serration taper 분리. lobeTaperWeight 사용.
 *   유지: 외부 backward compat (현재 leaf-mesh-cap-taper.spec.ts 외 호출처 0).
 */
export function endpointTaperWeight(t: number): number {
  return Math.sin(t * Math.PI);
}

/**
 * Position profile을 leaf-level resolved에 _덮어쓰기_ (사용자 v3 #3 병합 순서).
 *
 *   ...resolved 먼저 (rachisCurvature, baseShape, asymmetry — leaf-level fallback)
 *   position fields가 _강제 우선순위_ (lobeDepth, serrationAmp 등)
 *
 * 절대 크기 (targetSizeM)는 _이 함수 적용 후_ lengthM으로 직접 전달 —
 * position scale 곱하지 않음 (targetSizeM SSOT, 이중 적용 방지).
 *
 * ★ L4-5 (S33) — profileByPosition은 spec.profileByPosition 주입. PROFILE_BY_POSITION
 * 상수는 reference + 호환성 보존용으로 남김 (engine은 spec 우선).
 */
export function applyPositionProfile<T extends {
  aspectRatio: number;
  lobeDepth: number;
  serrationAmp: number;
  serrationFreq: number;
  tipSharpness: number;
}>(
  profileByPosition: Record<LeafletPosition, LeafletShapeProfile>,
  resolved: T,
  position: LeafletPosition,
): T {
  const positional = profileByPosition[position];
  // ★ v3 #3 — ...resolved 먼저 (fallback), positional 덮어쓰기.
  return {
    ...resolved,
    aspectRatio:   1 / positional.widthRatio,  // widthRatio → aspectRatio
    lobeDepth:     positional.lobeDepth,
    serrationAmp:  positional.serrationAmp,
    serrationFreq: positional.serrationFreq,
    tipSharpness:  positional.tipSharpness,
  };
}
