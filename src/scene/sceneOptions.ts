// §21 S1 — Scene 진입점 일관화: SceneOptions + URL parsing 1 진입점.
//
// 기존 산재된 URL parsing 6개 (SceneInfrastructure resolveXxx) + BabylonEngine inline +
// Workbench URL push 를 본 모듈로 통합.
//
//   URL → SceneOptions      : resolveSceneOptions(search)
//   SceneOptions → URL      : serializeSceneOptions(options)
//   Scenario → SceneOptions : scenarioToOptions(scenario)
//
// S2 PlantManager · S3 buildScene(options) 와 결합해 진입점 12 → 3 으로.

import type { ScenarioSpec } from '../scenarios/types';

const SHOWCASE_SEED_DEFAULT = 20260520;
const INITIAL_PLANTS_DEFAULT = 30;

export type RobotProfile = 'agv-arm' | 'phenotyping' | 'none';
export type PlantQuality = 'low' | 'medium' | 'high';
export type VisualPreset = 'runtime' | 'realistic';

export interface BedLayoutSpec {
  leftCols: number;
  rightCols: number;
  stride: number;
}

export interface CultivationSpec {
  deleafHeightCm?: number;
  deleafMaxCm?: number;
  deleafEnabled?: boolean;
}

export interface SceneOptions {
  showcaseSeed: number;

  // 작물 배치
  activeBedIndices: number[] | null;   // null = SceneInfra default (count 기반)
  activeBedCount: number;              // 기존 ?activeBeds=N
  bedLayout: BedLayoutSpec | null;
  initialPlantCount: number;
  plantQuality: PlantQuality;
  cultivation: CultivationSpec | null;
  extraPlants: number | null;          // legacy ?extraPlants=N

  // 로봇
  robot: {
    profile: RobotProfile;
    traverseEnabled: boolean;
    traverseRangeM: number;
    traverseSpeedMps: number;
    gimbalView: boolean;
    startX: number;
  };

  // 렌더
  qualityPreset: number | null;        // 1~10 또는 null (mode default 사용)
  visualPreset: VisualPreset;          // runtime 기본, realistic=photo/screenshot

  // 시나리오 ID (boot 후 deep-link 자동 active 용)
  scenarioId: string | null;
}

export const DEFAULT_SCENE_OPTIONS: SceneOptions = {
  showcaseSeed: SHOWCASE_SEED_DEFAULT,
  activeBedIndices: null,
  activeBedCount: 3,
  bedLayout: null,
  initialPlantCount: INITIAL_PLANTS_DEFAULT,
  plantQuality: 'medium',
  cultivation: null,
  extraPlants: null,
  robot: {
    profile: 'phenotyping',
    traverseEnabled: false,
    traverseRangeM: 14,
    traverseSpeedMps: 0.3,
    gimbalView: false,
    startX: 0,
  },
  qualityPreset: null,
  visualPreset: 'runtime',
  scenarioId: null,
};

// ── URL parsing helpers ─────────────────────────────────────────────────

