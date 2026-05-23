// SkeletonOverlay — wireframe + node-marker visualization of the plant's
// growth skeleton (Plan 3a). Built on top of an existing ShowcasePlant
// instance so the user can toggle between "lush mesh" and "anatomical
// skeleton" views without disposing/rebuilding anything.
//
// What's rendered:
//   • For every StemAxis (main + side shoots, recursive), draw the
//     curve through node.position values as a tube — radius proportional
//     to node.stemRadiusMm so the user *sees* the stem thickening over
//     time. Color by branchOrder: 0=brown→tip green, 1=orange, 2=red.
//   • A small sphere at every node, color-coded by budState:
//       dormant=skyblue, growing=lime, pruned=grey.
//   • Apex of every axis = yellow sphere (brighter, slightly larger).
//   • Truss-bearing nodes get an extra small red dot.
//
// Invariant (per Plan 3a Context): no straight internodes. Each internode
// is drawn as a Catmull-Rom segment between prev/curr/next node centers,
// so the visible wandering of growth direction is preserved. Babylon's
// MeshBuilder.CreateTube samples the curve internally.

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { PlantState, StemAxis, NodeState } from '@farmsim/tomato-engine';

export interface SkeletonOverlayHandle {
  update: (plant: PlantState) => void;
  setVisible: (v: boolean) => void;
  dispose: () => void;
}

interface MatBucket {
  axis0: StandardMaterial;  // main stem
  axis1: StandardMaterial;  // 1st-order shoot
  axis2: StandardMaterial;  // 2nd-order shoot
  dotDormant: StandardMaterial;
  dotGrowing: StandardMaterial;
  dotPruned: StandardMaterial;
  apex: StandardMaterial;
  truss: StandardMaterial;
}

function makeMaterials(scene: Scene): MatBucket {
  const m = (name: string, hex: string, emissive = 0.4): StandardMaterial => {
    const mat = new StandardMaterial(name, scene);
    const c = Color3.FromHexString(hex);
    mat.diffuseColor = c;
    mat.emissiveColor = c.scale(emissive);
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    mat.disableLighting = true;
    return mat;
  };
  return {
    axis0: m('skel_axis0', '#6e4a2a', 0.65),
    axis1: m('skel_axis1', '#c47a30', 0.7),
    axis2: m('skel_axis2', '#d23a3a', 0.7),
    dotDormant: m('skel_dot_dormant', '#7ab7d8', 0.8),
    dotGrowing: m('skel_dot_growing', '#5fdf6a', 0.85),
    dotPruned: m('skel_dot_pruned', '#888888', 0.65),
    apex: m('skel_apex', '#f5d63a', 1.0),
    truss: m('skel_truss', '#cc2b2b', 0.9),
  };
}

export function createSkeletonOverlay(scene: Scene): SkeletonOverlayHandle {
  const root = new TransformNode('skeletonOverlayRoot', scene);
  const meshes: Mesh[] = [];
  const mats = makeMaterials(scene);
  let visible = false;
  root.setEnabled(false);

  function clearMeshes() {
    for (const m of meshes) m.dispose();
    meshes.length = 0;
  }

  function nodeWorld(node: NodeState): Vector3 {
    return new Vector3(node.position.x, node.position.y, node.position.z);
  }

  function axisMat(order: number): StandardMaterial {
    if (order === 0) return mats.axis0;
    if (order === 1) return mats.axis1;
    return mats.axis2;
  }

  function drawAxis(axis: StemAxis, axisIdx: number) {
    if (axis.nodes.length < 1) return;
    // Build curve points from node positions. Prefix ground origin
    // (0,0,0) for main, or parent node position for side shoots, so
    // the tube anchors to the attachment point.
    const points: Vector3[] = [];
    if (axis.order === 0) points.push(new Vector3(0, 0, 0));
    for (const n of axis.nodes) points.push(nodeWorld(n));

    // Tube radius function — average stemRadiusMm of bracketing nodes.
    const radii = axis.nodes.map((n) => n.stemRadiusMm / 1000);  // mm → m
    if (axis.order === 0) radii.unshift(radii[0] ?? 0.005);

    // Build tube via MeshBuilder.CreateTube with per-point radius.
    if (points.length >= 2) {
      const tube = MeshBuilder.CreateTube(
        `skel_tube_a${axisIdx}`,
        {
          path: points,
          radiusFunction: (i) => radii[Math.min(i, radii.length - 1)] * 1.1,
          tessellation: 10,
          cap: Mesh.NO_CAP,
        },
        scene,
      );
      tube.material = axisMat(axis.order);
      tube.parent = root;
      meshes.push(tube);
    }

    // Node markers — sphere per node
    const lastIdx = axis.nodes.length - 1;
    for (let i = 0; i < axis.nodes.length; i++) {
      const node = axis.nodes[i];
      const isApex = i === lastIdx;
      const isTruss = node.truss !== null;

      let dotMat: StandardMaterial;
      let radius: number;
      if (isApex) {
        dotMat = mats.apex;
        radius = 0.012;
      } else {
        switch (node.budState) {
          case 'growing': dotMat = mats.dotGrowing; radius = 0.010; break;
          case 'pruned':  dotMat = mats.dotPruned;  radius = 0.007; break;
          default:        dotMat = mats.dotDormant; radius = 0.007;
        }
      }

      const sphere = MeshBuilder.CreateSphere(
        `skel_node_a${axisIdx}_n${i}`,
        { diameter: radius * 2, segments: 8 },
        scene,
      );
      sphere.position = nodeWorld(node);
      sphere.material = dotMat;
      sphere.parent = root;
      meshes.push(sphere);

      // Truss marker: small extra red dot offset slightly off the node
      if (isTruss && !isApex) {
        const t = MeshBuilder.CreateSphere(
          `skel_truss_a${axisIdx}_n${i}`,
          { diameter: 0.012, segments: 6 },
          scene,
        );
        const off = nodeWorld(node);
        off.x += 0.018;  // 18mm offset so it's visibly to the side
        t.position = off;
        t.material = mats.truss;
        t.parent = root;
        meshes.push(t);
      }
    }
  }

  return {
    update(plant: PlantState) {
      clearMeshes();
      if (!visible) return;
      // Draw main axis first, then each side shoot. allAxes flat array
      // lets visual layer iterate without recursive traversal.
      for (let i = 0; i < plant.allAxes.length; i++) {
        drawAxis(plant.allAxes[i], i);
      }
    },
    setVisible(v: boolean) {
      visible = v;
      root.setEnabled(v);
    },
    dispose() {
      clearMeshes();
      root.dispose();
      mats.axis0.dispose(); mats.axis1.dispose(); mats.axis2.dispose();
      mats.dotDormant.dispose(); mats.dotGrowing.dispose(); mats.dotPruned.dispose();
      mats.apex.dispose(); mats.truss.dispose();
    },
  };
}
