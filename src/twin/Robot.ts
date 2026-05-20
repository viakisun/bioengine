import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { getRobotStateAtDay, type RobotTask } from '../data/mockScenario';

export interface RobotHandle {
  root: TransformNode;
  fovCone: Mesh;
  update: (day: number) => void;
  setFovVisible: (v: boolean) => void;
  currentTask: () => RobotTask;
  currentPosition: () => Vector3;
}

export function createRobot(scene: Scene): RobotHandle {
  const root = new TransformNode('robot', scene);

  // Body (boxy AGV chassis)
  const chassis = MeshBuilder.CreateBox('robotChassis', { width: 0.5, height: 0.25, depth: 0.4 }, scene);
  chassis.parent = root;
  chassis.position = new Vector3(0, 0.18, 0);
  const chassisMat = new PBRMaterial('robotChassisMat', scene);
  chassisMat.albedoColor = Color3.FromHexString('#3a4250');
  chassisMat.metallic = 0.6;
  chassisMat.roughness = 0.4;
  chassis.material = chassisMat;

  // Top mast (camera mount)
  const mast = MeshBuilder.CreateCylinder('robotMast', { height: 1.5, diameter: 0.04 }, scene);
  mast.parent = root;
  mast.position = new Vector3(0, 0.18 + 0.75, 0);
  const mastMat = new PBRMaterial('robotMastMat', scene);
  mastMat.albedoColor = Color3.FromHexString('#888888');
  mastMat.metallic = 0.8;
  mastMat.roughness = 0.3;
  mast.material = mastMat;

  // Camera head (sensor pod)
  const head = MeshBuilder.CreateBox('robotHead', { width: 0.22, height: 0.12, depth: 0.18 }, scene);
  head.parent = root;
  head.position = new Vector3(0, 1.0, -0.15);
  const headMat = new PBRMaterial('robotHeadMat', scene);
  headMat.albedoColor = Color3.FromHexString('#1a1f28');
  headMat.metallic = 0.3;
  headMat.roughness = 0.4;
  head.material = headMat;

  // Status LED ring
  const led = MeshBuilder.CreateTorus('robotLed', { diameter: 0.18, thickness: 0.012 }, scene);
  led.parent = root;
  led.position = new Vector3(0, 1.06, -0.15);
  led.rotation.x = Math.PI / 2;
  const ledMat = new PBRMaterial('robotLedMat', scene);
  ledMat.albedoColor = Color3.FromHexString('#6ee7b7');
  ledMat.emissiveColor = Color3.FromHexString('#6ee7b7');
  ledMat.metallic = 0;
  ledMat.roughness = 0.4;
  led.material = ledMat;

  // Wheels (4 corners)
  const wheelMat = new PBRMaterial('robotWheelMat', scene);
  wheelMat.albedoColor = Color3.FromHexString('#1a1d23');
  wheelMat.metallic = 0.2;
  wheelMat.roughness = 0.8;
  const wheelPositions: Array<[number, number, number]> = [
    [-0.22, 0.06, -0.16],
    [0.22, 0.06, -0.16],
    [-0.22, 0.06, 0.16],
    [0.22, 0.06, 0.16],
  ];
  for (let i = 0; i < wheelPositions.length; i++) {
    const w = MeshBuilder.CreateCylinder(`robotWheel${i}`, { height: 0.08, diameter: 0.12 }, scene);
    w.parent = root;
    w.position = new Vector3(...wheelPositions[i]);
    w.rotation.z = Math.PI / 2;
    w.material = wheelMat;
  }

  // FOV cone (camera viewing frustum, transparent)
  const fovCone = MeshBuilder.CreateCylinder(
    'fovCone',
    { height: 2.5, diameterTop: 1.6, diameterBottom: 0.06, tessellation: 16 },
    scene
  );
  fovCone.parent = root;
  fovCone.position = new Vector3(0, 1.0, -1.4);
  fovCone.rotation.x = Math.PI / 2;
  const fovMat = new PBRMaterial('fovMat', scene);
  fovMat.albedoColor = Color3.FromHexString('#6ee7b7');
  fovMat.emissiveColor = Color3.FromHexString('#6ee7b7');
  fovMat.alpha = 0.12;
  fovMat.metallic = 0;
  fovMat.roughness = 0.5;
  fovMat.backFaceCulling = false;
  fovMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
  fovCone.material = fovMat;
  fovCone.isPickable = false;

  let lastTask: RobotTask = 'idle';
  const currentPos = new Vector3();

  function update(day: number) {
    const state = getRobotStateAtDay(day);
    currentPos.set(state.position[0], state.position[1], state.position[2]);
    root.position.copyFrom(currentPos);
    root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), state.heading);

    if (state.task !== lastTask) {
      lastTask = state.task;
      const ledColor = state.task === 'capturing'
        ? '#fbbf24'
        : state.task === 'returning'
          ? '#60a5fa'
          : '#6ee7b7';
      ledMat.albedoColor = Color3.FromHexString(ledColor);
      ledMat.emissiveColor = Color3.FromHexString(ledColor);
      fovMat.albedoColor = Color3.FromHexString(ledColor);
      fovMat.emissiveColor = Color3.FromHexString(ledColor);
    }

    fovCone.setEnabled(state.task === 'capturing');
  }

  return {
    root,
    fovCone,
    update,
    setFovVisible(v) {
      fovCone.setEnabled(v && lastTask === 'capturing');
    },
    currentTask: () => lastTask,
    currentPosition: () => currentPos,
  };
}
