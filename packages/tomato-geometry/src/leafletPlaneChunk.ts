// @farmsim/tomato-geometry/leafletPlaneChunk — Per-leaflet single plane chunk (Iter 39).
//
// 사용자 §5 + §6 botanical model 기반 _단일 leaflet plane_ geometry.
// Skeleton 노드별 plane mesh가 graph node.pos에 직접 부착되도록 설계.
//
// 좌표계 (mesh-local):
//   +X = rachis-outward (leaflet base = x=0, tip = x=lengthM)
//   +Y = blade up (normal direction at rest)
//   +Z = blade width (left-right)
//
// Width source: ShapeProfileSample[] — leaf-engine/shapeProfile.ts가 생성한
// 좌우 halfWidth 시계열. lobe/serration noise는 호출자가 profile 자체에 add.
//
// Iter 36 v5 createOvateLeaflet (leafChunk.ts line 473)의 vertex 산식 중
// _shape 산식 (sin^power / aspect / base / asymmetry)_은 profile로 이미 반영됨.
// 본 함수는 nonshape 부분만 유지: transverse cup + longitudinal droop + midrib +
// curl z-twist + waviness.
//
// `createOvateLeaflet`은 ShowcasePlant + buildLeafChunkLegacy byte-identical
// 보존을 위해 _변경 없음_. 본 generator는 Skin 경로 전용.

import { newChunk, type GeoChunk } from './types';

export interface ShapeProfileSampleLite {
  u: number;
  halfWidthLeft: number;
  halfWidthRight: number;
}

export interface LeafletPlaneOptions {
  /** Leaflet 길이 (m) — mesh-local +X 방향 extent. */
  lengthM: number;
  /** 가장자리 cup-up 강도 (0 = flat, ~1 = strong cup). */
  curl: number;
  /** Senescence/노화 fraction (0-1) — droop + cup attenuation. */
  ageFrac: number;
  /** Area-based gravity droop (deg) — sin(deg) × size × t² longitudinal sag. */
  gravityDroopDeg: number;
  /** 잎 표면 잔물결 진폭 (m). 0 = 비활성. */
  waviness: number;
  /** Terminal (true) — 끝 lobe 추가 가능. Phase A는 false 동일 처리. */
  isTerminal: boolean;
}

const WIDTH_SEGS = 4;
const COLS = WIDTH_SEGS * 2 + 1;  // 9 columns

/**
 * Build a single leaflet plane chunk (mesh-local).
 *
 * Vertex layout: `(lengthSegs+1) × COLS` grid. Triangulation: 2 tris per quad.
 *
 * Per-vertex (rowX, y, z):
 *   - rowX = u × lengthM
 *   - z = colNorm × halfWidth(left/right per side)  + curl-twist
 *   - y = transverseCup(curl × col² × size) − longitudinalDroop(t²·size)
 *         + midribBump + waviness
 */
export function buildLeafletPlaneChunk(
  profile: ReadonlyArray<ShapeProfileSampleLite>,
  opts: LeafletPlaneOptions,
): GeoChunk {
  const chunk = newChunk();
  const lengthSegs = profile.length - 1;
  if (lengthSegs < 1) return chunk;

  const size = opts.lengthM;
  const ageFrac = opts.ageFrac;
  const curl = opts.curl;
  const gravityRad = (opts.gravityDroopDeg * Math.PI) / 180;

  for (let row = 0; row <= lengthSegs; row++) {
    const t = row / lengthSegs;
    const sample = profile[row];
    const rowX = t * size;

    for (let col = 0; col < COLS; col++) {
      const colNorm = (col / (COLS - 1)) * 2 - 1;  // -1 to +1
      const absCol = Math.abs(colNorm);

      // Width from profile (halfWidth per side).
      const halfW = colNorm >= 0 ? sample.halfWidthRight : sample.halfWidthLeft;
      let z = colNorm * halfW;

      // Transverse cup — edges rise (turgor). Flattens with senescence.
      const transverseCup =
        curl * Math.pow(absCol, 2) * Math.max(0, 1 - ageFrac * 0.5) * size * 0.9;
      // Longitudinal droop — tip down via t² cantilever.
      const gravityComponent = Math.sin(gravityRad) * size * Math.pow(t, 2);
      const ageComponent = (0.10 + ageFrac * 0.30) * Math.pow(t, 2) * size;
      const longitudinalDroop = ageComponent + gravityComponent;

      let y = transverseCup - longitudinalDroop;

      if (opts.waviness > 0) {
        y += opts.waviness * Math.sin(rowX * 40) * Math.sin(z * 60) * (1 - absCol * 0.5);
      }

      const midribHeight = 0.002 * (1 - absCol * absCol) * size * 10;
      y += midribHeight;

      // Curl z-twist — tip edges turn laterally.
      z += curl * Math.pow(t, 2.0) * Math.sign(colNorm) * Math.abs(colNorm) * size * 0.4;

      chunk.positions.push(rowX, y, z);

      const u = t;
      const v = col / (COLS - 1);
      chunk.uvs.push(u, v);

      // Normal approximation (createOvateLeaflet 산식 동일).
      const cupSlope = curl * absCol;
      const droopSlope = (0.30 + ageFrac * 0.40) * t * 2;
      const ny = Math.max(0.3, 1 - cupSlope - droopSlope * 0.4);
      chunk.normals.push(0, ny, cupSlope * Math.sign(z || 0.01));
    }
  }

  // Quad-grid triangulation.
  for (let row = 0; row < lengthSegs; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      const a = row * COLS + col;
      const b = a + 1;
      const c = a + COLS;
      const d = c + 1;
      chunk.indices.push(a, c, b, b, c, d);
    }
  }

  // Terminal 끝 lobe — Phase A는 단순 plane만 (Phase B/C에서 추가 가능).
  void opts.isTerminal;

  return chunk;
}
