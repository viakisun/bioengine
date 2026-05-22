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
    <button type="button" onClick={onClick} className="evt-row">
      <span className="evt-dot" style={{ background: SEVERITY_COLOR[severity] }} />
      <span className="evt-body">
        <span className="evt-title">{title}</span>
        {sub && <span className="mono evt-sub">{sub}</span>}
      </span>
      {meta && <span className="mono evt-meta">{meta}</span>}
    </button>
  );
}
