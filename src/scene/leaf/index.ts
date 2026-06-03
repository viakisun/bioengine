// ★ Iter 39 Phase L4 — Leaf engine entry barrel.
//
// Engine layer (plant-agnostic — 원칙 #42). botanical data는 src/data/leaf/.
//
// 산식 SSOT: LeafMeshBuilder.ts (canonical entry buildLeafMeshFromSkeleton).
// Babylon wrapper: LeafMaterial.ts (wrapLeafChunksAsMeshes + materials).
// Spec: LeafSpec.ts (Zod schema + parseLeafSpec + resolveCultivar).
//
// 사용자 botanical reference §9 procedural 흐름:
//   skeleton → ctx.spec.agePresets[bladeRef.agePreset] → applyCorrelation →
//   per-leaflet outline (profile + lobe + serration) → pose → mesh chunk.

// ─── Legacy compound-leaf descriptor (Iter 36 Phase D) ─────────────────────
// ★ Iter 39 L4-5 (S33) — buildCompoundLeaf 함수 _제거_. production은
//   buildLeafMeshFromSkeleton 단일 사용. 잔존 type re-export만.

// ─── Legacy types (예비) ───────────────────────────────────────────────────

export interface CultivarShapeOverride {
  aspectRatioMultiplier?: number;
  baseShapeBias?: number;
  tipSharpnessMultiplier?: number;
}

// ─── Re-exports — engine entry ─────────────────────────────────────────────

export type { ResolvedLeafParams } from './LeafMeshBuilder';
export { AGE_PRESETS } from './LeafMeshBuilder';
export type { LeafletMeshBuildContext } from './LeafMeshBuilder';

// ★ Canonical entry — buildLeafMeshFromSkeleton{spec, ctx}.
export { buildLeafMeshFromSkeleton } from './LeafMeshBuilder';
export type { LeafMeshBuildInput, LeafMeshPatch } from './LeafMeshBuilder';

// L2-3 per-leaflet position profile.
export { PROFILE_BY_POSITION, applyPositionProfile } from './LeafMeshBuilder';
export type { LeafletPosition, LeafletShapeProfile } from './LeafMeshBuilder';

// LeafInstanceProfile (per-compound-leaf macro variation).
export { computeLeafInstanceProfile } from './LeafMeshBuilder';
export type { LeafInstanceProfile } from './LeafMeshBuilder';

// L4-3 LeafSpec + Zod runtime validation.
export type {
  LeafSpec,
  AgePresetParams,
  ProfileByPosition,
  CorrelationRules,
  PoseRules,
  CultivarOverride,
  Taxonomy,
} from './LeafSpec';
export {
  LeafSpecSchema,
  AgePresetSchema,
  PositionProfileSchema,
  ProfileByPositionSchema,
  CorrelationRulesSchema,
  PoseRulesSchema,
  CultivarOverrideSchema,
  TaxonomySchema,
  parseLeafSpec,
  resolveCultivar,
} from './LeafSpec';

