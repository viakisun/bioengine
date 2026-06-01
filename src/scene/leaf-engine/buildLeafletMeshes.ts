// Iter 39 Phase A — Per-leaflet plane mesh entry function.
//
// 사용자: "정확한 single leaflet 한장을 각각의 노드에 구현".
//
// 각 leaflet skeleton 노드 (terminal / primary / intercalary / secondary)에
// _개별 Babylon Mesh_ 1장을 만들어 lushGroup에 부착. Mesh 좌표 contract:
//
//   parent     = lushGroup (plant-local frame)
//   position   = leafletSkeletonNode.pos (plant-local, graph SSOT)
//   rotation   = makeLeafQuaternion(petioleTangent, WORLD_UP)
//   meshLocal0 = leaflet base (x = 0)
//
// Phase K (commit 09def1d, revert e0df4a4) 함정 회피 전략:
//   (1) Mandatory path — bladeRef/leafletSkeletonNodes 누락 시 throw.
//       _silent legacy fallback 0_.
//   (2) Phase B에서 descriptor.leaflets[]는 _node.id keyed Map_으로 lookup.
//       index-alignment 함정 0.
//
// Phase A 시점: terminal leaflet 단 1개만 호출 (smallest delta validation).
// Phase B에서 모든 type 호출 + descriptor pose Map 도입.
// Phase C에서 pose composition (pitch/roll/twist).

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { SeededRandom } from '@farmsim/tomato-engine';
import { buildLeafletPlaneChunk } from '@farmsim/tomato-geometry';
import type {
  SkeletonNode,
  LeafBladeRef,
} from '../../plant/skeleton/PlantSkeletonGraph';
import { makeLeafQuaternion } from '../../plant/skeleton/AnchorTransform';
import { normalizeLeafMeshVertices } from '../../plant/anchors';
import { buildShapeProfile } from './shapeProfile';
import { lobeNoise } from './lobeNoise';
import { serrationNoise } from './serrationNoise';
import { AGE_PRESETS } from './agePresets';
import { applyCorrelation } from './correlationRules';
import type { CultivarShapeOverride } from './index';

type V3 = { x: number; y: number; z: number };

export interface LeafletMeshBuildContext {
  scene: Scene;
  /** ★ mandatory — leaf-blade-root node의 leafBladeRef (agePreset/complexity). */
  bladeRef: LeafBladeRef;
  /** ★ mandatory — full SkeletonNode list (node.id + node.pos + leafletRef). */
  leafletSkeletonNodes: ReadonlyArray<SkeletonNode>;
  /** Leaf-blade-root node — name prefix + seed reference. */
  leafBladeRootNode: SkeletonNode;
  /** Petiole edge bonePath 마지막 segment tangent (world, _unnormalized_ OK). */
  petioleTipTangent: V3;
  /** Leaf organ state — ageFrac / curl / gravityDroop 추출용. */
  leafOrganState: {
    expansionProgress: number;
    posture: { droopDeg: number; curl: number; gravityDroopDeg?: number };
    senescence: { progress: number; colorDullness: number; curl: number };
    morphology: { serrationDepth: number; lobeDepth: number; petioleLengthM: number };
  };
  rng: SeededRandom;
  /** Per-leaf deterministic seed (보통 mesh name hash). */
  seed: number;
  cultivarOverride?: CultivarShapeOverride;
  /** "skinplant_leaf_{seed}_a{ax}_n{n}" — 개별 mesh는 _l{idx}_{position} 접미사. */
  meshNamePrefix: string;
}

const WORLD_UP: V3 = { x: 0, y: 1, z: 0 };

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

/**
 * Build per-leaflet plane meshes for one compound leaf.
 *
 * Returns an array of Babylon Mesh (length = leafletSkeletonNodes.length).
 * 각 mesh:
 *   - parent unset (caller assigns lushGroup)
 *   - material unset (caller assigns yellow/normal/diseased)
 *   - position + rotationQuaternion 설정 완료
 *   - computeWorldMatrix(true) 호출 완료 (SSOT #185 stale-matrix prevention)
 *   - normalizeLeafMeshVertices 호출 완료 (SSOT #186 anchor contract)
 *
 * @throws Error  bladeRef 또는 leafletSkeletonNodes 누락 시 (mandatory path).
 */
