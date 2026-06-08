// W2.e·f (§18) — 신규 Robot mesh (Babylon 9 스타일).
//
// archive (`src/_archive/twin/Robot.ts`)는 사용하지 않고, 현대 Babylon 9 패턴으로
// AGV chassis + 6DOF arm + gripper + cutter 신규 모델링.
//
// 구조:
//   Robot (root TransformNode)
//   ├── chassis (Box 0.85m × 0.4m × 0.65m, 짙은 회색 PBR)
//   │   ├── wheel × 4 (Cylinder)
//   │   └── led (emissive sphere — 우측 상태등)
//   └── armBase (Cylinder Ø0.15 × 0.2)
//       └── joint-1 (sphere rotation cover)
//           └── link-1 (Cylinder Ø0.08 × 0.55)
//               └── joint-2
//                   └── link-2 (Ø0.07 × 0.45)
//                       └── joint-3
//                           └── eePivot (TransformNode — end-effector swap point)
//                               ├── gripper (default)
//                               └── cutter (swap target)

import { Scene } from '@babylonjs/core/scene';
import { Vector3, Color3 } from '@babylonjs/core/Maths/math';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';

export type EndEffectorKind = 'gripper' | 'cutter' | 'none';
export type RobotProfile = 'agv-arm' | 'phenotyping';

export interface RobotHandle {
  root: TransformNode;
  chassis: Mesh;
  eePivot: TransformNode;
  /** Phenotyping 짐벌 pivot — 외부에서 ArcRotateCamera 부착해 RTT/viewport 렌더 가능. */
  gimbalPivot: TransformNode;
  setEndEffector: (kind: EndEffectorKind) => void;
  setRailPosition: (railX: number) => void;
  /** Phenotyping 모드: 짐벌 카메라 pan 각도 (radian, 0=정면, +π/2=좌측, -π/2=우측). */
  setGimbalPan: (rad: number) => void;
  /** Phenotyping 모드: 'left' = 좌측 베드(Z+), 'right' = 우측 베드(Z-) 촬영. */
  setGimbalLookSide: (side: 'left' | 'right' | 'front') => void;
  dispose: () => void;
}

interface RobotConfig {
  /** Rail-mounted: 통로 안 z 좌표 (베드 옆). default -0.8 (통로 중심). */
  z?: number;
  /** chassis center y (legacy AGV용). phenotyping은 베드 높이 0.95 기준 자동. */
  y?: number;
  /** 초기 rail X. default 0. */
  x?: number;
  /** Robot profile — 'agv-arm' (작업로봇 6DOF) | 'phenotyping' (생육 모니터링).
   *  default 'phenotyping' (새 디자인). */
  profile?: RobotProfile;
}

// 베드 상단 (src/data/mockScenario.ts BED_Y) — phenotyping에서 chassis bottom 정렬.
const BED_TOP_Y = 0.95;

