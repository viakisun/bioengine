// SkeletonOverlay — wireframe + node-marker visualization (v4.0 consumer
// of PlantBase). No biological / world-transform logic lives here; all
// position decisions arrive pre-baked in PlantBase via computePlantGeometry.
//
// Invariant: skeleton fruit/truss/petiole positions equal lush mesh
// positions to within 1mm — they read the *same* PlantBase produced
// upstream.
//
// Color palette (high-saturation red family, distinct from white wires):
//   • Main axis      — hot red
//   • 1st side shoot — orange-red
//   • 2nd side shoot — amber
//   • Petiole        — magenta
//   • Rachis         — hot pink
//   • Pedicel        — pink-red
//   • Calyx          — lime

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
import type {
  PlantBase,
  AxisBase,
  LeafBase,
  TrussBase,
  StemSegment,
  FloralSiteBase,
} from '../plant/PlantBase';
import type { SkeletonConfig } from '../store/twinStore';

export interface SkeletonOverlayHandle {
  update: (plantBase: PlantBase) => void;
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
  /** Faded variant for hidden (pruned/harvested/aborted) organs. */
  fruitHidden: StandardMaterial;
  leafHidden: StandardMaterial;
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
  const faded = (name: string, hex: string): StandardMaterial => {
    const mat = m(name, hex, 0.35);
    mat.alpha = 0.45;
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
    fruitHidden: faded('skel_fruit_hidden', '#ff3a3a'),
    leafHidden: faded('skel_leaf_hidden', '#3fff5a'),
  };
}

