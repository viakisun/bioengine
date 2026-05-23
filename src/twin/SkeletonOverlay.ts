// SkeletonOverlay — wireframe + node-marker visualization of the plant's
// growth skeleton (Plan 3a). Lightweight LinesMesh + small spheres so
// the renderer doesn't choke when toggling on a fully-grown plant.
//
// What's rendered:
//   • Per StemAxis: a polyline through node positions, drawn as a
//     LinesMesh segmented at each node. Color by branchOrder.
//   • A small sphere at each node, color-coded by budState
//     (dormant=skyblue, growing=lime, pruned=grey). Apex = yellow.
//   • Truss-bearing nodes get an extra small red dot.
//
// Invariant: no straight internodes. Each internode is rendered as a
// segment between two consecutive node.position values. Wandering
// directions (from GrowthModel.synthesizeGrowthDir) make the line read
// as natural growth.
//
// All meshes are children of a single TransformNode so setVisible toggles
// the whole overlay in one call. Defensive against null state, empty
// axes, and NaN positions.

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/Builders/sphereBuilder';
import '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { PlantState, StemAxis, NodeState } from '@farmsim/tomato-engine';

export interface SkeletonOverlayHandle {
  update: (plant: PlantState) => void;
  setVisible: (v: boolean) => void;
  dispose: () => void;
}

interface MatBucket {
  dotDormant: StandardMaterial;
  dotGrowing: StandardMaterial;
  dotPruned: StandardMaterial;
  apex: StandardMaterial;
  truss: StandardMaterial;
  leaf: StandardMaterial;
  fruit: StandardMaterial;
}

function makeMaterials(scene: Scene): MatBucket {
  const m = (name: string, hex: string, emissive = 0.85): StandardMaterial => {
    const mat = new StandardMaterial(name, scene);
    const c = Color3.FromHexString(hex);
    mat.diffuseColor = c;
    mat.emissiveColor = c.scale(emissive);
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    mat.disableLighting = true;
    return mat;
  };
  return {
    dotDormant: m('skel_dot_dormant', '#7ab7d8'),
    dotGrowing: m('skel_dot_growing', '#5fdf6a'),
    dotPruned: m('skel_dot_pruned', '#888888', 0.5),
    apex: m('skel_apex', '#f5d63a', 1.0),
    truss: m('skel_truss', '#cc2b2b'),
    leaf: m('skel_leaf', '#5fa050'),
    fruit: m('skel_fruit', '#e08070'),
  };
}

const LEAF_COLOR = new Color4(0.35, 0.65, 0.30, 1);    // green stub
const PEDUNCLE_COLOR = new Color4(0.5, 0.7, 0.35, 1);  // light green
const PEDICEL_COLOR = new Color4(0.8, 0.4, 0.4, 1);    // pink-red

function axisColor(order: number): Color4 {
  if (order === 0) return new Color4(0.45, 0.30, 0.18, 1);     // brown
  if (order === 1) return new Color4(0.85, 0.50, 0.20, 1);     // orange
  return new Color4(0.85, 0.25, 0.25, 1);                       // red
}

