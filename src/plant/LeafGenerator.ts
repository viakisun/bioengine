// Babylon wrapper for the engine-agnostic leaf chunk generator.
// Algorithm lives in @farmsim/tomato-geometry; this file:
//   - applies GeoChunk to a Babylon Mesh
//   - owns Scene-keyed PBR material caches (regular + yellow senescent + diseased)
//   - wires NodeState/PlantGenome into stage-aware leaf params

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import {
  SeededRandom,
  getLeafStage,
  getLeafBlendedColor,
  LeafStage,
  type NodeState,
  type PlantGenome,
  type LeafStageInfo,
} from '@farmsim/tomato-engine';
import {
  buildLeafChunk,        // Legacy ShowcasePlant path.
  buildLeafChunkSkin,    // Iter 18B PR 7 Skin preset (omit-all leaflets-only).
  type GeoChunk,
  type LeafShapeParams,
} from '@farmsim/tomato-geometry';
import {
  getLeafColorTexture,
  getLeafNormalTexture,
  getDiseasedLeafColorTexture,
} from './LeafTexture';
// SSOT #186 — Iter 24 acfad71 vertex shift logic을 anchors/ utility로 분리.
import { normalizeLeafMeshVertices } from './anchors';

function applyChunkToMesh(chunk: GeoChunk, mesh: Mesh, vertexColors?: number[]) {
  const vd = new VertexData();
  vd.positions = chunk.positions;
  vd.normals = chunk.normals;
  vd.uvs = chunk.uvs;
  vd.indices = chunk.indices;
  if (vertexColors) vd.colors = vertexColors;
  vd.applyToMesh(mesh);
}

/**
 * Bake the guideline §12 smooth color blend into vertex colors so the
 * shared PBRMaterial can do per-leaf tinting via useVertexColors=true
 * without per-instance shader uniforms. RGB is the multiplicative tint
 * (relative to the base mature green so the texture's natural color
 * shows through unchanged at age=mature/stress=0/yellow=0). Alpha is
 * always 1 — material uses RGB only.
 */
function bakeLeafVertexColors(
  vertexCount: number,
  ageFrac: number,
  waterStress: number,
  yellowing: number
): number[] {
  const blended = getLeafBlendedColor(ageFrac, waterStress, yellowing);
  // Normalize relative to mature so that mature/unstressed/green = (1,1,1) tint
  // and we only deviate when actually aged/stressed/senescent.
  // Must mirror LEAF_COLOR_MATURE in @farmsim/tomato-engine/LeafColors.
  // Mature/normal leaves end up with tint (1,1,1) so the texture's
  // baseline green shows unchanged; aged/stressed/senescent leaves
  // deviate from there.
  const MATURE_R = 0.165, MATURE_G = 0.400, MATURE_B = 0.125;
  const r = blended.r / MATURE_R;
  const g = blended.g / MATURE_G;
  const b = blended.b / MATURE_B;
  const out = new Array<number>(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    const o = i * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 1;
  }
  return out;
}

/**
 * Legacy positional-args wrapper — used by 29 static neighbor plants
 * in GreenhouseScene where there's no NodeState. Group 3 replaces
 * those with GrowthEngine-driven Light LOD plants.
 */
export function createLeafMesh(
  name: string,
  scene: Scene,
  leafletCount: number,
  sizeFactor: number,
  maturity: number,
  curl: number,
  rng: SeededRandom,
  shapeParams?: LeafShapeParams,
  ageFrac?: number
): Mesh {
  const chunk = buildLeafChunk(
    {
      leafletCount,
      sizeFactor,
      maturity,
      curl,
      ageFrac: ageFrac ?? 0,
      shape: shapeParams,
    },
    rng
  );
  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh);
  return mesh;
}

/**
 * Build a leaf mesh driven by GrowthEngine NodeState + genome.
 *
 * Pulls the leaf's stage via getLeafStage(node, plantAge) so the geometry
 * morphs smoothly between early-true → compound-developing → mature,
 * instead of snap-changing leafletCount.
 *
 * waterStress is folded into ageFrac for petiole/rachis gravity sag.
 */
