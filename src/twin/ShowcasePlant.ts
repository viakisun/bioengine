import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { SeededRandom } from '@farmsim/tomato-engine';
import { createLeafMeshFromNode, getLeafMaterial, getYellowLeafMaterial } from '../plant/LeafGenerator';
import { createStemMesh, getStemMaterial } from '../plant/StemGenerator';
import { createTrussNode } from '../plant/TrussGenerator';
import type { GrowthEngine } from '@farmsim/tomato-engine';
import type { PlantState } from '@farmsim/tomato-engine';

/**
 * Live, GrowthEngine-driven plant that rebuilds on every day-scrub.
 * Reads the full NodeState from the engine — heights, droop, leaf mass,
 * stem radius from physics — so what you see is exactly what the
 * simulation says. Used for the showcase plant; the other 29 plants
 * keep the cheaper static foliage.
 */
export interface ShowcasePlantHandle {
  root: TransformNode;
  update: (day: number) => void;
  setVisible: (v: boolean) => void;
  setSegmentationMode: (on: boolean) => void;
  currentState: () => PlantState | null;
}

interface PartGroup {
  leaves: Mesh[];
  fruits: Mesh[];
  stem: Mesh | null;
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
  const stemMat = getStemMaterial(scene);

  let currentMeshes: Mesh[] = [];
  let currentTransformNodes: TransformNode[] = [];
  let currentParts: PartGroup = { leaves: [], fruits: [], stem: null };
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
    for (const m of currentMeshes) m.dispose(false, true);
    // Recursively dispose all child meshes + materials under truss nodes
    for (const n of currentTransformNodes) {
      for (const child of n.getChildMeshes(false)) child.dispose(false, true);
      n.dispose(false, true);
    }
    currentMeshes = [];
    currentTransformNodes = [];
    currentParts = { leaves: [], fruits: [], stem: null };
    highlight.removeAllMeshes();
  }

  function buildFromState(state: PlantState) {
    disposeAll();
    lastState = state;

    if (state.nodes.length === 0) return;

    // Stem: physics-driven curved tube with vertex-color woodiness
    const stemRng = new SeededRandom(seed * 13);
    const stem = createStemMesh(`showcase_stem_${seed}`, scene, state.nodes, stemRng);
    if (stem) {
      stem.parent = root;
      stem.material = stemMat;
      currentMeshes.push(stem);
      currentParts.stem = stem;
    }

    // Leaves: one mesh per node (created from NodeState)
    for (const node of state.nodes) {
      if (node.leafMaturity < 0.05) continue;

      const heightM = node.heightCm / 100;
      const azimuthRad = (node.phyllotaxisAngle * Math.PI) / 180;
      const droopRad = (node.droopExtra * Math.PI) / 180;

      // Two-sided pinnate compound leaf: emerges from node, two sides
      // dictated by phyllotaxis. For PoC we put one leaf per node
      // along the phyllotaxis direction.
      const rng = new SeededRandom(seed * 1000 + node.index * 13 + 7);
      const leaf = createLeafMeshFromNode(
        `showcase_leaf_${seed}_${node.index}`,
        scene,
        node,
        engine.getGenome(seed)!,
        rng
      );
      leaf.material = node.yellowing > 0.4 ? yellowLeafMat : leafMat;
      leaf.parent = root;
      leaf.position = new Vector3(0, heightM, 0);

      // Build orientation: azimuth around Y, then droop around Z (negative)
      const q = Quaternion.RotationAxis(Vector3.Up(), azimuthRad).multiply(
        Quaternion.RotationAxis(new Vector3(0, 0, 1), -droopRad)
      );
      leaf.rotationQuaternion = q;
      currentMeshes.push(leaf);
      currentParts.leaves.push(leaf);

      // Truss with fruits/flowers — ported TrussGenerator
      if (node.truss && (node.truss.fruits.length > 0 || node.truss.flowers.length > 0)) {
        const trussRng = new SeededRandom(seed * 7919 + node.index * 31);
        const trussNode = createTrussNode(
          `showcase_truss_${seed}_${node.index}`,
          scene,
          node.truss,
          engine.getGenome(seed)!,
          azimuthRad + Math.PI,
          trussRng
        );
        trussNode.parent = root;
        trussNode.position = new Vector3(0, heightM - 0.02, 0);

        // Collect fruit body meshes for highlight; track the truss node for dispose
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
    update(day) {
      if (Math.abs(day - lastBuildDay) < REBUILD_THRESHOLD_DAYS) return;
      lastBuildDay = day;
      const state = engine.computeState(seed, day);
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
