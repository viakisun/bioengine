// ★ L9-D V2 — Outline debug panel (임시 dev tool, ?outlineDebug=1).
//
// 사용자 제안: "아웃라인커브만 생성하는 2D 그래프 표시기를 임시로 만들어보자".
// 3D mesh (curl/pose/material 등)의 혼란 요소 제거 + outline 자체 직접 확인.
//
// 표시:
//   - terminal / primary / intercalary / secondary 각 outline plot
//   - 좌/우 _다른 색_으로 비대칭 표시
//   - 여러 idSeed 샘플 (왼쪽 outline _제각각_ 확인)
//
// 사용: localhost:8090?outlineDebug=1

import { useMemo, useState } from 'react';
import { buildShapeProfileV2 } from '../scene/leaf/LeafMeshBuilder2';
import { parseLeafSpec, type LeafSpec } from '../scene/leaf/LeafSpec';
import tomatoSpec from '../data/leaf/specs/tomato.json';

const POSITIONS = ['terminal', 'primary', 'intercalary', 'secondary'] as const;
type Position = typeof POSITIONS[number];

// 12 leaflet seed 샘플 (다양한 outline 확인용)
const SEEDS = [1001, 2031, 3149, 4017, 5083, 6211, 7079, 8137, 9223, 10331, 11409, 12527];

const PLOT_WIDTH = 280;
const PLOT_HEIGHT = 380;

function plotOutline(
  spec: LeafSpec,
  position: Position,
  seed: number,
  lengthCm: number,
): { points: Array<[number, number]>; halfWidthBase: number } | null {
  const positionedProfile = spec.profileByPosition[position];
  const lengthM = lengthCm / 100;
  const halfWidthBase = lengthM / Math.max(1, 1 / positionedProfile.widthRatio) / 2;

  // S105 lobeDepthMult 적용 (재현)
  const lobeDepthMult = Math.max(0.2, Math.min(1.0, lengthM / 0.20));
  const scaledShoulderLobes = (positionedProfile.shoulderLobes ?? []).map(lobe => ({
    ...lobe,
    depth: lobe.depth * lobeDepthMult,
  }));
  const scaledSinusNotches = (positionedProfile.sinusNotches ?? []).map(notch => ({
    ...notch,
    depth: notch.depth * lobeDepthMult,
  }));

  const profile = buildShapeProfileV2({
    lengthM,
    aspectRatio: 1 / positionedProfile.widthRatio,
    tipSharpness: positionedProfile.tipSharpness,
    baseShape: 0.85,
    asymmetry: 0,
    samples: 40,
    baseTransitionEndU: spec.shapeProfileRules.baseTransitionEndU,
    shoulderLobes: scaledShoulderLobes,
    sinusNotches: scaledSinusNotches,
    dripTipUStart: positionedProfile.dripTipUStart ?? 0.85,
    dripTipDepth: positionedProfile.dripTipDepth ?? 0.6,
    expansionProgress: 1.0,
    ageFrac: 0,
    smoothMargin: false,
    idSeed: seed,
  });

  // 좌측 outline (u=0→1, z=-halfWidthLeft) → tip (z=0) → 우측 (u=1→0, z=+halfWidthRight) → base
  const pts: Array<[number, number]> = [];
  for (const s of profile) {
    pts.push([s.u, -s.halfWidthLeft]);
  }
  for (let i = profile.length - 1; i >= 0; i--) {
    pts.push([profile[i].u, profile[i].halfWidthRight]);
  }
  pts.push(pts[0]);  // close

  return { points: pts, halfWidthBase };
}

function OutlinePlot({ spec, position, seeds, lengthCm }: {
  spec: LeafSpec;
  position: Position;
  seeds: number[];
  lengthCm: number;
}) {
  const plots = useMemo(() =>
    seeds.map(s => ({ seed: s, data: plotOutline(spec, position, s, lengthCm) })),
    [spec, position, seeds, lengthCm]
  );

  // 모든 plot의 max half-width 산출 (스케일링용)
  const maxHW = Math.max(...plots.flatMap(p =>
    p.data ? p.data.points.map(pt => Math.abs(pt[1])) : [0]
  ));

  const xToPx = (u: number) => 30 + u * (PLOT_WIDTH - 60);
  const yToPx = (z: number) => PLOT_HEIGHT / 2 - (z / Math.max(maxHW, 0.001)) * (PLOT_HEIGHT / 2 - 20);

  return (
    <div style={{ background: '#1e1e1e', padding: 8, borderRadius: 4 }}>
      <div style={{ color: '#aaa', fontSize: 11, marginBottom: 4, fontFamily: 'monospace' }}>
        {position} · lengthCm={lengthCm} · samples=40 · {seeds.length} seeds
      </div>
      <svg width={PLOT_WIDTH} height={PLOT_HEIGHT} style={{ background: '#252525' }}>
        {/* axes */}
        <line x1={30} y1={PLOT_HEIGHT / 2} x2={PLOT_WIDTH - 30} y2={PLOT_HEIGHT / 2} stroke="#444" strokeWidth={1} />
        <line x1={xToPx(0)} y1={20} x2={xToPx(0)} y2={PLOT_HEIGHT - 20} stroke="#444" strokeWidth={1} />
        {plots.map((p, idx) => {
          if (!p.data) return null;
          const path = p.data.points.map((pt, i) =>
            `${i === 0 ? 'M' : 'L'}${xToPx(pt[0])},${yToPx(pt[1])}`
          ).join(' ');
          const hue = (idx * 360) / plots.length;
          return (
            <path
              key={p.seed}
              d={path}
              fill="none"
              stroke={`hsl(${hue}, 70%, 60%)`}
              strokeWidth={1}
              opacity={0.6}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function LeafOutlineDebugPanel() {
  const spec = useMemo(() => parseLeafSpec(tomatoSpec), []);
  const [lengthCm, setLengthCm] = useState(15);
  const [seedCount, setSeedCount] = useState(12);
  const seeds = SEEDS.slice(0, seedCount);

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: 8,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        color: '#eee',
        padding: 12,
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 12,
        maxHeight: 'calc(100vh - 16px)',
        overflow: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
        Leaf Outline Debug (V2 buildShapeProfileV2)
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
        <span style={{ marginLeft: 16 }}>
          <label>
            seeds:{' '}
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={seedCount}
              onChange={e => setSeedCount(parseInt(e.target.value, 10))}
              style={{ verticalAlign: 'middle' }}
            />
            {' '}{seedCount}
          </label>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 8 }}>
        {POSITIONS.map(p => (
          <OutlinePlot key={p} spec={spec} position={p} seeds={seeds} lengthCm={lengthCm} />
        ))}
      </div>
    </div>
  );
}