function parseIntOr(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseBedLayout(value: string | null): BedLayoutSpec | null {
  if (!value) return null;
  const parts = value.split('-').map((s) => Number.parseInt(s.trim(), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return { leftCols: parts[0], rightCols: parts[1], stride: Math.max(1, parts[2]) };
}

function parseIntList(value: string | null): number[] | null {
  if (!value) return null;
  const ids = value
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return ids.length > 0 ? ids.sort((a, b) => a - b) : null;
}

// ── Resolve: URL → SceneOptions ────────────────────────────────────────

/** URL search string 또는 location.search 를 SceneOptions 로 변환.
 *  scenario optional: 있으면 default 위에 scenario 패치 위에 URL 패치.
 */
export function resolveSceneOptions(
  search: string,
  scenario?: ScenarioSpec,
): SceneOptions {
  const sp = new URLSearchParams(search);

  // base = default → scenario patch → URL patch
  const base: SceneOptions = scenario
    ? { ...DEFAULT_SCENE_OPTIONS, ...scenarioToOptions(scenario) }
    : { ...DEFAULT_SCENE_OPTIONS };

  // showcaseSeed (URL ?seed)
  const seedParam = sp.get('seed');
  if (seedParam !== null) {
    const n = Number.parseInt(seedParam, 10);
    if (Number.isFinite(n) && n > 0) base.showcaseSeed = n;
  }

  // activeBedCount (legacy ?activeBeds=N)
  const acParam = sp.get('activeBeds');
  if (acParam !== null) {
    const n = Number.parseInt(acParam, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 13) base.activeBedCount = n;
  }

  // activeBedIndices (?activeBedIds=4,5,6,...)
  const ids = parseIntList(sp.get('activeBedIds'));
  if (ids) base.activeBedIndices = ids;

  // bedLayout (?bedLayout=L-R-S)
  const layout = parseBedLayout(sp.get('bedLayout'));
  if (layout) base.bedLayout = layout;

  // initialPlantCount (?initialPlants=N)
  const initParam = sp.get('initialPlants');
  if (initParam !== null) {
    const n = Number.parseInt(initParam, 10);
    if (Number.isFinite(n) && n >= 0) base.initialPlantCount = n;
  }

  // extraPlants (legacy ?extraPlants=N)
  const ep = sp.get('extraPlants');
  if (ep !== null) {
    const n = Number.parseInt(ep, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 89) base.extraPlants = n;
  }

  // robot
  const profileParam = sp.get('robotProfile');
  if (profileParam === 'agv-arm' || profileParam === 'phenotyping' || profileParam === 'none') {
    base.robot.profile = profileParam;
  }
  if (sp.get('robotTraverse') === '1') base.robot.traverseEnabled = true;
  if (sp.get('gimbalView') === '1') base.robot.gimbalView = true;

  // qualityPreset (?qualityPreset=N)
  const qpParam = sp.get('qualityPreset');
  if (qpParam !== null) {
    const n = Number.parseInt(qpParam, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 10) base.qualityPreset = n;
  }
  const vpParam = sp.get('visualPreset');
  if (vpParam === 'realistic' || sp.get('photoRealistic') === 'true') {
    base.visualPreset = 'realistic';
    if (qpParam === null) base.qualityPreset = 5;
  }

  // scenarioId (?scenario=...)
  const scenIdParam = sp.get('scenario');
  if (scenIdParam) base.scenarioId = scenIdParam;

  return base;
}

// ── Serialize: SceneOptions → URL ──────────────────────────────────────

/** SceneOptions를 URL search 문자열로 직렬화. mode param은 별도 (caller가 추가). */
export function serializeSceneOptions(opts: SceneOptions): URLSearchParams {
  const sp = new URLSearchParams();

  if (opts.scenarioId) sp.set('scenario', opts.scenarioId);
  if (opts.bedLayout) {
    const { leftCols, rightCols, stride } = opts.bedLayout;
    sp.set('bedLayout', `${leftCols}-${rightCols}-${stride}`);
  }
  if (opts.activeBedIndices && opts.activeBedIndices.length > 0) {
    sp.set('activeBedIds', opts.activeBedIndices.join(','));
  }
  if (opts.robot.profile !== DEFAULT_SCENE_OPTIONS.robot.profile) {
    sp.set('robotProfile', opts.robot.profile);
  }
  if (opts.robot.traverseEnabled) sp.set('robotTraverse', '1');
  if (opts.robot.gimbalView) sp.set('gimbalView', '1');
  if (opts.qualityPreset !== null) sp.set('qualityPreset', String(opts.qualityPreset));
  if (opts.visualPreset !== DEFAULT_SCENE_OPTIONS.visualPreset) {
    sp.set('visualPreset', opts.visualPreset);
  }
  if (opts.initialPlantCount !== INITIAL_PLANTS_DEFAULT) {
    sp.set('initialPlants', String(opts.initialPlantCount));
  }
  if (opts.showcaseSeed !== SHOWCASE_SEED_DEFAULT) {
    sp.set('seed', String(opts.showcaseSeed));
  }

  return sp;
}

// ── Scenario → SceneOptions patch ──────────────────────────────────────

/** ScenarioSpec → SceneOptions의 부분 patch (default 위에 덮어쓰기 용). */
export function scenarioToOptions(scenario: ScenarioSpec): Partial<SceneOptions> {
  const patch: Partial<SceneOptions> = {
    scenarioId: scenario.id,
  };

  // world.activeBeds → activeBedIndices
  if (scenario.world.activeBeds && scenario.world.activeBeds.length > 0) {
    patch.activeBedIndices = [...scenario.world.activeBeds].sort((a, b) => a - b);
  }
  if (scenario.world.bedLayout) {
    patch.bedLayout = { ...scenario.world.bedLayout };
  }

  // crop.cultivation
  if (scenario.crop.cultivation) {
    patch.cultivation = { ...scenario.crop.cultivation };
  }

  // robot.profile
  if (scenario.robot?.profile) {
    patch.robot = {
      ...DEFAULT_SCENE_OPTIONS.robot,
      profile: scenario.robot.profile,
    };
    if (scenario.robot.startPose && 'x' in scenario.robot.startPose && typeof scenario.robot.startPose.x === 'number') {
      patch.robot.startX = scenario.robot.startPose.x;
    }
    if (scenario.task.speedMps > 0) {
      patch.robot.traverseSpeedMps = scenario.task.speedMps;
    }
    // phenotyping 도메인은 default로 traverse + gimbal 활성
    if (scenario.domain === 'phenotyping') {
      patch.robot.traverseEnabled = true;
      patch.robot.gimbalView = true;
    }
  }

  // phenotyping 도메인은 runtime 기본 3. URL visualPreset=realistic/photoRealistic=true는 5.
  if (scenario.domain === 'phenotyping' && !patch.qualityPreset) {
    patch.qualityPreset = 3;
  }

  return patch;
}
