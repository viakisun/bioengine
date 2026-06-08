# 04. Scenario Catalog — 시나리오 1급 객체 + Composer

**문서 분류**: 깊이 트랙 D · 외주 엔지니어·도메인 전문가 작업 spec
**문서 버전**: v1.0
**근거 plan**: [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) §5.1

---

## §1. 정의

시나리오(`.scenario.jsonc`)는 **모든 모드(Workbench/Foundry/Twin)에서 동일하게 소비되는 검증 단위**다. 발주자·외주사·컨소시엄이 같은 파일로 같은 결정을 검증한다.

**시나리오는 불변 템플릿이고, Composer는 그 위에서 조건 dial로 fine-tune하는 단계다**. Composer의 산출은 (a) 즉시 실행 또는 (b) 새 시나리오로 저장 → 카탈로그 등록 → 재진입.

## §2. 파일 포맷

위치: `docs/proposal/scenarios/<id>.scenario.jsonc` (RFP) / 인수 후 `scenarios/` (코드 루트)

```jsonc
{
  "id": "drive-D90-narrow-aisle",
  "version": "1.0",
  "domain": "autonomous-driving",       // | thinning | pruning | spray | recognition
  "consumableBy": ["Twin", "Workbench"], // 모드 호환성
  "world": {
    "greenhouseConfig": "default-24x34-13beds",
    "activeBeds": [3, 4, 5],
    "plantPlacement": "showcase-D90"
  },
  "crop": {
    "day": 90,
    "seed": "0x42A7",
    "cultivar": "tomimaru",
    "perturbation": { "leafDensityScale": 1.1 }
  },
  "env": {
    "manualHour": 11,
    "lightingPreset": "default",
    "wind": { "strength": 0.3, "direction": [1, 0, 0.2] }
  },
  "robot": {
    "model": "via-agv-6dof-v1",
    "startPose": { "rail": "aisle-3", "x": 0.0 },
    "endEffector": "thinning-cutter"
  },
  "task": {
    "type": "drive-traverse",
    "speedMps": 0.2,
    "decisionTriggers": ["leaf-brushing", "obstacle"]
  },
  "verify": {
    "successCriteria": [
      { "metric": "fov-fruit-coverage", "min": 0.7 },
      { "metric": "collision-count", "max": 0 }
    ]
  },
  "meta": {
    "parentId": null,
    "createdBy": "via-pm",
    "createdAt": "2026-06-06T10:00:00Z"
  }
}
```

### 2.1 필수/선택 필드
| 필드 | 필수 | 비고 |
|---|---|---|
| `id` | 필수 | kebab-case 슬러그, 전역 유일. 대문자 약어(`D15`·`LAI` 등) 허용. regex `/^[a-zA-Z0-9-]+$/` |
| `version` | 필수 | semver |
| `domain` | 필수 | enum |
| `consumableBy` | 필수 | 모드 배열 |
| `world` | 필수 | 세계 구성 |
| `crop` | 필수 | seed 포함 (결정성) |
| `env` | 필수 | 시간·조도·바람 |
| `robot` | 선택 (recognition 도메인 등에서 생략 가능) | |
| `task` | 필수 | 작업 정의 |
| `verify` | 필수 | 검증 메트릭 + 임계 |
| `meta` | 권장 | fork 가계도 추적 |

## §3. Scenario Composer (L3.5)

진입 시 25개 조건 dial로 fine-tune. [08-entry-and-ux.md](08-entry-and-ux.md) §L3.5에 UI 와이어프레임.

### 3.1 노출 다이얼 카탈로그

