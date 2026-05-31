// Bridge between SinglePlantScene's running GrowthEngine and the React
// panels. The Babylon scene owns the GrowthEngine instance; the panels
// need the live PlantPhysiologyState every time the user scrubs the
// timeline.
//
// Iter 35 PR 2 Phase I: ShowcasePlant 완전 제거 — SkinMeshPlant이 유일 plant
//   renderer. showcasePlants[] / setSinglePlantShowcaseRef / getSinglePlantShowcase
//   API 모두 제거. 사용자가 import한 곳은 SkinMesh 경로로 갱신.

import { useEffect, useState } from 'react';
import { useTwinStore } from '../../store/twinStore';
import type { GrowthEngine, PlantPhysiologyState, PlantState } from '@farmsim/tomato-engine';
import type { SkinMeshPlantHandle } from '../../rendering/SkinMeshPlant';
import { SHOWCASE_SEED } from '../../rendering/SceneInfrastructure';

// Iter 35 Phase F — Multi-plant 확장 API (배열, length=1 currently).
//   Iter 36에서 slider/loop로 1~N 확장. default index=0.

let engineRef: GrowthEngine | null = null;
let skinMeshPlants: SkinMeshPlantHandle[] = [];
const listeners = new Set<() => void>();

export function setSinglePlantEngineRef(engine: GrowthEngine | null): void {
  engineRef = engine;
  listeners.forEach((l) => l());
}

/** SkinMeshPlant ref (Iter 35 PR 2: 유일 plant renderer).
 *  Iter 35: index 기반 (default 0). null 인자 (dispose) 시 해당 인덱스 비움. */
export function setSinglePlantSkinMeshRef(
  skin: SkinMeshPlantHandle | null,
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

export function getSinglePlantSkinMesh(index: number = 0): SkinMeshPlantHandle | null {
  return skinMeshPlants[index] ?? null;
}

/** Iter 35 PR 2: ShowcasePlant 제거 — SkinMesh가 plant. getSinglePlantPlant alias.
 *  기존 호출처 호환 위해 보존 (구 getSinglePlantShowcase 대체). */
export function getSinglePlantPlant(index: number = 0): SkinMeshPlantHandle | null {
  return skinMeshPlants[index] ?? null;
}

/** Iter 35 Phase F — 현재 등록된 plant 수. Iter 36 slider UI 용. */
export function getSinglePlantCount(): number {
  return skinMeshPlants.length;
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

/** Live PlantState (sigmoid base + skeleton fields) from the SkinMesh plant.
 *  Used by InspectorPanel to report skeleton counts (Plan 3a):
 *  side shoots, pruned buds, apex height. */
export function useSinglePlantSkeleton(): PlantState | null {
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const [snap, setSnap] = useState<PlantState | null>(
    () => (skinMeshPlants[0]?.currentState() ?? null),
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setSnap((skinMeshPlants[0]?.currentState() ?? null));
    });
    return () => cancelAnimationFrame(raf);
  }, [minute]);

  useEffect(() => {
    const cb = () => setSnap((skinMeshPlants[0]?.currentState() ?? null));
    listeners.add(cb);
    cb();
    return () => { listeners.delete(cb); };
  }, []);

  return snap;
}
