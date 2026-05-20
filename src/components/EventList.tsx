import { useTwinStore } from '../store/twinStore';
import { SCENARIO, type Severity } from '../data/mockScenario';

const severityColor: Record<Severity, string> = {
  info: '#60a5fa',
  warning: '#fbbf24',
  critical: '#ef4444',
};

export function EventList() {
  const currentDay = useTwinStore((s) => s.currentDay);
  const setDay = useTwinStore((s) => s.setDay);
  const selectZone = useTwinStore((s) => s.selectZone);

  const recentEvents = SCENARIO.events
    .filter((e) => e.day <= currentDay && currentDay - e.day < 7)
    .sort((a, b) => b.day - a.day)
    .slice(0, 4);

  if (recentEvents.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: 12,
        width: 280,
        background: 'rgba(26,29,35,0.85)',
        border: '1px solid #2a2e36',
        borderRadius: 8,
        padding: 10,
        backdropFilter: 'blur(8px)',
        zIndex: 5,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        최근 7일 이상 이벤트
      </div>
      {recentEvents.map((evt) => (
        <button
          key={evt.id}
          type="button"
          onClick={() => {
            setDay(evt.day);
            selectZone(evt.zoneId);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            color: '#e0e0e0',
            padding: '6px 4px',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
            borderBottom: '1px solid #2a2e36',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: severityColor[evt.severity],
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#e0e0e0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {evt.descriptionKo}
            </div>
            <div style={{ fontSize: 9, color: '#6b7280' }}>Day {evt.day}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
