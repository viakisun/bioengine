// ★ S136 — Mode selector entry UI.
//
// App entry → Mode selection screen.
// 사용자가 mode + quality 선택 → onEnter callback 호출.

import { useState, type CSSProperties } from 'react';
import { MODES, MODE_KEYS } from './registry';
import type { ModeKey, ModeQualityConfig, QualityLevel } from './types';

const containerStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#0f1115',
  color: '#e8e8e8',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const titleStyle: CSSProperties = {
  fontSize: 36,
  fontWeight: 600,
  margin: '0 0 8px',
  letterSpacing: '-0.02em',
};

const subtitleStyle: CSSProperties = {
  fontSize: 14,
  color: '#9ca3af',
  margin: '0 0 48px',
};

const cardsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 24,
  maxWidth: 800,
};

const cardStyle = (selected: boolean): CSSProperties => ({
  background: selected ? '#1e2937' : '#15181f',
  border: selected ? '2px solid #4ade80' : '2px solid #1e2937',
  borderRadius: 12,
  padding: '28px 24px',
  width: 320,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
});

const cardIconStyle: CSSProperties = {
  fontSize: 48,
  marginBottom: 8,
};

const cardNameStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  margin: 0,
};

const cardDescStyle: CSSProperties = {
  fontSize: 13,
  color: '#9ca3af',
  lineHeight: 1.5,
  margin: 0,
  minHeight: 60,
};

const qualityRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 8,
};

const qualityButtonStyle = (active: boolean, disabled: boolean): CSSProperties => ({
  flex: 1,
  padding: '6px 0',
  background: active ? '#4ade80' : 'transparent',
  color: active ? '#0f1115' : disabled ? '#4b5563' : '#9ca3af',
  border: `1px solid ${active ? '#4ade80' : '#374151'}`,
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'all 0.1s',
});

const enterButtonStyle: CSSProperties = {
  marginTop: 32,
  padding: '12px 48px',
  background: '#4ade80',
  color: '#0f1115',
  border: 'none',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '0.02em',
};

const QUALITY_LABELS: Record<QualityLevel, string> = {
  low: '저',
  medium: '중',
  high: '고',
};

interface ModeSelectorProps {
  onEnter: (mode: ModeKey, quality: ModeQualityConfig) => void;
  initialMode?: ModeKey;
}

export function ModeSelector({ onEnter, initialMode }: ModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<ModeKey>(initialMode ?? 'single-plant');
  const [qualityByMode, setQualityByMode] = useState<Record<ModeKey, QualityLevel>>(() => {
    const init: Record<ModeKey, QualityLevel> = {} as Record<ModeKey, QualityLevel>;
    for (const k of MODE_KEYS) init[k] = MODES[k].defaultQuality.level;
    return init;
  });

  function handleEnter() {
    const mode = MODES[selectedMode];
    const quality: ModeQualityConfig = {
      ...mode.defaultQuality,
      level: qualityByMode[selectedMode],
    };
    onEnter(selectedMode, quality);
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>🌱 FarmSim</h1>
      <p style={subtitleStyle}>토마토 시뮬레이션 — 모드를 선택하세요</p>

      <div style={cardsRowStyle}>
        {MODE_KEYS.map((key) => {
          const mode = MODES[key];
          const selected = selectedMode === key;
          return (
            <div
              key={key}
              style={cardStyle(selected)}
              onClick={() => setSelectedMode(key)}
            >
              <div style={cardIconStyle}>{mode.icon}</div>
              <h2 style={cardNameStyle}>{mode.name}</h2>
              <p style={cardDescStyle}>{mode.description}</p>
              <div style={qualityRowStyle}>
                {(['low', 'medium', 'high'] as QualityLevel[]).map((q) => {
                  const enabled = mode.availableQualityLevels.includes(q);
                  const active = enabled && qualityByMode[key] === q;
                  return (
                    <button
                      key={q}
                      style={qualityButtonStyle(active, !enabled)}
                      disabled={!enabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (enabled) {
                          setSelectedMode(key);
                          setQualityByMode((prev) => ({ ...prev, [key]: q }));
                        }
                      }}
                    >
                      {QUALITY_LABELS[q]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button style={enterButtonStyle} onClick={handleEnter}>
        진입 →
      </button>
    </div>
  );
}
