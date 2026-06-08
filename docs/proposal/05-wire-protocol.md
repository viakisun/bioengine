# 05. Wire Protocol — Mirror Twin 실시간 와이어 프로토콜

**문서 분류**: 깊이 트랙 D · 외주 백엔드·비아 관제 통합 엔지니어 spec
**문서 버전**: v1.0
**근거 plan**: [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) §5.2

---

## §1. 목적

가상↔실제 온실 동기화 (가치명제 V3 Mirror Twin) + 컨소시엄 데이터 공유 (V5 Integration Hub) + 비아 관제 시스템 임베드 통합.

## §2. 트랜스포트

| 트랜스포트 | 용도 | 엔드포인트 |
|---|---|---|
| **WebSocket** (메인) | 양방향 실시간, 저지연 | `wss://twin/v1/...` |
| **REST** (보조) | 히스토리·1회성 제어·관리 | `https://twin/v1/...` |
| **MQTT** (옵션) | 필드 환경 표준 시 채택 | `mqtt://broker/v1/...` |

## §3. 토픽 구조 (WebSocket)

```
wss://twin/v1/
├─ subscribe /world/state     (1 Hz)        온실 globals (시각·조도·바람·온습도)
├─ subscribe /robot/state     (10 Hz)       로봇 pose·joint·end-effector 상태
├─ publish   /robot/cmd                     로봇 제어 명령 (target pose, action)
├─ subscribe /plant/state     (0.1 Hz)      식물별 상태 diff (변경분만)
├─ subscribe /task/event                    작업 이벤트 (시작/완료/실패)
├─ subscribe /sensor/rgb      (on-demand)   카메라 RGB 프레임 (base64 또는 URL)
├─ subscribe /sensor/depth    (on-demand)   depth 프레임
├─ subscribe /zone/state      (1 Hz)        zone-aggregated 상태 (관제용)
└─ subscribe /anomaly/event                 이상 생육·결정성 회귀 등 알림
```

## §4. 메시지 스키마

### 4.1 공통 envelope
```json
{
  "topic": "/plant/state",
  "ts": "2026-06-06T11:00:00Z",
  "seq": 19384,
  "payload": { /* topic-specific */ }
}
```
- `ts`: ISO8601 UTC.
- `seq`: 토픽 내 단조 증가, 재연결 시 catch-up 기준.

### 4.2 `/world/state`
```json
{
  "manualHour": 11.5,
  "lightingPreset": "default",
  "wind": { "strength": 0.25, "direction": [1, 0, 0.1] },
  "ambientTempC": 24.3,
  "ambientHumidityPct": 68.5,
  "co2Ppm": 850
}
```

### 4.3 `/robot/state`
```json
{
  "robotId": "via-agv-01",
  "rail": "aisle-3",
  "x": 4.18,
  "pose": {
    "position": [0.0, 1.42, 0.55],
    "orientation": [0, 0, 0, 1]
  },
  "joints": [0.0, 1.57, -0.78, 0.0, 1.57, 0.0],
  "endEffector": {
    "type": "thinning-cutter",
    "tip": [0.12, 1.65, 0.20],
    "state": "idle"
  },
  "battery": 0.82
}
```

### 4.4 `/robot/cmd` (publish; ACL: operator/admin)
```json
{
  "id": "cmd-19384",
  "kind": "moveTo",
  "target": { "rail": "aisle-3", "x": 4.2 },
  "speedMps": 0.2,
  "auth": "Bearer <jwt>"
}
```
지원 `kind`: `moveTo` · `stop` · `armPose` · `endEffectorAction(cut|grip|release)`.

