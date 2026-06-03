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
import type { LeafSpec, CultivarOverride } from './LeafSpec';
import { resolveCultivar } from './LeafSpec';
import {
  buildLeafMeshFromSkeleton,
  computeLeafMacroState,
  type LeafMeshPatch,
  type LeafletMeshBuildContext,
} from './LeafMeshBuilder';
import {
  wrapLeafChunksAsMeshes,
  getLeafMaterial,
  getYellowLeafMaterial,
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

    const ctx: LeafletMeshBuildContext = {
      spec,
      bladeRef: leafBladeRootNode.leafBladeRef,
      leafletSkeletonNodes: leafletNodes,
      leafBladeRootNode,
      petioleTipTangent,
      leafOrganState: leafBladeRootNode.phytomer.leaf,
      rng,
      seed,
      cultivarOverride,
      meshNamePrefix,
      quality: options.quality,
      leafMacro,
    };

    return buildLeafMeshFromSkeleton(ctx);
  },

  /** Convert pure LeafMeshPatch[] into Babylon Mesh[] (scene attached). */
  wrapAsMeshes(patches: LeafMeshPatch[], scene: Scene): Mesh[] {
    return wrapLeafChunksAsMeshes(patches, scene);
  },

  /** Scene-cached leaf material (PBR with optional shader wind on WebGL2). */
  getMaterial(scene: Scene): PBRMaterial {
    return getLeafMaterial(scene);
  },

  /** Scene-cached yellow (senescent) leaf material. */
  getYellowMaterial(scene: Scene): PBRMaterial {
    return getYellowLeafMaterial(scene);
  },
};

export type { LeafMeshPatch } from './LeafMeshBuilder';
