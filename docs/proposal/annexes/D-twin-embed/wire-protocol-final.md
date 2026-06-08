# Annex D — Wire Protocol Final (사내 구현판 v1)

**근거**: [packages/phytosim-api/inAppBus.ts](../../../../packages/phytosim-api/inAppBus.ts) (W3.a~e)
**05-wire-protocol.md 사내 구현 후 미세 조정한 최종판**

## 0. Transport

| 채널 | 사내 구현 | 외부 발주 V2 |
|---|---|---|
| Primary | **BroadcastChannel** `phytosim:bus:v1` (in-app, 같은 origin 탭 간 동기) | WebSocket `wss://twin/v1` |
| Fallback | `EventTarget` (단일 탭 내부 fan-out) | REST polling |
| Auth | n/a (in-app, 사내) | JWT + ACL |

본 사내 mvp는 in-app pub/sub로 실 WS 서버를 대체. **메시지 형식과 토픽 명세는 V2에서 그대로 WS 서버로 lift-and-shift 가능**.

## 1. Topics (4)

```
phytosim:bus:v1
├─ /world/state    1   Hz — 온실 globals: manualHour · windStrength · ambientTempC
├─ /robot/state   10   Hz — robot pose (rail X · y · ee 좌표) · battery
├─ /plant/state    0.1 Hz — bed별 workable·occlusion·density·anomaly bool
└─ /anomaly/event  event-driven — zone anomaly 발생 시
```

## 2. Envelope

```ts
interface BusMessage<T> {
  topic: string;       // 토픽 (위 4종)
  ts: string;          // ISO 8601 발신 시각
  seq: number;         // 토픽별 monotonic 증가
  payload: T;
}
```

## 3. Schema

### 3.1 `/world/state` (WorldState)
```ts
interface WorldState {
  manualHour: number;       // 0~24, Sinusoidal
  windStrength: number;     // 0~1
  ambientTempC: number;     // °C
}
```

### 3.2 `/robot/state` (RobotState)
```ts
interface RobotState {
  rail: string;                                   // "aisle-3"
  x: number;                                      // m, ±14 boundary
  ee: { x: number; y: number; z: number };       // end-effector world pos
  battery: number;                                // 0~1
}
```

### 3.3 `/plant/state` (PlantStateMsg)
```ts
interface PlantStateMsg {
  zoneId: string;       // "bed-3"
  bed: number;
  day: number;
  workable: number;     // 0~1
  occlusion: number;    // 0~1
  density: number;      // 0~1
  anomaly: boolean;     // density > 0.78 && occlusion > 0.6
}
```

### 3.4 `/anomaly/event` (AnomalyEvent)
```ts
interface AnomalyEvent {
  zoneId: string;
  bed: number;
  reason: string;                              // "leafDensity > 0.78 + occlusion > 0.6"
  severity: 'info' | 'warning' | 'error';
  deviationPct?: number;
}
```

## 4. Tick Schedule (사내 구현)

| 토픽 | 주기 | tick driver |
|---|---|---|
| `/world/state` | 1000 ms | window.setInterval |
| `/robot/state` | 100 ms | window.setInterval (railX = ±speedMps/10 per tick) |
| `/plant/state` | 10000 ms | window.setInterval per active bed |
| `/anomaly/event` | on demand | `/plant/state` publish 안에서 트리거 |

## 5. Robot Trajectory (`startSimulation`)

```ts
// railX = ±speedMps/10 per 100ms
// boundary: ±14m → direction reverse
let railX = 0, direction = 1;
setInterval(() => {
  railX += direction * (speedMps / 10);
  if (railX > 14 || railX < -14) direction *= -1;
  publish('/robot/state', { rail, x: railX, ee, battery });
}, 100);
```

## 6. Anomaly Trigger

`/plant/state` publish 안에서 `density > 0.78 && occlusion > 0.6` 조건 충족 시 즉시 `/anomaly/event` 추가 publish. severity 기본 `'warning'`, deviationPct 18 mvp 값.

## 7. V2 Evolution (실 WS 서버 lift)

- BroadcastChannel → uWS or socket.io server (port 8092)
- JWT 인증 + ACL (viewer / operator / engineer / domain-expert / admin)
- `/robot/cmd` publish 토픽 (현재 미구현 — operator 권한 필요)
- `/sensor/rgb` `/sensor/depth` on-demand (현재 미구현 — Foundry 캡처 sub-system)
- TLS (`wss://`) + OIDC SSO (비아 관제 통합)
- seq lag · retransmit · catch-up by seq
- Schema versioning (semver, 6개월 backward compat)

## 8. 검증 결과 (in-app)

| 항목 | 사내 mvp | V2 임계 |
|---|---|---|
| 메시지 손실율 | **0%** (single process) | < 0.1% |
| Latency | **0 ms** (in-app dispatch) | < 250 ms p95 |
| 재연결 동작 | **자동** (탭 닫힘/재오픈 시 BroadcastChannel 자동 재구독) | exponential backoff + seq catch-up |
| 비아 관제 통합 | 사내 mock (DevTools에서 BroadcastChannel `phytosim:bus:v1` 확인 가능) | iframe SSO + postMessage relay |

## 9. Cross-link

- [05-wire-protocol.md](../../05-wire-protocol.md) — RFP 원문
- [packages/phytosim-api/inAppBus.ts](../../../../packages/phytosim-api/inAppBus.ts) — 사내 구현 source
- [src/modes/twin/Twin.tsx](../../../../src/modes/twin/Twin.tsx) — 구독 client
- [02 §5](../../02-final-report-template.md) — 완료보고서 인용