### 4.5 `/plant/state`
```json
{
  "plantId": "bed-3-slot-45",
  "growth": { "day": 90, "tt": 1240, "heightM": 2.45, "nodeCount": 32 },
  "trusses": [
    {
      "id": "T3",
      "fruitCount": 6,
      "ripeStages": [1, 2, 2, 3, 3, 4],
      "occlusion": 0.32
    }
  ],
  "sideShoots": { "growing": 2, "pruned": 5 },
  "task": {
    "available": true,
    "difficulty": 0.6,
    "reason": ["leaf-occlusion-mid"]
  },
  "diffFromPrev": ["trusses.T3.ripeStages", "task.difficulty"]
}
```

### 4.6 `/task/event`
```json
{
  "eventType": "task-completed",
  "taskId": "thin-19384",
  "robotId": "via-agv-01",
  "plantId": "bed-3-slot-45",
  "targetClass": "fruit-stage-1",
  "targetInstanceId": 19384055,
  "result": "success",
  "duration": 12.5
}
```
지원 `eventType`: `task-started` · `task-completed` · `task-failed` · `task-aborted`.

### 4.7 `/sensor/rgb` / `/sensor/depth`
```json
{
  "cameraId": "head",
  "encoding": "png",
  "width": 1280,
  "height": 720,
  "data": "base64://...",
  "metadata": {
    "scenarioId": "drive-D90-narrow-backlit",
    "seed": "0x42A7",
    "reproducibilitySeal": "seal_abc123"
  }
}
```
대용량은 `data`를 URL로 대체 가능.

### 4.8 `/zone/state` (관제용 aggregated)
```json
{
  "zoneId": "bed-3",
  "growthDay": 90,
  "plantCount": 30,
  "task": {
    "totalPending": 12,
    "available": 8,
    "blocked": 4
  },
  "leafDensity": 0.78,
  "occlusionMedian": 0.34,
  "anomaly": false
}
```

### 4.9 `/anomaly/event`
```json
{
  "anomalyType": "growth-deviation",
  "zoneId": "bed-5",
  "variable": "heightM",
  "expected": 2.10,
  "observed": 1.65,
  "deviationPct": -21.4,
  "severity": "warning"
}
```
지원 `anomalyType`: `growth-deviation` · `seal-mismatch` · `frame-hash-regression` · `wire-disconnect`.

## §5. REST API

### 5.1 시나리오·시드
- `GET /v1/scenarios` — 시나리오 카탈로그 목록
- `GET /v1/scenarios/{id}` — 단건
- `POST /v1/scenarios` — 신규 (engineer/admin)
- `POST /v1/scenarios/{id}/fork` — fork
- `GET /v1/scenarios/{id}/diff?against={otherId}` — diff
- `GET /v1/seals/{seal}` — Reproducibility Seal 조회·재현 검증

### 5.2 zone·plant
- `GET /v1/zones` — zone 목록
- `GET /v1/zones/{zoneId}/state` — 현재
- `GET /v1/zones/{zoneId}/history?from={ts}&to={ts}` — 히스토리
- `GET /v1/plants/{plantId}` — 식물 상태
- `GET /v1/plants/{plantId}/history?from=&to=`

### 5.3 작업
- `POST /v1/tasks` — 작업 등록 (operator/admin)
- `GET /v1/tasks/{taskId}` — 상태
- `GET /v1/tasks?status=pending&zoneId=bed-3` — 필터

### 5.4 데이터 (Foundry)
- `POST /v1/foundry/jobs` — 배치 job 등록 (engineer/admin)
- `GET /v1/foundry/jobs/{jobId}` — 진행률
- `GET /v1/foundry/jobs/{jobId}/results.zip` — 결과 다운로드

### 5.5 Reference Truth
- `GET /v1/reference/standard-ranges` — 표준 범위
- `POST /v1/reference/measurements` — 실측 업로드 (expert/admin)
- `GET /v1/reference/diff?seed=&day=` — diff dashboard 데이터

## §6. 동기화 정책

### 6.1 방향
- **실제 → 가상**: push (신뢰도 weight 적용)
- **가상 → 실제**: 기본 readonly. 명령 송신은 별도 권한 (`operator`/`admin`).

