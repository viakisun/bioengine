// App — top-level routing.
//
// ★ S136 (Iter 41) — Mode 시스템 도입.
//   App entry → ModeSelector (사용자가 mode + quality 선택)
//             → 진입 → SceneInfrastructure build + Babylon scene 마운트
//   현재는 single-plant + greenhouse 두 모드. 향후 registry에 추가하면 자동 확장.
//
//   URL `?mode=single-plant` 또는 `?mode=greenhouse` 시 selector 우회.
//   기존 Iter 35 single-plant-only flow는 _?mode=single-plant_와 동등.

import { useState } from 'react';
import { SinglePlantApp } from './SinglePlantApp';
import { SinglePlantOverlay } from '../hud/SinglePlantOverlay';
import { LoadingScreen } from '../hud/LoadingScreen';
import { NotificationCenter } from '../hud/NotificationCenter';
import { ErrorModal } from '../hud/ErrorModal';
import { ErrorBoundary } from '../hud/ErrorBoundary';
import { LeafOutlineDebugPanel } from '../dev/LeafOutlineDebugPanel';
import { EntryScreen } from '../modes/EntryScreen';
import type { ModeKey, ModeQualityConfig } from '../modes/types';
import { resolveDefaultMode, MODES } from '../modes/registry';
import { setActiveMode } from '../modes/activeMode';

const outlineDebug = typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('outlineDebug') === '1';

/** URL ?mode=X 가 있으면 selector 건너뛰고 바로 진입 (Iter 35 호환). */
function shouldSkipSelector(): boolean {
  if (typeof location === 'undefined') return false;
  const param = new URLSearchParams(location.search).get('mode');
  return param === 'single-plant' || param === 'greenhouse';
}

export function App() {
  const skip = shouldSkipSelector();
  const [activeModeState, setActiveModeState] = useState<{ mode: ModeKey; quality: ModeQualityConfig } | null>(
    () => {
      if (!skip) return null;
      const mode = resolveDefaultMode();
      const quality = MODES[mode].defaultQuality;
      setActiveMode(mode, quality);  // ★ S136-B — module-level holder도 즉시 set
      return { mode, quality };
    },
  );

  if (activeModeState === null) {
    return (
      <ErrorBoundary>
        <EntryScreen
          onEnter={(mode, quality) => {
            setActiveMode(mode, quality);  // ★ S136-B — SceneInfrastructure가 읽도록
            setActiveModeState({ mode, quality });
          }}
        />
      </ErrorBoundary>
    );
  }

  // Mode 진입 — 기존 SinglePlantApp + SkinMesh 인프라 그대로 사용.
  // ★ S138 후속에서 activeMode.quality 를 SceneInfrastructure에 전달 예정.
  return (
    <ErrorBoundary>
      <LoadingScreen />
      <NotificationCenter />
      <ErrorModal />

      <SinglePlantApp />
      <SinglePlantOverlay />

      {outlineDebug && <LeafOutlineDebugPanel />}
    </ErrorBoundary>
  );
}
