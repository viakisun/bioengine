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

  return (
    <div
      className="app-grid"
      style={{
        gridTemplateRows: `1fr ${consoleH}px`,
        // Single-plant 모드는 우측 sidebar 자체가 없으므로 그리드도 단일
        // 컬럼. 그렇지 않으면 빈 360px 컬럼이 회색 strip 으로 노출됨.
        gridTemplateColumns: isSinglePlant ? '1fr' : undefined,
        ['--console-h' as string]: `${consoleH}px`,
      }}
    >
      {/* Main 3D view + scene-overlay UI */}
      <div className="app-scene-cell">
        <SceneCanvas />
        {!isSinglePlant && <TopBar />}
        {!isSinglePlant && <LabelOverlay />}
        {!isSinglePlant && <LayerDock />}

        {/* Iter 35: back-to-lobby chip 제거 (lobby mode archived). */}

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

        {!isSinglePlant && (
          <div className="app-brand">
            <div className="app-brand-heading">
              VIASOFT<span className="tag-ok">.AI</span>
            </div>
            스마트온실 디지털 트윈 PoC · 김제 스마트팜혁신밸리
          </div>
        )}
      </div>

      {/* Right sidebar — tabs (구역 / 이벤트 / 환경) */}
      {!isSinglePlant && (
        <aside className="app-sidebar-aside">
          <AnalysisPanel />
        </aside>
      )}

      {/* Bottom timeline panel — single-plant 모드는 자체 BottomPlaybackBar 사용 */}
      {!isSinglePlant && (
        <footer className="app-timeline-row">
          <TimelinePanel />
        </footer>
      )}
    </div>
  );
}
