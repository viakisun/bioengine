import { create } from 'zustand';
import type { PresetView } from '../twin/CameraRig';
import { SCENARIO } from '../data/mockScenario';
import { QUALITY_PRESETS, RENDER_FX_DEFAULTS } from '../twin/RenderQuality';

export type CompareMode = 'off' | 'yesterday' | '7days';

/** Top-level app mode — drives which scene/layout is mounted.
 *  Iter 35: single-plant only (lobby/greenhouse/robot/sandbox archived). */
export type AppMode = 'single-plant';

/** Output variables the Single-Plant TimelineChart can plot. */
export type SinglePlantChartVar =
  | 'TT' | 'LAI' | 'W' | 'W_f' | 'W_m' | 'HI' | 'N' | 'heightCm'
  | 'PAR_now' | 'T_now';

export const SINGLE_PLANT_CHART_VARS: { id: SinglePlantChartVar; label: string; unit: string }[] = [
  { id: 'TT', label: 'Thermal time', unit: '°C·d' },
  { id: 'LAI', label: 'Leaf area index', unit: 'm²/m²' },
  { id: 'W', label: 'Plant DM', unit: 'g DM' },
  { id: 'W_f', label: 'Fruit DM', unit: 'g DM' },
  { id: 'W_m', label: 'Mature fruit DM', unit: 'g DM' },
  { id: 'HI', label: 'Harvest index', unit: '–' },
  { id: 'N', label: 'Node count', unit: 'nodes' },
  { id: 'heightCm', label: 'Height', unit: 'cm' },
  { id: 'PAR_now', label: 'PAR (instant.)', unit: 'μmol/m²/s' },
  { id: 'T_now', label: 'Air temp (instant.)', unit: '°C' },
];

// Iter 35: AppMode 단일 — URL hash와 무관하게 항상 'single-plant'.
//   #lobby / #greenhouse 등 legacy hash가 와도 single-plant fallback.
function readModeFromHash(): AppMode {
  return 'single-plant';
}

export type ToneMappingMode = 'aces' | 'standard' | 'none';
export type LightingPresetName = 'default' | 'golden' | 'overcast' | 'noon-bright' | 'grow-light';

/**
 * Render-quality level (1..10). Drives the entire post-FX stack, shadow
 * resolution, MSAA samples, hardware scale, plant density. Default = 10
 * (Showpiece) — see plan a-drifting-wigderson.md.
 */
export type ShadowFilterKind =
  | 'none' | 'hard' | 'pcf-lo' | 'pcf-med' | 'pcf-hi' | 'pcss' | 'pcss-contact';

export interface RenderFXState {
  shadowResolution: number;     // 0 = OFF, else 512/1024/2048/4096/8192
  shadowFilter: ShadowFilterKind;
  msaaSamples: number;          // 1/2/4/8
  hardwareScale: number;        // 0.5..1.5 (display×; engine inverts internally)

  // Advanced post-FX (instantiated when true)
  taaEnabled: boolean;
  ssrEnabled: boolean;
  dofEnabled: boolean;
  godRaysEnabled: boolean;
  motionBlurEnabled: boolean;
  colorLutEnabled: boolean;
  chromaticAberrationEnabled: boolean;
  grainEnabled: boolean;
  glowLayerEnabled: boolean;
  lensFlareEnabled: boolean;

  // SSAO sample density (8/16/24/32)
  ssaoSamples: number;

  // Leaf subsurface translucency strength (0..1)
  leafSSSIntensity: number;

  // Number of beds to populate with tomato plants (1/2/3/4/6/8/13)
  activeBedCount: number;
}

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

// ──────────────────────────────────────────────────────────────────
// Skeleton overlay 설정 (Plan 3a Phase ζ)
// ──────────────────────────────────────────────────────────────────

export type DrawerKind = 'lighting' | 'inspector' | 'skeleton';

export interface SkeletonConfig {
  // 두께 (월드 단위, m). 0.001 m = 1mm.
  axisMainWidth: number;
  axisOrder1Width: number;
  axisOrder2Width: number;
  petioleWidth: number;
  rachisWidth: number;
  pedicelWidth: number;
  calyxWidth: number;

