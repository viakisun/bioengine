import { createLogger } from '../utils/logger';
const log = createLogger('overlay');
// SinglePlantOverlay — HUD-first analysis UI for the single-plant mode.
//
// Mounts on top of GreenhouseLayout. The container is pointer-events:
// none so the canvas underneath receives camera-control clicks; each
// floating HUD child sets pointer-events: auto in its own root.
//
// Layout (no grid — every child is absolutely positioned):
//   - FloatingTopBar       top center  (Day/phase + filter pills + back nav)
//   - PARGauge             top right   (existing gauge, unchanged)
//   - SelectedObjectLabel  under top bar right
//   - MetricsTray          bottom mid  (collapsible TimelineChart)
//   - BottomPlaybackBar    bottom      (slider + speeds + StatusBar fusion)
//   - RightBottomToggles   bottom right (Layer / Skeleton / Heatmap / Camera / Settings)
//   - DrawerStack          right edge  (Lighting / Inspector / Skeleton)

import { useEffect } from 'react';
import { useTwinStore } from '../store/twinStore';
import { PARGauge } from '../ui/single-plant/PARGauge';
import { FloatingTopBar } from '../ui/single-plant/FloatingTopBar';
import { BottomPlaybackBar } from '../ui/single-plant/BottomPlaybackBar';
import { RightBottomToggles } from '../ui/single-plant/RightBottomToggles';
// Iter 35 PR 2 Phase J: MetricsTray archived.
import { SelectedObjectLabel } from '../ui/single-plant/SelectedObjectLabel';
import { DrawerStack } from './DrawerStack';
import { C_FG } from '../ui/single-plant/styles';
import { SHOWCASE_SEED } from '../rendering/SceneInfrastructure';
import { getSinglePlantEngine, getSinglePlantSkinMesh } from '../ui/single-plant/useSinglePlantState';

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
      <SelectedObjectLabel />
      <PARGauge />
      {/* Iter 35 PR 2 Phase J: MetricsTray archived. */}
      <BottomPlaybackBar />
      <RightBottomToggles />
      <DrawerStack />
    </div>
  );
}
