// ★ L9-D V2 — Outline debug panel (?outlineDebug=1).
//
// S110: NATURAL_LEAFLET_SAMPLES 10개 _실제_ outline 시각화.
// 사용: localhost:8090?outlineDebug=1

import { useMemo, useState } from 'react';
import {
  buildShapeProfileV2,
  NATURAL_LEAFLET_SAMPLES,
  NATURAL_LEAFLET_SAMPLE_NAMES,
  type ShapeProfileV2Input,
} from '../scene/leaf/LeafMeshBuilder2';

const PLOT_WIDTH = 220;
const PLOT_HEIGHT = 380;

function plotSample(sampleIdx: number, lengthCm: number, idSeed: number) {
  const sample = NATURAL_LEAFLET_SAMPLES[sampleIdx];
  const lengthM = lengthCm / 100;
  const lobeDepthMult = Math.max(0.2, Math.min(1.0, lengthM / 0.20));

  const scaledShoulderLobes = sample.shoulderLobes.map(lobe => ({
    ...lobe,
    depth: lobe.depth * lobeDepthMult,
  }));
  const scaledSinusNotches = sample.sinusNotches.map(notch => ({
    ...notch,
    depth: notch.depth * lobeDepthMult,
  }));
  const scaledShoulderLobesRight = sample.shoulderLobesRight
    ? sample.shoulderLobesRight.map(lobe => ({ ...lobe, depth: lobe.depth * lobeDepthMult }))
    : undefined;
  const scaledSinusNotchesRight = sample.sinusNotchesRight
    ? sample.sinusNotchesRight.map(notch => ({ ...notch, depth: notch.depth * lobeDepthMult }))
    : undefined;

  const input: ShapeProfileV2Input = {
    lengthM,
    aspectRatio: sample.aspectRatio,
    tipSharpness: sample.tipSharpness,
    baseShape: 0.85,
    asymmetry: 0,
    samples: 40,
    baseTransitionEndU: 0.25,
    shoulderLobes: scaledShoulderLobes,
    sinusNotches: scaledSinusNotches,
    shoulderLobesRight: scaledShoulderLobesRight,
    sinusNotchesRight: scaledSinusNotchesRight,
    dripTipUStart: sample.dripTipUStart,
    dripTipDepth: sample.dripTipDepth,
    expansionProgress: 1.0,
    ageFrac: 0,
    smoothMargin: false,
    idSeed,
  };

  return buildShapeProfileV2(input);
}

function SamplePlot({
  sampleIdx,
  lengthCm,
  idSeed,
}: {
  sampleIdx: number;
  lengthCm: number;
  idSeed: number;
}) {
  const profile = useMemo(
    () => plotSample(sampleIdx, lengthCm, idSeed),
    [sampleIdx, lengthCm, idSeed],
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

  const hue = (sampleIdx * 36) % 360;
  const maxHWCm = maxHW * 100;

  return (
    <div style={{ background: '#1e1e1e', padding: 6, borderRadius: 4 }}>
      <div style={{ color: '#aaa', fontSize: 10, marginBottom: 4, fontFamily: 'monospace' }}>
        {NATURAL_LEAFLET_SAMPLE_NAMES[sampleIdx]}
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
  const [idSeed, setIdSeed] = useState(1001);

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
        S108 10 Natural Samples (jitter idSeed={idSeed})
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
      <div style={{ marginBottom: 8 }}>
        <label>
          jitter seed:{' '}
          <input
            type="range"
            min={1000}
            max={1020}
            step={1}
            value={idSeed}
            onChange={e => setIdSeed(parseInt(e.target.value, 10))}
            style={{ verticalAlign: 'middle' }}
          />
          {' '}{idSeed}
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, auto)', gap: 6 }}>
        {NATURAL_LEAFLET_SAMPLES.map((_, idx) => (
          <SamplePlot key={idx} sampleIdx={idx} lengthCm={lengthCm} idSeed={idSeed} />
        ))}
      </div>
    </div>
  );
}
