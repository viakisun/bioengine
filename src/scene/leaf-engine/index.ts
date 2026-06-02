// Iter 36 v5 Phase D — leaf-engine entry: buildCompoundLeaf.
//
// 사용자 architectural model "skeleton → node 정보 → rendering 알고리즘" 의
// 3-tier 중 마지막 tier (rendering 엔진). Conservative 분리:
//   - Skeleton: LeafBladeRef + LeafletNodeRef[] (구조 데이터, 좌표 + 4 position type)
//   - Rendering engine (이 모듈): shape + serration + lobe + asymmetry + pose 등 _모든_
//     procedural variation을 단독 책임.
//
// 사용자 botanical reference §9 procedural 흐름 (10 단계):
//   1. leafAge/cultivar/complexity → preset 선택 (skeleton bladeRef.agePreset)
//   2. leafLength 산출 (correlation rules)
//   3. petiole + rachis curve
//   4. major leaflet pair 개수 (correlation)
//   5. rachis 부착 지점 t (skeleton leafletNodes.rachisU)
//   6. primary leaflet (좌우 비대칭)
//   7. intercalary 추가
//   8. secondary 추가
//   9. 각 소엽 outline (shape + lobe + serration + asymmetry + curl + wrinkle)
//  10. 전체 회전/처짐
//
// Phase D 시점: 인터페이스 + 산식 모듈만. 실제 vertex 생성은 Phase E (LeafGenerator
// 통합).

import type { LeafBladeRef, SkeletonNode } from '../../plant/skeleton/PlantSkeletonGraph';
// ★ Iter 39 L3-C S23 — agePresets + correlationRules inline to LeafMeshBuilder.
import { AGE_PRESETS, applyCorrelation, type ResolvedLeafParams } from './LeafMeshBuilder';
// ★ Iter 39 L3-C S22 — shapeProfile inline to LeafMeshBuilder.
import { buildShapeProfile, type ShapeProfileSample } from './LeafMeshBuilder';
// ★ Iter 39 L3-C S21 — lobeNoise + serrationNoise inline to LeafMeshBuilder.
import { lobeNoise, serrationNoise } from './LeafMeshBuilder';
// ★ Iter 39 L3-C S24 — poseVariation inline to LeafMeshBuilder.
import { computeLeafletPose, type LeafletPose } from './LeafMeshBuilder';

export interface CompoundLeafDescriptor {
  /** Resolved 잎 전체 파라미터 (correlation 적용 후). */
  resolved: ResolvedLeafParams;
  /** 각 leaflet의 outline + pose. Iter 39 Phase B: node 타입을 SkeletonNode로
   *  확장 (node.id 보존) — buildLeafletMeshes가 ID-keyed Map 구성 가능. */
  leaflets: Array<{
    /** skeleton node (id + pos + leafletRef 풀 메타데이터). */
    node: SkeletonNode;
    /** Shape outline (samples × halfWidth left/right). */
    profile: ShapeProfileSample[];
    /** Procedural pose (attach + pitch + roll + twist). */
    pose: LeafletPose;
  }>;
}

/**
 * Compound leaf descriptor 생성 — skeleton 데이터를 procedural variation 통합.
 *
 * 산출물은 _descriptor_ (geometry blueprint). 실제 Babylon Mesh 생성은 Phase E
 * 에서 LeafGenerator + buildLeafChunkSkin이 이 descriptor를 소비.
 *
 * @param bladeRef Skeleton의 leaf-blade-root node에 부착된 metadata.
 * @param leafletNodes Skeleton에서 read한 leaflet nodes (4 position types).
 * @param seed deterministic seed (per leaf instance, 보통 leaf node ID hash).
 */
export interface CultivarShapeOverride {
  aspectRatioMultiplier?: number;
  baseShapeBias?: number;
  tipSharpnessMultiplier?: number;
}

