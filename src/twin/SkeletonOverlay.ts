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
  };
}

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

    // Per-node markers
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
        // Bigger to spot the apex easily.
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
      sphere.position = nodeWorld(node);
      sphere.material = dotMat;
      sphere.parent = root;
      meshes.push(sphere);

      // Truss marker
      if (isTruss && !isApex) {
        const t = MeshBuilder.CreateSphere(
          `skel_truss_a${axisIdx}_n${i}`,
          { diameter: 0.013, segments: 6 },
          scene,
        );
        const off = nodeWorld(node);
        off.x += 0.020;
        t.position = off;
        t.material = mats.truss;
        t.parent = root;
        meshes.push(t);
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
        mats = null;
      }
    },
  };
}
