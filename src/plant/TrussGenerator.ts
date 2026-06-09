import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { SeededRandom } from '@farmsim/tomato-engine';
import { createLogger } from '../utils/logger';

const log = createLogger('plant');
import { createFruitNode } from '../scene/fruit/FruitGenerator';
import { qualityFromFruitDistance } from '../scene/fruit';
import { getFruitSpec } from '../data/fruit';
const tomatoFruitSpec = getFruitSpec('tomato.json');
import { computeTrussDroop } from '@farmsim/tomato-engine';
import { ACTIVE_MODEL } from '@farmsim/tomato-engine/ModelRegistry';
import type { TrussState } from '@farmsim/tomato-engine';
import type { PlantGenome } from '@farmsim/tomato-engine';
import { createCurvedTube } from '../scene/stem/StemGenerator';

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
 *
 * @deprecated v4.0 layout. PlantBase v4.1 (peduncleCurve / rachisCurve /
 * floralSites) is the active path. Still invoked from PlantBase to populate
 * legacy fields read by SkeletonOverlay's v4.0 fallback (unreachable in
 * practice) — removal scheduled for Phase F.
 */
export function layoutTruss(truss: TrussState, genome: PlantGenome): TrussLayout {
  const totalItems = truss.fruits.length + truss.flowers.length;
  // Real tomato truss peduncle 5-15cm. Previous 10-20cm + thick wireframe
  // made trusses read as side branches in skeleton view.
  const peduncleLen = 0.06 + Math.min(0.05, totalItems * 0.006);
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

  const ITEM_GAP_M = 0.004;        // 4mm minimum clear between adjacent fruits
  let prevX = 0;
  let prevR = 0;

  for (let slot = 0; slot < sortedItems.length; slot++) {
    const it = sortedItems[slot];
    const fruitR = it.kind === 'fruit'
      ? truss.fruits[it.index].diameterMm / 2 / 1000
      : 0.006;

    // Desired position — fruits/flowers spaced from 40% to 100% along
    // the peduncle so the first fruit sits well past the calyx base
    // and the last fruit reaches the tip. Real trusses are linear
    // arrays, not end-clusters.
    const tDesired = sortedItems.length === 1
      ? 0.7
      : 0.4 + 0.6 * (slot / (sortedItems.length - 1));
    let xAlong = peduncleLen * tDesired;
    if (slot > 0) {
      const minX = prevX + prevR + fruitR + ITEM_GAP_M;
      if (xAlong < minX) xAlong = minX;
    }
    // Allow the last fruit to extend past the peduncle tip via its
    // pedicel rather than being mashed against 95% — real trusses
    // hang fruit from a short rachis stub past the last branch point.
    if (xAlong > peduncleLen) xAlong = peduncleLen;

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
 *
 * @deprecated v4.0 path. v4.1 stores `pedicelCurve` directly on
 * `FloralSiteBase`. Still used by `layoutTruss` legacy field population.
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
// Iter 35 PR 2 Phase L — createTrussNode (v4.0 legacy) 제거.
//   v4.1 createTrussNodeFromBase (SkinMesh + ShowcasePlant 공유 path)로 통합 완료.
//   ShowcasePlant archive 후 v4.1만 사용 (legacy 호출처 0).

/**
 * v4.1 — build a lush truss mesh from a PlantBase TrussBase. Uses the
 * 3-tier cymose geometry (peduncle / rachis / per-site pedicel + organ)
 * computed once in PlantBase, so Skeleton + Lush + Supporting render
 * identical world positions. Replaces createTrussNode's reliance on
 * layoutTruss / PlantState directly.
 */
export function createTrussNodeFromBase(
  name: string,
  scene: Scene,
  trussBase: import('./PlantBase').TrussBase,
  rng: SeededRandom,
  opts?: { tubeDivisions?: number },
): TransformNode {
  const root = new TransformNode(name, scene);
  if (!trussBase.peduncleCurve || !trussBase.rachisCurve || !trussBase.floralSites) {
    return root;
  }

  const anatomy = ACTIVE_MODEL.trussAnatomy;
  const toV3 = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);
  const tubeDivisions = opts?.tubeDivisions;  // undefined → StemGenerator default(4)

  // Tier 1: peduncle.
  const pedRadii = [
    anatomy.peduncle.radiusM,
    anatomy.peduncle.radiusM * 0.92,
    anatomy.peduncle.radiusM * 0.82,
    anatomy.rachis.radiusBaseM,
  ];
  const peduncleMesh = createCurvedTube(
    `${name}_peduncle`, scene, trussBase.peduncleCurve.map(toV3), pedRadii,
    { radialSegments: 8, color: PEDUNCLE_RGB, divisionsPerSeg: tubeDivisions },
  );
  if (peduncleMesh) {
    peduncleMesh.parent = root;
    peduncleMesh.material = getPeduncleMat(scene);
  }

  // Tier 2: rachis (cymose zigzag).
  const rachisRadii = trussBase.rachisCurve.map((_, i, arr) => {
    const t = arr.length <= 1 ? 0 : i / (arr.length - 1);
    return anatomy.rachis.radiusBaseM * (1 - t) + anatomy.rachis.radiusTipM * t;
  });
  const rachisMesh = createCurvedTube(
    `${name}_rachis`, scene, trussBase.rachisCurve.map(toV3), rachisRadii,
    { radialSegments: 6, color: PEDUNCLE_RGB, divisionsPerSeg: tubeDivisions },
  );
  if (rachisMesh) {
    rachisMesh.parent = root;
    rachisMesh.material = getPeduncleMat(scene);
  }

  // Tier 3: per floral site.
  const pedicelRadii = [
    anatomy.pedicel.radiusBaseM,
    anatomy.pedicel.radiusBaseM * 0.85,
    anatomy.pedicel.radiusBaseM * 0.7,
    anatomy.pedicel.radiusTipM,
  ];
  for (const site of trussBase.floralSites) {
    // v4.2 — aborted: no anatomy at all. harvested: pedicel-only (empty
    // peduncle stub, no fruit body / calyx). All other stages render fully.
    if (site.stage === 'aborted') continue;

    // Pedicel mesh — drawn for every non-aborted stage including harvested.
    if (site.pedicelCurve.length >= 4) {
      const pedicelMesh = createCurvedTube(
        `${name}_pedicel_${site.index}`, scene,
        site.pedicelCurve.map(toV3), pedicelRadii,
        { radialSegments: 6, color: PEDICEL_RGB, divisionsPerSeg: tubeDivisions },
      );
      if (pedicelMesh) {
        pedicelMesh.parent = root;
        pedicelMesh.material = getPedicelMat(scene);
      }
    }

    if (site.stage === 'harvested') continue;  // pedicel-only marker.

    const fruitTopV = toV3(site.fruitTop);
    const axisDirV = toV3(site.fruitAxisDir);

    // Stage-driven organ mesh.
    switch (site.stage) {
      case 'bud':
      case 'flowering':
      case 'petal-drop': {
        if (!site.flower) break;
        const flowerNode = createFlowerNode(
          `${name}_flower_${site.index}`, scene,
          site.flower.bloomProgress, site.flower.petalDrop, site.flower.ovarySwell,
        );
        flowerNode.parent = root;
        flowerNode.position = fruitTopV;
        break;
      }
      case 'fruit-set':
      case 'fruit-growing':
      case 'ripening': {
        if (site.fruit && site.fruit.diameterMm > 0) {
          const fruitState: import('@farmsim/tomato-engine').FruitState = {
            index: site.index,
            diameterMm: site.fruit.diameterMm,
            ripenStage: site.fruit.ripenStage,
            ripenFraction: site.fruit.ripenFraction,
            color: site.fruit.color,
            age: 0,
            cultivarGenome: site.fruit.cultivarGenome,
          };
          // ★ L7-B-1 (S66) — distance-based LOD.
          const fruitCam = scene.activeCamera;
          const fruitDistM = fruitCam
            ? Vector3.Distance(fruitCam.position, toV3(site.fruit.fruitCenter))
            : 10;
          const fruitLod = qualityFromFruitDistance(fruitDistM);
          const fruitNode = createFruitNode(
            `${name}_fruit_${site.index}`, scene, fruitState, rng.fork(site.index + 1),
            tomatoFruitSpec,
            { skipCalyxAndStem: true, lod: fruitLod },
          );
          const fruitCenterV = toV3(site.fruit.fruitCenter);
          fruitNode.parent = root;
          fruitNode.position = fruitCenterV;

          // body local +Y는 stem-end pole. fruitAxisDir은 fruitTop → fruitCenter
          // 방향이므로, local +Y를 -fruitAxisDir(= fruitCenter → fruitTop)에 맞춰
          // 회전. 그 축을 중심으로 golden-angle azimuth를 줘 시각적 반복 회피.
          const targetUp = axisDirV.scale(-1).normalize();
          const tilt = Quaternion.FromUnitVectorsToRef(
            Vector3.Up(), targetUp, new Quaternion(),
          );
          const azimuth = Quaternion.RotationAxis(
            targetUp, ((site.index * 137.5) + calyxHash(site.index, site.fruit.diameterMm / 1000, 11) * 18) * Math.PI / 180,
          );
          const droopAxis = Vector3.Cross(targetUp, Vector3.Down());
          const droopAngle = droopAxis.lengthSquared() > 1e-6
            ? Math.min(0.026, Math.pow(site.fruit.diameterMm / 80, 2) * 0.018)
            : 0;
          const droop = droopAngle > 0
            ? Quaternion.RotationAxis(droopAxis.normalize(), droopAngle)
            : Quaternion.Identity();
          fruitNode.rotationQuaternion = droop.multiply(tilt).multiply(azimuth);

          // Dev-only orientation guard. Wrong quaternion product order or
          // wrong axisDir interpretation can silently make things worse.
          if (import.meta.env?.DEV && site.index === 0) {
            const probe = Vector3.Up();
            probe.applyRotationQuaternionInPlace(fruitNode.rotationQuaternion);
            const dot = Vector3.Dot(probe.normalize(), targetUp);
            if (dot < 0.999) {
              log.warn(
                `fruit rotation: local +Y not aligned with -fruitAxisDir `
                + `(dot=${dot.toFixed(4)}). Try azimuth.multiply(tilt).`,
              );
            }
          }

          // Calyx star at fruit top — sepals reflex opposite fruitAxisDir.
          const sepalDir = fruitTopV.subtract(fruitCenterV).normalize();
          addCalyxStar(
            scene, root, `${name}_calyx_${site.index}`,
            fruitTopV, sepalDir, site.fruit.diameterMm / 2 / 1000,
            fruitLod, site.index, sepalDir,
          );
        }
        // fruit-set: also render small petal remnants if flower data present.
        if (site.stage === 'fruit-set' && site.flower) {
          const flowerNode = createFlowerNode(
            `${name}_petal_remnant_${site.index}`, scene,
            site.flower.bloomProgress, site.flower.petalDrop, site.flower.ovarySwell,
          );
          flowerNode.parent = root;
          flowerNode.position = fruitTopV;
        }
        break;
      }
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
type CalyxVariant =
  | 'calyx_5_a'
  | 'calyx_5_b'
  | 'calyx_6_a'
  | 'calyx_6_b'
  | 'calyx_7_a'
  | 'calyx_7_b'
  | 'calyx_5_simple';

type CalyxTint = 'young' | 'mature' | 'dull';

const cachedCalyxSource: WeakMap<Scene, Map<string, Mesh>> = new WeakMap();

function calyxHash(index: number, fruitR: number, salt: number): number {
  const x = Math.sin((index + 1) * 12.9898 + Math.round(fruitR * 100000) * 78.233 + salt * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

function chooseCalyxVariant(index: number, fruitR: number, lod: 'high' | 'low' | 'ultraLow'): CalyxVariant | null {
  if (lod === 'ultraLow') return null;
  if (lod === 'low') return 'calyx_5_simple';
  const variants: CalyxVariant[] = [
    'calyx_5_a', 'calyx_5_b',
    'calyx_6_a', 'calyx_6_b',
    'calyx_7_a', 'calyx_7_b',
  ];
  return variants[Math.floor(calyxHash(index, fruitR, 1) * variants.length) % variants.length];
}

function chooseCalyxTint(index: number, fruitR: number): CalyxTint {
  const h = calyxHash(index, fruitR, 2);
  if (h < 0.25) return 'young';
  if (h > 0.78) return 'dull';
  return 'mature';
}

function buildCrownFrame(crownAxis: Vector3): { axis: Vector3; tangentU: Vector3; tangentV: Vector3 } {
  const axis = crownAxis.normalize();
  const ref = Math.abs(Vector3.Dot(axis, Vector3.Up())) < 0.9
    ? Vector3.Up()
    : new Vector3(1, 0, 0);
  const tangentU = Vector3.Cross(ref, axis).normalize();
  const tangentV = Vector3.Cross(axis, tangentU).normalize();
  return { axis, tangentU, tangentV };
}

function buildCombinedCalyxVertexData(variant: CalyxVariant): VertexData {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const count = variant.includes('_6_') ? 6 : variant.includes('_7_') ? 7 : 5;
  const simple = variant === 'calyx_5_simple';
  const alt = variant.endsWith('_b') ? 1 : 0;
  const rows = simple ? 2 : 4;
  const cols = 3;
  const lengthBase = simple ? 0.42 : 0.62 + alt * 0.04;
  const spreadBase = simple ? 0.42 : 0.62 + alt * 0.05;
  const widthBase = simple ? 0.13 : 0.18;
  const baseR = 0.055;

  // Small central cap at the crown root. Local +Y points outward from the fruit.
  const centerIdx = positions.length / 3;
  positions.push(0, 0.006, 0);
  colors.push(0.13, 0.22, 0.10, 1);

  for (let s = 0; s < count; s++) {
    const theta = (s / count) * Math.PI * 2 + alt * 0.12;
    const radial = new Vector3(Math.cos(theta), 0, Math.sin(theta));
    const lateral = new Vector3(-Math.sin(theta), 0, Math.cos(theta));
    const baseStart = positions.length / 3;
    const sepalLen = lengthBase * (0.90 + 0.18 * calyxHash(s + count * alt, lengthBase, 3));
    const sepalSpread = spreadBase * (0.92 + 0.14 * calyxHash(s, spreadBase, 4));
    const sepalWidth = widthBase * (0.86 + 0.18 * calyxHash(s, sepalLen, 5));
    const curl = simple ? 0.006 : 0.014 + 0.006 * calyxHash(s, sepalLen, 6);
    const baseY = 0.012 + 0.006 * calyxHash(s, sepalLen, 7);
    const tipY = 0.024 + 0.011 * calyxHash(s, sepalLen, 8);

    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1);
      const rowWidth = sepalWidth * (1 - t * 0.78);
      const rowLift = baseY + (tipY - baseY) * t + curl * Math.sin(t * Math.PI);
      const radialDist = baseR + sepalSpread * t;
      for (let c = 0; c < cols; c++) {
        const u = c / (cols - 1);
        const side = (u - 0.5) * rowWidth;
        const foldLift = (1 - Math.abs(u - 0.5) * 2) * (simple ? 0.002 : 0.004) * (1 - t * 0.35);
        const p = radial.scale(radialDist).add(lateral.scale(side));
        positions.push(p.x, rowLift + foldLift, p.z);
        const baseShade = 1 - t;
        const tipShade = t;
        colors.push(
          0.14 + 0.16 * tipShade,
          0.25 + 0.28 * tipShade - 0.05 * baseShade,
          0.10 + 0.08 * tipShade,
          1,
        );
      }
    }

    // Close the base to the central cap.
    indices.push(centerIdx, baseStart, baseStart + cols - 1);
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = baseStart + r * cols + c;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    }
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.colors = colors;
  return vd;
}

function getCalyxSource(scene: Scene, variant: CalyxVariant, tint: CalyxTint): Mesh {
  let bucket = cachedCalyxSource.get(scene);
  if (!bucket) {
    bucket = new Map();
    cachedCalyxSource.set(scene, bucket);
  }
  const key = `${variant}:${tint}`;
  const cached = bucket.get(key);
  if (cached) return cached;

  const m = new Mesh(`calyx_src_${key}`, scene);
  buildCombinedCalyxVertexData(variant).applyToMesh(m);
  m.material = getCalyxMat(scene, tint);
  m.useVertexColors = true;
  m.isVisible = false;
  m.alwaysSelectAsActiveMesh = true;
  bucket.set(key, m);
  return m;
}

function addCalyxStar(
  scene: Scene,
  parent: TransformNode,
  name: string,
  center: Vector3,
  crownAxis: Vector3,
  fruitR: number,
  lod: 'high' | 'low' | 'ultraLow' = 'high',
  stableIndex = 0,
  expectedOutward?: Vector3,
): void {
  const variant = chooseCalyxVariant(stableIndex, fruitR, lod);
  if (variant === null) return;
  const tint = chooseCalyxTint(stableIndex, fruitR);
  const src = getCalyxSource(scene, variant, tint);
  const calyx = src.createInstance(`${name}_${variant}`);
  const outward = expectedOutward?.clone().normalize();
  let axis = crownAxis.clone().normalize();
  if (outward) {
    const dot = Vector3.Dot(axis, outward);
    if (dot < 0) {
      axis = axis.scale(-1);
    } else if (import.meta.env?.DEV && dot < 0.8) {
      log.warn(`calyx axis weakly aligned with fruitTop-center outward axis (dot=${dot.toFixed(3)})`);
    }
  }
  const frame = buildCrownFrame(axis);
  const tilt = Quaternion.FromUnitVectorsToRef(Vector3.Up(), frame.axis, new Quaternion());
  const roll = Quaternion.RotationAxis(frame.axis, calyxHash(stableIndex, fruitR, 9) * Math.PI * 2);
  const surfaceLift = fruitR * (lod === 'low' ? 0.012 : 0.016);
  calyx.parent = parent;
  calyx.position = center.add(frame.axis.scale(surfaceLift));
  calyx.rotationQuaternion = tilt.multiply(roll);
  const scale = Math.max(0.006, fruitR);
  calyx.scaling.set(scale, scale, scale);
}

const cachedCalyxMat: WeakMap<Scene, Map<CalyxTint, PBRMaterial>> = new WeakMap();
function getCalyxMat(scene: Scene, tint: CalyxTint = 'mature'): PBRMaterial {
  let bucket = cachedCalyxMat.get(scene);
  if (!bucket) {
    bucket = new Map();
    cachedCalyxMat.set(scene, bucket);
  }
  let m = bucket.get(tint);
  if (!m) {
    m = new PBRMaterial(`calyxMat_${tint}`, scene);
    const mult = tint === 'young' ? 1.16 : tint === 'dull' ? 0.78 : 1.0;
    m.albedoColor = new Color3(
      Math.min(1, CALYX_RGB.r * mult),
      Math.min(1, CALYX_RGB.g * mult),
      Math.min(1, CALYX_RGB.b * mult),
    );
    m.metallic = 0;
    m.roughness = 0.85;
    m.backFaceCulling = false;
    bucket.set(tint, m);
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

// ─────────────────────────────────────────────────────────────────────────
// createTrussFruitOrgansOnly — SSOT Phase 4 sibling of createTrussNodeFromBase
//
// Used by SkinMeshPlant (PlantSkinMesh handles peduncle/rachis/pedicel via
// continuous SDF mesh, so this function renders ONLY the non-stem organs:
// fruit body / calyx / flower / petal remnant / ovary).
//
// Intentionally a near-copy of the organ-emit portion of createTrussNodeFromBase.
// Per plan SSOT Phase 4 "완전한 분기" — createTrussNodeFromBase itself is
// untouched (ShowcasePlant path unaffected).
// ─────────────────────────────────────────────────────────────────────────

export function createTrussFruitOrgansOnly(
  name: string,
  scene: Scene,
  trussBase: import('./PlantBase').TrussBase,
  rng: SeededRandom,
): TransformNode {
  const root = new TransformNode(name, scene);
  if (!trussBase.floralSites) return root;

  const toV3 = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);

  for (const site of trussBase.floralSites) {
    // aborted / harvested: no organ. (skin mesh handles pedicel for harvested.)
    if (site.stage === 'aborted' || site.stage === 'harvested') continue;

    const fruitTopV = toV3(site.fruitTop);
    const axisDirV = toV3(site.fruitAxisDir);

    switch (site.stage) {
      case 'bud':
      case 'flowering':
      case 'petal-drop': {
        if (!site.flower) break;
        const flowerNode = createFlowerNode(
          `${name}_flower_${site.index}`, scene,
          site.flower.bloomProgress, site.flower.petalDrop, site.flower.ovarySwell,
        );
        flowerNode.parent = root;
        flowerNode.position = fruitTopV;
        break;
      }
      case 'fruit-set':
      case 'fruit-growing':
      case 'ripening': {
        if (site.fruit && site.fruit.diameterMm > 0) {
          const fruitState: import('@farmsim/tomato-engine').FruitState = {
            index: site.index,
            diameterMm: site.fruit.diameterMm,
            ripenStage: site.fruit.ripenStage,
            ripenFraction: site.fruit.ripenFraction,
            color: site.fruit.color,
            age: 0,
            cultivarGenome: site.fruit.cultivarGenome,
          };
          // ★ L7-B-1 (S66) — distance-based LOD.
          const fruitCam = scene.activeCamera;
          const fruitDistM = fruitCam
            ? Vector3.Distance(fruitCam.position, toV3(site.fruit.fruitCenter))
            : 10;
          const fruitLod = qualityFromFruitDistance(fruitDistM);
          const fruitNode = createFruitNode(
            `${name}_fruit_${site.index}`, scene, fruitState, rng.fork(site.index + 1),
            tomatoFruitSpec,
            { skipCalyxAndStem: true, lod: fruitLod },
          );
          const fruitCenterV = toV3(site.fruit.fruitCenter);
          fruitNode.parent = root;
          fruitNode.position = fruitCenterV;

          // body local +Y is stem-end pole; orient so it aligns with -fruitAxisDir.
          const targetUp = axisDirV.scale(-1).normalize();
          const tilt = Quaternion.FromUnitVectorsToRef(
            Vector3.Up(), targetUp, new Quaternion(),
          );
          const azimuth = Quaternion.RotationAxis(
            targetUp, ((site.index * 137.5) + calyxHash(site.index, site.fruit.diameterMm / 1000, 11) * 18) * Math.PI / 180,
          );
          const droopAxis = Vector3.Cross(targetUp, Vector3.Down());
          const droopAngle = droopAxis.lengthSquared() > 1e-6
            ? Math.min(0.026, Math.pow(site.fruit.diameterMm / 80, 2) * 0.018)
            : 0;
          const droop = droopAngle > 0
            ? Quaternion.RotationAxis(droopAxis.normalize(), droopAngle)
            : Quaternion.Identity();
          fruitNode.rotationQuaternion = droop.multiply(tilt).multiply(azimuth);

          // Calyx star at fruit top — sepals reflex opposite fruitAxisDir.
          const sepalDir = fruitTopV.subtract(fruitCenterV).normalize();
          addCalyxStar(
            scene, root, `${name}_calyx_${site.index}`,
            fruitTopV, sepalDir, site.fruit.diameterMm / 2 / 1000,
            fruitLod, site.index, sepalDir,
          );
        }
        if (site.stage === 'fruit-set' && site.flower) {
          const flowerNode = createFlowerNode(
            `${name}_petal_remnant_${site.index}`, scene,
            site.flower.bloomProgress, site.flower.petalDrop, site.flower.ovarySwell,
          );
          flowerNode.parent = root;
          flowerNode.position = fruitTopV;
        }
        break;
      }
    }
  }

  return root;
}
