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
import type { ShowcasePlantHandle } from '../../rendering/ShowcasePlant';
import { SHOWCASE_SEED } from '../../rendering/SceneInfrastructure';

// Iter 35 Phase F — Multi-plant 확장 API (배열).
//   현재 length=1 (single-plant baseline). Iter 36에서 slider/loop로 1~N 확장.
//   default index=0 → 기존 호출처 변경 없음.

let engineRef: GrowthEngine | null = null;
let showcasePlants: ShowcasePlantHandle[] = [];
let skinMeshPlants: ShowcasePlantHandle[] = [];
const listeners = new Set<() => void>();

export function setSinglePlantEngineRef(engine: GrowthEngine | null): void {
  engineRef = engine;
  listeners.forEach((l) => l());
}

/** Iter 35: index 기반 set. null 인자 (dispose) 시 해당 인덱스 비움.
 *  default index=0 (single-plant). */
export function setSinglePlantShowcaseRef(
  showcase: ShowcasePlantHandle | null,
  index: number = 0,
): void {
  if (showcase === null) {
    if (index === 0 && showcasePlants.length <= 1) {
      showcasePlants = [];
    } else {
      showcasePlants.splice(index, 1);
    }
  } else {
    showcasePlants[index] = showcase;
  }
}

/** SSOT Phase 4 — SkinMeshPlant sibling. Same ShowcasePlantHandle shape.
 *  Iter 35: index 기반 (default 0). */
export function setSinglePlantSkinMeshRef(
  skin: ShowcasePlantHandle | null,
  index: number = 0,
): void {
  if (skin === null) {
    if (index === 0 && skinMeshPlants.length <= 1) {
      skinMeshPlants = [];
    } else {
      skinMeshPlants.splice(index, 1);
    }
  } else {
    skinMeshPlants[index] = skin;
  }
}

/** Module-level access to the live GrowthEngine for non-React callers
 *  (e.g. SinglePlantOverlay's useEffect to advance the simulation). */
export function getSinglePlantEngine(): GrowthEngine | null {
  return engineRef;
}

/** Iter 35: default index=0. Iter 36에서 caller가 명시적 index 전달. */
export function getSinglePlantShowcase(index: number = 0): ShowcasePlantHandle | null {
  return showcasePlants[index] ?? null;
}

export function getSinglePlantSkinMesh(index: number = 0): ShowcasePlantHandle | null {
  return skinMeshPlants[index] ?? null;
}

/** Iter 35 Phase F — 현재 등록된 plant 수. Iter 36 slider UI 용. */
export function getSinglePlantCount(): number {
  return showcasePlants.length;
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
    () => (showcasePlants[0]?.currentState() ?? null),
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setSnap((showcasePlants[0]?.currentState() ?? null));
    });
    return () => cancelAnimationFrame(raf);
  }, [minute]);

  useEffect(() => {
    const cb = () => setSnap((showcasePlants[0]?.currentState() ?? null));
    listeners.add(cb);
    cb();
    return () => { listeners.delete(cb); };
  }, []);

  return snap;
}
