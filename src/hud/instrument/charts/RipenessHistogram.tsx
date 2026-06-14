// Phenotyping — Ripeness histogram (5 bin SVG bar chart).
//
// Raw or confidence-weighted toggle.  No external chart lib.

import { useState } from 'react';

export type RipenessBin = 'green' | 'breaker' | 'turning' | 'pink' | 'red';

export interface RipenessHistogramProps {
  bins: Record<RipenessBin, number>;
  weightedBins?: Record<RipenessBin, number>;
  height?: number;
  showToggle?: boolean;
  /** Stretch SVG to fill container width. */
  width?: number | string;
}

const BIN_ORDER: RipenessBin[] = ['green', 'breaker', 'turning', 'pink', 'red'];
const BIN_COLOR: Record<RipenessBin, string> = {
  green:   '#2f6b47',
  breaker: '#8f7026',
  turning: '#b06a2a',
  pink:    '#c25a52',
  red:     '#a8463a',
};
const BIN_LABEL: Record<RipenessBin, string> = {
  green:   'green',
  breaker: 'breaker',
  turning: 'turning',
  pink:    'pink',
  red:     'red',
};

export function RipenessHistogram({
  bins, weightedBins, height = 120, showToggle = true, width = '100%',
}: RipenessHistogramProps) {
  const [weighted, setWeighted] = useState(false);
  const data = weighted && weightedBins ? weightedBins : bins;
  const max = Math.max(1, ...BIN_ORDER.map((b) => data[b] ?? 0));

  // 5 bins × bar pattern. Viewbox width 200 (5 × 40 cells).
  const cellW = 40;
  const padTop = 12;
  const padBot = 28; // for label row
  const innerH = height - padTop - padBot;
  const W = cellW * 5;

  return (
    <div style={{ width }}>
      {showToggle && weightedBins && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button
            onClick={() => setWeighted((v) => !v)}
            style={{
              fontFamily: 'var(--iw-font-mono)',
              fontSize: 9,
              padding: '2px 7px',
              background: 'var(--iw-bg-3)',
              border: '1px solid var(--iw-line-2)',
              color: 'var(--iw-fg-mid)',
              borderRadius: 3,
              cursor: 'pointer',
            }}
            title="Switch between raw count and confidence-weighted count"
          >
            {weighted ? 'weighted' : 'raw'}
          </button>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {BIN_ORDER.map((b, i) => {
          const v = data[b] ?? 0;
          const h = (v / max) * innerH;
          const x = i * cellW + 5;
          const y = padTop + (innerH - h);
          const barW = cellW - 10;
          return (
            <g key={b}>
              <rect x={x} y={y} width={barW} height={h} fill={BIN_COLOR[b]} rx={1.5} />
              {/* value above bar */}
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                fontSize={9}
                fontFamily="var(--iw-font-mono)"
                fill="var(--iw-fg-mid)"
              >
                {weighted ? v.toFixed(1) : v}
              </text>
              {/* label below bar */}
              <text
                x={x + barW / 2}
                y={height - 14}
                textAnchor="middle"
                fontSize={9}
                fontFamily="var(--iw-font-mono)"
                fill="var(--iw-fg-dim)"
              >
                {BIN_LABEL[b]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
