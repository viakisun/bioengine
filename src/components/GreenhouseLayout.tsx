// GreenhouseLayout — extracted from src/App.tsx so the App component can
// switch between modes (lobby / greenhouse / single-plant / robot /
// sandbox) without dragging the entire greenhouse UI tree into every
// branch. The full pre-mode layout lives here untouched.

import { SceneCanvas } from './SceneCanvas';
import { AnalysisPanel } from './AnalysisPanel';
import { TimelinePanel } from './TimelinePanel';
import { LabelOverlay } from './LabelOverlay';
import { TopBar } from './TopBar';
import { LayerDock } from './LayerDock';
import { useTwinStore } from '../store/twinStore';

export function GreenhouseLayout() {
  const consoleExpanded = useTwinStore((s) => s.consoleExpanded);
  const mode = useTwinStore((s) => s.mode);
  // Single-plant 모드에서는 우측 sidebar + 하단 timeline 을 SinglePlant
  // Overlay 의 패널이 대체. 따라서 hide.
  const isSinglePlant = mode === 'single-plant';
  // Two heights for the bottom row: collapsed 88px vs expanded 296px.
  // Single-plant 모드에서는 timeline 자체가 hide 이므로 0.
  const consoleH = isSinglePlant ? 0 : (consoleExpanded ? 296 : 88);
  const setMode = useTwinStore((s) => s.setMode);

  return (
    <div
      className="app-grid"
      style={{
        gridTemplateRows: `1fr ${consoleH}px`,
        ['--console-h' as string]: `${consoleH}px`,
      }}
    >
      {/* Main 3D view + scene-overlay UI */}
      <div className="app-scene-cell">
        <SceneCanvas />
        <TopBar />
        <LabelOverlay />
        <LayerDock />

        {/* Back-to-lobby chip — always visible, top-left, low-key */}
        <button
          type="button"
          onClick={() => setMode('lobby')}
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            zIndex: 50,
            background: 'rgba(255, 255, 255, 0.92)',
            border: '1px solid rgba(25, 30, 25, 0.18)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            cursor: 'pointer',
            color: '#1a1d1a',
          }}
        >
          ◂ Lobby
        </button>

        {/* Dev-mode FPS / backend HUD — hidden visually but the id-bearing
            spans must stay so BabylonEngine.runRenderLoop's
            document.getElementById('hud-fps' / 'hud-day' / 'hud-robot' /
            'hud-backend') updates keep flowing. */}
        <div className="offscreen">
          <span id="hud-fps">-- fps</span>
          <span id="hud-backend">--</span>
          <span id="hud-day">Day --</span>
          <span id="hud-robot">UWB --</span>
        </div>

        <div className="app-brand">
          <div className="app-brand-heading">
            VIASOFT<span className="tag-ok">.AI</span>
          </div>
          스마트온실 디지털 트윈 PoC · 김제 스마트팜혁신밸리
        </div>
      </div>

      {/* Right sidebar — tabs (구역 / 이벤트 / 환경) */}
      {!isSinglePlant && (
        <aside className="app-sidebar-aside">
          <AnalysisPanel />
        </aside>
      )}

      {/* Bottom timeline panel — single-plant 모드는 자체 TimelineSlider 사용 */}
      {!isSinglePlant && (
        <footer className="app-timeline-row">
          <TimelinePanel />
        </footer>
      )}
    </div>
  );
}
