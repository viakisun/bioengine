// BottomPlaybackBar — floating playback HUD anchored to the bottom of
// the viewport. Combines the old TimelineSlider controls with the
// StatusBar summary line and the TimelineEventMarkers overlay.

import { useTwinStore } from '../../state/twinStore';
import { useSinglePlantState } from './useSinglePlantState';
import { TimelineEventMarkers } from './TimelineEventMarkers';
import { FONT_MONO, C_BORDER, C_FG, C_FG_MUTE, C_FG_DIM, C_ACCENT } from './styles';

const TOTAL_MIN = 120 * 24 * 60;

function dayPhase(state: ReturnType<typeof useSinglePlantState>): string {
  if (!state) return '—';
  if (state.trusses.length === 0) return '영양생장기';
  // Iter 16 (SSOT #165) — mirror of FloatingTopBar.phaseOf with the same staging.
  let hasRipe = false, hasExpanding = false, hasFertSmall = false, hasBud = false;
  for (const t of state.trusses) {
    for (const f of t.fruits) {
      if (f.harvested || f.aborted) continue;
      if (f.ripenStage >= 4) hasRipe = true;
      else if (f.diameter >= 10) hasExpanding = true;
      else if (f.fertilizationTT > 0) hasFertSmall = true;
      else hasBud = true;
    }
  }
  if (hasRipe) return '수확기';
  if (hasExpanding) return '착과비대기';
  if (hasFertSmall) return '착과기';
  if (hasBud) return '화방 분화기';
  return '영양생장기';
}

const SPEEDS: { id: 1 | 4 | 24; label: string }[] = [
  { id: 1, label: '1×' },
  { id: 4, label: '4×' },
  { id: 24, label: '24×' },
];

export function BottomPlaybackBar() {
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const setMinute = useTwinStore((s) => s.setSinglePlantMinute);
  const playing = useTwinStore((s) => s.singlePlantPlaying);
  const setPlaying = useTwinStore((s) => s.setSinglePlantPlaying);
  const speed = useTwinStore((s) => s.singlePlantSpeed);
  const setSpeed = useTwinStore((s) => s.setSinglePlantSpeed);
  const ps = useSinglePlantState();

  const day = ps?.day ?? Math.floor(minute / 1440);
  const phase = dayPhase(ps);
  const fruitCount = ps ? ps.trusses.reduce((n, t) => n + t.fruits.length, 0) : 0;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        right: 12,
        pointerEvents: 'auto',
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${C_BORDER}`,
        borderRadius: 14,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: FONT_MONO,
        fontSize: 12,
        color: C_FG,
      }}
    >
      {/* Transport controls */}
      <BtnIcon label="⏮" onClick={() => setMinute(0)} title="처음으로" />
      <BtnIcon label="◀◀" onClick={() => setMinute(Math.max(0, minute - 60))} title="−1 hour" />
      <BtnIcon
        label={playing ? '⏸' : '▶'}
        onClick={() => setPlaying(!playing)}
        title={playing ? 'Pause' : 'Play'}
        primary
      />
      <BtnIcon label="▶▶" onClick={() => setMinute(Math.min(TOTAL_MIN - 1, minute + 60))} title="+1 hour" />
      <BtnIcon label="⏭" onClick={() => setMinute(TOTAL_MIN - 1)} title="끝으로" />

      {/* Day + phase */}
      <div style={{ marginLeft: 6, minWidth: 110, whiteSpace: 'nowrap' }}>
        <span style={{ color: C_FG }}>D{day}</span>
        <span style={{ color: C_FG_DIM }}> / 120</span>
        <span style={{ color: C_FG_MUTE, marginLeft: 6 }}>· {phase}</span>
      </div>

      {/* Scrubber + marker overlay */}
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <TimelineEventMarkers />
        <input
          type="range"
          min={0}
          max={TOTAL_MIN - 1}
          step={1}
          value={minute}
          onChange={(e) => setMinute(parseInt(e.target.value, 10))}
          style={{
            width: '100%',
            accentColor: C_ACCENT,
            height: 4,
            cursor: 'pointer',
            display: 'block',
          }}
        />
      </div>

      {/* Speed selector */}
      <div style={{ display: 'flex', gap: 2 }}>
        {SPEEDS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSpeed(s.id)}
            style={{
              background: speed === s.id ? C_ACCENT : 'transparent',
              color: speed === s.id ? '#fff' : C_FG_MUTE,
              border: `1px solid ${speed === s.id ? C_ACCENT : C_BORDER}`,
              borderRadius: 10,
              padding: '2px 8px',
              fontSize: 10,
              fontFamily: FONT_MONO,
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Right summary — StatusBar 핵심값 흡수 */}
      <div style={{ minWidth: 220, textAlign: 'right', color: C_FG_MUTE, fontSize: 11 }}>
        {ps ? (
          <>
            H <strong style={{ color: C_FG }}>{ps.heightCm.toFixed(0)}</strong>cm ·{' '}
            LAI <strong style={{ color: C_FG }}>{ps.LAI.toFixed(2)}</strong> ·{' '}
            Fruits <strong style={{ color: C_FG }}>{fruitCount}</strong>
          </>
        ) : (
          <span>—</span>
        )}
      </div>
    </div>
  );
}

function BtnIcon({
  label, onClick, title, primary = false,
}: { label: string; onClick: () => void; title?: string; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: primary ? C_ACCENT : 'transparent',
        color: primary ? '#fff' : C_FG,
        border: `1px solid ${primary ? C_ACCENT : C_BORDER}`,
        borderRadius: 14,
        padding: '4px 9px',
        fontSize: 12,
        fontFamily: FONT_MONO,
        cursor: 'pointer',
        minWidth: 30,
      }}
    >
      {label}
    </button>
  );
}
