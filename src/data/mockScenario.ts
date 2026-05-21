import { SeededRandom } from '@farmsim/tomato-engine';

export type HealthLabel = 'normal' | 'weak' | 'disease' | 'water-stress';
export type EventType =
  | 'wilting'
  | 'disease'
  | 'water-stress'
  | 'fruit-set-anomaly'
  | 'growth-slowdown';
export type Severity = 'info' | 'warning' | 'critical';
export type RobotTask = 'idle' | 'patrolling' | 'capturing' | 'returning';

export const HEALTH_COLORS: Record<HealthLabel, string> = {
  normal: '#6ee7b7',
  weak: '#fbbf24',
  disease: '#ef4444',
  'water-stress': '#60a5fa',
};

export const HEALTH_LABELS_KO: Record<HealthLabel, string> = {
  normal: '정상',
  weak: '생육 부진',
  disease: '병해 의심',
  'water-stress': '수분 스트레스',
};

export interface DailySnapshot {
  day: number;
  heightCm: number;
  leafAreaCm2: number;
  fruitCount: number;
  ripenScore: number;
  health: HealthLabel;
}

export interface PlantSpec {
  id: number;
  zoneId: number;
  position: [number, number, number];
  daily: DailySnapshot[];
}

export interface RobotKeyframe {
  time: number;
  position: [number, number, number];
  heading: number;
  task: RobotTask;
  targetPlantId?: number;
}

export interface CaptureSession {
  id: string;
  day: number;
  hour: number;
  robotPosition: [number, number, number];
  targetPlantId: number;
  zoneId: number;
  rgbThumb: string;
  depthThumb: string;
  segmentationThumb: string;
  pointCloud: { x: number; y: number; z: number; intensity: number }[];
  aiConfidence: number;
}

export interface ZoneSummary {
  zoneId: number;
  startX: number;
  endX: number;
  plantIds: number[];
}

export interface Event {
  id: string;
  day: number;
  type: EventType;
  plantId: number;
  zoneId: number;
  severity: Severity;
  descriptionKo: string;
  captureSessionId?: string;
}

export interface Scenario {
  durationDays: number;
  plantCount: number;
  zoneCount: number;
  bedLengthM: number;
  bedY: number;
  plants: PlantSpec[];
  zones: ZoneSummary[];
  robotRoute: RobotKeyframe[];
  captureSessions: CaptureSession[];
  events: Event[];
}

const DURATION = 120;
const PLANT_COUNT = 30;
const ZONE_COUNT = 6;
const BED_LENGTH = 30;
const BED_Y = 0.95;

function buildPlant(id: number, rng: SeededRandom): PlantSpec {
  const x = -BED_LENGTH / 2 + 0.5 + (id / (PLANT_COUNT - 1)) * (BED_LENGTH - 1);
  const zoneId = Math.min(ZONE_COUNT - 1, Math.floor(((x + BED_LENGTH / 2) / BED_LENGTH) * ZONE_COUNT));

  const finalHeight = rng.range(150, 220);
  const growthMidday = 30 + rng.gaussian(0, 4);
  const growthSlope = 0.08 + rng.range(-0.01, 0.01);
  const baseFruitCount = Math.floor(rng.range(18, 32));

  const issueDay = rng.next() < 0.45 ? Math.floor(rng.range(40, 100)) : -1;
  const issueType: HealthLabel | null = issueDay < 0
    ? null
    : (['weak', 'disease', 'water-stress'] as HealthLabel[])[rng.int(0, 3)];

  const daily: DailySnapshot[] = [];
  for (let day = 0; day <= DURATION; day++) {
    const sigmoid = 1 / (1 + Math.exp(-growthSlope * (day - growthMidday)));
    const heightCm = finalHeight * sigmoid;
    const leafAreaCm2 = 600 * sigmoid * (day < 90 ? 1 : 1 - (day - 90) * 0.005);
    const fruitCount = day < 50 ? 0 : Math.floor(baseFruitCount * Math.min(1, (day - 50) / 40));
    const ripenScore = day < 70 ? 0 : Math.min(1, (day - 70) / 30);

    let health: HealthLabel = 'normal';
    if (issueType && day >= issueDay) {
      const ageOfIssue = day - issueDay;
      if (ageOfIssue < 14) health = issueType;
      else if (ageOfIssue < 30) health = rng.next() < 0.5 ? issueType : 'normal';
    }

    daily.push({ day, heightCm, leafAreaCm2, fruitCount, ripenScore, health });
  }

  return {
    id,
    zoneId,
    position: [x, BED_Y, 0],
    daily,
  };
}

function buildRobotRoute(): RobotKeyframe[] {
  const route: RobotKeyframe[] = [];
  const robotDayDurationSec = 60;
  const captureCount = 6;

  for (let day = 0; day < DURATION; day++) {
    const startT = day;
    route.push({
      time: startT,
      position: [-BED_LENGTH / 2 - 1, 0.05, 1.5],
      heading: 0,
      task: 'idle',
    });
    for (let c = 0; c < captureCount; c++) {
      const ratio = c / (captureCount - 1);
      const x = -BED_LENGTH / 2 + ratio * BED_LENGTH;
      const captureTime = startT + (c / captureCount) * (robotDayDurationSec / 86400);
      route.push({
        time: captureTime,
        position: [x, 0.05, 1.5],
        heading: 0,
        task: 'capturing',
      });
    }
    route.push({
      time: startT + robotDayDurationSec / 86400,
      position: [BED_LENGTH / 2 + 1, 0.05, 1.5],
      heading: Math.PI,
      task: 'returning',
    });
  }
  return route;
}

