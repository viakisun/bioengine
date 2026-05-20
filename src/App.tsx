import { SceneCanvas } from './components/SceneCanvas';
import { AnalysisPanel } from './components/AnalysisPanel';
import { Timeline } from './components/Timeline';
import { CameraPresets } from './components/CameraPresets';
import { EventList } from './components/EventList';
import { useTwinStore } from './store/twinStore';

export function App() {
  const heatmapVisible = useTwinStore((s) => s.heatmapVisible);
  const fovVisible = useTwinStore((s) => s.fovVisible);
  const pathTrailVisible = useTwinStore((s) => s.pathTrailVisible);
  const toggleHeatmap = useTwinStore((s) => s.toggleHeatmap);
  const toggleFov = useTwinStore((s) => s.toggleFov);
  const togglePathTrail = useTwinStore((s) => s.togglePathTrail);

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplate: '1fr 64px / 1fr 340px',
        background: '#1a1d23',
      }}
    >
      <div
        style={{
          gridColumn: '1',
          gridRow: '1',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <SceneCanvas />

        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            display: 'flex',
            gap: 8,
            fontSize: 11,
            color: '#e0e0e0',
            background: 'rgba(26,29,35,0.7)',
            border: '1px solid #2a2e36',
            borderRadius: 6,
            padding: '4px 10px',
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
          }}
        >
          <span id="hud-fps" style={{ color: '#6ee7b7', fontVariantNumeric: 'tabular-nums' }}>-- fps</span>
          <span style={{ color: '#6b7280' }}>·</span>
          <span id="hud-backend">--</span>
          <span style={{ color: '#6b7280' }}>·</span>
          <span id="hud-day" style={{ fontVariantNumeric: 'tabular-nums' }}>Day --</span>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            gap: 6,
            zIndex: 5,
          }}
        >
          <LayerToggle on={heatmapVisible} onClick={toggleHeatmap} label="히트맵" />
          <LayerToggle on={fovVisible} onClick={toggleFov} label="FOV" />
          <LayerToggle on={pathTrailVisible} onClick={togglePathTrail} label="경로" />
        </div>

        <EventList />
        <CameraPresets />

        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            fontSize: 10,
            color: '#6b7280',
            pointerEvents: 'none',
          }}
        >
          스마트온실 디지털 트윈 PoC · Babylon.js {/* version */}
        </div>
      </div>

      <aside
        style={{
          gridColumn: '2',
          gridRow: '1 / 3',
          background: '#1a1d23',
          borderLeft: '1px solid #2a2e36',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AnalysisPanel />
      </aside>

      <footer
        style={{
          gridColumn: '1',
          gridRow: '2',
        }}
      >
        <Timeline />
      </footer>
    </div>
  );
}

function LayerToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: on ? 'rgba(110,231,183,0.18)' : 'rgba(26,29,35,0.7)',
        color: on ? '#6ee7b7' : '#9ca3af',
        border: `1px solid ${on ? '#6ee7b755' : '#2a2e36'}`,
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 11,
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}
