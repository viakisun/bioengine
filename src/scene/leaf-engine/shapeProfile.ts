// Iter 36 v5 Phase D — 소엽 outline 생성 (사용자 botanical reference §5).
//
// "기본 타원형 → 끝을 뾰족하게 → 아래쪽 살짝 비대칭 → 큰 lobe 2-4개 → 작은 톱니"
//
// 산식 (사용자 §5 직접 인용):
//   x = 0.0 at base, 1.0 at tip
//   baseWidth(x) = sin(pi * x) ^ shapePower
//   halfWidthLeft  = baseWidth + lobeNoise + toothNoise
//   halfWidthRight = baseWidth + differentLobeNoise + differentToothNoise
//
// outline = base shape (타원 → 갈래 → 톱니 누적) — vertex sample 배열 반환.
// LobeNoise + SerrationNoise는 별도 모듈에서 procedural 산출.

export interface ShapeProfileInput {
  /** 소엽 길이 (m). */
  lengthM: number;
  /** Aspect ratio (length / width). */
  aspectRatio: number;
  /** Tip sharpness (1=round, 2=pointed). */
  tipSharpness: number;
  /** Base shape (1=wedge, 0.8=slight heart). */
  baseShape: number;
  /** 좌우 비대칭 (0=대칭, 0.08=8% offset). */
  asymmetry: number;
  /** Sample count along length (default 16). */
  samples?: number;
}

export interface ShapeProfileSample {
  /** 길이 방향 0-1 (base=0, tip=1). */
  u: number;
  /** 좌측 폭 (m). */
  halfWidthLeft: number;
  /** 우측 폭 (m). */
  halfWidthRight: number;
}

/**
 * Base half-width (좌우 동일) — sin(π × u)^shapePower.
 *
 * u = 0 (base) → 0, u = 0.5 (mid) → 1, u = 1 (tip) → 0.
 * shapePower < 1 → 둥근 (mid_width 우세), > 1 → 뾰족 (tip 우세).
 */
function baseWidth(u: number, shapePower: number): number {
  const s = Math.sin(Math.PI * u);
  return Math.pow(Math.max(0, s), shapePower);
}

/**
 * 소엽 outline 생성 — base shape만 (lobe + serration은 별도 모듈에서 add).
 *
 * 사용자 §5 산식 직접 구현.
 */
export function buildShapeProfile(input: ShapeProfileInput): ShapeProfileSample[] {
  const samples = input.samples ?? 16;
  const widthM = input.lengthM / Math.max(1, input.aspectRatio);
  const halfWidthBase = widthM / 2;
  const shapePower = input.tipSharpness;

  const result: ShapeProfileSample[] = [];
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const w = baseWidth(u, shapePower) * halfWidthBase;

    // baseShape: u가 base 근처(0-0.2)일 때 wedge/heart 변형.
    const baseFactor = u < 0.2 ? 1 - (1 - input.baseShape) * (1 - u / 0.2) : 1;
    const w2 = w * baseFactor;

    // 좌우 비대칭 — rachis offset (asymmetry × baseWidth).
    // 왼쪽: 약간 좁음 → asymmetry 차이만큼 폭 감소
    // 오른쪽: 약간 넓음.
    const asymmetryOffset = input.asymmetry * w2;
    const halfWidthLeft = Math.max(0, w2 - asymmetryOffset * 0.5);
    const halfWidthRight = Math.max(0, w2 + asymmetryOffset * 0.5);

    result.push({ u, halfWidthLeft, halfWidthRight });
  }
  return result;
}