| 카테고리 | 변수 | 범위·타입 | UI |
|---|---|---|---|
| Crop | `day` | 0~120 (int) | 슬라이더 + 숫자 |
| Crop | `seed` | hex | 입력 + Randomize + Seed lock |
| Crop | `cultivar` | enum | 드롭다운 |
| Crop | `leafDensityScale` | 0.5~1.5 | 슬라이더 |
| Crop | `internodeScale` | 0.7~1.3 | 슬라이더 |
| Crop | `trussTimingOffset` (DAS) | -10~+10 | 슬라이더 |
| Crop | `fruitSetRate` | 0.5~1.0 | 슬라이더 |
| Env | `manualHour` | 0~24 | 다이얼 |
| Env | `lightingPreset` | enum | 드롭다운 |
| Env | `windStrength` / `windDirection` | 0~1 / vec3 | 슬라이더 + joystick |
| Env | `fogDensity` (optional) | 0~0.1 | 슬라이더 |
| Robot | `model` | enum (URDF) | 드롭다운 |
| Robot | `startPose` | rail+x 또는 x,y,z | 입력 |
| Robot | `endEffector` | enum (gripper/cutter) | 드롭다운 |
| Robot | `speedMps` | 0.05~0.5 | 슬라이더 |
| Greenhouse | `activeBeds` | int[] | 다중선택 |
| Greenhouse | `aisleWidthScale` | 0.8~1.2 | 슬라이더 |
| Camera | `lens` (FOV deg) | 30/45/60/90 | 토글 |
| Camera | `mountHeight` | 0.3~2.0 | 슬라이더 |
| Camera | `pitch` / `yaw` | -90~90 | 다이얼 |
| Occluder | `addLeafObstacle` | 0~N | counter |
| Task | `type` | enum | 드롭다운 |
| Task | `targets` | filter expression | 코드 입력 (e.g. `truss==3 && occlusion>0.3`) |
| Verify | `successCriteria` | metric list | 다중 추가 |

### 3.2 Lock vs Variable (Foundry 매트릭스 promote)
- **Lock**: 변수 고정. 모든 frame 같은 값.
- **Variable**: Foundry 배치 매트릭스의 한 차원으로 노출. 슬라이더 옆 토글로 전환.
- 예: Workbench에서 `day=70`을 Lock, Foundry 진입 시 `day` Variable 토글 → 매트릭스 자동 포함.

### 3.3 Save & Reuse
- `[Save as scenario]` — ID·작성자·timestamp·base scenario·diff 메타 자동.
- `[Fork]` — 기존 시나리오를 fork. `meta.parentId` 추적.
- `[Diff]` — 두 시나리오의 조건 차이 시각화 (변경된 dial만 강조).
- `[Reproducibility Seal]` — 조건+시드의 hash 발급. PR/논문/관제 사고 분석에 첨부.