export function buildCompoundLeaf(
  bladeRef: LeafBladeRef,
  /** Iter 39 Phase B — SkeletonNode[] (LeafletNodeRef[] → 확장). node.id 보존
   *  으로 buildLeafletMeshes의 ID-keyed Map lookup 가능. */
  leafletNodes: ReadonlyArray<SkeletonNode>,
  seed: number,
  // ★ Iter 38 S4 — Cultivar shape override (optional, back-compat).
  cultivarOverride?: CultivarShapeOverride,
): CompoundLeafDescriptor {
  // 1. Preset lookup.
  const preset = AGE_PRESETS[bladeRef.agePreset];

  // 2-9. Correlation rules apply → resolved params.
  //   ★ Iter 38 S3 — Hybrid sampling: seed 전달 (AGE_PRESETS baseline + jitter).
  const resolved = applyCorrelation(bladeRef.complexity, preset, seed);

  // ★ Iter 38 S4 — Cultivar override apply (cherry 0.85 / beef 1.15 등).
  if (cultivarOverride) {
    if (cultivarOverride.aspectRatioMultiplier != null) {
      resolved.aspectRatio *= cultivarOverride.aspectRatioMultiplier;
    }
    if (cultivarOverride.baseShapeBias != null) {
      resolved.baseShape = Math.max(0.7, Math.min(1.0,
        resolved.baseShape + cultivarOverride.baseShapeBias));
    }
    if (cultivarOverride.tipSharpnessMultiplier != null) {
      resolved.tipSharpness = Math.max(1.0, Math.min(2.0,
        resolved.tipSharpness * cultivarOverride.tipSharpnessMultiplier));
    }
  }

  // 10. 각 leaflet마다 outline + pose 생성.
  //   leafletRef 부재 시 (defensive — populator 보장하지만 type-safety 위해) skip.
  const leaflets: CompoundLeafDescriptor['leaflets'] = [];
  for (let i = 0; i < leafletNodes.length; i++) {
    const node = leafletNodes[i];
    const ref = node.leafletRef;
    if (!ref) continue;
    const leafletSeed = seed * 0.7919 + i * 31.0;
    const lengthM = ref.targetSizeM;

    // ★ Iter 38 S3 — resolved.baseShape + tipSharpness 사용 (이전: hardcoded).
    const profile = buildShapeProfile({
      lengthM,
      aspectRatio: resolved.aspectRatio,
      tipSharpness: resolved.tipSharpness,
      baseShape: resolved.baseShape,
      asymmetry: resolved.asymmetry,
    });

    // shape에 lobe + serration 적용.
    for (const sample of profile) {
      const lobe = lobeNoise(sample.u, resolved.lobeDepth * lengthM, leafletSeed);
      const teeth = serrationNoise(
        sample.u, resolved.serrationAmp * lengthM, resolved.serrationFreq, leafletSeed,
      );
      sample.halfWidthLeft += lobe + teeth;
      sample.halfWidthRight += lobe * 0.85 + teeth * 1.1;  // 좌우 약간 다름
    }

    const pose = computeLeafletPose(ref.position, ref.rachisU, resolved.poseDroopDeg, leafletSeed);

    leaflets.push({ node, profile, pose });
  }

  return { resolved, leaflets };
}

export type { ResolvedLeafParams } from './LeafMeshBuilder';
export { AGE_PRESETS } from './LeafMeshBuilder';

// Iter 39 Phase A — per-leaflet plane mesh entry (Skin path).
export { buildLeafletMeshes } from './buildLeafletMeshes';
export type { LeafletMeshBuildContext } from './buildLeafletMeshes';

// ★ Iter 39 Phase L2-1 — canonical entry (사용자 v3 Option B refactor).
//   현재 thin wrapper, L2-3 이후 산식 통합 진입점.
//   참조: docs/architecture/LEAF_MESH_PIPELINE_AUDIT.md
export { buildLeafMeshFromSkeleton } from './LeafMeshBuilder';
export type { LeafMeshBuildInput } from './LeafMeshBuilder';
// ★ Iter 39 Phase L2-3 — per-leaflet position profile (visual change).
export { PROFILE_BY_POSITION, applyPositionProfile } from './LeafMeshBuilder';
export type { LeafletPosition, LeafletShapeProfile } from './LeafMeshBuilder';

// Iter 39 Phase F4 — LeafInstanceProfile (per-compound-leaf macro variation).
export { computeLeafInstanceProfile } from './LeafMeshBuilder';
export type { LeafInstanceProfile } from './LeafMeshBuilder';
