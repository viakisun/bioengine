// ★ Iter 39 Phase L4-6 (S34) — LeafEngine namespace API.
//
// 책임 (원칙 #42):
//   src/scene/leaf/ (이 폴더)는 plant-agnostic engine.
//   data registry는 src/data/leaf/ (caller가 getLeafSpec(name) 로드 + 주입).
//
// 사용자 v3 sketch (data-driven API):
//   const spec = getLeafSpec('tomato.json');     ← data layer
//   const patches = LeafEngine.createLeaf(spec, node, graph, options);
//   const meshes = LeafEngine.wrapAsMeshes(patches, scene);
//
// LeafEngine은 _spec을 받아 mesh를 만드는_ 책임만 가짐. plant identifier
// ('tomato.json')는 caller 선택, engine 코드 안 'tomato' 단어 0.

import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';

import type {
  PlantSkeletonGraph,
  SkeletonNode,
} from '../../plant/skeleton/PlantSkeletonGraph';
import { getLeafletSkeletonNodesByParentLeaf } from '../../plant/skeleton/PlantSkeletonGraph';
import { SeededRandom } from '@farmsim/tomato-engine';
import type { LeafSpec, CultivarOverride, MeshPresetKey } from './LeafSpec';
import { resolveCultivar } from './LeafSpec';
// ★ S142 — Active mesh preset selector (URL/override → spec.default).
import { getActiveMeshPreset } from '../../data/leaf';
import {
  buildLeafMeshFromSkeleton,
  computeLeafMacroState,
  type LeafMeshPatch,
  type LeafletMeshBuildContext,
} from './LeafMeshBuilder';
// ★ L9-D V2 S86 — V2 outline builder dispatch (opt-in, default 'v1').
import { buildLeafMeshFromSkeletonV2 } from './LeafMeshBuilder2';
import {
  wrapLeafChunksAsMeshes,
  wrapLeafChunksAsLeafBatch,
  getLeafMaterial,
  getYellowLeafMaterial,
  getSimpleLeafMaterial,
} from './LeafMaterial';
import type { LeafMeshQuality } from './LeafletProfile';

/**
 * Options for {@link LeafEngine.createLeaf}.
 *
 * `cultivar`는 string key — `spec.cultivars[name]` 에서 lookup. 미존재 시 throw.
 * 직접 override object를 넘기려면 `cultivarOverride`를 사용 (back-compat,
 * Iter 38 S4 호환).
 */
export interface CreateLeafOptions {
  /** Cultivar key from `spec.cultivars` (e.g. 'cherry', 'beefsteak', 'roma'). */
  cultivar?: string;
  /** Direct cultivar override object (back-compat). Wins over `cultivar` lookup. */
  cultivarOverride?: CultivarOverride;
  /** Deterministic seed. Default 0 (caller가 보통 plant seed + node idx hash 제공). */
  seed?: number;
  /** Mesh resolution. Default 'low'. */
  quality?: LeafMeshQuality;
  /** Mesh name prefix. Default = `leaf_${nodeId}`. */
  meshNamePrefix?: string;
  /**
   * ★ L9-D V2 S86 — Outline builder version. Default `'v1'` (production).
   *
   *   - `'v2'` (★ default since S117): LeafMeshBuilder2.ts — BGT (Beta × Gaussian × Triangle).
   *     사용자 reference 산식, 정식 production. n_internal=900 + box-average decimation.
   *   - `'v1'` (legacy): LeafMeshBuilder.ts — `sin(πu)^shapePower` 단일 bell curve.
   *     S117 정식 archive 결정 — `?leafBuilder=v1` URL 옵션으로만 접근 가능.
   *
   * Caller dispatch via URL `?leafBuilder=v1` (legacy opt-out, SkinMeshPlant에서 격리).
   */
  builderVersion?: 'v1' | 'v2';

  /**
   * ★ L9-D V2 S87 — Diagnostic posture override (TEMPORARY).
   *
   * outline 단독 평가용 (curl/droop/z-twist OFF). `?leafPlane=flat`로 활성.
   * V1+V2 모두 적용. _phase 종료 시 (V2 acceptance Q1-a/Q3-a 평가 후) 제거 의무_.
   *
   * 산식 효과: LeafShapeDescriptor에서 ctx.leafOrganState.posture.curl/
   * gravityDroopDeg 대신 override 값 사용 → transverseCup/z-twist/longitudinalDroop 0.
   */
  postureOverride?: {
    curl?: number;
    gravityDroopDeg?: number;
  };

