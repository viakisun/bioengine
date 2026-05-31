// SettingsTab — Iter 35 PR 2 Phase M (★ 신규).
//
// 사용자 결정: "그 밖의 설정은 또 설정 버튼 안에". Lighting/Skeleton/Wind 외
// 잡다 설정 (debug toggles + 환경 override).

import { useTwinStore } from '../state/twinStore';
import { Eyebrow } from '../hud/controls/Eyebrow';
import { ToggleBtn } from '../hud/controls/Controls';

export function SettingsTab() {
  const debugDiagnostics = useTwinStore((s) => s.debugDiagnostics);
  const setDebugDiagnostics = useTwinStore((s) => s.setDebugDiagnostics);
  const debugShowLodColors = useTwinStore((s) => s.debugShowLodColors);
  const toggleDebugLodColors = useTwinStore((s) => s.toggleDebugLodColors);
  const debugShowInteractionRadius = useTwinStore((s) => s.debugShowInteractionRadius);
  const toggleDebugInteractionRadius = useTwinStore((s) => s.toggleDebugInteractionRadius);

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
      {/* Iter 35 PR 4 Phase Q2: waterStressOverride 제거 (store field 부재). */}
    </>
  );
}
