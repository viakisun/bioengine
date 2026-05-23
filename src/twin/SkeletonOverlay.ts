// SkeletonOverlay — wireframe + node-marker visualization of the plant's
// growth skeleton (Plan 3a). GreasedLine for thick high-contrast lines
// that pop against white training wires.
//
// Color palette (high-saturation red family, distinct from white wires):
//   • Main axis     — hot red
//   • 1st side shoot — orange-red
//   • 2nd side shoot — amber
//   • Petiole       — magenta
//   • Rachis        — hot pink
//   • Pedicel       — pink-red
//   • Calyx         — lime (still green so sepal star reads as fruit organ)
//
// Invariant: no straight internodes. Each internode is rendered as a
// segment between two consecutive node.position values (already wandering
// from GrowthModel.synthesizeGrowthDir).

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { CreateGreasedLine } from '@babylonjs/core/Meshes/Builders/greasedLineBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/Builders/sphereBuilder';
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
  const m = (name: string, hex: string, emissive = 0.95): StandardMaterial => {
    const mat = new StandardMaterial(name, scene);
    const c = Color3.FromHexString(hex);
    mat.diffuseColor = c;
    mat.emissiveColor = c.scale(emissive);
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    mat.disableLighting = true;
    return mat;
  };
  return {
    dotDormant: m('skel_dot_dormant', '#5fa8ff'),
    dotGrowing: m('skel_dot_growing', '#3fff5a'),
    dotPruned: m('skel_dot_pruned', '#888888', 0.5),
    apex: m('skel_apex', '#ffe800', 1.0),
    truss: m('skel_truss', '#ff1040'),
    leaf: m('skel_leaf', '#3fff5a'),
    fruit: m('skel_fruit', '#ff3a3a'),
  };
}

// 색상 — 고채도 빨강-마젠타 계열로 통일. 흰 유인줄 위에서 즉시 식별.
const COLOR_AXIS_MAIN = Color3.FromHexString('#e90b2c');     // hot red
const COLOR_AXIS_O1 = Color3.FromHexString('#ff7a1a');       // orange-red
const COLOR_AXIS_O2 = Color3.FromHexString('#ffcc00');       // amber
const COLOR_PETIOLE = Color3.FromHexString('#ff20a0');       // magenta
const COLOR_RACHIS = Color3.FromHexString('#ff0080');        // hot pink
const COLOR_PEDICEL = Color3.FromHexString('#e8408a');       // pink-red
const COLOR_CALYX = Color3.FromHexString('#3fff5a');         // lime

function axisColor(order: number): Color3 {
  if (order === 0) return COLOR_AXIS_MAIN;
  if (order === 1) return COLOR_AXIS_O1;
  return COLOR_AXIS_O2;
}

