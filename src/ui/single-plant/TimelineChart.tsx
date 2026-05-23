// TimelineChart — SVG line chart of one PlantPhysiologyState variable
// over a sliding time window.
//
// Implementation note: the chart is *not* a true history (we don't keep
// per-minute snapshots — that would mean 172,800 entries for 120 days).
// Instead we re-simulate from day 0 to (currentMinute - window) with
// daily sampling, then minutely from there. The result is a smooth
// trace for the visible window without ballooning memory.
//
// All math: inline SVG, no chart library dependency.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useTwinStore,
  SINGLE_PLANT_CHART_VARS,
  type SinglePlantChartVar,
} from '../../store/twinStore';
import { useSinglePlantState } from './useSinglePlantState';
import {
  GrowthEngine,
  type PlantPhysiologyState,
} from '@farmsim/tomato-engine';
import {
  FONT_MONO,
  FONT_SANS,
  C_BORDER,
  C_FG,
  C_FG_MUTE,
  C_FG_DIM,
  CHART_COLORS,
  PANEL_HEADER_LABEL,
} from './styles';
import { tempAtHour, parAtHour } from '@farmsim/tomato-engine';

const PLANT_SEED = 1001;
const CULTIVAR_NAME = 'tomimaru-muchoo';

const WINDOWS = [
  { id: '1d' as const, label: '1 day', minutes: 24 * 60 },
  { id: '7d' as const, label: '7 days', minutes: 7 * 24 * 60 },
  { id: '30d' as const, label: '30 days', minutes: 30 * 24 * 60 },
  { id: 'all' as const, label: 'All', minutes: 120 * 24 * 60 },
];

const SAMPLE_COUNT = 80;  // chart resolution — 80 horizontal points

function readVar(s: PlantPhysiologyState, v: string, fracHour: number): number {
  // Standard top-level variables
  switch (v) {
    case 'TT': return s.TT;
    case 'LAI': return s.LAI;
    case 'W': return s.W;
    case 'W_f': return s.W_f;
    case 'W_m': return s.W_m;
    case 'HI': return s.W > 0 ? s.W_f / s.W : 0;
    case 'N': return s.N;
    case 'heightCm': return s.heightCm;
    case 'PAR_now': return parAtHour(14, 20, fracHour);
    case 'T_now': return tempAtHour(22, fracHour);
  }
  // Truss-N fruit DM — pattern "truss_<n>_dm"
  const trussMatch = v.match(/^truss_(\d+)_dm$/);
  if (trussMatch) {
    const idx = parseInt(trussMatch[1], 10) - 1;
    const truss = s.trusses[idx];
    if (!truss) return 0;
    let dm = 0;
    for (const f of truss.fruits) {
      if (f.aborted) continue;
      dm += f.W_fruit_dry;
    }
    return dm;
  }
  return 0;
}