  // 색상 (hex)
  axisMainColor: string;
  axisOrder1Color: string;
  axisOrder2Color: string;
  petioleColor: string;
  rachisColor: string;
  pedicelColor: string;
  calyxColor: string;

  // 곡선 sampling
  subdivisionsPerInternode: number;

  // 표시 토글
  showPetiole: boolean;
  showTruss: boolean;
  showCalyx: boolean;
  showFruitDots: boolean;
  showDormantBuds: boolean;
  showPrunedBuds: boolean;

  // Node 마커 크기 (m)
  nodeMarkerSize: number;
  apexMarkerSize: number;
  fruitMarkerScale: number;
}

export const SKELETON_DEFAULTS: SkeletonConfig = {
  axisMainWidth: 0.006,
  axisOrder1Width: 0.004,
  axisOrder2Width: 0.003,
  petioleWidth: 0.003,
  // Truss anatomy thicknesses scaled so rachis ≈ 25% of main stem
  // (real tomato peduncle ~3-5mm vs main stem ~20mm). Previously rachis
  // read at 75% of main stem and skeleton viewers mistook trusses for
  // side branches.
  rachisWidth: 0.0018,
  pedicelWidth: 0.0012,
  calyxWidth: 0.0010,

  axisMainColor: '#e90b2c',
  axisOrder1Color: '#ff7a1a',
  axisOrder2Color: '#ffcc00',
  petioleColor: '#ff20a0',
  rachisColor: '#ff0080',
  pedicelColor: '#e8408a',
  calyxColor: '#3fff5a',

  subdivisionsPerInternode: 5,

  showPetiole: true,
  showTruss: true,
  showCalyx: true,
  showFruitDots: true,
  showDormantBuds: true,
  showPrunedBuds: true,

  nodeMarkerSize: 0.011,
  apexMarkerSize: 0.014,
  fruitMarkerScale: 1.0,
};

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

// -----------------------------------------------------------------------
// Boot progress + alerts + live log + env (plan a-drifting-wigderson.md)
// -----------------------------------------------------------------------

export type BootStage =
  | 'init'          // 처음 진입 (마운트 직후)
  | 'engine'        // WebGPU/WebGL2 엔진 생성
  | 'setup'         // SceneSetup — IBL, SSAO, 환경 텍스처
  | 'greenhouse'    // 베드 + 인프라 메쉬
  | 'plants'        // 식물 등록 + 메쉬 빌드 (가장 오래 걸림)
  | 'quality'       // ShadowGen 8192 + 포스트프로세싱
  | 'shaders'       // 첫 프레임 셰이더 컴파일
  | 'ready';        // 첫 프레임 렌더 완료

export const BOOT_STAGES: BootStage[] = [
  'init', 'engine', 'setup', 'greenhouse', 'plants', 'quality', 'shaders', 'ready',
];

export interface StageInfo {
  startedAt: number | null;   // performance.now(), null = 아직 진입 안 함
  completedAt: number | null; // null = 진행중/대기중, number = 완료
  detail: string;             // "230/720 메쉬 생성중"
  progress: number;           // 0..1
  subCounters?: Array<{ label: string; value: number | string }>;
}

export type LiveLogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LiveLogEntry {
  id: number;        // 단조 증가 카운터 (React key + 중복 방지)
  ts: number;        // performance.now()
  level: LiveLogLevel;
  stage: BootStage;
  message: string;
}

export type NotificationLevel = 'info' | 'warn' | 'error';

export interface Notification {
  id: string;
  level: NotificationLevel;
  title: string;
  body?: string;
  stack?: string;       // error 만
  createdAt: number;    // Date.now()
  dismissed: boolean;
}

export interface EnvInfo {
  backend: 'webgpu' | 'webgl2' | 'unknown';
  gpuDevice: string;
  viewport: { w: number; h: number };
  dpr: number;
  counters: {
    meshes: number;
    triangles: number;
    textures: number;
    materials: number;
    memoryMB: number | null;
  };
}

