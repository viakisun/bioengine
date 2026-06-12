// Iter 31 Phase R — 로봇 rail 위치 + dir 모듈 ref + gimbal cam viewport 동기.
//
// 매 프레임 변하는 값(railX, dir)을 Zustand store에 두면 GimbalView가 60fps로 리렌더 됨.
// 대신 모듈 스코프 ref 하나에 두고 BabylonEngine의 onBeforeRenderObservable과
// GimbalView의 슬라이더/WASD 핸들러가 동일 ref를 직접 mutate.
//
// gimbalCamRef: BabylonEngine 이 UniversalCamera 인스턴스를 등록 → GimbalView 의
//   DOM 프레임이 자기 bounding rect 으로 Babylon viewport 를 정확히 정렬.
//
// 사용 패턴:
//   - BabylonEngine boot: initRobotRail({ startX, rangeM })
//   - BabylonEngine 매 프레임: auto면 railRef.current 갱신, manual/paused면 그대로 사용
//   - GimbalView slider/WASD: nudgeRail(dx) / setRail(x)

export interface RobotRailState {
  current: number;
  rangeM: number;
  dir: 1 | -1;
}

export const railRef: RobotRailState = {
  current: 0,
  rangeM: 14,
  dir: 1,
};

export function initRobotRail(startX: number, rangeM: number): void {
  railRef.current = clampRail(startX, rangeM);
  railRef.rangeM = rangeM;
  railRef.dir = 1;
}

export function clampRail(x: number, rangeM = railRef.rangeM): number {
  return Math.max(-rangeM, Math.min(rangeM, x));
}

export function setRail(x: number): void {
  railRef.current = clampRail(x);
}

export function nudgeRail(dx: number): void {
  railRef.current = clampRail(railRef.current + dx);
}

// ── Gimbal cam viewport sync (DOM PiP frame ↔ Babylon viewport) ──────────

/** Babylon UniversalCamera 인스턴스 (gimbal cam). BabylonEngine 이 부팅 후 set. */
export const gimbalCamRef: {
  current: {
    viewport: { x: number; y: number; width: number; height: number };
  } | null;
} = { current: null };

/** GimbalView 의 DOM 프레임 bounding rect 을 받아 Babylon viewport (normalized 0..1,
 *  y는 bottom-up) 를 정확히 정렬. canvas 크기는 window.innerW/H 로 가정 (full-window canvas).
 *  Babylon은 매 프레임 자체 scissor + viewport 처리 → 즉시 다음 프레임에 반영. */
export function syncGimbalViewportToRect(rect: { left: number; top: number; width: number; height: number }): void {
  const cam = gimbalCamRef.current;
  if (!cam) return;
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  if (cw <= 0 || ch <= 0) return;
  cam.viewport.x = rect.left / cw;
  cam.viewport.y = (ch - rect.top - rect.height) / ch;
  cam.viewport.width = rect.width / cw;
  cam.viewport.height = rect.height / ch;
}
