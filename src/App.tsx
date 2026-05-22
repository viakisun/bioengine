import { SceneCanvas } from './components/SceneCanvas';
import { AnalysisPanel } from './components/AnalysisPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { LabelOverlay } from './components/LabelOverlay';
import { TopBar } from './components/TopBar';
import { LayerDock } from './components/LayerDock';
import { useTwinStore } from './store/twinStore';

export function App() {
  const consoleExpanded = useTwinStore((s) => s.consoleExpanded);
  // Two heights for the bottom row: collapsed 88px (72 panel + 16
  // breathing room) vs expanded 296px. Exposed as a CSS var so the
  // LayerDock floating pill can position itself just above whichever
  // height is current and slide in lockstep with the panel.
  const consoleH = consoleExpanded ? 296 : 88;

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplate: `1fr ${consoleH}px / 1fr 360px`,
        background: '#e8e6df',
        // Inline-style CSS var consumed by .layer-dock
        ['--console-h' as string]: `${consoleH}px`,
        transition: 'grid-template-rows 0.25s cubic-bezier(.4,.0,.2,1)',
      }}
    >
      {/* Main 3D view + scene-overlay UI */}
      <div
        style={{
          gridColumn: '1',
          gridRow: '1',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <SceneCanvas />

        {/* Top bar — pills + zone chips + camera preset tab-strip */}
        <TopBar />

        {/* Scene labels (single focus plant) */}
        <LabelOverlay />

        {/* Floating dock — camera + speed */}
        <LayerDock />

        {/* Dev-mode FPS / backend HUD — hidden visually but the id-bearing
            spans must stay so BabylonEngine.runRenderLoop's
            document.getElementById('hud-fps' / 'hud-day' / 'hud-robot' /
            'hud-backend') updates keep flowing. Brand sits bottom-right. */}
        <div style={{ position: 'absolute', left: -9999, top: -9999 }}>
          <span id="hud-fps">-- fps</span>
          <span id="hud-backend">--</span>
          <span id="hud-day">Day --</span>
          <span id="hud-robot">UWB --</span>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 12,
            fontSize: 10,
            color: 'var(--fg-dim)',
            pointerEvents: 'none',
            textAlign: 'right',
            lineHeight: 1.4,
          }}
        >
          <div
            style={{
              color: 'var(--fg-mute)',
              fontWeight: 600,
              letterSpacing: 1,
              fontSize: 10.5,
              marginBottom: 1,
            }}
          >
            VIASOFT<span style={{ color: 'var(--ok)' }}>.AI</span>
          </div>
          스마트온실 디지털 트윈 PoC · 김제 스마트팜혁신밸리
        </div>
      </div>

      {/* Right sidebar — tabs (구역 / 이벤트 / 환경) */}
      <aside
        style={{
          gridColumn: '2',
          gridRow: '1 / 3',
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderLeft: '1px solid var(--bd)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AnalysisPanel />
      </aside>

      {/* Bottom timeline panel */}
      <footer
        style={{
          gridColumn: '1',
          gridRow: '2',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        <TimelinePanel />
      </footer>
    </div>
  );
}
