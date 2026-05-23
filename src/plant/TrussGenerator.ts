import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SeededRandom } from '@farmsim/tomato-engine';
import { createFruitNode } from './FruitGenerator';
import { computeTrussDroop } from '@farmsim/tomato-engine';
import type { TrussState } from '@farmsim/tomato-engine';
import type { PlantGenome } from '@farmsim/tomato-engine';
import { createCurvedTube } from './StemGenerator';

let cachedPeduncleMat: WeakMap<Scene, PBRMaterial> = new WeakMap();
let cachedPedicelMat: WeakMap<Scene, PBRMaterial> = new WeakMap();
let cachedPetalMat: WeakMap<Scene, PBRMaterial> = new WeakMap();
let cachedSepalMat: WeakMap<Scene, PBRMaterial> = new WeakMap();

function getPeduncleMat(scene: Scene): PBRMaterial {
  let m = cachedPeduncleMat.get(scene);
  if (!m) {
    m = new PBRMaterial('peduncleMat', scene);
    m.albedoColor = Color3.FromHexString('#4a8a30');
    m.metallic = 0;
    m.roughness = 0.8;
    cachedPeduncleMat.set(scene, m);
  }
  return m;
}
function getPedicelMat(scene: Scene): PBRMaterial {
  let m = cachedPedicelMat.get(scene);
  if (!m) {
    m = new PBRMaterial('pedicelMat', scene);
    m.albedoColor = Color3.FromHexString('#5a9a40');
    m.metallic = 0;
    m.roughness = 0.8;
    cachedPedicelMat.set(scene, m);
  }
  return m;
}
function getPetalMat(scene: Scene): PBRMaterial {
  let m = cachedPetalMat.get(scene);
  if (!m) {
    m = new PBRMaterial('flowerPetalMat', scene);
    m.albedoColor = Color3.FromHexString('#f0d040');
    m.metallic = 0;
    m.roughness = 0.7;
    m.backFaceCulling = false;
    cachedPetalMat.set(scene, m);
  }
  return m;
}
function getSepalMat(scene: Scene): PBRMaterial {
  let m = cachedSepalMat.get(scene);
  if (!m) {
    m = new PBRMaterial('flowerSepalMat', scene);
    m.albedoColor = Color3.FromHexString('#2a6a20');
    m.metallic = 0;
    m.roughness = 0.8;
    m.backFaceCulling = false;
    cachedSepalMat.set(scene, m);
  }
  return m;
}

// Peduncle / pedicel / calyx 색 vertex 에 baked.
const PEDUNCLE_RGB = { r: 0.29, g: 0.54, b: 0.19 };  // #4a8a30
const PEDICEL_RGB = { r: 0.35, g: 0.60, b: 0.25 };   // #5a9a40
const CALYX_RGB = { r: 0.24, g: 0.45, b: 0.18 };     // 어둠 sepal 톤

/**
 * Sample a Y-droop position along a length-X cantilever (parabolic).
 * Used by peduncle layout for fruit attachment + curved sweep.
 */
function cantileverY(droop: number, t: number): number {
  // y(t) = -droop · t². Linear approximation of beam deflection under
  // distributed load over a short cantilever.
  return -droop * t * t;
}

// ─────────────────────────────────────────────────────────────────────────
// Shared truss layout (Phase 3c-3) — single source of truth for both
// lush mesh (TrussGenerator) and skeleton overlay (SkeletonOverlay).
// All positions are in *truss-local* coords: X = along peduncle, Y up
// (negative = droop), Z = lateral jitter. Caller applies the truss
// node's world transform (translate + rotate) to display.
// ─────────────────────────────────────────────────────────────────────────

export interface TrussLayoutItem {
  kind: 'fruit' | 'flower';
  index: number;                   // index within truss.fruits or truss.flowers
  onRachis: { x: number; y: number; z: number };  // attachment point on peduncle
  attachPos: { x: number; y: number; z: number }; // fruit/flower center position
  fruitR: number;                  // 0 for flower (small fixed icon)
  pedicelLen: number;
  pedicelDroop: number;            // total Y droop of this pedicel
  sideJit: number;                 // lateral (Z) jitter sign × magnitude
}

export interface TrussLayout {
  peduncleLen: number;
  totalDroop: number;              // peduncle tip Y droop (parabolic)
  rachisControlPoints: { x: number; y: number; z: number }[];  // 5 pts
  items: TrussLayoutItem[];
}

/**
 * Compute the full geometric layout of a truss. Both views derive their
 * positions from this single function — guarantees that a fruit drawn
 * in skeleton mode sits at the exact same local-coord position as the
 * same fruit's lush mesh.
 *
 *   - cantilever Y droop from `computeTrussDroop(truss, genome)`
 *   - cumulative-spacing collision avoidance along the peduncle
 *   - pedicel cantilever sag scales with fruit weight (diameter proxy)
 */
