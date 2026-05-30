// Cotyledon (떡잎) mesh generator — embryonic leaf, oval, 2 per plant.
//
// Reference: main branch generators/PlantGenerator.createCotyledons.
// Original used Three.js PlaneGeometry; here we emit raw vertex arrays
// (16-segment oval) so any renderer can wrap.
//
// Cotyledons are anatomically simple — no veins, no serration, just
// an oval blade. They emerge day 3, peak day 8–15, fade day 25.

import { type GeoChunk, newChunk } from './types';

export interface CotyledonChunkParams {
  /** Half-length along the leaf axis (m). main used 0.015 × cotyledonSize × 2 (full length). */
  size: number;
  /** Segments per side of the oval outline. Default 8 (smooth). */
  segments?: number;
  /**
   * Iter 29 Phase 2 — Width-to-length ratio. halfWidth = halfLen × ratio.
   * 토마토 떡잎은 좁고 긴 oval (Jones JB 2007). default 0.35 (2.85:1).
   * Legacy default 0.5 (2:1) — caller가 명시 안 하면 이전 동작 유지.
   */
  widthLengthRatio?: number;
}

/**
 * Build a flat oval (rounded rectangle / leaf shape) chunk in the XZ plane.
 *
 * The blade extends along +X from origin. Width is `size × widthLengthRatio × 2`,
 * length is `size × 2`. The renderer rotates/positions for the two opposing cotyledons.
 */
export function buildCotyledonChunk(params: CotyledonChunkParams): GeoChunk {
  const halfLen = params.size; // length is size*2 (along X)
  // Iter 29 Phase 2 — width ratio param. legacy default 0.5 (2:1).
  const widthLengthRatio = params.widthLengthRatio ?? 0.5;
  const halfWidth = params.size * widthLengthRatio;
  const segs = params.segments ?? 8;

  const chunk = newChunk();

  // Build oval as a triangle fan from center.
  chunk.positions.push(0, 0, 0); // center
  chunk.normals.push(0, 1, 0);
  chunk.uvs.push(0.5, 0.5);

  for (let i = 0; i <= segs * 2; i++) {
    const t = i / (segs * 2);
    const angle = t * Math.PI * 2;
    // Oval: longer along X (length), narrower along Z (width)
    const x = Math.cos(angle) * halfLen;
    const z = Math.sin(angle) * halfWidth;

    chunk.positions.push(x, 0, z);
    chunk.normals.push(0, 1, 0);
    chunk.uvs.push(0.5 + Math.cos(angle) * 0.45, 0.5 + Math.sin(angle) * 0.45);
  }

  const edgeCount = segs * 2 + 1;
  for (let i = 1; i < edgeCount; i++) {
    chunk.indices.push(0, i, i + 1);
  }
  chunk.indices.push(0, edgeCount, 1);

  return chunk;
}
