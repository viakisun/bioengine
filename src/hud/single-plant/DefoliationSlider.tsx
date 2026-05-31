// DefoliationSlider — 화면 왼쪽 중앙 vertical slider.
//
// 적엽 (defoliation) 높이 조절: 0~100cm range.
//   0   = 적엽 없음 (모든 잎)
//   30  = 하부 30cm 살아있는 잎 hide (기본 농가 작업)
//   100 = 살아있는 잎 거의 모두 hide
//
// SkinMeshPlant이 relative 산정 — minLeafY + defoliationHeightCm 까지 hide.
// 작물 height 자체는 _불변_ (잎만 사라짐).

import { useTwinStore } from '../../state/twinStore';
import { FONT_MONO, C_FG, C_FG_MUTE, C_BORDER, C_ACCENT } from './styles';

const MIN_CM = 0;
const MAX_CM = 100;
const STEP_CM = 5;

export function DefoliationSlider() {
  const value = useTwinStore((s) => s.defoliationHeightCm);
  const setValue = useTwinStore((s) => s.setDefoliationHeightCm);

  const active = value > 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(255, 255, 255, 0.86)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${C_BORDER}`,
        borderRadius: 16,
        padding: '14px 10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        fontFamily: FONT_MONO,
        fontSize: 10,
        color: C_FG,
        userSelect: 'none',
      }}
    >
      {/* 라벨 */}
      <div style={{ fontSize: 10, color: C_FG_MUTE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        적엽
      </div>

      {/* 현재 값 */}
      <div style={{ fontSize: 14, fontWeight: 600, color: active ? C_ACCENT : C_FG_MUTE, minWidth: 36, textAlign: 'center' }}>
        {value}<span style={{ fontSize: 9, color: C_FG_MUTE, marginLeft: 1 }}>cm</span>
      </div>

      {/* Vertical slider — CSS rotation (HTML input은 horizontal default) */}
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <input
          type="range"
          min={MIN_CM}
          max={MAX_CM}
          step={STEP_CM}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value, 10))}
          style={{
            // vertical orientation via CSS rotate. width/height swap.
            width: 220,
            height: 4,
            transform: 'rotate(-90deg)',
            transformOrigin: 'center center',
            cursor: 'pointer',
            accentColor: C_ACCENT,
          }}
          aria-label="적엽 높이 조절"
        />
      </div>

      {/* 끝 라벨 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 9, color: C_FG_MUTE }}>
        <span>0</span>
        <span style={{ opacity: 0.5 }}>cm</span>
      </div>

      {/* OFF 버튼 (한 번에 0 리셋) */}
      {active && (
        <button
          type="button"
          onClick={() => setValue(0)}
          style={{
            background: 'transparent',
            border: `1px solid ${C_BORDER}`,
            borderRadius: 10,
            padding: '3px 8px',
            fontSize: 10,
            fontFamily: FONT_MONO,
            color: C_FG_MUTE,
            cursor: 'pointer',
          }}
        >
          OFF
        </button>
      )}
    </div>
  );
}
