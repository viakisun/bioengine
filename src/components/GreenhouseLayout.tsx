// GreenhouseLayout — single-plant scene host.
//
// Iter 35: AppMode 'single-plant' 단일이므로 mode 분기 모두 제거.
//   기존 greenhouse-only UI (TopBar/LabelOverlay/LayerDock/AnalysisPanel/
//   TimelinePanel/AppBrand) 는 src/_archive/components/로 이동.
//   Phase G에서 본 파일을 SinglePlantApp.tsx로 rename 예정.

import { SceneCanvas } from './SceneCanvas';

export function GreenhouseLayout() {
  return (
    <div
      className="app-grid"
      style={{
        gridTemplateRows: '1fr 0px',
        gridTemplateColumns: '1fr',
        ['--console-h' as string]: '0px',
      }}
    >
      <div className="app-scene-cell">
        <SceneCanvas />

        {/* Dev-mode FPS / backend HUD — hidden visually but the id-bearing
            spans must stay so BabylonEngine.runRenderLoop's
            document.getElementById('hud-fps' / 'hud-day' / 'hud-backend')
            updates keep flowing. (hud-robot Iter 35에 제거됨.) */}
        <div className="offscreen">
          <span id="hud-fps">-- fps</span>
          <span id="hud-backend">--</span>
          <span id="hud-day">Day --</span>
        </div>
      </div>
    </div>
  );
}
