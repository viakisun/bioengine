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
