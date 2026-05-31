// ModeLobby — top-level analysis-workflow entry screen.
//
// Visual tone: global crop simulator standard (DSSAT, APSIM, WUR TOMSIM,
// GroIMP). Light theme, serif title + monospace data + sans-serif body.
// No emoji, no gradient — academic publication look.
//
// Layout: title strip → 2×2 mode grid → references list → status bar.

import { type CSSProperties } from 'react';
import { useTwinStore, type AppMode } from '../store/twinStore';
import { ACADEMIC_REFERENCES, MODEL_BACKBONE_LABEL } from '../data/references';

interface ModeCard {
  id: AppMode;
  icon: string;           // single geometric glyph
  title: string;
  description: string;
  citation: string;       // model / paper this mode is grounded on
  status: 'ready' | 'wip';
}

const MODE_CARDS: ModeCard[] = [
  {
    id: 'greenhouse',
    icon: '◇',
    title: 'Greenhouse Twin',
    description: 'Multi-plant operational scenario · 720 plants · scenario K-smartfarm',
    citation: 'Snapshot view · sigmoid growth curves',
    status: 'ready',
  },
  {
    id: 'single-plant',
    icon: '▣',
    title: 'Single-Plant Analysis',
    description: 'Hour-level growth model · 1 plant · 1h resolution thermal time',
    citation: MODEL_BACKBONE_LABEL,
    status: 'ready',
  },
  {
    id: 'robot',
    icon: '▢',
    title: 'Harvest Robot Pose',
    description: '4-keypoint anchor simulation (ScienceDirect 2023 standard)',
    citation: 'fruitCenter · calyxCenter · abscissionZone · branchingPoint',
    status: 'wip',
  },
  {
    id: 'sandbox',
    icon: '▤',
    title: 'Parameter Sandbox',
    description: 'Cultivar / climate / scenario free editing',
    citation: 'Cultivar registry · live-editable',
    status: 'wip',
  },
];

const FONT_SERIF = 'Georgia, "Source Serif Pro", "Times New Roman", serif';
const FONT_MONO = 'ui-monospace, "SF Mono", Consolas, monospace';
const FONT_SANS = 'system-ui, -apple-system, "Helvetica Neue", sans-serif';

export function ModeLobby() {
  const setMode = useTwinStore((s) => s.setMode);
  const env = useTwinStore((s) => s.boot.env);

  const containerStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: '#fafaf7',
    color: '#1a1d1a',
    fontFamily: FONT_SANS,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
  };

  return (
    <div style={containerStyle}>
      {/* Top strip — app title + model backbone */}
      <header style={{
        padding: '20px 48px',
        borderBottom: '1px solid rgba(25, 30, 25, 0.08)',
        display: 'flex',
        alignItems: 'baseline',
        gap: 24,
      }}>
        <div style={{ fontFamily: FONT_SERIF, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>
          FarmSim
        </div>
        <div style={{ fontSize: 12, color: '#5a615a' }}>
          Tomato Growth Simulator v0.1 ·{' '}
          <span style={{ fontFamily: FONT_MONO }}>CoreModel based on Heuvelink 1996</span>
        </div>
      </header>

      {/* Main content */}
      <div style={{ flex: 1, padding: '32px 48px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {/* Section header */}
        <div style={{
          fontFamily: FONT_SANS,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          color: '#5a615a',
          marginBottom: 16,
          textTransform: 'uppercase',
        }}>
          Analysis Workflow
        </div>

        {/* 2×2 mode grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 40,
        }}>
          {MODE_CARDS.map((card) => (
            <ModeCardView key={card.id} card={card} onOpen={() => setMode(card.id)} />
          ))}
        </div>

        {/* References */}
        <div style={{
          fontFamily: FONT_SANS,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          color: '#5a615a',
          marginBottom: 12,
          textTransform: 'uppercase',
        }}>
          References
        </div>
        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: '#3a3f3a',
          lineHeight: 1.8,
        }}>
          {ACADEMIC_REFERENCES.map((r) => (
            <li key={r.id} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#8a8f87' }}>·</span>
              <span>
                {r.cite} — <span style={{ color: '#5a615a' }}>{r.topic}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Status bar */}
      <footer style={{
        padding: '8px 48px',
        borderTop: '1px solid rgba(25, 30, 25, 0.08)',
        fontFamily: FONT_MONO,
        fontSize: 10,
        color: '#5a615a',
        background: 'rgba(0, 0, 0, 0.02)',
      }}>
        Engine: Babylon.js · {env.backend.toUpperCase()} ·{' '}
        {env.gpuDevice || '—'} ·{' '}
        720 plants registered
      </footer>
    </div>
  );
}

function ModeCardView({ card, onOpen }: { card: ModeCard; onOpen: () => void }) {
  const isReady = card.status === 'ready';
  const cardStyle: CSSProperties = {
    background: '#ffffff',
    border: '1px solid rgba(25, 30, 25, 0.12)',
    borderRadius: 4,
    padding: '20px 22px',
    cursor: isReady ? 'pointer' : 'default',
    opacity: isReady ? 1 : 0.7,
    transition: 'border-color 120ms ease, transform 120ms ease',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 160,
  };
  return (
    <div
      style={cardStyle}
      onClick={isReady ? onOpen : undefined}
      onMouseEnter={(e) => {
        if (isReady) {
          (e.currentTarget as HTMLDivElement).style.borderColor = '#1a1d1a';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(25, 30, 25, 0.12)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 20, color: '#1a1d1a', fontFamily: FONT_SERIF, lineHeight: 1 }}>
          {card.icon}
        </div>
        <h2 style={{
          margin: 0,
          fontFamily: FONT_SERIF,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '-0.005em',
        }}>
          {card.title}
        </h2>
      </div>
      <div style={{ fontSize: 12, color: '#3a3f3a', lineHeight: 1.55, marginBottom: 10 }}>
        {card.description}
      </div>
      <div style={{
        fontFamily: FONT_MONO,
        fontSize: 10,
        color: '#5a615a',
        marginBottom: 14,
        lineHeight: 1.5,
      }}>
        {card.citation}
      </div>
      <div style={{
        marginTop: 'auto',
        display: 'flex',
        justifyContent: 'flex-end',
        fontFamily: FONT_MONO,
        fontSize: 11,
        color: isReady ? '#0ea5e9' : '#8a8f87',
      }}>
        {isReady ? 'Open →' : 'In development'}
      </div>
    </div>
  );
}
