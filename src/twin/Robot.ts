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
  armEnd: TransformNode;
  fovCone: Mesh;
  update: (day: number) => void;
  setFovVisible: (v: boolean) => void;
  currentTask: () => RobotTask;
  currentPosition: () => Vector3;
}

/**
 * AGV + 6DOF cobot styled after the actual rig in _ref/smartfarm.mp4
 * frame_07 (Kimje smartfarm trial): low wide white chassis, white
 * arm with dark joint covers, camera/sensor head at the end.
 */
export function createRobot(scene: Scene): RobotHandle {
  const root = new TransformNode('robot', scene);

  // === Materials ===
  const whiteMat = new PBRMaterial('robotWhite', scene);
  whiteMat.albedoColor = Color3.FromHexString('#e8e8e6');
  whiteMat.metallic = 0.1;
  whiteMat.roughness = 0.35;

  const darkMat = new PBRMaterial('robotDark', scene);
  darkMat.albedoColor = Color3.FromHexString('#1a1f28');
  darkMat.metallic = 0.4;
  darkMat.roughness = 0.35;

  const wheelMat = new PBRMaterial('robotWheel', scene);
  wheelMat.albedoColor = Color3.FromHexString('#1a1d23');
  wheelMat.metallic = 0.2;
  wheelMat.roughness = 0.8;

  const ledMat = new PBRMaterial('robotLed', scene);
  ledMat.albedoColor = Color3.FromHexString('#6ee7b7');
  ledMat.emissiveColor = Color3.FromHexString('#6ee7b7');
  ledMat.metallic = 0;
  ledMat.roughness = 0.4;

  // === AGV chassis (low wide platform) ===
  const chassisH = 0.32;
  const chassis = MeshBuilder.CreateBox(
    'chassis',
    { width: 0.65, height: chassisH, depth: 0.85 },
    scene
  );
  chassis.parent = root;
  chassis.position = new Vector3(0, chassisH / 2 + 0.08, 0);
  chassis.material = whiteMat;

  // Top deck (slightly recessed dark plate)
  const deck = MeshBuilder.CreateBox(
    'deck',
    { width: 0.55, height: 0.04, depth: 0.78 },
    scene
  );
  deck.parent = root;
  deck.position = new Vector3(0, chassisH + 0.08 + 0.022, 0);
  deck.material = darkMat;

  // Front LED strip
  const ledStrip = MeshBuilder.CreateBox(
    'ledStrip',
    { width: 0.55, height: 0.025, depth: 0.02 },
    scene
  );
  ledStrip.parent = root;
  ledStrip.position = new Vector3(0, chassisH / 2 + 0.08, -0.43);
  ledStrip.material = ledMat;

  // === 4 wheels ===
  const wheelPos: Array<[number, number, number]> = [
    [-0.35, 0.10, -0.32],
    [0.35, 0.10, -0.32],
    [-0.35, 0.10, 0.32],
    [0.35, 0.10, 0.32],
  ];
  for (let i = 0; i < wheelPos.length; i++) {
    const w = MeshBuilder.CreateCylinder(
      `wheel${i}`,
      { height: 0.12, diameter: 0.2 },
      scene
    );
    w.parent = root;
    w.position = new Vector3(...wheelPos[i]);
    w.rotation.z = Math.PI / 2;
    w.material = wheelMat;
  }

  // === Cobot arm — 6 links, mounted on the deck ===
  // Link 0: base column on deck
  const baseColumn = MeshBuilder.CreateCylinder(
    'armBase',
    { height: 0.12, diameter: 0.16 },
    scene
  );
  baseColumn.parent = root;
  baseColumn.position = new Vector3(0, chassisH + 0.08 + 0.04 + 0.06, 0.15);
  baseColumn.material = whiteMat;

  const armRoot = new TransformNode('armRoot', scene);
  armRoot.parent = root;
  armRoot.position = new Vector3(0, chassisH + 0.08 + 0.04 + 0.12, 0.15);

  // Link 1: shoulder pivot (vertical cyl)
  const shoulder = MeshBuilder.CreateCylinder(
    'shoulder',
    { height: 0.12, diameter: 0.13 },
    scene
  );
  shoulder.parent = armRoot;
  shoulder.position = new Vector3(0, 0.06, 0);
  shoulder.material = whiteMat;

  // Shoulder dark joint band
  const shoulderJoint = MeshBuilder.CreateTorus(
    'shoulderJoint',
    { diameter: 0.13, thickness: 0.025 },
    scene
  );
  shoulderJoint.parent = armRoot;
  shoulderJoint.position = new Vector3(0, 0.12, 0);
  shoulderJoint.material = darkMat;

  // Link 2: upper arm
  const upperArmNode = new TransformNode('upperArmNode', scene);
  upperArmNode.parent = armRoot;
  upperArmNode.position = new Vector3(0, 0.14, 0);
  upperArmNode.rotation.x = -0.5; // tilt forward

  const upperArm = MeshBuilder.CreateCylinder(
    'upperArm',
    { height: 0.42, diameter: 0.085 },
    scene
  );
  upperArm.parent = upperArmNode;
  upperArm.position = new Vector3(0, 0.21, 0);
  upperArm.material = whiteMat;

  // Elbow joint
  const elbowJoint = MeshBuilder.CreateSphere(
    'elbowJoint',
    { diameter: 0.11 },
    scene
  );
  elbowJoint.parent = upperArmNode;
  elbowJoint.position = new Vector3(0, 0.42, 0);
  elbowJoint.material = darkMat;

  // Link 3: forearm
  const forearmNode = new TransformNode('forearmNode', scene);
  forearmNode.parent = upperArmNode;
  forearmNode.position = new Vector3(0, 0.42, 0);
  forearmNode.rotation.x = 1.0; // bend at elbow

  const forearm = MeshBuilder.CreateCylinder(
    'forearm',
    { height: 0.35, diameter: 0.07 },
    scene
  );
  forearm.parent = forearmNode;
  forearm.position = new Vector3(0, 0.175, 0);
  forearm.material = whiteMat;

  // Link 4: wrist
  const wristNode = new TransformNode('wristNode', scene);
  wristNode.parent = forearmNode;
  wristNode.position = new Vector3(0, 0.35, 0);
  wristNode.rotation.x = -0.4;

  const wristJoint = MeshBuilder.CreateSphere(
    'wristJoint',
    { diameter: 0.08 },
    scene
  );
  wristJoint.parent = wristNode;
  wristJoint.material = darkMat;

  // Camera/sensor head (end effector)
  const armEnd = new TransformNode('armEnd', scene);
  armEnd.parent = wristNode;
  armEnd.position = new Vector3(0, 0.08, 0);

  const camHousing = MeshBuilder.CreateBox(
    'camHousing',
    { width: 0.11, height: 0.08, depth: 0.12 },
    scene
  );
  camHousing.parent = armEnd;
  camHousing.material = darkMat;

  const lens = MeshBuilder.CreateCylinder(
    'camLens',
    { height: 0.025, diameter: 0.045 },
    scene
  );
  lens.parent = armEnd;
  lens.position = new Vector3(0, 0, 0.07);
  lens.rotation.x = Math.PI / 2;
  const lensMat = new PBRMaterial('lensMat', scene);
  lensMat.albedoColor = Color3.FromHexString('#0a0d12');
  lensMat.metallic = 0.6;
  lensMat.roughness = 0.1;
  lens.material = lensMat;

  // Status LED ring on the camera housing
  const camLed = MeshBuilder.CreateTorus(
    'camLed',
    { diameter: 0.07, thickness: 0.008 },
    scene
  );
  camLed.parent = armEnd;
  camLed.position = new Vector3(0, 0.045, 0);
  camLed.rotation.x = Math.PI / 2;
  camLed.material = ledMat;

  // === FOV cone (RGB+Depth camera viewing frustum) ===
  const fovCone = MeshBuilder.CreateCylinder(
    'fovCone',
    { height: 1.4, diameterTop: 0.95, diameterBottom: 0.05, tessellation: 16 },
    scene
  );
  fovCone.parent = armEnd;
  fovCone.position = new Vector3(0, 0, 0.78);
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
      const colorHex = state.task === 'capturing'
        ? '#fbbf24'
        : state.task === 'returning'
          ? '#60a5fa'
          : '#6ee7b7';
      ledMat.albedoColor = Color3.FromHexString(colorHex);
      ledMat.emissiveColor = Color3.FromHexString(colorHex);
      fovMat.albedoColor = Color3.FromHexString(colorHex);
      fovMat.emissiveColor = Color3.FromHexString(colorHex);
    }

    fovCone.setEnabled(state.task === 'capturing');

    // Arm pose: subtly different per task
    if (state.task === 'capturing') {
      // Reach toward bed (lower forearm, level wrist)
      forearmNode.rotation.x = 1.3;
      wristNode.rotation.x = -0.7;
    } else {
      // Travel pose: tucked
      forearmNode.rotation.x = 0.8;
      wristNode.rotation.x = -0.3;
    }
  }

  return {
    root,
    armEnd,
    fovCone,
    update,
    setFovVisible(v) {
      fovCone.setEnabled(v && lastTask === 'capturing');
    },
    currentTask: () => lastTask,
    currentPosition: () => currentPos,
  };
}
