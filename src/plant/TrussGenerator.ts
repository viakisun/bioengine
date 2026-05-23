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

  // Peduncle 길이 + 부하 기반 droop (cantilever beam, computeTrussDroop)
  const peduncleLen = 0.10 + Math.min(0.10, totalItems * 0.012);
  const droopM = truss.fruits.length > 0
    ? computeTrussDroop(truss, genome)
    : 0.01;

  // Peduncle curve — parabolic cantilever: 4 control points along
  // [0, peduncleLen] with y = -droopM · t². Tip radius tapers from
  // 3mm at base to 2mm at tip.
  const PED_BASE_R = 0.0030;
  const PED_TIP_R = 0.0020;
  const pedControls: Vector3[] = [];
  const pedRadii: number[] = [];
  const PED_SAMPLES = 5;
  for (let i = 0; i < PED_SAMPLES; i++) {
    const t = i / (PED_SAMPLES - 1);
    pedControls.push(new Vector3(t * peduncleLen, cantileverY(droopM, t), 0));
    pedRadii.push(PED_BASE_R * (1 - t) + PED_TIP_R * t);
  }
  const peduncle = createCurvedTube(`${name}_peduncle`, scene, pedControls, pedRadii, {
    radialSegments: 8,
    color: PEDUNCLE_RGB,
  });
  if (peduncle) {
    peduncle.parent = root;
    peduncle.material = getPeduncleMat(scene);
  }

  // Distribute fruits / flowers along the peduncle
  const items: Array<{ kind: 'fruit' | 'flower'; index: number }> = [
    ...truss.fruits.map((_, i) => ({ kind: 'fruit' as const, index: i })),
    ...truss.flowers.map((_, i) => ({ kind: 'flower' as const, index: i })),
  ];

  // Cumulative-spacing layout — each fruit/flower must clear the
  // previous one's radius + a small gap. Tomimaru Muchoo at 80mm × 4
  // fruits needs ≥ 320mm of peduncle (we cap at peduncleLen * 0.95).
  // Z-jitter alternates left/right so adjacent fruits are visually
  // separated even when their X positions are close.
  const ITEM_GAP_M = 0.008;       // 8mm minimum air gap between items
  let prevX = 0;
  let prevR = 0;

  items.forEach((it, slot) => {
    // Per-item radius — fruits use their actual diameter; flowers use
    // a small fixed size (~6mm) because their meshes are tiny anyway.
    const fruitR = it.kind === 'fruit'
      ? truss.fruits[it.index].diameterMm / 2 / 1000
      : 0.006;

    // Desired position from equal distribution along the peduncle.
    const tDesired = items.length === 1 ? 0.6 : 0.3 + 0.7 * (slot / (items.length - 1));
    let xAlong = peduncleLen * tDesired;
    // Enforce minimum gap from previous item.
    if (slot > 0) {
      const minX = prevX + prevR + fruitR + ITEM_GAP_M;
      if (xAlong < minX) xAlong = minX;
    }
    // Clamp to peduncle range — anything past the tip just hangs at the
    // tip (the model already prunes excess fruits before we get here).
    if (xAlong > peduncleLen * 0.95) xAlong = peduncleLen * 0.95;

    // Z-jitter — alternate left/right by ~40% of the item's radius so
    // adjacent fruits never overlap even when their X positions sit
    // tight.
    const zJitter = (slot % 2 === 0 ? 1 : -1) * fruitR * 0.5;

    // Sag follows the actual xAlong (not the desired t), so a clamped
    // item still droops the right amount.
    const tActual = xAlong / peduncleLen;
    const sagAtT = cantileverY(droopM, tActual);
    const baseY = sagAtT;

    // Pedicel — Catmull-Rom 곡선 (4 control points).
    //   p0 = on peduncle (xAlong, baseY, zJitter)
    //   p1 = mid-flex (slight lateral)
    //   p2 = abscission joint (more droop)
    //   p3 = fruit center (full droop)
    // skeleton overlay 의 동일 위치 pattern 과 매칭.
    const pedicelLen = 0.025 + (it.kind === 'fruit' ? 0.015 : 0);
    const pedDroop = 0.005 + (it.kind === 'fruit' ? fruitR * 0.35 : 0.003);
    const sideJit = zJitter;                       // signed lateral
    const pedicelTip = new Vector3(
      xAlong + sideJit * 0.6,
      baseY - pedicelLen - (it.kind === 'fruit' ? fruitR * 0.5 : 0.005),
      zJitter,
    );
    const pedControls2: Vector3[] = [
      new Vector3(xAlong,                  baseY,                                     zJitter),
      new Vector3(xAlong + sideJit * 0.2,  baseY - pedicelLen * 0.30 - pedDroop * 0.15, zJitter),
      new Vector3(xAlong + sideJit * 0.45, baseY - pedicelLen * 0.65 - pedDroop * 0.55, zJitter),
      pedicelTip,
    ];
    const PEDI_BASE_R = 0.0014;
    const PEDI_TIP_R = 0.0010;
    const pedRadiiPedicel = [PEDI_BASE_R, PEDI_BASE_R * 0.85, PEDI_BASE_R * 0.7, PEDI_TIP_R];
    const pedicelMesh = createCurvedTube(
      `${name}_pedicel_${slot}`, scene, pedControls2, pedRadiiPedicel,
      { radialSegments: 6, color: PEDICEL_RGB },
    );
    if (pedicelMesh) {
      pedicelMesh.parent = root;
      pedicelMesh.material = getPedicelMat(scene);
    }

    if (it.kind === 'fruit') {
      const fruit = truss.fruits[it.index];
      const fruitNode = createFruitNode(
        `${name}_fruit_${it.index}`,
        scene,
        fruit,
        rng.fork(it.index + 1)
      );
      fruitNode.parent = root;
      fruitNode.position = pedicelTip;

      // Calyx — 5 sepal rays at the fruit-pedicel junction. Match skeleton
      // overlay's calyx star: 25° outward fan, evenly spaced around the
      // pedicel's last segment.
      addCalyxStar(scene, root, `${name}_calyx_${slot}`, pedicelTip, pedicelTip.subtract(pedControls2[2]).normalize(), fruitR);
    } else {
      const flower = truss.flowers[it.index];
      const petalDrop = flower.bloomProgress > 0.7
        ? Math.min(1, (flower.bloomProgress - 0.7) / 0.3)
        : 0;
      const ovarySwell = petalDrop * 0.8;
      const flowerNode = createFlowerNode(
        `${name}_flower_${it.index}`,
        scene,
        flower.bloomProgress,
        petalDrop,
        ovarySwell
      );
      flowerNode.parent = root;
      flowerNode.position = pedicelTip;
    }

    prevX = xAlong;
    prevR = fruitR;
  });

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
