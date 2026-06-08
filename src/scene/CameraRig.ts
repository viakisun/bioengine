import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export interface CameraRig {
  camera: ArcRotateCamera;
  setPreset: (name: PresetView) => void;
  /** D11 — 동적 EE preset (store 파라미터 기반). */
  setEePresetDynamic: (params: EeCameraDynamicParams) => void;
  /** Pan to a specific bed X coordinate and zoom into a 'closeup' style. */
  focusZone: (centerX: number) => void;
}

// D11 (RFP §17) — Camera presets. 기존 5 + CameraDock 1~9 매핑용 9 확장.
//
// 산업용 카메라 사양 (사용자 피드백 — 적과·적심 로봇 통합 기준):
//   - EE (end-effector 부착 RGB): 60° FOV · 30~50cm working distance ·
//     베드 정면 정렬 (alpha=-π/2 = -Z 축, 통로 안에서 베드 응시)
//   - Head (자율주행 헤드 광각): 90° FOV · 1.5m working distance
//   - 망원 (Frustum 시각화): 35° FOV · 멀리서
//   - Top-down (drone perspective): 60° FOV
//   - Mask (segmentation): 평평한 정면, 60°
//
// Babylon ArcRotateCamera target 좌표는 plant-local. 식물 root=(0,0,0),
// 베드 top y=0.95m, 식물 trunk 중심 y=1.4~1.7m, 통로 폭 ~1.6m.

export type PresetView =
  | 'overview' | 'eye-level' | 'closeup' | 'robot-pov' | 'single-plant'
  | 'cam-1-obj' | 'cam-2-ee' | 'cam-3-head' | 'cam-4-top' | 'cam-5-side'
  | 'cam-6-depth' | 'cam-7-mask' | 'cam-8-frust' | 'cam-9-free';

interface PresetSpec {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
  /** 카메라 FOV (도). 미지정 시 setupCamera default 45°. */
  fovDeg?: number;
  /** UI 표시용 메타 — CameraDock tooltip에 들어감. */
  meta?: {
    workingDistanceM?: number;
    purpose?: string;
  };
}

