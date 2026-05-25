// Compound tomato leaf geometry generator — engine-agnostic.
//
// Builds petiole + rachis + paired leaflets + terminal lobes + petiolules
// as a single merged GeoChunk. The renderer wraps it (Babylon Mesh,
// Three BufferGeometry, etc.). All rotation math uses the Mat4 helper
// in ./types — no Babylon import.
//
// Stage-aware mode (preferred): pass `stageInfo` from
//   @farmsim/tomato-engine's `getLeafStage(node, plantAge)`. The renderer
//   then morphs leaflet count + serration smoothly. Legacy positional
//   args still work for any caller that doesn't have a NodeState.

import { SeededRandom } from '@farmsim/tomato-engine';
import type { LeafStageInfo } from '@farmsim/tomato-engine';
import {
  type GeoChunk,
  newChunk,
  mergeChunks,
  createCylinderChunk,
  rotateChunkX,
  rotateChunkY,
  rotateChunkZ,
  translateChunk,
} from './types';

export interface LeafShapeParams {
  serrationDepth: number;
  serrationFreq: number;
  lobeDepth: number;
  waviness: number;
  petioleLength: number;
}

export const DEFAULT_LEAF_PARAMS: LeafShapeParams = {
  serrationDepth: 0.18,
  serrationFreq: 10,
  lobeDepth: 0.08,
  waviness: 0.003,
  petioleLength: 0.08,
};

export interface LeafBuildParams {
  /** Smooth stage info from getLeafStage(node, plantAge). Required for stage-aware morphing. */
  stageInfo?: LeafStageInfo;
  /** Total leaflet count (integer count; fractional rounded but smoothed via outermost-pair scale). */
  leafletCount: number;
  /** Scale factor — leafSizeFactor × leafSizeMultiplier */
  sizeFactor: number;
  /** Leaf expansion 0–1 (typically leafMaturity) */
  maturity: number;
  /** Cup/curl amount */
  curl: number;
  /** Gravity ageing factor 0–1 (droopExtra/120 ⊕ age/80 ⊕ waterStress*0.3) */
  ageFrac: number;
  /** Per-plant shape (typically from genome.leaf* fields) */
  shape?: LeafShapeParams;
}

