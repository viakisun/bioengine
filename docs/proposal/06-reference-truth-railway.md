# 06. Reference Truth — 검증 철도 + 실측 주입 채널

**문서 분류**: 깊이 트랙 D · 도메인 전문가·외주 spec
**문서 버전**: v1.0
**근거 plan**: [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) §5.3, §9.6, §9.7

---

## §1. 목적

도구의 가치명제 V4 **Reference Truth** 실현. 시뮬레이션 결과가 문헌·실측 표준 범위 ±20% 안에 들어오도록 **자동 검증 + 실측 주입 + 회귀 방어** 철도를 부설.

## §2. 검증 대상 변수

| 변수 | 단위 | 검증 일자 (DAS) |
|---|---|---|
| 초장 (height) | cm | D7, D14, D28, D42, D56, D84, D112 |
| 마디 수 | count | 동일 |
| 첫 화방 출현 | DAS | 단일 시점 |
| 화방 간격 | nodes | D56 이후 |
| 과실 직경 (T1 평균) | mm | D60, D75, D90 |
| 과실 색 (ripeStage) | 0~5 | D75, D90, D105 |
| 잎 수 | count | D28, D56, D84, D112 |
| LAI | m²/m² | D56, D84, D112 |
| 줄기 직경 (base) | mm | D56, D84, D112 |

## §3. 데이터 소스 3종

| 소스 | 경로 | 갱신 주기 |
|---|---|---|
| **문헌 (정적)** | `reference/literature.json` | TOMSIM/TOMGRO/Gillaspy 등; 분기 1회 |
| **실측 (동적)** | `reference/measurements/<batch-id>.csv` | 농가·실험 기지; 주차별 |
| **합의 (병합)** | `reference/standard-ranges.json` | 거버넌스 절차로 통합; 분기 1회 |

### 3.1 `literature.json` 예
```json
{
  "version": "0.1",
  "source": "Calibration Reference Pack v0.1 + Gillaspy 1993",
  "variables": {
    "height": {
      "unit": "cm",
      "ranges": [
        { "day": 28, "min": 35, "max": 55, "median": 45 },
        { "day": 56, "min": 95, "max": 135, "median": 115 },
        { "day": 84, "min": 175, "max": 230, "median": 205 },
        { "day": 112, "min": 230, "max": 295, "median": 265 }
      ]
    },
    "nodeCount": { /* ... */ }
  }
}
```

### 3.2 `measurements/<batch-id>.csv` 예
```csv
batchId,sourceFarm,date,plantId,day,variable,value,unit,note
B-2026-W14,farm-A,2026-04-03,A-bed3-slot12,42,height,68.5,cm,
B-2026-W14,farm-A,2026-04-03,A-bed3-slot12,42,nodeCount,11,count,
```

### 3.3 `standard-ranges.json` (합의·병합)
`literature` ± 실측 평균/분산을 거버넌스 board가 통합. 본 파일이 **CI 자동 검증의 single source**.

## §4. 자동 검증 파이프라인

```
1. 시뮬레이션 실행 (deterministic seed, 시드 N개)
   └─ growth-calibration/scripts/dump-growth-checkpoints.ts 활용

2. 일자별 변수 dump → JSON
   { "seed": "0xFEED", "day": 56, "variable": "height", "value": 117.3 }

3. standard-ranges.json 로드

4. per-variable, per-day diff 계산
   deviation_pct = (sim_value - median) / median × 100

5. ±20% 초과 항목 fail 표시
   - 시드 N개 평균이 ±20% 안이면 PASS
   - 단일 시드 ±20% 초과는 warning

6. dashboard HTML 생성
   - per-variable trajectory (시뮬 curve vs 문헌 band)
   - heatmap (행: 변수, 열: 시기, 색: deviation %)
   - 회귀 검출 (이전 commit과의 diff)

7. 도메인 전문가 1회 검수 → PASS/FAIL 확정
```

## §5. 검증 산출물 (완료보고서 첨부)

| 파일 | 용도 |
|---|---|
| `reference-truth-report.html` | dashboard (trajectory + heatmap) |
| `reference-truth-report.csv` | 원자료 (변수 × 일자 × deviation) |
| `reference-truth-report.md` | 1쪽 요약 (PASS/FAIL + 우선 검토 항목) |

[02-final-report-template.md](02-final-report-template.md) §6에 첨부 양식.

## §6. 실측 주입 채널 (도메인 전문가 워크플로우)

```
1. 전문가가 현장 측정 CSV 업로드
   - 도구 내 Calibration tab "Upload measurement" 액션, 또는
   - GitHub PR로 reference/measurements/* 추가

2. 시스템이 Reference Truth diff 자동 재계산

3. ±20% 초과 시 dashboard에서 alert

4. 전문가가 4개 액션 중 선택:
   a) 모델 보정 RFC 제출 (packages/tomato-engine 파라미터 조정)
   b) 측정 의심 → 재측정 요청
   c) 표준 범위 갱신 RFC (문헌 vs 실측 합의 갱신)
   d) 무시 (예외 사유 기록 필수)

5. RFC merge → CI 회귀 hash 자동 업데이트 (§7)

6. 분기별 governance board 검토
```