function isFiniteVec(p: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

export function createSkeletonOverlay(scene: Scene): SkeletonOverlayHandle {
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

  // GreasedLine 헬퍼 — width 는 *월드 유닛 (m)* 단위. 토마토 plant
  // (~3m tall) 기준 mm 단위로 설계.
  function thickLine(name: string, points: Vector3[], color: Color3, widthM: number): Mesh {
    const m = CreateGreasedLine(
      name,
      { points },
      { color, width: widthM, useDash: false },
      scene,
    ) as unknown as Mesh;
    if (root) m.parent = root;
    return m;
  }

  function drawAxis(axis: StemAxis, axisIdx: number) {
    if (!axis || !axis.nodes || axis.nodes.length < 1) return;
    if (!root || !mats) return;

    // Skeleton polyline (one thick line per axis).
    const points: Vector3[] = [];
    if (axis.order === 0) points.push(new Vector3(0, 0, 0));
    for (const n of axis.nodes) {
      if (!n.position || !isFiniteVec(n.position)) continue;
      points.push(nodeWorld(n));
    }
    if (points.length >= 2) {
      // 메인 stem 6mm / 1차 곁가지 4mm / 2차 곁가지 3mm — 실제 토마토
      // 줄기 굵기 범위와 비슷한 두께. 화면에서 충분히 두꺼워 보임.
      const axisWidth = axis.order === 0 ? 0.006 : axis.order === 1 ? 0.004 : 0.003;
      meshes.push(thickLine(`skel_axis_a${axisIdx}`, points, axisColor(axis.order), axisWidth));
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

      // ── Petiole — line from node in leaf's azimuth.
      if (node.leafMaturity > 0.05 && axis.order === 0) {
        const leafAzimuth = (node.phyllotaxisAngle * Math.PI) / 180;
        const droopRad = (node.droopExtra * Math.PI) / 180;
        const petLen = 0.12 * Math.max(0.3, node.leafSizeFactor);
        const tip = new Vector3(
          nodePos.x + Math.cos(leafAzimuth) * petLen * Math.cos(droopRad * 0.6),
          nodePos.y - petLen * Math.sin(droopRad * 0.6),
          nodePos.z + Math.sin(leafAzimuth) * petLen * Math.cos(droopRad * 0.6),
        );
        meshes.push(thickLine(
          `skel_pet_a${axisIdx}_n${i}`, [nodePos, tip], COLOR_PETIOLE, 0.003,
        ));
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

      // ── Truss: rachis + per-fruit pedicels + calyx
      if (isTruss && node.truss && axis.order === 0) {
        const trussAz = (node.phyllotaxisAngle * Math.PI) / 180 + Math.PI;
        const rachisLen = 0.10 + Math.min(0.10, node.truss.fruits.length * 0.012);
        const rachisTip = new Vector3(
          nodePos.x + Math.cos(trussAz) * rachisLen,
          nodePos.y - rachisLen * 0.18,
          nodePos.z + Math.sin(trussAz) * rachisLen,
        );
        meshes.push(thickLine(
          `skel_rachis_a${axisIdx}_n${i}`, [nodePos, rachisTip], COLOR_RACHIS, 0.0045,
        ));

        const fruits = node.truss.fruits;
        for (let f = 0; f < fruits.length; f++) {
          const alongT = (f + 0.5) / Math.max(1, fruits.length);
          const onRachis = new Vector3(
            nodePos.x + Math.cos(trussAz) * rachisLen * alongT,
            nodePos.y - rachisLen * 0.18 * alongT,
            nodePos.z + Math.sin(trussAz) * rachisLen * alongT,
          );
          const sideJit = (f % 2 === 0 ? 0.012 : -0.012);
          const pedLen = 0.038;
          const dia = (fruits[f].diameterMm ?? 30);
          const droopY = Math.min(0.018, 0.005 + dia / 60 * 0.013);
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
          meshes.push(thickLine(
            `skel_ped_a${axisIdx}_n${i}_f${f}`,
            [onRachis, p1, p2, fruitPos],
            COLOR_PEDICEL, 0.0025,
          ));

          // Abscission joint dot
          const absciss = MeshBuilder.CreateSphere(
            `skel_abs_a${axisIdx}_n${i}_f${f}`,
            { diameter: 0.005, segments: 4 },
            scene,
          );
          absciss.position = p2;
          absciss.material = mats.truss;
          absciss.parent = root;
          meshes.push(absciss);

          // Calyx 5-ray star
          const calyxLen = 0.012;
          const downDir = fruitPos.subtract(p2).normalize();
          const perp = Math.abs(downDir.y) < 0.95
            ? Vector3.Cross(downDir, new Vector3(0, 1, 0)).normalize()
            : new Vector3(1, 0, 0);
          const perp2 = Vector3.Cross(downDir, perp).normalize();
          for (let s = 0; s < 5; s++) {
            const theta = (s / 5) * Math.PI * 2;
            const outward = Math.sin((25 * Math.PI) / 180);
            const dir = downDir.scale(-Math.cos((25 * Math.PI) / 180))
              .add(perp.scale(Math.cos(theta) * outward))
              .add(perp2.scale(Math.sin(theta) * outward))
              .normalize();
            const tip = fruitPos.add(dir.scale(calyxLen));
            meshes.push(thickLine(
              `skel_calyx_a${axisIdx}_n${i}_f${f}_s${s}`,
              [fruitPos, tip],
              COLOR_CALYX, 0.0018,
            ));
          }

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
