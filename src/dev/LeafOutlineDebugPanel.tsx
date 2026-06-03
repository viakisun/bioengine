// ★ L9-D V2 — Outline debug panel (?outlineDebug=1).
//
// S113: BGT (Beta × Gaussian × Triangle) — 사용자 reference 동일 산식.
//   사용자 reference의 generateTomatoLeafletOutline(300+i, deepCut, 900)
//   _완전 동일_ 결과 10개 표시.
// 사용: localhost:8090?outlineDebug=1

import { useMemo, useState } from 'react';
import { buildLeafletOutlineBGTHighRes } from '../scene/leaf/LeafMeshBuilder2';

const PLOT_WIDTH = 220;
const PLOT_HEIGHT = 380;

// ★ Reference의 generateTenTomatoLeaflets와 동일:
//   seed = 300+i, deepCut = (i % 2 === 1)
const REF_SEEDS = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309];
const REF_DEEPCUT = [false, true, false, true, false, true, false, true, false, true];

function SamplePlot({
  seed,
  deepCut,
  hueIdx,
  lengthCm,
}: {
  seed: number;
  deepCut: boolean;
  hueIdx: number;
  lengthCm: number;
}) {
  const profile = useMemo(
    () => buildLeafletOutlineBGTHighRes({
      lengthM: lengthCm / 100,
      idSeed: seed,
      deepCut,
    }),
    [seed, deepCut, lengthCm],
  );

  const pts: Array<[number, number]> = [];
  for (const s of profile) pts.push([s.u, -s.halfWidthLeft]);
  for (let i = profile.length - 1; i >= 0; i--) {
    pts.push([profile[i].u, profile[i].halfWidthRight]);
  }
  pts.push(pts[0]);

  const maxHW = Math.max(...pts.map(pt => Math.abs(pt[1])), 0.001);
  const xToPx = (u: number) => 20 + u * (PLOT_WIDTH - 40);
  const yToPx = (z: number) => PLOT_HEIGHT / 2 - (z / maxHW) * (PLOT_HEIGHT / 2 - 20);

  const hue = (hueIdx * 36) % 360;
  const maxHWCm = maxHW * 100;
  const label = `v${hueIdx + 1}${deepCut ? ' (deep)' : ''}  seed=${seed}`;

  return (
    <div style={{ background: '#1e1e1e', padding: 6, borderRadius: 4 }}>
      <div style={{ color: '#aaa', fontSize: 10, marginBottom: 4, fontFamily: 'monospace' }}>
        {label}
      </div>
      <div style={{ color: '#666', fontSize: 9, marginBottom: 2, fontFamily: 'monospace' }}>
        max half-width: {maxHWCm.toFixed(2)}cm
      </div>
      <svg width={PLOT_WIDTH} height={PLOT_HEIGHT} style={{ background: '#252525' }}>
        <line x1={20} y1={PLOT_HEIGHT / 2} x2={PLOT_WIDTH - 20} y2={PLOT_HEIGHT / 2} stroke="#444" strokeWidth={1} />
        <line x1={xToPx(0)} y1={20} x2={xToPx(0)} y2={PLOT_HEIGHT - 20} stroke="#444" strokeWidth={1} />
        <path
          d={pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${xToPx(pt[0])},${yToPx(pt[1])}`).join(' ')}
          fill={`hsla(${hue}, 60%, 40%, 0.5)`}
          stroke={`hsl(${hue}, 70%, 65%)`}
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}

export function LeafOutlineDebugPanel() {
  const [lengthCm, setLengthCm] = useState(15);

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: 8,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        color: '#eee',
        padding: 10,
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 11,
        maxHeight: 'calc(100vh - 16px)',
        overflow: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
        S113 BGT — 사용자 reference 10 leaflet (seed 300-309, n=900)
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>
          lengthCm:{' '}
          <input
            type="range"
            min={2}
            max={25}
            step={1}
            value={lengthCm}
            onChange={e => setLengthCm(parseInt(e.target.value, 10))}
            style={{ verticalAlign: 'middle' }}
          />
          {' '}{lengthCm}cm
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, auto)', gap: 6 }}>
        {REF_SEEDS.map((seed, idx) => (
          <SamplePlot
            key={seed}
            seed={seed}
            deepCut={REF_DEEPCUT[idx]}
            hueIdx={idx}
            lengthCm={lengthCm}
          />
        ))}
      </div>
      <div style={{ marginTop: 8, color: '#888', fontSize: 10 }}>
        ↑ Reference의 generateTomatoLeafletOutline(300+i, deepCut, 900) 결과와 _bit-for-bit 동일_
      </div>
    </div>
  );
}
