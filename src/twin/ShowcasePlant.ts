import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { SeededRandom, overlayPhysiologyFruits } from '@farmsim/tomato-engine';
import {
  createLeafMeshFromNode,
  getLeafMaterial,
  getYellowLeafMaterial,
  getDiseasedLeafMaterial,
} from '../plant/LeafGenerator';
import { createStemMesh, getStemMaterial } from '../plant/StemGenerator';
import { createTrussNode } from '../plant/TrussGenerator';
import { buildCotyledonChunk } from '@farmsim/tomato-geometry';
import type { GrowthEngine, PlantState } from '@farmsim/tomato-engine';

/**
 * Live, GrowthEngine-driven plant that rebuilds on every day-scrub.
 *
 * Reads PlantState from the engine — heights, droop, leaf mass, stem
 * radius, ripening stage — so what you see is exactly what the
 * simulation says. Renders all 6 lifecycle stages:
 *   1. Cotyledon (떡잎)  day 3–25
 *   2. Early true leaf    leafMaturity < 0.4
 *   3. Compound developing 0.4–0.7
 *   4. Compound mature    > 0.7
 *   5. Senescent          yellowing > 0.3 → yellow material
 *   6. Pruned             leafMaturity < 0.05 → skipped
 *
 * + waterStress: extra droop, picks slightly-diseased material if high
 * + diseaseLoad: swaps to brown-spotted texture
 */
export interface ShowcasePlantHandle {
  root: TransformNode;
  /**
   * Rebuild the visual. If `physiology` is provided (Single-Plant
   * Analysis mode), the truss/fruit data is overlaid from the TOMGRO
   * PhysiologyState so the visual matches the academic model. Without
   * it, the legacy sigmoid path is used (Greenhouse mode).
   */
  update: (day: number, physiology?: import('@farmsim/tomato-engine').PlantPhysiologyState) => void;
  setVisible: (v: boolean) => void;
  setSegmentationMode: (on: boolean) => void;
  currentState: () => PlantState | null;
}

interface PartGroup {
  leaves: Mesh[];
  fruits: Mesh[];
  stem: Mesh | null;
  cotyledons: Mesh[];
}

let cachedCotyledonMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getCotyledonMaterial(scene: Scene): PBRMaterial {
  let mat = cachedCotyledonMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('cotyledonMat', scene);
    mat.albedoColor = Color3.FromHexString('#4aaa30');
    mat.metallic = 0;
    mat.roughness = 0.8;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    cachedCotyledonMaterial.set(scene, mat);
  }
  return mat;
}

function applyCotyledonChunk(scene: Scene, name: string, size: number) {
  const chunk = buildCotyledonChunk({ size });
  const vd = new VertexData();
  vd.positions = chunk.positions;
  vd.normals = chunk.normals;
  vd.uvs = chunk.uvs;
  vd.indices = chunk.indices;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  return mesh;
}

