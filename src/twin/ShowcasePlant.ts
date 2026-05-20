import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { SeededRandom } from '../utils/SeededRandom';
import { createLeafMeshFromNode, getLeafMaterial, getYellowLeafMaterial } from '../plant/LeafGenerator';
import { createStemMesh, getStemMaterial } from '../plant/StemGenerator';
import type { GrowthEngine } from '../simulation/GrowthEngine';
import type { PlantState, NodeState } from '../simulation/GrowthModel';

const TOMATO_RIPEN_COLORS = [
  '#3c8a30', '#8c9432', '#b9683c', '#d25240', '#c83228', '#a02218',
];

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
  currentState: () => PlantState | null;
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
  let lastState: PlantState | null = null;
  let lastBuildDay = -999;
  const REBUILD_THRESHOLD_DAYS = 0.5;

  function disposeAll() {
    for (const m of currentMeshes) m.dispose();
    currentMeshes = [];
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

      // Truss with fruits (if any)
      if (node.truss && node.truss.fruits.length > 0) {
        const trussAz = azimuthRad + Math.PI; // opposite to leaf
        for (let f = 0; f < node.truss.fruits.length; f++) {
          const fruit = node.truss.fruits[f];
          const fruitSizeM = fruit.diameterMm / 1000;
          const fruitMesh = MeshBuilder.CreateSphere(
            `showcase_fruit_${seed}_${node.index}_${f}`,
            { diameter: fruitSizeM, segments: 12 },
            scene
          );
          fruitMesh.parent = root;
          const dropX = Math.cos(trussAz) * (0.08 + f * 0.02);
          const dropZ = Math.sin(trussAz) * (0.08 + f * 0.02);
          const dropY = heightM - 0.04 - f * 0.025;
          fruitMesh.position = new Vector3(dropX, dropY, dropZ);

          const fruitMat = new PBRMaterial(
            `showcase_fruit_mat_${seed}_${node.index}_${f}`,
            scene
          );
          const colorHex = TOMATO_RIPEN_COLORS[Math.min(5, fruit.ripenStage)];
          fruitMat.albedoColor = Color3.FromHexString(colorHex);
          fruitMat.metallic = 0;
          fruitMat.roughness = 0.28;
          fruitMat.clearCoat.isEnabled = true;
          fruitMat.clearCoat.intensity = 0.45;
          fruitMat.clearCoat.roughness = 0.12;
          fruitMesh.material = fruitMat;
          currentMeshes.push(fruitMesh);
        }
      }
    }
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
    currentState: () => lastState,
  };
}
