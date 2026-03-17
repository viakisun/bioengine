import * as THREE from 'three';
import { SeededRandom } from '../utils/SeededRandom';
import type { TrussState } from '../simulation/GrowthModel';
import type { PlantGenome } from '../simulation/PlantGenome';
import { computeTrussDroop } from '../simulation/PhysicsModel';
import { createFruitMesh } from './FruitGenerator';

const flowerMaterial = new THREE.MeshStandardMaterial({
  color: 0xf0d040,
  roughness: 0.7,
  metalness: 0.0,
  side: THREE.DoubleSide,
});

const petalWhiteMaterial = new THREE.MeshStandardMaterial({
  color: 0xf8f0a0,
  roughness: 0.7,
  metalness: 0.0,
  side: THREE.DoubleSide,
});

const peduncleMaterial = new THREE.MeshStandardMaterial({
  color: 0x4a8a30,
  roughness: 0.8,
  metalness: 0.0,
});

const pedicelMaterial = new THREE.MeshStandardMaterial({
  color: 0x5a9a40,
  roughness: 0.8,
  metalness: 0.0,
});

// Botanically accurate tomato flower: 5-6 strongly reflexed yellow petals
function createFlowerMesh(bloomProgress: number, rng: SeededRandom): THREE.Group {
  const group = new THREE.Group();
  const petalCount = 5 + (rng.next() > 0.7 ? 1 : 0);
  const petalLen = 0.018 * bloomProgress;
  const petalWidth = 0.007 * bloomProgress;

  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    // Tapered petal: 4x3 subdivision for smooth curving
    const petalGeo = new THREE.PlaneGeometry(petalWidth, petalLen, 3, 4);

    const posArr = petalGeo.getAttribute('position');
    for (let v = 0; v < posArr.count; v++) {
      const x = posArr.getX(v);
      const y = posArr.getY(v);

      // Taper: narrow at base, widest at 60%, pointed at tip
      const tNorm = (y / petalLen) + 0.5; // 0=base, 1=tip
      let taperFactor: number;
      if (tNorm < 0.6) {
        taperFactor = 0.4 + 0.6 * Math.sin((tNorm / 0.6) * Math.PI * 0.5);
      } else {
        taperFactor = 1.0 - 0.7 * ((tNorm - 0.6) / 0.4);
      }
      posArr.setX(v, x * taperFactor);

      // Strong reflex curl (tomato petals curl backward ~70-90°)
      const reflexT = Math.max(0, tNorm - 0.2) / 0.8;
      const reflexAngle = reflexT * reflexT * 1.8 * bloomProgress; // strong backward curl
      posArr.setZ(v, Math.sin(reflexAngle) * petalLen * 0.5);

      // Slight longitudinal furrow along center
      const centerDist = Math.abs(x) / (petalWidth * 0.5);
      posArr.setZ(v, posArr.getZ(v) - (1 - centerDist) * 0.001 * bloomProgress);
    }
    posArr.needsUpdate = true;
    petalGeo.computeVertexNormals();

    petalGeo.translate(0, petalLen / 2, 0);
    const petal = new THREE.Mesh(petalGeo, flowerMaterial);
    petal.rotation.z = angle;
    petal.rotation.x = rng.range(-0.1, 0.1);
    group.add(petal);
  }

  // Staminal cone (fused anthers) — cylindrical with slight taper
  const coneRadius = 0.0025 * bloomProgress;
  const coneHeight = 0.007 * bloomProgress;
  const coneGeo = new THREE.CylinderGeometry(
    coneRadius * 0.6, coneRadius, coneHeight, 6,
  );
  coneGeo.translate(0, coneHeight / 2, 0);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x7a6018, roughness: 0.5 });
  group.add(new THREE.Mesh(coneGeo, coneMat));

  // Pistil (style + stigma emerging from staminal cone)
  if (bloomProgress > 0.5) {
    const pistilGeo = new THREE.CylinderGeometry(0.0004, 0.0006, coneHeight * 1.4, 4);
    pistilGeo.translate(0, coneHeight * 0.7 + coneHeight * 0.3, 0);
    const pistilMat = new THREE.MeshStandardMaterial({ color: 0x5a8a30, roughness: 0.7 });
    group.add(new THREE.Mesh(pistilGeo, pistilMat));
  }

  // Sepals (green, behind/below petals)
  if (bloomProgress > 0.3) {
    const sepalCount = 5;
    const sepalLen = 0.013 * bloomProgress;
    const sepalWidth = 0.004 * bloomProgress;
    for (let i = 0; i < sepalCount; i++) {
      const sAngle = (i / sepalCount) * Math.PI * 2 + Math.PI / petalCount;
      const sepalGeo = new THREE.PlaneGeometry(sepalWidth, sepalLen);
      sepalGeo.translate(0, sepalLen / 2, 0);
      const sepalMat = new THREE.MeshStandardMaterial({
        color: 0x2a6a20, roughness: 0.8, side: THREE.DoubleSide,
      });
      const sepal = new THREE.Mesh(sepalGeo, sepalMat);
      sepal.rotation.z = sAngle;
      sepal.rotation.x = rng.range(0.3, 0.6);
      sepal.position.y = -0.002;
      group.add(sepal);
    }
  }

  return group;
}