export interface BootSnapshot {
  currentStage: BootStage;
  startedAt: number;
  stages: Record<BootStage, StageInfo>;
  /** 시간순 라이브 로그 — 100줄 max, 오래된 것부터 잘림. */
  liveLog: LiveLogEntry[];
  env: EnvInfo;
  /** 'shaders' 단계용 ETA 추정 (이전 stage 들 평균에서) — null = 미측정. */
  etaSecondsMin: number | null;
  etaSecondsMax: number | null;
  /** 한 번이라도 'ready' 도달했는지. 첫 부팅 완료 후 영구 true.
   *  BootOverlay 는 이 값이 false 일 때만 풀스크린 표시 — 이후의
   *  모드 전환 / 카메라 조작 / 시뮬레이션 trigger 로 stage 가 바뀌어도
   *  로딩창은 다시 안 뜸 (사용자 의도). */
  hasEverReached: boolean;
}

const MAX_LIVE_LOG = 100;
const MAX_NOTIFICATIONS = 16;

function emptyStageInfo(): StageInfo {
  return { startedAt: null, completedAt: null, detail: '', progress: 0 };
}

function emptyBootStages(): Record<BootStage, StageInfo> {
  return {
    init: emptyStageInfo(),
    engine: emptyStageInfo(),
    setup: emptyStageInfo(),
    greenhouse: emptyStageInfo(),
    plants: emptyStageInfo(),
    quality: emptyStageInfo(),
    shaders: emptyStageInfo(),
    ready: emptyStageInfo(),
  };
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

  // Render-quality slider. 1..10 — 10 is the Babylon-web ceiling
  // (every post-FX on, 8192 PCSS shadows, 1.5× SSAA, full 13-bed
  // plant fill). See RenderQuality.ts for the preset table.
  renderQuality: number;
  renderFX: RenderFXState;
  setRenderQuality: (level: number) => void;
  setRenderFX: (patch: Partial<RenderFXState>) => void;

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

  // -- App mode (top-level routing) --
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  // -- Single-Plant Analysis mode state --
  /** Current scrub position in minutes since transplant (0 .. 120*24*60). */
  singlePlantMinute: number;
  /** Auto-playback toggle for the single-plant timeline. */
  singlePlantPlaying: boolean;
  /** Playback speed multiplier. */
  singlePlantSpeed: 1 | 4 | 24;
  /** Which output variable the TimelineChart graphs as the y-axis. */
  singlePlantChartVar: SinglePlantChartVar;
  /** History window for the TimelineChart. */
  singlePlantChartWindow: '1d' | '7d' | '30d' | 'all';
  /** Camera preset in the single-plant viewport. */
  singlePlantCamera: 'free' | 'truss' | 'fruit' | 'top';
  /** HUD-refactor: top-bar filter pill ('전체|잎|화방|과실|작업|환경').
   *  Wiring is reserved — toggling the active filter is supported but
   *  downstream rendering hooks are Phase E+. */
  singlePlantTopFilter: 'all' | 'leaf' | 'truss' | 'fruit' | 'work' | 'env';
  /** HUD-refactor: collapsible MetricsTray (TimelineChart wrapper). */
  singlePlantMetricsOpen: boolean;
  /** Which inspector sections are expanded. */
  singlePlantInspectorOpen: {
    cultivar: boolean;
    state: boolean;
    truss: boolean;
    phenology: boolean;
    genome: boolean;
  };
  /** Plan 3a — toggle skeleton-only view. While true the lush mesh hides
   *  and a wireframe + node-marker overlay shows. Used to verify biology
   *  (apex, node bulge, side shoots, pruning) without visual clutter. */
  showSkeleton: boolean;
  setShowSkeleton: (v: boolean) => void;

  /** SSOT Phase 4 — Implicit skin mesh view toggle. When true, swap the
   *  default ShowcasePlant for SkinMeshPlant (SDF + marching cubes single
   *  watertight stem mesh). Environment/skeleton/PlantBase are shared. */
  useImplicitMesh: boolean;
  setUseImplicitMesh: (v: boolean) => void;

  /** Plan 3b Phase η-2 — 진단 로그 토글. ON 시 ShowcasePlant.update 와
   *  SkeletonOverlay 의 update/setVisible 가 4단계 [diag:N] log 출력. */
  debugDiagnostics: boolean;
  setDebugDiagnostics: (v: boolean) => void;

  /** Plan 3a Phase ζ — skeleton overlay 의 thickness + color 설정.
   *  Drawer 에서 슬라이더/컬러 픽커로 조정. localStorage 에 persist. */
  skeleton: SkeletonConfig;
  setSkeleton: (patch: Partial<SkeletonConfig>) => void;
  resetSkeleton: () => void;

  /** 우측 드로어 — 'lighting' | 'inspector' | 'skeleton' | null. 동시 하나만. */
  openDrawer: DrawerKind | null;
  setOpenDrawer: (d: DrawerKind | null) => void;
  setSinglePlantMinute: (m: number) => void;
  setSinglePlantPlaying: (p: boolean) => void;
  setSinglePlantSpeed: (s: 1 | 4 | 24) => void;
  setSinglePlantChartVar: (v: SinglePlantChartVar) => void;
  setSinglePlantChartWindow: (w: '1d' | '7d' | '30d' | 'all') => void;
  setSinglePlantCamera: (c: 'free' | 'truss' | 'fruit' | 'top') => void;
  setSinglePlantTopFilter: (f: 'all' | 'leaf' | 'truss' | 'fruit' | 'work' | 'env') => void;
  toggleSinglePlantMetrics: () => void;
  toggleSinglePlantInspector: (key: 'cultivar' | 'state' | 'truss' | 'phenology' | 'genome') => void;

  // -- Boot progress + notifications + live log + env --
  boot: BootSnapshot;
  notifications: Notification[];
  // Iter 35: busy 필드 + BusyIndicator UI 제거 (사용자 결정).
  /** 단계 진입. 이전 단계는 자동으로 completedAt 채움. */
  setBootStage: (stage: BootStage, detail?: string, progress?: number) => void;
  /** 현재 단계의 detail / progress / subCounters 갱신 (단계 변경 없음). */
  updateStageDetail: (
    detail: string,
    progress?: number,
    subCounters?: StageInfo['subCounters'],
  ) => void;
  /** 라이브 로그 push. */
  logBoot: (level: LiveLogLevel, message: string) => void;
  /** 환경 카운터 일괄 갱신 (메쉬/삼각형/텍스처/머티리얼/메모리). */
  setEnvCounters: (counters: Partial<EnvInfo['counters']>) => void;
  /** 환경 정보 (백엔드, GPU 장치, viewport) 갱신. */
  setEnvInfo: (patch: Partial<Omit<EnvInfo, 'counters'>>) => void;
  /** ETA 표시 갱신. */
  setBootEta: (min: number | null, max: number | null) => void;
  /** 알림 추가. id 가 이미 있으면 본문 갱신 + dismissed=false (중복 제거). */
  pushNotification: (n: Omit<Notification, 'createdAt' | 'dismissed'>) => void;
  /** 알림 닫기 (id 로). */
  dismissNotification: (id: string) => void;
  /** 모든 알림 닫기. */
  clearNotifications: () => void;
}