export function buildLeafChunk(paramsArg: LeafBuildParams, rng: SeededRandom): GeoChunk {
  const params = paramsArg.shape ?? DEFAULT_LEAF_PARAMS;
  const stageInfo = paramsArg.stageInfo;
  const af = paramsArg.ageFrac;
  const sizeFactor = paramsArg.sizeFactor;
  const maturity = paramsArg.maturity;
  const curl = paramsArg.curl;

  // Effective shape — if stage info present, scale serration/lobe by stage strength.
  // This is what gives the "early simple leaf → mature complex" morph.
  const effSerrationDepth = params.serrationDepth * (stageInfo?.serrationStrength ?? 1);
  const effLobeDepth = params.lobeDepth * (stageInfo?.lobeStrength ?? 1);
  const effShape: LeafShapeParams = {
    ...params,
    serrationDepth: effSerrationDepth,
    lobeDepth: effLobeDepth,
  };

  // leaflet count — fractional handling: integer leaflets, but the
  // outermost pair fades in/out by (fractional part) so the morph is
  // smooth, not snap.
  const rawCount = stageInfo?.leafletCount ?? paramsArg.leafletCount;
  const intCount = Math.max(1, Math.round(rawCount));
  const outerScale = stageInfo
    ? 1 - Math.abs(intCount - rawCount) * 2 // peaks at .5 fractional
    : 1;
  const pairs = Math.floor(intCount / 2);

  const chunks: GeoChunk[] = [];

  const petioleLen = params.petioleLength * sizeFactor * maturity;
  const rachisLen = 0.32 * sizeFactor * maturity;

  // Petiole — gravity arch (young) → sag (old)
  const petioleBaseRadius = 0.0018 * sizeFactor;
  const petioleTipRadius = 0.0012 * sizeFactor;
  // capped: end disks prevent the "empty pipe" look when camera sees the
  // open end at the stem junction. embedDepth shifts the base ~3mm into
  // the parent stem so the bottom cap is hidden inside the stem mesh
  // (avoids a visible disk floating on the stem surface).
  const petioleEmbedDepth = 0.003;
  const petiole = createCylinderChunk(petioleTipRadius, petioleBaseRadius, petioleLen, 5, 6, true);
  rotateChunkZ(petiole, -Math.PI / 2);
  translateChunk(petiole, petioleLen / 2 - petioleEmbedDepth, 0, 0);

  for (let v = 0; v < petiole.positions.length; v += 3) {
    const x = petiole.positions[v];
    const t = x / petioleLen;
    const archStrength = 0.03 * (1 - af * 4.0);
    const archY = Math.sin(t * Math.PI) * petioleLen * archStrength;
    // Per user reference: exponent 1.6 cantilever profile (smoother than t³)
    const gravityY = -Math.pow(t, 1.6) * petioleLen * (0.08 + af * 0.35);
    petiole.positions[v + 1] += archY + gravityY;
  }
  chunks.push(petiole);

  // Rachis — droop increases with age + leaflet weight
  const rachisBaseRadius = 0.0010 * sizeFactor;
  const rachisTipRadius = 0.0005 * sizeFactor;
  const rachis = createCylinderChunk(rachisTipRadius, rachisBaseRadius, rachisLen, 4, 8, true);
  rotateChunkZ(rachis, -Math.PI / 2);
  translateChunk(rachis, petioleLen + rachisLen / 2, 0, 0);
  const rachisDroopFactor = 0.12 + af * 0.45;
  for (let v = 0; v < rachis.positions.length; v += 3) {
    const x = rachis.positions[v];
    const t = (x - petioleLen) / rachisLen;
    if (t >= 0 && t <= 1) {
      rachis.positions[v + 1] -= t * t * rachisLen * rachisDroopFactor;
    }
  }
  chunks.push(rachis);

  // Leaflets along rachis
  for (let i = 0; i <= pairs; i++) {
    const t = pairs === 0 ? 0.7 : 0.15 + 0.75 * (i / pairs);
    const posAlongRachis = petioleLen + rachisLen * t;
    const yOff = -t * t * rachisLen * rachisDroopFactor;

    const isTerminal = i === pairs;
    const baseSizeMod = isTerminal ? 1.2 : 0.5 + 0.5 * Math.sin(t * Math.PI);
    const expansionScale = maturity * maturity;
    // Outermost pair smooth fade-in during stage transition
    const isOutermost = !isTerminal && i === pairs - 1;
    const stageScale = isOutermost ? outerScale : 1;
    // Phase A.3 — tighter asymmetry per guideline §7.2.
    // Original 0.85–1.15 size (±15%) + 0.35–0.65 rad (20–37°) angle was
    // too irregular. Guideline asks ±5–12% size + 3–8° angle; we use
    // midpoint values that still feel organic but no longer toy-like.
    const leafletSize = 0.12 * sizeFactor * expansionScale * baseSizeMod * stageScale * rng.range(0.92, 1.08);

    const leafletDroopRange = 0.14 + af * 0.48;
    const leafletTwistRange = 0.08 + af * 0.28;

    if (isTerminal) {
      const leaflet = createOvateLeaflet(leafletSize, curl * rng.range(0.7, 1.3), af, rng, effShape, true);
      rotateChunkZ(leaflet, rng.range(-leafletDroopRange * 0.5, leafletDroopRange * 0.3));
      rotateChunkX(leaflet, rng.range(-leafletTwistRange, leafletTwistRange));
      translateChunk(leaflet, posAlongRachis, yOff, 0);
      chunks.push(leaflet);
    } else {
      for (const side of [-1, 1]) {
        const leaflet = createOvateLeaflet(
          leafletSize * rng.range(0.92, 1.08), // size ±8%
          curl * rng.range(0.7, 1.3),
          af,
          rng,
          effShape,
          false
        );
        // ±0.25 rad (≈14°) — between guideline's 8° and our previous 37°
        rotateChunkY(leaflet, side * rng.range(0.20, 0.30));
        rotateChunkZ(leaflet, -Math.abs(rng.gaussian(0, leafletDroopRange)));
        rotateChunkX(leaflet, rng.gaussian(0, leafletTwistRange));
        translateChunk(leaflet, posAlongRachis, yOff, side * 0.025 * baseSizeMod);
        chunks.push(leaflet);

        const petioluleLen = 0.008 * baseSizeMod;
        const petiolule = createCylinderChunk(
          0.0004 * sizeFactor,
          0.0006 * sizeFactor,
          petioluleLen,
          3,
          1,
          true,
        );
        rotateChunkX(petiolule, Math.PI / 2);
        translateChunk(petiolule, posAlongRachis, yOff, side * petioluleLen * 0.5);
        chunks.push(petiolule);
      }

      // Intercalary leaflets (small between main pairs) — only for higher-stage leaves
      if (intCount >= 5 && i < pairs && rng.next() > 0.3) {
        const interT = t + 0.5 / (pairs + 1) * 0.75;
        const interPos = petioleLen + rachisLen * interT;
        const interYOff = -interT * interT * rachisLen * rachisDroopFactor;
        const interSize = leafletSize * 0.35 * rng.range(0.7, 1.3);
        for (const side of [-1, 1]) {
          if (rng.next() > 0.4) {
            const small = createOvateLeaflet(interSize, curl * rng.range(0.3, 1.0), af, rng, effShape, false);
            rotateChunkY(small, side * rng.range(0.4, 0.8));
            rotateChunkZ(small, -Math.abs(rng.gaussian(0, leafletDroopRange * 0.7)));
            translateChunk(small, interPos, interYOff, side * 0.015);
            chunks.push(small);
          }
        }
      }
    }
  }

  return mergeChunks(chunks);
}

