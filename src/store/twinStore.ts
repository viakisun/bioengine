import { create } from 'zustand';
import type { PresetView } from '../twin/CameraRig';
import { SCENARIO } from '../data/mockScenario';

export type CompareMode = 'off' | 'yesterday' | '7days';

interface TwinState {
  currentDay: number;
  playing: boolean;
  playSpeed: number;

  selectedZoneId: number | null;
  selectedPlantId: number | null;
  hoveredZoneId: number | null;

  analysisMode: boolean;
  compareMode: CompareMode;
  heatmapVisible: boolean;
  pathTrailVisible: boolean;
  fovVisible: boolean;

  cameraPreset: PresetView;

  setDay: (day: number) => void;
  togglePlay: () => void;
  setPlaySpeed: (speed: number) => void;

  selectZone: (zoneId: number | null) => void;
  selectPlant: (plantId: number | null) => void;
  hoverZone: (zoneId: number | null) => void;

  toggleAnalysisMode: () => void;
  setCompareMode: (mode: CompareMode) => void;
  toggleHeatmap: () => void;
  togglePathTrail: () => void;
  toggleFov: () => void;

  setCameraPreset: (preset: PresetView) => void;
}

export const useTwinStore = create<TwinState>((set) => ({
  currentDay: 75,
  playing: false,
  playSpeed: 1,

  selectedZoneId: null,
  selectedPlantId: null,
  hoveredZoneId: null,

  analysisMode: false,
  compareMode: 'off',
  heatmapVisible: true,
  pathTrailVisible: true,
  fovVisible: true,

  cameraPreset: 'overview',

  setDay: (day) =>
    set({
      currentDay: Math.max(0, Math.min(SCENARIO.durationDays, day)),
    }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPlaySpeed: (speed) => set({ playSpeed: speed }),

  selectZone: (zoneId) => set({ selectedZoneId: zoneId }),
  selectPlant: (plantId) => set({ selectedPlantId: plantId }),
  hoverZone: (zoneId) => set({ hoveredZoneId: zoneId }),

  toggleAnalysisMode: () => set((s) => ({ analysisMode: !s.analysisMode })),
  setCompareMode: (mode) => set({ compareMode: mode }),
  toggleHeatmap: () => set((s) => ({ heatmapVisible: !s.heatmapVisible })),
  togglePathTrail: () => set((s) => ({ pathTrailVisible: !s.pathTrailVisible })),
  toggleFov: () => set((s) => ({ fovVisible: !s.fovVisible })),

  setCameraPreset: (preset) => set({ cameraPreset: preset }),
}));
