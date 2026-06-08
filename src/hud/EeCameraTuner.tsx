// D11 (RFP §17 · 사용자 피드백) — EE 카메라 산업 파라미터 조절 UI.
//
// EE/Depth 카메라 활성 시에만 표시. CameraDock 옆에 좁은 패널.
//   - mount 높이 (베드 위 cm)
//   - working distance (m)
//   - FOV (도)
//   - target Y (식물 응시 높이)
//
// 사용자 명시: "베드 바로 앞 튜브레일 센터 · 베드 위 25cm · 작물 다 보이게 · 파라미터 조절 가능"

import { useTwinStore } from '../state/twinStore';

interface EeCameraTunerProps {
  /** 현재 활성 카메라 view 번호 (CameraDock과 동기). 2(EE) 또는 6(Depth) 일 때만 노출. */
  activeView: number;
}

export function EeCameraTuner({ activeView }: EeCameraTunerProps) {
  const params = useTwinStore((s) => s.eeCameraParams);
  const setParam = useTwinStore((s) => s.setEeCameraParam);

  if (activeView !== 2 && activeView !== 6) return null;

  const camY = params.bedTopY + params.mountHeightCmAboveBed / 100;
  const horizDist = params.workingDistanceM;
  const vertDelta = params.targetY - camY;

  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        left: 80,
        width: 260,
        padding: 12,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        zIndex: 998,
        color: 'var(--p-fg, #ddd)',
        fontSize: 11,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--p-fg-dim, #888)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>EE Camera · 산업 파라미터</span>
        <span className="p-mono" style={{ color: 'rgb(140,200,140)' }}>
          {activeView === 2 ? 'EE' : 'Depth'}
        </span>
      </div>

      {/* Mount 높이 */}
      <Slider
        label="Mount 높이 (베드 위)"
        unit="cm"
        value={params.mountHeightCmAboveBed}
        min={0}
        max={150}
        step={1}
        onChange={(v) => setParam('mountHeightCmAboveBed', v)}
        note="튜브레일 센터 기준 25cm"
      />

      {/* Working distance */}
      <Slider
        label="Working distance"
        unit="m"
        value={params.workingDistanceM}
        min={0.2}
        max={3.5}
        step={0.05}
        onChange={(v) => setParam('workingDistanceM', v)}
        note="베드 정면 거리. 0.3~0.5 = close-up, 1.5~2 = 식물 전체"
      />

      {/* FOV */}
      <Slider
        label="FOV"
        unit="°"
        value={params.fovDeg}
        min={30}
        max={120}
        step={1}
        onChange={(v) => setParam('fovDeg', v)}
        note="산업 RGB: 60° · 광각: 90° · 망원: 35°"
      />

      {/* Target Y */}
      <Slider
        label="Target Y (응시 높이)"
        unit="m"
        value={params.targetY}
        min={1.0}
        max={3.5}
        step={0.05}
        onChange={(v) => setParam('targetY', v)}
        note="식물 중심. D70 ≈ 1.8 · D90 ≈ 2.4"
      />

      {/* 계산 결과 표시 */}
      <div
        className="p-mono"
        style={{
          fontSize: 10,
          color: 'var(--p-fg-dim, #888)',
          padding: '6px 8px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 4,
          lineHeight: 1.5,
        }}
      >
        <div>cam world Y: <strong style={{ color: 'rgb(140,200,140)' }}>{camY.toFixed(3)} m</strong></div>
        <div>horiz dist: {horizDist.toFixed(2)} m</div>
        <div>vert Δ (cam→target): {vertDelta.toFixed(2)} m</div>
        <div>radius: {Math.sqrt(horizDist ** 2 + vertDelta ** 2).toFixed(2)} m</div>
      </div>

      <button
        className="p-btn"
        onClick={() => {
          setParam('mountHeightCmAboveBed', 25);
          setParam('workingDistanceM', 1.8);
          setParam('fovDeg', 60);
          setParam('targetY', 1.8);
        }}
        style={{ padding: '4px 8px', fontSize: 10 }}
        title="산업 default 복원"
      >
        ↺ Reset (default)
      </button>
    </div>
  );
}

interface SliderProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  note?: string;
}

function Slider({ label, unit, value, min, max, step, onChange, note }: SliderProps) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 3,
        }}
      >
        <span style={{ color: 'var(--p-fg-muted, #aaa)', fontSize: 10 }}>{label}</span>
        <span
          className="p-mono"
          style={{ color: 'var(--p-fg, #ddd)', fontWeight: 600, fontSize: 11 }}
        >
          {value.toFixed(step < 1 ? 2 : 0)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        style={{ width: '100%', accentColor: 'var(--p-accent, #4080d0)' }}
      />
      {note && (
        <div style={{ fontSize: 9, color: 'var(--p-fg-dim, #888)', marginTop: 2 }}>{note}</div>
      )}
    </div>
  );
}
