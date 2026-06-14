// Phenotyping — Progress bar (0..1 fraction).

export interface ProgressBarProps {
  value: number;       // 0..1
  height?: number;
  color?: string;
  trackColor?: string;
}

export function ProgressBar({ value, height = 5, color = 'var(--iw-accent)', trackColor = 'rgba(255,255,255,0.10)' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{
      width: '100%',
      height,
      background: trackColor,
      borderRadius: height / 2,
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: color,
        borderRadius: height / 2,
        transition: 'width 0.18s ease',
      }} />
    </div>
  );
}