export function createLeafMeshFromNode(
  name: string,
  scene: Scene,
  node: NodeState,
  genome: PlantGenome,
  plantAge: number,
  rng: SeededRandom
): Mesh {
  if (node.leafMaturity < 0.01) return new Mesh(name, scene);

  const stageInfo = getLeafStage(node, plantAge);

  const shape: LeafShapeParams = {
    serrationDepth: genome.leafSerrationDepth,
    serrationFreq: genome.leafSerrationFreq,
    lobeDepth: genome.leafLobeDepth,
    waviness: genome.leafWaviness,
    petioleLength: genome.leafPetioleLength,
  };

  const ageFromDroop = Math.min(1, node.droopExtra / 120);
  const ageFromAge = Math.min(1, node.age / 80);
  const ageFrac = Math.max(ageFromDroop, ageFromAge) + node.waterStress * 0.3;

  const curl = 0.12 + node.yellowing * 0.15;

  const chunk = buildLeafChunk(
    {
      stageInfo,
      leafletCount: node.leafletCount,
      sizeFactor: node.leafSizeFactor * genome.leafSizeMultiplier,
      maturity: node.leafMaturity,
      curl,
      ageFrac,
      shape,
    },
    rng
  );

  const vertexCount = chunk.positions.length / 3;
  const vertexColors = bakeLeafVertexColors(
    vertexCount,
    ageFrac,
    node.waterStress,
    node.yellowing
  );

  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh, vertexColors);
  return mesh;
}

/**
 * Iter 18B PR 4 (Critical) — Skin-only variant of `createLeafMeshFromNode`.
 *
 * Identical signature but routes through `buildLeafBladeOnly` instead of
 * `buildLeafChunk`. The blade-only path OMITS the internal petiole cylinder
 * because the SkeletonGraph's `petiole` edge already supplies that geometry
 * via the unified stem skin mesh. ShowcasePlant continues to use
 * `createLeafMeshFromNode` (with embedded petiole) for backward-compat;
 * SkinMeshPlant calls THIS function.
 *
 * Removes the "duplicate petiole stick" symptom (Iter 18A user finding —
 * leafChunk's internal petiole rendered as a thin pale-green floating
 * cylinder next to the skeleton's petiole tube).
 */
export function createLeafBladeOnlyMesh(
  name: string,
  scene: Scene,
  node: NodeState,
  genome: PlantGenome,
  plantAge: number,
  rng: SeededRandom,
): Mesh {
  if (node.leafMaturity < 0.01) return new Mesh(name, scene);
  const stageInfo = getLeafStage(node, plantAge);
  const shape: LeafShapeParams = {
    serrationDepth: genome.leafSerrationDepth,
    serrationFreq: genome.leafSerrationFreq,
    lobeDepth: genome.leafLobeDepth,
    waviness: genome.leafWaviness,
    petioleLength: genome.leafPetioleLength,
  };
  const ageFromDroop = Math.min(1, node.droopExtra / 120);
  const ageFromAge = Math.min(1, node.age / 80);
  const ageFrac = Math.max(ageFromDroop, ageFromAge) + node.waterStress * 0.3;
  const curl = 0.12 + node.yellowing * 0.15;
  // Iter 18B PR 7 — `buildLeafChunkSkin` 명시적 Skin preset 사용.
  // PR 4-6의 omitRachis + omitPetiolules + buildLeafBladeOnly(petiole omit)
  // 조합을 단일 entry로 wrap. ShowcasePlant는 buildLeafChunk (legacy) 그대로.
  const sizeFactor = node.leafSizeFactor * genome.leafSizeMultiplier;
  const maturity = node.leafMaturity;
  const chunk = buildLeafChunkSkin(
    {
      stageInfo,
      leafletCount: node.leafletCount,
      sizeFactor,
      maturity,
      curl,
      ageFrac,
      shape,
    },
    rng,
  );
  // SSOT #186 — Mesh anchor contract. Iter 24 acfad71 vertex shift logic을
  // utility로 분리 (byte-identical). 첫 leaflet의 가장 stem-side vertex(min x)
  // 가 mesh-local (0, 0, 0)에 오도록 정렬 → SkinMeshPlant에서 leafMesh.position
  // = petiole tip 설정 시 자동 정합.
  // 참조: docs/architecture/MESH_ANCHORS.md
  normalizeLeafMeshVertices(chunk.positions);
  const vertexCount = chunk.positions.length / 3;
  const vertexColors = bakeLeafVertexColors(vertexCount, ageFrac, node.waterStress, node.yellowing);
  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh, vertexColors);
  return mesh;
}

