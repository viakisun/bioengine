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
import { getCalyxSourceMesh, getStemSourceMesh } from '../plant/FruitGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';

export interface SupportingPlantHandle {
  root: TransformNode;
  update: (day: number, healthLabel?: HealthLabel, waterStressOverride?: number) => void;
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

// Shared peduncle material — single thin cylinder hanging from each
// truss node so the cluster looks attached to the plant.
let cachedPeduncleMat: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getPeduncleMat(scene: Scene): PBRMaterial {
  let m = cachedPeduncleMat.get(scene);
  if (!m) {
    m = new PBRMaterial('supportPeduncleMat', scene);
    m.albedoColor = Color3.FromHexString('#4a8a30');
    m.metallic = 0;
    m.roughness = 0.85;
    cachedPeduncleMat.set(scene, m);
  }
  return m;
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
  const peduncleMat = getPeduncleMat(scene);

  let currentMeshes: Mesh[] = [];
  let currentTrussNodes: TransformNode[] = [];
  let lastState: PlantState | null = null;
  let lastBuildDay = -999;
  let lastOverride = 0;
  const REBUILD_THRESHOLD_DAYS = 2.0; // coarser — these are background plants

  function disposeAll() {
    for (const m of currentMeshes) m.dispose(false, false);
    currentMeshes = [];
    // TransformNode.dispose(false, true) disposes the node AND all its
    // child meshes — the truss generator creates many child meshes
    // (peduncle, pedicels, fruits, sepals) that all need to go.
    for (const n of currentTrussNodes) n.dispose(false, true);
    currentTrussNodes = [];
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

    // Leaves — every-other node (re-enabled after PLANT_COUNT 30 → 90
    // tripled the load). 90 plants × every-node was pushing fps below
    // 60; every-other-node × 90 plants is close to the previous
    // 30 plants × every-node and the visual density is maintained
    // because there are 3× more plants in the same bed length.
    for (let i = 0; i < state.nodes.length; i += 2) {
      const node = state.nodes[i];
      if (node.leafMaturity < 0.1) continue;

      // Plan 4 — skeleton-aware position. node.position 의 X/Y/Z 사용
      // (이전엔 heightM 만, X/Z 0 절대좌표). lush mesh ↔ skeleton 일치.
      const nodeX = node.position.x;
      const nodeY = node.position.y;
      const nodeZ = node.position.z;
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
      leaf.position = new Vector3(nodeX, nodeY, nodeZ);
      leaf.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), azimuthRad).multiply(
        Quaternion.RotationAxis(new Vector3(0, 0, 1), -droopRad)
      );
      currentMeshes.push(leaf);

      // Truss — peduncle + clustered fruits.
      //
      // Earlier this rendered fruits in a straight line which read as a
      // "string of beads"; tried full createTrussNode (peduncle + N
      // pedicels + sepals + flowers per fruit) but at 12 trusses × 29
      // plants × ~25 meshes/truss it dropped fps from 120 → 16.
      //
      // Middle path: one shared peduncle cylinder + fruits clustered in
      // a small radial group around its tip. Costs ~ N fruits + 1 cyl
      // per truss (was N spheres before, ~30× cheaper than full truss).
      if (node.truss && node.truss.fruits.length > 0) {
        const trussAz = azimuthRad + Math.PI;
        const ripeFruits = node.truss.fruits.filter((f) => f.diameterMm >= 6);
        if (ripeFruits.length > 0) {
          // Peduncle: short cylinder lateral from stem, slight downward droop.
          const pedLen = 0.06 + Math.min(0.05, ripeFruits.length * 0.008);
          const peduncle = MeshBuilder.CreateCylinder(
            `support_ped_${seed}_${i}`,
            { height: pedLen, diameter: 0.005, tessellation: 5 },
            scene
          );
          peduncle.parent = root;
          peduncle.material = peduncleMat;
          peduncle.rotation.z = -Math.PI / 2 + 0.15;
          peduncle.rotation.y = trussAz;
          const pedMidR = pedLen / 2;
          // Anchor peduncle at node's actual 3D position, not absolute Y.
          peduncle.position = new Vector3(
            nodeX + Math.cos(trussAz) * pedMidR,
            nodeY - 0.03,
            nodeZ + Math.sin(trussAz) * pedMidR,
          );
          currentMeshes.push(peduncle);

          // Cluster fruits around peduncle tip with bounded radial offsets,
          // not in a line. Seeded RNG so the layout is stable across rebuilds.
          const fruitRng = new SeededRandom(seed * 7919 + i * 31);
          const cx = nodeX + Math.cos(trussAz) * pedLen;
          const cz = nodeZ + Math.sin(trussAz) * pedLen;
          const cy = nodeY - 0.05 - pedLen * 0.15;
          // Supporting plants use a lightweight sphere — 870 fruits
          // total wedges SwiftShader with the full FruitGenerator path.
          // We still apply the cultivar genome's H:W ratio (Y-scale)
          // so beefsteak-vs-cherry shape diversity is visible at
          // distance: flat beefsteaks vs round cherries.
          // Source meshes for calyx + stem (shared across all fruits in
          // the scene — they render as InstancedMesh, batched into one
          // draw call each). Cheaper than per-fruit custom geometry.
          const calyxSrc = getCalyxSourceMesh(scene);
          const stemSrc = getStemSourceMesh(scene);
          const fruitN = ripeFruits.length;
          // Pre-compute the largest fruit radius — clustering distance
          // scales with it so big beefsteaks don't overlap.
          let maxR = 0;
          for (const fr of ripeFruits) maxR = Math.max(maxR, fr.diameterMm / 2 / 1000);
          for (let f = 0; f < fruitN; f++) {
            const fruit = ripeFruits[f];
            const fruitMat = fruitMats[Math.min(5, fruit.ripenStage)];
            const dia = fruit.diameterMm / 1000;
            const radius = dia / 2;
            const hw = fruit.cultivarGenome?.heightWidthRatio ?? 0.9;
            const fruitMesh = MeshBuilder.CreateSphere(
              `support_fruit_${seed}_${i}_${f}`,
              { diameter: dia, segments: 10 },
              scene
            );
            fruitMesh.parent = root;
            // Oblate: scale Y by H:W ratio (beefsteak ~0.72, cherry ~0.96)
            fruitMesh.scaling = new Vector3(1, hw, 1);
            // Evenly distributed angle (i / N · 2π) + small jitter for
            // organic feel; radial distance scales with the largest
            // fruit's radius so spacing is guaranteed even for big ones.
            const baseAngle = fruitN > 1 ? (f / fruitN) * Math.PI * 2 : 0;
            const localAngle = baseAngle + (fruitRng.next() - 0.5) * 0.6;
            // Bring single-fruit + low-count clusters in toward the tip
            // so they don't fly off into empty space.
            const baseDistance = fruitN <= 1 ? 0 : Math.max(maxR * 1.15, dia * 0.5);
            const localR = baseDistance + (fruitRng.next() - 0.5) * radius * 0.4;
            const fx = cx + Math.cos(localAngle) * localR;
            const fy = cy - fruitRng.next() * radius * 0.6;
            const fz = cz + Math.sin(localAngle) * localR;
            fruitMesh.position = new Vector3(fx, fy, fz);
            fruitMesh.material = fruitMat;
            currentMeshes.push(fruitMesh);

            // Calyx instance — sits on top pole of the oblate fruit body.
            // calyxSrc geometry is normalised; scale to per-fruit radius.
            if (radius > 0.003) {
              const calyxInst = calyxSrc.createInstance(`support_calyx_${seed}_${i}_${f}`);
              calyxInst.parent = root;
              calyxInst.scaling = new Vector3(radius, radius, radius);
              // Calyx base sits at baseY=0.78 in source units; place at
              // top pole of the oblate body (Y offset = hw * radius - radius * 0.22)
              calyxInst.position = new Vector3(fx, fy, fz);
              currentMeshes.push(calyxInst as unknown as Mesh);

              // Stem stub instance — short cylinder above calyx
              const stemLenM = Math.min(0.018, Math.max(0.006, radius * 0.4));
              const stemInst = stemSrc.createInstance(`support_stem_${seed}_${i}_${f}`);
              stemInst.parent = root;
              stemInst.scaling = new Vector3(1, stemLenM, 1);
              stemInst.position = new Vector3(
                fx,
                fy + radius * hw * 0.95 + stemLenM / 2,
                fz,
              );
              currentMeshes.push(stemInst as unknown as Mesh);
            }
          }
        }
      }
    }
  }

  return {
    root,
    update(day, healthLabel, waterStressOverride = 0) {
      // Stagger rebuilds via per-plant offset so 29 supporting plants
      // don't all dispose+rebuild on the same frame. Operator slider
      // (waterStressOverride > 0) also forces an immediate rebuild
      // when it changes meaningfully, so feedback is instant.
      const adjusted = day + rebuildOffset;
      const overrideChanged = Math.abs(waterStressOverride - lastOverride) > 0.05;
      if (!overrideChanged && Math.abs(adjusted - lastBuildDay) < REBUILD_THRESHOLD_DAYS) return;
      lastBuildDay = adjusted;
      lastOverride = waterStressOverride;
      const { envOverride, stress } = healthLabelToInputs(healthLabel);
      const mergedStress: PlantStressInputs | undefined =
        waterStressOverride > 0
          ? { ...(stress ?? {}), waterStress: Math.max(stress?.waterStress ?? 0, waterStressOverride) }
          : stress;
      const state = engine.computeState(seed, day, envOverride, mergedStress);
      buildFromState(state);
    },
    setVisible(v) {
      root.setEnabled(v);
    },
    currentState: () => lastState,
  };
}
