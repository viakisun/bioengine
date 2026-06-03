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

// ★ Iter 39 L3-A (S19) — leafChunk export 제거. leafChunk.ts 파일 자체 삭제.
//   buildLeafChunkLegacy/Skin/createOvateLeaflet/buildLeafBladeOnly 모두
//   fallback path 의존 (0% live, LEAF-LIVE-FALLBACK-NEVER-01 보장).
//   production canonical = LeafMeshBuilder → LeafletPlaneChunk (이 패키지에 보존).

// Iter 39 Phase A — per-leaflet plane chunk (Skin path 신규 entry).
// ★ Iter 39 L3-B (S20) — LeafletPlaneChunk를 src/scene/leaf/로 이동.
//   tomato-geometry는 cotyledon/stem/truss만 보유.

export { buildLeafColorBytes, buildLeafNormalBytes, LEAF_TEX_SIZE } from './leafTexture';

export { buildCotyledonChunk } from './cotyledonChunk';
export type { CotyledonChunkParams } from './cotyledonChunk';

export { catmullRom, catmullRomPath } from './stemPath';
export type { Vec3 } from './stemPath';
