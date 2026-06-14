// Instrument Workstation — Top Command Bar (46px)
//   Logo + scenario context + [New / Fork / Calibrate] + Analysis/Drive switch + FPS + ⚙ + ⋯

import { useTwinStore } from '../../state/twinStore';
import { getActiveSeed } from '../../core/Determinism';
import { usePerfStat } from './usePerfStat';

interface TopCommandBarProps {
  scenarioId: string;
  day: number;
  onPicker: () => void;
  onFork: () => void;
  onCalibration: () => void;
}

export function TopCommandBar({ scenarioId, day, onPicker, onFork, onCalibration }: TopCommandBarProps) {
  const uiMode = useTwinStore((s) => s.uiMode);
  const setUiMode = useTwinStore((s) => s.setUiMode);
  const setSettingsOpen = useTwinStore((s) => s.setSettingsOpen);
  const setHistoryDrawerOpen = useTwinStore((s) => s.setHistoryDrawerOpen);
  const toggleStatsOpen = useTwinStore((s) => s.toggleStatsOpen);
  const seed = getActiveSeed();
  const fps = usePerfStat();
  const fpsColor = fps == null ? 'var(--iw-fg-mute)' : fps < 30 ? 'var(--iw-err)' : fps < 50 ? 'var(--iw-warn)' : 'var(--iw-ok)';

  return (
    <header style={headerS}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={logoDiamondS}>
          <div style={logoInnerS} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em' }}>PhytoSimulator</span>
        <span className="iw-mono" style={versionPillS}>v0.4</span>
      </div>

      <Divider />

      {/* Scenario context (mono pill) */}
      <div style={ctxPillS} className="iw-mono">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', color: 'var(--iw-fg-hi)', fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--iw-ok)' }} />
          {scenarioId}
        </span>
        <span style={pillDividerS} />
        <span style={{ padding: '0 10px', color: 'var(--iw-fg-mute)' }}>
          seed <span style={{ color: 'var(--iw-fg-dim)' }}>{seed ?? '—'}</span>
        </span>
        <span style={pillDividerS} />
        <span style={{ padding: '0 10px', color: 'var(--iw-fg-mute)' }}>
          day <span style={{ color: 'var(--iw-fg-dim)' }}>{day.toFixed(0)} · late-growth</span>
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={ghostBtnS} onClick={onPicker}>New</button>
        <button style={ghostBtnS} onClick={onFork}>Fork</button>
        <button style={ghostBtnS} onClick={onCalibration}>Calibrate</button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Analysis / Drive mode switch */}
      <div style={modeWrapS}>
        <button onClick={() => setUiMode('analysis')} style={modeBtnS(uiMode === 'analysis')}>Analysis</button>
        <button onClick={() => setUiMode('drive')} style={modeBtnS(uiMode === 'drive')}>Drive</button>
      </div>

      <Divider />

      {/* FPS */}
      <div className="iw-mono" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: fpsColor, fontWeight: 600 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: fpsColor, boxShadow: fps != null && fps < 30 ? `0 0 6px ${fpsColor}` : 'none' }} />
        {fps == null ? '—' : `${fps} FPS`}
      </div>

      <button style={iconBtnS} onClick={() => setHistoryDrawerOpen(true)} title="Survey history">📊</button>
      <button style={iconBtnS} onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
      <button style={iconBtnS} onClick={toggleStatsOpen} title="Toggle stats (?)">⋯</button>
    </header>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: 'var(--iw-line-1)' }} />;
}

// ────────────────── styles ──────────────────
const headerS: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  height: 46,
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  padding: '0 14px',
  background: 'var(--iw-bg-2)',
  borderBottom: '1px solid var(--iw-line-1)',
  color: 'var(--iw-fg-hi)',
  fontFamily: 'var(--iw-font-ui)',
  zIndex: 1100,
};

const logoDiamondS: React.CSSProperties = {
  width: 18,
  height: 18,
  border: '1.5px solid var(--iw-accent)',
  transform: 'rotate(45deg)',
  borderRadius: 3,
  position: 'relative',
};

const logoInnerS: React.CSSProperties = {
  position: 'absolute',
  inset: 4,
  background: 'var(--iw-accent)',
  borderRadius: 1,
  opacity: 0.85,
};

const versionPillS: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--iw-fg-mute)',
  border: '1px solid var(--iw-line-2)',
  padding: '1px 5px',
  borderRadius: 4,
};

const ctxPillS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  background: 'var(--iw-bg-3)',
  border: '1px solid var(--iw-line-1)',
  borderRadius: 7,
  height: 28,
  fontSize: 11,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const pillDividerS: React.CSSProperties = {
  width: 1,
  height: 16,
  background: 'var(--iw-line-1)',
};

const ghostBtnS: React.CSSProperties = {
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 11,
  color: 'var(--iw-fg-dim)',
  background: 'transparent',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 6,
  height: 28,
  padding: '0 11px',
  cursor: 'pointer',
};

const modeWrapS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'var(--iw-bg-3)',
  border: '1px solid var(--iw-line-1)',
  borderRadius: 7,
  padding: 2,
  fontSize: 12,
  fontWeight: 500,
};

const modeBtnS = (active: boolean): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 500,
  padding: '5px 13px',
  borderRadius: 5,
  border: 'none',
  cursor: 'pointer',
  background: active ? 'var(--iw-accent)' : 'transparent',
  color: active ? '#06070a' : 'var(--iw-fg-dim)',
  fontFamily: 'var(--iw-font-ui)',
});

const iconBtnS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  color: 'var(--iw-fg-dim)',
  background: 'transparent',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
};