/**
 * Build a leaf mesh WITHOUT the petiole cylinder. The rachis cylinder
 * and petiolule cylinders are KEPT so the blade remains visually
 * coherent (leaflets attached to a central midrib).
 *
 * Used by SkinMeshPlant (SSOT Phase 4) where the petiole proper is part
 * of the continuous PlantSkinMesh (SDF). Callers attach this mesh at
 * the leaf's stem-side attach point (LeafBase.attachPosition) and apply
 * azimuth+droop rotation, exactly as for buildLeafChunk — the rachis
 * then starts at (petioleLen, 0, 0) which lies along the same axis as
 * the SDF petiole tip, so the two surfaces meet naturally.
 *
 * Body of this function is intentionally a near-copy of `buildLeafChunk`
 * with only the `chunks.push(petiole)` line removed (rachis + petiolule
 * cylinders are still pushed). Per plan SSOT Phase 4 "완전한 분기" —
 * `buildLeafChunk` itself is untouched; SkinMeshPlant calls this
 * dedicated function.
 */
export function buildLeafBladeOnly(paramsArg: LeafBuildParams, rng: SeededRandom): GeoChunk {
  const params = paramsArg.shape ?? DEFAULT_LEAF_PARAMS;
  const stageInfo = paramsArg.stageInfo;
  const af = paramsArg.ageFrac;
  const sizeFactor = paramsArg.sizeFactor;
  const maturity = paramsArg.maturity;
  const curl = paramsArg.curl;

  const effSerrationDepth = params.serrationDepth * (stageInfo?.serrationStrength ?? 1);
  const effLobeDepth = params.lobeDepth * (stageInfo?.lobeStrength ?? 1);
  const effShape: LeafShapeParams = {
    ...params,
    serrationDepth: effSerrationDepth,
    lobeDepth: effLobeDepth,
  };

  const rawCount = stageInfo?.leafletCount ?? paramsArg.leafletCount;
  const intCount = Math.max(1, Math.round(rawCount));
  const outerScale = stageInfo
    ? 1 - Math.abs(intCount - rawCount) * 2
    : 1;
  const pairs = Math.floor(intCount / 2);

  const chunks: GeoChunk[] = [];

  const petioleLen = params.petioleLength * sizeFactor * maturity;
  const rachisLen = 0.32 * sizeFactor * maturity;

  // Petiole cylinder INTENTIONALLY OMITTED — the SDF skin mesh covers
  // the petiole region (its capsule centerline is PlantBase.petioleCurve).
  // The leaf mesh attach point is the stem surface (attachPosition), and
  // mesh-local (petioleLen, 0, 0) maps to the SDF petiole tip, so the
  // rachis cylinder below picks up exactly where the SDF surface ends.

  // Rachis — same as buildLeafChunk (kept so leaflets are visually
  // attached to a midrib, not floating).
  const rachisBaseRadius = 0.0010 * sizeFactor;
  const rachisTipRadius = 0.0005 * sizeFactor;
  const rachis = createCylinderChunk(rachisTipRadius, rachisBaseRadius, rachisLen, 4, 8, true);
  rotateChunkZ(rachis, -Math.PI / 2);
  translateChunk(rachis, petioleLen + rachisLen / 2, 0, 0);
  const rachisDroopFactor = 0.12 + af * 0.45;
  for (let v = 0; v < rachis.positions.length; v += 3) {
    const x = rachis.positions[v];
    const t = (x - petioleLen) / rachisLen;
    if (t >= 0 && t <= 1) {
      rachis.positions[v + 1] -= t * t * rachisLen * rachisDroopFactor;
    }
  }
  chunks.push(rachis);

  // Leaflets along rachis — same positions as buildLeafChunk.
  for (let i = 0; i <= pairs; i++) {
    const t = pairs === 0 ? 0.7 : 0.15 + 0.75 * (i / pairs);
    const posAlongRachis = petioleLen + rachisLen * t;
    const yOff = -t * t * rachisLen * rachisDroopFactor;

    const isTerminal = i === pairs;
    const baseSizeMod = isTerminal ? 1.2 : 0.5 + 0.5 * Math.sin(t * Math.PI);
    const expansionScale = maturity * maturity;
    const isOutermost = !isTerminal && i === pairs - 1;
    const stageScale = isOutermost ? outerScale : 1;
    const leafletSize = 0.12 * sizeFactor * expansionScale * baseSizeMod * stageScale * rng.range(0.92, 1.08);

    const leafletDroopRange = 0.14 + af * 0.48;
    const leafletTwistRange = 0.08 + af * 0.28;

    if (isTerminal) {
      const leaflet = createOvateLeaflet(leafletSize, curl * rng.range(0.7, 1.3), af, rng, effShape, true);
      rotateChunkZ(leaflet, rng.range(-leafletDroopRange * 0.5, leafletDroopRange * 0.3));
      rotateChunkX(leaflet, rng.range(-leafletTwistRange, leafletTwistRange));
      translateChunk(leaflet, posAlongRachis, yOff, 0);
      chunks.push(leaflet);
    } else {
      for (const side of [-1, 1]) {
        const leaflet = createOvateLeaflet(
          leafletSize * rng.range(0.92, 1.08),
          curl * rng.range(0.7, 1.3),
          af,
          rng,
          effShape,
          false
        );
        rotateChunkY(leaflet, side * rng.range(0.20, 0.30));
        rotateChunkZ(leaflet, -Math.abs(rng.gaussian(0, leafletDroopRange)));
        rotateChunkX(leaflet, rng.gaussian(0, leafletTwistRange));
        translateChunk(leaflet, posAlongRachis, yOff, side * 0.025 * baseSizeMod);
        chunks.push(leaflet);

        // Petiolule — same as buildLeafChunk (small cylinder between
        // rachis and each leaflet). Kept for visual completeness.
        const petioluleLen = 0.008 * baseSizeMod;
        const petiolule = createCylinderChunk(
          0.0004 * sizeFactor,
          0.0006 * sizeFactor,
          petioluleLen,
          3,
          1,
          true,
        );
        rotateChunkX(petiolule, Math.PI / 2);
        translateChunk(petiolule, posAlongRachis, yOff, side * petioluleLen * 0.5);
        chunks.push(petiolule);
      }

      if (intCount >= 5 && i < pairs && rng.next() > 0.3) {
        const interT = t + 0.5 / (pairs + 1) * 0.75;
        const interPos = petioleLen + rachisLen * interT;
        const interYOff = -interT * interT * rachisLen * rachisDroopFactor;
        const interSize = leafletSize * 0.35 * rng.range(0.7, 1.3);
        for (const side of [-1, 1]) {
          if (rng.next() > 0.4) {
            const small = createOvateLeaflet(interSize, curl * rng.range(0.3, 1.0), af, rng, effShape, false);
            rotateChunkY(small, side * rng.range(0.4, 0.8));
            rotateChunkZ(small, -Math.abs(rng.gaussian(0, leafletDroopRange * 0.7)));
            translateChunk(small, interPos, interYOff, side * 0.015);
            chunks.push(small);
          }
        }
      }
    }
  }

  return mergeChunks(chunks);
}

