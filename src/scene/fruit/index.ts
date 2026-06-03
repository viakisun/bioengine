// ★ Iter 39 Phase L7-A-4 (S65) — Fruit engine barrel.
//
// Engine layer (plant-agnostic — 원칙 #42). botanical data는 src/data/fruit/.

export { FruitEngine } from './FruitEngine';
export type { CreateFruitOptions } from './FruitEngine';

export type {
  FruitSpec,
  MorphologyRules,
  MeshResolution,
  ResolutionLevel,
  RipeningRules,
  MaterialRules,
  FruitCultivarOverride,
  FruitTaxonomy,
  EffectiveFruitMorphology,
} from './FruitSpec';
export {
  FruitSpecSchema,
  MorphologyRulesSchema,
  MeshResolutionSchema,
  RipeningRulesSchema,
  MaterialRulesSchema,
  FruitCultivarOverrideSchema,
  TaxonomySchema,
  parseFruitSpec,
  resolveFruitCultivar,
  applyCultivarLayers,
} from './FruitSpec';

// Existing exports (TrussGenerator + SkinMeshPlant 호환)
export { createFruitNode, getCalyxSourceMesh, getStemSourceMesh, computeHarvestPoseAnchors } from './FruitGenerator';
