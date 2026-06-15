// Instrument Workstation — Bottom Sim Transport (54px)
//
// ▶/⏸ play · day N/120 · progress scrubber · ×0.5..×8 speed pills · percent.

import { useEffect, useState } from 'react';
import { useTwinStore } from '../state/twinStore';

export interface TimelinePlayback {
  /** 0~120 (또는 설정에 따라 더 큼). */
  currentDay: number;
  playing: boolean;
  playSpeed: number;
  setDay(day: number): void;
  togglePlay(): void;
  setPlaySpeed(speed: number): void;
}

interface TimelineBarProps {
  playback: TimelinePlayback;
  minDay?: number;
  maxDay?: number;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

export function TimelineBar({ playback, minDay = 0, maxDay = 120 }: TimelineBarProps) {
  // RAF tick to refresh when playback is a plain object updated externally
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 33) {
        last = t;
        setTick((x) => (x + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const day = playback.currentDay;
  const pct = ((day - minDay) / Math.max(1, maxDay - minDay)) * 100;
  const setSettingsOpen = useTwinStore((s) => s.setSettingsOpen);

  return (
    <footer data-tick={tick} style={wrapS}>
      <button
        onClick={playback.togglePlay}
        aria-label={playback.playing ? 'Pause' : 'Play'}
        style={playBtnS}
      >
        {playback.playing ? '❚❚' : '▶'}
      </button>

      <div className="iw-mono" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--iw-fg-mute)' }}>day </span>
        <span style={{ color: 'var(--iw-fg-hi)', fontWeight: 600 }}>{day.toFixed(1)}</span>
        <span style={{ color: 'var(--iw-fg-faint)' }}> / {maxDay}</span>
      </div>

      <SurveyTimelineChip />


      {/* Custom progress bar with click-to-scrub */}
      <div
        style={progressWrapS}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const newDay = minDay + ratio * (maxDay - minDay);
          playback.setDay(Math.max(minDay, Math.min(maxDay, newDay)));
        }}
      >
        <div style={{ ...progressFillS, width: `${pct}%` }} />
        <div style={{ ...progressDotS, left: `${pct}%` }} />
        {/* Hidden range for keyboard a11y */}
        <input
          type="range"
          min={minDay}
          max={maxDay}
          step={0.5}
          value={day}
          onChange={(e) => playback.setDay(Number(e.currentTarget.value))}
          aria-label="Day"
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </div>

      {/* Speed pills */}
      <div style={speedWrapS}>
        {SPEED_OPTIONS.map((s) => {
          const active = playback.playSpeed === s;
          return (
            <button
              key={s}
              onClick={() => playback.setPlaySpeed(s)}
              style={speedBtnS(active)}
            >
              ×{s}
            </button>
          );
        })}
      </div>

      <div className="iw-mono" style={{ fontSize: 12, color: 'var(--iw-fg-dim)', minWidth: 42, textAlign: 'right' }}>
        {pct.toFixed(0)}%
      </div>

      <button onClick={() => setSettingsOpen(true)} style={gearBtnS} title="Settings">⚙</button>
    </footer>
  );
}

function SurveyTimelineChip() {
  const sv = useTwinStore((s) => s.phenotypingSurvey);
  if (sv.status === 'idle' && sv.totals.fruitCount === 0) return null;
  return (
    <span
      className="iw-mono"
      style={{
        fontSize: 11,
        color: 'var(--iw-fg-dim)',
        background: 'var(--iw-bg-3)',
        border: '1px solid var(--iw-line-1)',
        padding: '3px 8px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
      }}
      title="phenotyping survey · progress · total detected fruits · detector"
    >
      <span style={{ color: 'var(--iw-fg-mute)' }}>survey </span>
      <span style={{ color: 'var(--iw-fg-hi)' }}>{(sv.progress * 100).toFixed(0)}%</span>
      <span style={{ color: 'var(--iw-fg-faint)' }}> · </span>
      <span style={{ color: 'var(--iw-accent)' }}>{sv.totals.fruitCount}</span>
      <span style={{ color: 'var(--iw-fg-faint)' }}> fruits · </span>
      <span style={{ color: 'var(--iw-fg-mid)' }}>{sv.detectorId.replace('-v1', '').replace('-yolo', '')}</span>
    </span>
  );
}

// ────────────────── styles ──────────────────
const wrapS: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  height: 54,
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '0 16px',
  background: 'var(--iw-bg-2)',
  borderTop: '1px solid var(--iw-line-1)',
  zIndex: 1000,
  fontFamily: 'var(--iw-font-ui)',
  color: 'var(--iw-fg-hi)',
  userSelect: 'none',
};

const playBtnS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  borderRadius: 7,
  background: 'var(--iw-accent)',
  color: '#06070a',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
};

const progressWrapS: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  height: 5,
  borderRadius: 3,
  background: 'rgba(255,255,255,0.10)',
  cursor: 'pointer',
};

const progressFillS: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  background: 'var(--iw-accent)',
  borderRadius: 3,
};

const progressDotS: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 13,
  height: 13,
  borderRadius: '50%',
  background: 'var(--iw-fg-hi)',
  border: '3px solid var(--iw-accent)',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
};

const speedWrapS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'var(--iw-bg-3)',
  border: '1px solid var(--iw-line-1)',
  borderRadius: 7,
  padding: 2,
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 11,
};

const speedBtnS = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 11,
  fontWeight: active ? 600 : 400,
  color: active ? '#06070a' : 'var(--iw-fg-dim)',
  background: active ? 'var(--iw-accent)' : 'transparent',
  border: 'none',
  borderRadius: 5,
  padding: '5px 9px',
  cursor: 'pointer',
});

const gearBtnS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  color: 'var(--iw-fg-dim)',
  background: 'transparent',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
};