  /**
   * ★ S142 후속 — Mesh preset override (caller가 mode quality 등에 따라 결정).
   *   priority: 본 옵션 > URL `?leafConfig=` > spec.meshConfig.default.
   *   undefined 시 기존 동작 유지 (URL 또는 default).
   */
  meshConfigKey?: MeshPresetKey;
}

/** Required internal context derived from skeleton + graph. */
interface CreateLeafSkeletonInputs {
  petioleTipTangent: { x: number; y: number; z: number };
}

function buildSkeletonInputs(
  leafBladeRootNode: SkeletonNode,
  graph: PlantSkeletonGraph,
): CreateLeafSkeletonInputs {
  // petiole tip tangent = last edge bone tangent into leaf-blade-root.
  // (SkinMeshPlant inline 산식과 동일 — DRY)
  for (const edge of graph.edges.values()) {
    if (edge.endNodeId !== leafBladeRootNode.id) continue;
    if (edge.type !== 'petiole') continue;
    if (!edge.bonePath || edge.bonePath.length === 0) continue;
    const lastBone = edge.bonePath[edge.bonePath.length - 1];
    return {
      petioleTipTangent: {
        x: lastBone.p1.x - lastBone.p0.x,
        y: lastBone.p1.y - lastBone.p0.y,
        z: lastBone.p1.z - lastBone.p0.z,
      },
    };
  }
  // Fallback: world-up unless caller wraps & supplies.
  return { petioleTipTangent: { x: 0, y: 1, z: 0 } };
}

/**
 * Plant-agnostic leaf mesh engine.
 *
 * Single source of truth for leaf mesh generation. spec parameter injection
 * for botanical data (engine layer purity, 원칙 #42).
 */
