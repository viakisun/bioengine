import { useMemo } from 'react';

interface SparklineProps {
  /** y values in any units; the component normalizes vertically to its viewBox. */
  values: number[];
  /** Index into `values` where the vertical cursor sits (0..values.length-1). */
  cursorIndex: number;
  /** Stroke color. Defaults to var(--ok). */
  color?: string;
  /** Optional fill below the line (faint band). */
  fillOpacity?: number;
  /** Optional headline label rendered in the top-left, e.g. "평균 키". */
  label?: string;
  /** Optional value text rendered in the top-right at the cursor, e.g. "192cm". */
  valueText?: string;
  /** Height in px; width 100% of parent. Defaults to 72. */
  height?: number;
}

/**
 * Reference `.sparkline-wrap` — a small line chart with a vertical
 * cursor showing the current day's value. Used in the timeline panel
 * (height + cumulative yield) and inside zone-detail cards.
 *
 * No data fetching, no axes. Caller supplies the values + cursor.
 */
export function Sparkline({
  values,
  cursorIndex,
  color = 'var(--ok)',
  fillOpacity = 0.10,
  label,
  valueText,
  height = 72,
}: SparklineProps) {
  const { path, area, cursorXPct, vbW, vbH } = useMemo(() => {
    const n = Math.max(2, values.length);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-6, max - min);
    const vbW = 100;
    const vbH = 30;
    const pts = values.map((v, i) => {
      const x = (i / (n - 1)) * vbW;
      const y = vbH - ((v - min) / span) * vbH;
      return { x, y };
    });
    const path = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ');
    const area = `${path} L${vbW},${vbH} L0,${vbH} Z`;
    const cursorXPct = (Math.max(0, Math.min(n - 1, cursorIndex)) / (n - 1)) * 100;
    return { path, area, cursorXPct, vbW, vbH };
  }, [values, cursorIndex]);

  return (
    <div className="sparkline" style={{ position: 'relative', height }}>
      {label && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 8,
            fontSize: 11,
            color: 'var(--fg-mute)',
            pointerEvents: 'none',
          }}
        >
          {label}
        </div>
      )}
      {valueText !== undefined && (
        <div
          className="mono"
          style={{
            position: 'absolute',
            top: 4,
            right: 8,
            fontSize: 13,
            fontWeight: 600,
            color,
            pointerEvents: 'none',
          }}
        >
          {valueText}
        </div>
      )}
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <path d={area} fill={color} opacity={fillOpacity} />
        <path d={path} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${cursorXPct}%`,
          width: 1,
          background: 'var(--fg)',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8,
            height: 8,
            borderRadius: 4,
            background: 'var(--fg)',
            border: '2px solid white',
          }}
        />
      </div>
    </div>
  );
}
