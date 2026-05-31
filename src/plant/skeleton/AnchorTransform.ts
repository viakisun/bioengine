// Iter 29 Phase 3 — AnchorTransform helper module.
//
// Plan §3 (sleepy-growing-pretzel.md) — SKELETON-ANCHOR-TRANSFORM-01 / -POSTURE-01:
//   OrganAnchor.rotation은 Quaternion (phyllotaxis × droop × twist 합성).
//   PlantBase가 posture를 계산하고 Skeleton populator는 _복사_만 한다.
//
// Pure quaternion math — no Babylon dependency. Result is a structural Quat4
// {x, y, z, w} that Babylon Quaternion can absorb directly.
//
// References:
//   - Plan §11 (LeafPostureState.azimuthDeg/petioleElevationDeg/droopDeg/twistDeg/curl)
//   - Plan §13.2 (anchor purity)

import type { Quat4 } from './PlantSkeletonGraph';

/** Identity quaternion. */
export const IDENTITY_QUAT: Quat4 = { x: 0, y: 0, z: 0, w: 1 };

// ★ Iter 34 C4 — composeLeafRotation + quatY/X/Z/Mul/quatMagnitude 제거 (R26 contract).
//   R26 이후 leaf rotation은 _PlantBase petioleCurve 마지막 segment tangent_에서 옴
//   (populateAnchorMorphology.fillLeafAnchor → makeLeafQuaternion). 3-axis composition
//   (azimuth × droop × twist) 산식 _완전 폐기_. production read 0 audit 검증 완료.
//
//   유지: IDENTITY_QUAT (populator 4곳 fallback), makeLeafQuaternion (R26 entry),
//        cross3 (makeLeafQuaternion 내부 helper).

// ============================================================
// Iter 31 Phase 10 — Radical simplification (★ R11~R18 대체)
// ============================================================
//
// 사용자 통찰: "잎 방향 하나를 결정하는데 왜 이렇게 복잡한가?"
//
// 진실: 잎 회전 = _2개 벡터_ (petiole 방향 + blade normal) → quaternion 하나.
// R11~R18은 모두 _하나의 합성 회전_ 안에서 헛바퀴. 본 함수는 _직접_ 매트릭스.
//
// Mesh-local convention (createOvateLeaflet contract):
//   +x = petiole direction
//   +y = blade normal (위)
//   +z = blade width
//
// Target world:
//   petioleDirWorld → mesh +x
//   bladeUpWorld   → mesh +y
//   (matrix orthonormalization으로 +z 자동 결정)

/**
 * ★ Iter 31 Phase 10 — leaf quaternion 직접 생성 (R11~R18 단순화).
 *
 * @param petioleDirWorld  잎 petiole이 world에서 향하는 방향 (단위 벡터)
 * @param bladeUpWorld     잎 blade normal이 향하는 방향 (보통 world up 근처)
 * @returns                mesh-local axes → world rotation Quat4
 *
 * 동작: matrixToQuat([petioleDir | orthoUp | right])
 *   petioleDir = mesh +x → world (잎이 자라는 방향)
 *   orthoUp    = mesh +y → world (잎 면이 보는 방향, petioleDir에 직교)
 *   right      = cross(petioleDir, orthoUp) = mesh +z → world (blade width)
 *
 * Gram-Schmidt로 orthonormalize. 입력 vector는 단위 벡터 가정.
 */
export function makeLeafQuaternion(petioleDirWorld: { x: number; y: number; z: number }, bladeUpWorld: { x: number; y: number; z: number }): Quat4 {
  // Normalize petiole direction
  const fLen = Math.sqrt(petioleDirWorld.x ** 2 + petioleDirWorld.y ** 2 + petioleDirWorld.z ** 2);
  const f = fLen > 1e-6
    ? { x: petioleDirWorld.x / fLen, y: petioleDirWorld.y / fLen, z: petioleDirWorld.z / fLen }
    : { x: 1, y: 0, z: 0 };

  // Orthonormalize up onto plane ⊥ f (Gram-Schmidt)
  const dot = f.x * bladeUpWorld.x + f.y * bladeUpWorld.y + f.z * bladeUpWorld.z;
  const upProj = {
    x: bladeUpWorld.x - f.x * dot,
    y: bladeUpWorld.y - f.y * dot,
    z: bladeUpWorld.z - f.z * dot,
  };
  const uLen = Math.sqrt(upProj.x ** 2 + upProj.y ** 2 + upProj.z ** 2);
  const u = uLen > 1e-6
    ? { x: upProj.x / uLen, y: upProj.y / uLen, z: upProj.z / uLen }
    : { x: 0, y: 1, z: 0 };

  // right = cross(f, u) — 자동 orthonormal
  const r = cross3(f, u);

  // Matrix columns [f | u | r] → quat (Shepperd's method)
  // Inline matrixToQuat (이미 baseAlignmentQuat 안에 있음, 여기 별도)
  const m00 = f.x, m01 = u.x, m02 = r.x;
  const m10 = f.y, m11 = u.y, m12 = r.y;
  const m20 = f.z, m21 = u.z, m22 = r.z;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
}

// ============================================================
// ★ Iter 31 R26 (commit 4029b6b) cleanup — Phase B dead helper removal.
//
// 다음 함수들은 R26 (PlantBase petioleCurve 마지막 tangent 직접 사용)으로
// 완전 대체되어 _populator unreachable_ 상태로 R11~R25 누적:
//
//   - composeLeafRotationLocal  (Iter 30 Phase 0.D R4 fix; Phase 9 R11 base align)
//   - computeLeafPetioleAndBladeAxes (Iter 31 Phase 10.1 horizontal+droop 근사)
//   - rotateAroundUnitAxis      (computeLeafPetioleAndBladeAxes 전용 helper)
//   - baseAlignmentQuat         (composeLeafRotationLocal 전용 helper)
//   - matrixToQuat              (baseAlignmentQuat 전용 helper, makeLeafQuaternion은 inline)
//   - quatAroundAxis            (composeLeafRotationLocal 전용 helper)
//   - normalize3, lenSq         (baseAlignmentQuat 전용 helper)
//   - StemLocalFrame interface  (composeLeafRotationLocal 인자 type)
//
// Iter 30 Phase 0.D contract record는 `tests/architecture/_archive/
// iter30-local-frame.spec.ts.deprecated`에 historic으로 보존.
// ============================================================

// (cross3 만 유지 — makeLeafQuaternion이 사용)

/** Cross product. */
function cross3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
