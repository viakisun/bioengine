// SinglePlantApp — single-plant scene host (Phase Q3에서 GreenhouseLayout → rename).
//
// Iter 35: AppMode 'single-plant' 단일이므로 mode 분기 모두 제거.
//   기존 greenhouse-only UI (TopBar/LabelOverlay/LayerDock/AnalysisPanel/
//   TimelinePanel/AppBrand) 는 src/_archive/components/로 이동 (PR 1).

import { SceneCanvas } from './SceneCanvas';

export function SinglePlantApp() {
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
            document.getElementById('hud-fps' / 'hud-backend') updates keep flowing.
            Iter 35 PR 4 Phase Q2: hud-day 제거 (currentDay store field 부재). */}
        <div className="offscreen">
          <span id="hud-fps">-- fps</span>
          <span id="hud-backend">--</span>
        </div>
      </div>
    </div>
  );
}
