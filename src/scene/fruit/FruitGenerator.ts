// FruitGenerator — scientific, per-fruit-individualized tomato body.
//
// Reads from FruitState.cultivarGenome (the per-fruit sample drawn at
// fruit set from the cultivar distribution). Each fruit gets:
//
//   - Oblate sphere (Y-scale = genome.heightWidthRatio) — cherry near-
//     spherical, beefsteak strongly flattened.
//   - Locule-driven bottom ribbing (cos(loculeCount·θ) displacement at
//     the bottom hemisphere) — beefsteak shows 6-8 lobes, cherry smooth.
//   - Per-vertex asymmetry from `asymmetrySeed` — every individual is a
//     different shape, even within the same cultivar.
//   - Crown recession (a small Y dip where the calyx attaches), so the
//     calyx sits in a natural well, not glued onto a sphere top.
//   - Per-vertex color: blossom-end (Y < 0) advances toward red faster
//     than stem-end (Y > 0) during ripening stages 2-4 — the
//     marbled pattern PMC11204166 describes.
//   - Per-vertex mottling via `mottleSeed` — chromaticity scatter.
//   - 5-sepal calyx with reflexed (upward-flaring) tips (Cole 1969).
//   - Short green stem stub on top of calyx — the harvest robot's grasp
//     target. Length per cultivar.

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Meshes/instancedMesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SeededRandom } from '@farmsim/tomato-engine';
import type { FruitState, CultivarSample } from '@farmsim/tomato-engine';
import type { FruitSpec } from './FruitSpec';
import { loadOptionalTextureSlot } from '../TextureSlotLoader';

// ★ L7-A-3a/b (S63/S64) — SEGMENTS/RINGS/CROWN/SHOULDER 모두 spec 주입.
//   FruitGenerator.ts 안 botanical/rendering magic 0 의무 (FRUIT-SPEC-BOTANICAL-PARAMETERS-01).

// ---------------------------------------------------------------------------
// Body mesh — oblate, ribbed, asymmetric, per-vertex colored
// ---------------------------------------------------------------------------

