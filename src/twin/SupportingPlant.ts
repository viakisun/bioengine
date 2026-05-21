// Lighter-weight twin of ShowcasePlant for the 29 non-center plants.
//
// Why this exists: the user's note "현재는 안타깝게도, 이미지를 가지고서
// 확대하는 형태로 하고 있을꺼야" — i.e. the old GreenhouseScene path
// scaled a static foliage mesh by `heightCm/220`. This module replaces
// that with proper GrowthEngine-driven mesh rebuilds, but at a fraction
// of the showcase plant's geometry budget so 29 of them stay smooth at
// 60+ fps.
//
// Differences vs ShowcasePlant:
//   - No cotyledon material alpha animation (binary visible/invisible)
//   - Leaves: simpler shape — fewer leaflets, half-strength serration/lobe
//   - Stem: same Frenet curve but renderer reads a coarser node sample
//   - Truss: just the fruit body — no peduncle/pedicel mesh, no flowers
//   - Higher REBUILD_THRESHOLD (2 days) — most of the morphology is
//     invisible at distance, so rebuilding twice as often is wasted work

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import {
  SeededRandom,
  STAGE_COLORS,
  getLeafStage,
  type GrowthEngine,
  type PlantState,
  type EnvironmentParams,
  type PlantStressInputs,
} from '@farmsim/tomato-engine';
import type { HealthLabel } from '../data/mockScenario';
import {
  buildLeafChunk,
  buildCotyledonChunk,
} from '@farmsim/tomato-geometry';
import { getLeafMaterial, getYellowLeafMaterial, getDiseasedLeafMaterial } from '../plant/LeafGenerator';
import { createStemMesh, getStemMaterial } from '../plant/StemGenerator';

export interface SupportingPlantHandle {
  root: TransformNode;
  update: (day: number, healthLabel?: HealthLabel) => void;
  setVisible: (v: boolean) => void;
  currentState: () => PlantState | null;
}

/** Map mockScenario healthLabel → engine env override + stress inputs. */
function healthLabelToInputs(label: HealthLabel | undefined): {
  envOverride?: EnvironmentParams;
  stress?: PlantStressInputs;
} {
  if (!label || label === 'normal') return {};
  if (label === 'water-stress') {
    return {
      envOverride: { substrateWater: 0.25 }, // engine auto-derives waterStress
      stress: { waterStress: 0.75 },
    };
  }
  if (label === 'disease') {
    return { stress: { diseaseLoad: 0.8 } };
  }
  if (label === 'weak') {
    return {
      envOverride: { lightHoursPerDay: 9, temperatureC: 17 },
      stress: { waterStress: 0.2 },
    };
  }
  return {};
}

// Light fruit color cache by ripenStage (shared across all supporting plants)
let cachedFruitMats: WeakMap<Scene, PBRMaterial[]> = new WeakMap();
function getFruitMats(scene: Scene): PBRMaterial[] {
  let mats = cachedFruitMats.get(scene);
  if (!mats) {
    mats = STAGE_COLORS.map((c, i) => {
      const m = new PBRMaterial(`supportFruitMat_${i}`, scene);
      m.albedoColor = new Color3(c[0] / 255, c[1] / 255, c[2] / 255);
      m.metallic = 0;
      m.roughness = 0.32 - i * 0.015;
      m.clearCoat.isEnabled = i >= 2;
      m.clearCoat.intensity = 0.3 + (i - 2) * 0.08;
      m.clearCoat.roughness = 0.15;
      return m;
    });
    cachedFruitMats.set(scene, mats);
  }
  return mats;
}

let cachedCotyledonMat: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getCotyledonMat(scene: Scene): PBRMaterial {
  let mat = cachedCotyledonMat.get(scene);
  if (!mat) {
    mat = new PBRMaterial('supportCotyledonMat', scene);
    mat.albedoColor = Color3.FromHexString('#4aaa30');
    mat.metallic = 0;
    mat.roughness = 0.8;
    mat.backFaceCulling = false;
    cachedCotyledonMat.set(scene, mat);
  }
  return mat;
}

