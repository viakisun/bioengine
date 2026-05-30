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

const DEG_TO_RAD = Math.PI / 180;

/** Quaternion for rotation around the world Y axis (azimuth/phyllotaxis). */
export function quatY(deg: number): Quat4 {
  const h = (deg * DEG_TO_RAD) / 2;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

/** Quaternion for rotation around the world X axis (droop/elevation). */
export function quatX(deg: number): Quat4 {
  const h = (deg * DEG_TO_RAD) / 2;
  return { x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) };
}

/** Quaternion for rotation around the world Z axis (twist/roll). */
export function quatZ(deg: number): Quat4 {
  const h = (deg * DEG_TO_RAD) / 2;
  return { x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) };
}

/**
 * Hamilton product q1 ⊗ q2 — applies q2 first, then q1, when used as
 * `v' = q · v · q⁻¹`.
 */
export function quatMul(a: Quat4, b: Quat4): Quat4 {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/**
 * Plan LEAF-POSTURE-01 composition — phyllotaxis (Y) × droop (X-) × twist (Z).
 *
 * Mirrors what SkinMeshPlant.ts:701-702 used to build inline from
 * leafBase.azimuthRad/droopRad — populator now provides this so Skin reads
 * anchor.rotation directly (SKIN-NO-LEAFBASE-01 in Phase 3).
 *
 * @param azimuthDeg  PhytomerNode.leaf.posture.azimuthDeg
 * @param droopDeg    PhytomerNode.leaf.posture.droopDeg (note the negation —
 *                    consistent with the legacy formula)
 * @param twistDeg    PhytomerNode.leaf.posture.twistDeg
 */
export function composeLeafRotation(
  azimuthDeg: number,
  droopDeg: number,
  twistDeg: number = 0,
): Quat4 {
  const qY = quatY(azimuthDeg);
  const qX = quatX(-droopDeg);
  const qZ = quatZ(twistDeg);
  // azimuth × droop × twist  (twist innermost)
  return quatMul(qY, quatMul(qX, qZ));
}

/**
 * Magnitude — quick check that a quaternion is normalized (≈ 1).
 */
export function quatMagnitude(q: Quat4): number {
  return Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
}

// ============================================================
// Iter 30 Phase 0.D — Stem-local frame leaf rotation (R4 fix)
// ============================================================

/**
 * Structural local frame — tangent (stem 위 방향), normal (외측 surface),
 * binormal (tangent × normal). 모두 plant-local 단위 벡터.
 */
export interface StemLocalFrame {
  tangent: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

/**
 * Iter 30 Phase 0.D (R4 fix) + Iter 31 Phase 9 (R11 convention fix).
 *
 * ── Mesh-local convention (buildLeafBladeOnly contract) ───────────
 * leaflet mesh는 createOvateLeaflet에서 다음 axes로 build:
 *   +x = petiole direction (rowX = t × length)
 *   +y = blade normal (transverseCup + midribHeight, 위 향함)
 *   +z = blade width (colNorm × rowWidth)
 * 즉 leaf blade plane = xz-plane, blade normal = +y axis (정상 토마토).
 *
 * ── Stem-local target (Iter 31 Phase 3 frame) ─────────────────────
 * 회전 후 _이상적_ leaf 배치:
 *   mesh +x → stemFrame.normal (radial outward, petiole이 stem 옆으로)
 *   mesh +y → WORLD_UP (blade normal 위, blade plane horizontal — 햇빛 받음)
 *   mesh +z → cross(normal, up) (blade width, orthogonal)
 *
 * ── Rotation steps ────────────────────────────────────────────────
 * 1. baseAlign (★ R11 fix): mesh local → stem-local 기본 배치.
 *    +x → stem outward, +y → world up projected onto plane ⊥ outward.
 *    이 step _없이_는 mesh +y가 우연 방향으로 → blade plane vertical/random.
 * 2. twist around stem outward (petiole roll).
 * 3. droop around binormal (blade _아래로_ 처짐, gravity).
 * 4. azimuth around tangent (phyllotaxy spiral).
 *
 * 회전 합성 (innermost 먼저 적용): qAz × qDroop × qTwist × baseAlign × v
 *
 * @param stemFrame  SkeletonNode.frame (parallel-transport from Iter 31 Phase 3)
 * @param azimuthDeg phyllotaxy angle (golden 137.5° × node index)
 * @param droopDeg   blade plane droop (positive = 아래로, gravity)
 * @param twistDeg   petiole roll
 */
export function composeLeafRotationLocal(
  stemFrame: StemLocalFrame,
  azimuthDeg: number,
  droopDeg: number,
  twistDeg: number = 0,
): Quat4 {
  // ★ Iter 31 Phase 9 (R11 fix) — Step 1: base alignment.
  //    mesh-local +x → stemFrame.normal (radial outward).
  //    mesh-local +y → WORLD_UP projected onto plane ⊥ stemFrame.normal.
  const baseAlign = baseAlignmentQuat(stemFrame.normal);

  // Step 2: twist around stem outward direction (petiole axis).
  const qTwist = quatAroundAxis(stemFrame.normal, twistDeg);

  // Step 3: droop around binormal. Positive droop = blade _아래로_ 처짐 (gravity).
  // -droopDeg sign convention: world up vector가 _stemFrame.normal 방향으로_ 기울임 (즉 blade가 아래로).
  const binormal = cross3(stemFrame.tangent, stemFrame.normal);
  const qDroop = quatAroundAxis(binormal, -droopDeg);

  // ★ Iter 31 Phase 9.3 (R14 fix) — azimuth 회전 제거.
  //
  // 진단 (R13 8 variant 비교): parallel-transport frame.normal이 _스스로_
  // phyllotaxy spiral 표현 (petiole std 100.8°). 추가 azimuth 회전은 _double
  // counting_으로 cancel → world azimuth lock (std 3.1°).
  //
  // Phyllotaxy 책임은 _SkeletonGraph.frame_ (Iter 26 PR 1-1 + Iter 31 Phase 3
  // parallel-transport)이 가져감. composeLeafRotationLocal은 _base alignment +
  // droop + twist_만 적용.
  //
  // posture.azimuthDeg는 _legacy field_로 무시. Iter 32에서 PhytomerNode에서
  // 제거 검토 (architecture invariant 영향).
  //
  // void 명시 (린트 경고 회피 + intent 명시):
  void azimuthDeg;

  // Composition: qDroop × qTwist × baseAlign (innermost first).
  return quatMul(qDroop, quatMul(qTwist, baseAlign));
}

/**
 * Iter 31 Phase 9 (R11) — Base alignment quaternion.
 *
 * Mesh-local axes (build convention from buildLeafBladeOnly):
 *   +x = petiole direction
 *   +y = blade normal (up)
 *   +z = blade width
 *
 * Target world axes:
 *   +x → stemNormal (radial outward, petiole direction)
 *   +y → worldUp projected onto plane ⊥ stemNormal (blade normal up)
 *   +z → cross(targetX, targetY) (orthonormal)
 *
 * Rotation matrix columns = [targetX, targetY, targetZ], converted to quaternion.
 */
function baseAlignmentQuat(stemNormal: { x: number; y: number; z: number }): Quat4 {
  const tx = normalize3(stemNormal);
  // Project WORLD_UP onto plane ⊥ tx
  const worldUp = { x: 0, y: 1, z: 0 };
  const upDot = tx.x * worldUp.x + tx.y * worldUp.y + tx.z * worldUp.z;
  const upProj = {
    x: worldUp.x - tx.x * upDot,
    y: worldUp.y - tx.y * upDot,
    z: worldUp.z - tx.z * upDot,
  };
  let ty: { x: number; y: number; z: number };
  if (lenSq(upProj) > 1e-6) {
    ty = normalize3(upProj);
  } else {
    // Degenerate: stemNormal is parallel to WORLD_UP (stem fully vertical).
    // Use world X axis as fallback blade normal.
    ty = { x: 1, y: 0, z: 0 };
  }
  const tz = cross3(tx, ty);  // orthonormal

  return matrixToQuat(tx, ty, tz);
}

function normalize3(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const L = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (L < 1e-9) return { x: 1, y: 0, z: 0 };
  return { x: v.x / L, y: v.y / L, z: v.z / L };
}

function lenSq(v: { x: number; y: number; z: number }): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

/**
 * Convert orthonormal basis (column vectors) to quaternion.
 * Shepperd's method (numerically stable).
 */
function matrixToQuat(
  ex: { x: number; y: number; z: number },
  ey: { x: number; y: number; z: number },
  ez: { x: number; y: number; z: number },
): Quat4 {
  // Matrix M = [ex | ey | ez] (column-major):
  //   m00=ex.x, m01=ey.x, m02=ez.x
  //   m10=ex.y, m11=ey.y, m12=ez.y
  //   m20=ex.z, m21=ey.z, m22=ez.z
  const m00 = ex.x, m01 = ey.x, m02 = ez.x;
  const m10 = ex.y, m11 = ey.y, m12 = ez.y;
  const m20 = ex.z, m21 = ey.z, m22 = ez.z;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;  // s = 4w
    return { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;  // s = 4x
    return { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;  // s = 4y
    return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;  // s = 4z
    return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
}

/**
 * Quaternion around an arbitrary axis (must be unit vector for normalized result).
 */
function quatAroundAxis(axis: { x: number; y: number; z: number }, deg: number): Quat4 {
  const rad = deg * DEG_TO_RAD;
  const h = rad / 2;
  const s = Math.sin(h);
  const c = Math.cos(h);
  return {
    x: axis.x * s,
    y: axis.y * s,
    z: axis.z * s,
    w: c,
  };
}

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