/**
 * Read `?quality=N` from the URL (1..10) so a test/demo run can boot at
 * a different level than the default (e.g. ?quality=1 for a quick low-
 * cost smoke check that doesn't melt SwiftShader in headless Playwright).
 * Returns null when the param is missing or invalid — caller falls back
 * to the regular default.
 */
function readQualityFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('quality');
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(10, n));
}

// Iter 31 — default boot quality 8 (사용자: "1단계는 너무 안보임").
//   localStorage에 이전 저장된 renderQuality < 5는 _무시_ (낮은 화질 fallback 방지).
const BOOT_QUALITY = readQualityFromUrl() ?? 8;

// ===========================================================================
// Lighting / renderQuality persistence — localStorage
// ===========================================================================
//
// 사용자가 LightingDrawer 에서 dial 한 값을 새로고침 후에도 유지.
// debounce 로 slider drag 중 매 frame 쓰기 방지. parse 실패 시 default
// fallback. v1 prefix 로 향후 schema 변경 시 마이그레이션 여지.

// v1 → v2: 이전 사용자가 저장한 Lv 10 heavy 설정이 메모리 초과 유발
// 가능성. v2 부터는 신규 시작 (사용자가 다시 dial in).
const LS_KEY_LIGHTING = 'farmsim.lighting.v2';
// Skeleton config persistence (Plan 3a Phase ζ)
const LS_KEY_SKELETON = 'farmsim.skeleton.v1';

