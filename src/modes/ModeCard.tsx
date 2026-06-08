// ★ S141-B — Mode card (Supabase project-picker 패턴).
// S1.b·c (RFP §15) — availability='coming-soon' 처리 + valueProps 칩 표시.

import type { ModeSpec, QualityLevel } from './types';
import { ValueChip } from '../hud/ValueChip';

interface ModeCardProps {
  mode: ModeSpec;
  selectedQuality: QualityLevel;
  onSelectQuality: (q: QualityLevel) => void;
  onEnter: () => void;
}

const QUALITY_LABELS: Record<QualityLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const QUALITY_HINTS: Record<QualityLevel, string> = {
  low: '경량 LOD, 빠른 부팅',
  medium: '균형 (기본)',
  high: '풀 디테일, 무거움',
};

export function ModeCard({ mode, selectedQuality, onSelectQuality, onEnter }: ModeCardProps) {
  const hasQualityChoice = mode.availableQualityLevels.length > 1;
  const isComingSoon = mode.availability === 'coming-soon';

  return (
    <div
      className={`p-surface ${isComingSoon ? '' : 'p-surface-hover'}`}
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minWidth: 0,
        opacity: isComingSoon ? 0.6 : 1,
        position: 'relative',
      }}
    >
      {isComingSoon && (
        <span
          className="p-pill"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: 'var(--p-fg-faint, #333)',
            color: 'var(--p-fg-muted, #999)',
            padding: '2px 8px',
            borderRadius: 999,
          }}
        >
          Coming soon
        </span>
      )}
      {/* Header: icon + identifier */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'var(--p-accent-muted)',
            border: '1px solid var(--p-border-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {mode.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--p-fg)' }}>
              {mode.name}
            </h3>
          </div>
          <div className="p-mono" style={{ color: 'var(--p-fg-dim)', fontSize: 11 }}>
            {mode.key}
          </div>
        </div>
      </div>

      {/* Description */}
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--p-fg-muted)',
        }}
      >
        {mode.description}
      </p>

      {/* Value props (S1.c — 모드가 실현하는 가치명제 노출) */}
      {mode.valueProps && mode.valueProps.length > 0 && (
        <ValueChip active={mode.valueProps} compact />
      )}

      {/* Quality selector (greenhouse만 의미) */}
      {hasQualityChoice && (
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--p-fg-dim)',
              marginBottom: 6,
            }}
          >
            Rendering quality
          </div>
          <div className="p-seg">
            {(['low', 'medium', 'high'] as QualityLevel[]).map((q) => {
              const enabled = mode.availableQualityLevels.includes(q);
              return (
                <button
                  key={q}
                  className={`p-seg-item ${selectedQuality === q ? 'active' : ''}`}
                  disabled={!enabled}
                  onClick={() => enabled && onSelectQuality(q)}
                  title={QUALITY_HINTS[q]}
                >
                  {QUALITY_LABELS[q]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer: meta + CTA */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
          paddingTop: 16,
          borderTop: '1px solid var(--p-border)',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {mode.defaultQuality.extraPlants !== undefined && (
            <span className="p-pill">
              <span style={{ color: 'var(--p-fg-dim)' }}>plants</span>
              <strong style={{ color: 'var(--p-fg)', fontWeight: 600 }}>
                {(mode.defaultQuality.extraPlants ?? 0) + 1}
              </strong>
            </span>
          )}
          {mode.defaultQuality.showGreenhouseInfra && (
            <span className="p-pill">infra</span>
          )}
        </div>
        <button
          className="p-btn p-btn-primary"
          onClick={onEnter}
          disabled={isComingSoon}
          aria-disabled={isComingSoon}
          style={{
            cursor: isComingSoon ? 'not-allowed' : 'pointer',
            opacity: isComingSoon ? 0.5 : 1,
          }}
        >
          {isComingSoon ? 'Coming soon' : 'Launch →'}
        </button>
      </div>
    </div>
  );
}
