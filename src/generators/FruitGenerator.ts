import * as THREE from 'three';
import { SeededRandom } from '../utils/SeededRandom';
import type { FruitState } from '../simulation/GrowthModel';

const BASE_SPHERE = new THREE.SphereGeometry(1, 12, 8);

// Create a slightly irregular fruit geometry
export function createFruitGeometry(rng: SeededRandom): THREE.BufferGeometry {
  const geo = BASE_SPHERE.clone();
  const pos = geo.getAttribute('position');

  // Add vertex noise for irregularity
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    const noise = 1 + rng.gaussian(0, 0.03); // ±3% irregularity
    pos.setXYZ(i, x * noise, y * noise, z * noise);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Create calyx (green star at top of fruit)
export function createCalyxGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  const petalCount = 5;
  const innerR = 0.3;
  const outerR = 1.2;
  const height = 0.2;

  // Center vertex at top
  positions.push(0, 1, 0);

  for (let i = 0; i < petalCount; i++) {
    const angle1 = (i / petalCount) * Math.PI * 2;
    const angle2 = ((i + 0.5) / petalCount) * Math.PI * 2;

    // Outer tip of petal
    positions.push(
      Math.cos(angle1) * outerR,
      1 + height,
      Math.sin(angle1) * outerR,
    );
    // Inner between petals
    positions.push(
      Math.cos(angle2) * innerR,
      1,
      Math.sin(angle2) * innerR,
    );
  }

  // Fan triangulation from center
  for (let i = 0; i < petalCount; i++) {
    const outer = 1 + i * 2;
    const inner = 2 + i * 2;
    const nextOuter = 1 + ((i + 1) % petalCount) * 2;
    indices.push(0, inner, outer);
    indices.push(0, nextOuter, inner);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Shared materials
export const fruitMaterial = new THREE.MeshStandardMaterial({
  roughness: 0.45,
  metalness: 0.0,
  color: 0x22781e,
});

export const calyxMaterial = new THREE.MeshStandardMaterial({
  color: 0x3a7a30,
  roughness: 0.8,
  metalness: 0.0,
});

export function fruitColorFromState(fruit: FruitState): THREE.Color {
  const c = fruit.color;
  return new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);
}

// Create a fruit mesh with calyx
export function createFruitMesh(
  fruit: FruitState,
  rng: SeededRandom,
): THREE.Group {
  const group = new THREE.Group();

  const radiusM = (fruit.diameterMm / 2) / 1000; // mm to meters

  // Fruit body
  const fruitGeo = createFruitGeometry(rng);
  const mat = fruitMaterial.clone();
  mat.color = fruitColorFromState(fruit);
  const fruitMesh = new THREE.Mesh(fruitGeo, mat);
  fruitMesh.scale.setScalar(radiusM);
  fruitMesh.castShadow = true;

  // Store picking metadata
  fruitMesh.userData = {
    type: 'fruit',
    ripenStage: fruit.ripenStage,
    diameterMm: fruit.diameterMm,
    isHarvestable: fruit.ripenStage >= 4,
  };

  group.add(fruitMesh);

  // Calyx (only for visible-size fruits)
  if (radiusM > 0.005) {
    const calyxGeo = createCalyxGeometry();
    const calyx = new THREE.Mesh(calyxGeo, calyxMaterial);
    calyx.scale.setScalar(radiusM * 0.4);
    calyx.position.y = radiusM * 0.8;
    group.add(calyx);
  }

  return group;
}