// ---------------------------------------------------------------------------
// Iter 29 Phase 4 — canonical Skin builder: data-driven from LeafOrganState.
// ---------------------------------------------------------------------------

/**
 * Iter 29 Phase 4 canonical Skin leaf-mesh builder.
 *
 * Plan §13.3 (sleepy-growing-pretzel.md):
 *   buildLeafMesh(leafOrganState, anchor, visualProfile) — Skin reads
 *   `phytomer.leaf` + `anchor` only. No growth-state recomputation
 *   (SKIN-NO-GROWTH-LOGIC-01). No `plantAge` parameter (SKIN-DATA-DRIVEN-01).
 *   No LeafBase.azimuthRad/droopRad direct reads (SKIN-DATA-DRIVEN-03).
 *
 * Derives the existing LeafStageInfo struct from LeafOrganState fields so
 * `buildLeafChunkSkin` keeps the same biology — only the input plumbing
 * changes. `getLeafStage` is NOT called.
 *
 * Visual-only parameters (serration frequency, waviness, petiole length
 * texture) still flow via `genome` for Phase 4; Phase 5 fully migrates
 * those onto `cultivar.visualProfile`.
 *
 * @param leafOrganState  PlantBase-computed canonical leaf state
 * @param visualGenome    shape/texture parameters (Phase 5 → visualProfile)
 * @param rng             seeded RNG per-leaf
 * @param name            mesh name
 * @param scene           Babylon Scene
 */
export function buildLeafMeshFromPhytomer(
  name: string,
  scene: Scene,
  leafOrganState: {
    expansionProgress: number;
    leafletCount: number;
    currentAreaCm2: number;
    targetAreaCm2: number;
    stage: string;
    posture: { droopDeg: number; curl: number };
    senescence: { progress: number; colorDullness: number; curl: number };
    morphology: { serrationDepth: number; lobeDepth: number; petioleLengthM: number };
    // Iter 31 Phase 2 (R5 fix) — optional canonical geometry projection.
    geometryProjection?: {
      leafAxisLengthScale: number;
      leafletBladeScale: number;
      referenceRachisLengthM: number;
      referencePetioleLengthM: number;
    };
  },
  visualGenome: PlantGenome,
  rng: SeededRandom,
): Mesh {
  if (leafOrganState.expansionProgress < 0.01 && leafOrganState.currentAreaCm2 < 0.5) {
    return new Mesh(name, scene);
  }

  // ─── LeafStageInfo derived from LeafOrganState (NO getLeafStage call) ──
  const stageInfo = leafStageInfoFromOrganState(leafOrganState);

  // Shape: morphology values come from PlantBase (Phase 2A computed); visual
  // detail params (waviness, serrationFreq, petioleLength texture) still
  // flow via genome until Phase 5 visualProfile.
  const shape: LeafShapeParams = {
    serrationDepth: leafOrganState.morphology.serrationDepth,
    serrationFreq: visualGenome.leafSerrationFreq,
    lobeDepth: leafOrganState.morphology.lobeDepth,
    waviness: visualGenome.leafWaviness,
    petioleLength: visualGenome.leafPetioleLength,
  };

  // ageFrac mirrors PlantBase senescence — Skin applies value, doesn't recompute.
  // visibleAreaFactor (PlantBase senescence) reduces vertex-color baseline.
  const ageFrac = Math.min(1, leafOrganState.senescence.progress);
  const curl = leafOrganState.posture.curl + leafOrganState.senescence.curl * 0.5;

  // ─── Iter 31 Phase 2 (R5 fix) — Geometry projection ───
  //
  // ★ PlantBase가 _계산_, Skin은 _읽고 곱하기만_. 어떤 ageTT / cultivar / sigmoid
  //   계산도 Skin에서 하지 않음 (Iter 29 책임 분리 보존).
  //
  // canonical: leafOrganState.geometryProjection (PlantBase computeLeafGeometryProjection)
  // legacy fallback: 기존 (current/target) ratio _sqrt 적용_ (mature-small leaf 문제 완화).
  const projection = leafOrganState.geometryProjection;
  // Legacy sizeFactor (back compat for state shapes without geometryProjection).
  // ★ 정정: legacy도 sqrt 적용 — current/target ratio가 1.0이라도 _sqrt 효과_는 minimal.
  const referenceArea = Math.max(1, leafOrganState.targetAreaCm2);
  const legacySizeFactor =
    Math.sqrt(Math.max(0, leafOrganState.currentAreaCm2 / referenceArea))
    * visualGenome.leafSizeMultiplier;

  const chunk = buildLeafChunkSkin(
    {
      stageInfo,
      leafletCount: leafOrganState.leafletCount,
      // sizeFactor — legacy fallback (canonical path는 leafAxisLengthScale + leafletBladeScale 사용)
      sizeFactor: legacySizeFactor,
      maturity: leafOrganState.expansionProgress,
      curl,
      ageFrac,
      shape,
      // ★ Iter 31 Phase 2 canonical fields (PlantBase 계산값 그대로 전달).
      leafAxisLengthScale: projection?.leafAxisLengthScale,
      leafletBladeScale: projection?.leafletBladeScale,
      referenceRachisLengthM: projection?.referenceRachisLengthM,
      referencePetioleLengthM: projection?.referencePetioleLengthM,
    },
    rng,
  );
  // SSOT #186 — Mesh anchor contract (Iter 24 acfad71 vertex shift).
  normalizeLeafMeshVertices(chunk.positions);
  const vertexCount = chunk.positions.length / 3;
  // Senescence colorDullness drives the yellowing channel; waterStress flows
  // through PlantBase plant-level signal (Phase 4: zero on the leaf entry — Phase 5
  // wires per-leaf stress from PhytomerNode.leaf.stress).
  const vertexColors = bakeLeafVertexColors(
    vertexCount,
    ageFrac,
    0,
    leafOrganState.senescence.colorDullness,
  );
  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh, vertexColors);
  return mesh;
}

