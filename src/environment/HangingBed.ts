import * as THREE from 'three';

const BED_LENGTH = 30; // meters
const BED_WIDTH = 0.3;
const BED_HEIGHT = 0.12;
const BED_Y = 0.6; // height off ground
const WIRE_TOP_Y = 3.5;

export function createHangingBed(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();

  // Bed container (coco coir)
  const bedGeo = new THREE.BoxGeometry(BED_LENGTH, BED_HEIGHT, BED_WIDTH);
  const bedMat = new THREE.MeshStandardMaterial({
    color: 0x5c4030,
    roughness: 0.85,
    metalness: 0.0,
  });
  const bed = new THREE.Mesh(bedGeo, bedMat);
  bed.position.set(0, BED_Y, 0);
  bed.castShadow = true;
  bed.receiveShadow = true;
  group.add(bed);

  // Coco coir top surface (slightly different color)
  const topGeo = new THREE.PlaneGeometry(BED_LENGTH, BED_WIDTH);
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x6b5240,
    roughness: 0.98,
    metalness: 0.0,
  });
  const top = new THREE.Mesh(topGeo, topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.set(0, BED_Y + BED_HEIGHT / 2 + 0.001, 0);
  group.add(top);

  // Support brackets every 3 meters
  const bracketMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 0.4,
    metalness: 0.6,
  });
  for (let x = -BED_LENGTH / 2; x <= BED_LENGTH / 2; x += 3) {
    // Vertical pole
    const poleGeo = new THREE.CylinderGeometry(0.015, 0.015, BED_Y, 6);
    const pole = new THREE.Mesh(poleGeo, bracketMat);
    pole.position.set(x, BED_Y / 2, BED_WIDTH / 2 + 0.02);
    group.add(pole);

    // Upper support to wire
    const upperGeo = new THREE.CylinderGeometry(0.01, 0.01, WIRE_TOP_Y - BED_Y, 6);
    const upper = new THREE.Mesh(upperGeo, bracketMat);
    upper.position.set(x, BED_Y + (WIRE_TOP_Y - BED_Y) / 2, 0);
    group.add(upper);
  }

  // Training wire (horizontal along bed length at WIRE_TOP_Y)
  const wireMat = new THREE.LineDashedMaterial({
    color: 0x999999,
    dashSize: 0.1,
    gapSize: 0.05,
    linewidth: 1,
  });
  const wirePoints = [
    new THREE.Vector3(-BED_LENGTH / 2, WIRE_TOP_Y, 0),
    new THREE.Vector3(BED_LENGTH / 2, WIRE_TOP_Y, 0),
  ];
  const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePoints);
  const wire = new THREE.Line(wireGeo, wireMat);
  wire.computeLineDistances();
  group.add(wire);

  // Vertical training strings every 35cm (for each plant position)
  const stringMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
  const spacing = 0.35;
  for (let x = -BED_LENGTH / 2 + spacing / 2; x < BED_LENGTH / 2; x += spacing) {
    const stringPoints = [
      new THREE.Vector3(x, BED_Y + BED_HEIGHT / 2, 0),
      new THREE.Vector3(x, WIRE_TOP_Y, 0),
    ];
    const stringGeo = new THREE.BufferGeometry().setFromPoints(stringPoints);
    group.add(new THREE.Line(stringGeo, stringMat));
  }

  // Label
  group.userData = {
    bedLength: BED_LENGTH,
    bedY: BED_Y,
    bedHeight: BED_HEIGHT,
    wireTopY: WIRE_TOP_Y,
    plantSpacing: spacing,
  };

  scene.add(group);
  return group;
}

export function getPlantPositions(bedGroup: THREE.Group): THREE.Vector3[] {
  const { bedLength, bedY, bedHeight, plantSpacing } = bedGroup.userData;
  const positions: THREE.Vector3[] = [];
  for (let x = -bedLength / 2 + plantSpacing / 2; x < bedLength / 2; x += plantSpacing) {
    positions.push(new THREE.Vector3(x, bedY + bedHeight / 2, 0));
  }
  return positions;
}
