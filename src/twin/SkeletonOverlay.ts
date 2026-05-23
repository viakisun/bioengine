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
import { catmullRomPath } from '../plant/StemGenerator';
import type { PlantState, StemAxis, NodeState } from '@farmsim/tomato-engine';
import type { SkeletonConfig } from '../store/twinStore';

export interface SkeletonOverlayHandle {
  update: (plant: PlantState) => void;
  setVisible: (v: boolean) => void;
  setConfig: (config: SkeletonConfig) => void;
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

// Default config — store 가 아직 안 붙었을 때 fallback.
const DEFAULT_CONFIG: SkeletonConfig = {
  axisMainWidth: 0.006, axisOrder1Width: 0.004, axisOrder2Width: 0.003,
  petioleWidth: 0.003, rachisWidth: 0.0045, pedicelWidth: 0.0025, calyxWidth: 0.0018,
  axisMainColor: '#e90b2c', axisOrder1Color: '#ff7a1a', axisOrder2Color: '#ffcc00',
  petioleColor: '#ff20a0', rachisColor: '#ff0080', pedicelColor: '#e8408a', calyxColor: '#3fff5a',
  subdivisionsPerInternode: 5,
  showPetiole: true, showTruss: true, showCalyx: true,
  showFruitDots: true, showDormantBuds: true, showPrunedBuds: true,
  nodeMarkerSize: 0.011, apexMarkerSize: 0.014, fruitMarkerScale: 1.0,
};

export function createSkeletonOverlay(scene: Scene): SkeletonOverlayHandle {
  let root: TransformNode | null = null;
  let mats: MatBucket | null = null;
  const meshes: Mesh[] = [];
  let visible = false;
  let cfg: SkeletonConfig = { ...DEFAULT_CONFIG };
  let lastPlantForRebuild: PlantState | null = null;

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

  // Per-vertex width 버전 — taper + node bulge. widths 배열은 points 와
  // 같은 길이. GreasedLine 내부 distribution 알고리즘이 mesh 의 양 side
  // width 를 자동 적용.
  function thickLineVar(name: string, points: Vector3[], color: Color3, widths: number[]): Mesh {
    const m = CreateGreasedLine(
      name,
      { points, widths },
      { color, useDash: false },
      scene,
    ) as unknown as Mesh;
    if (root) m.parent = root;
    return m;
  }

  /**
   * Catmull-Rom subsample + per-vertex width 계산.
   *
   * controlRadii: 각 control point 의 base radius (m). 곡선 sample 점은
   * 인접 control radius 간 선형 보간하되, control point 근방에서 bulge
   * 증가 (마디감 표현). 결과 widths.length === curve.length.
   */
  function curveWithWidths(
    controlPoints: Vector3[],
    controlRadii: number[],
    divisions: number,
    bulge = 0.18,
  ): { curve: Vector3[]; widths: number[] } {
    if (controlPoints.length < 2) {
      return { curve: controlPoints.slice(), widths: controlRadii.slice() };
    }
    const curve = catmullRomPath(controlPoints, divisions);
    // Map each curve point's index → fractional control-point index.
    // catmullRomPath: for segments 0..N-2 each produces `divisions` points,
    // last segment also pushes the final point (divisions+1 entries).
    const widths: number[] = [];
    const N = controlRadii.length;
    for (let k = 0; k < curve.length; k++) {
      const f = k / divisions;                 // 0..N-1 (final point = N-1)
      const lo = Math.min(N - 1, Math.floor(f));
      const hi = Math.min(N - 1, lo + 1);
      const frac = Math.max(0, Math.min(1, f - lo));
      const rBase = controlRadii[lo] * (1 - frac) + controlRadii[hi] * frac;
      // Bulge — peaks at frac=0 (control point), zero at midpoint.
      const distFromCtrl = Math.min(frac, 1 - frac);   // 0..0.5
      const bulgeAmt = (1 - distFromCtrl * 2) * bulge; // 1 at ctrl, 0 at mid
      widths.push(rBase * (1 + bulgeAmt));
    }
    return { curve, widths };
  }

  function drawAxis(axis: StemAxis, axisIdx: number) {
    if (!axis || !axis.nodes || axis.nodes.length < 1) return;
    if (!root || !mats) return;

    // Catmull-Rom subsample 로 wandering curve. control points 는 nodes
    // 의 position. 메인 stem 은 ground (0,0,0) 도 prepend.
    const controlPoints: Vector3[] = [];
    if (axis.order === 0) {
      controlPoints.push(new Vector3(0, 0, 0));
    }
    for (const n of axis.nodes) {
      if (!n.position || !isFiniteVec(n.position)) continue;
      controlPoints.push(nodeWorld(n));
    }
    if (controlPoints.length >= 2) {
      const curve = catmullRomPath(controlPoints, Math.max(1, cfg.subdivisionsPerInternode));
      const axisWidth =
        axis.order === 0 ? cfg.axisMainWidth
        : axis.order === 1 ? cfg.axisOrder1Width
        : cfg.axisOrder2Width;
      const colorHex =
        axis.order === 0 ? cfg.axisMainColor
        : axis.order === 1 ? cfg.axisOrder1Color
        : cfg.axisOrder2Color;
      meshes.push(thickLine(
        `skel_axis_a${axisIdx}`, curve, Color3.FromHexString(colorHex), axisWidth,
      ));
    }

    // Per-node markers + leaf petiole + truss anatomy
    const lastIdx = axis.nodes.length - 1;
    for (let i = 0; i < axis.nodes.length; i++) {
      const node = axis.nodes[i];
      if (!node.position || !isFiniteVec(node.position)) continue;
      const isApex = i === lastIdx;
      const isTruss = node.truss !== null;

      // budState 별 visibility skip
      if (!isApex) {
        if (node.budState === 'dormant' && !cfg.showDormantBuds) continue;
        if (node.budState === 'pruned' && !cfg.showPrunedBuds) continue;
      }

      let dotMat: StandardMaterial;
      let radius: number;
      if (isApex) {
        dotMat = mats.apex;
        radius = cfg.apexMarkerSize;
      } else {
        switch (node.budState) {
          case 'growing': dotMat = mats.dotGrowing; radius = cfg.nodeMarkerSize; break;
          case 'pruned':  dotMat = mats.dotPruned;  radius = cfg.nodeMarkerSize * 0.7; break;
          default:        dotMat = mats.dotDormant; radius = cfg.nodeMarkerSize * 0.7;
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

      // ── Petiole — arching curve in leaf's azimuth.
      //   nodePos → arch up slightly → curve down to drooped tip.
      //   Catmull-Rom 으로 매끈한 droop. *직선 금지*.
      if (cfg.showPetiole && node.leafMaturity > 0.05 && axis.order === 0) {
        const leafAzimuth = (node.phyllotaxisAngle * Math.PI) / 180;
        const droopRad = (node.droopExtra * Math.PI) / 180;
        const petLen = 0.12 * Math.max(0.3, node.leafSizeFactor);
        const cos = Math.cos(leafAzimuth);
        const sin = Math.sin(leafAzimuth);
        // Arch: tip 이 droopRad 만큼 아래로 처지되, 중간은 약간 위로
        // 솟구치는 cantilever shape.
        const tipY = -petLen * Math.sin(droopRad * 0.6);
        const tipR = petLen * Math.cos(droopRad * 0.6);
        const tip = new Vector3(
          nodePos.x + cos * tipR,
          nodePos.y + tipY,
          nodePos.z + sin * tipR,
        );
        // 2 intermediate control points — slight up-arch at 35%, level at 70%
        const c1 = new Vector3(
          nodePos.x + cos * tipR * 0.35,
          nodePos.y + Math.max(0, -tipY * 0.15) + 0.005,
          nodePos.z + sin * tipR * 0.35,
        );
        const c2 = new Vector3(
          nodePos.x + cos * tipR * 0.70,
          nodePos.y + tipY * 0.55,
          nodePos.z + sin * tipR * 0.70,
        );
        const petCurve = catmullRomPath([nodePos, c1, c2, tip], 4);
        meshes.push(thickLine(
          `skel_pet_a${axisIdx}_n${i}`, petCurve,
          Color3.FromHexString(cfg.petioleColor), cfg.petioleWidth,
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

      // ── Truss: rachis (cantilever droop curve) + per-fruit pedicels + calyx
      if (cfg.showTruss && isTruss && node.truss && axis.order === 0) {
        const trussAz = (node.phyllotaxisAngle * Math.PI) / 180 + Math.PI;
        const cosAz = Math.cos(trussAz);
        const sinAz = Math.sin(trussAz);
        const rachisLen = 0.10 + Math.min(0.10, node.truss.fruits.length * 0.012);
        // Cantilever sag — parabolic. fruit count 와 stage 가 무게 proxy.
        const totalDroop = rachisLen * (0.15 + Math.min(0.25, node.truss.fruits.length * 0.04));
        const rachisTip = new Vector3(
          nodePos.x + cosAz * rachisLen,
          nodePos.y - totalDroop,
          nodePos.z + sinAz * rachisLen,
        );
        // 2 control points along rachis for parabolic curve.
        // y(t) = -totalDroop * t² (parabola: linear sag accumulation).
        const rc1 = new Vector3(
          nodePos.x + cosAz * rachisLen * 0.33,
          nodePos.y - totalDroop * 0.11,
          nodePos.z + sinAz * rachisLen * 0.33,
        );
        const rc2 = new Vector3(
          nodePos.x + cosAz * rachisLen * 0.67,
          nodePos.y - totalDroop * 0.45,
          nodePos.z + sinAz * rachisLen * 0.67,
        );
        const rachisCurve = catmullRomPath([nodePos, rc1, rc2, rachisTip], 4);
        meshes.push(thickLine(
          `skel_rachis_a${axisIdx}_n${i}`, rachisCurve,
          Color3.FromHexString(cfg.rachisColor), cfg.rachisWidth,
        ));

        const fruits = node.truss.fruits;
        for (let f = 0; f < fruits.length; f++) {
          const alongT = (f + 0.5) / Math.max(1, fruits.length);
          // Parabolic 위치 — rachis curve 와 일치 (linear * t² droop)
          const onRachis = new Vector3(
            nodePos.x + cosAz * rachisLen * alongT,
            nodePos.y - totalDroop * alongT * alongT,
            nodePos.z + sinAz * rachisLen * alongT,
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
          // Pedicel — Catmull-Rom 으로 매끈한 droop curve.
          const pedCurve = catmullRomPath([onRachis, p1, p2, fruitPos], 3);
          meshes.push(thickLine(
            `skel_ped_a${axisIdx}_n${i}_f${f}`,
            pedCurve,
            Color3.FromHexString(cfg.pedicelColor), cfg.pedicelWidth,
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
          if (cfg.showCalyx) {
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
                Color3.FromHexString(cfg.calyxColor), cfg.calyxWidth,
              ));
            }
          }

          if (cfg.showFruitDots) {
            const fruitDiam = (0.010 + 0.014 * Math.min(1, dia / 60)) * cfg.fruitMarkerScale;
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

  function rebuild() {
    if (!visible) {
      if (meshes.length > 0) clearMeshes();
      return;
    }
    const plant = lastPlantForRebuild;
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
  }

  return {
    update(plant: PlantState) {
      lastPlantForRebuild = plant;
      rebuild();
    },
    setVisible(v: boolean) {
      visible = v;
      if (v) ensureInit();
      if (root) root.setEnabled(v);
      // 토글 ON 시점에 lastPlant 있으면 즉시 그림.
      if (v && lastPlantForRebuild) rebuild();
    },
    setConfig(next: SkeletonConfig) {
      cfg = next;
      if (visible) rebuild();
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
