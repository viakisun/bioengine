import { create } from 'zustand';
import type { PresetView } from '../twin/CameraRig';
import { SCENARIO } from '../data/mockScenario';

export type CompareMode = 'off' | 'yesterday' | '7days';

export interface InteractionPoint {
  position: [number, number, number];
  radius: number;
  strength: number;
  age: number;       // seconds since spawn; expires when age > lifetime
  lifetime: number;  // seconds
}

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

  // Wind — values pushed into leaf shader uniforms each frame (WebGL2)
  // or into a CPU sine fallback on root TransformNodes (WebGPU).
  windStrength: number;     // 0–1
  flutterStrength: number;  // 0–1
  windDirection: [number, number, number]; // unit-ish vector
  setWindStrength: (v: number) => void;
  setFlutterStrength: (v: number) => void;
  setWindDirection: (dir: [number, number, number]) => void;

  // Interaction — robot/operator points that push nearby leaves.
  // Lives in store so multiple producers (robot + future workers) can
  // contribute; BabylonEngine drains them into uniform arrays per frame.
  interactions: InteractionPoint[];
  addInteraction: (p: Omit<InteractionPoint, 'age'>) => void;
  tickInteractions: (dtSec: number) => void;

  // Operator-visible water-stress override (0 = follow scenario).
  // Plants pick this up to add extra droopExtra in showcase/supporting.
  waterStressOverride: number;
  setWaterStressOverride: (v: number) => void;

  // Dev/debug toggles (only mounted in dev panel)
  debugShowWindWeight: boolean;
  debugShowLodColors: boolean;
  debugShowInteractionRadius: boolean;
  toggleDebugWindWeight: () => void;
  toggleDebugLodColors: () => void;
  toggleDebugInteractionRadius: () => void;

  // Robot position + task — published by BabylonEngine each frame so
  // React components (TopBar pill, PatrolMap live dot) can subscribe
  // without a getElementById polling hack.
  robotX: number;
  robotZ: number;
  robotTask: 'idle' | 'patrolling' | 'capturing' | 'returning';
  publishRobotState: (x: number, z: number, task: 'idle' | 'patrolling' | 'capturing' | 'returning') => void;

  // Live fps + backend label — also published by BabylonEngine; the
  // DOM hud-* spans stay around for legacy verify scripts but the
  // pill reads from the store now.
  fps: number;
  backend: 'webgpu' | 'webgl2' | null;
  publishFps: (fps: number) => void;
  publishBackend: (b: 'webgpu' | 'webgl2') => void;

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

  windStrength: 0.5,
  flutterStrength: 0.6,
  windDirection: [1, 0, 0.3],
  setWindStrength: (v) => set({ windStrength: Math.max(0, Math.min(1, v)) }),
  setFlutterStrength: (v) => set({ flutterStrength: Math.max(0, Math.min(1, v)) }),
  setWindDirection: (dir) => set({ windDirection: dir }),

  interactions: [],
  addInteraction: (p) =>
    set((s) => ({
      interactions: [
        ...s.interactions.filter((q) => q.age < q.lifetime).slice(-15),
        { ...p, age: 0 },
      ],
    })),
  tickInteractions: (dtSec) =>
    set((s) => {
      const next: InteractionPoint[] = [];
      for (const p of s.interactions) {
        const age = p.age + dtSec;
        if (age < p.lifetime) next.push({ ...p, age });
      }
      return { interactions: next };
    }),

  waterStressOverride: 0,
  setWaterStressOverride: (v) =>
    set({ waterStressOverride: Math.max(0, Math.min(1, v)) }),

  debugShowWindWeight: false,
  debugShowLodColors: false,
  debugShowInteractionRadius: false,
  toggleDebugWindWeight: () =>
    set((s) => ({ debugShowWindWeight: !s.debugShowWindWeight })),
  toggleDebugLodColors: () =>
    set((s) => ({ debugShowLodColors: !s.debugShowLodColors })),
  toggleDebugInteractionRadius: () =>
    set((s) => ({ debugShowInteractionRadius: !s.debugShowInteractionRadius })),

  robotX: 0,
  robotZ: 0,
  robotTask: 'idle',
  publishRobotState: (x, z, task) => set({ robotX: x, robotZ: z, robotTask: task }),

  fps: 0,
  backend: null,
  publishFps: (fps) => set({ fps }),
  publishBackend: (backend) => set({ backend }),

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
