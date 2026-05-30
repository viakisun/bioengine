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
 * Iter 30 Phase 0.D (R4 fix) — Stem-local frame 기반 leaf rotation.
 *
 * 이전 (composeLeafRotation, R4 결함):
 *   quatY(azimuth) × quatX(-droop) × quatZ(twist)
 *   → world axis 기반. stem이 휘어도 leaf orientation은 world Y에 lock.
 *   → 모든 잎이 동일 평면에 누적 (사용자 사진 #2 직접 evidence).
 *
 * 신규 (composeLeafRotationLocal):
 *   1. stemFrame.tangent → 회전축으로 azimuth (phyllotaxy spiral)
 *      stem이 휘면 tangent 자동 회전 → leaf orientation 따라감.
 *   2. binormal (tangent × normal) → droop axis
 *   3. petiole axis (rotated normal) → twist axis
 *
 * @param stemFrame  SkeletonNode.frame (Iter 26 PR 1-1 populated)
 * @param azimuthDeg phyllotaxy angle (degrees, golden 137.5° × node index typical)
 * @param droopDeg   blade plane droop (degrees)
 * @param twistDeg   petiole roll (degrees)
 * @returns Quat4 quaternion for anchor.rotation
 */
export function composeLeafRotationLocal(
  stemFrame: StemLocalFrame,
  azimuthDeg: number,
  droopDeg: number,
  twistDeg: number = 0,
): Quat4 {
  // 1. Azimuth around tangent (stem-up direction).
  //    stem이 휘면 tangent도 휘어 → leaf phyllotaxy가 stem follow.
  const qAzimuth = quatAroundAxis(stemFrame.tangent, azimuthDeg);

  // 2. Droop around binormal (tangent × normal). Negative = 아래로 처짐.
  const binormal = cross3(stemFrame.tangent, stemFrame.normal);
  const qDroop = quatAroundAxis(binormal, -droopDeg);

  // 3. Twist around normal (petiole axis approximation).
  const qTwist = quatAroundAxis(stemFrame.normal, twistDeg);

  // azimuth × droop × twist (twist innermost)
  return quatMul(qAzimuth, quatMul(qDroop, qTwist));
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