function isFiniteVec(p: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

const DEFAULT_CONFIG: SkeletonConfig = {
  axisMainWidth: 0.006, axisOrder1Width: 0.004, axisOrder2Width: 0.003,
  // Truss widths scaled so rachis ≈ 25% of main stem (real anatomy).
  petioleWidth: 0.003, rachisWidth: 0.0018, pedicelWidth: 0.0012, calyxWidth: 0.0010,
  axisMainColor: '#e90b2c', axisOrder1Color: '#ff7a1a', axisOrder2Color: '#ffcc00',
  petioleColor: '#ff20a0', rachisColor: '#ff0080', pedicelColor: '#e8408a', calyxColor: '#3fff5a',
  subdivisionsPerInternode: 5,
  showPetiole: true, showTruss: true, showCalyx: true,
  showFruitDots: true, showDormantBuds: true, showPrunedBuds: true,
  nodeMarkerSize: 0.011, apexMarkerSize: 0.014, fruitMarkerScale: 1.0,
};

export function createSkeletonOverlay(
  scene: Scene,
  parent: TransformNode | null = null,
): SkeletonOverlayHandle {
  let root: TransformNode | null = null;
  let mats: MatBucket | null = null;
  const meshes: Mesh[] = [];
  let visible = false;
  let cfg: SkeletonConfig = { ...DEFAULT_CONFIG };
  let lastPlantBase: PlantBase | null = null;

  /** Show hidden (pruned/harvested/aborted) organs as faint debug markers.
   *  Default off; can be wired to a store toggle later. */
  const showHiddenOrgans = false;

  function ensureInit() {
    if (root) return;
    root = new TransformNode('skeletonOverlayRoot', scene);
    if (parent) root.parent = parent;
    mats = makeMaterials(scene);
    root.setEnabled(false);
  }

  function clearMeshes() {
    for (const m of meshes) m.dispose();
    meshes.length = 0;
  }

  function v(p: { x: number; y: number; z: number }): Vector3 {
    return new Vector3(p.x, p.y, p.z);
  }

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

  function axisWidthFor(order: number): number {
    if (order === 0) return cfg.axisMainWidth;
    if (order === 1) return cfg.axisOrder1Width;
    return cfg.axisOrder2Width;
  }
  function axisColorHex(order: number): string {
    if (order === 0) return cfg.axisMainColor;
    if (order === 1) return cfg.axisOrder1Color;
    return cfg.axisOrder2Color;
  }

  function drawAxisStem(axis: AxisBase, axisIdx: number): void {
    if (!root) return;
    const stemSegs = axis.stemCurve;
    if (stemSegs.length < 1) return;

    // Main axis prepends ground origin so the basal line touches the bed.
    const controlPoints: Vector3[] = [];
    if (axis.order === 0) controlPoints.push(new Vector3(0, 0, 0));
    for (const s of stemSegs) {
      if (!isFiniteVec(s.position)) continue;
      controlPoints.push(v(s.position));
    }
    if (controlPoints.length < 2) return;

    const curve = catmullRomPath(controlPoints, Math.max(1, cfg.subdivisionsPerInternode));
    meshes.push(thickLine(
      `skel_axis_a${axisIdx}`,
      curve,
      Color3.FromHexString(axisColorHex(axis.order)),
      axisWidthFor(axis.order),
    ));
  }

  function drawNodeMarkers(axis: AxisBase, axisIdx: number): void {
    if (!root || !mats) return;
    const stemSegs = axis.stemCurve;
    const buds = axis.buds;
    const lastIdx = stemSegs.length - 1;

    for (let i = 0; i < stemSegs.length; i++) {
      const seg = stemSegs[i];
      const bud = buds[i];
      const isApex = i === lastIdx;

      if (!isApex && bud) {
        if (bud.state === 'dormant' && !cfg.showDormantBuds) continue;
        if (bud.state === 'pruned' && !cfg.showPrunedBuds) continue;
      }

      let dotMat: StandardMaterial;
      let radius: number;
      if (isApex) {
        dotMat = mats.apex;
        radius = cfg.apexMarkerSize;
      } else {
        switch (bud?.state) {
          case 'growing': dotMat = mats.dotGrowing; radius = cfg.nodeMarkerSize; break;
          case 'pruned':  dotMat = mats.dotPruned;  radius = cfg.nodeMarkerSize * 0.7; break;
          default:        dotMat = mats.dotDormant; radius = cfg.nodeMarkerSize * 0.7;
        }
      }

      const sphere = MeshBuilder.CreateSphere(
        `skel_node_a${axisIdx}_n${i}`,
        { diameter: radius * 2, segments: 6 }, scene,
      );
      sphere.position = v(seg.position);
      sphere.material = dotMat;
      sphere.parent = root;
      meshes.push(sphere);
    }
  }

  function drawPetiole(axis: AxisBase, axisIdx: number, leaf: LeafBase): void {
    if (!root || !mats) return;
    if (!cfg.showPetiole) return;
    if (!leaf.visibility.visible && !showHiddenOrgans) return;
    if (!isFiniteVec(leaf.attachPosition)) return;

    // Single source of truth — petioleCurve comes from PlantBase. Skeleton
    // and any future lush petiole tube both consume this identical curve.
    const petCurve = catmullRomPath(leaf.petioleCurve.map(v), 4);
    const tip = v(leaf.petioleCurve[leaf.petioleCurve.length - 1]);
    meshes.push(thickLine(
      `skel_pet_a${axisIdx}_n${leaf.nodeIdx}`, petCurve,
      Color3.FromHexString(cfg.petioleColor), cfg.petioleWidth,
    ));
    const leafDot = MeshBuilder.CreateSphere(
      `skel_leafdot_a${axisIdx}_n${leaf.nodeIdx}`,
      { diameter: 0.012, segments: 6 }, scene,
    );
    leafDot.position = tip;
    leafDot.material = leaf.visibility.visible ? mats.leaf : mats.leafHidden;
    leafDot.parent = root;
    meshes.push(leafDot);
  }

  function drawTruss(axis: AxisBase, axisIdx: number, truss: TrussBase): void {
    if (!root || !mats) return;
    if (!cfg.showTruss) return;
    if (!truss.visibility.visible && !showHiddenOrgans) return;
    if (!isFiniteVec(truss.worldOrigin)) return;

    // v4.1 — prefer the new 3-tier schema (peduncleCurve / rachisCurve /
    // floralSites). Fallback to legacy fruits[]/rachisCurveWorld only when
    // PlantBase Phase B hasn't populated the new fields.
    const useV41 = !!truss.floralSites && !!truss.peduncleCurve && !!truss.rachisCurve;

    if (useV41) {
      drawTrussV41(axis, axisIdx, truss);
      return;
    }

    // ── Legacy v4.0 fallback (Phase F removes) ───────────────────────
    // PlantBase always populates v4.1 fields → this path should be
    // unreachable. Dev warn for regression detection.
    if (import.meta.env?.DEV) {
      console.warn(
        `[v4.0 path reached] SkeletonOverlay drawTruss legacy fallback hit `
        + `for axis ${axisIdx} truss n${truss.nodeIdx}. `
        + `PlantBase should populate v4.1 fields.`,
      );
    }
    const origin = v(truss.worldOrigin);
    const rachisCurve = catmullRomPath(truss.rachisCurveWorld.map(v), 4);
    meshes.push(thickLine(
      `skel_rachis_a${axisIdx}_n${truss.nodeIdx}`, rachisCurve,
      Color3.FromHexString(cfg.rachisColor), cfg.rachisWidth,
    ));

    const trMarker = MeshBuilder.CreateSphere(
      `skel_truss_a${axisIdx}_n${truss.nodeIdx}`,
      { diameter: 0.010, segments: 6 }, scene,
    );
    trMarker.position = origin;
    trMarker.material = mats.truss;
    trMarker.parent = root;
    meshes.push(trMarker);

    for (let f = 0; f < truss.fruits.length; f++) {
      const fruit = truss.fruits[f];
      if (!fruit.visibility.visible && !showHiddenOrgans) continue;
      if (fruit.pedicelCurve.length < 4) continue;
      const fadeOnly = !fruit.visibility.visible;

      const pedCurve = catmullRomPath(fruit.pedicelCurve.map(v), 3);
      meshes.push(thickLine(
        `skel_ped_a${axisIdx}_n${truss.nodeIdx}_f${f}`, pedCurve,
        Color3.FromHexString(cfg.pedicelColor), cfg.pedicelWidth,
      ));

      const abscissPos = v(fruit.pedicelCurve[2]);
      const absciss = MeshBuilder.CreateSphere(
        `skel_abs_a${axisIdx}_n${truss.nodeIdx}_f${f}`,
        { diameter: 0.005, segments: 4 }, scene,
      );
      absciss.position = abscissPos;
      absciss.material = mats.truss;
      absciss.parent = root;
      meshes.push(absciss);

      const fruitPos = v(fruit.worldPosition);

      if (cfg.showCalyx) {
        const calyxLen = 0.012;
        const lastPed = v(fruit.pedicelCurve[3]);
        const prevPed = v(fruit.pedicelCurve[2]);
        const downDir = lastPed.subtract(prevPed).normalize();
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
            `skel_calyx_a${axisIdx}_n${truss.nodeIdx}_f${f}_s${s}`,
            [fruitPos, tip],
            Color3.FromHexString(cfg.calyxColor), cfg.calyxWidth,
          ));
        }
      }

      if (cfg.showFruitDots) {
        const fruitDiam =
          (0.010 + 0.014 * Math.min(1, fruit.diameterMm / 60)) * cfg.fruitMarkerScale;
        const fr = MeshBuilder.CreateSphere(
          `skel_fr_a${axisIdx}_n${truss.nodeIdx}_f${f}`,
          { diameter: fruitDiam, segments: 6 }, scene,
        );
        fr.position = fruitPos;
        fr.material = fadeOnly ? mats.fruitHidden : mats.fruit;
        fr.parent = root;
        meshes.push(fr);
      }
    }
  }

  /** v4.1 — 3-tier draw: peduncle, rachis, per-site (pedicel + organ).
   *  Each tier is its own polyline / mesh so they read as distinct anatomy. */
  function drawTrussV41(axis: AxisBase, axisIdx: number, truss: TrussBase): void {
    if (!root || !mats) return;
    if (!truss.peduncleCurve || !truss.rachisCurve || !truss.floralSites) return;

    // Tier 1: peduncle (slightly thicker than rachis to read as base).
    const peduncleWorld = truss.peduncleCurve.map(v);
    const peduncleCurve = catmullRomPath(peduncleWorld, 3);
    meshes.push(thickLine(
      `skel_ped_a${axisIdx}_n${truss.nodeIdx}`, peduncleCurve,
      Color3.FromHexString(cfg.rachisColor), cfg.rachisWidth * 1.4,
    ));

    // Truss attach marker at worldOrigin (main-stem attach).
    const originMarker = MeshBuilder.CreateSphere(
      `skel_truss_a${axisIdx}_n${truss.nodeIdx}`,
      { diameter: 0.010, segments: 6 }, scene,
    );
    originMarker.position = v(truss.worldOrigin);
    originMarker.material = mats.truss;
    originMarker.parent = root;
    meshes.push(originMarker);

    // Tier 2: rachis (cymose zigzag polyline through knuckles).
    const rachisWorld = truss.rachisCurve.map(v);
    const rachisCurve = catmullRomPath(rachisWorld, 3);
    meshes.push(thickLine(
      `skel_rachis_a${axisIdx}_n${truss.nodeIdx}`, rachisCurve,
      Color3.FromHexString(cfg.rachisColor), cfg.rachisWidth,
    ));

    // Knuckle markers (small spheres at each branch point).
    for (let k = 0; k < truss.floralSites.length; k++) {
      const knuckle = MeshBuilder.CreateSphere(
        `skel_knuckle_a${axisIdx}_n${truss.nodeIdx}_k${k}`,
        { diameter: 0.0055, segments: 4 }, scene,
      );
      knuckle.position = v(truss.floralSites[k].knuckle);
      knuckle.material = mats.truss;
      knuckle.parent = root;
      meshes.push(knuckle);
    }

    // Tier 3: per-site pedicel + organ marker.
    for (const site of truss.floralSites) {
      drawFloralSite(axisIdx, truss.nodeIdx, site);
    }
  }

  function drawFloralSite(
    axisIdx: number,
    nodeIdx: number,
    site: FloralSiteBase,
  ): void {
    if (!root || !mats) return;
    const isHidden = !site.visibility.visible;
    if (isHidden && !showHiddenOrgans) return;

    // Pedicel wire.
    if (site.pedicelCurve.length >= 4) {
      const pedCurve = catmullRomPath(site.pedicelCurve.map(v), 3);
      meshes.push(thickLine(
        `skel_pedicel_a${axisIdx}_n${nodeIdx}_s${site.index}`, pedCurve,
        Color3.FromHexString(cfg.pedicelColor), cfg.pedicelWidth,
      ));

      // Abscission marker (joint / knee).
      const absciss = MeshBuilder.CreateSphere(
        `skel_abs_a${axisIdx}_n${nodeIdx}_s${site.index}`,
        { diameter: 0.005, segments: 4 }, scene,
      );
      absciss.position = v(site.abscissionPosition);
      absciss.material = mats.truss;
      absciss.parent = root;
      meshes.push(absciss);
    }

    // Organ marker — driven by stage.
    const topPos = v(site.fruitTop);
    switch (site.stage) {
      case 'bud':
      case 'flowering':
      case 'petal-drop': {
        // Tiny yellow icon at fruitTop (open-flower hint).
        const flowerDot = MeshBuilder.CreateSphere(
          `skel_flower_a${axisIdx}_n${nodeIdx}_s${site.index}`,
          { diameter: 0.010, segments: 6 }, scene,
        );
        flowerDot.position = topPos;
        // Reuse leaf/apex materials (yellow-ish) since palette is limited.
        flowerDot.material = mats.apex;
        flowerDot.parent = root;
        meshes.push(flowerDot);
        break;
      }
      case 'fruit-set':
      case 'fruit-growing':
      case 'ripening': {
        // Red dot at fruitCenter + calyx 5-star at fruitTop.
        if (site.fruit) {
          const fruitDiam =
            (0.010 + 0.014 * Math.min(1, site.fruit.diameterMm / 60)) * cfg.fruitMarkerScale;
          const fr = MeshBuilder.CreateSphere(
            `skel_fr_a${axisIdx}_n${nodeIdx}_s${site.index}`,
            { diameter: fruitDiam, segments: 6 }, scene,
          );
          fr.position = v(site.fruit.fruitCenter);
          fr.material = isHidden ? mats.fruitHidden : mats.fruit;
          fr.parent = root;
          meshes.push(fr);
        }
        if (cfg.showCalyx) {
          // 5-ray star at fruitTop along fruitAxisDir.
          const axisV = v(site.fruitAxisDir);
          const calyxLen = 0.012;
          const perp = Math.abs(axisV.y) < 0.95
            ? Vector3.Cross(axisV, new Vector3(0, 1, 0)).normalize()
            : new Vector3(1, 0, 0);
          const perp2 = Vector3.Cross(axisV, perp).normalize();
          for (let s = 0; s < 5; s++) {
            const theta = (s / 5) * Math.PI * 2;
            const outward = Math.sin((25 * Math.PI) / 180);
            // Sepals reflex AWAY from fruit (opposite fruitAxisDir).
            const dir = axisV.scale(-Math.cos((25 * Math.PI) / 180))
              .add(perp.scale(Math.cos(theta) * outward))
              .add(perp2.scale(Math.sin(theta) * outward))
              .normalize();
            const tip = topPos.add(dir.scale(calyxLen));
            meshes.push(thickLine(
              `skel_calyx_a${axisIdx}_n${nodeIdx}_s${site.index}_r${s}`,
              [topPos, tip],
              Color3.FromHexString(cfg.calyxColor), cfg.calyxWidth,
            ));
          }
        }
        break;
      }
      case 'harvested':
      case 'aborted': {
        // Faint marker only when showHiddenOrgans is enabled.
        const dot = MeshBuilder.CreateSphere(
          `skel_hidden_a${axisIdx}_n${nodeIdx}_s${site.index}`,
          { diameter: 0.006, segments: 4 }, scene,
        );
        dot.position = topPos;
        dot.material = mats.fruitHidden;
        dot.parent = root;
        meshes.push(dot);
        break;
      }
    }
  }

  function drawAxisAll(axis: AxisBase, axisIdx: number): void {
    drawAxisStem(axis, axisIdx);
    drawNodeMarkers(axis, axisIdx);
    for (const leaf of axis.leaves) drawPetiole(axis, axisIdx, leaf);
    for (const truss of axis.trusses) drawTruss(axis, axisIdx, truss);
  }

  function rebuild() {
    if (!visible) {
      if (meshes.length > 0) clearMeshes();
      return;
    }
    const pb = lastPlantBase;
    if (!pb) {
      clearMeshes();
      return;
    }
    clearMeshes();
    try {
      drawAxisAll(pb.mainAxis, 0);
      for (let i = 0; i < pb.sideShoots.length; i++) {
        drawAxisAll(pb.sideShoots[i], i + 1);
      }
    } catch (err) {
      console.error('[SkeletonOverlay] draw failed:', err);
      clearMeshes();
    }
  }

  return {
    update(plantBase: PlantBase) {
      lastPlantBase = plantBase;
      rebuild();
    },
    setVisible(v: boolean) {
      visible = v;
      if (v) ensureInit();
      if (root) root.setEnabled(v);
      if (v && lastPlantBase) rebuild();
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
        mats.fruitHidden.dispose();
        mats.leafHidden.dispose();
        mats = null;
      }
    },
  };
}
