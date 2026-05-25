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
import type { GrowthEngine, PlantPhysiologyState, PlantState } from '@farmsim/tomato-engine';
import type { ShowcasePlantHandle } from '../../twin/ShowcasePlant';
import { SHOWCASE_SEED } from '../../twin/GreenhouseScene';

let engineRef: GrowthEngine | null = null;
let showcaseRef: ShowcasePlantHandle | null = null;
let skinMeshRef: ShowcasePlantHandle | null = null;
const listeners = new Set<() => void>();

export function setSinglePlantEngineRef(engine: GrowthEngine | null): void {
  engineRef = engine;
  listeners.forEach((l) => l());
}

export function setSinglePlantShowcaseRef(showcase: ShowcasePlantHandle | null): void {
  showcaseRef = showcase;
}

/** SSOT Phase 4 — SkinMeshPlant sibling. Same ShowcasePlantHandle shape. */
export function setSinglePlantSkinMeshRef(skin: ShowcasePlantHandle | null): void {
  skinMeshRef = skin;
}

/** Module-level access to the live GrowthEngine for non-React callers
 *  (e.g. SinglePlantOverlay's useEffect to advance the simulation). */
export function getSinglePlantEngine(): GrowthEngine | null {
  return engineRef;
}

export function getSinglePlantShowcase(): ShowcasePlantHandle | null {
  return showcaseRef;
}

export function getSinglePlantSkinMesh(): ShowcasePlantHandle | null {
  return skinMeshRef;
}

const PLANT_SEED = SHOWCASE_SEED;

/** Shallow-copy the live state so React sees a new reference each call.
 *  The engine mutates the same object in place; without a fresh wrapper
 *  useState's Object.is check would skip the re-render. */
function snapshot(): PlantPhysiologyState | null {
  if (!engineRef) return null;
  const ps = engineRef.getPhysiologyState(PLANT_SEED);
  if (!ps) return null;
  return { ...ps, trusses: ps.trusses.slice() };
}

/** Read the live plant physiology state — re-reads on every scrub
 *  AND when the engine reference becomes available (after
 *  SinglePlantScene's mount useEffect runs). */
export function useSinglePlantState(): PlantPhysiologyState | null {
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const [snap, setSnap] = useState<PlantPhysiologyState | null>(snapshot);

  // Re-pull whenever the user scrubs the timeline. We run via
  // requestAnimationFrame so SinglePlantScene's useEffect (which
  // advances the simulation) runs first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSnap(snapshot()));
    return () => cancelAnimationFrame(raf);
  }, [minute]);

  // Re-pull when the engineRef is set/cleared by SinglePlantScene.
  useEffect(() => {
    const cb = () => setSnap(snapshot());
    listeners.add(cb);
    cb();
    return () => { listeners.delete(cb); };
  }, []);

  return snap;
}

/** Live PlantState (sigmoid base + skeleton fields) from the showcase
 *  plant. Used by InspectorPanel to report skeleton counts (Plan 3a):
 *  side shoots, pruned buds, apex height. */
export function useSinglePlantSkeleton(): PlantState | null {
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const [snap, setSnap] = useState<PlantState | null>(
    () => showcaseRef?.currentState() ?? null,
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setSnap(showcaseRef?.currentState() ?? null);
    });
    return () => cancelAnimationFrame(raf);
  }, [minute]);

  useEffect(() => {
    const cb = () => setSnap(showcaseRef?.currentState() ?? null);
    listeners.add(cb);
    cb();
    return () => { listeners.delete(cb); };
  }, []);

  return snap;
}