export function layoutTruss(truss: TrussState, genome: PlantGenome): TrussLayout {
  const totalItems = truss.fruits.length + truss.flowers.length;
  const peduncleLen = 0.10 + Math.min(0.10, totalItems * 0.012);
  const totalDroop = truss.fruits.length > 0
    ? computeTrussDroop(truss, genome)
    : 0.01;

  // Peduncle curve — 5 sample control points along parabolic cantilever.
  const PED_SAMPLES = 5;
  const rachisControlPoints: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < PED_SAMPLES; i++) {
    const t = i / (PED_SAMPLES - 1);
    rachisControlPoints.push({ x: t * peduncleLen, y: cantileverY(totalDroop, t), z: 0 });
  }

  // Per-item layout — fruits + flowers in their truss order.
  const items: TrussLayoutItem[] = [];
  const sortedItems: Array<{ kind: 'fruit' | 'flower'; index: number }> = [
    ...truss.fruits.map((_, i) => ({ kind: 'fruit' as const, index: i })),
    ...truss.flowers.map((_, i) => ({ kind: 'flower' as const, index: i })),
  ];

  const ITEM_GAP_M = 0.008;        // 8mm minimum clear between adjacent fruits
  let prevX = 0;
  let prevR = 0;

  for (let slot = 0; slot < sortedItems.length; slot++) {
    const it = sortedItems[slot];
    const fruitR = it.kind === 'fruit'
      ? truss.fruits[it.index].diameterMm / 2 / 1000
      : 0.006;

    // Desired position from equal distribution along the peduncle.
    const tDesired = sortedItems.length === 1
      ? 0.6
      : 0.3 + 0.7 * (slot / (sortedItems.length - 1));
    let xAlong = peduncleLen * tDesired;
    // Cumulative-spacing collision avoidance.
    if (slot > 0) {
      const minX = prevX + prevR + fruitR + ITEM_GAP_M;
      if (xAlong < minX) xAlong = minX;
    }
    if (xAlong > peduncleLen * 0.95) xAlong = peduncleLen * 0.95;

    // Z-jitter — alternate sides so adjacent fruits read separated.
    const sideJit = (slot % 2 === 0 ? 1 : -1) * fruitR * 0.5;

    // Sag at the actual xAlong (not desired t).
    const tActual = xAlong / peduncleLen;
    const baseY = cantileverY(totalDroop, tActual);

    const pedicelLen = 0.025 + (it.kind === 'fruit' ? 0.015 : 0);
    const pedicelDroop = 0.005 + (it.kind === 'fruit' ? fruitR * 0.35 : 0.003);

    const onRachis = { x: xAlong, y: baseY, z: 0 };
    const attachPos = {
      x: xAlong + sideJit * 0.6,
      y: baseY - pedicelLen - (it.kind === 'fruit' ? fruitR * 0.5 : 0.005),
      z: sideJit,
    };
    items.push({
      kind: it.kind,
      index: it.index,
      onRachis,
      attachPos,
      fruitR,
      pedicelLen,
      pedicelDroop,
      sideJit,
    });
    prevX = xAlong;
    prevR = fruitR;
  }

  return { peduncleLen, totalDroop, rachisControlPoints, items };
}

/**
 * Build the 4 control points for a pedicel curve given a layout item.
 * Shared between lush mesh sweep and skeleton overlay line.
 */
export function pedicelControlPoints(
  item: TrussLayoutItem,
): { x: number; y: number; z: number }[] {
  const { onRachis, attachPos, sideJit, pedicelLen, pedicelDroop } = item;
  return [
    { x: onRachis.x,                  y: onRachis.y,                                       z: onRachis.z },
    { x: onRachis.x + sideJit * 0.2,  y: onRachis.y - pedicelLen * 0.30 - pedicelDroop * 0.15, z: onRachis.z },
    { x: onRachis.x + sideJit * 0.45, y: onRachis.y - pedicelLen * 0.65 - pedicelDroop * 0.55, z: onRachis.z },
    attachPos,
  ];
}

/**
 * Build a truss: a single peduncle (main bracket stem) springing
 * laterally from the node, with each fruit/flower hanging from a
 * pedicel branch along the peduncle. Peduncle droop comes from the
 * physics model (cantilever beam under fruit weight).
 *
 * Plan 3c-2: peduncle / pedicel 가 직선 cylinder 가 아니라 Catmull-Rom
 * 곡선 tube (parabolic cantilever sag). Each fruit 에 calyx 5각 mesh
 * 추가. Skeleton overlay 와 anatomical 일치.
 *
 * azimuthRad: world rotation around Y (typically opposite the leaf
 * at the same node, i.e. node.phyllotaxisAngle + π).
 */
