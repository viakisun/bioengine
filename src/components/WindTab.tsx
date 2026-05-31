// WindTab — Iter 35 PR 2 Phase M (★ 신규).
//
// 사용자 결정: "바람도 설정". 기존 wind store fields (windStrength /
// flutterStrength / windDirection) UI 노출 — 이전에는 dev only.

import { useTwinStore } from '../store/twinStore';
import { Eyebrow } from '../ui/Eyebrow';
import { SliderRow, ToggleBtn } from '../ui/Controls';

export function WindTab() {
  const windStrength = useTwinStore((s) => s.windStrength);
  const flutterStrength = useTwinStore((s) => s.flutterStrength);
  const windDirection = useTwinStore((s) => s.windDirection);
  const setWindStrength = useTwinStore((s) => s.setWindStrength);
  const setFlutterStrength = useTwinStore((s) => s.setFlutterStrength);
  const setWindDirection = useTwinStore((s) => s.setWindDirection);
  const debugShowWindWeight = useTwinStore((s) => s.debugShowWindWeight);
  const toggleDebugWindWeight = useTwinStore((s) => s.toggleDebugWindWeight);

  const resetAll = () => {
    setWindStrength(0.5);
    setFlutterStrength(0.6);
    setWindDirection([1, 0, 0.3]);
  };

  return (
    <>
      <Eyebrow>강도</Eyebrow>
      <SliderRow
        label="바람 세기"
        value={windStrength}
        onChange={setWindStrength}
        min={0}
        max={1}
        step={0.05}
      />
      <SliderRow
        label="떨림 강도"
        value={flutterStrength}
        onChange={setFlutterStrength}
        min={0}
        max={1}
        step={0.05}
      />

      <Eyebrow>방향</Eyebrow>
      <SliderRow
        label="X 축"
        value={windDirection[0]}
        onChange={(v) => setWindDirection([v, windDirection[1], windDirection[2]])}
        min={-1}
        max={1}
        step={0.05}
      />
      <SliderRow
        label="Y 축"
        value={windDirection[1]}
        onChange={(v) => setWindDirection([windDirection[0], v, windDirection[2]])}
        min={-1}
        max={1}
        step={0.05}
      />
      <SliderRow
        label="Z 축"
        value={windDirection[2]}
        onChange={(v) => setWindDirection([windDirection[0], windDirection[1], v])}
        min={-1}
        max={1}
        step={0.05}
      />
      <div style={{ fontSize: 10, color: '#888', padding: '4px 0' }}>
        벡터 — shader 내 normalize.
      </div>

      <Eyebrow>진단</Eyebrow>
      <ToggleBtn on={debugShowWindWeight} onClick={toggleDebugWindWeight}>
        바람 가중치 시각화
      </ToggleBtn>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e0e0e0' }}>
        <button
          type="button"
          onClick={resetAll}
          style={{
            background: 'transparent',
            border: '1px solid #ccc',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          전체 리셋 (기본값)
        </button>
      </div>
    </>
  );
}