function buildCaptureSessions(plants: PlantSpec[], rng: SeededRandom): CaptureSession[] {
  const sessions: CaptureSession[] = [];
  const captureHours = [8, 11, 14, 17];

  for (let day = 0; day < DURATION; day += 3) {
    for (const hour of captureHours) {
      const targetPlantId = rng.int(0, plants.length);
      const plant = plants[targetPlantId];
      const snapshot = plant.daily[Math.min(plant.daily.length - 1, day)];

      const pointCloud = Array.from({ length: 600 }, () => {
        const r = rng.range(0, 0.4);
        const theta = rng.range(0, Math.PI * 2);
        const y = rng.range(0.5, 2.0);
        return {
          x: Math.cos(theta) * r,
          y,
          z: Math.sin(theta) * r,
          intensity: rng.range(0.2, 1.0),
        };
      });

      const conf = snapshot.health === 'normal'
        ? rng.range(0.92, 0.99)
        : rng.range(0.78, 0.95);

      sessions.push({
        id: `cap_${day}_${hour}`,
        day,
        hour,
        robotPosition: [plant.position[0], 0.05, 1.5],
        targetPlantId,
        zoneId: plant.zoneId,
        rgbThumb: `placeholder://rgb/${snapshot.health}`,
        depthThumb: `placeholder://depth`,
        segmentationThumb: `placeholder://seg/${snapshot.health}`,
        pointCloud,
        aiConfidence: conf,
      });
    }
  }
  return sessions;
}

function buildEvents(plants: PlantSpec[], rng: SeededRandom): Event[] {
  const events: Event[] = [];
  const eventTypeMap: Record<HealthLabel, EventType | null> = {
    normal: null,
    weak: 'growth-slowdown',
    disease: 'disease',
    'water-stress': 'water-stress',
  };
  const eventDescKo: Record<EventType, string> = {
    wilting: '잎 시들음 감지',
    disease: '병해 의심 — 잎 점무늬',
    'water-stress': '수분 스트레스 지표 초과',
    'fruit-set-anomaly': '착과 이상 — 화방 불충분',
    'growth-slowdown': '생장률 저하 (전일 대비)',
  };

  for (const plant of plants) {
    let activeIssue: HealthLabel | null = null;
    for (let day = 0; day <= DURATION; day++) {
      const snap = plant.daily[day];
      if (snap.health !== 'normal' && snap.health !== activeIssue) {
        const type = eventTypeMap[snap.health];
        if (type) {
          const severity: Severity = snap.health === 'disease' ? 'critical' : 'warning';
          events.push({
            id: `evt_${plant.id}_${day}`,
            day,
            type,
            plantId: plant.id,
            zoneId: plant.zoneId,
            severity,
            descriptionKo: `${eventDescKo[type]} (구역 ${plant.zoneId + 1}, 식물 #${plant.id + 1})`,
          });
        }
        activeIssue = snap.health;
      } else if (snap.health === 'normal') {
        activeIssue = null;
      }
    }
  }
  return events.slice(0, 35);
}

function buildScenario(): Scenario {
  const rng = new SeededRandom(20260520);
  const plants = Array.from({ length: PLANT_COUNT }, (_, i) => buildPlant(i, rng.fork(i + 1)));

  const zones: ZoneSummary[] = Array.from({ length: ZONE_COUNT }, (_, z) => ({
    zoneId: z,
    startX: -BED_LENGTH / 2 + (z / ZONE_COUNT) * BED_LENGTH,
    endX: -BED_LENGTH / 2 + ((z + 1) / ZONE_COUNT) * BED_LENGTH,
    plantIds: plants.filter((p) => p.zoneId === z).map((p) => p.id),
  }));

  return {
    durationDays: DURATION,
    plantCount: PLANT_COUNT,
    zoneCount: ZONE_COUNT,
    bedLengthM: BED_LENGTH,
    bedY: BED_Y,
    plants,
    zones,
    robotRoute: buildRobotRoute(),
    captureSessions: buildCaptureSessions(plants, rng.fork(9999)),
    events: buildEvents(plants, rng.fork(99999)),
  };
}

export const SCENARIO: Scenario = buildScenario();

export function getDailySnapshot(plant: PlantSpec, day: number): DailySnapshot {
  const idx = Math.max(0, Math.min(plant.daily.length - 1, Math.floor(day)));
  return plant.daily[idx];
}

export function zoneHealthMix(zone: ZoneSummary, day: number): {
  dominant: HealthLabel;
  counts: Record<HealthLabel, number>;
} {
  const counts: Record<HealthLabel, number> = {
    normal: 0,
    weak: 0,
    disease: 0,
    'water-stress': 0,
  };
  for (const pid of zone.plantIds) {
    const plant = SCENARIO.plants[pid];
    const snap = getDailySnapshot(plant, day);
    counts[snap.health]++;
  }
  let dominant: HealthLabel = 'normal';
  let maxCount = 0;
  (Object.keys(counts) as HealthLabel[]).forEach((k) => {
    if (counts[k] > maxCount) {
      maxCount = counts[k];
      dominant = k;
    }
  });
  if (counts.disease > 0) dominant = 'disease';
  else if (counts['water-stress'] > 0 && counts.disease === 0) dominant = 'water-stress';
  return { dominant, counts };
}

export function getRobotStateAtDay(day: number): RobotKeyframe {
  const route = SCENARIO.robotRoute;
  let lo = 0;
  let hi = route.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route[mid].time < day) lo = mid + 1;
    else hi = mid;
  }
  const idx = Math.max(0, lo - 1);
  return route[idx];
}