export function createTrussNode(
  name: string,
  scene: Scene,
  truss: TrussState,
  genome: PlantGenome,
  azimuthRad: number,
  rng: SeededRandom
): TransformNode {
  const root = new TransformNode(name, scene);
  root.rotation.y = azimuthRad;

  const totalItems = truss.fruits.length + truss.flowers.length;
  if (totalItems === 0) return root;

  // Phase 3c-3 — single source of truth. layoutTruss() 가 lush + skeleton
  // 둘 다에서 호출되는 공유 함수. 동일 함수 = 동일 위치.
  const layout = layoutTruss(truss, genome);

  // Peduncle mesh — sweep tube through layout.rachisControlPoints with
  // tapered radii.
  const PED_BASE_R = 0.0030;
  const PED_TIP_R = 0.0020;
  const rachisPts = layout.rachisControlPoints.map((p) => new Vector3(p.x, p.y, p.z));
  const rachisRadii = rachisPts.map((_, i, arr) => {
    const t = arr.length <= 1 ? 0 : i / (arr.length - 1);
    return PED_BASE_R * (1 - t) + PED_TIP_R * t;
  });
  const peduncle = createCurvedTube(`${name}_peduncle`, scene, rachisPts, rachisRadii, {
    radialSegments: 8,
    color: PEDUNCLE_RGB,
  });
  if (peduncle) {
    peduncle.parent = root;
    peduncle.material = getPeduncleMat(scene);
  }

  // Per-item: pedicel mesh + fruit/flower node at attachPos.
  const PEDI_BASE_R = 0.0014;
  const PEDI_TIP_R = 0.0010;
  const pedRadiiPedicel = [PEDI_BASE_R, PEDI_BASE_R * 0.85, PEDI_BASE_R * 0.7, PEDI_TIP_R];

  for (let slot = 0; slot < layout.items.length; slot++) {
    const item = layout.items[slot];
    const pedPts = pedicelControlPoints(item).map((p) => new Vector3(p.x, p.y, p.z));
    const attachVec = new Vector3(item.attachPos.x, item.attachPos.y, item.attachPos.z);

    const pedicelMesh = createCurvedTube(
      `${name}_pedicel_${slot}`, scene, pedPts, pedRadiiPedicel,
      { radialSegments: 6, color: PEDICEL_RGB },
    );
    if (pedicelMesh) {
      pedicelMesh.parent = root;
      pedicelMesh.material = getPedicelMat(scene);
    }

    if (item.kind === 'fruit') {
      const fruit = truss.fruits[item.index];
      const fruitNode = createFruitNode(
        `${name}_fruit_${item.index}`,
        scene,
        fruit,
        rng.fork(item.index + 1),
      );
      fruitNode.parent = root;
      fruitNode.position = attachVec;
      // Calyx star — pedicel direction (last 2 control points).
      const lastPed = pedPts[pedPts.length - 1];
      const prevPed = pedPts[pedPts.length - 2];
      addCalyxStar(scene, root, `${name}_calyx_${slot}`, lastPed, lastPed.subtract(prevPed).normalize(), item.fruitR);
    } else {
      const flower = truss.flowers[item.index];
      const petalDrop = flower.bloomProgress > 0.7
        ? Math.min(1, (flower.bloomProgress - 0.7) / 0.3)
        : 0;
      const ovarySwell = petalDrop * 0.8;
      const flowerNode = createFlowerNode(
        `${name}_flower_${item.index}`,
        scene,
        flower.bloomProgress,
        petalDrop,
        ovarySwell,
      );
      flowerNode.parent = root;
      flowerNode.position = attachVec;
    }
  }

  return root;
}

/**
 * Calyx (꽃받침) — 5 small green sepals radiating outward at the fruit-
 * pedicel junction. Matches SkeletonOverlay's calyx 5-ray star. Each
 * sepal is a thin plane oriented to fan outward at ~25° from the
 * pedicel's down-direction.
 *
 *   center: world position of the fruit attachment point (= calyx base)
 *   pedicelDir: unit vector along the pedicel's last segment (points
 *               *toward* the fruit; sepals fan back along this axis)
 *   fruitR: fruit radius — controls calyx size + slight back-offset so
 *           sepals sit on the fruit's calyx well rather than floating.
 */
