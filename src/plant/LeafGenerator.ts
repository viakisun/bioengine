// Babylon wrapper for the engine-agnostic leaf chunk generator.
// Algorithm lives in @farmsim/tomato-geometry; this file:
//   - applies GeoChunk to a Babylon Mesh
//   - owns Scene-keyed PBR material caches (regular + yellow senescent + diseased)
//   - wires NodeState/PlantGenome into stage-aware leaf params

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import {
  SeededRandom,
  getLeafStage,
  type NodeState,
  type PlantGenome,
} from '@farmsim/tomato-engine';
import {
  buildLeafChunk,
  type GeoChunk,
  type LeafShapeParams,
} from '@farmsim/tomato-geometry';
import {
  getLeafColorTexture,
  getLeafNormalTexture,
  getDiseasedLeafColorTexture,
} from './LeafTexture';

function applyChunkToMesh(chunk: GeoChunk, mesh: Mesh) {
  const vd = new VertexData();
  vd.positions = chunk.positions;
  vd.normals = chunk.normals;
  vd.uvs = chunk.uvs;
  vd.indices = chunk.indices;
  vd.applyToMesh(mesh);
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

  const mesh = new Mesh(name, scene);
  applyChunkToMesh(chunk, mesh);
  return mesh;
}

const cachedLeafMaterial = new WeakMap<Scene, PBRMaterial>();
const cachedYellowLeafMaterial = new WeakMap<Scene, PBRMaterial>();
const cachedDiseasedLeafMaterial = new WeakMap<Scene, PBRMaterial>();

export function getLeafMaterial(scene: Scene): PBRMaterial {
  let mat = cachedLeafMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('leafMat', scene);
    mat.albedoColor = new Color3(1, 1, 1);
    mat.albedoTexture = getLeafColorTexture(scene);
    mat.bumpTexture = getLeafNormalTexture(scene);
    mat.invertNormalMapY = false;
    mat.invertNormalMapX = false;
    mat.metallic = 0.0;
    mat.roughness = 0.6;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mat.environmentIntensity = 0.6;

    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.45;
    mat.subSurface.tintColor = Color3.FromHexString('#2a6818');
    mat.subSurface.minimumThickness = 0.1;
    mat.subSurface.maximumThickness = 0.4;

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