// Create a calyx (persistent sepals on fruit)
function createCalyx(fruitRadius: number, rng: SeededRandom): THREE.Group {
  const group = new THREE.Group();
  const sepalCount = 5;
  const sepalLen = Math.max(0.008, fruitRadius * 1.2);
  const sepalWidth = sepalLen * 0.35;

  for (let i = 0; i < sepalCount; i++) {
    const angle = (i / sepalCount) * Math.PI * 2;
    const sepalGeo = new THREE.PlaneGeometry(sepalWidth, sepalLen);
    sepalGeo.translate(0, sepalLen / 2, 0);
    const sepalMat = new THREE.MeshStandardMaterial({
      color: 0x3a7a28, roughness: 0.8, side: THREE.DoubleSide,
    });
    const sepal = new THREE.Mesh(sepalGeo, sepalMat);
    sepal.rotation.z = angle;
    sepal.rotation.x = rng.range(0.3, 0.8);
    group.add(sepal);
  }

  return group;
}

export function generateTruss(
  truss: TrussState,
  trussDirection: THREE.Vector3,
  rng: SeededRandom,
  genome?: PlantGenome,
): THREE.Group {
  const group = new THREE.Group();

  const totalItems = truss.flowers.length + truss.fruits.length;

  // Peduncle: real tomato 10-20cm, curves downward under weight
  const pedLen = 0.12 + rng.range(-0.02, 0.02);
  // Physics-based droop from cantilever beam model
  const droopAmount = genome
    ? computeTrussDroop(truss, genome)
    : 0.03 + truss.fruits.reduce((sum, f) => sum + f.diameterMm, 0) / 1000 * 0.15;

  // Peduncle curve: starts horizontal from stem, arcs outward and droops
  const pedPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(
      trussDirection.x * pedLen * 0.3,
      -0.005,
      trussDirection.z * pedLen * 0.3,
    ),
    new THREE.Vector3(
      trussDirection.x * pedLen * 0.65,
      -droopAmount * 0.4,
      trussDirection.z * pedLen * 0.65,
    ),
    new THREE.Vector3(
      trussDirection.x * pedLen,
      -droopAmount,
      trussDirection.z * pedLen,
    ),
  ];

  const pedCurve = new THREE.CatmullRomCurve3(pedPoints, false, 'catmullrom', 0.5);
  // Peduncle: tapered tube, thicker at stem (3.5mm) → thinner at tip (2mm)
  // Real tomato peduncle is woody-green, stiffer than pedicels
  const pedSegs = 12;
  const pedGeo = new THREE.TubeGeometry(pedCurve, pedSegs, 0.003, 5, false);
  // Apply taper by adjusting radii along the tube
  const pedPosAttr = pedGeo.getAttribute('position');
  const radialVerts = 6; // 5 radial segments + 1 wrap
  for (let seg = 0; seg <= pedSegs; seg++) {
    const t = seg / pedSegs;
    // Taper: 1.15 at base → 0.7 at tip
    const taper = 1.15 - t * 0.45;
    const centerIdx = seg * radialVerts;
    // Get center of this ring by averaging all ring vertices
    let cx = 0, cy = 0, cz = 0;
    for (let r = 0; r < radialVerts; r++) {
      const vi = centerIdx + r;
      cx += pedPosAttr.getX(vi);
      cy += pedPosAttr.getY(vi);
      cz += pedPosAttr.getZ(vi);
    }
    cx /= radialVerts; cy /= radialVerts; cz /= radialVerts;
    // Scale each vertex relative to ring center
    for (let r = 0; r < radialVerts; r++) {
      const vi = centerIdx + r;
      const dx = pedPosAttr.getX(vi) - cx;
      const dy = pedPosAttr.getY(vi) - cy;
      const dz = pedPosAttr.getZ(vi) - cz;
      pedPosAttr.setXYZ(vi, cx + dx * taper, cy + dy * taper, cz + dz * taper);
    }
  }
  pedPosAttr.needsUpdate = true;
  pedGeo.computeVertexNormals();
  const pedMesh = new THREE.Mesh(pedGeo, peduncleMaterial);
  group.add(pedMesh);

  // Get points along peduncle for branching pedicels
  const pedCurvePoints = pedCurve.getPoints(20);

  // Distribute flowers and fruits along the peduncle (not all at the tip)
  // Real tomato: items branch off at intervals along the peduncle
  const itemCount = Math.max(totalItems, truss.flowers.length + truss.fruits.length);

  // Place flowers along peduncle
  truss.flowers.forEach((flower, fi) => {
    const t = 0.4 + 0.6 * ((fi + 0.5) / Math.max(1, itemCount));
    const ptIdx = Math.min(Math.floor(t * 20), 19);
    const branchPoint = pedCurvePoints[ptIdx].clone();

    // Pedicel: 2-5cm sub-stem from peduncle to flower
    const pedicelLen = 0.025 + rng.range(-0.008, 0.008);
    const pedicelAngle = rng.range(-0.8, 0.8);
    const pedicelDir = new THREE.Vector3(
      trussDirection.x * Math.cos(pedicelAngle) - trussDirection.z * Math.sin(pedicelAngle),
      rng.range(-0.3, -0.1),
      trussDirection.z * Math.cos(pedicelAngle) + trussDirection.x * Math.sin(pedicelAngle),
    ).normalize();

    const pedicelEnd = branchPoint.clone().add(pedicelDir.multiplyScalar(pedicelLen));

    // Pedicel geometry (thin tube)
    const pedicelCurve = new THREE.CatmullRomCurve3([
      branchPoint,
      branchPoint.clone().lerp(pedicelEnd, 0.5).add(new THREE.Vector3(0, rng.range(-0.005, 0.002), 0)),
      pedicelEnd,
    ], false, 'catmullrom', 0.5);
    const pedicelGeo = new THREE.TubeGeometry(pedicelCurve, 4, 0.0012, 4, false);
    group.add(new THREE.Mesh(pedicelGeo, pedicelMaterial));

    // Flower at end of pedicel
    const flowerMesh = createFlowerMesh(flower.bloomProgress, rng);
    flowerMesh.position.copy(pedicelEnd);
    // Face outward/downward
    flowerMesh.rotation.x = rng.range(0.3, 0.8);
    group.add(flowerMesh);
  });

  // Place fruits along peduncle
  truss.fruits.forEach((fruit, fi) => {
    const t = 0.4 + 0.6 * ((fi + 0.5) / Math.max(1, itemCount));
    const ptIdx = Math.min(Math.floor(t * 20), 19);
    const branchPoint = pedCurvePoints[ptIdx].clone();

    const radiusM = (fruit.diameterMm / 2) / 1000;
    const gravity = radiusM * 0.8;

    // Pedicel: real tomato pedicel 3-6cm, thickens with fruit weight
    const pedicelLen = 0.035 + rng.range(-0.01, 0.01);
    const pedicelAngle = rng.range(-0.7, 0.7);
    const pedicelDir = new THREE.Vector3(
      trussDirection.x * Math.cos(pedicelAngle) - trussDirection.z * Math.sin(pedicelAngle),
      rng.range(-0.4, -0.15) - gravity * 2,
      trussDirection.z * Math.cos(pedicelAngle) + trussDirection.x * Math.sin(pedicelAngle),
    ).normalize();

    const pedicelEnd = branchPoint.clone().add(pedicelDir.multiplyScalar(pedicelLen));

    // Pedicel with knee joint (abscission zone — characteristic bend in tomato pedicel)
    const kneePoint = branchPoint.clone().lerp(pedicelEnd, 0.6);
    kneePoint.y -= gravity * 0.3;
    const pedicelCurve = new THREE.CatmullRomCurve3([
      branchPoint,
      branchPoint.clone().lerp(kneePoint, 0.5),
      kneePoint,
      pedicelEnd,
    ], false, 'catmullrom', 0.5);
    // Thicker pedicel for fruit-bearing: 1.5-2mm radius
    const pedicelRadius = 0.0015 + radiusM * 0.02;
    const pedicelGeo = new THREE.TubeGeometry(pedicelCurve, 6, pedicelRadius, 4, false);
    group.add(new THREE.Mesh(pedicelGeo, pedicelMaterial));

    // Fruit at end of pedicel
    const fruitGroup = createFruitMesh(fruit, rng);
    fruitGroup.position.copy(pedicelEnd);
    group.add(fruitGroup);

    // Calyx (green sepals on top of fruit)
    if (radiusM > 0.005) {
      const calyx = createCalyx(radiusM, rng);
      calyx.position.copy(pedicelEnd);
      calyx.position.y += radiusM * 0.8;
      group.add(calyx);
    }
  });

  return group;
}