export function createShowcasePlant(
  scene: Scene,
  engine: GrowthEngine,
  seed: number,
  worldPosition: Vector3
): ShowcasePlantHandle {
  const root = new TransformNode(`showcase_${seed}`, scene);
  root.position.copyFrom(worldPosition);

  const leafMat = getLeafMaterial(scene);
  const yellowLeafMat = getYellowLeafMaterial(scene);
  const diseasedLeafMat = getDiseasedLeafMaterial(scene);
  const cotyledonMat = getCotyledonMaterial(scene);
  const stemMat = getStemMaterial(scene);

  let currentMeshes: Mesh[] = [];
  let currentTransformNodes: TransformNode[] = [];
  let currentParts: PartGroup = { leaves: [], fruits: [], stem: null, cotyledons: [] };
  let lastState: PlantState | null = null;
  let lastBuildDay = -999;
  const REBUILD_THRESHOLD_DAYS = 0.5;

  // Highlight layer for segmentation-mode color outlines
  const highlight = new HighlightLayer('showcase_hl', scene);
  highlight.innerGlow = false;
  highlight.outerGlow = true;
  highlight.blurHorizontalSize = 0.6;
  highlight.blurVerticalSize = 0.6;

  let segmentationOn = false;
  function applySegmentationHighlights() {
    highlight.removeAllMeshes();
    if (!segmentationOn) return;
    for (const leaf of currentParts.leaves) {
      highlight.addMesh(leaf, Color3.FromHexString('#6ee7b7'));
    }
    for (const fruit of currentParts.fruits) {
      highlight.addMesh(fruit, Color3.FromHexString('#fbbf24'));
    }
    if (currentParts.stem) {
      highlight.addMesh(currentParts.stem, Color3.FromHexString('#60a5fa'));
    }
  }

  function disposeAll() {
    // BUG fix: previously called dispose(false, true) which means
    // "doNotRecurse=false, disposeMaterialAndTextures=true". The shared
    // leafMat / stemMat / cotyledonMat are looked up via WeakMap caches
    // (LeafGenerator.getLeafMaterial, etc.) and reused across every
    // plant in the scene. Disposing them here killed the material on
    // every rebuild, so after the first rebuild the leaves rendered
    // against a disposed material and degenerated visually (user
    // observation: "first load shows leaves, scrubbing the timeline
    // makes them disappear").
    //
    // Pass `disposeMaterialAndTextures = false`. Material lifecycle is
    // owned by the LeafGenerator caches, not by individual meshes.
    for (const m of currentMeshes) m.dispose(false, false);
    for (const n of currentTransformNodes) {
      for (const child of n.getChildMeshes(false)) child.dispose(false, false);
      n.dispose(false, false);
    }
    currentMeshes = [];
    currentTransformNodes = [];
    currentParts = { leaves: [], fruits: [], stem: null, cotyledons: [] };
    highlight.removeAllMeshes();
  }

  function buildFromState(state: PlantState) {
    disposeAll();
    lastState = state;

    if (state.nodes.length === 0 && !state.hasCotyledons) return;

    const genome = engine.getGenome(seed)!;

    // === Cotyledons (떡잎) ===
    // Two opposing planes that fade in (day 3-8), peak (8-15), fade out (15-25).
    if (state.hasCotyledons && state.cotyledonSize > 0.01) {
      const cotSize = 0.03 * state.cotyledonSize; // ~3cm at peak (was 0.015×2)
      const cotY = state.nodes.length > 0
        ? (state.nodes[0].heightCm / 100) * 0.3
        : 0.03;
      for (const side of [-1, 1] as const) {
        const cot = applyCotyledonChunk(
          scene,
          `showcase_cot_${seed}_${side}`,
          cotSize
        );
        cot.parent = root;
        cot.position = new Vector3(side * cotSize * 0.5, cotY, 0);
        // tilt slightly outward + face up
        cot.rotation = new Vector3(-0.3 * side, side * 0.5, 0);
        cot.material = cotyledonMat;
        // Fade alpha as cotyledon shrinks past peak
        cotyledonMat.alpha = Math.max(0.5, Math.min(1, state.cotyledonSize * 1.4));
        cotyledonMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
        currentMeshes.push(cot);
        currentParts.cotyledons.push(cot);
      }
    }

    // === Stem ===
    if (state.nodes.length >= 2) {
      const stemRng = new SeededRandom(seed * 13);
      const stem = createStemMesh(`showcase_stem_${seed}`, scene, state.nodes, stemRng);
      if (stem) {
        stem.parent = root;
        stem.material = stemMat;
        currentMeshes.push(stem);
        currentParts.stem = stem;
      }
    }

    // Select effective leaf material per plant-level health
    const isDiseased = state.diseaseLoad > 0.3;
    const leafMatForPlant = isDiseased ? diseasedLeafMat : leafMat;

    // === Leaves (per node) ===
    for (const node of state.nodes) {
      if (node.leafMaturity < 0.05) continue;

      const heightM = node.heightCm / 100;
      const azimuthRad = (node.phyllotaxisAngle * Math.PI) / 180;
      const droopRad = (node.droopExtra * Math.PI) / 180;

      const rng = new SeededRandom(seed * 1000 + node.index * 13 + 7);
      const leaf = createLeafMeshFromNode(
        `showcase_leaf_${seed}_${node.index}`,
        scene,
        node,
        genome,
        state.day,
        rng
      );
      // Senescent (yellow) > diseased > normal
      leaf.material = node.yellowing > 0.4
        ? yellowLeafMat
        : leafMatForPlant;
      leaf.parent = root;
      leaf.position = new Vector3(0, heightM, 0);

      const q = Quaternion.RotationAxis(Vector3.Up(), azimuthRad).multiply(
        Quaternion.RotationAxis(new Vector3(0, 0, 1), -droopRad)
      );
      leaf.rotationQuaternion = q;
      currentMeshes.push(leaf);
      currentParts.leaves.push(leaf);

      // Truss
      if (node.truss && (node.truss.fruits.length > 0 || node.truss.flowers.length > 0)) {
        const trussRng = new SeededRandom(seed * 7919 + node.index * 31);
        const trussNode = createTrussNode(
          `showcase_truss_${seed}_${node.index}`,
          scene,
          node.truss,
          genome,
          azimuthRad + Math.PI,
          trussRng
        );
        trussNode.parent = root;
        trussNode.position = new Vector3(0, heightM - 0.02, 0);

        trussNode.getChildMeshes().forEach((m) => {
          if (m.name.includes('_body')) {
            currentParts.fruits.push(m as Mesh);
          }
        });
        currentTransformNodes.push(trussNode);
      }
    }

    applySegmentationHighlights();
  }

  return {
    root,
    update(day, physiology) {
      // Single-plant mode (physiology supplied): always rebuild —
      // ignore the day-threshold throttle so 1-minute scrubs visibly
      // update fruit color/size. The mesh rebuild is light enough at
      // 1 plant.
      if (!physiology && Math.abs(day - lastBuildDay) < REBUILD_THRESHOLD_DAYS) return;
      lastBuildDay = day;
      let state = engine.computeState(seed, day);
      if (physiology) {
        // Overlay TOMGRO truss/fruit data onto the sigmoid base state.
        state = overlayPhysiologyFruits(state, physiology);
      }
      buildFromState(state);
    },
    setVisible(v) {
      root.setEnabled(v);
    },
    setSegmentationMode(on) {
      if (segmentationOn === on) return;
      segmentationOn = on;
      applySegmentationHighlights();
    },
    currentState: () => lastState,
  };
}
