// Instrument Workstation — Stats HUD (corner overlay, toggle via ⋯ or ?)
//
// Compact monospace stats block. Toggled by twinStore.statsOpen / ? key.
// Positioned at viewport top-right (under header), out of way of inspector.

import { useTwinStore } from '../../state/twinStore';
import { useStatsSnapshot } from './usePerfStat';

export function StatsHud() {
  const open = useTwinStore((s) => s.statsOpen);
  const s = useStatsSnapshot();
  if (!open) return null;

  const fpsC = s.fps == null ? 'var(--iw-fg-mute)' : s.fps < 30 ? 'var(--iw-err)' : s.fps < 50 ? 'var(--iw-warn)' : 'var(--iw-ok)';
  const heapPct = s.heapLimitMB > 0 ? (s.heapUsedMB / s.heapLimitMB) * 100 : 0;
  const heapC = heapPct > 80 ? 'var(--iw-err)' : heapPct > 60 ? 'var(--iw-warn)' : 'var(--iw-fg-hi)';

  return (
    <div style={wrap}>
      <div style={head}>
        <span>STATS</span>
        <span style={{ color: 'var(--iw-fg-faint)' }}>monitor</span>
      </div>
      <Row k="fps" v={s.fps == null ? '—' : String(s.fps)} vColor={fpsC} bold />
      <Row k="heap" v={`${s.heapUsedMB.toFixed(0)}`} suffix={`/${s.heapLimitMB.toFixed(0)}`} vColor={heapC} />
      <Row k="mesh" v={String(s.meshCount)} vColor="var(--iw-fg-hi)" />
      <Row k="verts" v={`${(s.totalVertices / 1e6).toFixed(1)}M`} vColor="var(--iw-fg-hi)" />
      <Row k="draws" v={s.drawCalls > 0 ? String(s.drawCalls) : '—'} vColor={s.drawCalls > 0 ? 'var(--iw-fg-hi)' : 'var(--iw-fg-faint)'} />
      <div style={{ borderTop: '1px solid var(--iw-line-1)', marginTop: 6, paddingTop: 6 }}>
        <Row k="plants" v={String(s.plantCount)} suffix={`/${s.plantMax}`} vColor="var(--iw-accent)" />
      </div>
    </div>
  );
}

function Row({ k, v, suffix, vColor, bold }: { k: string; v: string; suffix?: string; vColor?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0', color: 'var(--iw-fg-dim)' }}>
      <span>{k}</span>
      <span style={{ color: vColor ?? 'var(--iw-fg-hi)', fontWeight: bold ? 600 : 400 }}>
        {v}
        {suffix && <span style={{ color: 'var(--iw-fg-faint)' }}>{suffix}</span>}
      </span>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  top: 58,
  right: 12,
  zIndex: 1080,
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 10,
  background: 'rgba(10,12,15,0.92)',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 7,
  padding: '9px 11px',
  minWidth: 158,
};

const head: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  color: 'var(--iw-fg-faint)',
  letterSpacing: '0.1em',
  fontSize: 9,
  marginBottom: 7,
};