function isFiniteVec(p: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

export function createSkeletonOverlay(scene: Scene): SkeletonOverlayHandle {
  // Lazy: don't allocate the root + materials until the user actually
  // toggles skeleton mode ON. createShowcasePlant runs at scene build
  // and we don't want to register 5 StandardMaterials + 1 TransformNode
  // on every page load when skeleton view is rarely used.
  let root: TransformNode | null = null;
  let mats: MatBucket | null = null;
  const meshes: Mesh[] = [];
  let visible = false;

  function ensureInit() {
    if (root) return;
    root = new TransformNode('skeletonOverlayRoot', scene);
    mats = makeMaterials(scene);
    root.setEnabled(false);
  }

  function clearMeshes() {
    for (const m of meshes) m.dispose();
    meshes.length = 0;
  }

  function nodeWorld(node: NodeState): Vector3 {
    return new Vector3(node.position.x, node.position.y, node.position.z);
  }

  function drawAxis(axis: StemAxis, axisIdx: number) {
    if (!axis || !axis.nodes || axis.nodes.length < 1) return;
    if (!root || !mats) return;

    // Skeleton polyline (one LinesMesh per axis).
    const points: Vector3[] = [];
    if (axis.order === 0) points.push(new Vector3(0, 0, 0));
    for (const n of axis.nodes) {
      if (!n.position || !isFiniteVec(n.position)) continue;
      points.push(nodeWorld(n));
    }
    if (points.length >= 2) {
      const lines = MeshBuilder.CreateLines(
        `skel_lines_a${axisIdx}`,
        { points, colors: points.map(() => axisColor(axis.order)) },
        scene,
      );
      lines.parent = root;
      meshes.push(lines);
    }

    // Per-node markers + leaf petiole + truss anatomy
    const lastIdx = axis.nodes.length - 1;
    for (let i = 0; i < axis.nodes.length; i++) {
      const node = axis.nodes[i];
      if (!node.position || !isFiniteVec(node.position)) continue;
      const isApex = i === lastIdx;
      const isTruss = node.truss !== null;

      let dotMat: StandardMaterial;
      let radius: number;
      if (isApex) {
        dotMat = mats.apex;
        radius = 0.014;
      } else {
        switch (node.budState) {
          case 'growing': dotMat = mats.dotGrowing; radius = 0.011; break;
          case 'pruned':  dotMat = mats.dotPruned;  radius = 0.008; break;
          default:        dotMat = mats.dotDormant; radius = 0.008;
        }
      }

      const sphere = MeshBuilder.CreateSphere(
        `skel_node_a${axisIdx}_n${i}`,
        { diameter: radius * 2, segments: 6 },
        scene,
      );
      const nodePos = nodeWorld(node);
      sphere.position = nodePos;
      sphere.material = dotMat;
      sphere.parent = root;
      meshes.push(sphere);

      // ── Petiole stub — a short line from node in leaf's azimuth.
      //    Length scales with leafSizeFactor (mature leaves stick out).
      if (node.leafMaturity > 0.05 && axis.order === 0) {
        const leafAzimuth = (node.phyllotaxisAngle * Math.PI) / 180;
        // Petiole droops with droopExtra (degrees → radians).
        const droopRad = (node.droopExtra * Math.PI) / 180;
        const petLen = 0.12 * Math.max(0.3, node.leafSizeFactor);
        const tip = new Vector3(
          nodePos.x + Math.cos(leafAzimuth) * petLen * Math.cos(droopRad * 0.6),
          nodePos.y - petLen * Math.sin(droopRad * 0.6),
          nodePos.z + Math.sin(leafAzimuth) * petLen * Math.cos(droopRad * 0.6),
        );
        const pet = MeshBuilder.CreateLines(
          `skel_pet_a${axisIdx}_n${i}`,
          { points: [nodePos, tip], colors: [LEAF_COLOR, LEAF_COLOR] },
          scene,
        );
        pet.parent = root;
        meshes.push(pet);
        // Small green dot at petiole tip = leaf blade center
        const leafDot = MeshBuilder.CreateSphere(
          `skel_leafdot_a${axisIdx}_n${i}`,
          { diameter: 0.012, segments: 6 },
          scene,
        );
        leafDot.position = tip;
        leafDot.material = mats.leaf;
        leafDot.parent = root;
        meshes.push(leafDot);
      }

      // ── Truss skeleton: rachis (peduncle) + per-fruit pedicels.
      if (isTruss && node.truss && axis.order === 0) {
        // Truss emerges opposite to leaf (180° off phyllotaxis).
        const trussAz = (node.phyllotaxisAngle * Math.PI) / 180 + Math.PI;
        const rachisLen = 0.10 + Math.min(0.10, node.truss.fruits.length * 0.012);
        const rachisTip = new Vector3(
          nodePos.x + Math.cos(trussAz) * rachisLen,
          nodePos.y - rachisLen * 0.18,  // slight droop
          nodePos.z + Math.sin(trussAz) * rachisLen,
        );
        const rachis = MeshBuilder.CreateLines(
          `skel_rachis_a${axisIdx}_n${i}`,
          { points: [nodePos, rachisTip], colors: [PEDUNCLE_COLOR, PEDUNCLE_COLOR] },
          scene,
        );
        rachis.parent = root;
        meshes.push(rachis);

        // Per-fruit pedicel — curved (3 sub-points, cantilever droop) +
        // calyx 5-ray star at the fruit attachment. *직선 금지 invariant*
        // applies to pedicels too — fruit weight droops them parabolic.
        const fruits = node.truss.fruits;
        for (let f = 0; f < fruits.length; f++) {
          const alongT = (f + 0.5) / Math.max(1, fruits.length);
          const onRachis = new Vector3(
            nodePos.x + Math.cos(trussAz) * rachisLen * alongT,
            nodePos.y - rachisLen * 0.18 * alongT,
            nodePos.z + Math.sin(trussAz) * rachisLen * alongT,
          );
          // Pedicel length & X-jitter (alternate sides for visual spread)
          const sideJit = (f % 2 === 0 ? 0.012 : -0.012);
          const pedLen = 0.038;  // 38mm pedicel — real tomato spec range
          // Fruit weight (proxy: diameter) → more droop
          const dia = (fruits[f].diameterMm ?? 30);
          const droopY = Math.min(0.018, 0.005 + dia / 60 * 0.013);
          // Two intermediate points along the pedicel — parabolic cantilever.
          //   p0 = rachis attach (no droop)
          //   p1 = abscission joint (slight droop, slight lateral)
          //   p2 = calyx (full droop, full lateral)
          //   p3 = fruit center (calyx → fruit transition)
          const p1 = new Vector3(
            onRachis.x + sideJit * 0.35,
            onRachis.y - droopY * 0.25,
            onRachis.z,
          );
          const p2 = new Vector3(
            onRachis.x + sideJit * 0.75,
            onRachis.y - droopY * 0.65,
            onRachis.z + sideJit * 0.2,
          );
          const fruitPos = new Vector3(
            onRachis.x + sideJit,
            onRachis.y - droopY - pedLen * 0.5,
            onRachis.z,
          );
          const ped = MeshBuilder.CreateLines(
            `skel_ped_a${axisIdx}_n${i}_f${f}`,
            {
              points: [onRachis, p1, p2, fruitPos],
              colors: [PEDICEL_COLOR, PEDICEL_COLOR, PEDICEL_COLOR, PEDICEL_COLOR],
            },
            scene,
          );
          ped.parent = root;
          meshes.push(ped);

          // Abscission joint (꼭지 마디) — small dot at p2
          const absciss = MeshBuilder.CreateSphere(
            `skel_abs_a${axisIdx}_n${i}_f${f}`,
            { diameter: 0.005, segments: 4 },
            scene,
          );
          absciss.position = p2;
          absciss.material = mats.truss;
          absciss.parent = root;
          meshes.push(absciss);

          // Calyx star — 5 small radial lines at fruit attachment.
          //   Real tomato has 5 sepals fanning ~25° out from pedicel.
          const calyxLen = 0.012;
          // Direction from p2 (calyx base) → fruitPos (fruit center).
          const downDir = fruitPos.subtract(p2).normalize();
          // Pick a perpendicular basis for the 5 rays around the pedicel.
          const perp = Math.abs(downDir.y) < 0.95
            ? Vector3.Cross(downDir, new Vector3(0, 1, 0)).normalize()
            : new Vector3(1, 0, 0);
          const perp2 = Vector3.Cross(downDir, perp).normalize();
          for (let s = 0; s < 5; s++) {
            const theta = (s / 5) * Math.PI * 2;
            // 25° outward tilt + 8° random jitter per sepal
            const outward = Math.sin((25 * Math.PI) / 180);
            const dir = downDir.scale(-Math.cos((25 * Math.PI) / 180))
              .add(perp.scale(Math.cos(theta) * outward))
              .add(perp2.scale(Math.sin(theta) * outward))
              .normalize();
            const tip = fruitPos.add(dir.scale(calyxLen));
            const sepal = MeshBuilder.CreateLines(
              `skel_calyx_a${axisIdx}_n${i}_f${f}_s${s}`,
              { points: [fruitPos, tip], colors: [LEAF_COLOR, LEAF_COLOR] },
              scene,
            );
            sepal.parent = root;
            meshes.push(sepal);
          }

          // Fruit body dot
          const fruitDiam = 0.010 + 0.014 * Math.min(1, dia / 60);
          const fr = MeshBuilder.CreateSphere(
            `skel_fr_a${axisIdx}_n${i}_f${f}`,
            { diameter: fruitDiam, segments: 6 },
            scene,
          );
          fr.position = fruitPos;
          fr.material = mats.fruit;
          fr.parent = root;
          meshes.push(fr);
        }

        // Truss marker dot at rachis base
        const trMarker = MeshBuilder.CreateSphere(
          `skel_truss_a${axisIdx}_n${i}`,
          { diameter: 0.010, segments: 6 },
          scene,
        );
        trMarker.position = nodePos;
        trMarker.material = mats.truss;
        trMarker.parent = root;
        meshes.push(trMarker);
      }
    }
  }

  return {
    update(plant: PlantState) {
      // Guard: defensive against partially-built state on first frame.
      if (!visible) {
        if (meshes.length > 0) clearMeshes();
        return;
      }
      if (!plant || !plant.allAxes || plant.allAxes.length === 0) {
        clearMeshes();
        return;
      }
      clearMeshes();
      try {
        for (let i = 0; i < plant.allAxes.length; i++) {
          drawAxis(plant.allAxes[i], i);
        }
      } catch (err) {
        console.error('[SkeletonOverlay] draw failed:', err);
        clearMeshes();
      }
    },
    setVisible(v: boolean) {
      visible = v;
      if (v) ensureInit();
      if (root) root.setEnabled(v);
    },
    dispose() {
      clearMeshes();
      if (root) {
        root.dispose();
        root = null;
      }
      if (mats) {
        mats.dotDormant.dispose();
        mats.dotGrowing.dispose();
        mats.dotPruned.dispose();
        mats.apex.dispose();
        mats.truss.dispose();
        mats.leaf.dispose();
        mats.fruit.dispose();
        mats = null;
      }
    },
  };
}