/**
 * Build a LeafStageInfo struct from LeafOrganState fields WITHOUT calling
 * the engine-level `getLeafStage`. Maps PhytomerNode-side stage enum
 * ('primordium' | 'simple_leaf' | …) to the legacy LeafStage enum
 * (COTYLEDON | EARLY_TRUE | …) so `buildLeafChunkSkin` consumers keep
 * working unchanged.
 *
 * SKIN-NO-GROWTH-LOGIC-01: this function does NOT call getLeafStage,
 * leafletCountFromMaturity, computeLeafExpansion, or computeSenescence —
 * all values are read from the already-populated LeafOrganState fields.
 */
function leafStageInfoFromOrganState(input: {
  expansionProgress: number;
  leafletCount: number;
  stage: string;
  senescence: { progress: number };
}): LeafStageInfo {
  const expansion = Math.max(0, Math.min(1, input.expansionProgress));
  const senescenceP = Math.max(0, Math.min(1, input.senescence.progress));

  // Senescent / pruned override regardless of expansion
  if (senescenceP >= 0.3 && input.stage === 'senescent') {
    return {
      stage: LeafStage.SENESCENT,
      blendT: senescenceP,
      leafletCount: input.leafletCount,
      serrationStrength: 1,
      lobeStrength: 1,
    };
  }
  if (input.stage === 'removed') {
    return {
      stage: LeafStage.PRUNED,
      blendT: 0,
      leafletCount: 0,
      serrationStrength: 0,
      lobeStrength: 0,
    };
  }

  // EARLY_TRUE (expansion < 0.4)
  if (expansion < 0.4) {
    const blendT = expansion / 0.4;
    return {
      stage: LeafStage.EARLY_TRUE,
      blendT,
      leafletCount: input.leafletCount,
      serrationStrength: blendT * 0.4,
      lobeStrength: blendT * 0.3,
    };
  }
  // COMPOUND_DEVELOPING / COMPOUND_MATURE
  const t = (expansion - 0.4) / 0.6;
  return {
    stage: t < 0.5 ? LeafStage.COMPOUND_DEVELOPING : LeafStage.COMPOUND_MATURE,
    blendT: t,
    leafletCount: input.leafletCount,
    serrationStrength: 0.4 + t * 0.6,
    lobeStrength: 0.5 + t * 0.5,
  };
}

