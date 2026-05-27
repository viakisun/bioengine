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
  type NodeState,
  type PlantGenome,
} from '@farmsim/tomato-engine';
import {
  buildLeafChunk,
  buildLeafBladeOnly,
  type GeoChunk,
  type LeafShapeParams,
} from '@farmsim/tomato-geometry';
import {
  getLeafColorTexture,
  getLeafNormalTexture,
  getDiseasedLeafColorTexture,
} from './LeafTexture';

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
  const chunk = buildLeafBladeOnly(
    {
      stageInfo,
      leafletCount: node.leafletCount,
      sizeFactor: node.leafSizeFactor * genome.leafSizeMultiplier,
      maturity: node.leafMaturity,
      curl,
      ageFrac,
      shape,
      // Iter 18B PR 5 — rachis spine cylinder는 leaf 안에서 별도 stick으로
      // 보임 ("빨대" 후보 #2). leaflets은 mesh-local 위치 그대로 유지하므로
      // 시각 영향 = rachis line 사라짐만.
      omitRachis: true,
      // Iter 18B PR 6 — petiolule sticks ("빨대" 후보 #3, 각 leaflet마다 2개)
      // 도 제거. leaflets는 영향 없음 (이미 push됨).
      omitPetiolules: true,
    },
    rng,
  );
  const vertexCount = chunk.positions.length / 3;
  const vertexColors = bakeLeafVertexColors(vertexCount, ageFrac, node.waterStress, node.yellowing);
  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh, vertexColors);
  return mesh;
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
