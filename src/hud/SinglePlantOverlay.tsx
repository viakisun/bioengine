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

import { useEffect } from 'react';
import { useTwinStore } from '../state/twinStore';
import { FloatingTopBar } from '../hud/single-plant/FloatingTopBar';
import { BottomPlaybackBar } from '../hud/single-plant/BottomPlaybackBar';
import { RightBottomToggles } from '../hud/single-plant/RightBottomToggles';
import { DrawerStack } from './DrawerStack';
import { C_FG } from '../hud/single-plant/styles';
import { SHOWCASE_SEED } from '../scene/SceneInfrastructure';
import { getSinglePlantEngine, getSinglePlantSkinMesh } from '../hud/single-plant/useSinglePlantState';

// Dev-only: expose store on window for headless capture inspection.
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as { __twinStore?: typeof useTwinStore }).__twinStore = useTwinStore;
}

export function SinglePlantOverlay() {
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const playing = useTwinStore((s) => s.singlePlantPlaying);
  const speed = useTwinStore((s) => s.singlePlantSpeed);
  const setMinute = useTwinStore((s) => s.setSinglePlantMinute);

  // Drive the live simulation as the user scrubs the timeline.
  // Iter 35 PR 2: SkinMesh가 유일 plant renderer — useImplicitMesh toggle 부재.
  useEffect(() => {
    const engine = getSinglePlantEngine();
    log.debug(`effect: minute=${minute} engine=${!!engine} skin=${!!getSinglePlantSkinMesh()}`);
    if (!engine) return;
    const physiology = engine.simulatePlantToMinute(SHOWCASE_SEED, minute);
    const day = Math.floor(minute / 1440);
    const skin = getSinglePlantSkinMesh();
    if (skin) skin.update(day, physiology);
  }, [minute]);

  // Playback loop — rAF, scales minute by speed × elapsed.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const advance = dt * speed;
      const cur = useTwinStore.getState().singlePlantMinute;
      const next = cur + advance;
      if (next >= 120 * 24 * 60) {
        useTwinStore.getState().setSinglePlantPlaying(false);
        setMinute(120 * 24 * 60 - 1);
        return;
      }
      setMinute(next);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, speed, setMinute]);

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
      <BottomPlaybackBar />
      <RightBottomToggles />
      <DrawerStack />
    </div>
  );
}
