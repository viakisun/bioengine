import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export interface CameraRig {
  camera: ArcRotateCamera;
  setPreset: (name: PresetView) => void;
  /** Pan to a specific bed X coordinate and zoom into a 'closeup' style. */
  focusZone: (centerX: number) => void;
}

export type PresetView = 'overview' | 'eye-level' | 'closeup' | 'robot-pov' | 'single-plant';

const PRESETS: Record<PresetView, { alpha: number; beta: number; radius: number; target: Vector3 }> = {
  overview: { alpha: -Math.PI / 2, beta: 0.6, radius: 18, target: new Vector3(0, 2, 0) },
  'eye-level': { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.05, radius: 4.5, target: new Vector3(0, 1.6, 0) },
  closeup: { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.2, radius: 1.6, target: new Vector3(0, 1.5, 0) },
  'robot-pov': { alpha: 0, beta: Math.PI / 2.5, radius: 1.2, target: new Vector3(0, 1.8, 0) },
  // Single-plant analysis 모드 전용 — plant 전체 (높이 ~3m) + 베드/
  // cocopeat 가 함께 보이는 거리. plant 중심을 target 으로 약간 위
  // 에서 내려다봄.
  'single-plant': {
    alpha: -Math.PI / 2,
    beta: Math.PI / 2 - 0.18,
    radius: 5.0,
    target: new Vector3(0, 2.2, 0),
  },
};

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

  return {
    camera,
    setPreset(name) {
      const p = PRESETS[name];
      camera.alpha = p.alpha;
      camera.beta = p.beta;
      camera.radius = p.radius;
      camera.target = p.target.clone();
    },
    focusZone(centerX) {
      const p = PRESETS['eye-level'];
      camera.alpha = p.alpha;
      camera.beta = p.beta;
      camera.radius = 5.5;
      camera.target = new Vector3(centerX, 1.4, 0);
    },
  };
}