export function createSupportingPlant(
  scene: Scene,
  engine: GrowthEngine,
  seed: number,
  worldPosition: Vector3,
  /** Offset (days) to stagger rebuilds across plants — spreads GC load. */
  rebuildOffset = 0
): SupportingPlantHandle {
  const root = new TransformNode(`support_${seed}`, scene);
  root.position.copyFrom(worldPosition);

  const leafMat = getLeafMaterial(scene);
  const yellowLeafMat = getYellowLeafMaterial(scene);
  const diseasedLeafMat = getDiseasedLeafMaterial(scene);
  const stemMat = getStemMaterial(scene);
  const cotMat = getCotyledonMat(scene);
  const fruitMats = getFruitMats(scene);

  let currentMeshes: Mesh[] = [];
  let lastState: PlantState | null = null;
  let lastBuildDay = -999;
  const REBUILD_THRESHOLD_DAYS = 2.0; // coarser — these are background plants

  function disposeAll() {
    for (const m of currentMeshes) m.dispose(false, false);
    currentMeshes = [];
  }

  function buildFromState(state: PlantState) {
    disposeAll();
    lastState = state;

    if (state.nodes.length === 0 && !state.hasCotyledons) return;

    const genome = engine.getGenome(seed)!;

    // Cotyledons — single quad each side, no alpha animation
    if (state.hasCotyledons && state.cotyledonSize > 0.05) {
      const cotSize = 0.03 * state.cotyledonSize;
      const cotY = state.nodes.length > 0 ? (state.nodes[0].heightCm / 100) * 0.3 : 0.03;
      for (const side of [-1, 1] as const) {
        const chunk = buildCotyledonChunk({ size: cotSize, segments: 4 });
        const vd = new VertexData();
        vd.positions = chunk.positions;
        vd.normals = chunk.normals;
        vd.uvs = chunk.uvs;
        vd.indices = chunk.indices;
        const mesh = new Mesh(`support_cot_${seed}_${side}`, scene);
        vd.applyToMesh(mesh);
        mesh.parent = root;
        mesh.position = new Vector3(side * cotSize * 0.5, cotY, 0);
        mesh.rotation = new Vector3(-0.3 * side, side * 0.5, 0);
        mesh.material = cotMat;
        currentMeshes.push(mesh);
      }
    }

    // Stem — same Frenet generator but on a coarser node subset
    if (state.nodes.length >= 2) {
      const stemRng = new SeededRandom(seed * 13);
      const stem = createStemMesh(`support_stem_${seed}`, scene, state.nodes, stemRng);
      if (stem) {
        stem.parent = root;
        stem.material = stemMat;
        currentMeshes.push(stem);
      }
    }

    const isDiseased = state.diseaseLoad > 0.3;
    const baseLeafMat = isDiseased ? diseasedLeafMat : leafMat;

    // Leaves — every other node only (halves the leaf count vs showcase)
    for (let i = 0; i < state.nodes.length; i += 2) {
      const node = state.nodes[i];
      if (node.leafMaturity < 0.1) continue;

      const heightM = node.heightCm / 100;
      const azimuthRad = (node.phyllotaxisAngle * Math.PI) / 180;
      const droopRad = (node.droopExtra * Math.PI) / 180;

      const stageInfo = getLeafStage(node, state.day);

      const rng = new SeededRandom(seed * 1000 + i * 13 + 7);
      const chunk = buildLeafChunk(
        {
          stageInfo,
          // Half leaflet count for background plants (rounds to nearest odd)
          leafletCount: Math.max(1, Math.round(stageInfo.leafletCount * 0.5)),
          sizeFactor: node.leafSizeFactor * genome.leafSizeMultiplier * 0.85,
          maturity: node.leafMaturity,
          curl: 0.12 + node.yellowing * 0.15,
          ageFrac: Math.max(node.droopExtra / 120, node.age / 80) + node.waterStress * 0.3,
          shape: {
            serrationDepth: genome.leafSerrationDepth * 0.5,
            serrationFreq: genome.leafSerrationFreq,
            lobeDepth: genome.leafLobeDepth * 0.6,
            waviness: 0,
            petioleLength: genome.leafPetioleLength,
          },
        },
        rng
      );

      const vd = new VertexData();
      vd.positions = chunk.positions;
      vd.normals = chunk.normals;
      vd.uvs = chunk.uvs;
      vd.indices = chunk.indices;
      const leaf = new Mesh(`support_leaf_${seed}_${i}`, scene);
      vd.applyToMesh(leaf);
      leaf.material = node.yellowing > 0.4 ? yellowLeafMat : baseLeafMat;
      leaf.parent = root;
      leaf.position = new Vector3(0, heightM, 0);
      leaf.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), azimuthRad).multiply(
        Quaternion.RotationAxis(new Vector3(0, 0, 1), -droopRad)
      );
      currentMeshes.push(leaf);

      // Fruits — just spheres, no peduncle/pedicel/flower geometry
      if (node.truss && node.truss.fruits.length > 0) {
        const trussAz = azimuthRad + Math.PI;
        for (let f = 0; f < node.truss.fruits.length; f++) {
          const fruit = node.truss.fruits[f];
          if (fruit.diameterMm < 6) continue; // too small to bother
          const fruitMat = fruitMats[Math.min(5, fruit.ripenStage)];
          const fruitMesh = MeshBuilder.CreateSphere(
            `support_fruit_${seed}_${i}_${f}`,
            { diameter: fruit.diameterMm / 1000, segments: 8 },
            scene
          );
          fruitMesh.parent = root;
          const dx = Math.cos(trussAz) * (0.06 + f * 0.022);
          const dz = Math.sin(trussAz) * (0.06 + f * 0.022);
          const dy = heightM - 0.04 - f * 0.02;
          fruitMesh.position = new Vector3(dx, dy, dz);
          fruitMesh.material = fruitMat;
          currentMeshes.push(fruitMesh);
        }
      }
    }
  }

  return {
    root,
    update(day, healthLabel) {
      // Stagger rebuilds via per-plant offset so 29 supporting plants
      // don't all dispose+rebuild on the same frame.
      const adjusted = day + rebuildOffset;
      if (Math.abs(adjusted - lastBuildDay) < REBUILD_THRESHOLD_DAYS) return;
      lastBuildDay = adjusted;
      const { envOverride, stress } = healthLabelToInputs(healthLabel);
      const state = engine.computeState(seed, day, envOverride, stress);
      buildFromState(state);
    },
    setVisible(v) {
      root.setEnabled(v);
    },
    currentState: () => lastState,
  };
}
