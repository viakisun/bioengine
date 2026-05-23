import { SceneCanvas } from './components/SceneCanvas';
import { AnalysisPanel } from './components/AnalysisPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { LabelOverlay } from './components/LabelOverlay';
import { TopBar } from './components/TopBar';
import { LayerDock } from './components/LayerDock';
import { BootOverlay } from './ui/BootOverlay';
import { NotificationCenter } from './ui/NotificationCenter';
import { ErrorModal } from './ui/ErrorModal';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { useTwinStore } from './store/twinStore';

export function App() {
  const consoleExpanded = useTwinStore((s) => s.consoleExpanded);
  // Two heights for the bottom row: collapsed 88px (72 panel + 16
  // breathing room) vs expanded 296px. Exposed as a CSS var so the
  // LayerDock floating pill can position itself just above whichever
  // height is current and slide in lockstep with the panel.
  const consoleH = consoleExpanded ? 296 : 88;

  return (
    <ErrorBoundary>
    {/* Boot/notify overlays — always mounted at the top so they render
        immediately on first paint, and outlive any in-scene crash. */}
    <BootOverlay />
    <NotificationCenter />
    <ErrorModal />
    <div
      className="app-grid"
      style={{
        // Dynamic row template + CSS var consumed by .layer-dock
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
      <aside className="app-sidebar-aside">
        <AnalysisPanel />
      </aside>

      {/* Bottom timeline panel */}
      <footer className="app-timeline-row">
        <TimelinePanel />
      </footer>
    </div>
    </ErrorBoundary>
  );
}