type FruitLod = 'high' | 'low' | 'ultraLow';
type RoughnessBand = 'matte' | 'normal' | 'sheen';
type SkinVariant = 'A' | 'B' | 'C';
type FruitDebugTextureMode = 'off' | 'normal' | 'roughness' | 'roughnessLighting';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hexToRgb01(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function stableUnit(seed: number, salt: number): number {
  const x = Math.sin((seed + 1) * (salt * 12.9898 + 78.233)) * 43758.5453;
  return x - Math.floor(x);
}

function stableSigned(seed: number, salt: number): number {
  return stableUnit(seed, salt) * 2 - 1;
}

function roughnessBandFor(fruit: FruitState, genome: CultivarSample): RoughnessBand {
  const h = stableUnit((genome.mottleSeed ?? fruit.index * 131) + fruit.index * 17, 5);
  if (h < 0.28) return 'matte';
  if (h > 0.76) return 'sheen';
  return 'normal';
}

function skinVariantFor(fruit: FruitState, genome: CultivarSample, count: number): SkinVariant {
  const n = Math.max(1, Math.min(3, Math.floor(count)));
  const h = stableUnit((genome.mottleSeed ?? fruit.index * 131) + fruit.index * 31, 19);
  const idx = Math.min(n - 1, Math.floor(h * n));
  return idx === 0 ? 'A' : idx === 1 ? 'B' : 'C';
}

function skinVariantTextureTransform(variant: SkinVariant): {
  uOffset: number;
  vOffset: number;
  uScale: number;
  vScale: number;
} {
  switch (variant) {
    case 'B': return { uOffset: 0.37, vOffset: 0.19, uScale: 1.13, vScale: 1.13 };
    case 'C': return { uOffset: 0.71, vOffset: 0.43, uScale: 0.91, vScale: 0.91 };
    default: return { uOffset: 0, vOffset: 0, uScale: 1, vScale: 1 };
  }
}

function getFruitDebugTextureMode(): FruitDebugTextureMode {
  if (typeof location === 'undefined') return 'off';
  const raw = new URLSearchParams(location.search).get('fruitDebugTexture');
  if (raw === 'normal' || raw === 'roughness' || raw === 'roughnessLighting') return raw;
  return 'off';
}

function roughnessOffsetFor(band: RoughnessBand): number {
  switch (band) {
    case 'matte': return 0.045;
    case 'sheen': return -0.035;
    default: return 0;
  }
}

function clearcoatOffsetFor(band: RoughnessBand): number {
  switch (band) {
    case 'matte': return -0.015;
    case 'sheen': return 0.018;
    default: return 0;
  }
}

function buildFruitBodyVertexData(
  fruit: FruitState,
  genome: CultivarSample,
  spec: FruitSpec,
  lod: FruitLod = 'high',
): VertexData {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // ★ L7-A-3b (S64) — resolution from spec.meshResolution.
  const resolution = spec.meshResolution[lod];
  const RINGS = resolution.rings;
  const SEGMENTS = resolution.segments;
  // ★ L7-A-3a (S63) — morphology from spec.morphologyRules.
  const CROWN_RECESSION = spec.morphologyRules.crownRecession;
  const SHOULDER_BULGE = spec.morphologyRules.shoulderBulge;

  // Vertex grid (RINGS+1 rings × SEGMENTS+1 columns)
  // The pole rings collapse to a single point; the top pole has the
  // crown recession applied. φ = polar angle (0 = +Y top, π = -Y bottom)
  const visualClamp = spec.morphologyRules.visualHeightWidthClamp ?? [0.72, 1.6];
  const h = clamp(genome.heightWidthRatio, visualClamp[0], visualClamp[1]);
  const rib = genome.ribbingStrength;
  const lc = genome.loculeCount;

  // Mottle RNG used for per-vertex color noise
  const mottleRng = new SeededRandom(genome.mottleSeed);
  mottleRng.next(); mottleRng.next();

  const lodShapeScale = lod === 'high' ? 1 : lod === 'low' ? 0.45 : 0;
  const seed = genome.asymmetrySeed ?? fruit.index * 7919 + 1234;
  const coherentAmp = (spec.morphologyRules.coherentAsymmetryAmp ?? 0.035) * lodShapeScale;
  const scaleX = 1 + stableSigned(seed, 2) * 0.055 * lodShapeScale;
  const scaleZ = 1 + stableSigned(seed, 3) * 0.065 * lodShapeScale;
  const shoulderRange = spec.morphologyRules.shoulderFullnessRange ?? [0.96, 1.08];
  const shoulderFullness = mix(shoulderRange[0], shoulderRange[1], stableUnit(seed, 4));
  const topDepressionRange = spec.morphologyRules.topDepressionRange ?? [0, 0.025];
  const stemEndAnchorCos = spec.morphologyRules.stemEndAnchorCos ?? 0.94;
  const depressionBand = spec.morphologyRules.depressionBand ?? [0.86, 0.98];
  const socketTintBand = spec.morphologyRules.socketTintBand ?? [0.88, 0.985];
  const socketDarkeningStrength = spec.morphologyRules.socketDarkeningStrength ?? 0.22;
  const socketTintStrength = spec.morphologyRules.socketTintStrength ?? 0.12;
  const topDepressionExtra = mix(topDepressionRange[0], topDepressionRange[1], stableUnit(seed, 6)) * lodShapeScale;
  const bottomRoundness = (spec.morphologyRules.bottomRoundness ?? 0.25) * lodShapeScale;
  const asymPhase1 = stableUnit(seed, 7) * Math.PI * 2;
  const asymPhase2 = stableUnit(seed, 8) * Math.PI * 2;
  const crownAnchorY = h * stemEndAnchorCos;
  const ripeColor = hexToRgb01(spec.ripeningRules.ripeColor, [185 / 255, 45 / 255, 34 / 255]);
  const turningColor = hexToRgb01(spec.ripeningRules.turningColor, [215 / 255, 122 / 255, 56 / 255]);
  const pinkColor = hexToRgb01(spec.ripeningRules.pinkColor, [216 / 255, 121 / 255, 112 / 255]);
  const shoulderRetentionFrac = spec.ripeningRules.shoulderRetentionFrac ?? 0.4;
  const blushStrength = spec.ripeningRules.blushStrength ?? 0.25;
  const mottleSigma = spec.ripeningRules.mottleSigma ?? 0.015;
  const visualPatchStrength = spec.ripeningRules.visualPatchStrength ?? 0.0;
  const visualPatchScale = spec.ripeningRules.visualPatchScale ?? 2.4;
  const visualBlushStrength = spec.ripeningRules.visualBlushStrength ?? blushStrength;
  const visualShoulderRetention = spec.ripeningRules.visualShoulderRetention ?? shoulderRetentionFrac;
  const patchPhase1 = stableUnit(seed, 21) * Math.PI * 2;
  const patchPhase2 = stableUnit(seed, 22) * Math.PI * 2;

  // Per-vertex grid
  for (let r = 0; r <= RINGS; r++) {
    const phi = (r / RINGS) * Math.PI;
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);

    for (let s = 0; s <= SEGMENTS; s++) {
      const theta = (s / SEGMENTS) * Math.PI * 2;
      let x = sinP * Math.cos(theta);
      let y = cosP * h;
      let z = sinP * Math.sin(theta);
      const topAnchorMask = smoothstep(stemEndAnchorCos, 1.0, cosP);

      // Locule ribbing: cos(lc·θ) bumps that follow the locule walls
      // from the bottom (blossom-end) up past the equator. Beefsteak's
      // characteristic 6-8 deep lobes (PMC10482247) are visible from
      // most viewing angles; cherry's lc=2 stays smooth because its
      // ribbingStrength is near zero in the cultivar registry.
      if (rib > 0) {
        // Sweep weight: peaks just below the shoulder (cosP ≈ +0.3),
        // fades to near-zero at mid-body / bottom pole. Real-world tomato
        // shoulder ribbing is localized to the top — bottom half is
        // smooth. Previous distribution (peak at mid-body) read as
        // generic "rumpled balloon" rather than tomato shoulder.
        let sweep: number;
        if (cosP > 0.0) {
          // Upper hemisphere — peak around cosP=0.3 (shoulder), fade
          // toward stem-end (cosP=1.0) and equator (cosP=0).
          // Sweep value: 0 at cosP=0, ~0.55 at cosP=0.3, ~0 at cosP=1.
          sweep = 0.55 * Math.max(0, 1 - Math.abs(cosP - 0.3) * 2.5);
        } else if (cosP > -0.3) {
          // Mid-body upper — very subtle residual
          sweep = 0.18 * Math.max(0, 1 + cosP / 0.3);
        } else {
          // Mid-body lower + bottom pole — essentially smooth
          sweep = 0.05;
        }
        const ribAmp = rib * 0.28 * sweep;
        const ribFactor = 1 - ribAmp * (0.5 + 0.5 * Math.cos(lc * theta));
        x *= ribFactor;
        z *= ribFactor;
      }

      // Stem-end socket: keep the attachment pole stable and depress only
      // the surrounding ring. A wide depression makes close-up fruits read
      // like flattened disks, so the geometry band stays narrow.
      const socketDepressionMask =
        smoothstep(depressionBand[0], (depressionBand[0] + depressionBand[1]) * 0.5, cosP) *
        (1 - smoothstep(depressionBand[1], 1.0, cosP));
      if (socketDepressionMask > 0) {
        y -= (CROWN_RECESSION + topDepressionExtra) * socketDepressionMask;
      }
      if (cosP > 0.70 && cosP <= depressionBand[0]) {
        // Shoulder bulge: slight outward swell on the ring just below
        // the socket — gives the stem-end → shoulder → body transition
        // its rounded "tomato shoulders" silhouette instead of a flat
        // dome rising directly to the dent.
        const bulgeSweep = 1 - (cosP - 0.70) / 0.15;  // 1..0
        const bulge = SHOULDER_BULGE * bulgeSweep * shoulderFullness;
        x *= 1 + bulge;
        z *= 1 + bulge;
      }

      // Coherent fruit-level asymmetry. Keep the crown pole anchored so
      // the pedicel/calyx attachment remains stable after deformation.
      if (lodShapeScale > 0) {
        const anchorPreserve = 1 - topAnchorMask;
        const angularAsym =
          Math.sin(theta + asymPhase1) * 0.65 +
          Math.sin(theta * 2 + asymPhase2) * 0.35;
        const verticalWeight = Math.pow(Math.max(0, sinP), 0.75);
        const radialScale = 1 + angularAsym * coherentAmp * verticalWeight * anchorPreserve;
        x *= mix(1, scaleX, anchorPreserve) * radialScale;
        z *= mix(1, scaleZ, anchorPreserve) * radialScale;

        if (cosP < -0.25) {
          const bottomT = clamp01((-0.25 - cosP) / 0.70);
          const bottomMask = bottomT * bottomT * (3 - 2 * bottomT);
          x *= 1 + bottomRoundness * 0.025 * bottomMask;
          z *= 1 + bottomRoundness * 0.025 * bottomMask;
          y += bottomRoundness * 0.065 * bottomMask;
        }
      }

      if (topAnchorMask > 0.98) {
        x = 0;
        z = 0;
        y = crownAnchorY;
      }

      positions.push(x, y, z);
      uvs.push(s / SEGMENTS, r / RINGS);

      // Per-vertex color — blossom-end first ripening.
      // Y > 0 = stem-end (top), Y < 0 = blossom-end (bottom).
      // Stages 2-4 show the gradient most. Outside that range the fruit
      // is uniformly green (stage 0-1) or uniformly red (stage 5).
      const baseRGB: [number, number, number] = [
        fruit.color[0] / 255,
        fruit.color[1] / 255,
        fruit.color[2] / 255,
      ];

      // Spatial ripening — turning 단계 (2-4) 에서 한 fruit 내에 색 혼합:
      //   blossom-end (y<0) advance — 먼저 red
      //   stem-end (y>0) retention  — 더 오래 green
      // 두 영역 모두 stage-strength 가 stage 2.5 에서 peak, stage 1/5
      // 에서 0 으로 falls. (uniform green stage<2, uniform red stage>4)
      let stageStrength = 0;
      if (fruit.ripenStage >= 2 && fruit.ripenStage <= 4) {
        const fromStage2 = (fruit.ripenStage - 2) + fruit.ripenFraction;
        stageStrength = Math.max(0, 1 - Math.abs(fromStage2 - 1) * 0.7);
      }
      // ★ L7-A-3c (S64) — blossomEndAdvanceFrac fallback from spec.ripeningRules.
      const advanceFrac = genome.blossomEndAdvanceFrac ?? spec.ripeningRules.blossomEndAdvanceFrac;
      // stem-end green retention frac — body 상단 (cosP > 0) 영역에 적용.
      // 실제 토마토의 shoulder 가 가장 오래 green 유지하는 관찰 일치.
      // 미래 task: cultivar genome 별 분배 (beefsteak 더 강하게 등).
      const STEM_END_GREEN_RETENTION_FRAC = shoulderRetentionFrac;

      // shiftFrac > 0 → push toward riper (more red); < 0 → toward green.
      // y is in cultivar-relative units (-h..+h). Negative y = blossom-end.
      const yNorm = y / Math.max(0.1, h);  // -1..+1
      let shiftFrac: number;
      if (yNorm < 0) {
        // Blossom-end (bottom) — advance ripening: positive shift.
        shiftFrac = (-yNorm) * advanceFrac * stageStrength;
      } else {
        // Stem-end (top) — retain green: negative shift.
        shiftFrac = (-yNorm) * STEM_END_GREEN_RETENTION_FRAC * stageStrength;
      }

      const greenMute = fruit.ripenStage <= 1 ? 0.18 : 0.08;
      const mutedBase: [number, number, number] = [
        mix(baseRGB[0], 0.33, greenMute),
        mix(baseRGB[1], 0.42, greenMute),
        mix(baseRGB[2], 0.24, greenMute),
      ];

      const blush = clamp01(Math.max(0, -yNorm) * blushStrength * stageStrength);
      const redBlend = clamp01(Math.max(0, shiftFrac) + blush);
      const greenRetain = clamp01(Math.max(0, -shiftFrac));
      let ripeR = mix(mutedBase[0], ripeColor[0], redBlend);
      let ripeG = mix(mutedBase[1], ripeColor[1], redBlend) + greenRetain * 0.08;
      let ripeB = mix(mutedBase[2], ripeColor[2], redBlend);

      // Visual-only mixed ripening. Middle stages are deliberately
      // ambiguous: green shoulder, orange turning zones, pink blush, and
      // red blossom-end advance can coexist on one fruit. Masks stay in
      // fruit-local polar coordinates so they rotate with the body.
      if (fruit.ripenStage >= 2 && fruit.ripenStage <= 4 && visualPatchStrength > 0) {
        const fromStage2 = (fruit.ripenStage - 2) + fruit.ripenFraction;
        const shoulderMask = smoothstep(0.58, 0.94, cosP);
        const blossomMask = smoothstep(0.12, 0.72, -yNorm);
        const sideMask = Math.pow(Math.max(0, sinP), 0.65) * (1 - topAnchorMask);
        const angularPatch = clamp01(
          0.5 +
          0.18 * Math.sin(theta * visualPatchScale + patchPhase1 + cosP * 1.4) +
          0.12 * Math.sin(theta * (visualPatchScale * 1.73 + 0.35) + patchPhase2 - cosP * 2.1) +
          0.06 * Math.sin(theta * (visualPatchScale * 0.47 + 4.1) + patchPhase1 * 0.3),
        );
        const shoulderHold = clamp01(shoulderMask * visualShoulderRetention * stageStrength);
        const turningMask = clamp01(
          visualPatchStrength *
          stageStrength *
          sideMask *
          (0.18 + angularPatch * 0.34) *
          (1 - shoulderHold * 0.72),
        );
        const pinkMask = clamp01(
          visualBlushStrength *
          stageStrength *
          sideMask *
          blossomMask *
          smoothstep(0.85, 2.45, fromStage2) *
          (0.16 + angularPatch * 0.30),
        );

        ripeR = mix(ripeR, turningColor[0], turningMask * (1 - pinkMask * 0.25));
        ripeG = mix(ripeG, turningColor[1], turningMask * (1 - pinkMask * 0.25));
        ripeB = mix(ripeB, turningColor[2], turningMask * (1 - pinkMask * 0.25));
        ripeR = mix(ripeR, pinkColor[0], pinkMask);
        ripeG = mix(ripeG, pinkColor[1], pinkMask);
        ripeB = mix(ripeB, pinkColor[2], pinkMask);

        const retainedGreen: [number, number, number] = [0.30, 0.42, 0.22];
        ripeR = mix(ripeR, retainedGreen[0], shoulderHold * 0.16);
        ripeG = mix(ripeG, retainedGreen[1], shoulderHold * 0.16);
        ripeB = mix(ripeB, retainedGreen[2], shoulderHold * 0.16);
      } else if (fruit.ripenStage >= 5) {
        const maturePatch =
          0.5 +
          0.3 * Math.sin(theta * visualPatchScale + patchPhase1) +
          0.2 * Math.sin(theta * (visualPatchScale * 0.47 + 0.4) + patchPhase2);
        const redVariation = clamp01((0.5 + maturePatch * 0.5) * Math.pow(Math.max(0, sinP), 0.8));
        const shoulderMute = smoothstep(0.52, 0.96, cosP) * 0.08;
        ripeR = clamp01(ripeR * (0.96 + redVariation * 0.06 - shoulderMute));
        ripeG = clamp01(ripeG * (0.94 + redVariation * 0.04 + shoulderMute * 0.6));
        ripeB = clamp01(ripeB * (0.94 + redVariation * 0.03));
      }

      // Marbled mottling — per-vertex Gaussian color jitter. σ 0.035 → 0.015
      // 으로 축소: 이전엔 high-frequency speckle 이 표면 전체에 흩뿌려져
      // "쭈글쭈글" 인상에 기여. 더 부드러운 변동만 유지.
      const mott = mottleRng.gaussian(0, mottleSigma);
      const crownDark = cosP > 0.76
        ? 1 - smoothstep(0.76, 0.98, cosP) * socketDarkeningStrength
        : 1;
      const socketGreenBrown =
        smoothstep(socketTintBand[0], (socketTintBand[0] + socketTintBand[1]) * 0.5, cosP) *
        (1 - smoothstep(socketTintBand[1], 1.0, cosP)) *
        socketTintStrength;
      const r2 = clamp01((ripeR * (1 + mott) - socketGreenBrown * 0.12) * crownDark);
      const g2 = clamp01((ripeG * (1 + mott * 0.7) + socketGreenBrown * 0.04) * crownDark);
      const b2 = clamp01((ripeB * (1 + mott * 0.5) - socketGreenBrown * 0.08) * crownDark);

      colors.push(r2, g2, b2, 1.0);
    }
  }

  // Indices — standard sphere triangulation
  const colsPerRow = SEGMENTS + 1;
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SEGMENTS; s++) {
      const a = r * colsPerRow + s;
      const b = a + colsPerRow;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  for (let r = 0; r <= RINGS; r++) {
    const first = r * colsPerRow;
    const last = first + SEGMENTS;
    const nx = normals[first * 3] + normals[last * 3];
    const ny = normals[first * 3 + 1] + normals[last * 3 + 1];
    const nz = normals[first * 3 + 2] + normals[last * 3 + 2];
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[first * 3] = normals[last * 3] = nx / len;
    normals[first * 3 + 1] = normals[last * 3 + 1] = ny / len;
    normals[first * 3 + 2] = normals[last * 3 + 2] = nz / len;
  }

  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.colors = colors;
  vd.uvs = uvs;
  return vd;
}

