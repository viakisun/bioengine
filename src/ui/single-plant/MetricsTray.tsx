// MetricsTray — collapsible wrapper around the TimelineChart. Default
// state is collapsed (handle bar only); clicking the handle expands the
// tray to reveal the chart. TimelineChart itself is unchanged.

import { useTwinStore } from '../../store/twinStore';
import { TimelineChart } from './TimelineChart';
import { FONT_MONO, C_BORDER, C_FG, C_FG_MUTE } from './styles';

const HANDLE_H = 28;
const TRAY_H = 240;

export function MetricsTray() {
  const open = useTwinStore((s) => s.singlePlantMetricsOpen);
  const toggle = useTwinStore((s) => s.toggleSinglePlantMetrics);

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        // PlaybackBar(bottom:12, ~64) + RightBottomToggles(bottom:88, h:28)
        // 위에 떠 있도록 124 부터 시작. 닫혔을 때는 handle 만 위로.
        bottom: 124,
        height: open ? TRAY_H : HANDLE_H,
        pointerEvents: 'auto',
        background: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${C_BORDER}`,
        borderRadius: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        transition: 'height 0.22s ease-out',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Handle / collapse toggle */}
      <button
        type="button"
        onClick={toggle}
        style={{
          height: HANDLE_H,
          flexShrink: 0,
          background: 'transparent',
          border: 'none',
          borderBottom: open ? `1px solid ${C_BORDER}` : 'none',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: C_FG,
        }}
        aria-expanded={open}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: C_FG_MUTE }}>{open ? '▼' : '▲'}</span>
          <span>Metrics</span>
          {!open && (
            <span style={{ color: C_FG_MUTE, marginLeft: 8 }}>· LAI · H · Fruits</span>
          )}
        </span>
        <span style={{ color: C_FG_MUTE, fontSize: 10 }}>
          {open ? '클릭하여 접기' : '클릭하여 펼치기'}
        </span>
      </button>

      {/* Chart — only mounted when open to avoid hidden render work. */}
      {open && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <TimelineChart />
        </div>
      )}
    </div>
  );
}
