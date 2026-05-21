// Phase E — operator-facing environment sliders.
//
// Two sliders an operator can adjust during a demo/walk-through:
//   • 바람 세기  — drives leaf shader wind (WebGL2) or CPU root rotation (WebGPU)
//   • 수분 스트레스 override — extra droop applied on top of scenario data
//
// Dev-only toggles live behind ?dev=1 — see DevControls.

import { useTwinStore } from '../store/twinStore';

export function EnvironmentControls() {
  const windStrength = useTwinStore((s) => s.windStrength);
  const setWindStrength = useTwinStore((s) => s.setWindStrength);
  const waterStressOverride = useTwinStore((s) => s.waterStressOverride);
  const setWaterStressOverride = useTwinStore((s) => s.setWaterStressOverride);

  return (
    <div
      style={{
        background: 'rgba(26,29,35,0.85)',
        border: '1px solid #2a2e36',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 11,
        color: '#d1d5db',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 220,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1,
          color: '#9ca3af',
        }}
      >
        환경 제어
      </div>
      <Row label="바람 세기" value={windStrength.toFixed(2)}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={windStrength}
          onChange={(e) => setWindStrength(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </Row>
      <Row
        label="수분 스트레스"
        value={waterStressOverride > 0 ? waterStressOverride.toFixed(2) : 'OFF'}
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={waterStressOverride}
          onChange={(e) => setWaterStressOverride(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </Row>
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
        }}
      >
        <span>{label}</span>
        <span style={{ color: '#6ee7b7', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
      </div>
      {children}
    </div>
  );
}
