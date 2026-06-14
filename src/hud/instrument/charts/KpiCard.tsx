// Phenotyping — KPI card.  Single metric value with label + optional unit.

export interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  hint?: string;
}

export function KpiCard({ label, value, unit, color, hint }: KpiCardProps) {
  return (
    <div style={{
      background: 'var(--iw-bg-2)',
      border: '1px solid var(--iw-line-1)',
      borderRadius: 6,
      padding: '8px 11px',
      fontFamily: 'var(--iw-font-mono)',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 9,
        letterSpacing: '0.1em',
        color: 'var(--iw-fg-mute)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 18,
        fontWeight: 600,
        color: color ?? 'var(--iw-fg-hi)',
        marginTop: 3,
        lineHeight: 1,
      }}>
        {value}
        {unit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--iw-fg-mute)', marginLeft: 3 }}>{unit}</span>}
      </div>
      {hint && (
        <div style={{ fontSize: 9, color: 'var(--iw-fg-faint)', marginTop: 3 }}>{hint}</div>
      )}
    </div>
  );
}