export function TimelineChart() {
  const variable = useTwinStore((s) => s.singlePlantChartVar);
  const setVar = useTwinStore((s) => s.setSinglePlantChartVar);
  const window = useTwinStore((s) => s.singlePlantChartWindow);
  const setWindow = useTwinStore((s) => s.setSinglePlantChartWindow);
  const currentMinute = useTwinStore((s) => s.singlePlantMinute);
  const liveState = useSinglePlantState();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 130 });

  // Track container size for SVG viewBox
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const win = WINDOWS.find((w) => w.id === window) ?? WINDOWS[1];

  // Re-simulate the chart's sample range each time inputs change.
  // We create an isolated GrowthEngine so we don't disturb the main one
  // (the main engine's state is needed for the Inspector at the
  // current scrub position).
  const samples = useMemo(() => {
    const winMin = win.minutes;
    const startMin = Math.max(0, currentMinute - winMin);
    const endMin = currentMinute;
    const dx = Math.max(1, Math.floor((endMin - startMin) / SAMPLE_COUNT));

    const sim = new GrowthEngine();
    sim.addPlant({ seed: PLANT_SEED, cultivarName: CULTIVAR_NAME });
    const out: Array<{ minute: number; value: number }> = [];
    for (let m = startMin; m <= endMin; m += dx) {
      const st = sim.simulatePlantToMinute(PLANT_SEED, m);
      const fracHour = (m % 1440) / 60;
      out.push({ minute: m, value: readVar(st, variable, fracHour) });
    }
    return out;
  }, [variable, win.id, currentMinute, win.minutes]);

  const { w, h } = size;
  const padL = 50, padR = 12, padT = 12, padB = 22;
  const plotW = Math.max(10, w - padL - padR);
  const plotH = Math.max(10, h - padT - padB);

  const { yMin, yMax } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of samples) {
      if (s.value < lo) lo = s.value;
      if (s.value > hi) hi = s.value;
    }
    if (lo === Infinity) { lo = 0; hi = 1; }
    if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * 0.08;
    return { yMin: lo - pad, yMax: hi + pad };
  }, [samples]);

  const xMin = samples[0]?.minute ?? 0;
  const xMax = samples[samples.length - 1]?.minute ?? 1;
  const xRange = Math.max(1, xMax - xMin);

  const x = (m: number) => padL + ((m - xMin) / xRange) * plotW;
  const y = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // Phenology event markers — convert TT to approximate minute at the
  // current cultivar's T_eff (12 °C·d/day at 22 °C constant → 1 TT per
  // 120 minutes). Filter to events within the visible window.
  const TT_TO_MINUTE = 120;  // minutes per °C·d at T_eff = 12
  const eventMarkers: Array<{ minute: number; label: string; color: string }> = [];
  if (liveState) {
    for (let ti = 0; ti < liveState.trusses.length; ti++) {
      const truss = liveState.trusses[ti];
      const emergeMin = truss.emergenceTT * TT_TO_MINUTE;
      if (emergeMin >= xMin && emergeMin <= xMax) {
        eventMarkers.push({
          minute: emergeMin,
          label: `T${ti + 1}`,
          color: '#0ea5e9',
        });
      }
    }
    // First fruit set event
    let firstSetTT = Infinity;
    for (const t of liveState.trusses) {
      for (const f of t.fruits) {
        if (f.fertilizationTT > 0 && f.fertilizationTT < firstSetTT) firstSetTT = f.fertilizationTT;
      }
    }
    if (firstSetTT < Infinity) {
      const setMin = firstSetTT * TT_TO_MINUTE;
      if (setMin >= xMin && setMin <= xMax) {
        eventMarkers.push({ minute: setMin, label: 'set', color: '#16a34a' });
      }
    }
    // First red fruit
    let firstRedTT = Infinity;
    for (const t of liveState.trusses) {
      for (const f of t.fruits) {
        if (f.ripenStage === 5 && f.ripenStartTT > 0 && f.ripenStartTT < firstRedTT) {
          firstRedTT = f.ripenStartTT;
        }
      }
    }
    if (firstRedTT < Infinity) {
      const redMin = firstRedTT * TT_TO_MINUTE;
      if (redMin >= xMin && redMin <= xMax) {
        eventMarkers.push({ minute: redMin, label: 'R', color: '#dc2626' });
      }
    }
  }

  const path = samples.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(s.minute).toFixed(1)} ${y(s.value).toFixed(1)}`).join(' ');
  const color = CHART_COLORS[variable] ?? '#984ea3';  // truss DM → purple
  const standardMeta = SINGLE_PLANT_CHART_VARS.find((v) => v.id === variable);
  const trussMatch = (variable as string).match(/^truss_(\d+)_dm$/);
  const meta = standardMeta ?? (trussMatch
    ? { label: `Truss ${trussMatch[1]} fruit DM`, unit: 'g' }
    : { label: variable, unit: '' });
  const currentValue = samples[samples.length - 1]?.value ?? 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '12px 16px',
      borderTop: `1px solid ${C_BORDER}`,
      background: '#fff',
      fontFamily: FONT_SANS,
      gap: 8,
      minHeight: 0,
      flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11 }}>
        <span style={PANEL_HEADER_LABEL}>Timeline</span>

        <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: C_FG_MUTE, fontFamily: FONT_MONO }}>
          y-axis:
          <select
            value={variable}
            onChange={(e) => setVar(e.target.value as SinglePlantChartVar)}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              padding: '2px 6px',
              background: '#fff',
              border: `1px solid ${C_BORDER}`,
              borderRadius: 3,
              color: C_FG,
            }}
          >
            <optgroup label="Plant">
              {SINGLE_PLANT_CHART_VARS.map((v) => (
                <option key={v.id} value={v.id}>{v.label} [{v.unit}]</option>
              ))}
            </optgroup>
            {liveState && liveState.trusses.length > 0 && (
              <optgroup label="Per truss">
                {liveState.trusses.map((_, i) => (
                  <option key={`truss_${i + 1}_dm`} value={`truss_${i + 1}_dm`}>
                    Truss {i + 1} fruit DM [g]
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: C_FG_MUTE, fontFamily: FONT_MONO }}>
          window:
          <select
            value={window}
            onChange={(e) => setWindow(e.target.value as '1d' | '7d' | '30d' | 'all')}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              padding: '2px 6px',
              background: '#fff',
              border: `1px solid ${C_BORDER}`,
              borderRadius: 3,
              color: C_FG,
            }}
          >
            {WINDOWS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </label>

        <div style={{ marginLeft: 'auto', fontFamily: FONT_MONO, color: color, fontSize: 12 }}>
          {meta.label} {currentValue.toFixed(2)} <span style={{ color: C_FG_DIM, fontSize: 10 }}>{meta.unit}</span>
        </div>
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
          {/* Y-axis grid */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const yPos = padT + plotH * t;
            const val = yMax - (yMax - yMin) * t;
            return (
              <g key={i}>
                <line x1={padL} x2={padL + plotW} y1={yPos} y2={yPos} stroke="#e8e8e2" strokeWidth={1} />
                <text x={padL - 6} y={yPos + 3} fontFamily="ui-monospace" fontSize={9} fill={C_FG_DIM} textAnchor="end">
                  {val.toFixed(val < 10 ? 2 : 0)}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {samples.length > 1 && [0, 0.5, 1].map((t, i) => {
            const m = xMin + (xMax - xMin) * t;
            const xPos = padL + plotW * t;
            const day = Math.floor(m / 1440);
            const hour = Math.floor((m % 1440) / 60);
            return (
              <text key={i} x={xPos} y={padT + plotH + 14} fontFamily="ui-monospace" fontSize={9} fill={C_FG_DIM} textAnchor="middle">
                D{day} {String(hour).padStart(2, '0')}:00
              </text>
            );
          })}

          {/* Phenology event markers — vertical lines + small labels */}
          {eventMarkers.map((ev, i) => {
            const xPos = x(ev.minute);
            return (
              <g key={i}>
                <line
                  x1={xPos} x2={xPos}
                  y1={padT} y2={padT + plotH}
                  stroke={ev.color}
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                  opacity={0.55}
                />
                <text
                  x={xPos + 2}
                  y={padT + 8}
                  fontFamily="ui-monospace"
                  fontSize={8.5}
                  fill={ev.color}
                  opacity={0.85}
                >
                  {ev.label}
                </text>
              </g>
            );
          })}

          {/* Trace */}
          <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />

          {/* Current value dot */}
          {samples.length > 0 && (
            <circle
              cx={x(samples[samples.length - 1].minute)}
              cy={y(samples[samples.length - 1].value)}
              r={3}
              fill={color}
              stroke="#fff"
              strokeWidth={1}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
