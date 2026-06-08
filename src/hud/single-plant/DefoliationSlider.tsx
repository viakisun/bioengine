// DefoliationSlider — 적엽 (defoliation) 높이 조절.
//
// §19 UX 개선 — 화면 가림 최소화. 좌하단 horizontal compact chip 형태.
//   가로 280px, 높이 56px. 위치 좌하단(타임바 위쪽).
//   값 0 = 적엽 없음 (OFF). >0 = 활성.

import { useTwinStore } from '../../state/twinStore';
import { FONT_MONO, C_FG, C_FG_MUTE, C_BORDER, C_ACCENT } from './styles';

const MIN_CM = 0;
const MAX_CM_DEFAULT = 100;
const STEP_CM = 5;

interface DefoliationSliderProps {
  max?: number;
}

export function DefoliationSlider({ max = MAX_CM_DEFAULT }: DefoliationSliderProps = {}) {
  const value = useTwinStore((s) => s.defoliationHeightCm);
  const setValue = useTwinStore((s) => s.setDefoliationHeightCm);

  const active = value > 0;
  const effectiveMax = Math.max(MIN_CM, max);

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: 64,
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${C_BORDER}`,
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        fontFamily: FONT_MONO,
        fontSize: 10,
        color: C_FG,
        userSelect: 'none',
        width: 280,
        height: 36,
        boxSizing: 'content-box',
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: C_FG_MUTE,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        적엽
      </span>

      <input
        type="range"
        min={MIN_CM}
        max={effectiveMax}
        step={STEP_CM}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value, 10))}
        style={{
          flex: 1,
          accentColor: C_ACCENT,
          cursor: 'pointer',
        }}
        aria-label="적엽 높이 조절"
      />

      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: active ? C_ACCENT : C_FG_MUTE,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 44,
          textAlign: 'right',
        }}
      >
        {value}
        <span style={{ fontSize: 9, color: C_FG_MUTE, marginLeft: 1 }}>/{effectiveMax}cm</span>
      </span>

      {active && (
        <button
          type="button"
          onClick={() => setValue(0)}
          style={{
            background: 'transparent',
            border: `1px solid ${C_BORDER}`,
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 9,
            fontFamily: FONT_MONO,
            color: C_FG_MUTE,
            cursor: 'pointer',
            letterSpacing: '0.06em',
          }}
        >
          OFF
        </button>
      )}
    </div>
  );
}