interface PersistedLighting {
  lighting?: Partial<LightingState>;
  renderQuality?: number;
}

function loadPersistedLighting(): PersistedLighting {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY_LIGHTING);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const p = parsed as { lighting?: unknown; renderQuality?: unknown };
    const out: PersistedLighting = {};
    if (p.lighting && typeof p.lighting === 'object') {
      out.lighting = p.lighting as Partial<LightingState>;
    }
    // Iter 31 — quality < 5 (이전 saved 1~4단계)는 _무시_ — BOOT_QUALITY로 fallback.
    // 사용자 명시: "1단계는 너무 안보인다". 사용자가 의도적으로 dial-down한 경우는
    // 5 이상에서 보존됨 (5는 의식적 선택). 1~4는 default 미인지 케이스로 간주.
    if (typeof p.renderQuality === 'number' && p.renderQuality >= 5 && p.renderQuality <= 10) {
      out.renderQuality = Math.round(p.renderQuality);
    }
    return out;
  } catch {
    return {};
  }
}

function loadPersistedSkeleton(): Partial<SkeletonConfig> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY_SKELETON);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Partial<SkeletonConfig>;
  } catch {
    return {};
  }
}

const PERSISTED = loadPersistedLighting();
const PERSISTED_SKELETON = loadPersistedSkeleton();
const EFFECTIVE_QUALITY = PERSISTED.renderQuality ?? BOOT_QUALITY;

