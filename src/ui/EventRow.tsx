export type EventSeverity = 'info' | 'warning' | 'critical';

interface EventRowProps {
  severity: EventSeverity;
  title: string;
  sub?: string;
  meta?: string;
  onClick?: () => void;
}

const SEVERITY_COLOR: Record<EventSeverity, string> = {
  info: 'var(--ok)',
  warning: 'var(--warn)',
  critical: 'var(--bad)',
};

export function EventRow({ severity, title, sub, meta, onClick }: EventRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="evt-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '8px 1fr auto',
        gap: 10,
        padding: '8px 10px',
        alignItems: 'center',
        borderRadius: 6,
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
        font: 'inherit',
        textAlign: 'left',
        width: '100%',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-soft)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: SEVERITY_COLOR[severity],
          marginLeft: 1,
        }}
      />
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.35 }}>{title}</span>
        {sub && (
          <span
            className="mono"
            style={{ fontSize: 11, color: 'var(--fg-mute)', marginTop: 1 }}
          >
            {sub}
          </span>
        )}
      </span>
      {meta && (
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>
          {meta}
        </span>
      )}
    </button>
  );
}
