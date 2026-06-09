// D0.b (RFP §17) — usePlantPlayback hook.
//
// SinglePlantOverlay에 묻혀 있던 두 useEffect를 추출 — mode 무관 항상 동작.
//   1) minute 변화 감지 → engine.simulatePlantToMinute + skin.update (식물 시간 반영)
//   2) playing=true 시 rAF로 minute 자동 증가
//
// Iter 35 PR4 Phase P 노트: BabylonEngine은 skin.update를 호출하지 않음. 본 hook이 유일 path.
//
// App.tsx에서 한 번 호출 → Workbench/Foundry/Twin/legacy 어느 모드든 식물 시간 동기.

import { useEffect, useState } from 'react';
import { useTwinStore } from '../state/twinStore';
import { SHOWCASE_SEED } from '../scene/SceneInfrastructure';
import {
  getSinglePlantEngine,
  getAllSinglePlantSkinMeshes,
  subscribeSinglePlantRefs,
} from './single-plant/useSinglePlantState';
import { createLogger } from '../utils/logger';

const log = createLogger('overlay');

export function usePlantPlayback() {
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const playing = useTwinStore((s) => s.singlePlantPlaying);
  const speed = useTwinStore((s) => s.singlePlantSpeed);
  const setMinute = useTwinStore((s) => s.setSinglePlantMinute);
  const defoliationHeightCm = useTwinStore((s) => s.defoliationHeightCm);

  // Iter 35 PR4 Phase P 후속 fix: BabylonEngine async init이 React mount보다 늦으면
  //   getSinglePlantEngine() = null → 첫 useEffect 즉시 return → 영원히 update 안 됨.
  //   refsReady가 listener로 set되면 useEffect 재실행 → 첫 frame 확보.
  // ★ BUG FIX (2026-06-09): 이전엔 boolean refsReady였으나 _plant 수 변화 시_
  //   useEffect dependency 트리거 안 됨 → 신규 plant의 update 호출 안 됨 →
  //   mesh 영원히 안 만들어짐 (사용자 보고: "100/137 slider인데 시각 안 늘어남",
  //   probe: rootNodeCount=97 / stemMeshCount=31 영구 정지). plantCount(number)로
  //   변경해 _ref 추가 매번 effect 재실행_ → 모든 plants.update(day) 보장.
  const [plantCount, setPlantCount] = useState(
    () => getAllSinglePlantSkinMeshes().length,
  );
  useEffect(() => {
    return subscribeSinglePlantRefs(() => {
      setPlantCount(getAllSinglePlantSkinMeshes().length);
    });
  }, []);

  // Drive the live simulation as the user scrubs the timeline.
  // index 0 (showcase): physiology 적용. index 1+ (extras): physiology 없이.
  useEffect(() => {
    const engine = getSinglePlantEngine();
    const skins = getAllSinglePlantSkinMeshes();
    log.debug(
      `effect: minute=${minute} plantCount=${plantCount} defoliation=${defoliationHeightCm} engine=${!!engine} plants=${skins.length}`,
    );
    if (!engine) return;
    const day = Math.floor(minute / 1440);
    const physiology = engine.simulatePlantToMinute(SHOWCASE_SEED, minute);
    if (skins[0]) skins[0].update(day, physiology);
    for (let i = 1; i < skins.length; i++) {
      skins[i].update(day);
    }
  }, [minute, plantCount, defoliationHeightCm]);

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
}
