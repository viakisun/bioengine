// Phenotyping — Bed × Zone heatmap.
//
// Rows = bed (target bed per zone), columns = zone index in capture order.
// Cell color = dominant ripeness bin, intensity = weightedCount.
// Reuses the IW palette from RipenessHistogram.

export type RipenessBin = 'green' | 'breaker' | 'turning' | 'pink' | 'red';

export interface ZoneCell {
  zoneId: string;
  bedId: number;
  index: number;             // sequential capture order
  bedSide: 'left' | 'right';
  weightedCount: number;
  bins: Record<RipenessBin, number>;
}

const BIN_COLOR: Record<RipenessBin, string> = {
  green:   '#2f6b47',
  breaker: '#8f7026',
  turning: '#b06a2a',
  pink:    '#c25a52',
  red:     '#a8463a',
};

function dominantBin(bins: Record<RipenessBin, number>): RipenessBin {
  let best: RipenessBin = 'green';
  let bestV = -1;
  (Object.keys(bins) as RipenessBin[]).forEach((b) => {
    if (bins[b] > bestV) { best = b; bestV = bins[b]; }
  });
  return best;
}

export interface BedZoneHeatmapProps {
  zones: ZoneCell[];
  onCellClick?: (zoneId: string) => void;
  height?: number;
}

export function BedZoneHeatmap({ zones, onCellClick, height = 130 }: BedZoneHeatmapProps) {
  if (zones.length === 0) {
    return (
      <div style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--iw-fg-faint)',
        fontFamily: 'var(--iw-font-mono)',
        fontSize: 10,
        background: 'var(--iw-bg-2)',
        border: '1px solid var(--iw-line-1)',
        borderRadius: 6,
      }}>no zones yet</div>
    );
  }

  // Distinct bed ids, preserving capture order's first-seen sequence
  const seenBeds: number[] = [];
  for (const z of zones) {
    if (!seenBeds.includes(z.bedId)) seenBeds.push(z.bedId);
  }
  const rows = seenBeds.length;

  const maxWeighted = Math.max(1, ...zones.map((z) => z.weightedCount));

  // Group cells by bed
  const byBed = new Map<number, ZoneCell[]>();
  zones.forEach((z) => {
    if (!byBed.has(z.bedId)) byBed.set(z.bedId, []);
    byBed.get(z.bedId)!.push(z);
  });

  // For each row, draw 1 column per zone of that bed (left-aligned)
  // Find max columns
  const maxCols = Math.max(1, ...Array.from(byBed.values()).map((arr) => arr.length));
  const cellSize = Math.max(14, Math.min(22, Math.floor(height / rows) - 6));
  const gap = 3;
  const labelW = 56;
  const W = labelW + maxCols * (cellSize + gap);
  const H = rows * (cellSize + gap) + 12;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {seenBeds.map((bedId, rowIdx) => {
          const cells = byBed.get(bedId) ?? [];
          const y = rowIdx * (cellSize + gap) + 2;
          return (
            <g key={bedId}>
              <text
                x={4}
                y={y + cellSize / 2 + 3}
                fontSize={10}
                fontFamily="var(--iw-font-mono)"
                fill="var(--iw-fg-dim)"
              >
                bed {bedId}
                <tspan fill="var(--iw-fg-faint)" dx={4}>{cells[0]?.bedSide === 'left' ? 'L' : 'R'}</tspan>
              </text>
              {cells.map((cell, ci) => {
                const x = labelW + ci * (cellSize + gap);
                const bin = dominantBin(cell.bins);
                const intensity = 0.35 + 0.65 * Math.min(1, cell.weightedCount / maxWeighted);
                const color = BIN_COLOR[bin];
                return (
                  <rect
                    key={cell.zoneId}
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    fill={color}
                    opacity={intensity}
                    style={{ cursor: onCellClick ? 'pointer' : 'default' }}
                    onClick={() => onCellClick?.(cell.zoneId)}
                  >
                    <title>{`${cell.zoneId}\nbed ${cell.bedId}\nweighted: ${cell.weightedCount.toFixed(1)}\ndominant: ${bin}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
