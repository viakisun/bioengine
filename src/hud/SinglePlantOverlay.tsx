import { createLogger } from '../utils/logger';
const log = createLogger('overlay');
// SinglePlantOverlay — HUD-first analysis UI for the single-plant mode.
//
// Iter 35 PR 2 (Phase J + K): minimal HUD — Skeleton/Settings pills + 2 drawers.
//
// Layout (no grid — every child is absolutely positioned):
//   - FloatingTopBar       top center  (Day/phase — filter pills archived in K)
//   - BottomPlaybackBar    bottom      (slider + speeds + StatusBar fusion)
//   - RightBottomToggles   bottom right (Skeleton + Settings pills only)
//   - DrawerStack          right edge  (Lighting + Skeleton drawers)
//
// Archived in PR 2:
//   - PARGauge / SelectedObjectLabel (Phase K)
//   - MetricsTray + TimelineChart + InspectorPanel (Phase J)

import { useEffect, useState } from 'react';
import { useTwinStore } from '../state/twinStore';
import { FloatingTopBar } from '../hud/single-plant/FloatingTopBar';
import { BottomPlaybackBar } from '../hud/single-plant/BottomPlaybackBar';
import { RightBottomToggles } from '../hud/single-plant/RightBottomToggles';
import { DefoliationSlider } from '../hud/single-plant/DefoliationSlider';
import { DrawerStack } from './DrawerStack';
import { C_FG } from '../hud/single-plant/styles';
import { SHOWCASE_SEED } from '../scene/SceneInfrastructure';
import {
  getSinglePlantEngine,
  getSinglePlantSkinMesh,
  getAllSinglePlantSkinMeshes,
  subscribeSinglePlantRefs,
} from '../hud/single-plant/useSinglePlantState';

// Dev-only: expose store on window for headless capture inspection.
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as { __twinStore?: typeof useTwinStore }).__twinStore = useTwinStore;
}

export function SinglePlantOverlay() {
  // D0.b (RFP §17): useEffect 두 개 (minute→update + playback rAF)는 App.tsx의
  //   usePlantPlayback hook으로 추출 — mode 무관 항상 동작.
  //   본 컴포넌트는 legacy single-plant/greenhouse 모드의 HUD UI만 담당.

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        pointerEvents: 'none',
        color: C_FG,
      }}
    >
      <FloatingTopBar />
      <DefoliationSlider />
      <BottomPlaybackBar />
      <RightBottomToggles />
      <DrawerStack />
    </div>
  );
}
