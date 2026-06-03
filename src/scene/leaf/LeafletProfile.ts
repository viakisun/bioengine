// SSOT — Per-Leaflet Position Profile (Iter 39 Phase L2-3).
// See: docs/architecture/LEAF_MESH_PIPELINE_AUDIT.md Section 4
//
// _pure module_ — Babylon dependency 0. unit test 가능.
// LeafMeshBuilder.ts 와 buildLeafletMeshes.ts 가 import.
//
// L2-0 audit 진단: leafletRef.position이 _terminal flag만_ 사용. primary/
// intercalary _shape 차별화 없음_. L2-3 fix: PROFILE_BY_POSITION 도입.
//
// 사용자 v3 #3 — targetSizeM SSOT:
//   leafletRef.targetSizeM = 절대 길이 source of truth (skeleton SSOT)
//   PROFILE_BY_POSITION = _shape 비율_만 (lengthScale 폐기 — 이중 적용 방지)

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
 * Endpoint taper weight (Iter 39 Phase L2-4a — cap topology).
 *
 * LeafletPlaneChunk row 인덱스 t (0=base, 1=tip)에서 lobe/serration noise에
 * 곱할 가중치. sin(πt)는 t=0/1에서 0, t=0.5에서 1 → 끝쪽 noise suppress.
 *
 * 효과:
 *   - row=0/row=N의 9 vertices가 profile baseline halfWidth (= 0) + noise 0
 *     → 모두 z ≈ 0에 수렴 → cap에서 vertex 겹침 _깨끗한 cap_
 *   - 가운데 vertices는 그대로 (taper = 1)
 *
 * Endpoint row collapse to 1 vertex (Option (i))는 uv/normal/index buffer
 * 영향 큼 → high-risk. L2-4a는 _noise taper_ 만 (Option (ii) approach).
 *
 * @param t  row index normalized [0, 1] (0 = base, 0.5 = middle, 1 = tip)
 * @returns  taper weight ∈ [0, 1]
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
 */
export function applyPositionProfile<T extends {
  aspectRatio: number;
  lobeDepth: number;
  serrationAmp: number;
  serrationFreq: number;
  tipSharpness: number;
}>(
  resolved: T,
  position: LeafletPosition,
): T {
  const positional = PROFILE_BY_POSITION[position];
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