const PRESETS: Record<PresetView, PresetSpec> = {
  // Legacy 5 (기존 호환).
  overview: { alpha: -Math.PI / 2, beta: 0.6, radius: 18, target: new Vector3(0, 2, 0) },
  'eye-level': { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.05, radius: 4.5, target: new Vector3(0, 1.6, 0) },
  closeup: { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.2, radius: 1.6, target: new Vector3(0, 1.5, 0) },
  'robot-pov': { alpha: 0, beta: Math.PI / 2.5, radius: 1.2, target: new Vector3(0, 1.8, 0) },
  'single-plant': {
    alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.18, radius: 5.0, target: new Vector3(0, 2.2, 0),
  },

  // D11 (사용자 피드백) — 산업용 카메라 사양 적용.

  // 1. Obj — 관찰자 객관 시점 (전체 식물 + 베드 일부).
  //    FOV 45° · 거리 6m · 약간 위에서.
  'cam-1-obj': {
    alpha: -Math.PI / 2, beta: 0.6, radius: 6.0,
    target: new Vector3(0, 1.5, 0),
    fovDeg: 45,
    meta: { workingDistanceM: 6.0, purpose: '관찰자 객관 (Orbit)' },
  },

  // 2. EE — end-effector 부착 RGB. 베드 정면 약 40cm에서 식물 응시.
  //    alpha=-π/2 (Z- 방향 = 통로 안에서 베드 응시) · beta≈π/2 (수평)
  //    radius=0.4 (베드 정면 30~50cm) · FOV 60° (산업용 RGB 표준)
  'cam-2-ee': {
    alpha: -Math.PI / 2,
    beta: Math.PI / 2 - 0.02,
    radius: 0.4,
    target: new Vector3(0, 1.4, 0),
    fovDeg: 60,
    meta: { workingDistanceM: 0.4, purpose: 'End-effector RGB · 작업 정밀' },
  },

  // 3. Head — 로봇 헤드 광각 (자율주행 전방 시야).
  //    헤드 위치 1.5m 앞, FOV 90° (광각).
  'cam-3-head': {
    alpha: -Math.PI / 2,
    beta: Math.PI / 2 - 0.08,
    radius: 1.5,
    target: new Vector3(0, 1.6, 0),
    fovDeg: 90,
    meta: { workingDistanceM: 1.5, purpose: 'Robot Head 광각 (자율주행)' },
  },

  // 4. Top — 베드 위에서 내려다봄 (drone perspective).
  //    FOV 60° · 거리 4m (좀 더 가깝게 + zone heatmap에 가까운 시점).
  'cam-4-top': {
    alpha: -Math.PI / 2, beta: 0.1, radius: 4.0,
    target: new Vector3(0, 0.95, 0),
    fovDeg: 60,
    meta: { workingDistanceM: 4.0, purpose: 'Top-down (drone)' },
  },

  // 5. Side — 식물 측면 (X+ 방향에서 봄, 베드 길이 방향).
  //    FOV 45° · 거리 2m.
  'cam-5-side': {
    alpha: 0, beta: Math.PI / 2 - 0.1, radius: 2.0,
    target: new Vector3(0, 1.5, 0),
    fovDeg: 45,
    meta: { workingDistanceM: 2.0, purpose: 'Side (베드 길이 방향)' },
  },

  // 6. Depth — depth 센서 시점 (EE와 같은 위치, 약간 비스듬).
  //    실제 RGB-D는 EE 옆에 부착 — alpha 약간 다름. radius·fov는 EE와 동일.
  'cam-6-depth': {
    alpha: -Math.PI / 2 + 0.15,
    beta: Math.PI / 2 - 0.02,
    radius: 0.4,
    target: new Vector3(0, 1.4, 0),
    fovDeg: 60,
    meta: { workingDistanceM: 0.4, purpose: 'Depth 센서 (RGB-D)' },
  },

  // 7. Mask — segmentation 캡처 시점 (정면 수평, FOV 60°).
  //    EE보다 좀 더 멀어서 식물 전체가 frame에 들어오도록.
  'cam-7-mask': {
    alpha: -Math.PI / 2,
    beta: Math.PI / 2 - 0.05,
    radius: 1.2,
    target: new Vector3(0, 1.5, 0),
    fovDeg: 60,
    meta: { workingDistanceM: 1.2, purpose: 'Mask 캡처 (segmentation)' },
  },

  // 8. Frust — 망원 시점 (멀리서 frustum cone 시각화).
  //    FOV 35° (망원) · 거리 8m.
  'cam-8-frust': {
    alpha: -Math.PI / 2 + 0.3, beta: 0.7, radius: 8.0,
    target: new Vector3(0, 1.3, 0),
    fovDeg: 35,
    meta: { workingDistanceM: 8.0, purpose: 'Frustum 시각화 (망원)' },
  },

  // 9. Free — 자유 시점 (사용자가 자유롭게 조작).
  //    FOV 50° (자연스러운 표준) · 거리 5m.
  'cam-9-free': {
    alpha: -Math.PI / 4, beta: Math.PI / 4, radius: 5.0,
    target: new Vector3(0, 1.5, 0),
    fovDeg: 50,
    meta: { workingDistanceM: 5.0, purpose: 'Free fly · 자유 조작' },
  },
};

/** D11 — CameraDock 1~9 → preset 매핑. */
export const DOCK_PRESETS: PresetView[] = [
  'cam-1-obj', 'cam-2-ee', 'cam-3-head', 'cam-4-top', 'cam-5-side',
  'cam-6-depth', 'cam-7-mask', 'cam-8-frust', 'cam-9-free',
];

/** D11 — Preset 메타 조회 (CameraDock tooltip 등). */
export function getPresetMeta(name: PresetView): { fovDeg: number; workingDistanceM: number; purpose: string } {
  const p = PRESETS[name];
  return {
    fovDeg: p.fovDeg ?? 45,
    workingDistanceM: p.meta?.workingDistanceM ?? p.radius,
    purpose: p.meta?.purpose ?? name,
  };
}

/**
 * D11 (사용자 피드백) — EE/Depth preset을 store 파라미터 기반 동적 계산.
 *
 * 산업 카메라 사양:
 *   - 베드 바로 앞 튜브레일 센터 (camera X·Z position)
 *   - 베드 substrate top + mountHeightCmAboveBed cm 위 (camera Y)
 *   - target = 식물 중심 (targetY)
 *   - 작물 다 보이게 → workingDistanceM 만큼 거리, FOV 반영해서 framing
 *
 * ArcRotateCamera convention:
 *   camera_position = target + radius * (sin(β)cos(α), cos(β), sin(β)sin(α))
 *   alpha=-π/2 (Z- 축, 통로 안에서 베드 응시) →
 *     camera_pos = target + (0, radius*cos(β), -radius*sin(β))
 *
 * 입력: bedTopY, mountHeightCm, workingDistanceM, targetY
 * 결과: { alpha, beta, radius, target } — Z- 방향에서 식물 정면 응시.
 */
export interface EeCameraDynamicParams {
  bedTopY: number;
  mountHeightCmAboveBed: number;
  workingDistanceM: number;
  targetY: number;
  fovDeg: number;
}

