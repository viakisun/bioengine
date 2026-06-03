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
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const playing = useTwinStore((s) => s.singlePlantPlaying);
  const speed = useTwinStore((s) => s.singlePlantSpeed);
  const setMinute = useTwinStore((s) => s.setSinglePlantMinute);
  const defoliationHeightCm = useTwinStore((s) => s.defoliationHeightCm);

  // Iter 35 PR 4 Phase P 후속 fix: BabylonEngine async init이 React mount보다 늦으면
  //   getSinglePlantEngine() = null → 첫 useEffect 즉시 return → 영원히 update 안 됨.
  //   refsReady가 listener로 set되면 useEffect 재실행 → 첫 frame 확보.
  const [refsReady, setRefsReady] = useState(
    () => !!getSinglePlantEngine() && !!getSinglePlantSkinMesh(),
  );
  useEffect(() => {
    return subscribeSinglePlantRefs(() => {
      setRefsReady(!!getSinglePlantEngine() && !!getSinglePlantSkinMesh());
    });
  }, []);

  // Drive the live simulation as the user scrubs the timeline.
  // Iter 35 PR 2: SkinMesh가 유일 plant renderer — useImplicitMesh toggle 부재.
  // ★ S126 — multi-plant 지원: 모든 plant에 대해 update(day) 호출.
  //   index 0 (showcase): physiology 적용 (truss/fruit overlay).
  //   index 1+ (extras): physiology 없이 update — computeState만으로 build.
  useEffect(() => {
    const engine = getSinglePlantEngine();
    const skins = getAllSinglePlantSkinMeshes();
    log.debug(`effect: minute=${minute} refsReady=${refsReady} defoliation=${defoliationHeightCm} engine=${!!engine} plants=${skins.length}`);
    if (!engine) return;
    const day = Math.floor(minute / 1440);
    // Showcase (index 0): full physiology.
    const physiology = engine.simulatePlantToMinute(SHOWCASE_SEED, minute);
    if (skins[0]) skins[0].update(day, physiology);
    // Extras (index 1+): update without physiology (computeState only).
    for (let i = 1; i < skins.length; i++) {
      skins[i].update(day);
    }
  }, [minute, refsReady, defoliationHeightCm]);

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
      <DefoliationSlider />
      <BottomPlaybackBar />
      <RightBottomToggles />
      <DrawerStack />
    </div>
  );
}