function createOvateLeaflet(
  size: number,
  curl: number,
  ageFrac: number,
  rng: SeededRandom,
  params: LeafShapeParams,
  isTerminal: boolean
): GeoChunk {
  const length = size;
  const maxWidth = size * 0.55;
  const lengthSegs = 12;
  const widthSegs = 4;
  const cols = widthSegs * 2 + 1;

  const chunk = newChunk();

  for (let row = 0; row <= lengthSegs; row++) {
    const t = row / lengthSegs;
    // Phase A.1 — leafletWidth single function per guideline §8.3.
    // Base ovate sin(πt)·(1−0.25t) × (1 + teeth + organic) replaces the
    // older two-branch sin/cos profile. Lobe modulation kept as a small
    // multiplicative term for the classic compound-leaf bumping.
    const widthBase = Math.sin(Math.PI * t) * (1 - 0.25 * t);
    const widthTeeth = Math.sin(t * Math.PI * 18) * params.serrationDepth * 0.08;
    const widthOrganic = (rng.next() - 0.5) * params.serrationDepth * 0.05;
    const widthFactor = Math.max(0, widthBase * (1 + widthTeeth + widthOrganic));
    const lobeModulation =
      1 - params.lobeDepth * Math.sin(t * Math.PI * 3) * Math.max(0, 1 - t * 1.5);
    const rowWidth = maxWidth * widthFactor * lobeModulation;
    const rowX = t * length;

    for (let col = 0; col < cols; col++) {
      const colNorm = (col / (cols - 1)) * 2 - 1;
      const absCol = Math.abs(colNorm);

      let z = colNorm * rowWidth;

      if (absCol > 0.6 && t > 0.05 && t < 0.95) {
        const serrationPhase = t * params.serrationFreq * Math.PI * 2 + rng.next() * 0.5;
        const toothShape = Math.max(0, Math.sin(serrationPhase));
        const serrationAmp = rowWidth * params.serrationDepth * absCol;
        z += Math.sign(colNorm) * toothShape * serrationAmp;
      }

      // Leaflet 3D geometry — separated transverse cup vs longitudinal droop.
      //
      // The earlier Euclidean-distance cup (y = curl · √(x²+z²)² · …) raised
      // BOTH the edges and the tip together, which made every leaflet point
      // skyward at maturity. Real tomato leaflets behave differently:
      //   • Transverse: edges rise slightly above the midrib (cup) while
      //     turgor is high; this flattens as turgor drops [Furutani et al,
      //     Sci. Rep. 13:2299 (2023) — turgor → geometric rigidity].
      //   • Longitudinal: the tip droops down under self-weight, modeled by
      //     a 2nd-degree polynomial in t (Buck-Sorlin & Schurr, Ann. Bot.
      //     126:661 (2020) — "tip pointed slightly towards the ground").
      // Both are present at all ages — even fresh leaflets have a small
      // tip droop — but droop scales with ageFrac (turgor decline + cell
      // wall softening + cumulative gravitational creep).
      //
      // Cantilever physics: tip deflection ∝ qL⁴/(EI). For a per-leaflet
      // shape we use the dimensionless cantilever profile w(t) ≈ t²(3−2t)/2
      // simplified to t² (close to t²(3−2t) within 15% over t∈[0,1] and
      // single-term keeps the maths terse).
      const transverseCup = curl
        * Math.pow(absCol, 2)
        * Math.max(0, 1 - ageFrac * 0.5)   // cup flattens with senescence
        * size * 0.9;
      const longitudinalDroop = (0.10 + ageFrac * 0.30)
        * Math.pow(t, 2) * size;            // tip down; 0.10 base droop matches "slight"
      let y = transverseCup - longitudinalDroop;

      if (params.waviness > 0) {
        y += params.waviness * Math.sin(rowX * 40) * Math.sin(z * 60) * (1 - absCol * 0.5);
      }

      const midribHeight = 0.002 * (1 - absCol * absCol) * size * 10;
      y += midribHeight;

      // Curl z-twist (kept) — tip edges turn laterally so mature leaflets
      // read as "catching wind" rather than just folding. v = t, u = colNorm.
      z += curl * Math.pow(t, 2.0) * Math.sign(colNorm) * Math.abs(colNorm) * size * 0.4;

      chunk.positions.push(rowX, y, z);

      const u = t;
      const v = col / (cols - 1);
      chunk.uvs.push(u, v);

      // Normal approximation — pre-curl/droop the local face was flat (0,1,0).
      // The cup tilts edges inward (toward +y), the droop tilts the surface
      // forward (toward +x at tip). Single shading-quality estimate, the
      // mesh's per-face normals would refine this if recomputed downstream.
      const cupSlope = curl * absCol;
      const droopSlope = (0.10 + ageFrac * 0.30) * t * 2;
      const ny = Math.max(0.3, 1 - cupSlope - droopSlope * 0.4);
      chunk.normals.push(0, ny, cupSlope * Math.sign(z || 0.01));
    }
  }

  for (let row = 0; row < lengthSegs; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      chunk.indices.push(a, c, b, b, c, d);
    }
  }

  if (isTerminal && size > 0.03) {
    for (const side of [-1, 1]) {
      const lobe = createSmallLobe(size * 0.3, curl, rng, params);
      rotateChunkY(lobe, side * 0.6);
      translateChunk(lobe, size * 0.35, 0, side * maxWidth * 0.6);
      const baseVertex = chunk.positions.length / 3;
      chunk.positions.push(...lobe.positions);
      chunk.normals.push(...lobe.normals);
      chunk.uvs.push(...lobe.uvs);
      for (const idx of lobe.indices) chunk.indices.push(idx + baseVertex);
    }
  }

  return chunk;
}

