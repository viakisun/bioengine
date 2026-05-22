import { create } from 'zustand';
import type { PresetView } from '../twin/CameraRig';
import { SCENARIO } from '../data/mockScenario';

export type CompareMode = 'off' | 'yesterday' | '7days';

export type ToneMappingMode = 'aces' | 'standard' | 'none';
export type LightingPresetName = 'default' | 'golden' | 'overcast' | 'noon-bright' | 'grow-light';

export interface LightingState {
  // Time
  manualHour: number;

  // Sun
  sunIntensity: number;
  sunColorHex: string;

  // Ambient
  hemiIntensity: number;
  hemiColorHex: string;
  hemiGroundColorHex: string;
  hdriIntensity: number;
  ambientGray: number;

  // Shadows
  shadowsEnabled: boolean;
  shadowDarkness: number;
  shadowBias: number;
  shadowNormalBias: number;

  // Tone mapping
  exposure: number;
  contrast: number;
  toneMapping: ToneMappingMode;

  // Post-FX
  bloomEnabled: boolean;
  bloomThreshold: number;
  bloomWeight: number;
  vignetteEnabled: boolean;
  vignetteWeight: number;
  sharpenEnabled: boolean;
  sharpenEdge: number;
  ssaoEnabled: boolean;
  ssaoStrength: number;
  ssaoRadius: number;
}

// Defaults mirror SceneSetup.ts hardcoded values so toggling between
// "default" preset and the boot state is a no-op.
export const LIGHTING_DEFAULTS: LightingState = {
  manualHour: 12,

  sunIntensity: 3.2,
  sunColorHex: '#fff6d8',

  hemiIntensity: 0.55,
  hemiColorHex: '#e8e4d8',
  hemiGroundColorHex: '#3a3530',
  hdriIntensity: 0.6,
  ambientGray: 0.22,

  shadowsEnabled: true,
  shadowDarkness: 0,
  shadowBias: 0.002,
  shadowNormalBias: 0.02,

  exposure: 1.0,
  contrast: 1.1,
  toneMapping: 'aces',

  bloomEnabled: true,
  bloomThreshold: 0.85,
  bloomWeight: 0.3,
  vignetteEnabled: true,
  vignetteWeight: 1.6,
  sharpenEnabled: true,
  sharpenEdge: 0.2,
  ssaoEnabled: true,
  ssaoStrength: 1.1,
  ssaoRadius: 0.6,
};

const LIGHTING_PRESETS: Record<LightingPresetName, Partial<LightingState>> = {
  default: LIGHTING_DEFAULTS,
  golden: {
    manualHour: 17,
    sunIntensity: 2.8,
    sunColorHex: '#ffb87a',
    hemiIntensity: 0.4,
    hemiColorHex: '#ffd9a8',
    hemiGroundColorHex: '#3a2a20',
    hdriIntensity: 0.55,
    exposure: 1.1,
    contrast: 1.15,
    bloomEnabled: true,
    bloomThreshold: 0.7,
    bloomWeight: 0.5,
    vignetteEnabled: true,
    vignetteWeight: 2.4,
  },
  overcast: {
    manualHour: 12,
    sunIntensity: 1.2,
    sunColorHex: '#dde6ee',
    hemiIntensity: 0.95,
    hemiColorHex: '#dde6ee',
    hemiGroundColorHex: '#3a3a3a',
    hdriIntensity: 0.85,
    exposure: 1.0,
    contrast: 0.95,
    bloomEnabled: false,
    vignetteEnabled: true,
    vignetteWeight: 0.8,
  },
  'noon-bright': {
    manualHour: 12,
    sunIntensity: 4.2,
    sunColorHex: '#fffbe8',
    hemiIntensity: 0.65,
    hemiColorHex: '#eee8d8',
    hemiGroundColorHex: '#3a3530',
    hdriIntensity: 0.7,
    exposure: 1.05,
    contrast: 1.15,
    bloomEnabled: true,
    bloomThreshold: 0.88,
    bloomWeight: 0.35,
  },
  'grow-light': {
    manualHour: 22,
    sunIntensity: 0.1,
    sunColorHex: '#1a2030',
    hemiIntensity: 1.4,
    hemiColorHex: '#ff64b4',
    hemiGroundColorHex: '#180920',
    hdriIntensity: 0.05,
    ambientGray: 0.05,
    exposure: 1.1,
    contrast: 1.3,
    bloomEnabled: true,
    bloomThreshold: 0.5,
    bloomWeight: 0.7,
    vignetteEnabled: true,
    vignetteWeight: 2.6,
  },
};

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

  // v3 UI — collapsible bottom console (timeline panel). Default
  // collapsed so the 3D scene fills the viewport; user clicks the
  // expand-btn at the top of the console to reveal full sparkline +
  // stage bands.
  consoleExpanded: boolean;
  toggleConsole: () => void;

  // Lighting — every value above the "current scene's" hardcoded default
  // is exposed for the 조명 sidebar tab. BabylonEngine.subscribe applies
  // changes immediately on each frame's render setup.
  lighting: LightingState;
  setLighting: (patch: Partial<LightingState>) => void;
  resetLighting: () => void;
  applyLightingPreset: (name: LightingPresetName) => void;

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

  consoleExpanded: false,
  toggleConsole: () => set((s) => ({ consoleExpanded: !s.consoleExpanded })),

  lighting: { ...LIGHTING_DEFAULTS },
  setLighting: (patch) => set((s) => ({ lighting: { ...s.lighting, ...patch } })),
  resetLighting: () => set({ lighting: { ...LIGHTING_DEFAULTS } }),
  applyLightingPreset: (name) =>
    set({ lighting: { ...LIGHTING_DEFAULTS, ...LIGHTING_PRESETS[name] } }),

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
