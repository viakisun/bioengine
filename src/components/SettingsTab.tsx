// SettingsTab — Iter 35 PR 2 Phase M (★ 신규).
//
// 사용자 결정: "그 밖의 설정은 또 설정 버튼 안에". Lighting/Skeleton/Wind 외
// 잡다 설정 (debug toggles + 환경 override).

import { useTwinStore } from '../store/twinStore';
import { Eyebrow } from '../ui/Eyebrow';
import { SliderRow, ToggleBtn } from '../ui/Controls';

export function SettingsTab() {
  const debugDiagnostics = useTwinStore((s) => s.debugDiagnostics);
  const setDebugDiagnostics = useTwinStore((s) => s.setDebugDiagnostics);
  const debugShowLodColors = useTwinStore((s) => s.debugShowLodColors);
  const toggleDebugLodColors = useTwinStore((s) => s.toggleDebugLodColors);
  const debugShowInteractionRadius = useTwinStore((s) => s.debugShowInteractionRadius);
  const toggleDebugInteractionRadius = useTwinStore((s) => s.toggleDebugInteractionRadius);
  const waterStressOverride = useTwinStore((s) => s.waterStressOverride);
  const setWaterStressOverride = useTwinStore((s) => s.setWaterStressOverride);

  return (
    <>
      <Eyebrow>진단</Eyebrow>
      <ToggleBtn on={debugDiagnostics} onClick={() => setDebugDiagnostics(!debugDiagnostics)}>
        진단 로그
      </ToggleBtn>
      <ToggleBtn on={debugShowLodColors} onClick={toggleDebugLodColors}>
        LOD 색상 시각화
      </ToggleBtn>
      <ToggleBtn on={debugShowInteractionRadius} onClick={toggleDebugInteractionRadius}>
        상호작용 반경 표시
      </ToggleBtn>

      <Eyebrow>환경</Eyebrow>
      <SliderRow
        label="수분 스트레스 override"
        value={waterStressOverride}
        onChange={setWaterStressOverride}
        min={0}
        max={1}
        step={0.05}
      />
      <div style={{ fontSize: 10, color: '#888', padding: '4px 0' }}>
        0 = scenario 그대로
      </div>
    </>
  );
}
