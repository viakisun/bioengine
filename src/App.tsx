import { SceneCanvas } from './components/SceneCanvas';

export function App() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplate: '1fr 80px / 1fr 320px',
        background: '#1a1d23',
      }}
    >
      <header
        style={{
          gridColumn: '1 / 3',
          gridRow: '0',
          display: 'none',
        }}
      />

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
          <span id="hud-fps" style={{ color: '#6ee7b7' }}>-- fps</span>
          <span style={{ color: '#6b7280' }}>·</span>
          <span id="hud-backend">--</span>
          <span style={{ color: '#6b7280' }}>·</span>
          <span id="hud-day">Day --</span>
        </div>
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            fontSize: 11,
            color: '#9ca3af',
            background: 'rgba(26,29,35,0.7)',
            border: '1px solid #2a2e36',
            borderRadius: 6,
            padding: '4px 10px',
            pointerEvents: 'none',
          }}
        >
          스마트온실 디지털 트윈 · PoC
        </div>
      </div>

      <aside
        style={{
          gridColumn: '2',
          gridRow: '1 / 3',
          background: '#1a1d23',
          borderLeft: '1px solid #2a2e36',
          padding: 16,
          overflow: 'auto',
        }}
      >
        <h2
          style={{
            fontSize: 11,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontWeight: 600,
          }}
        >
          분석 패널
        </h2>
        <p style={{ marginTop: 10, color: '#6b7280', fontSize: 12, lineHeight: 1.5 }}>
          구역을 클릭하면 생육 지표·이미지·AI 결과·변화량이 표시됩니다.
        </p>
      </aside>

      <footer
        style={{
          gridColumn: '1',
          gridRow: '2',
          background: '#22262e',
          borderTop: '1px solid #2a2e36',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          type="button"
          style={{
            background: '#2a2e36',
            border: '1px solid #3a3e46',
            color: '#e0e0e0',
            width: 34,
            height: 34,
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ▶
        </button>
        <div style={{ flex: 1, fontSize: 11, color: '#6b7280' }}>
          타임라인 (구현 예정)
        </div>
      </footer>
    </div>
  );
}
