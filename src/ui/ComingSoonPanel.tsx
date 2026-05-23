// Coming-soon placeholder for modes that are not yet implemented.
// Same visual tone as the rest of the lobby: light theme, serif title,
// monospace data. A "Back to Lobby" button is the only interaction.

import { type CSSProperties } from 'react';
import { useTwinStore, type AppMode } from '../store/twinStore';

type ComingSoonMode = Exclude<AppMode, 'lobby' | 'greenhouse'>;

const COPY: Record<ComingSoonMode, {
  title: string;
  body: string;
  bullets: string[];
  tracked: string;
}> = {
  'single-plant': {
    title: 'Single-Plant Analysis',
    body: 'Hour-level growth model with full TOMSIM / Reduced TOMGRO / Gillaspy 3-phase coverage. Arriving in Phase C of the current plan.',
    bullets: [
      'Hour-level stepHourly() with diurnal PAR / temperature curve',
      'Inspector panel — cultivar, plant state, truss table, genome',
      'Timeline chart — LAI / W / W_f / GDD / NPP variable selector',
      '1×/4×/24× playback control',
    ],
    tracked: 'Tracked in current plan, Phase B + C.',
  },
  robot: {
    title: 'Harvest Robot Pose Module',
    body: 'This module is in development. Will simulate the 4-keypoint harvest pose (Wageningen ScienceDirect 2023):',
    bullets: [
      'Fruit center',
      'Calyx center',
      'Abscission zone (cut target)',
      'Branching point (peduncle root)',
    ],
    tracked: 'Tracked in plan H.',
  },
  sandbox: {
    title: 'Parameter Sandbox',
    body: 'This module is in development. Will expose cultivar / climate / scenario parameters for free editing:',
    bullets: [
      'Cultivar registry browser + editor',
      'Climate profile override (T, RH, PAR, CO2)',
      'Scenario rewrite (plant count, bed layout)',
      'Side-by-side comparison of multiple runs',
    ],
    tracked: 'Tracked in plan E (post-Sandbox).',
  },
};

const FONT_SERIF = 'Georgia, "Source Serif Pro", "Times New Roman", serif';
const FONT_MONO = 'ui-monospace, "SF Mono", Consolas, monospace';
const FONT_SANS = 'system-ui, -apple-system, "Helvetica Neue", sans-serif';

export function ComingSoonPanel({ mode }: { mode: ComingSoonMode }) {
  const setMode = useTwinStore((s) => s.setMode);
  const c = COPY[mode];

  const container: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: '#fafaf7',
    color: '#1a1d1a',
    fontFamily: FONT_SANS,
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={container}>
      <header style={{
        padding: '16px 48px',
        borderBottom: '1px solid rgba(25, 30, 25, 0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <button
          type="button"
          onClick={() => setMode('lobby')}
          style={{
            background: 'none',
            border: '1px solid rgba(25, 30, 25, 0.18)',
            borderRadius: 4,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
            color: '#1a1d1a',
            fontFamily: FONT_SANS,
          }}
        >
          ◂ Back to Lobby
        </button>
        <div style={{ fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 600 }}>
          {c.title}
        </div>
      </header>

      <main style={{ flex: 1, padding: '40px 48px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
        <div style={{ fontSize: 14, color: '#3a3f3a', lineHeight: 1.7, marginBottom: 24 }}>
          {c.body}
        </div>
        <ol style={{
          fontFamily: FONT_MONO,
          fontSize: 13,
          color: '#3a3f3a',
          lineHeight: 1.9,
          paddingLeft: 28,
          margin: '0 0 28px 0',
        }}>
          {c.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ol>
        <div style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: '#5a615a',
          padding: '10px 14px',
          background: 'rgba(0, 0, 0, 0.03)',
          borderRadius: 4,
          display: 'inline-block',
        }}>
          {c.tracked}
        </div>
      </main>
    </div>
  );
}
