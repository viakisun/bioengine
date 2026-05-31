// Iter 36 v5 Phase K — 개별 leaflet plane mesh를 skeleton 부착점에 procedural 생성.
//
// 사용자 §9 의도:
//   "엽축 skeleton 위에 여러 소엽 mesh를 procedural하게 붙이는 방식이 가장 토마토답습니다"
//
// 구현 전략:
//   - 각 leaflet = ShapeProfileSample[] outline → triangulated plane vertex
//   - 모든 leaflet vertex를 _하나의 통합 Mesh_에 batch (single draw call 효율)
//   - 각 leaflet은 자기 _position + pose_ 적용 (개별 평면)
//   - lobe + serration은 outline 산출 단계에서 이미 적용됨 (shapeProfile.ts)
//
// 좌표계:
//   - 입력: leafletNode.pos (plant-local) — skeleton에서 read
//   - 출력 mesh.position = leaf-blade-root pos (이후 LeafGenerator가 부착 anchor 설정).
//     즉 vertex는 _leaf-blade-root 기준 mesh-local_ 좌표.

import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type {
  LeafBladeRef,
  LeafletNodeRef,
} from '../../plant/skeleton/PlantSkeletonGraph';
import { buildCompoundLeaf } from './index';

interface V3 { x: number; y: number; z: number }

/** Rotation order: pitch(X) → roll(Z) → twist(Y), local axes. Returns rotated p. */
function rotateXYZ(p: V3, pitchDeg: number, rollDeg: number, twistDeg: number): V3 {
  const cx = Math.cos(pitchDeg * Math.PI / 180);
  const sx = Math.sin(pitchDeg * Math.PI / 180);
  const cz = Math.cos(rollDeg * Math.PI / 180);
  const sz = Math.sin(rollDeg * Math.PI / 180);
  const cy = Math.cos(twistDeg * Math.PI / 180);
  const sy = Math.sin(twistDeg * Math.PI / 180);

  // pitch (X): y,z rotate
  let { x, y, z } = p;
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  // roll (Z): x,y rotate
  const x2 = x * cz - y1 * sz;
  const y2 = x * sz + y1 * cz;
  // twist (Y): x,z rotate
  const x3 = x2 * cy + z1 * sy;
  const z3 = -x2 * sy + z1 * cy;
  return { x: x3, y: y2, z: z3 };
}

/**
 * Build a single Babylon Mesh containing all leaflet plane geometries.
 *
 * - Each leaflet = triangulated plane (samples × 2 vertices for left/right edge).
 * - Vertex positions = leaf-blade-root frame (mesh-local).
 * - All leaflets batched into one Mesh (single draw call).
 *
 * @param name     mesh name
 * @param scene    Babylon Scene
 * @param bladeRef Skeleton leaf-blade-root metadata
 * @param leafletNodes Skeleton leaflet-node refs (4 position types)
 * @param leafBladeRootPos plant-local position of leaf-blade-root (anchor)
 * @param seed     deterministic seed (per leaf instance)
 */
export function buildCompoundLeafMesh(
  name: string,
  scene: Scene,
  bladeRef: LeafBladeRef,
  leafletNodes: ReadonlyArray<LeafletNodeRef>,
  leafBladeRootPos: V3,
  leafletPositions: ReadonlyMap<string, V3>,  // leafletNode.id → plant-local pos
  seed: number,
): Mesh {
  const descriptor = buildCompoundLeaf(bladeRef, leafletNodes, seed);

  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  // Each leaflet: build plane mesh in its own local frame, then place at
  // (leafletPos - leafBladeRootPos) with pose rotation applied.
  for (let li = 0; li < descriptor.leaflets.length; li++) {
    const { node, profile, pose } = descriptor.leaflets[li];
    void node; // node ref은 descriptor 안에 있지만 position은 외부 Map.
    // skeleton leafletNode plant-local position (index 기반 key)
    const leafletPlantPos = leafletPositions.get(`${li}`) ?? leafBladeRootPos;

    // mesh-local origin = leafletPos - leafBladeRootPos (so mesh.position = bladeRoot).
    const ox = leafletPlantPos.x - leafBladeRootPos.x;
    const oy = leafletPlantPos.y - leafBladeRootPos.y;
    const oz = leafletPlantPos.z - leafBladeRootPos.z;

    const baseIndex = positions.length / 3;

    // ── Build leaflet plane: u along leaf length (base→tip), left/right edges ──
    // shape profile assumes leaf laid flat in XZ plane: u → Z axis, halfWidth → X.
    // length axis along +Z (toward tip).
    const lengthM = node.targetSizeM;
    // attach angle: rotate leaflet plane around Y by attachAngleDeg (rachis 기준 좌우 배치).
    const sideSign = node.position === 'terminal' ? 0 : (li % 2 === 0 ? -1 : +1);
    const attachRad = pose.attachAngleDeg * Math.PI / 180 * sideSign;

    for (const sample of profile) {
      const z = sample.u * lengthM;
      // left vertex
      const pL: V3 = { x: -sample.halfWidthLeft, y: 0, z };
      const pR: V3 = { x: +sample.halfWidthRight, y: 0, z };

      // Apply pose (pitch + roll + twist), then attach rotation around Y axis.
      const r1L = rotateXYZ(pL, pose.pitchDeg, pose.rollDeg, pose.twistDeg);
      const r1R = rotateXYZ(pR, pose.pitchDeg, pose.rollDeg, pose.twistDeg);
      // attach rotation (rachis 기준 좌우 분기)
      const cosA = Math.cos(attachRad);
      const sinA = Math.sin(attachRad);
      const finalL: V3 = {
        x: r1L.x * cosA + r1L.z * sinA,
        y: r1L.y,
        z: -r1L.x * sinA + r1L.z * cosA,
      };
      const finalR: V3 = {
        x: r1R.x * cosA + r1R.z * sinA,
        y: r1R.y,
        z: -r1R.x * sinA + r1R.z * cosA,
      };

      // mesh-local position
      positions.push(finalL.x + ox, finalL.y + oy, finalL.z + oz);
      positions.push(finalR.x + ox, finalR.y + oy, finalR.z + oz);

      // up normal (initial, will fix after triangulation)
      normals.push(0, 1, 0);
      normals.push(0, 1, 0);

      // uv: u along length, side 0/1.
      uvs.push(0, sample.u);
      uvs.push(1, sample.u);
    }

    // Triangulate: for each sample i (0..N-2): two triangles forming a quad.
    const N = profile.length;
    for (let i = 0; i < N - 1; i++) {
      const i0 = baseIndex + i * 2 + 0;     // left  i
      const i1 = baseIndex + i * 2 + 1;     // right i
      const i2 = baseIndex + (i + 1) * 2 + 0; // left  i+1
      const i3 = baseIndex + (i + 1) * 2 + 1; // right i+1
      // tri 1: i0, i1, i2
      indices.push(i0, i1, i2);
      // tri 2: i1, i3, i2
      indices.push(i1, i3, i2);
    }
  }

  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.applyToMesh(mesh);
  return mesh;
}
