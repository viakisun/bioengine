// W3.a~e (§18) — In-app pub/sub bus (BroadcastChannel + EventTarget hybrid).
//
// 실 WS 서버 (port 8092) 대신 in-app pub/sub로 mock 데이터 흐름 실현.
//   - 같은 origin 내 여러 탭이 BroadcastChannel로 동기
//   - 단일 탭에서는 EventTarget으로 내부 fan-out
//
// 토픽 (W3.a):
//   /world/state    1Hz — manualHour · windStrength · ambient
//   /robot/state   10Hz — robot pose (rail X · y · ee 좌표)
//   /plant/state  0.1Hz — zone별 leafDensity·occlusion·workable
//   /anomaly/event       — zone anomaly 발생 시
//
// 메시지 envelope: { topic, ts, seq, payload }

export interface BusMessage<T = unknown> {
  topic: string;
  ts: string; // ISO 8601
  seq: number;
  payload: T;
}

export type TopicHandler<T = unknown> = (msg: BusMessage<T>) => void;

const TOPICS = [
  '/world/state',
  '/robot/state',
  '/plant/state',
  '/anomaly/event',
] as const;

export type Topic = (typeof TOPICS)[number];

class InAppBus {
  private channel: BroadcastChannel | null = null;
  private target = new EventTarget();
  private seqByTopic: Map<string, number> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('phytosim:bus:v1');
      this.channel.onmessage = (e) => {
        const msg = e.data as BusMessage;
        if (!msg || !msg.topic) return;
        this.dispatchLocal(msg);
      };
    }
  }

  publish<T>(topic: Topic, payload: T): BusMessage<T> {
    const seq = (this.seqByTopic.get(topic) ?? 0) + 1;
    this.seqByTopic.set(topic, seq);
    const msg: BusMessage<T> = {
      topic,
      ts: new Date().toISOString(),
      seq,
      payload,
    };
    this.dispatchLocal(msg);
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch {
        // 다른 탭이 닫혀있으면 무시
      }
    }
    return msg;
  }

  subscribe<T>(topic: Topic, handler: TopicHandler<T>): () => void {
    const wrapper = (e: Event) => {
      const detail = (e as CustomEvent).detail as BusMessage<T>;
      handler(detail);
    };
    this.target.addEventListener(topic, wrapper as EventListener);
    return () => this.target.removeEventListener(topic, wrapper as EventListener);
  }

  private dispatchLocal(msg: BusMessage) {
    this.target.dispatchEvent(new CustomEvent(msg.topic, { detail: msg }));
  }

  dispose() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

let busInstance: InAppBus | null = null;
export function getBus(): InAppBus {
  if (!busInstance) busInstance = new InAppBus();
  return busInstance;
}

// ── W3.c·e — 시뮬레이션 publisher (Twin 진입 시 자동 시작) ──
let simStarted = false;
let simHandles: number[] = [];

export interface WorldState {
  manualHour: number;
  windStrength: number;
  ambientTempC: number;
}

export interface RobotState {
  rail: string;
  x: number;
  ee: { x: number; y: number; z: number };
  battery: number;
}

export interface PlantStateMsg {
  zoneId: string;
  bed: number;
  day: number;
  workable: number;
  occlusion: number;
  density: number;
  anomaly: boolean;
}

export interface AnomalyEvent {
  zoneId: string;
  bed: number;
  reason: string;
  severity: 'info' | 'warning' | 'error';
  deviationPct?: number;
}

export function startSimulation(opts?: {
  scenarioId?: string;
  activeBeds?: number[];
  speedMps?: number;
}): void {
  if (simStarted) return;
  simStarted = true;
  const bus = getBus();
  const activeBeds = opts?.activeBeds ?? [3, 4, 5];
  const speedMps = opts?.speedMps ?? 0.2;

  // /world/state — 1Hz
  simHandles.push(
    window.setInterval(() => {
      bus.publish<WorldState>('/world/state', {
        manualHour: 12 + Math.sin(Date.now() / 30000) * 4,
        windStrength: 0.15 + Math.random() * 0.2,
        ambientTempC: 23 + Math.sin(Date.now() / 50000) * 3,
      });
    }, 1000),
  );

  // /robot/state — 10Hz, scene 상 robot 위치 갱신
  let railX = 0;
  let direction = 1;
  simHandles.push(
    window.setInterval(() => {
      railX += direction * (speedMps / 10); // 100ms per tick
      if (railX > 14 || railX < -14) direction *= -1;
      bus.publish<RobotState>('/robot/state', {
        rail: `aisle-${activeBeds[0] ?? 3}`,
        x: railX,
        ee: { x: railX + 0.4, y: 1.4, z: 0 },
        battery: 0.82 - (Date.now() % 1_000_000) / 1e8,
      });
    }, 100),
  );

  // /plant/state — 0.1Hz (10초마다 zone diff)
  simHandles.push(
    window.setInterval(() => {
      for (const bed of activeBeds) {
        const day = 60 + ((bed * 7) % 40);
        const density = 0.5 + ((bed * 23) % 40) / 100;
        const occlusion = 0.2 + ((bed * 17) % 50) / 100;
        const workable = 0.4 + ((bed * 31) % 60) / 100;
        const anomaly = density > 0.78 && occlusion > 0.6;
        bus.publish<PlantStateMsg>('/plant/state', {
          zoneId: `bed-${bed}`,
          bed,
          day,
          workable,
          occlusion,
          density,
          anomaly,
        });
        if (anomaly) {
          bus.publish<AnomalyEvent>('/anomaly/event', {
            zoneId: `bed-${bed}`,
            bed,
            reason: 'leafDensity > 0.78 + occlusion > 0.6',
            severity: 'warning',
            deviationPct: 18,
          });
        }
      }
    }, 10_000),
  );
}

export function stopSimulation(): void {
  for (const h of simHandles) clearInterval(h);
  simHandles = [];
  simStarted = false;
}