export function computeEePreset(params: EeCameraDynamicParams): {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
  fovDeg: number;
} {
  const cameraY = params.bedTopY + params.mountHeightCmAboveBed / 100;
  const dz = params.workingDistanceM; // 베드 정면 거리 (양수, camera는 -Z)
  //
  // ArcRotateCamera 공식 (alpha=-π/2일 때):
  //   camera_position - target = (0, radius·cos(β), -radius·sin(β))
  // 즉:
  //   cameraY - targetY = radius * cos(β)   ← camera가 target보다 위면 양수, 아래면 음수
  //   -workingDistance  = -radius * sin(β)  → sin(β) = workingDistance / radius (양수)
  //
  // β = atan2(sin(β), cos(β)) = atan2(workingDistance, cameraY - targetY)
  //
  // 기본 (EE 산업 사양): cameraY (1.31m) < targetY (1.8m) → cos(β) < 0 → β ∈ (π/2, π)
  //   = 카메라가 target 아래에서 위로 비스듬히 봄.
  //
  const dyCamMinusTarget = cameraY - params.targetY;
  const radius = Math.sqrt(dyCamMinusTarget * dyCamMinusTarget + dz * dz);
  const beta = Math.atan2(dz, dyCamMinusTarget);
  return {
    alpha: -Math.PI / 2,
    beta,
    radius,
    target: new Vector3(0, params.targetY, 0),
    fovDeg: params.fovDeg,
  };
}

export function setupCamera(scene: Scene, canvas: HTMLCanvasElement): CameraRig {
  const initial = PRESETS['eye-level'];

  const camera = new ArcRotateCamera(
    'cam',
    initial.alpha,
    initial.beta,
    initial.radius,
    initial.target.clone(),
    scene
  );
  camera.attachControl(canvas, true);
  camera.minZ = 0.05;
  camera.maxZ = 120;
  camera.wheelDeltaPercentage = 0.01;
  camera.pinchDeltaPercentage = 0.01;
  camera.lowerRadiusLimit = 0.3;
  camera.upperRadiusLimit = 50;
  camera.upperBetaLimit = Math.PI / 2 - 0.02;
  camera.lowerBetaLimit = 0.02;
  camera.fov = (45 * Math.PI) / 180;
  camera.useAutoRotationBehavior = false;
  camera.useBouncingBehavior = false;
  camera.useFramingBehavior = false;

  /**
   * Sub-target → wider beta limit 일시 확장.
   *   EE/Depth는 카메라가 target 아래에 위치 → β ∈ (π/2, π) 필요.
   *   다른 preset에서 ArcRotateCamera 사용자 drag로 ground 밑까지 가는 것 방지 default 제한 유지.
   */
  function setBetaLimitsFor(name: PresetView | 'ee-dynamic'): void {
    const isEeOrDepth =
      name === 'cam-2-ee' || name === 'cam-6-depth' || name === 'ee-dynamic';
    if (isEeOrDepth) {
      camera.upperBetaLimit = Math.PI - 0.02; // 0 ~ ~180° 자유
    } else {
      camera.upperBetaLimit = Math.PI / 2 - 0.02; // default (지면 위)
    }
  }

  return {
    camera,
    setPreset(name) {
      // ★ 사용자 피드백 fix 1 — preset에 따라 beta limit 동적 조정.
      setBetaLimitsFor(name);
      const p = PRESETS[name];
      camera.alpha = p.alpha;
      camera.beta = p.beta;
      camera.radius = p.radius;
      camera.target = p.target.clone();
      // D11 — preset 별 FOV 적용 (산업 카메라 사양).
      if (p.fovDeg !== undefined) {
        camera.fov = (p.fovDeg * Math.PI) / 180;
      }
    },
    /** D11 — 동적 EE preset (store 파라미터 반영). */
    setEePresetDynamic(params: EeCameraDynamicParams) {
      // ★ 사용자 피드백 fix 1 — limit 확장 (β > π/2 허용).
      setBetaLimitsFor('ee-dynamic');
      const p = computeEePreset(params);
      camera.alpha = p.alpha;
      camera.beta = p.beta;
      camera.radius = p.radius;
      camera.target = p.target;
      camera.fov = (p.fovDeg * Math.PI) / 180;
    },
    focusZone(centerX) {
      setBetaLimitsFor('eye-level');
      const p = PRESETS['eye-level'];
      camera.alpha = p.alpha;
      camera.beta = p.beta;
      camera.radius = 5.5;
      camera.target = new Vector3(centerX, 1.4, 0);
    },
  };
}
