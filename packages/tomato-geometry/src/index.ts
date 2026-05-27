// @farmsim/tomato-geometry — engine-agnostic geometry generators.
//
// All functions return raw GeoChunk (positions/normals/uvs/indices) or
// Uint8Array texture bytes. Wrap with Babylon / Three / Filament / etc.

export type { GeoChunk, Mat4 } from './types';
export {
  newChunk,
  mergeChunks,
  createCylinderChunk,
  rotateChunkX,
  rotateChunkY,
  rotateChunkZ,
  translateChunk,
  transformChunk,
} from './types';

export {
  buildLeafChunk,        // Legacy — used by ShowcasePlant. embeds petiole + rachis + petiolules.
  buildLeafBladeOnly,    // Iter 18A — option-driven variant (omitRachis / omitPetiolules).
  buildLeafChunkSkin,    // Iter 18B PR 7 — Skin preset: leaflets only (omit-all).
  DEFAULT_LEAF_PARAMS,
} from './leafChunk';
export type { LeafBuildParams, LeafShapeParams } from './leafChunk';

export { buildLeafColorBytes, buildLeafNormalBytes, LEAF_TEX_SIZE } from './leafTexture';

export { buildCotyledonChunk } from './cotyledonChunk';
export type { CotyledonChunkParams } from './cotyledonChunk';

export { catmullRom, catmullRomPath } from './stemPath';
export type { Vec3 } from './stemPath';
