// SSOT #185 — Coordinate frame transforms.
// See: docs/architecture/COORDINATE_SYSTEMS.md
//
// 모든 inline `Vector3.TransformCoordinates(...)` 호출은 본 utility로 교체.

import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { WorldV3, PlantLocalV3, MeshLocalV3 } from './types';
import { toWorld, toPlantLocal } from './types';

// ── world ↔ plant-local ──────────────────────────────────────────────────

/** world → plant-local via lushGroup의 invert world matrix. */
export function worldToPlantLocal(world: WorldV3, lushWorldMatInv: Matrix): PlantLocalV3 {
  const out = Vector3.TransformCoordinates(
    new Vector3(world.x, world.y, world.z),
    lushWorldMatInv,
  );
  return toPlantLocal(out);
}

/** plant-local → world via lushGroup의 world matrix. */
export function plantLocalToWorld(plant: PlantLocalV3, lushWorldMat: Matrix): WorldV3 {
  const out = Vector3.TransformCoordinates(
    new Vector3(plant.x, plant.y, plant.z),
    lushWorldMat,
  );
  return toWorld(out);
}

// ── mesh-local ↔ world ──────────────────────────────────────────────────

/** mesh-local → world via mesh의 worldMatrix (rotation + parent transform 모두 적용). */
export function meshLocalToWorld(meshLocal: MeshLocalV3, meshWorldMat: Matrix): WorldV3 {
  const out = Vector3.TransformCoordinates(
    new Vector3(meshLocal.x, meshLocal.y, meshLocal.z),
    meshWorldMat,
  );
  return toWorld(out);
}

// ── mesh-local ↔ plant-local (합성) ─────────────────────────────────────

/** mesh-local → plant-local (= mesh-local → world → plant-local). */
export function meshLocalToPlantLocal(
  meshLocal: MeshLocalV3,
  meshWorldMat: Matrix,
  lushWorldMatInv: Matrix,
): PlantLocalV3 {
  const world = meshLocalToWorld(meshLocal, meshWorldMat);
  return worldToPlantLocal(world, lushWorldMatInv);
}

// ── Invariant 검증 (debug) ──────────────────────────────────────────────

/** world → plant-local → world round trip이 원본과 일치하는지 (debug invariant).
 *  epsilon 기본 1e-5 m (= 0.01 mm). 위반 시 throw. */
export function assertRoundTrip(
  v: WorldV3,
  lushWorldMat: Matrix,
  epsilon: number = 1e-5,
): void {
  const lushInv = lushWorldMat.clone().invert();
  const plant = worldToPlantLocal(v, lushInv);
  const back = plantLocalToWorld(plant, lushWorldMat);
  const dx = Math.abs(back.x - v.x);
  const dy = Math.abs(back.y - v.y);
  const dz = Math.abs(back.z - v.z);
  if (dx > epsilon || dy > epsilon || dz > epsilon) {
    throw new Error(
      `[coordinates] round trip failed: original=(${v.x},${v.y},${v.z}) `
      + `back=(${back.x},${back.y},${back.z}) Δ=(${dx},${dy},${dz}) ε=${epsilon}`,
    );
  }
}