function addCalyxStar(
  scene: Scene,
  parent: TransformNode,
  name: string,
  center: Vector3,
  pedicelDir: Vector3,
  fruitR: number,
): void {
  const sepalCount = 5;
  const sepalLen = Math.max(0.008, fruitR * 0.5);
  const sepalW = sepalLen * 0.35;
  const outwardAngle = (25 * Math.PI) / 180;
  // Build a perpendicular basis (perp, perp2) around -pedicelDir.
  const up = Math.abs(pedicelDir.y) > 0.95 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const perp = Vector3.Cross(pedicelDir, up).normalize();
  const perp2 = Vector3.Cross(pedicelDir, perp).normalize();
  // Slight back-offset: place calyx base 30% of fruitR back along pedicel.
  const calyxBase = center.subtract(pedicelDir.scale(fruitR * 0.3));
  for (let s = 0; s < sepalCount; s++) {
    const theta = (s / sepalCount) * Math.PI * 2;
    const outwardComp = Math.sin(outwardAngle);
    const backComp = -Math.cos(outwardAngle);
    const dir = pedicelDir.scale(backComp)
      .add(perp.scale(Math.cos(theta) * outwardComp))
      .add(perp2.scale(Math.sin(theta) * outwardComp))
      .normalize();
    const tip = calyxBase.add(dir.scale(sepalLen));
    const mid = calyxBase.add(dir.scale(sepalLen * 0.5));
    const sepal = MeshBuilder.CreatePlane(`${name}_s${s}`, { width: sepalW, height: sepalLen }, scene);
    sepal.parent = parent;
    sepal.position = mid;
    // Orient plane: normal perpendicular to the dir + perp.
    sepal.lookAt(tip);
    sepal.material = getCalyxMat(scene);
  }
}

const cachedCalyxMat: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getCalyxMat(scene: Scene): PBRMaterial {
  let m = cachedCalyxMat.get(scene);
  if (!m) {
    m = new PBRMaterial('calyxMat', scene);
    m.albedoColor = new Color3(CALYX_RGB.r, CALYX_RGB.g, CALYX_RGB.b);
    m.metallic = 0;
    m.roughness = 0.85;
    m.backFaceCulling = false;
    cachedCalyxMat.set(scene, m);
  }
  return m;
}

/**
 * 5-stage tomato flower:
 *   1. Bud         bloomProgress < 0.2  — petals closed, sepals dominate
 *   2. Opening     0.2 ≤ p < 0.5         — petals halfway, reflex starts
 *   3. Full bloom  0.5 ≤ p < 0.8         — petals fully spread, stigma out
 *   4. Petal fall  p ≥ 0.8 AND petalDropProgress > 0
 *                                       — petals drop & fade, sepals remain
 *   5. Ovary swell controlled by ovarySwellProgress (0–1)
 *                                       — small green sphere inside the sepals
 *                                         representing the developing fruit
 */
function createFlowerNode(
  name: string,
  scene: Scene,
  bloomProgress: number,
  petalDropProgress = 0,
  ovarySwellProgress = 0
): TransformNode {
  const root = new TransformNode(name, scene);
  const petalLen = 0.012 * Math.max(0.2, bloomProgress);
  const petalW = 0.005;
  const petalCount = 5;

  // Petals — visible while not fully dropped
  if (petalDropProgress < 0.99) {
    const dropFade = 1 - petalDropProgress;
    const dropY = -0.005 * petalDropProgress; // sag downward
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2;
      const petal = MeshBuilder.CreatePlane(
        `${name}_petal_${i}`,
        { width: petalW, height: petalLen * dropFade },
        scene
      );
      petal.parent = root;
      petal.position = new Vector3(
        Math.cos(angle) * petalLen * 0.4,
        dropY,
        Math.sin(angle) * petalLen * 0.4
      );
      petal.rotation.y = angle;
      // Reflex curl deepens with bloom, then extends down as it drops
      petal.rotation.x = -0.6 * bloomProgress - 0.4 * petalDropProgress;
      petal.material = getPetalMat(scene);
    }
  }

  // Sepals — always present (even after petal drop they stay)
  const sepalLen = petalLen * 0.7;
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2 + Math.PI / petalCount;
    const sepal = MeshBuilder.CreatePlane(
      `${name}_sepal_${i}`,
      { width: petalW * 0.6, height: sepalLen },
      scene
    );
    sepal.parent = root;
    sepal.position = new Vector3(
      Math.cos(angle) * sepalLen * 0.3,
      -0.001,
      Math.sin(angle) * sepalLen * 0.3
    );
    sepal.rotation.y = angle;
    sepal.rotation.x = -0.3;
    sepal.material = getSepalMat(scene);
  }

  // Ovary swelling — small green sphere appears as petals fall
  if (ovarySwellProgress > 0.01) {
    const ovarySize = 0.003 + ovarySwellProgress * 0.008; // 3mm → 11mm
    const ovary = MeshBuilder.CreateSphere(
      `${name}_ovary`,
      { diameter: ovarySize, segments: 8 },
      scene
    );
    ovary.parent = root;
    ovary.position = new Vector3(0, -0.002, 0);
    const ovaryMat = new PBRMaterial(`${name}_ovaryMat`, scene);
    ovaryMat.albedoColor = Color3.FromHexString('#3a8a30');
    ovaryMat.metallic = 0;
    ovaryMat.roughness = 0.5;
    ovary.material = ovaryMat;
  }

  return root;
}
