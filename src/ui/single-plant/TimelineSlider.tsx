// TimelineSlider — 1-minute-resolution scrub bar + playback controls.
//
// 120 days * 24 h * 60 m = 172,800 minutes total. The slider's step is
// 1, so the user can scrub to any individual minute. We display
// "Day 45, 14:32" as well.

import { useTwinStore } from '../../store/twinStore';
import { FONT_MONO, FONT_SANS, C_BORDER, C_FG, C_FG_MUTE, C_FG_DIM, C_ACCENT } from './styles';

const TOTAL_MIN = 120 * 24 * 60;

function formatTimestamp(m: number): string {
  const day = Math.floor(m / 1440);
  const minOfDay = m - day * 1440;
  const hour = Math.floor(minOfDay / 60);
  const minute = minOfDay - hour * 60;
  return `Day ${String(day).padStart(3, ' ')}, ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const SPEEDS: { id: 1 | 4 | 24; label: string }[] = [
  { id: 1, label: '1×' },
  { id: 4, label: '4×' },
  { id: 24, label: '24×' },
];

export function TimelineSlider() {
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const setMinute = useTwinStore((s) => s.setSinglePlantMinute);
  const playing = useTwinStore((s) => s.singlePlantPlaying);
  const setPlaying = useTwinStore((s) => s.setSinglePlantPlaying);
  const speed = useTwinStore((s) => s.singlePlantSpeed);
  const setSpeed = useTwinStore((s) => s.setSinglePlantSpeed);

  return (
    <div style={{
      borderTop: `1px solid ${C_BORDER}`,
      background: '#fff',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      fontFamily: FONT_SANS,
      fontSize: 12,
      color: C_FG,
    }}>
      <BtnIcon label="⏮" onClick={() => setMinute(0)} title="Jump to start" />
      <BtnIcon
        label="◀◀"
        onClick={() => setMinute(Math.max(0, minute - 60))}
        title="−1 hour"
      />
      <BtnIcon
        label={playing ? '⏸' : '▶'}
        onClick={() => setPlaying(!playing)}
        title={playing ? 'Pause' : 'Play'}
        primary
      />
      <BtnIcon
        label="▶▶"
        onClick={() => setMinute(Math.min(TOTAL_MIN - 1, minute + 60))}
        title="+1 hour"
      />
      <BtnIcon label="⏭" onClick={() => setMinute(TOTAL_MIN - 1)} title="Jump to end" />

      {/* Speed selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
        <span style={{ color: C_FG_MUTE, fontSize: 10, fontFamily: FONT_MONO }}>speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSpeed(s.id)}
            style={{
              background: speed === s.id ? C_ACCENT : '#fff',
              color: speed === s.id ? '#fff' : C_FG,
              border: `1px solid ${speed === s.id ? C_ACCENT : C_BORDER}`,
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 11,
              fontFamily: FONT_MONO,
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={TOTAL_MIN - 1}
        step={1}
        value={minute}
        onChange={(e) => setMinute(parseInt(e.target.value, 10))}
        style={{ flex: 1, accentColor: C_ACCENT, marginLeft: 8 }}
      />

      {/* Timestamp */}
      <div style={{
        fontFamily: FONT_MONO,
        fontSize: 12,
        color: C_FG,
        minWidth: 160,
        textAlign: 'right',
      }}>
        {formatTimestamp(minute)}
        <span style={{ color: C_FG_DIM, marginLeft: 8 }}>
          / Day {Math.floor((TOTAL_MIN - 1) / 1440)}
        </span>
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
        background: primary ? C_ACCENT : '#fff',
        color: primary ? '#fff' : C_FG,
        border: `1px solid ${primary ? C_ACCENT : C_BORDER}`,
        borderRadius: 3,
        padding: '4px 8px',
        fontSize: 12,
        fontFamily: FONT_MONO,
        cursor: 'pointer',
        minWidth: 32,
      }}
    >
      {label}
    </button>
  );
}