// ---------------------------------------------------------------------------
// Calyx — 5 reflexed sepals (Cole 1969) + stem stub
// ---------------------------------------------------------------------------

function buildCalyxVertexData(): VertexData {
  // Each sepal = a thin curved triangle: base at fruit's stem-end well,
  // tip flared outward and upward (reflexed).
  // Geometry: 5 sepals × 3 vertices each + center vertex.
  const positions: number[] = [];
  const indices: number[] = [];

  const SEPALS = 5;
  // CROWN_RECESSION 0.18 로 깊어진 well 안에 기존 baseY 0.78 + length 0.45
  // 이면 sepal 이 well 안에 잠겨 안 보임. base 를 0.85 로 끌어올리고
  // length 도 0.55 로 늘려 fruit top 위로 5각 star 가 보이게.
  const sepalLengthFrac = 0.55;       // along Y (× radius)
  const sepalSpreadFrac = 0.85;       // outward (× radius)
  const sepalTipReflex = 0.20;        // tip flares this much above sepal mid
  const baseY = 0.85;                 // well 위쪽 ring 에 attach

  // Center vertex
  positions.push(0, baseY + 0.05, 0);
  const centerIdx = 0;

  // Per-sepal: base-left, base-right, tip
  for (let i = 0; i < SEPALS; i++) {
    const aMid = (i / SEPALS) * Math.PI * 2;
    const aL = aMid - Math.PI / SEPALS * 0.35;
    const aR = aMid + Math.PI / SEPALS * 0.35;
    // base vertices: slight outward from center, low Y
    const baseR_outward = 0.12;
    const bxL = Math.cos(aL) * baseR_outward;
    const bzL = Math.sin(aL) * baseR_outward;
    const bxR = Math.cos(aR) * baseR_outward;
    const bzR = Math.sin(aR) * baseR_outward;
    // tip vertex: flared outward and reflexed upward
    const tx = Math.cos(aMid) * sepalSpreadFrac;
    const ty = baseY + sepalLengthFrac + sepalTipReflex;
    const tz = Math.sin(aMid) * sepalSpreadFrac;

    const idxBL = positions.length / 3; positions.push(bxL, baseY, bzL);
    const idxBR = positions.length / 3; positions.push(bxR, baseY, bzR);
    const idxTip = positions.length / 3; positions.push(tx, ty, tz);

    // Sepal face triangle (both sides — calyx mat uses backFaceCulling=false)
    indices.push(idxBL, idxBR, idxTip);
    // small wing back to center to close the seam
    indices.push(centerIdx, idxBR, idxBL);
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  return vd;
}

/** Per-scene cache of fruit body materials, keyed by spec/stage/band/LOD/texture mask. */
const cachedBodyMaterials: WeakMap<Scene, Map<string, PBRMaterial>> = new WeakMap();
/** ★ L7-B-2 (S67) — Per-scene cache of _simple_ fruit body materials (no clearcoat/subsurface). */
const cachedSimpleBodyMaterials: WeakMap<Scene, Map<string, PBRMaterial>> = new WeakMap();

function fruitSpecId(spec: FruitSpec): string {
  return `${spec.taxonomy.family}:${spec.taxonomy.genus}:${spec.taxonomy.species}:${spec.taxonomy.commonName}`;
}

function fruitMaterialKey(
  spec: FruitSpec,
  stage: number,
  band: RoughnessBand,
  lod: FruitLod,
  skinVariant: SkinVariant,
  microNormalEnabled: boolean,
  roughnessTextureEnabled: boolean,
  microNormalStrengthBucket: string,
  debugMode: FruitDebugTextureMode = 'off',
): string {
  return [
    fruitSpecId(spec),
    stage,
    band,
    lod,
    skinVariant,
    microNormalEnabled ? 'N1' : 'N0',
    roughnessTextureEnabled ? 'R1' : 'R0',
    microNormalStrengthBucket,
    debugMode,
  ].join(':');
}

/**
 * Stage-based simple body material (★ L7-B-2 S67, 보완 #5).
 *
 * vs full `getBodyMaterial`:
 *   - stage color (vertex color baked, albedo white passthrough) _유지_
 *   - clearcoat: _off_
 *   - subsurface translucency: _off_
 *   - shader wind: 산식 변화 0 (fruit는 wind 미적용)
 *
 * Use case: far LOD (ultraLow). fragment 비용 감소 (~25%).
 */
function getSimpleBodyMaterial(scene: Scene, stage: number, spec: FruitSpec): PBRMaterial {
  let bucket = cachedSimpleBodyMaterials.get(scene);
  if (!bucket) {
    bucket = new Map();
    cachedSimpleBodyMaterials.set(scene, bucket);
  }
  const key = fruitMaterialKey(spec, stage, 'normal', 'ultraLow', 'A', false, false, 'B0');
  const cached = bucket.get(key);
  if (cached) return cached;
  const mat = new PBRMaterial(`fruitBodyMatSimple_${key}`, scene);
  // White albedo → vertex color fully drives surface color (stage color 유지).
  mat.albedoColor = new Color3(1, 1, 1);
  mat.metallic = 0;
  // Roughness만 spec (clearcoat/subsurface 모두 off).
  mat.roughness = spec.materialRules.stageRoughness[stage];
  bucket.set(key, mat);
  return mat;
}

function getBodyMaterial(
  scene: Scene,
  stage: number,
  spec: FruitSpec,
  lod: FruitLod,
  band: RoughnessBand,
  skinVariant: SkinVariant,
  debugMode: FruitDebugTextureMode,
): PBRMaterial {
  let bucket = cachedBodyMaterials.get(scene);
  if (!bucket) {
    bucket = new Map();
    cachedBodyMaterials.set(scene, bucket);
  }
  const matRules = spec.materialRules;
  const highDetail = lod === 'high';
  const debugUsesRoughness = debugMode === 'roughness' || debugMode === 'roughnessLighting';
  const microNormalEnabled = highDetail && !!matRules.microNormalTexture;
  const roughnessTextureEnabled = highDetail && !!matRules.roughnessTexture && (
    debugUsesRoughness || (matRules.roughnessTextureChannel ?? 'green') === 'green'
  );
  const microNormalStrength = clamp(matRules.microNormalStrength ?? 0.045, 0.0, 0.12);
  const microNormalStrengthBucket = microNormalEnabled
    ? `B${Math.round((debugMode === 'normal' ? 0.2 : microNormalStrength) * 1000)}`
    : 'B0';
  const key = fruitMaterialKey(
    spec,
    stage,
    band,
    lod,
    skinVariant,
    microNormalEnabled,
    roughnessTextureEnabled,
    microNormalStrengthBucket,
    debugMode,
  );
  const cached = bucket.get(key);
  if (cached) return cached;
  const mat = new PBRMaterial(`fruitBodyMat_${key}`, scene);
  // White albedo → vertex color fully drives surface color.
  mat.albedoColor = new Color3(1, 1, 1);
  mat.metallic = 0;
  // ★ L7-A-3c (S64) — PBR coefficients from spec.materialRules (산식 → 배열).
  mat.roughness = clamp(matRules.stageRoughness[stage] + roughnessOffsetFor(band), 0.50, 0.76);
  if (microNormalEnabled) {
    loadOptionalTextureSlot(scene, matRules.microNormalTexture, {
      gammaSpace: false,
    }).then((tex) => {
      if (tex) {
        tex.level = debugMode === 'normal' ? 0.2 : microNormalStrength;
        mat.bumpTexture = tex;
        mat.invertNormalMapY = false;
        mat.invertNormalMapX = false;
      }
    });
  }
  if (roughnessTextureEnabled) {
    const t = skinVariantTextureTransform(skinVariant);
    const roughnessUrl = debugMode === 'roughnessLighting'
      ? matRules.roughnessTexture?.replace('_512.png', '_debug_checker.png')
      : matRules.roughnessTexture;
    loadOptionalTextureSlot(scene, roughnessUrl, {
      gammaSpace: false,
      ...t,
    }).then((tex) => {
      if (tex) {
        if (debugMode === 'roughness') {
          mat.albedoTexture = tex;
          mat.albedoColor = new Color3(1, 1, 1);
          mat.roughness = 1;
          mat.clearCoat.isEnabled = false;
          mat.subSurface.isTranslucencyEnabled = false;
        } else {
          mat.metallicTexture = tex;
          mat.useRoughnessFromMetallicTextureAlpha = false;
          mat.useRoughnessFromMetallicTextureGreen = true;
          mat.useMetallnessFromMetallicTextureBlue = false;
          mat.metallic = 0;
        }
      }
    });
  }
  const cc = clamp(matRules.stageClearcoatIntensity[stage] + clearcoatOffsetFor(band), 0.03, 0.22);
  mat.clearCoat.isEnabled = cc > 0;
  mat.clearCoat.intensity = cc;
  mat.clearCoat.roughness = matRules.stageClearcoatRoughness[stage];
  const ss = matRules.subsurfaceTranslucency;
  if (stage >= ss.fromStage) {
    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = ss.intensity;
    mat.subSurface.tintColor = Color3.FromHexString(ss.tintColor);
    mat.subSurface.minimumThickness = 0.5;
    mat.subSurface.maximumThickness = 1.5;
  }
  bucket.set(key, mat);
  return mat;
}

const cachedCalyxMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getCalyxMaterial(scene: Scene): PBRMaterial {
  let mat = cachedCalyxMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('calyxMat', scene);
    mat.albedoColor = Color3.FromHexString('#3a7a30');
    mat.metallic = 0;
    mat.roughness = 0.85;
    mat.backFaceCulling = false;
    cachedCalyxMaterial.set(scene, mat);
  }
  return mat;
}

const cachedStemMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getStemMaterial(scene: Scene): PBRMaterial {
  let mat = cachedStemMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('fruitStemMat', scene);
    mat.albedoColor = Color3.FromHexString('#4a8030');
    mat.metallic = 0;
    mat.roughness = 0.7;
    cachedStemMaterial.set(scene, mat);
  }
  return mat;
}

// ---------------------------------------------------------------------------
// Source meshes for InstancedMesh — calyx + stem stub
//
// SupportingPlant doesn't go through the full createFruitNode path (would
// trigger 800+ shader compiles on SwiftShader). It builds simple spheres
// for the bodies; for calyx + stem stub we instead build ONE source mesh
// per scene and clone it as InstancedMesh per fruit. Babylon batches all
// instances into a single draw call → adding ~870 calyx + ~870 stem
// instances costs essentially nothing on the GPU.
// ---------------------------------------------------------------------------

const cachedCalyxSource: WeakMap<Scene, Mesh> = new WeakMap();
const cachedStemSource: WeakMap<Scene, Mesh> = new WeakMap();

/** Get the cached source calyx mesh for this scene; create if missing. */
export function getCalyxSourceMesh(scene: Scene): Mesh {
  let m = cachedCalyxSource.get(scene);
  if (m) return m;
  m = new Mesh('_calyxSource', scene);
  buildCalyxVertexData().applyToMesh(m);
  m.material = getCalyxMaterial(scene);
  m.isVisible = false;       // the source itself is invisible; instances render
  m.alwaysSelectAsActiveMesh = false;
  cachedCalyxSource.set(scene, m);
  return m;
}

