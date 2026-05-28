// SSOT #185 — Branded V3 types for compile-time coordinate frame safety.
// See: docs/architecture/COORDINATE_SYSTEMS.md

import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/** Plain V3 (좌표계 정보 없음). */
export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Branded type — compile-time 좌표계 식별. optional `__frame`로 기존 V3와 호환. */
type Branded<T, B extends string> = T & { readonly __frame?: B };

/** Babylon scene 절대 좌표 (m). PlantBase 출력, mesh.absolutePosition 등. */
export type WorldV3 = Branded<V3, 'world'>;

/** lushGroup-relative (= Babylon mesh.position 좌표계). graph node.pos,
 *  leafMesh.position, PetioleJunctionPair의 모든 V3 필드 등. */
export type PlantLocalV3 = Branded<V3, 'plant-local'>;

/** mesh 내부 vertex 좌표계. chunk.positions, getVerticesData 결과. */
export type MeshLocalV3 = Branded<V3, 'mesh-local'>;

// ── Wrap helpers — Vector3/plain V3에 좌표계 brand 부여 ──────────────────

export function toWorld(v: V3 | Vector3): WorldV3 {
  return { x: v.x, y: v.y, z: v.z } as WorldV3;
}

export function toPlantLocal(v: V3 | Vector3): PlantLocalV3 {
  return { x: v.x, y: v.y, z: v.z } as PlantLocalV3;
}

export function toMeshLocal(v: V3 | Vector3): MeshLocalV3 {
  return { x: v.x, y: v.y, z: v.z } as MeshLocalV3;
}

// ── Plain V3 (좌표계 brand 제거) ────────────────────────────────────────

export function toPlainV3(v: WorldV3 | PlantLocalV3 | MeshLocalV3 | V3): V3 {
  return { x: v.x, y: v.y, z: v.z };
}
