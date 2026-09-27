// SinglePlantApp — single-plant scene host.

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
            document.getElementById('hud-fps' / 'hud-backend') updates keep flowing. */}
        <div className="offscreen">
          <span id="hud-fps">-- fps</span>
          <span id="hud-backend">--</span>
        </div>
      </div>
    </div>
  );
}
