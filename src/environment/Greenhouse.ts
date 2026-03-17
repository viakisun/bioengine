import * as THREE from 'three';

export function createGreenhouse(scene: THREE.Scene): void {
  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(60, 10);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a28,
    roughness: 0.85,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  const frameLength = 34;
  const frameWidth = 5;
  const frameHeight = 4;
  const ridgeHeight = 5;

  // Steel pipe material (replaces LineBasicMaterial for proper shadows)
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x777777,
    roughness: 0.4,
    metalness: 0.6,
  });

  // Polycarbonate roof panel material (transparent with light transmission)
  const roofMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8f8f0,
    transmission: 0.82,
    roughness: 0.12,
    thickness: 0.004,   // 4mm polycarbonate
    ior: 1.58,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.3,       // fallback for devices without transmission support
  });

  const pipeRadius = 0.02; // 40mm diameter pipe

  // Helper: create a pipe between two points
  function createPipe(p1: THREE.Vector3, p2: THREE.Vector3): THREE.Mesh {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, len, 6);
    geo.translate(0, len / 2, 0);

    const mesh = new THREE.Mesh(geo, pipeMat);
    mesh.position.copy(p1);

    // Orient pipe along direction
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
    mesh.quaternion.copy(quat);

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // A-frame ribs at 4m intervals
  const framePositions: THREE.Vector3[][] = [];
  for (let x = -frameLength / 2; x <= frameLength / 2; x += 4) {
    const points = [
      new THREE.Vector3(x, 0, -frameWidth / 2),
      new THREE.Vector3(x, frameHeight, -frameWidth / 2),
      new THREE.Vector3(x, ridgeHeight, 0),
      new THREE.Vector3(x, frameHeight, frameWidth / 2),
      new THREE.Vector3(x, 0, frameWidth / 2),
    ];
    framePositions.push(points);

    // Create pipes for each rib segment
    for (let i = 0; i < points.length - 1; i++) {
      scene.add(createPipe(points[i], points[i + 1]));
    }
  }

  // Longitudinal pipes: ridge, eaves
  for (let i = 0; i < framePositions.length - 1; i++) {
    const curr = framePositions[i];
    const next = framePositions[i + 1];

    // Ridge
    scene.add(createPipe(curr[2], next[2]));
    // Left eave
    scene.add(createPipe(curr[1], next[1]));
    // Right eave
    scene.add(createPipe(curr[3], next[3]));
  }

  // Transparent roof panels between ribs
  for (let i = 0; i < framePositions.length - 1; i++) {
    const curr = framePositions[i];
    const next = framePositions[i + 1];

    // Left slope panel (eave → ridge)
    addRoofPanel(scene, roofMat, curr[1], curr[2], next[2], next[1]);
    // Right slope panel (ridge → eave)
    addRoofPanel(scene, roofMat, curr[2], curr[3], next[3], next[2]);
  }
}

/** Create a quad roof panel from 4 corner points */
function addRoofPanel(
  scene: THREE.Scene,
  material: THREE.Material,
  p1: THREE.Vector3, p2: THREE.Vector3,
  p3: THREE.Vector3, p4: THREE.Vector3,
): void {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([
    p1.x, p1.y, p1.z,
    p2.x, p2.y, p2.z,
    p3.x, p3.y, p3.z,
    p4.x, p4.y, p4.z,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
}