function createSmallLobe(
  size: number,
  curl: number,
  rng: SeededRandom,
  params: LeafShapeParams
): GeoChunk {
  const segs = 6;
  const w = size;
  const h = size * 0.5;
  const chunk = newChunk();

  chunk.positions.push(0, 0, 0);
  chunk.normals.push(0, 1, 0);
  chunk.uvs.push(0.5, 0.5);

  for (let i = 0; i <= segs * 2; i++) {
    const t = i / (segs * 2);
    const angle = t * Math.PI * 2;
    let x = Math.cos(angle) * w;
    let z = Math.sin(angle) * h;

    const serration = 1 + params.serrationDepth * 0.5 * Math.sin(i * 4.5 + rng.next() * 2);
    x *= serration;
    z *= serration;

    const dist = Math.sqrt(x * x + z * z);
    const y = curl * dist * dist * w * 2;

    chunk.positions.push(x, y, z);
    const ce = curl * w * dist;
    chunk.normals.push(0, Math.max(0.3, 1 - ce * 2), ce);
    chunk.uvs.push(0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.4);
  }

  const edgeCount = segs * 2 + 1;
  for (let i = 1; i < edgeCount; i++) {
    chunk.indices.push(0, i, i + 1);
  }
  chunk.indices.push(0, edgeCount, 1);
  return chunk;
}