/** Get the cached source stem-stub cylinder for this scene; create if missing. */
export function getStemSourceMesh(scene: Scene): Mesh {
  let m = cachedStemSource.get(scene);
  if (m) return m;
  // Standard cylinder, 1m tall × 1.5mm diameter, oriented along +Y so
  // scaling Y gives the actual stem length per fruit.
  m = MeshBuilder.CreateCylinder('_stemSource', {
    height: 1, diameter: 0.0015, tessellation: 8,
  }, scene);
  m.material = getStemMaterial(scene);
  m.isVisible = false;
  m.alwaysSelectAsActiveMesh = false;
  cachedStemSource.set(scene, m);
  return m;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Create a fruit with calyx + stem stub.
 *
 * The fruit body now reads `fruit.cultivarGenome` (per-fruit
 * morphology + color variance sample drawn at fruit set). When the
 * field is absent (e.g. very early code paths), we fall back to a
 * neutral round-tomato shape so nothing crashes.
 */
export function createFruitNode(
  name: string,
  scene: Scene,
  fruit: FruitState,
  rng: SeededRandom,        // legacy parameter — kept for compatibility
  spec: FruitSpec,          // ★ L7-A-3a (S63) — botanical/rendering parameter spec
  opts?: { lod?: 'high' | 'low' | 'ultraLow'; skipCalyxAndStem?: boolean },
): TransformNode {
  void rng; // no longer used; per-fruit determinism comes from genome seeds
  const lod = opts?.lod ?? 'high';

  const root = new TransformNode(name, scene);
  const radiusM = fruit.diameterMm / 2 / 1000;

  // Fall-back genome for FruitStates that pre-date the Phase 4 extension.
  const genome: CultivarSample = fruit.cultivarGenome ?? {
    potentialMassG: 150,
    loculeCount: 4,
    heightWidthRatio: 0.9,
    ribbingStrength: 0.15,
    asymmetrySeed: fruit.index * 7919 + 1234,
    mottleSeed: fruit.index * 131 + 5678,
    ripeningSpeedFactor: 1,
    blossomEndAdvanceFrac: 0.4,
    asymmetryAmp: 0.06,
  };

  // ---------- Body ----------
  const body = new Mesh(`${name}_body`, scene);
  buildFruitBodyVertexData(fruit, genome, spec, lod).applyToMesh(body);
  body.scaling = new Vector3(radiusM, radiusM, radiusM);
  body.parent = root;
  const fruitDebugTexture = getFruitDebugTextureMode();
  body.useVertexColors = fruitDebugTexture !== 'roughness';

  const stage = Math.max(0, Math.min(5, fruit.ripenStage));
  // PBRMaterial creation is dominated by shader-permutation compile
  // (~10ms each on SwiftShader). With 800+ fruits visible in the
  // supporting-canopy view, allocating per-fruit materials would
  // wedge the renderer for tens of seconds. Cache one material per
  // (scene, stage) — per-fruit color variation already lives in the
  // vertex-color buffer.
  // ★ L7-B-2 (S67) — far LOD (ultraLow) → simple material (clearcoat/subsurface off).
  const roughnessBand = roughnessBandFor(fruit, genome);
  const skinVariant = skinVariantFor(fruit, genome, spec.materialRules.skinVariantCount ?? 1);
  body.material = lod === 'ultraLow'
    ? getSimpleBodyMaterial(scene, stage, spec)
    : getBodyMaterial(scene, stage, spec, lod, roughnessBand, skinVariant, fruitDebugTexture);

  // ---------- Calyx + stem stub (visible-size fruits only) ----------
  // Skip on `low` LOD to keep the supporting-canopy mesh count
  // manageable — 29 plants × 6 trusses × 5 fruits with full calyx +
  // stem stubs (~2600 extra meshes) wedges SwiftShader.
  if (radiusM > 0.003 && lod === 'high' && !opts?.skipCalyxAndStem) {
    const calyx = new Mesh(`${name}_calyx`, scene);
    buildCalyxVertexData().applyToMesh(calyx);
    calyx.scaling = new Vector3(radiusM, radiusM, radiusM);
    calyx.position = new Vector3(0, 0, 0);
    calyx.material = getCalyxMaterial(scene);
    calyx.parent = root;

    // Short green stem stub — the harvest robot's grasp target.
    // ~10 mm long, ~1.5 mm diameter, positioned just above the calyx
    // center. Length scales mildly with fruit size.
    const stemLenM = Math.min(0.018, Math.max(0.006, radiusM * 0.4));
    const stem = MeshBuilder.CreateCylinder(`${name}_stem`, {
      height: stemLenM,
      diameter: 0.0015,
      tessellation: 8,
    }, scene);
    stem.position = new Vector3(0, radiusM * 0.95 + stemLenM / 2, 0);
    stem.material = getStemMaterial(scene);
    stem.parent = root;
  }

  return root;
}

// ---------------------------------------------------------------------------
// Harvest pose anchors — 4-keypoint API (Wageningen ScienceDirect 2023).
// Downstream harvest-robot simulators read these to plan grasp + cut.
//   - fruitCenter: body geometric center
//   - calyxCenter: where the green sepals sit (just above body top pole)
//   - abscissionZone: mid-pedicel joint (the AZ — robot's cut target)
//   - branchingPoint: where this fruit's pedicel meets the truss rachis
// ---------------------------------------------------------------------------

export interface HarvestPoseAnchors {
  /** World-space center of fruit body. */
  fruitCenter: Vector3;
  /** Calyx center (where the green star sits). */
  calyxCenter: Vector3;
  /** Abscission zone (mid-pedicel joint — the cut target). */
  abscissionZone: Vector3;
  /** Caller-supplied branching point on the truss peduncle. */
  branchingPoint: Vector3;
}

/**
 * Compute the 4 keypoints for a fruit's harvest pose. Offsets are
 * derived from the fruit's actual radius (so cherry/beefsteak both
 * resolve correctly). The caller provides the branching point on the
 * truss rachis since the fruit node has no reference to its sibling
 * peduncle root.
 */
export function computeHarvestPoseAnchors(
  fruitNode: TransformNode,
  fruit: FruitState,
  branchingPoint: Vector3,
): HarvestPoseAnchors {
  const center = fruitNode.getAbsolutePosition().clone();
  const radiusM = fruit.diameterMm / 2 / 1000;
  // Local +Y of the fruit node lives in the first column of its world
  // matrix's upper-left 3×3. We sample that to project offsets along
  // the actual orientation of the hanging fruit (which may droop).
  const m = fruitNode.getWorldMatrix();
  const upWorld = new Vector3(m.m[4], m.m[5], m.m[6]).normalize();
  const stemLenM = Math.min(0.018, Math.max(0.006, radiusM * 0.4));
  return {
    fruitCenter: center,
    // Calyx sits at the top pole of the body
    calyxCenter: center.add(upWorld.scale(radiusM * 0.95)),
    // AZ is mid-stem — halfway up the stem stub
    abscissionZone: center.add(upWorld.scale(radiusM * 0.95 + stemLenM * 0.5)),
    branchingPoint: branchingPoint.clone(),
  };
}