const cachedLeafMaterial = new WeakMap<Scene, PBRMaterial>();
const cachedYellowLeafMaterial = new WeakMap<Scene, PBRMaterial>();
const cachedDiseasedLeafMaterial = new WeakMap<Scene, PBRMaterial>();

/**
 * Shader-side wind toggle.
 *
 * Spike result (Phase S): PBRCustomMaterial's GLSL injection (AddUniform +
 * Vertex_Before_PositionUpdated) fails to compile on Babylon 9 WebGPU
 * backend ("GLSL compilation failed" page error, plant invisible).
 * Works on WebGL2.
 *
 * BabylonEngine calls setShaderWindEnabled(backend === 'webgl2') at boot.
 * When false, getLeafMaterial returns plain PBRMaterial (no wind). Wind
 * on WebGPU is delivered via CPU sine fallback in Phase B (plant root
 * TransformNode rotation per frame).
 */
let _useShaderWind = false;
export function setShaderWindEnabled(enabled: boolean) {
  _useShaderWind = enabled;
}
export function isShaderWindEnabled() {
  return _useShaderWind;
}

export function getLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedLeafMaterial.get(scene);
  if (!mat) {
    if (_useShaderWind) {
      const customMat = new PBRCustomMaterial('leafMat', scene);
      customMat.albedoColor = new Color3(1, 1, 1);
      customMat.albedoTexture = getLeafColorTexture(scene);
      customMat.bumpTexture = getLeafNormalTexture(scene);
      customMat.invertNormalMapY = false;
      customMat.invertNormalMapX = false;
      customMat.metallic = 0.0;
      customMat.roughness = 0.48;          // 0.6 → 0.48 — leaves have soft sheen
      customMat.backFaceCulling = false;
      customMat.twoSidedLighting = true;
      customMat.environmentIntensity = 0.85;  // 0.6 → 0.85 — IBL fills shaded leaves
      // Phase B — per-leaf smooth color blend via baked vertex colors.
      // LeafGenerator bakes RGB tint from getLeafBlendedColor(); PBR
      // material auto-detects vertex colors from the bound VertexBuffer
      // and multiplies them against the albedo texture (no flag needed).

      // Cuticle wax — real tomato leaves have a thin waxy layer. clearcoat
      // adds the subtle specular sheen visible on healthy leaves under
      // greenhouse lighting.
      customMat.clearCoat.isEnabled = true;
      customMat.clearCoat.intensity = 0.35;
      customMat.clearCoat.roughness = 0.25;

      customMat.subSurface.isTranslucencyEnabled = true;
      customMat.subSurface.translucencyIntensity = 0.75;  // 0.45 → 0.75 (more backlight)
      customMat.subSurface.tintColor = Color3.FromHexString('#3d8a25');  // brighter green
      customMat.subSurface.minimumThickness = 0.05;
      customMat.subSurface.maximumThickness = 0.3;

      // 3-layer wind — guideline §10. windWeight biases the offset toward
      // leaflet tips & edges so the petiole base stays mostly anchored.
      customMat.AddUniform('windTime', 'float', 0);
      customMat.AddUniform('windStrength', 'float', 0.5);
      customMat.AddUniform('flutterStrength', 'float', 0.6);
      customMat.AddUniform('windDir', 'vec3', new Color3(1, 0, 0.3));
      // Phase C — interaction array. xyz = world-space push origin,
      // w = strength (already exponentially decayed CPU-side). Up to
      // 8 simultaneous interactions; robot + a couple of workers fits.
      customMat.AddUniform('interactionCount', 'int', 0);
      customMat.AddUniform('interactionData', 'vec4[8]', null);
      customMat.Vertex_Before_PositionUpdated(`
        float windV = clamp(uv.y, 0.0, 1.0);
        float windU = uv.x * 2.0 - 1.0;
        float windWeight = clamp(pow(windV, 1.4) + pow(abs(windU), 0.8) * 0.35, 0.0, 1.0);
        float largeSway = sin(windTime * 0.6 + position.x * 0.15 + position.z * 0.1) * 0.08;
        float mediumSway = sin(windTime * 1.4 + position.x * 0.8) * 0.035;
        float smallFlutter = sin(windTime * 6.0 + position.x * 3.0 + position.z * 2.0) * 0.012 * flutterStrength;
        float total = (largeSway + mediumSway + smallFlutter) * windStrength;
        positionUpdated += windDir * total * windWeight;

        // Interaction push — radial repulsion from each active point.
        // World position is approximate: leaf vertex is in mesh-local
        // space (plant root TransformNode already applied), so we use
        // position directly + the mesh's world origin. For petal-scale
        // accuracy this would need the full worldMatrix; the 0.5m
        // radius is forgiving enough that the approximation looks fine.
        for (int i = 0; i < 8; i++) {
          if (i >= interactionCount) break;
          vec3 ipos = interactionData[i].xyz;
          float strength = interactionData[i].w;
          float dist = distance(position, ipos);
          if (dist < 0.55) {
            float push = smoothstep(0.55, 0.0, dist) * strength;
            vec3 dir = normalize(position - ipos + vec3(0.0001));
            positionUpdated += dir * push * 0.04 * windWeight;
          }
        }
      `);

      // Midrib brightness (guideline §13) is already baked into
      // getLeafColorTexture's procedural vein pass — no shader-side
      // boost needed. Skipping that injection also keeps the GLSL
      // surface minimal, which lowered the risk of WebGPU breakage
      // (the same reason the wind shader is WebGL2-only here).

      mat = customMat;
    } else {
      // WebGPU fallback path — plain PBRMaterial; wind comes from CPU
      // sine rotation on plant root TransformNodes (driven in BabylonEngine).
      mat = new PBRMaterial('leafMat', scene);
      mat.albedoColor = new Color3(1, 1, 1);
      mat.albedoTexture = getLeafColorTexture(scene);
      mat.bumpTexture = getLeafNormalTexture(scene);
      mat.invertNormalMapY = false;
      mat.invertNormalMapX = false;
      mat.metallic = 0.0;
      mat.roughness = 0.48;
      mat.backFaceCulling = false;
      mat.twoSidedLighting = true;
      mat.environmentIntensity = 0.85;
      // Same baked-color path as WebGL2 — vertex colors auto-detected
      // from the mesh's VertexBuffer.ColorKind data; no flag required.

      mat.clearCoat.isEnabled = true;
      mat.clearCoat.intensity = 0.35;
      mat.clearCoat.roughness = 0.25;

      mat.subSurface.isTranslucencyEnabled = true;
      mat.subSurface.translucencyIntensity = 0.75;
      mat.subSurface.tintColor = Color3.FromHexString('#3d8a25');
      mat.subSurface.minimumThickness = 0.05;
      mat.subSurface.maximumThickness = 0.3;
    }

    cachedLeafMaterial.set(scene, mat);
  }
  return mat;
}

export function getYellowLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedYellowLeafMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('yellowLeafMat', scene);
    mat.albedoTexture = getLeafColorTexture(scene);
    mat.bumpTexture = getLeafNormalTexture(scene);
    mat.albedoColor = Color3.FromHexString('#cccc80');
    mat.metallic = 0.0;
    mat.roughness = 0.6;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mat.environmentIntensity = 0.5;

    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.6;
    mat.subSurface.tintColor = Color3.FromHexString('#a89030');

    cachedYellowLeafMaterial.set(scene, mat);
  }
  return mat;
}

export function getDiseasedLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedDiseasedLeafMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('diseasedLeafMat', scene);
    mat.albedoColor = new Color3(1, 1, 1);
    mat.albedoTexture = getDiseasedLeafColorTexture(scene, 0.75);
    mat.bumpTexture = getLeafNormalTexture(scene);
    mat.metallic = 0.0;
    mat.roughness = 0.7;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mat.environmentIntensity = 0.55;

    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.35;
    mat.subSurface.tintColor = Color3.FromHexString('#4a3818');

    cachedDiseasedLeafMaterial.set(scene, mat);
  }
  return mat;
}
