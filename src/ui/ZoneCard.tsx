interface ZoneCardProps {
  num: number;             // zone number, displayed as "01" / "02" / ...
  title: string;           // e.g. "구역 1"
  state: string;           // e.g. "정상" / "병해 의심"
  bad?: boolean;           // red-tinted background for problem zones
  selected?: boolean;
  onClick?: () => void;
}

export function ZoneCard({ num, title, state, bad, selected, onClick }: ZoneCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="zone-card"
      style={{
        position: 'relative',
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${
          selected ? 'var(--fg)' : bad ? 'rgba(220,38,38,0.30)' : 'var(--bd)'
        }`,
        background: bad ? '#fef7f6' : 'white',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        transition: 'border-color 0.12s',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{title}</div>
      <div
        style={{
          fontSize: 12,
          marginTop: 3,
          color: bad ? 'var(--bad)' : 'var(--fg-mute)',
        }}
      >
        {state}
      </div>
      <span
        className="mono"
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          fontSize: 10.5,
          color: 'var(--fg-dim)',
        }}
      >
        {num.toString().padStart(2, '0')}
      </span>
    </button>
  );
}
