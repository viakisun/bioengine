# Phytosim 디지털트윈 모듈 RFP 패키지

**발주자**: 비아 (Via, viasoft.ai) — 적과·적심 로봇 관제 시스템 개발 주체
**대상**: 디지털트윈 모듈 외부 외주사
**대상 도구**: Phytosim · 식물 생장 알고리즘 가상 환경 (Botanical Growth Algorithm Simulation)
**문서 버전**: v1.0
**최종 수정**: 2026-06-06

> 도구 이름 SSOT: [src/modes/brand.ts:18](../../src/modes/brand.ts#L18) — `BRAND.name = 'Phytosim'` · v0.40.0 preview

---

## 1. 본 패키지의 정체

본 폴더는 비아가 적과·적심 로봇 관제 시스템의 핵심 모듈인 **Phytosim 디지털트윈**을 외부 외주사에 발주하기 위한 **RFP(Request for Proposal) 패키지**다. 단순 시각화 외주가 아니라 **결정 검증·데이터 주조·실시간 미러·표준 레퍼런스·통합 허브**의 5가지 가치를 동시 충족하는 도구로서의 정체성을 외주사·컨소시엄·발주자가 공유한다.

## 2. 도구 정체성 — 5개 가치명제 (V1~V5)

| # | 가치명제 | 의미 |
|---|---|---|
| V1 | **Decision Workbench** | 사람·알고리즘이 같은 데이터를 보고 같은 결정을 검증 |
| V2 | **Data Foundry** | 시기·조건·시점 다양한 학습/검증 데이터를 자동 주조 |
| V3 | **Mirror Twin** | 실제 온실 상태와 실시간 동기화, 가상↔실제 비교 |
| V4 | **Reference Truth** | 표준 생육 모델로서 컨소시엄 공통 baseline |
| V5 | **Integration Hub** | 로봇 H/W·인식·작업·관제·운영을 한 환경에 연결 |

5개 모두 충족해야 "스마트팜 로봇 시대의 도구"로 동작한다.

## 3. 도구 구조 — 3 모드 + 공통 인프라

- **Workbench Mode** (V1·V4) — 단일 작물·구역 + 시간 슬라이더 + 의사결정·H/W·calibration 검증
- **Foundry Mode** (V2) — 헤드리스 배치로 학습/검증 데이터 주조
- **Twin Mode** (V3·V5) — 실시간 미러 + 비아 관제 임베드 + 다구역 표시

공통 인프라: Crop SSOT · Greenhouse SSOT · Scenario Library · Camera Manager · Robot Model Library · Decision/Label · External API (WS+REST) · Reference Truth Diff · Determinism (seed).

## 4. 청자별 진입 가이드

| 청자 | 권장 진입 순서 |
|---|---|
| 투자자·심사·발표 | (1) 본 README §2 §3 → (2) [01-statement-of-work.md](01-statement-of-work.md) §1~§4 + Diagram 1·2 |
| 비아 PM·발주자·컨소시엄 리더 | (1) 본 README 전체 → (2) [01-statement-of-work.md](01-statement-of-work.md) (§0 가이드라인·marker 점검 포함) → (3) [03-gap-and-execution-plan.md](03-gap-and-execution-plan.md) → (4) [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) |
| 외주사 견적·제안 | (1) 본 README → (2) [01-statement-of-work.md](01-statement-of-work.md) (§0 marker 확인) → (3) [03-gap-and-execution-plan.md](03-gap-and-execution-plan.md) **§3.8 Task Card** → (4) [04-scenario-catalog.md](04-scenario-catalog.md) |
| 외주 엔지니어 (작업 spec) | (1) **[03 §3.8 Task Cards](03-gap-and-execution-plan.md)** (담당 Task 카드 우선) → (2) [04-scenario-catalog.md](04-scenario-catalog.md) · [05-wire-protocol.md](05-wire-protocol.md) · [06-reference-truth-railway.md](06-reference-truth-railway.md) · [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md) · [08-entry-and-ux.md](08-entry-and-ux.md) |
| 도메인 전문가 (농생물·calibration) | [06-reference-truth-railway.md](06-reference-truth-railway.md) · [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §실측 주입 · [annexes/B-reference-truth/](annexes/B-reference-truth/) |
| 비아 관제·통합 엔지니어 | [05-wire-protocol.md](05-wire-protocol.md) · [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §SSO·권한 · [annexes/D-twin-embed/](annexes/D-twin-embed/) |
| 검수자 (S7~S8) | [02-final-report-template.md](02-final-report-template.md) (§15 Annex 인덱스 포함) · [annexes/](annexes/) A~F 폴더 · [03-gap-and-execution-plan.md](03-gap-and-execution-plan.md) §8 검증 객관성 |

## 5. 파일 목록

| 파일 | 역할 | 청자 |
|---|---|---|
| [README.md](README.md) | 패키지 index · 청자별 진입 · 도구 정체성 | 모두 |
| [01-statement-of-work.md](01-statement-of-work.md) | 과업지시서 (SoW) · **§0 작성 가이드라인 + 미확정 marker + 3 SVG** | 외주사 · PM |
| [02-final-report-template.md](02-final-report-template.md) | 완료보고서 양식 (검수용) · **§15 Annex 인덱스 + 스크린샷 placeholder** | 외주사 · PM · 검수자 |
| [03-gap-and-execution-plan.md](03-gap-and-execution-plan.md) | 사내 자산 Gap + 실행 트랙 + 위험·MVP · **§3.8 Task Cards 28개 + §3.9 DoD + §3.10 Standup 양식** | 외주사 · PM · 외주 엔지니어 |
| [04-scenario-catalog.md](04-scenario-catalog.md) | 시나리오 1급 객체 + Composer + 초기 카탈로그 | 외주 엔지니어 · 도메인 |
| [scenarios/](scenarios/) | 시나리오 샘플 `.scenario.jsonc` (5종) | 외주 엔지니어 |
| [05-wire-protocol.md](05-wire-protocol.md) | Mirror Twin 와이어 프로토콜 (WS/REST 토픽·메시지·보안) | 외주 백엔드 · 관제 통합 |
| [06-reference-truth-railway.md](06-reference-truth-railway.md) | Reference Truth 자동 검증 + 실측 주입 채널 | 도메인 전문가 · 외주 |
| [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md) | 배치 매트릭스 + 라벨 스키마 + COCO export | 외주 데이터 · 인식 알고리즘 |
| [08-entry-and-ux.md](08-entry-and-ux.md) | 진입 아키텍처 L0~L4 + UX/UI 원칙 + 와이어프레임 + 사용자 여정 | 외주 디자이너 · UI 개발 |
| [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) | 라이프사이클·KPI·거버넌스·Anti-pattern·SSO·Maintainership·결정성·실측 | PM · 도메인 · 통합 |
| [annexes/](annexes/) | **별도 첨부문서 (외주 인수 시 채움)** — A 스크린샷·B Reference Truth·C COCO·D Twin Embed·E Licenses·F Handover | 외주사·검수자 |

### 5.1 문서 보강 안내 (v1.0 → v1.x)

본 RFP 패키지는 다음 4개 트랙으로 보강 완료:
- **Track A**: 03에 Task Card 28개 + DoD + Standup 양식
- **Track B**: 02에 스크린샷 placeholder 12곳 + annexes/A~F 폴더 (각 폴더 README 채움 가이드 포함)
- **Track C**: 01에 §0 작성 가이드라인 박스 + 미확정 marker 4종 + 3 SVG 다이어그램 + §17 예산 + §18 다음 단계
- **Track D**: 본 README + 04~09 cross-link + marker 동기 + plan v1.0 cross-ref

### 5.2 사내 구현 진행 상태 (S1~S8 + D0~D11)

| 슬라이스 | 결과 | 가시 확인 |
|---|---|---|
| S1 mvp shell | ✅ | Splash + 5 가치명제 + 모드 카드 |
| S2 시나리오 1급 + Composer | ✅ | 20종 카탈로그 + 5 dial + Save/Fork |
| S3 Reference Truth | ✅ mvp | Calibration tab + 9 변수 trajectory + heatmap (더미 sample) |
| S4 Robot + Camera | ✅ mvp | RobotPlaceholder SVG + CameraDock 1~9 + **D11 BabylonEngine 실 카메라 전환** |
| S5 Foundry | ✅ mvp | Matrix Setup + **D6 mvp 실 canvas 10 frame 캡처** |
| S6 Twin | ✅ mvp | Zone heatmap + WireStatus + KPI + **D8 activeBeds 강조** |
| S7 검수 | ✅ | 02 §1~§15 채움 + annexes E·F |
| S8 docs 통합 | ✅ | 8091 docsify + Splash 링크 + Foundry/Twin 뒤로가기 |
| **D0 기반·진단** | ✅ | **usePlantPlayback hook + phytosim.css 글로벌 + scenario→twinStore 동기 + TimelineBar↔store** |
| **D1 TaskPanel** | ✅ | Workbench 우측에 시나리오 도메인·task·verify 표시 (15 시나리오 자동 커버) |
| **D5 Foundry Picker** | ✅ | 진입 시 Picker → scenario.foundry.matrix 자동 채움 |
| **D8 Twin Picker** | ✅ | 진입 시 Picker → scenario.world.activeBeds 강조 |
| **D11 CameraDock 실 전환** | ✅ | CameraDock 1~9 클릭/단축키 → BabylonEngine ArcRotateCamera 9 preset |
| **EE 산업 사양 보강** | ✅ | EE 카메라 = 베드 정면 튜브레일 + 25cm + 작물 다 보이게 + 파라미터 슬라이더 UI · ArcRotateCamera β limit 동적 확장 |
| **Wave 1.a (V1 부분)** | ✅ | Calibration tab — GrowthEngine 실 호출 (heightCm·N·LAI·fruit diameter·ripeStage) + 동적 simulatedSamples + 컴퓨팅 상태 헤더 |
| **Wave 1.d (task targets)** | ✅ | `src/scenarios/taskTargets.ts` — `truss==3 && (diameterMm<12 \|\| occlusion>0.4)` 같은 expression을 안전한 자체 파서 (eval 없음) |
| **Wave 1.e·f (metric 자동 측정)** | ✅ | `src/scenarios/metrics.ts` mvp 10종 + TaskPanel에 현재값 + PASS/FAIL 칩 (녹·적·회) · day 변화 시 실시간 재측정 |
| **Wave 1.g (Playwright 회귀)** | ✅ | `tests/architecture/_probe-scenario-20.spec.ts` — 20 시나리오 자동 회귀 spec (mode 진입·Picker 클릭·screenshot) |
| **Wave 2.e·f (Robot 신규 mesh)** | ✅ | `src/scene/robot/Robot.ts` 신규 — Babylon 9 PBR 스타일 AGV chassis + 6DOF arm + gripper/cutter swap. BabylonEngine boot 시 통로 자동 마운트 (z=-0.8 · y=0.3 · x=0). LED 인디케이터 + 4 wheel + 산업 표준 오렌지 effector |
| Wave 2.a·b·c·d (mesh outline·highlight·occlusion) | ⚠ cuttable | TaskPanel 텍스트 표시는 ✅, BabylonEngine mesh outline은 V2 evolution |
| Wave 2.g·h (mask shader) | ⚠ Wave 3과 통합 | COCO writer + mask + depth 동시 다운로드는 Wave 3에서 |

**V2 evolution 후보 (cuttable)**: Reference Truth growth-calibration 실 호출 · Twin 실 WS+REST 서버 · Foundry 실 Playwright worker pool + COCO writer + mask shader · Playwright probe spec 자동 회귀 · annexes A/B/C/D 실 캡처 · Calibration 4-액션 실 구현.

### 5.2 작성 규약 (01 §0 가이드라인 요약)

본 RFP 패키지 전반에 적용되는 작성 규약. 상세: [01-statement-of-work.md §0](01-statement-of-work.md#§0-작성-가이드라인-문서-내부-규약).

- **표**: 5행 이상 비교·매트릭스·매핑은 모두 표.
- **SVG (inline)**: 구조·계층·플로우 다이어그램은 inline `<svg>...</svg>`.
- **미확정 marker (4종)**: `[TBD]` · `[발주 전 협의]` · `[입찰 후 확정]` · `[Phase 0 산출]` — grep 가능하도록 일관 표기.

## 6. 발주자 사전 자산 (외주에 무상 제공)

- **Crop SSOT**: [packages/tomato-engine/](../../packages/tomato-engine/) — TOMSIM/TOMGRO 기반 토마토 생장 엔진
- **Greenhouse SSOT**: [src/scene/greenhouse/](../../src/scene/greenhouse/) — 온실 골조·베드·레일·유인줄·환경
- **Calibration Reference Pack v0.1**: 문헌 기반 표준 생육 범위
- **Archive 코드** (Robot·FOV cone·zone UI): [src/_archive/](../../src/_archive/) — 복원 가이드 제공
- **캡처 인프라**: [`_capture.mjs`](../../_capture.mjs) · `tests/architecture/_probe-*.spec.ts` — Foundry 출발점
- **아키텍처 docs**: [docs/architecture/](../architecture/), [docs/stage-by-stage.md](../stage-by-stage.md)

## 7. 사업 사이클 (발주 → 인수)

S1 발주 준비 → S2 입찰 공고 → S3 평가·시연 → S4 계약 → S5 착수 → S6 개발 (MS1~MS5) → S7 검수 → S8 인수 (90일 워런티 + 4주 페어 + 워크숍) → S9 운영 (비아 내부 owner) → S10 V2 옵션. 상세: [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §S 발주 사이클.

## 8. 외주사 평가 (100점)

도메인 이해도 15 · Babylon.js 실적 15 · 시뮬레이션 10 · 백엔드·관제 10 · 데이터 5 · 본 plan 이해 15 · 일정·예산 10 · 팀 구성 10 · 유지보수 5 · 보안·IP 5. Short-list 70점 이상. 상세: [01-statement-of-work.md](01-statement-of-work.md) §10.

## 9. plan SSOT

본 패키지는 [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) 의 plan v1.0을 청자별로 분리·재구성한 것이다. plan 갱신 시 본 패키지도 갱신한다 (§갱신 절차는 [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §plan 메타 참조).

## 10. 한 줄

> Phytosim은 "예쁜 가상 온실"이 아니라 **결정·데이터·미러·레퍼런스·허브**의 5가지 가치를 동시 충족해야 스마트팜 로봇 시대에 손에 들리는 도구가 된다. 본 RFP 패키지가 그 골격을 외주 발주 즉시 가능한 수준으로 정의한다.
