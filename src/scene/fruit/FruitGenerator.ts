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

// ★ L7-A-3a/b (S63/S64) — SEGMENTS/RINGS/CROWN/SHOULDER 모두 spec 주입.
//   FruitGenerator.ts 안 botanical/rendering magic 0 의무 (FRUIT-SPEC-BOTANICAL-PARAMETERS-01).

// ---------------------------------------------------------------------------
// Body mesh — oblate, ribbed, asymmetric, per-vertex colored
// ---------------------------------------------------------------------------

function buildFruitBodyVertexData(
  fruit: FruitState,
  genome: CultivarSample,
  spec: FruitSpec,
  lod: 'high' | 'low' | 'ultraLow' = 'high',
): VertexData {
  const positions: number[] = [];
  const colors: number[] = [];
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

      // Stem-end socket: deeper dent at top pole — the pedicel tip lands
      // here, so a visible cavity (not a smooth dome) reads as a real
      // stem scar. Falls off within ~15% of top hemisphere.
      if (cosP > 0.85) {
        const recessSweep = (cosP - 0.85) / 0.15;  // 0..1
        y -= CROWN_RECESSION * recessSweep;
      } else if (cosP > 0.70) {
        // Shoulder bulge: slight outward swell on the ring just below
        // the socket — gives the stem-end → shoulder → body transition
        // its rounded "tomato shoulders" silhouette instead of a flat
        // dome rising directly to the dent.
        const bulgeSweep = 1 - (cosP - 0.70) / 0.15;  // 1..0
        const bulge = SHOULDER_BULGE * bulgeSweep;
        x *= 1 + bulge;
        z *= 1 + bulge;
      }

      // Per-vertex asymmetry — Gaussian noise scaled by the cultivar's
      // (per-fruit-sampled) asymmetryAmp. The raw amp generates visible
      // lumpiness because every vertex picks an independent offset →
      // bumpy normals → cauliflower under specular lighting. Damp to 15%
      // of the cultivar value (was 30%) — still varies per fruit, but
      // silhouette stays smoothly round. Reduces "쭈글쭈글" perception.
      const asymAmp = (genome.asymmetryAmp ?? 0.05) * 0.15;
      const ax = asymRng.gaussian(0, asymAmp);
      const ay = asymRng.gaussian(0, asymAmp * 0.8);
      const az = asymRng.gaussian(0, asymAmp);
      x *= 1 + ax;
      y *= 1 + ay;
      z *= 1 + az;

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
      const STEM_END_GREEN_RETENTION_FRAC = 0.4;

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

      // Blend toward fully-ripe red. shiftFrac > 0 → more red; < 0 → more green.
      // FruitState 가 cultivar full-ripe RGB 를 따로 전달 안 하므로 baseline
      // 으로 [195/255, 30/255, 22/255] 가정 (color array 의 stage 5 와 일치).
      const ripeR = Math.min(1, baseRGB[0] + shiftFrac * 0.25);
      const ripeG = Math.max(0, baseRGB[1] - shiftFrac * 0.25);
      const ripeB = Math.max(0, baseRGB[2] - shiftFrac * 0.05);

      // Marbled mottling — per-vertex Gaussian color jitter. σ 0.035 → 0.015
      // 으로 축소: 이전엔 high-frequency speckle 이 표면 전체에 흩뿌려져
      // "쭈글쭈글" 인상에 기여. 더 부드러운 변동만 유지.
      const mott = mottleRng.gaussian(0, 0.015);
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

/** Per-scene cache of fruit body materials, keyed by ripening stage (0-5). */
const cachedBodyMaterials: WeakMap<Scene, PBRMaterial[]> = new WeakMap();
function getBodyMaterial(scene: Scene, stage: number, spec: FruitSpec): PBRMaterial {
  let bucket = cachedBodyMaterials.get(scene);
  if (!bucket) {
    bucket = new Array<PBRMaterial>(spec.ripeningRules.stageCount);
    cachedBodyMaterials.set(scene, bucket);
  }
  if (bucket[stage]) return bucket[stage];
  const mat = new PBRMaterial(`fruitBodyMat_stage${stage}`, scene);
  // White albedo → vertex color fully drives surface color.
  mat.albedoColor = new Color3(1, 1, 1);
  mat.metallic = 0;
  // ★ L7-A-3c (S64) — PBR coefficients from spec.materialRules (산식 → 배열).
  const matRules = spec.materialRules;
  mat.roughness = matRules.stageRoughness[stage];
  const cc = matRules.stageClearcoatIntensity[stage];
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
  bucket[stage] = mat;
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
  body.useVertexColors = true;

  const stage = Math.max(0, Math.min(5, fruit.ripenStage));
  // PBRMaterial creation is dominated by shader-permutation compile
  // (~10ms each on SwiftShader). With 800+ fruits visible in the
  // supporting-canopy view, allocating per-fruit materials would
  // wedge the renderer for tens of seconds. Cache one material per
  // (scene, stage) — per-fruit color variation already lives in the
  // vertex-color buffer.
  body.material = getBodyMaterial(scene, stage, spec);

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