export const useTwinStore = create<TwinState>((set) => ({
  currentDay: 100,
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

  // 우선순위: defaults < 현재 quality preset < persisted lighting overrides.
  // (persisted lighting 이 마지막에 와서 사용자의 미세조정이 quality
  //  preset 의 일괄값을 override.)
  lighting: {
    ...LIGHTING_DEFAULTS,
    ...QUALITY_PRESETS[EFFECTIVE_QUALITY].lightingPatch,
    ...(PERSISTED.lighting ?? {}),
  },
  setLighting: (patch) => set((s) => ({ lighting: { ...s.lighting, ...patch } })),
  resetLighting: () => set({ lighting: { ...LIGHTING_DEFAULTS } }),
  applyLightingPreset: (name) =>
    set({ lighting: { ...LIGHTING_DEFAULTS, ...LIGHTING_PRESETS[name] } }),

  // Render quality — default Lv 9 (Extreme). Override priority:
  //   ?quality=N URL param > persisted localStorage > 9 (default)
  renderQuality: EFFECTIVE_QUALITY,
  renderFX: { ...QUALITY_PRESETS[EFFECTIVE_QUALITY].fx },
  setRenderQuality: (level) => {
    const lv = Math.max(1, Math.min(10, Math.round(level)));
    const preset = QUALITY_PRESETS[lv];
    set((s) => ({
      renderQuality: lv,
      renderFX: { ...preset.fx },
      lighting: { ...s.lighting, ...preset.lightingPatch },
    }));
  },
  setRenderFX: (patch) =>
    set((s) => ({ renderFX: { ...s.renderFX, ...patch } })),

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

  // -- App mode --
  mode: readModeFromHash(),
  setMode: (mode) => {
    set({ mode });
    if (typeof window !== 'undefined') {
      const newHash = `#${mode}`;
      if (window.location.hash !== newHash) {
        window.location.hash = newHash;
      }
    }
  },

  // -- Single-Plant mode --
  // Default scrub: day 45 noon — mid-growth, multiple trusses active,
  // good showcase for the timeline / inspector.
  singlePlantMinute: 45 * 24 * 60 + 12 * 60,
  singlePlantPlaying: false,
  singlePlantSpeed: 4,
  singlePlantChartVar: 'LAI',
  singlePlantChartWindow: '7d',
  singlePlantCamera: 'free',
  singlePlantTopFilter: 'all',
  singlePlantMetricsOpen: false,
  singlePlantInspectorOpen: { cultivar: true, state: true, truss: true, phenology: true, genome: false },
  showSkeleton: false,
  setShowSkeleton: (v) => set({ showSkeleton: v }),
  useImplicitMesh: false,
  setUseImplicitMesh: (v) => set({ useImplicitMesh: v }),
  debugDiagnostics: false,
  setDebugDiagnostics: (v) => set({ debugDiagnostics: v }),

  skeleton: { ...SKELETON_DEFAULTS, ...PERSISTED_SKELETON },
  setSkeleton: (patch) => set((s) => ({ skeleton: { ...s.skeleton, ...patch } })),
  resetSkeleton: () => set({ skeleton: { ...SKELETON_DEFAULTS } }),

  openDrawer: null,
  setOpenDrawer: (d) => set({ openDrawer: d }),
  setSinglePlantMinute: (m) =>
    set({ singlePlantMinute: Math.max(0, Math.min(120 * 24 * 60 - 1, Math.round(m))) }),
  setSinglePlantPlaying: (p) => set({ singlePlantPlaying: p }),
  setSinglePlantSpeed: (s) => set({ singlePlantSpeed: s }),
  setSinglePlantChartVar: (v) => set({ singlePlantChartVar: v }),
  setSinglePlantChartWindow: (w) => set({ singlePlantChartWindow: w }),
  setSinglePlantCamera: (c) => set({ singlePlantCamera: c }),
  setSinglePlantTopFilter: (f) => set({ singlePlantTopFilter: f }),
  toggleSinglePlantMetrics: () =>
    set((s) => ({ singlePlantMetricsOpen: !s.singlePlantMetricsOpen })),
  toggleSinglePlantInspector: (key) =>
    set((s) => ({
      singlePlantInspectorOpen: { ...s.singlePlantInspectorOpen, [key]: !s.singlePlantInspectorOpen[key] },
    })),

  // -- Boot progress + notifications + live log + env --
  boot: {
    currentStage: 'init',
    startedAt: typeof performance !== 'undefined' ? performance.now() : 0,
    stages: (() => {
      const s = emptyBootStages();
      // 'init' 은 마운트 직후 진입 — startedAt 미리 채움
      s.init.startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
      return s;
    })(),
    liveLog: [],
    env: {
      backend: 'unknown',
      gpuDevice: '',
      viewport: { w: 0, h: 0 },
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      counters: { meshes: 0, triangles: 0, textures: 0, materials: 0, memoryMB: null },
    },
    etaSecondsMin: null,
    etaSecondsMax: null,
    hasEverReached: false,
  },
  notifications: [],

  setBootStage: (stage, detail = '', progress = 0) =>
    set((s) => {
      const now = performance.now();
      const stages = { ...s.boot.stages };
      // 이전 단계 자동 완료 처리 — 같은 stage 가 두 번 호출돼도 startedAt 보존
      const prevStage = s.boot.currentStage;
      if (prevStage !== stage && stages[prevStage].startedAt && !stages[prevStage].completedAt) {
        stages[prevStage] = {
          ...stages[prevStage],
          completedAt: now,
          progress: 1,
        };
      }
      // 새 단계 진입
      stages[stage] = {
        ...stages[stage],
        startedAt: stages[stage].startedAt ?? now,
        completedAt: stage === 'ready' ? now : null,
        detail,
        progress: stage === 'ready' ? 1 : progress,
      };
      const nextLog: LiveLogEntry = {
        id: s.boot.liveLog.length > 0 ? s.boot.liveLog[s.boot.liveLog.length - 1].id + 1 : 1,
        ts: now,
        level: 'log',
        stage,
        message: detail ? `${stage}: ${detail}` : `${stage}: 진입`,
      };
      const liveLog = [...s.boot.liveLog, nextLog].slice(-MAX_LIVE_LOG);
      // Sticky 'ready' bit — once true, BootOverlay 풀스크린은 영구 숨김
      const hasEverReached = s.boot.hasEverReached || stage === 'ready';
      return {
        boot: { ...s.boot, currentStage: stage, stages, liveLog, hasEverReached },
      };
    }),

  updateStageDetail: (detail, progress, subCounters) =>
    set((s) => {
      const stages = { ...s.boot.stages };
      const cur = s.boot.currentStage;
      stages[cur] = {
        ...stages[cur],
        detail,
        progress: progress != null ? progress : stages[cur].progress,
        subCounters: subCounters ?? stages[cur].subCounters,
      };
      return { boot: { ...s.boot, stages } };
    }),

  logBoot: (level, message) =>
    set((s) => {
      const nextId = s.boot.liveLog.length > 0
        ? s.boot.liveLog[s.boot.liveLog.length - 1].id + 1
        : 1;
      const entry: LiveLogEntry = {
        id: nextId,
        ts: performance.now(),
        level,
        stage: s.boot.currentStage,
        message,
      };
      const liveLog = [...s.boot.liveLog, entry].slice(-MAX_LIVE_LOG);
      return { boot: { ...s.boot, liveLog } };
    }),

  setEnvCounters: (counters) =>
    set((s) => ({
      boot: { ...s.boot, env: { ...s.boot.env, counters: { ...s.boot.env.counters, ...counters } } },
    })),

  setEnvInfo: (patch) =>
    set((s) => ({
      boot: { ...s.boot, env: { ...s.boot.env, ...patch } },
    })),

  setBootEta: (etaSecondsMin, etaSecondsMax) =>
    set((s) => ({ boot: { ...s.boot, etaSecondsMin, etaSecondsMax } })),

  pushNotification: (n) =>
    set((s) => {
      const now = Date.now();
      // 중복 id 면 기존 알림 갱신 + dismissed 해제
      const idx = s.notifications.findIndex((x) => x.id === n.id);
      const next: Notification = { ...n, createdAt: now, dismissed: false };
      let arr: Notification[];
      if (idx >= 0) {
        arr = [...s.notifications];
        arr[idx] = next;
      } else {
        arr = [...s.notifications, next].slice(-MAX_NOTIFICATIONS);
      }
      // 알림은 라이브 로그에도 push (부팅 중일 때 사이드 패널에 보이도록)
      const nextId = s.boot.liveLog.length > 0
        ? s.boot.liveLog[s.boot.liveLog.length - 1].id + 1
        : 1;
      const logEntry: LiveLogEntry = {
        id: nextId,
        ts: performance.now(),
        level: n.level,
        stage: s.boot.currentStage,
        message: n.body ? `${n.title} — ${n.body}` : n.title,
      };
      const liveLog = [...s.boot.liveLog, logEntry].slice(-MAX_LIVE_LOG);
      return { notifications: arr, boot: { ...s.boot, liveLog } };
    }),

  dismissNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, dismissed: true } : n)),
    })),

  clearNotifications: () => set({ notifications: [] }),
}));