### 6.1 UI — Calibration tab
- "Update reference" 액션 + diff preview + 4 액션 버튼.
- Per-variable trajectory 위에 측정 datapoint overlay (date·source 메타).
- ±20% 초과 셀을 헤더에서 알림 배지로 노출.

상세 화면: [08-entry-and-ux.md](08-entry-and-ux.md) §Calibration tab.

## §7. 회귀 방어선 (V7 결정성과 연동)

도구가 검증 환경으로 신뢰받으려면 "같은 입력 → 같은 출력"이 깨지지 않아야 함.

| 방어선 | 메커니즘 |
|---|---|
| **Frame hash** | 시나리오+시드 → 특정 frame의 RGB+depth+mask hash. CI reference set 보유. |
| **Trajectory hash** | 시뮬레이션 0~120일 final state hash. 빠른 회귀 감지. |
| **Random source 통제** | `Math.random`·`Date.now()`·`crypto.randomUUID()` 직접 호출 금지. architecture spec test로 lint. 모든 random은 seed-passed RNG에서 sampling. |
| **외부 entropy 격리** | 시나리오 시작 시 timestamp·환경변수 픽스. 외부 시간 의존성 제거. |
| **순서 보장** | 시뮬레이션 step은 단일 thread 순차. async 작업의 결정성 보장. |

### 7.1 회귀 감지 워크플로우

```
1. CI: 시나리오 카탈로그의 reference hash bundle 저장
   (reference-hashes/*.json)

2. PR마다 hash diff 자동 비교

3. 깨지면 reviewer가 의도 변경 vs 회귀 판정

4. 의도 변경이면:
   a) RFC 작성
   b) reference hash 업데이트 PR
   c) 비아 PM 승인

5. 회귀면 PR 반려
```

기존 [tests/architecture/tomato-data-index.spec.ts](../../tests/architecture/tomato-data-index.spec.ts) 패턴과 연계.

## §8. Reproducibility Seal (G19)

조건+시드의 hash. 누구나 이 키로 동일 시뮬을 재현할 수 있어야 함.

### 8.1 발급
```
seal = sha256(scenario.id || canonical(scenario) || code_version)
```
- `canonical(scenario)`: 시나리오 JSON을 키 정렬·whitespace 제거한 표준 형식.
- `code_version`: 빌드 시점의 git commit hash.

### 8.2 저장
- 로컬: `seals/<seal>.json` (조건 dump 포함).
- 원격: REST `POST /v1/seals` ([05-wire-protocol.md](05-wire-protocol.md) §5.1).

### 8.3 재현 검증
- `phytosim seal verify <seal>` CLI: 저장된 조건으로 재시뮬 → frame hash 일치 확인.
- CI 통합: 모든 시나리오의 seal이 정상 발급·검증되는지 확인.

### 8.4 첨부 케이스
- PR: "이 시뮬레이션 결과를 재현하려면 seal_abc123 확인"
- 논문: "데이터셋은 seal_abc123 기준"
- 관제 사고 분석: "사고 시점의 가상 모델 상태는 seal_abc123"

## §9. 외주 작업 spec

> Task Card 상세: [03-gap-and-execution-plan.md §3.8](03-gap-and-execution-plan.md#38-task-cards-외주-즉시-작업-가능-단위).

| Task | 산출 | Task Card |
|---|---|---|
| T6 | 결정성 시드 락 + Random source lint | [03 §3.8 T6](03-gap-and-execution-plan.md) |
| T6b | Reproducibility Seal 발급·저장·검증 | [03 §3.8 T6b](03-gap-and-execution-plan.md) |
| T8 | 잎 수 표준 보정 (W16 +27~74% → ±20% 이내) | [03 §3.8 T8](03-gap-and-execution-plan.md) |
| T13 | Reference Truth dashboard (HTML + CSV + MD 자동 생성) | [03 §3.8 T13](03-gap-and-execution-plan.md) |

CI 통합:
- frame hash CI: 시나리오별 reference 보유, PR마다 비교.
- trajectory hash CI: 빠른 회귀 감지.
- Reference Truth diff CI: ±20% 깨지면 PR 차단.

증빙 첨부: [annexes/B-reference-truth/](annexes/B-reference-truth/) — dashboard HTML·CSV·1쪽 요약·literature.json·measurements/ + 도메인 전문가 sign-off.

## §10. 한 줄

> 문헌·실측·합의 3종 소스 → CI 자동 ±20% 검증 → 도메인 전문가 4-액션 워크플로우 → Reproducibility Seal로 영구 재현성 보장. V4 Reference Truth는 이 철도 위에서만 유지 가능.