export function createRobot(scene: Scene, config: RobotConfig = {}): RobotHandle {
  const profile: RobotProfile = config.profile ?? 'phenotyping';
  const root = new TransformNode('robot:root', scene);
  // Phenotyping은 chassis가 베드 높이 → root.y=0 (world Y 직접 사용).
  // AGV는 기존 동작 유지 (root.y=0.3).
  const rootY = profile === 'phenotyping' ? 0 : (config.y ?? 0.3);
  root.position = new Vector3(config.x ?? 0, rootY, config.z ?? -0.8);

  // ── PBR 머티리얼 (Babylon 9 표준) ──
  const matChassis = new PBRMaterial('robot:mat:chassis', scene);
  matChassis.albedoColor = new Color3(0.32, 0.34, 0.38);
  matChassis.metallic = 0.6;
  matChassis.roughness = 0.45;

  const matArm = new PBRMaterial('robot:mat:arm', scene);
  matArm.albedoColor = new Color3(0.55, 0.58, 0.62);
  matArm.metallic = 0.85;
  matArm.roughness = 0.32;

  const matJoint = new PBRMaterial('robot:mat:joint', scene);
  matJoint.albedoColor = new Color3(0.14, 0.16, 0.18);
  matJoint.metallic = 0.3;
  matJoint.roughness = 0.65;

  const matWheel = new StandardMaterial('robot:mat:wheel', scene);
  matWheel.diffuseColor = new Color3(0.08, 0.08, 0.08);
  matWheel.specularColor = new Color3(0.1, 0.1, 0.1);

  const matEffector = new PBRMaterial('robot:mat:effector', scene);
  matEffector.albedoColor = new Color3(0.95, 0.45, 0.15); // 산업 표준 오렌지
  matEffector.metallic = 0.4;
  matEffector.roughness = 0.5;
  matEffector.emissiveColor = new Color3(0.25, 0.12, 0.04);

  const matLed = new StandardMaterial('robot:mat:led', scene);
  matLed.diffuseColor = new Color3(0.2, 0.9, 0.4);
  matLed.emissiveColor = new Color3(0.4, 0.95, 0.5);

  // ── Chassis ──
  // Phenotyping: 흰색 + chassis bottom = 베드 상단 (1.125 center)
  // AGV: 짙은 회색 (기존) + center Y = 0
  // Phenotyping chassis dimension은 스트럿 코너 (X=±0.27 · Z=±0.34)에 정확히 정렬:
  //   width 0.6 → 가장자리 X = ±0.30 (스트럿 안쪽으로 약간 여유)
  //   depth 0.7 → 가장자리 Z = ±0.35 (스트럿 안쪽으로 약간 여유)
  //   height 0.15 (얇은 trolley 형태 — 농부 시야 가리지 않음)
  const CHASSIS_W = profile === 'phenotyping' ? 0.6 : 0.85;
  const CHASSIS_H = profile === 'phenotyping' ? 0.15 : 0.4;
  const CHASSIS_D = profile === 'phenotyping' ? 0.7 : 0.65;
  const CHASSIS_CENTER_Y = profile === 'phenotyping' ? BED_TOP_Y + CHASSIS_H / 2 : 0;

  if (profile === 'phenotyping') {
    matChassis.albedoColor = new Color3(0.96, 0.96, 0.94);
    matChassis.metallic = 0.1;
    matChassis.roughness = 0.55;
  }

  const chassis = MeshBuilder.CreateBox(
    'robot:chassis',
    { width: CHASSIS_W, height: CHASSIS_H, depth: CHASSIS_D },
    scene,
  );
  chassis.material = matChassis;
  chassis.parent = root;
  chassis.position.y = CHASSIS_CENTER_Y;

  // ── Hybrid wheel system — 4 axle (모터 4), axle당 2휠 (외측 큰타이어 + 내측 튜브휠) ──
  //
  // TubeRail spec (src/scene/greenhouse/TubeRail.ts): gauge 0.55m · diameter 0.0483m
  //   → 튜브 윗면 Y = 0.0483m
  //   → 큰타이어 직경 0.24m → axle 중심 Y = 0.12m (chassis 기준 -0.2)
  //   → 튜브휠 반경 = 0.12 - 0.0483 = 0.0717m → 직경 0.143m
  //   → 튜브휠 Z 위치 = ±0.275m (gauge/2)
  //   → 큰타이어 Z 위치 = ±0.42m (외측)
  //
  // Axle 방향 = Z (차폭). wheel rotation axis = Z → rotation.x = π/2.
  // 좌측 axle과 우측 axle은 chassis 아래에서 분리 (관통 X). 모터 4개로 독립 구동.
  const BIG_R = 0.12;
  const BIG_W = 0.07;
  const HUB_R = 0.0717;
  const HUB_W = 0.05;
  const Z_OUTER = 0.42;
  const Z_INNER = 0.275; // TubeRail gauge/2
  const X_FRONT = 0.27;
  const X_REAR = -0.27;
  // phenotyping: wheel은 root에 parent, world Y = 0.12 (큰타이어 반경)
  // agv-arm:    wheel은 chassis(center Y=0)에 parent, chassis 기준 Y = -0.2
  const wheelParent = profile === 'phenotyping' ? root : chassis;
  const AXLE_Y = profile === 'phenotyping' ? BIG_R : -0.2;

  const matHub = new PBRMaterial('robot:mat:hub', scene);
  matHub.albedoColor = new Color3(0.65, 0.66, 0.68);
  matHub.metallic = 0.9;
  matHub.roughness = 0.35;

  for (const [px, side, tag] of [
    [X_FRONT, -1, 'f-left'],
    [X_FRONT, 1, 'f-right'],
    [X_REAR, -1, 'r-left'],
    [X_REAR, 1, 'r-right'],
  ] as const) {
    // 외측 큰 타이어 (바닥 닿음)
    const tire = MeshBuilder.CreateCylinder(
      `robot:tire-${tag}`,
      { diameter: BIG_R * 2, height: BIG_W, tessellation: 18 },
      scene,
    );
    tire.material = matWheel;
    tire.parent = wheelParent;
    tire.position = new Vector3(px, AXLE_Y, side * Z_OUTER);
    tire.rotation.x = Math.PI / 2; // axle = Z 방향

    // 내측 튜브휠 (튜브레일 hub)
    const hub = MeshBuilder.CreateCylinder(
      `robot:hub-${tag}`,
      { diameter: HUB_R * 2, height: HUB_W, tessellation: 14 },
      scene,
    );
    hub.material = matHub;
    hub.parent = wheelParent;
    hub.position = new Vector3(px, AXLE_Y, side * Z_INNER);
    hub.rotation.x = Math.PI / 2;

    // axle visual — 두 휠을 잇는 cylinder (Z 방향)
    const axleLen = Z_OUTER - Z_INNER;
    const axle = MeshBuilder.CreateCylinder(
      `robot:axle-${tag}`,
      { diameter: 0.025, height: axleLen, tessellation: 8 },
      scene,
    );
    axle.material = matJoint;
    axle.parent = wheelParent;
    axle.position = new Vector3(px, AXLE_Y, side * (Z_INNER + axleLen / 2));
    axle.rotation.x = Math.PI / 2;
  }

  // ── Phenotyping: 4개 검은 강관 스트럿 (chassis bottom → wheel axle) ──
  // 길이 = chassis bottom Y - axle Y = (BED_TOP_Y) - 0.12 = 0.83m
  // 코너 4개에 배치, axle hub 위쪽으로 연결.
  if (profile === 'phenotyping') {
    const strutLen = BED_TOP_Y - BIG_R; // 0.83
    const strutCenterY = BIG_R + strutLen / 2; // axle 위에서 chassis 아래까지 중심
    const strutMat = new PBRMaterial('robot:mat:strut', scene);
    strutMat.albedoColor = new Color3(0.05, 0.05, 0.05);
    strutMat.metallic = 0.85;
    strutMat.roughness = 0.4;

    for (const [px, side, tag] of [
      [X_FRONT, -1, 'f-left'],
      [X_FRONT, 1, 'f-right'],
      [X_REAR, -1, 'r-left'],
      [X_REAR, 1, 'r-right'],
    ] as const) {
      const strut = MeshBuilder.CreateCylinder(
        `robot:strut-${tag}`,
        { diameter: 0.06, height: strutLen, tessellation: 12 },
        scene,
      );
      strut.material = strutMat;
      strut.parent = root;
      // chassis 코너 ≈ inner corner (X·Z 안쪽으로 약간), Z는 튜브휠과 큰타이어 사이 ≈ 0.34
      strut.position = new Vector3(px, strutCenterY, side * 0.34);
    }
  }

  // Status LED (우상단)
  const led = MeshBuilder.CreateSphere(
    'robot:led',
    { diameter: 0.04, segments: 8 },
    scene,
  );
  led.material = matLed;
  led.parent = chassis;
  led.position = new Vector3(0.35, 0.22, 0.22);

  // ── 6DOF Arm — chassis 위에 mount (AGV 모드에서만) ──
  const armBase = MeshBuilder.CreateCylinder(
    'robot:arm-base',
    { diameter: 0.18, height: 0.18, tessellation: 16 },
    scene,
  );
  armBase.material = matJoint;
  armBase.parent = chassis;
  armBase.position = new Vector3(0, 0.3, 0);
  if (profile === 'phenotyping') armBase.setEnabled(false);

  const joint1 = MeshBuilder.CreateSphere(
    'robot:joint-1',
    { diameter: 0.14, segments: 12 },
    scene,
  );
  joint1.material = matJoint;
  joint1.parent = armBase;
  joint1.position = new Vector3(0, 0.12, 0);

  const link1 = MeshBuilder.CreateCylinder(
    'robot:link-1',
    { diameter: 0.09, height: 0.55, tessellation: 12 },
    scene,
  );
  link1.material = matArm;
  link1.parent = joint1;
  link1.rotation.z = -0.4; // 약간 기울임 (식물 쪽으로)
  link1.position = new Vector3(0.1, 0.25, 0);

  const joint2 = MeshBuilder.CreateSphere(
    'robot:joint-2',
    { diameter: 0.11, segments: 12 },
    scene,
  );
  joint2.material = matJoint;
  joint2.parent = link1;
  joint2.position = new Vector3(0, 0.3, 0);

  const link2 = MeshBuilder.CreateCylinder(
    'robot:link-2',
    { diameter: 0.075, height: 0.45, tessellation: 12 },
    scene,
  );
  link2.material = matArm;
  link2.parent = joint2;
  link2.rotation.z = 0.25;
  link2.position = new Vector3(-0.05, 0.22, 0);

  const joint3 = MeshBuilder.CreateSphere(
    'robot:joint-3',
    { diameter: 0.08, segments: 12 },
    scene,
  );
  joint3.material = matJoint;
  joint3.parent = link2;
  joint3.position = new Vector3(0, 0.24, 0);

  // ── End-effector pivot (swap point) ──
  const eePivot = new TransformNode('robot:ee-pivot', scene);
  eePivot.parent = joint3;
  eePivot.position = new Vector3(0, 0.1, 0);

  // ── Phenotyping gimbal camera (chassis 위 중앙) ──
  // Mount: 짧은 cylinder. Pan pivot (Y 회전), 그 위에 camera 박스.
  const gimbalPivot = new TransformNode('robot:gimbal-pivot', scene);
  gimbalPivot.parent = chassis;
  gimbalPivot.position = new Vector3(0, CHASSIS_H / 2 + 0.18, 0); // chassis top + 18cm
  let gimbalCameraMesh: Mesh | null = null;
  if (profile === 'phenotyping') {
    const gimbalMat = new PBRMaterial('robot:mat:gimbal', scene);
    gimbalMat.albedoColor = new Color3(0.12, 0.12, 0.13);
    gimbalMat.metallic = 0.7;
    gimbalMat.roughness = 0.4;

    // mount post
    const mount = MeshBuilder.CreateCylinder(
      'robot:gimbal-mount',
      { diameter: 0.05, height: 0.18, tessellation: 12 },
      scene,
    );
    mount.material = gimbalMat;
    mount.parent = chassis;
    mount.position = new Vector3(0, CHASSIS_H / 2 + 0.09, 0);

    // camera body (pan pivot 자식)
    const camBody = MeshBuilder.CreateBox(
      'robot:gimbal-camera',
      { width: 0.18, height: 0.12, depth: 0.14 },
      scene,
    );
    camBody.material = gimbalMat;
    camBody.parent = gimbalPivot;
    camBody.position = new Vector3(0, 0, 0);

    // lens (살짝 앞으로 튀어나옴) — 정면을 가리키는 cylinder
    const lensMat = new PBRMaterial('robot:mat:lens', scene);
    lensMat.albedoColor = new Color3(0.02, 0.05, 0.12);
    lensMat.metallic = 0.95;
    lensMat.roughness = 0.15;
    const lens = MeshBuilder.CreateCylinder(
      'robot:gimbal-lens',
      { diameter: 0.07, height: 0.08, tessellation: 16 },
      scene,
    );
    lens.material = lensMat;
    lens.parent = gimbalPivot;
    lens.rotation.x = Math.PI / 2; // Z 방향 (정면)
    lens.position = new Vector3(0, 0, 0.1);

    gimbalCameraMesh = camBody;
  }

  // 기본: gripper. setEndEffector로 교체.
  let currentEe: Mesh[] = [];

  function clearEe() {
    for (const m of currentEe) m.dispose();
    currentEe = [];
  }

  function buildGripper() {
    const head = MeshBuilder.CreateBox(
      'robot:ee:gripper-head',
      { width: 0.08, height: 0.05, depth: 0.05 },
      scene,
    );
    head.material = matEffector;
    head.parent = eePivot;
    head.position.y = 0.03;
    currentEe.push(head);

    // Two fingers
    for (const sign of [-1, 1] as const) {
      const finger = MeshBuilder.CreateBox(
        `robot:ee:gripper-finger-${sign}`,
        { width: 0.012, height: 0.06, depth: 0.025 },
        scene,
      );
      finger.material = matEffector;
      finger.parent = eePivot;
      finger.position = new Vector3(sign * 0.025, 0.085, 0);
      currentEe.push(finger);
    }
  }

  function buildCutter() {
    const body = MeshBuilder.CreateBox(
      'robot:ee:cutter-body',
      { width: 0.07, height: 0.05, depth: 0.04 },
      scene,
    );
    body.material = matEffector;
    body.parent = eePivot;
    body.position.y = 0.03;
    currentEe.push(body);

    // Blade (얇은 mesh)
    const blade = MeshBuilder.CreateBox(
      'robot:ee:cutter-blade',
      { width: 0.06, height: 0.005, depth: 0.025 },
      scene,
    );
    const matBlade = new PBRMaterial('robot:mat:blade', scene);
    matBlade.albedoColor = new Color3(0.85, 0.86, 0.88);
    matBlade.metallic = 0.95;
    matBlade.roughness = 0.15;
    blade.material = matBlade;
    blade.parent = eePivot;
    blade.position = new Vector3(0.04, 0.07, 0);
    blade.rotation.z = -0.5;
    currentEe.push(blade);
  }

  buildGripper();

  function setEndEffector(kind: EndEffectorKind): void {
    clearEe();
    if (kind === 'gripper') buildGripper();
    else if (kind === 'cutter') buildCutter();
    // 'none' → 빈 effector
  }

  function setRailPosition(railX: number): void {
    root.position.x = railX;
  }

  function setGimbalPan(rad: number): void {
    gimbalPivot.rotation.y = rad;
  }

  /** 좌측(+Z) / 우측(-Z) 베드를 lens가 가리키도록 pan.
   *  lens default = +Z 방향 (gimbal local). 따라서:
   *    'left'  (+Z 측면) = rotation.y = 0
   *    'right' (-Z 측면) = rotation.y = π
   *    'front' (+X 진행방향, 거의 안 씀) = -π/2
   */
  function setGimbalLookSide(side: 'left' | 'right' | 'front'): void {
    if (side === 'left') gimbalPivot.rotation.y = 0;
    else if (side === 'right') gimbalPivot.rotation.y = Math.PI;
    else gimbalPivot.rotation.y = -Math.PI / 2;
  }

  function dispose(): void {
    clearEe();
    root.dispose(false, true);
    [matChassis, matArm, matJoint, matWheel, matEffector, matLed].forEach((m) => m.dispose());
  }

  return {
    root,
    chassis,
    eePivot,
    gimbalPivot,
    setEndEffector,
    setRailPosition,
    setGimbalPan,
    setGimbalLookSide,
    dispose,
  };
}
