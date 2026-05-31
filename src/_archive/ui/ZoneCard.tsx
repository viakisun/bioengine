interface ZoneCardProps {
  num: number;             // zone number, displayed as "01" / "02" / ...
  title: string;           // e.g. "구역 1"
  state: string;           // e.g. "정상" / "병해 의심"
  bad?: boolean;           // red-tinted background for problem zones
  selected?: boolean;
  onClick?: () => void;
}

export function ZoneCard({ num, title, state, bad, selected, onClick }: ZoneCardProps) {
  const cls = ['zone-card', bad && 'is-bad', selected && 'is-selected']
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" onClick={onClick} className={cls}>
      <div className="zone-card-title">{title}</div>
      <div className="zone-card-state">{state}</div>
      <span className="mono zone-card-num">{num.toString().padStart(2, '0')}</span>
    </button>
  );
}