export const LeafEngine = {
  /**
   * Create leaf mesh patches (pure data, no Babylon Mesh creation).
   *
   * @param spec     Botanical spec — loaded via `getLeafSpec(name)` from src/data/leaf.
   * @param leafBladeRootNode  Skeleton node where the leaf attaches (kind=leaf-blade-root).
   * @param graph    Full plant skeleton graph (for petiole tangent derivation).
   * @param options  cultivar key / seed / quality / meshNamePrefix.
   * @returns        Pure LeafMeshPatch[] — wrap to Babylon Mesh via {@link LeafEngine.wrapAsMeshes}.
   */
  createLeaf(
    spec: LeafSpec,
    leafBladeRootNode: SkeletonNode,
    graph: PlantSkeletonGraph,
    options: CreateLeafOptions = {},
  ): LeafMeshPatch[] {
    if (!leafBladeRootNode.leafBladeRef) {
      throw new Error(
        `LeafEngine.createLeaf: node ${leafBladeRootNode.id} missing leafBladeRef (kind must be leaf-blade-root)`,
      );
    }
    if (!leafBladeRootNode.phytomer?.leaf) {
      throw new Error(
        `LeafEngine.createLeaf: node ${leafBladeRootNode.id} missing phytomer.leaf`,
      );
    }

    const leafletNodes = getLeafletSkeletonNodesByParentLeaf(graph, leafBladeRootNode.id);
    const { petioleTipTangent } = buildSkeletonInputs(leafBladeRootNode, graph);

    const cultivarOverride =
      options.cultivarOverride ?? resolveCultivar(spec, options.cultivar);

    const seed = options.seed ?? 0;
    const rng = new SeededRandom(seed);
    const meshNamePrefix = options.meshNamePrefix ?? `leaf_${leafBladeRootNode.id}`;

    // ★ L6-A-7 (S52) — per-leaf macro state 자동 산출. phytomer.index를
    //   leafNodeIdx로 사용 (deterministic per leaf).
    const leafNodeIdx = leafBladeRootNode.phytomer.index;
    const leafMacro = computeLeafMacroState(spec.leafInstanceRules, leafNodeIdx, seed);

    // ★ L9-D V2 S87 — postureOverride (TEMPORARY diagnostic, ?leafPlane=flat).
    //   outline 단독 평가용. 산식 효과: transverseCup/z-twist/longitudinalDroop 0.
    //   phytomer.leaf.posture는 gravityDroopDeg가 없을 수 있음 (optional in ctx type).
    const rawPosture = leafBladeRootNode.phytomer.leaf.posture as typeof leafBladeRootNode.phytomer.leaf.posture & { gravityDroopDeg?: number };
    const effectiveLeafOrganState = options.postureOverride
      ? {
          ...leafBladeRootNode.phytomer.leaf,
          posture: {
            ...rawPosture,
            curl: options.postureOverride.curl ?? rawPosture.curl,
            gravityDroopDeg:
              options.postureOverride.gravityDroopDeg ?? rawPosture.gravityDroopDeg ?? 0,
          },
        }
      : leafBladeRootNode.phytomer.leaf;

    // ★ S142 — Active mesh preset 결정.
    //   priority: options.meshConfigKey > URL `?leafConfig=` > spec.meshConfig.default.
    //   builder들 (V1/V2)이 ctx.meshPreset에서 samples/cols 읽음.
    const { preset: meshPreset } = getActiveMeshPreset(spec, options.meshConfigKey);

    const ctx: LeafletMeshBuildContext = {
      spec,
      bladeRef: leafBladeRootNode.leafBladeRef,
      leafletSkeletonNodes: leafletNodes,
      leafBladeRootNode,
      petioleTipTangent,
      leafOrganState: effectiveLeafOrganState,
      rng,
      seed,
      cultivarOverride,
      meshNamePrefix,
      quality: options.quality,
      leafMacro,
      meshPreset,
    };

    // ★ S117 — V2 정식 production default. V1은 _legacy opt-out_ (URL `?leafBuilder=v1`).
    //   기존 (S86 plan): V1 default, V2 opt-in via `?leafBuilder=v2`.
    //   S117 (사용자 결정): V2 정식 교체. V1 archive (file 유지 — 공유 helpers 의존성).
    return options.builderVersion === 'v1'
      ? buildLeafMeshFromSkeleton(ctx)        // legacy
      : buildLeafMeshFromSkeletonV2(ctx);     // default (v2 production)
  },

  /**
   * Convert pure LeafMeshPatch[] into Babylon Mesh[] (per-leaflet, debug/legacy).
   * ★ Production caller는 `wrapAsLeafBatch` 사용 (draw call 30× 감소).
   */
  wrapAsMeshes(patches: LeafMeshPatch[], scene: Scene): Mesh[] {
    return wrapLeafChunksAsMeshes(patches, scene);
  },

  /**
   * ★ L6-B-1a (S56) — Per-leaf merge batching (1 leaf = 1 Mesh).
   *
   * 단일 compound leaf의 leaflet patches를 하나의 Babylon Mesh로 merge.
   * leaflet rotation/translation은 vertex에 baked, mesh.position은 leaf-blade-root.
   *
   * @param patches             단일 compound leaf의 leaflet patches
   * @param leafBladeRootPos    plant-local position of leaf-blade-root node
   * @param scene               Babylon scene
   * @param meshName            batched mesh name
   * @returns                   Mesh, 또는 empty patches 시 null
   */
  wrapAsLeafBatch(
    patches: LeafMeshPatch[],
    leafBladeRootPos: { x: number; y: number; z: number },
    scene: Scene,
    meshName: string,
  ): Mesh | null {
    return wrapLeafChunksAsLeafBatch(patches, leafBladeRootPos, scene, meshName);
  },

  /** Scene-cached leaf material (PBR with optional shader wind on WebGL2). */
  getMaterial(scene: Scene): PBRMaterial {
    return getLeafMaterial(scene);
  },

  /** Scene-cached yellow (senescent) leaf material. */
  getYellowMaterial(scene: Scene): PBRMaterial {
    return getYellowLeafMaterial(scene);
  },

  /**
   * ★ L6-B-3 (S59) — Simple leaf material (no clearcoat/subsurface/wind).
   *   Use case: far LOD background plant (ultra-low quality). ~25% fragment
   *   cost reduction vs full PBR.
   */
  getSimpleMaterial(scene: Scene): PBRMaterial {
    return getSimpleLeafMaterial(scene);
  },
};

export type { LeafMeshPatch } from './LeafMeshBuilder';
