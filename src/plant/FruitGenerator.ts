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
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SeededRandom } from '@farmsim/tomato-engine';
import type { FruitState, CultivarSample } from '@farmsim/tomato-engine';

const SEGMENTS = 20;          // longitudinal slices (azimuth)
const RINGS = 14;             // latitudinal rings (between poles)
const CROWN_RECESSION = 0.10; // depth of well at stem-end (× radius)

// ---------------------------------------------------------------------------
// Body mesh — oblate, ribbed, asymmetric, per-vertex colored
// ---------------------------------------------------------------------------

function buildFruitBodyVertexData(
  fruit: FruitState,
  genome: CultivarSample,
): VertexData {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // Vertex grid (RINGS+1 rings × SEGMENTS+1 columns)
  // The pole rings collapse to a single point; the top pole has the
  // crown recession applied. φ = polar angle (0 = +Y top, π = -Y bottom)
  const h = genome.heightWidthRatio;
  const rib = genome.ribbingStrength;
  const lc = genome.loculeCount;

  // Per-vertex asymmetry RNG — same seed → same shape each rebuild.
  const asymRng = new SeededRandom(genome.asymmetrySeed);
  // warm up
  asymRng.next(); asymRng.next(); asymRng.next();

  // Mottle RNG used for per-vertex color noise
  const mottleRng = new SeededRandom(genome.mottleSeed);
  mottleRng.next(); mottleRng.next();

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

      // Locule ribbing: cos(lc·θ) bumps, strongest at the bottom pole
      // and fading toward the equator. Beefsteak's classic 6-8 lobed
      // base; cherry's lc=2 produces no visible ribbing.
      if (rib > 0 && cosP < 0) {
        // sweep weight: 1 at bottom pole, 0 at equator
        const sweep = Math.pow(-cosP, 1.3);
        const ribAmp = rib * 0.10 * sweep;
        const ribFactor = 1 + ribAmp * Math.cos(lc * theta);
        x *= ribFactor;
        z *= ribFactor;
      }

      // Crown recession: small dent at stem-end (top pole).
      // Falls off within ~25% of top hemisphere.
      if (cosP > 0.75) {
        const recessSweep = (cosP - 0.75) / 0.25;  // 0..1
        y -= CROWN_RECESSION * recessSweep;
      }

      // Per-vertex asymmetry — small Gaussian noise on each axis. Same
      // sign+magnitude every call because RNG is seeded by genome.
      const a = genome.ribbingStrength * 0 + 1; // placeholder for clarity
      const noise = genome.asymmetrySeed > 0 ? 0 : 0;
      const ax = asymRng.gaussian(0, 0.03);
      const ay = asymRng.gaussian(0, 0.025);
      const az = asymRng.gaussian(0, 0.03);
      x *= 1 + ax;
      y *= 1 + ay;
      z *= 1 + az;
      // Mark unused variables explicit to avoid lint warnings
      void a; void noise;

      positions.push(x, y, z);

      // Per-vertex color — blossom-end first ripening.
      // Y > 0 = stem-end (top), Y < 0 = blossom-end (bottom).
      // Stages 2-4 show the gradient most. Outside that range the fruit
      // is uniformly green (stage 0-1) or uniformly red (stage 5).
      const baseRGB: [number, number, number] = [
        fruit.color[0] / 255,
        fruit.color[1] / 255,
        fruit.color[2] / 255,
      ];

      let gradStrength = 0;
      if (fruit.ripenStage >= 2 && fruit.ripenStage <= 4) {
        const fromStage2 = (fruit.ripenStage - 2) + fruit.ripenFraction;
        // Peaks at stage 2.5, falls to 0 at stage 1 or 5
        gradStrength = (genome.blossomEndAdvanceFrac ?? 0.4)
          * Math.max(0, 1 - Math.abs(fromStage2 - 1) * 0.7);
      }

      // shiftFrac > 0 → push toward riper (more red); < 0 → less ripe.
      // y is in cultivar-relative units (-h..+h). Negative y = blossom-end.
      const shiftFrac = -y / Math.max(0.1, h) * gradStrength;
      // Blend toward fully-ripe red (cultivar fullRipeRGB approximated
      // by `[195/255, 30/255, 22/255]` baseline since FruitState
      // doesn't carry cultivar RGB. The visual layer reads what's
      // already computed in fruit.color and just shifts hue.
      const ripeR = Math.min(1, baseRGB[0] + shiftFrac * 0.25);
      const ripeG = Math.max(0, baseRGB[1] - shiftFrac * 0.25);
      const ripeB = Math.max(0, baseRGB[2] - shiftFrac * 0.05);

      // Marbled mottling — per-vertex Gaussian color jitter
      const mott = mottleRng.gaussian(0, 0.035);
      const r2 = Math.max(0, Math.min(1, ripeR * (1 + mott)));
      const g2 = Math.max(0, Math.min(1, ripeG * (1 + mott * 0.7)));
      const b2 = Math.max(0, Math.min(1, ripeB * (1 + mott * 0.5)));

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

  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.colors = colors;
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
  const sepalLengthFrac = 0.45;       // along Y (× radius)
  const sepalSpreadFrac = 0.85;       // outward (× radius)
  const sepalTipReflex = 0.20;        // tip flares this much above sepal mid
  const baseY = 0.78;                 // sepal base attaches at this Y/radius (sits in crown well)

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
): TransformNode {
  void rng; // no longer used; per-fruit determinism comes from genome seeds

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
  };

  // ---------- Body ----------
  const body = new Mesh(`${name}_body`, scene);
  buildFruitBodyVertexData(fruit, genome).applyToMesh(body);
  body.scaling = new Vector3(radiusM, radiusM, radiusM);
  body.parent = root;
  body.useVertexColors = true;

  const stage = Math.max(0, Math.min(5, fruit.ripenStage));
  const bodyMat = new PBRMaterial(`${name}_mat`, scene);
  // White albedo → vertex color fully drives surface color.
  bodyMat.albedoColor = new Color3(1, 1, 1);
  bodyMat.metallic = 0;
  bodyMat.roughness = 0.42 - stage * 0.025;        // 0.42 → 0.295
  bodyMat.clearCoat.isEnabled = stage >= 2;
  bodyMat.clearCoat.intensity = stage < 2 ? 0 : 0.30 + (stage - 2) * 0.12;
  bodyMat.clearCoat.roughness = 0.18 - stage * 0.012;
  // Light SSS for ripe fruits — picks up the subdermal red glow
  if (stage >= 3) {
    bodyMat.subSurface.isTranslucencyEnabled = true;
    bodyMat.subSurface.translucencyIntensity = 0.15;
    bodyMat.subSurface.tintColor = Color3.FromHexString('#8b1a14');
    bodyMat.subSurface.minimumThickness = 0.5;
    bodyMat.subSurface.maximumThickness = 1.5;
  }
  body.material = bodyMat;

  // ---------- Calyx + stem stub (visible-size fruits only) ----------
  if (radiusM > 0.003) {
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
