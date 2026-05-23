// Bridge between SinglePlantScene's running GrowthEngine and the React
// panels. The Babylon scene owns the GrowthEngine instance; the panels
// need the live PlantPhysiologyState every time the user scrubs the
// timeline.
//
// We use a tiny module-level handle: SinglePlantScene registers its
// GrowthEngine via setSinglePlantEngineRef on mount, and panels read
// via the hook (which subscribes to store.singlePlantMinute so it
// re-renders on every scrub).

import { useEffect, useState } from 'react';
import { useTwinStore } from '../../store/twinStore';
import type { GrowthEngine, PlantPhysiologyState } from '@farmsim/tomato-engine';

let engineRef: GrowthEngine | null = null;
const listeners = new Set<() => void>();

export function setSinglePlantEngineRef(engine: GrowthEngine | null): void {
  engineRef = engine;
  listeners.forEach((l) => l());
}

const PLANT_SEED = 1001;

/** Read the live plant physiology state — re-reads on every scrub
 *  AND when the engine reference becomes available (after
 *  SinglePlantScene's mount useEffect runs). */
export function useSinglePlantState(): PlantPhysiologyState | null {
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const [snapshot, setSnapshot] = useState<PlantPhysiologyState | null>(
    () => engineRef?.getPhysiologyState(PLANT_SEED) ?? null,
  );

  // Re-pull whenever the user scrubs the timeline.
  useEffect(() => {
    setSnapshot(engineRef?.getPhysiologyState(PLANT_SEED) ?? null);
  }, [minute]);

  // Re-pull when the engineRef is set/cleared by SinglePlantScene.
  useEffect(() => {
    const cb = () => setSnapshot(engineRef?.getPhysiologyState(PLANT_SEED) ?? null);
    listeners.add(cb);
    // Initial pull in case engineRef arrived before this effect mounted.
    cb();
    return () => { listeners.delete(cb); };
  }, []);

  return snapshot;
}
