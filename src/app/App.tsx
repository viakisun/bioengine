// App — top-level routing.
//
// ★ S136 (Iter 41) — Mode 시스템 도입.
//   App entry → ModeSelector (사용자가 mode + quality 선택)
//             → 진입 → SceneInfrastructure build + Babylon scene 마운트
//   현재는 single-plant + greenhouse 두 모드. 향후 registry에 추가하면 자동 확장.
//
//   URL `?mode=single-plant` 또는 `?mode=greenhouse` 시 selector 우회.
//   기존 Iter 35 single-plant-only flow는 _?mode=single-plant_와 동등.

import { lazy, Suspense, useState } from 'react';
import { usePlantPlayback } from '../hud/usePlantPlayback';
import '../styles/phytosim.css';
// ★ S140-B — SinglePlantApp + SinglePlantOverlay lazy-loaded.
//   EntryScreen / LoadingScreen 만 initial bundle에 포함 → 진입 후 chunk download.
//   main bundle 2.8MB → entry chunk 작게, mode chunk separate.
const SinglePlantApp = lazy(() =>
  import('./SinglePlantApp').then((m) => ({ default: m.SinglePlantApp })),
);
const SinglePlantOverlay = lazy(() =>
  import('../hud/SinglePlantOverlay').then((m) => ({ default: m.SinglePlantOverlay })),
);
// S1.g·S3·S5·S6 (RFP §15) — 모드별 overlay lazy load.
const Workbench = lazy(() =>
  import('../modes/workbench/Workbench').then((m) => ({ default: m.Workbench })),
);
const Foundry = lazy(() =>
  import('../modes/foundry/Foundry').then((m) => ({ default: m.Foundry })),
);
const Twin = lazy(() =>
  import('../modes/twin/Twin').then((m) => ({ default: m.Twin })),
);
import { LoadingScreen } from '../hud/LoadingScreen';
import { PerfHUD } from '../hud/PerfHUD';
import { NotificationCenter } from '../hud/NotificationCenter';
import { ErrorModal } from '../hud/ErrorModal';
import { ErrorBoundary } from '../hud/ErrorBoundary';
import { LeafOutlineDebugPanel } from '../dev/LeafOutlineDebugPanel';
import { EntryScreen } from '../modes/EntryScreen';
import type { ModeKey, ModeQualityConfig, QualityLevel } from '../modes/types';
import { resolveDefaultMode, MODES } from '../modes/registry';
import { setActiveMode } from '../modes/activeMode';

const outlineDebug = typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('outlineDebug') === '1';

/** URL ?mode=X 가 있으면 selector 건너뛰고 바로 진입 (Iter 35 호환).
 *  S1.b (RFP §15) — workbench·foundry·twin 신규 모드 추가. mvp에서는 모두 single-plant scene으로 dispatch. */
function shouldSkipSelector(): boolean {
  if (typeof location === 'undefined') return false;
  const param = new URLSearchParams(location.search).get('mode');
  return (
    param === 'single-plant' ||
    param === 'greenhouse' ||
    param === 'workbench' ||
    param === 'foundry' ||
    param === 'twin'
  );
}

/** ★ S138 — URL `?quality=low|medium|high` override (skip 경로용 debug/probe). */
function resolveUrlQuality(): QualityLevel | null {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search).get('quality');
  return q === 'low' || q === 'medium' || q === 'high' ? q : null;
}

export function App() {
  // D0.b (RFP §17) — mode 무관 항상 식물 시간 hook.
  //   SinglePlantOverlay에 있던 useEffect 두 개를 추출. Workbench/Foundry/Twin에서도 식물 변화.
  usePlantPlayback();

  const skip = shouldSkipSelector();
  const [activeModeState, setActiveModeState] = useState<{ mode: ModeKey; quality: ModeQualityConfig } | null>(
    () => {
      if (!skip) return null;
      const mode = resolveDefaultMode();
      const urlQuality = resolveUrlQuality();
      const quality: ModeQualityConfig = urlQuality
        ? { ...MODES[mode].defaultQuality, level: urlQuality }
        : MODES[mode].defaultQuality;
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
  // S1.g·S5·S6 (RFP §15) — 모드별 overlay 분기:
  //   workbench → Workbench (Picker + Composer + Calibration + CameraDock)
  //   foundry   → Foundry (Matrix Setup + progress mock)
  //   twin      → Twin (Zone heatmap + WireStatus + KPI)
  //   single-plant·greenhouse (legacy) → SinglePlantOverlay
  const mode = activeModeState.mode;
  const isFullOverlay = mode === 'workbench' || mode === 'foundry' || mode === 'twin';

  return (
    <ErrorBoundary>
      <LoadingScreen />
      <NotificationCenter />
      <ErrorModal />

      {/* ★ S140-B — Suspense fallback은 null (LoadingScreen이 이미 풀스크린).
         lazy chunk download 중에도 LoadingScreen이 위에 깔려 있어 사용자 인지 없음. */}
      <Suspense fallback={null}>
        <SinglePlantApp />
        {!isFullOverlay && <SinglePlantOverlay />}
        {mode === 'workbench' && <Workbench />}
        {/* S8.a (RFP §16.7) — onCancel 전달로 "← 뒤로" 가시 + Splash 복귀. */}
        {mode === 'foundry' && <Foundry onCancel={() => setActiveModeState(null)} />}
        {mode === 'twin' && <Twin onCancel={() => setActiveModeState(null)} />}
      </Suspense>
      <PerfHUD />

      {outlineDebug && <LeafOutlineDebugPanel />}
    </ErrorBoundary>
  );
}
