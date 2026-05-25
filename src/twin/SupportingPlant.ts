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
  getCultivar,
  type GrowthEngine,
  type PlantState,
  type EnvironmentParams,
  type PlantStressInputs,
} from '@farmsim/tomato-engine';
import { computePlantGeometry, type PlantBase } from '../plant/PlantBase';
import type { HealthLabel } from '../data/mockScenario';
import {
  buildLeafChunk,
  buildCotyledonChunk,
} from '@farmsim/tomato-geometry';
import { getLeafMaterial, getYellowLeafMaterial, getDiseasedLeafMaterial } from '../plant/LeafGenerator';
import { createStemMesh, createStemMeshFromSegments, getStemMaterial } from '../plant/StemGenerator';
import { getCalyxSourceMesh, getStemSourceMesh } from '../plant/FruitGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';

export interface SupportingPlantHandle {
  root: TransformNode;
  update: (day: number, healthLabel?: HealthLabel, waterStressOverride?: number) => void;
  setVisible: (v: boolean) => void;
  currentState: () => PlantState | null;
  /** 모든 mesh / truss TransformNode / root 해제. After dispose 호출 금지. */
  dispose: () => void;
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

  function buildFromState(state: PlantState, plantBase: PlantBase) {
    disposeAll();
    lastState = state;

    if (state.nodes.length === 0 && !state.hasCotyledons) return;

    const genome = engine.getGenome(seed)!;
    const baseAxis = plantBase.mainAxis;

    // Cotyledons — from PlantBase (single threshold, unified with main view).
    for (const cot of plantBase.cotyledons) {
      if (!cot.visibility.visible) continue;
      const chunk = buildCotyledonChunk({ size: cot.sizeM, segments: 4 });
      const vd = new VertexData();
      vd.positions = chunk.positions;
      vd.normals = chunk.normals;
      vd.uvs = chunk.uvs;
      vd.indices = chunk.indices;
      const mesh = new Mesh(`support_cot_${seed}_${cot.side}`, scene);
      vd.applyToMesh(mesh);
      mesh.parent = root;
      mesh.position = new Vector3(cot.position.x, cot.position.y, cot.position.z);
      mesh.rotation = new Vector3(-0.3 * cot.side, cot.side * 0.5, 0);
      mesh.material = cotMat;
      currentMeshes.push(mesh);
    }

    // Stem — same Frenet generator but driven by PlantBase StemSegment[].
    if (baseAxis.stemCurve.length >= 2) {
      const stem = createStemMeshFromSegments(`support_stem_${seed}`, scene, baseAxis.stemCurve);
      if (stem) {
        stem.parent = root;
        stem.material = stemMat;
        currentMeshes.push(stem);
      }
    }

    const isDiseased = state.diseaseLoad > 0.3;
    const baseLeafMat = isDiseased ? diseasedLeafMat : leafMat;

    // Leaves — every-other PlantBase leaf (LOD: sampling lives in the
    // view, not in PlantBase). Visibility/position/azimuth from PlantBase.
    for (let li = 0; li < baseAxis.leaves.length; li += 2) {
      const leafBase = baseAxis.leaves[li];
      // Supporting plant uses a stricter visibility floor than the main
      // view because background canopy detail isn't worth the meshes.
      if (!leafBase.visibility.visible) continue;
      const node = state.nodes[leafBase.nodeIdx];
      if (!node || node.leafMaturity < 0.1) continue;

      // Leaf blade 는 petiole tip 에서 시작 (lush mode 와 동일 시각).
      // Supporting plant 는 LOD — petiole tube 는 생략하고 blade 위치만
      // tip 으로 옮겨 stem → blade 의 자연 거리 확보 (mesh 수 동일).
      const tip = leafBase.petioleCurve && leafBase.petioleCurve.length > 0
        ? leafBase.petioleCurve[leafBase.petioleCurve.length - 1]
        : leafBase.attachPosition;
      const nodeX = tip.x;
      const nodeY = tip.y;
      const nodeZ = tip.z;
      const azimuthRad = leafBase.azimuthRad;
      const droopRad = leafBase.droopRad;
      const i = leafBase.nodeIdx;

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

      // (Truss rendering moved to a dedicated loop below — every-other
      // leaf would have skipped some truss-bearing nodes.)
    }

    // === Trusses ===
    // v4.1 LOD — PlantBase.floralSites 가 fruitCenter 등 정확한 world
    // 위치 제공. SupportingPlant 는 peduncle 단순 cylinder + per-site
    // fruit sphere + calyx instance. fruit 위치 = site.fruit.fruitCenter
    // (계산 안 함, PlantBase 가 결정).
    for (const trussBase of baseAxis.trusses) {
      if (!trussBase.visibility.visible) continue;
      const i = trussBase.nodeIdx;

      // Peduncle: PlantBase 의 peduncleCurve 시작-끝만 잇는 cylinder LOD.
      if (trussBase.peduncleCurve && trussBase.peduncleCurve.length >= 2) {
        const ped0 = trussBase.peduncleCurve[0];
        const pedN = trussBase.peduncleCurve[trussBase.peduncleCurve.length - 1];
        const dx = pedN.x - ped0.x;
        const dy = pedN.y - ped0.y;
        const dz = pedN.z - ped0.z;
        const pedLen = Math.hypot(dx, dy, dz);
        const pedDir = new Vector3(dx / pedLen, dy / pedLen, dz / pedLen);
        const peduncle = MeshBuilder.CreateCylinder(
          `support_ped_${seed}_${i}`,
          { height: pedLen, diameter: 0.005, tessellation: 5 },
          scene,
        );
        peduncle.parent = root;
        peduncle.material = peduncleMat;
        peduncle.position = new Vector3((ped0.x + pedN.x) / 2, (ped0.y + pedN.y) / 2, (ped0.z + pedN.z) / 2);
        const yAxis = new Vector3(0, 1, 0);
        const dot = yAxis.x * pedDir.x + yAxis.y * pedDir.y + yAxis.z * pedDir.z;
        if (Math.abs(dot) < 0.999) {
          const rotAxis = Vector3.Cross(yAxis, pedDir).normalize();
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          peduncle.rotationQuaternion = Quaternion.RotationAxis(rotAxis, angle);
        }
        currentMeshes.push(peduncle);
      }

      // Per-site fruit (LOD): use PlantBase.floralSites direct world pos.
      if (!trussBase.floralSites) continue;
      const calyxSrc = getCalyxSourceMesh(scene);
      const stemSrc = getStemSourceMesh(scene);
      for (const site of trussBase.floralSites) {
        if (!site.visibility.visible) continue;
        if (!site.fruit || site.fruit.diameterMm < 6) continue; // LOD: small fruits/flowers 생략
        const fruit = site.fruit;
        const fruitMat = fruitMats[Math.min(5, fruit.ripenStage)];
        const dia = fruit.diameterMm / 1000;
        const radius = dia / 2;
        const hw = fruit.cultivarGenome?.heightWidthRatio ?? 0.9;
        const fruitMesh = MeshBuilder.CreateSphere(
          `support_fruit_${seed}_${i}_s${site.index}`,
          { diameter: dia, segments: 10 }, scene,
        );
        fruitMesh.parent = root;
        fruitMesh.scaling = new Vector3(1, hw, 1);
        fruitMesh.position = new Vector3(fruit.fruitCenter.x, fruit.fruitCenter.y, fruit.fruitCenter.z);
        fruitMesh.material = fruitMat;
        currentMeshes.push(fruitMesh);

        if (radius > 0.003) {
          const calyxInst = calyxSrc.createInstance(`support_calyx_${seed}_${i}_s${site.index}`);
          calyxInst.parent = root;
          calyxInst.scaling = new Vector3(radius, radius, radius);
          calyxInst.position = new Vector3(site.fruitTop.x, site.fruitTop.y, site.fruitTop.z);
          currentMeshes.push(calyxInst as unknown as Mesh);

          const stemLenM = Math.min(0.018, Math.max(0.006, radius * 0.4));
          const stemInst = stemSrc.createInstance(`support_stem_${seed}_${i}_s${site.index}`);
          stemInst.parent = root;
          stemInst.scaling = new Vector3(1, stemLenM, 1);
          stemInst.position = new Vector3(
            site.fruitTop.x,
            site.fruitTop.y + radius * hw * 0.95 + stemLenM / 2,
            site.fruitTop.z,
          );
          currentMeshes.push(stemInst as unknown as Mesh);
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
      const cultivarName = engine.getCultivarFor(seed)?.name ?? 'tomimaru-muchoo';
      const plantBase = computePlantGeometry(state, {
        genome: engine.getGenome(seed)!,
        cultivar: getCultivar(cultivarName),
      });
      buildFromState(state, plantBase);
    },
    setVisible(v) {
      root.setEnabled(v);
    },
    currentState: () => lastState,
    dispose() {
      // 모든 generated mesh + truss TransformNode 해제 후 root 자체도 해제.
      // GrowthEngine.removePlant 는 호출자 책임 (GreenhouseContentHandle.dispose).
      disposeAll();
      root.dispose(false, false);
      lastState = null;
    },
  };
}
