// Instrument Workstation — shared Babylon stats polling hooks.
//   usePerfStat — just FPS (1s tick, for header badge)
//   useStatsSnapshot — full snapshot (1s tick, for Stats HUD overlay)

import { useEffect, useState } from 'react';
import { getActivePlantManager } from '../../scene/PlantManager';
import { getSinglePlantSkinMesh } from '../single-plant/useSinglePlantState';

export interface StatsSnapshot {
  fps: number | null;
  heapUsedMB: number;
  heapLimitMB: number;
  heapTotalMB: number;
  meshCount: number;
  totalVertices: number;
  drawCalls: number;
  plantCount: number;
  plantMax: number;
}

export function snapshotStats(): StatsSnapshot {
  const perfMem = (performance as unknown as {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  const used = perfMem?.usedJSHeapSize ?? 0;
  const total = perfMem?.totalJSHeapSize ?? 0;
  const limit = perfMem?.jsHeapSizeLimit ?? 0;

  let meshCount = 0;
  let totalVertices = 0;
  let drawCalls = 0;
  let fps: number | null = null;
  try {
    const skin = getSinglePlantSkinMesh();
    const scene = skin?.root.getScene();
    if (scene) {
      meshCount = scene.meshes.length;
      totalVertices = scene.getTotalVertices?.() ?? 0;
      drawCalls = (scene as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? 0;
      const eng = scene.getEngine();
      const f = eng.getFps?.();
      if (typeof f === 'number' && Number.isFinite(f)) fps = Math.round(f);
    }
  } catch { /* */ }

  return {
    fps,
    heapUsedMB: used / 1024 / 1024,
    heapTotalMB: total / 1024 / 1024,
    heapLimitMB: limit / 1024 / 1024,
    meshCount,
    totalVertices,
    drawCalls,
    plantCount: getActivePlantManager()?.getCount() ?? 0,
    plantMax: getActivePlantManager()?.getGeomMax() ?? 0,
  };
}

/** FPS-only hook for header badge (1s poll, low cost). */
export function usePerfStat(): number | null {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      setFps(snapshotStats().fps);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return fps;
}

/** Full snapshot hook for Stats HUD. */
export function useStatsSnapshot(): StatsSnapshot {
  const [s, setS] = useState<StatsSnapshot>(() => snapshotStats());
  useEffect(() => {
    const id = setInterval(() => setS(snapshotStats()), 1000);
    return () => clearInterval(id);
  }, []);
  return s;
}