export function buildLeafletMeshes(ctx: LeafletMeshBuildContext): Mesh[] {
  // ★ Mandatory path — Phase K silent fallback 회피.
  if (!ctx.bladeRef) {
    throw new Error('buildLeafletMeshes: bladeRef required (Iter 39 mandatory contract)');
  }
  if (!ctx.leafletSkeletonNodes) {
    throw new Error('buildLeafletMeshes: leafletSkeletonNodes required (mandatory contract)');
  }
  if (ctx.leafletSkeletonNodes.length === 0) return [];

  const preset = AGE_PRESETS[ctx.bladeRef.agePreset];
  const resolved = applyCorrelation(ctx.bladeRef.complexity, preset, ctx.seed);

  // Cultivar shape override (Iter 38 S4 — buildCompoundLeaf와 동일 산식).
  if (ctx.cultivarOverride) {
    const o = ctx.cultivarOverride;
    if (o.aspectRatioMultiplier != null) resolved.aspectRatio *= o.aspectRatioMultiplier;
    if (o.baseShapeBias != null) {
      resolved.baseShape = Math.max(0.7, Math.min(1.0, resolved.baseShape + o.baseShapeBias));
    }
    if (o.tipSharpnessMultiplier != null) {
      resolved.tipSharpness = Math.max(
        1.0, Math.min(2.0, resolved.tipSharpness * o.tipSharpnessMultiplier),
      );
    }
  }

  // Phase A: 모든 leaflet 동일 rotation (rachis-outward = petiole tangent).
  // ★ Iter 39 Phase F5 — per-leaflet maturity-dependent pose composition:
  //   - openness = smoothstep(0.2, 0.8, maturity): young 접힘 (0.2) → mature 펼침 (1.0)
  //   - foldDroop = lerp(-0.30, 0.45, maturity): young 위로(-0.3) → mature 처짐(+0.45)
  //   - pose pitch/roll/twist는 openness 비례 — young 잎은 거의 접힘 상태.
  //   plan v1 비판 #5: "leaflet pose 가 maturity 의존이어야 — young upright/folded,
  //   mature open/drooped". random fan-out 0.
  const q = makeLeafQuaternion(ctx.petioleTipTangent, WORLD_UP);
  const rotationQ = new Quaternion(q.x, q.y, q.z, q.w);

  const ageFrac = Math.min(1, ctx.leafOrganState.senescence.progress);
  const curl = ctx.leafOrganState.posture.curl + ctx.leafOrganState.senescence.curl * 0.5;
  const gravityDroopDeg = ctx.leafOrganState.posture.gravityDroopDeg ?? 0;
  // ★ Iter 39 Phase F5 — maturity-driven pose envelope.
  const maturity = Math.max(0, Math.min(1, ctx.leafOrganState.expansionProgress));
  const opennessFactor = (() => {
    const t = Math.max(0, Math.min(1, (maturity - 0.2) / (0.8 - 0.2)));
    return 0.2 + (1.0 - 0.2) * (t * t * (3 - 2 * t));   // smoothstep 0.2 → 1.0
  })();
  const foldDroopDeg = -10 + (30 - (-10)) * maturity;    // -10° ~ +30°

  const meshes: Mesh[] = [];

  for (let i = 0; i < ctx.leafletSkeletonNodes.length; i++) {
    const node = ctx.leafletSkeletonNodes[i];
    if (!node.leafletRef) continue;

    const leafletSeed = djb2(node.id) * 0.7919 + i * 31;
    const lengthM = node.leafletRef.targetSizeM;
    if (lengthM <= 0) continue;

    // ★ Iter 39 Phase F4 — per-leaflet shape jitter (LeafInstanceProfile 위에).
    //   plan v1 비판 #4: leaflet 단위 미세 variation. ±10% aspectRatio/tipSharpness.
    //   deterministic per-leaflet seed = djb2(node.id) — same plant → same shape.
    const idSeed = djb2(node.id);
    const aspectJitter    = 1 + (((idSeed * 23) % 200 - 100) / 1000);  // ±10%
    const sharpnessJitter = 1 + (((idSeed * 29) % 200 - 100) / 1000);

    // Profile (좌우 halfWidth + lobe + serration) — buildCompoundLeaf와 동일 산식.
    const profile = buildShapeProfile({
      lengthM,
      aspectRatio:  resolved.aspectRatio  * aspectJitter,
      tipSharpness: resolved.tipSharpness * sharpnessJitter,
      baseShape:    resolved.baseShape,
      asymmetry:    resolved.asymmetry,
    });
    for (const sample of profile) {
      const lobe = lobeNoise(sample.u, resolved.lobeDepth * lengthM, leafletSeed);
      const teeth = serrationNoise(
        sample.u, resolved.serrationAmp * lengthM, resolved.serrationFreq, leafletSeed,
      );
      sample.halfWidthLeft += lobe + teeth;
      sample.halfWidthRight += lobe * 0.85 + teeth * 1.1;
    }

    // Plane geometry chunk (mesh-local).
    // ★ Iter 39 Phase F2.5 — veinSurfaceStrength = 1 (botanical midrib raise +
    //   lateral vein 음각). seed = djb2(node.id) — deterministic.
    const chunk = buildLeafletPlaneChunk(profile, {
      lengthM,
      curl,
      ageFrac,
      gravityDroopDeg,
      waviness: 0,
      isTerminal: node.leafletRef.position === 'terminal',
      veinSurfaceStrength: 1,
      seed: djb2(node.id),
    });

    // SSOT #186 — anchor contract: vertex.x_min == 0.
    // Generator는 이미 base를 x=0에 배치하지만, lobe/serration noise가
    // 양 끝 vertex를 약간 outward shift 가능 → 방어적으로 호출.
    normalizeLeafMeshVertices(chunk.positions);

    const meshName = `${ctx.meshNamePrefix}_l${i}_${node.leafletRef.position}`;
    const mesh = new Mesh(meshName, ctx.scene);
    const vd = new VertexData();
    vd.positions = chunk.positions;
    vd.normals = chunk.normals;
    vd.uvs = chunk.uvs;
    vd.indices = chunk.indices;
    vd.applyToMesh(mesh);

    // ★ graph SSOT — mesh.position = leafletSkeletonNode.pos (plant-local).
    mesh.position = new Vector3(node.pos.x, node.pos.y, node.pos.z);
    // ★ Iter 39 Phase F5 — maturity-dependent pose composition.
    //   1) base rotation (rachis-outward, all leaflets 동일)
    //   2) per-leaflet pitch (foldDroop + per-leaflet noise, scaled by openness)
    //   3) per-leaflet roll (lateral curl, scaled by openness)
    //   4) per-leaflet twist (per-leaflet noise, scaled by openness × ageFrac)
    //   openness=0.2 (young): 거의 모든 회전 ×0.2 (접힘 상태). openness=1.0
    //   (mature): 자연 회전 진폭. young upright (negative pitch) + mature drooped.
    const pitchNoise = (((idSeed * 17) % 200 - 100) / 1000);  // ±0.1 rad
    const rollNoise  = (((idSeed * 19) % 400 - 200) / 1000);  // ±0.2 rad
    const twistNoise = (((idSeed * 13) % 300 - 150) / 1000);  // ±0.15 rad
    const pitchRad = (foldDroopDeg * Math.PI / 180 + pitchNoise) * opennessFactor;
    const rollRad  = rollNoise  * opennessFactor;
    const twistRad = twistNoise * opennessFactor;
    const localQ = Quaternion.RotationYawPitchRoll(twistRad, pitchRad, rollRad);
    mesh.rotationQuaternion = rotationQ.multiply(localQ);
    // SSOT #185 — leafMesh stale worldMatrix trap (Iter 28 fix).
    mesh.computeWorldMatrix(true);

    meshes.push(mesh);
  }

  return meshes;
}