### 3.4 My Scenarios + Org Namespace
- 사용자별 변형 라이브러리.
- 공유 시 `org/{username}/{slug}` 네임스페이스.
- "공식 카탈로그 승격" 요청 → [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §거버넌스 절차.

### 3.5 Wire Protocol Sync
- Twin 모드에서 Composer 조정 → `/world/state` `/robot/cmd` 메시지로 실제·mock 환경에 push 가능.
- 실제 환경 데이터가 Composer 현재값 default로 들어옴 (시뮬↔실제 양방향 동기).
- 메시지 스키마: [05-wire-protocol.md](05-wire-protocol.md).

## §4. 초기 카탈로그 (외주 검수 대상 — 15종)

### 4.1 자율주행 (Twin 모드)
| ID | 설명 | 샘플 파일 |
|---|---|---|
| `drive-D15-standard-sunny` | 초기 생육, 표준 통로, 정오 햇빛 | [scenarios/drive-D15-standard-sunny.scenario.jsonc](scenarios/drive-D15-standard-sunny.scenario.jsonc) |
| `drive-D45-standard-overcast` | 중기, 흐림 | (외주 작성) |
| `drive-D90-narrow-sunny` | 후기, 잎 침범, 정오 햇빛 | (외주 작성) |
| `drive-D90-narrow-backlit` | 후기, 역광 (인식 난이도 高) | [scenarios/drive-D90-narrow-backlit.scenario.jsonc](scenarios/drive-D90-narrow-backlit.scenario.jsonc) |
| `drive-multi-bed-traverse` | 베드 전환 | (외주 작성) |

### 4.2 적과(thinning) (Workbench 모드)
| ID | 설명 | 샘플 파일 |
|---|---|---|
| `thin-D50-truss1-single` | 첫 화방 단일 적과 | (외주 작성) |
| `thin-D70-truss3-multi` | 3번째 화방 다중 적과 | [scenarios/thin-D70-truss3-multi.scenario.jsonc](scenarios/thin-D70-truss3-multi.scenario.jsonc) |
| `thin-D90-multi-truss` | 다중 화방 동시 | (외주 작성) |
| `thin-occluded-fruit` | 잎에 가려진 과실 (가림 의사결정) | (외주 작성) |

### 4.3 적심(pruning) (Workbench 모드)
| ID | 설명 | 샘플 파일 |
|---|---|---|
| `prune-D40-sucker-only` | 곁순 제거 | [scenarios/prune-D40-sucker-only.scenario.jsonc](scenarios/prune-D40-sucker-only.scenario.jsonc) |
| `prune-D80-apex-topping` | 생장점 절단 (시즌 마감) | (외주 작성) |

### 4.4 방제(spray) (Workbench / Twin)
| ID | 설명 |
|---|---|
| `spray-D60-high-LAI` | 고밀도 잎 → 통풍 위험 구역 식별 |

### 4.5 인식(recognition) (Foundry 전용)
| ID | 설명 | 샘플 파일 |
|---|---|---|
| `recog-batch-fruit-classification` | 과실 6단계 분류 | [scenarios/recog-batch-fruit-classification.scenario.jsonc](scenarios/recog-batch-fruit-classification.scenario.jsonc) |
| `recog-batch-organ-segmentation` | 기관 분할 |
| `recog-batch-occlusion` | 가림 정도 회귀 |

## §5. 검증 메트릭 사전

| 메트릭 | 의미 | 적용 도메인 | 계산 방법 |
|---|---|---|---|
| `fov-fruit-coverage` | 카메라 시야에 들어온 과실 비율 | autonomous, thinning | 카메라 frustum × 과실 instance |
| `collision-count` | 추정 충돌 (잎·줄기 brushing 제외) | autonomous | 로봇 bbox × 식물 mesh |
| `decision-accuracy` | 알고리즘 vs 표준 매뉴얼 일치 | thinning, pruning | confusion matrix |
| `mask-iou` | 합성 mask vs ground truth | recognition | per-instance IoU |
| `occlusion-error` | 추정 vs 실제 가림 비율 | recognition | RMSE |
| `task-completion-time` | 작업 완료까지 걸린 sim time | thinning, pruning | sim clock |
| `reachability-rate` | 작업 대상 중 도달 가능 비율 | thinning, pruning | inverse kinematics |
| `path-length` | 주행 경로 길이 | autonomous | edge sum |
| `pass-fail-binary` | 모든 successCriteria 통과 | 전 도메인 | AND |

## §6. 시나리오 라이프사이클

```
draft (개인) → review (org) → catalog (official, 비아 PM 승인) → deprecated
```

승인 절차: [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §거버넌스.

## §7. 외주 작업 spec

> Task Card 상세 (Goal·Acceptance Criteria·Inputs·Outputs·PD·Dependencies·DoD): [03-gap-and-execution-plan.md §3.8](03-gap-and-execution-plan.md#38-task-cards-외주-즉시-작업-가능-단위).

| Task | 산출 | Task Card |
|---|---|---|
| T4 | 시나리오 1급 객체 스키마 + 로더 + 플레이어 | [03 §3.8 T4](03-gap-and-execution-plan.md) |
| T4b | Composer dial UI + 상태 모델 + fork API + diff renderer | [03 §3.8 T4b](03-gap-and-execution-plan.md) |
| T12 | 초기 카탈로그 15종 모두 PASS (≥12 V3 충족) | [03 §3.8 T12](03-gap-and-execution-plan.md) |

CI 통합:
- 각 시나리오는 `verify.successCriteria` 기준으로 자동 PASS/FAIL 산출.
- 카탈로그의 모든 시나리오를 Phase 3에서 자동 회귀 실행.
- frame hash 비교 (결정성 V7).

## §8. 한 줄

> 시나리오는 모드 간 공유 가능한 검증 단위, Composer는 그 위에서 25개 dial로 정교 조정·재활용을 가능케 한다. 카탈로그 15종을 외주 검수 게이트로 한다.
