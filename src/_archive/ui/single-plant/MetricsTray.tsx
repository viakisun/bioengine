// MetricsTray — floating TimelineChart panel. Hidden by default; opened
// via the "Metrics" pill in RightBottomToggles. When closed nothing is
// rendered, so the playback HUD stays uncluttered.

import { useTwinStore } from '../../store/twinStore';
import { TimelineChart } from './TimelineChart';
import { FONT_MONO, C_BORDER, C_FG, C_FG_MUTE } from './styles';

const TRAY_H = 260;

export function MetricsTray() {
  const open = useTwinStore((s) => s.singlePlantMetricsOpen);
  const toggle = useTwinStore((s) => s.toggleSinglePlantMetrics);
  if (!open) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        // PlaybackBar(bottom:12, h~64) + RightBottomToggles(bottom:88, h:28)
        // 위로 충분히 띄움.
        bottom: 124,
        height: TRAY_H,
        pointerEvents: 'auto',
        background: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${C_BORDER}`,
        borderRadius: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          height: 28,
          flexShrink: 0,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${C_BORDER}`,
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: C_FG,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Metrics</span>
          <span style={{ color: C_FG_MUTE }}>· LAI · H · Fruits</span>
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-label="Metrics 닫기"
          style={{
            background: 'transparent',
            border: 'none',
            color: C_FG_MUTE,
            cursor: 'pointer',
            fontFamily: FONT_MONO,
            fontSize: 14,
            lineHeight: 1,
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TimelineChart />
      </div>
    </div>
  );
}
