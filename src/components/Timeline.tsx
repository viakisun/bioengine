import { useTwinStore } from '../store/twinStore';
import { SCENARIO, HEALTH_COLORS, type Severity } from '../data/mockScenario';

const severityColor: Record<Severity, string> = {
  info: '#60a5fa',
  warning: '#fbbf24',
  critical: '#ef4444',
};

export function Timeline() {
  const currentDay = useTwinStore((s) => s.currentDay);
  const playing = useTwinStore((s) => s.playing);
  const playSpeed = useTwinStore((s) => s.playSpeed);
  const setDay = useTwinStore((s) => s.setDay);
  const togglePlay = useTwinStore((s) => s.togglePlay);
  const setPlaySpeed = useTwinStore((s) => s.setPlaySpeed);

  const total = SCENARIO.durationDays;
  const dayPct = (currentDay / total) * 100;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: '#22262e',
        borderTop: '1px solid #2a2e36',
      }}
    >
      <button
        type="button"
        onClick={togglePlay}
        style={btnStyle}
        title={playing ? '일시정지' : '재생'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <button type="button" onClick={() => setDay(0)} style={btnStyle} title="처음으로">
        ■
      </button>

      <div style={{ flex: 1, position: 'relative', height: 36 }}>
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 0,
            right: 0,
            height: 4,
            background: '#1a1d23',
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 0,
            width: `${dayPct}%`,
            height: 4,
            background: '#6ee7b7',
            borderRadius: 2,
          }}
        />
        {SCENARIO.events.map((evt) => {
          const left = (evt.day / total) * 100;
          return (
            <div
              key={evt.id}
              title={evt.descriptionKo}
              onClick={() => setDay(evt.day)}
              style={{
                position: 'absolute',
                left: `calc(${left}% - 4px)`,
                top: 8,
                width: 8,
                height: 8,
                borderRadius: 4,
                background: severityColor[evt.severity],
                cursor: 'pointer',
                border: '1px solid #1a1d23',
              }}
            />
          );
        })}
        {SCENARIO.captureSessions
          .filter((s) => s.day % 6 === 0)
          .map((s) => {
            const left = (s.day / total) * 100;
            return (
              <div
                key={s.id}
                title={`Day ${s.day} ${s.hour}:00 촬영`}
                style={{
                  position: 'absolute',
                  left: `calc(${left}% - 1px)`,
                  top: 22,
                  width: 2,
                  height: 6,
                  background: '#6b7280',
                  pointerEvents: 'none',
                }}
              />
            );
          })}
        <div
          style={{
            position: 'absolute',
            left: `calc(${dayPct}% - 9px)`,
            top: 8,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: '#6ee7b7',
            boxShadow: '0 0 12px rgba(110,231,183,0.5)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="range"
          min={0}
          max={total}
          step={0.1}
          value={currentDay}
          onChange={(e) => setDay(parseFloat(e.target.value))}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            width: '100%',
            opacity: 0,
            height: 36,
            cursor: 'pointer',
          }}
        />
      </div>

      <div style={{ fontSize: 11, color: '#9ca3af', minWidth: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        Day <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{currentDay.toFixed(0)}</span>
        <span style={{ color: '#6b7280' }}> / {total}</span>
      </div>

      <button
        type="button"
        onClick={() => setPlaySpeed(playSpeed >= 8 ? 1 : playSpeed * 2)}
        style={{ ...btnStyle, width: 'auto', padding: '0 10px', fontSize: 11, fontWeight: 600 }}
      >
        {playSpeed}x
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#2a2e36',
  border: '1px solid #3a3e46',
  color: '#e0e0e0',
  width: 36,
  height: 36,
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
