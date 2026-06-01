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
  buildLeafChunkLegacy,        // Legacy — used by ShowcasePlant. embeds petiole + rachis + petiolules.
  buildLeafChunkSkin,    // ★ Canonical Skin entry: leaflets only (omit petiole + rachis + petiolules).
  DEFAULT_LEAF_PARAMS,
} from './leafChunk';
export type { LeafBuildParams, LeafShapeParams } from './leafChunk';

// Iter 39 Phase A — per-leaflet plane chunk (Skin path 신규 entry).
export { buildLeafletPlaneChunk } from './leafletPlaneChunk';
export type { LeafletPlaneOptions, ShapeProfileSampleLite } from './leafletPlaneChunk';

export { buildLeafColorBytes, buildLeafNormalBytes, LEAF_TEX_SIZE } from './leafTexture';

export { buildCotyledonChunk } from './cotyledonChunk';
export type { CotyledonChunkParams } from './cotyledonChunk';

export { catmullRom, catmullRomPath } from './stemPath';
export type { Vec3 } from './stemPath';