// ===========================================================================
// Auto-persist lighting + renderQuality to localStorage
// ===========================================================================
// debounce 300ms so slider drag (수십 frame) 이 1회 쓰기로 collapse.
// parse / quota 에러는 swallow — persistence 실패가 앱 동작에 영향 X.

let _lightingSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _skeletonSaveTimer: ReturnType<typeof setTimeout> | null = null;
if (typeof window !== 'undefined') {
  useTwinStore.subscribe((s, prev) => {
    // lighting + renderQuality
    if (s.lighting !== prev.lighting || s.renderQuality !== prev.renderQuality) {
      if (_lightingSaveTimer) clearTimeout(_lightingSaveTimer);
      _lightingSaveTimer = setTimeout(() => {
        try {
          window.localStorage.setItem(
            LS_KEY_LIGHTING,
            JSON.stringify({ lighting: s.lighting, renderQuality: s.renderQuality }),
          );
        } catch { /* quota / private mode 등 무시 */ }
        _lightingSaveTimer = null;
      }, 300);
    }
    // skeleton config
    if (s.skeleton !== prev.skeleton) {
      if (_skeletonSaveTimer) clearTimeout(_skeletonSaveTimer);
      _skeletonSaveTimer = setTimeout(() => {
        try {
          window.localStorage.setItem(LS_KEY_SKELETON, JSON.stringify(s.skeleton));
        } catch { /* ignore */ }
        _skeletonSaveTimer = null;
      }, 300);
    }
  });
}