### 6.2 시간 동기
- NTP 기반 wall clock.
- 메시지마다 `ts` 포함.
- 시뮬레이션 시간(`simTime`)은 `/world/state` payload에 별도 표시 (실시간 vs replay 구분).

### 6.3 재연결
- exponential backoff (1s → 2s → 4s → ... → 60s).
- 재연결 후 `?since=seq=<last_seq>` 쿼리로 catch-up.
- 토픽별 메시지 순서 보장.

### 6.4 메시지 순서
- 토픽 내 `seq` 단조 증가.
- 토픽 간 순서는 보장하지 않음 (각 토픽 독립).

## §7. 보안

| 항목 | 정책 |
|---|---|
| 트랜스포트 | TLS 필수 (`wss://`, `https://`) |
| 인증 | OIDC → JWT. 비아 관제 IdP 신뢰. |
| Authorization 헤더 | `Bearer <jwt>` |
| Token TTL | access ≤24h, refresh ≤30d |
| 명령 토픽 ACL | `/robot/cmd`: `operator`/`admin` only |
| Rate limit | 토픽별 분당 메시지 수 제한 (default 600) |
| CORS | 비아 관제 도메인 화이트리스트 |
| 임베드 보안 | iframe sandbox + CSP `frame-ancestors`, postMessage 토픽 화이트리스트 |

상세 역할·권한 매트릭스: [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §SSO.

## §8. Web Component 임베드 (M5)

비아 관제 화면 임베드용.

```html
<phytosim-twin
  src="https://twin.via/v1/embed?zone=bed-3"
  token="<jwt>"
  mode="twin"
  scenario="drive-D90-narrow-backlit"
  height="600px"
></phytosim-twin>
```

parent-iframe postMessage 토픽 (화이트리스트):
- `phytosim:ready`
- `phytosim:scenario-changed`
- `phytosim:task-event`
- `phytosim:auth-refresh-request`

## §9. 버저닝 (semver + backward compat)

- 메시지 envelope의 `topic` 경로에 `/v1/` 포함.
- breaking 변경 시 `/v2/` 신설, 6개월 backward compat 유지.
- payload 필드 추가는 minor; 필드 제거·타입 변경은 major.
- 버전 정책: [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §거버넌스.

## §10. 검증 (V4 PASS 기준)

[01-statement-of-work.md](01-statement-of-work.md) §7 V4 항목.

| 항목 | 임계 | 검증 주체 |
|---|---|---|
| zone polling latency | ≤1초 | **비아 관제팀** |
| WS 재연결 동작 | catch-up 정상 | 비아 관제팀 |
| 메시지 손실율 | ≤0.1% | 비아 관제팀 |
| TLS 활성화 | 100% | 자동 |
| Token rotation | 정상 | 자동 |

## §10.5 외주 작업 spec

> Task Card 상세: [03-gap-and-execution-plan.md §3.8](03-gap-and-execution-plan.md#38-task-cards-외주-즉시-작업-가능-단위).

| Task | 산출 | Task Card |
|---|---|---|
| T5 | WS+REST 서버 + 메시지 스키마 구현 | [03 §3.8 T5](03-gap-and-execution-plan.md) |
| T11 | Twin web component + 미러 동기 | [03 §3.8 T11](03-gap-and-execution-plan.md) |
| T14 | 비아 관제팀 통합 시험 (V4 제3자 검증) | [03 §3.8 T14](03-gap-and-execution-plan.md) |

증빙 첨부: [annexes/D-twin-embed/](annexes/D-twin-embed/) — 임베드 시연·메시지 로그·관제팀 서명 리포트.

## §11. 한 줄

> WS+REST로 zone·robot·plant·sensor·task·anomaly를 토픽 단위로 노출하고, OIDC 기반 SSO + iframe web component로 비아 관제와 임베드 통합한다. V4 검증은 비아 관제팀 제3자 측정.
