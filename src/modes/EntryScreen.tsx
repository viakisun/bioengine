// ★ S141-B — Entry screen (Supabase project picker 패턴).
//
// 2-column layout:
//   좌: sidebar (브랜드 + 메타 + 링크)
//   우: mode cards (project picker)

import { useState } from 'react';
import { BRAND, getBuildHash } from './brand';
import { MODES, MODE_KEYS } from './registry';
import type { ModeKey, ModeQualityConfig, QualityLevel } from './types';
import { ModeCard } from './ModeCard';
import '../styles/phytosim.css';

interface EntryScreenProps {
  onEnter: (mode: ModeKey, quality: ModeQualityConfig) => void;
}

export function EntryScreen({ onEnter }: EntryScreenProps) {
  const [qualityByMode, setQualityByMode] = useState<Record<ModeKey, QualityLevel>>(() => {
    const init: Record<ModeKey, QualityLevel> = {} as Record<ModeKey, QualityLevel>;
    for (const k of MODE_KEYS) init[k] = MODES[k].defaultQuality.level;
    return init;
  });

  function handleEnter(modeKey: ModeKey) {
    const mode = MODES[modeKey];
    const quality: ModeQualityConfig = {
      ...mode.defaultQuality,
      level: qualityByMode[modeKey],
    };
    onEnter(modeKey, quality);
  }

  return (
    <div
      className="phytosim-entry"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background: 'var(--p-bg)',
        overflow: 'hidden',
      }}
    >
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside
        style={{
          borderRight: '1px solid var(--p-border)',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
          background: 'var(--p-bg-deep)',
        }}
      >
        {/* Brand mark */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="p-dot" />
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
              {BRAND.name}
            </span>
          </div>
          <div className="p-mono" style={{ color: 'var(--p-fg-dim)', fontSize: 11 }}>
            {BRAND.taglineEn.toLowerCase().replace(/\s+/g, '-')}
          </div>
        </div>

        {/* Welcome section */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              color: 'var(--p-fg-dim)',
              marginBottom: 12,
            }}
          >
            Welcome
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--p-fg-muted)',
            }}
          >
            실험 환경을 선택하세요.
            <br />
            각 모드는 독립된 시뮬레이션 파이프라인을 사용합니다.
          </p>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          <a className="p-link" href="#" onClick={(e) => e.preventDefault()}>
            Documentation
          </a>
          <a className="p-link" href="#" onClick={(e) => e.preventDefault()}>
            Changelog
          </a>
          <a className="p-link" href="#" onClick={(e) => e.preventDefault()}>
            GitHub
          </a>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Footer meta */}
        <div
          style={{
            borderTop: '1px solid var(--p-border)',
            paddingTop: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="p-badge">{BRAND.status}</span>
            <span className="p-mono" style={{ color: 'var(--p-fg-dim)' }}>
              v{BRAND.version}
            </span>
          </div>
          <div className="p-mono" style={{ color: 'var(--p-fg-faint)', fontSize: 11 }}>
            {getBuildHash()}
          </div>
        </div>
      </aside>

      {/* ── Main: Mode cards ────────────────────────────── */}
      <main
        style={{
          padding: '48px 64px',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
        }}
      >
        {/* Header */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              color: 'var(--p-fg-dim)',
              marginBottom: 8,
            }}
          >
            Simulation Environments
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--p-fg)',
              marginBottom: 8,
            }}
          >
            {BRAND.tagline}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.55,
              color: 'var(--p-fg-muted)',
              maxWidth: 640,
            }}
          >
            {BRAND.description}
          </p>
        </div>

        {/* Mode cards grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 16,
            maxWidth: 880,
          }}
        >
          {MODE_KEYS.map((key) => (
            <ModeCard
              key={key}
              mode={MODES[key]}
              selectedQuality={qualityByMode[key]}
              onSelectQuality={(q) =>
                setQualityByMode((prev) => ({ ...prev, [key]: q }))
              }
              onEnter={() => handleEnter(key)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
