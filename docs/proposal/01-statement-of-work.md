# 01. Statement of Work — 과업지시서

**문서 분류**: 산출물 (a) · 외주 계약 부속 RFP 본문 · **발주 전 초안**
**대상 도구**: Phytosim · 식물 생장 알고리즘 가상 환경
**문서 버전**: v1.0 (발주 전)
**발주자**: 비아 (viasoft.ai)
**근거 plan**: [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) §6

---

## §0. 작성 가이드라인 (문서 내부 규약)

> **본 문서는 발주 전 RFP 초안**이다. 일부 항목은 외주사 후보와의 협의 또는 입찰 후 결정될 영역으로 marker 표시한다. 본 §0은 문서를 읽고 작성·수정하는 모든 청자가 따라야 할 규약이다.

### 0.1 표기 규약

| 표기 형식 | 사용 시점 |
|---|---|
| **표** | 5행 이상 비교·매트릭스·매핑은 모두 표 |
| **SVG (inline)** | 구조·계층·플로우·아키텍처 다이어그램은 inline `<svg>...</svg>` |
| **코드블록 ASCII** | 와이어프레임은 코드블록 ASCII 허용 |
| **링크** | 다른 RFP 문서 참조는 markdown relative link |

### 0.2 미확정 marker (4종)

| Marker | 의미 | 해소 시점 | 책임자 |
|---|---|---|---|
| `[TBD]` | 결정 미완 (아직 누구도 책임지지 않음) | 발주 전 비아 내부 | 비아 PM |
| `[발주 전 협의]` | 외주사 후보 Q&A로 명확화 | 입찰 공고~평가 | 비아 PM + 후보 외주사 |
| `[입찰 후 확정]` | 계약 시점에 채움 | S4 계약 단계 | 비아 임원진 |
| `[Phase 0 산출]` | 착수 후 2주 안에 외주가 정함 | Phase 0 마일스톤 | 외주사 + 비아 PM |

모든 marker는 grep 가능하도록 일관 표기 — 작업 마지막에 다음 명령으로 검증:

```bash
grep -n '\[TBD\]\|\[발주 전 협의\]\|\[입찰 후 확정\]\|\[Phase 0 산출\]' docs/proposal/01-statement-of-work.md
```

### 0.3 청자별 우선 진입

| 청자 | 우선 읽을 섹션 |
|---|---|
| 외주사 견적자 | §1~§5 + §12 + §14 |
| 비아 PM | 전체 + §0 marker 점검 |
| 도메인 전문가 | §3~§4 + §7 V1 + §13 |
| 비아 관제팀 | §5.5 + §9 + V4 |
| 컨소시엄 파트너 | §3 + §10 |

### 0.4 발주 전 권장안 면책

본 문서의 표·SVG·일정·예산 범위는 **발주 전 권장안**이며, 외주사 협의 및 컨소시엄 합의에 따라 조정될 수 있다. 확정 사항이 아닌 항목은 모두 §0.2 marker로 표시.

---

## §1. 사업명

적과·적심 로봇 관제 연계를 위한 토마토 스마트팜 디지털트윈 모듈(Phytosim) 개발

## §2. 발주 배경

적과·적심·방제는 토마토 생육 단계에 따라 작업 대상·접근 자세·시야 조건·의사결정 기준이 모두 변하는 고난도 농작업이다. 비아의 적과·적심 로봇 관제 시스템이 작물·환경·로봇 상태를 통합적으로 인지·제어하기 위해서는 실제 온실을 거울처럼 반영하는 **3차원 디지털트윈**이 필수다. 실제 온실 실증만으로는 (a) 생육 단계 반복 불가, (b) 환경 조건 재현성 결여, (c) 작물 손상 리스크, (d) 데이터 수집 비용의 4가지 한계가 있어, 본 과업으로 가상 검증 환경을 구축한다.

## §3. 도구 정체성

### 3.1 5개 가치명제 (V1~V5)

| # | 가치명제 | 의미 |
|---|---|---|
| V1 | **Decision Workbench** | 사람·알고리즘이 같은 데이터를 보고 같은 결정을 검증 |
| V2 | **Data Foundry** | 시기·조건·시점 다양한 학습/검증 데이터를 자동 주조 |
| V3 | **Mirror Twin** | 실제 온실 상태와 실시간 동기, 가상↔실제 비교 |
| V4 | **Reference Truth** | 표준 생육 모델로서 컨소시엄 공통 baseline |
| V5 | **Integration Hub** | 로봇 H/W·인식·작업·관제·운영을 한 환경에 연결 |

본 외주의 검수는 위 5개 가치명제 충족 여부로 한다 (§§ 7 검증 기준 + [02-final-report-template.md](02-final-report-template.md)).

**Diagram 1 — 5 가치명제 × 3 모드 매핑**

<svg width="720" height="320" viewBox="0 0 720 320" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="13">
  <style>
    .value { fill:#eef5ff; stroke:#2c6cdf; stroke-width:1.5; }
    .mode { fill:#fff7e8; stroke:#d6831e; stroke-width:1.5; }
    .line { stroke:#888; stroke-width:1.2; fill:none; }
    .label { fill:#222; }
    .strong { font-weight:bold; }
  </style>

  <!-- V1~V5 (left) -->
  <rect class="value" x="20"  y="20"  width="160" height="44" rx="6"/>
  <text class="label strong" x="100" y="42" text-anchor="middle">V1 Workbench</text>
  <text class="label" x="100" y="58" text-anchor="middle">결정 검증</text>

  <rect class="value" x="20"  y="80"  width="160" height="44" rx="6"/>
  <text class="label strong" x="100" y="102" text-anchor="middle">V2 Foundry</text>
  <text class="label" x="100" y="118" text-anchor="middle">데이터 주조</text>

  <rect class="value" x="20"  y="140" width="160" height="44" rx="6"/>
  <text class="label strong" x="100" y="162" text-anchor="middle">V3 Mirror Twin</text>
  <text class="label" x="100" y="178" text-anchor="middle">실시간 미러</text>

  <rect class="value" x="20"  y="200" width="160" height="44" rx="6"/>
  <text class="label strong" x="100" y="222" text-anchor="middle">V4 Reference</text>
  <text class="label" x="100" y="238" text-anchor="middle">표준 레퍼런스</text>

  <rect class="value" x="20"  y="260" width="160" height="44" rx="6"/>
  <text class="label strong" x="100" y="282" text-anchor="middle">V5 Integration</text>
  <text class="label" x="100" y="298" text-anchor="middle">통합 허브</text>

  <!-- 3 modes (right) -->
  <rect class="mode" x="500" y="40"  width="200" height="60" rx="6"/>
  <text class="label strong" x="600" y="65" text-anchor="middle">Workbench Mode</text>
  <text class="label" x="600" y="84" text-anchor="middle">정지/시간 슬라이더/검증</text>

  <rect class="mode" x="500" y="130" width="200" height="60" rx="6"/>
  <text class="label strong" x="600" y="155" text-anchor="middle">Foundry Mode</text>
  <text class="label" x="600" y="174" text-anchor="middle">헤드리스/배치/COCO</text>

  <rect class="mode" x="500" y="220" width="200" height="60" rx="6"/>
  <text class="label strong" x="600" y="245" text-anchor="middle">Twin Mode</text>
  <text class="label" x="600" y="264" text-anchor="middle">실시간/임베드/관제</text>

  <!-- Mapping lines -->
  <!-- V1 -> Workbench -->
  <path class="line" d="M 180 42 L 500 60"/>
  <!-- V4 -> Workbench -->
  <path class="line" d="M 180 222 L 500 75"/>
  <!-- V2 -> Foundry -->
  <path class="line" d="M 180 102 L 500 160"/>
  <!-- V3 -> Twin -->
  <path class="line" d="M 180 162 L 500 240"/>
  <!-- V5 -> Twin -->
  <path class="line" d="M 180 282 L 500 260"/>

  <text x="360" y="14" text-anchor="middle" font-size="11" fill="#666">5 가치명제 ↔ 3 모드 매핑 (V5는 전 모드에 흩어짐, 대표선만 표시)</text>
</svg>

### 3.2 3 모드 + 공통 인프라

| 모드 | 충족 가치 | 목적 |
|---|---|---|
| **Workbench** | V1, V4 | 단일 작물·구역 + 시간 슬라이더 + 의사결정/H/W/calibration 검증 |
| **Foundry** | V2 | 헤드리스 배치로 학습/검증 데이터 주조 |
| **Twin** | V3, V5 | 실시간 미러 + 비아 관제 임베드 + 다구역 동시 표시 |

공통 인프라 (모드 비종속, 단일 SSOT): Crop SSOT · Greenhouse SSOT · Scenario Library · Camera Manager · Robot Model Library · Decision/Label · External API · Reference Truth Diff · Determinism (seed). 상세: [08-entry-and-ux.md](08-entry-and-ux.md), [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md).

**Diagram 2 — 3 모드 + 공통 인프라 계층도**

<svg width="720" height="360" viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12">
  <style>
    .mode { fill:#fff7e8; stroke:#d6831e; stroke-width:1.5; }
    .infra { fill:#e8f4ed; stroke:#2a7a4e; stroke-width:1.3; }
    .label { fill:#222; }
    .strong { font-weight:bold; }
    .arrow { stroke:#888; stroke-width:1.2; fill:none; marker-end:url(#arr); }
  </style>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L6,4 L0,8 Z" fill="#888"/>
    </marker>
  </defs>

  <!-- Top: 3 modes -->
  <text x="360" y="20" text-anchor="middle" font-size="13" class="strong">3 Modes (사용자 진입점)</text>
  <rect class="mode" x="60"  y="35" width="180" height="56" rx="6"/>
  <text class="label strong" x="150" y="58" text-anchor="middle">Workbench</text>
  <text class="label" x="150" y="76" text-anchor="middle">V1 · V4</text>

  <rect class="mode" x="270" y="35" width="180" height="56" rx="6"/>
  <text class="label strong" x="360" y="58" text-anchor="middle">Foundry</text>
  <text class="label" x="360" y="76" text-anchor="middle">V2</text>

  <rect class="mode" x="480" y="35" width="180" height="56" rx="6"/>
  <text class="label strong" x="570" y="58" text-anchor="middle">Twin</text>
  <text class="label" x="570" y="76" text-anchor="middle">V3 · V5</text>

  <!-- Arrows from modes to infra -->
  <path class="arrow" d="M 150 91 L 150 140"/>
  <path class="arrow" d="M 360 91 L 360 140"/>
  <path class="arrow" d="M 570 91 L 570 140"/>

  <!-- Middle: Common Infrastructure label -->
  <text x="360" y="135" text-anchor="middle" font-size="13" class="strong">공통 인프라 (모드 비종속, 단일 SSOT)</text>

  <!-- Infra modules (3 rows × 3 cols) -->
  <rect class="infra" x="40"  y="155" width="200" height="44" rx="6"/>
  <text class="label" x="140" y="180" text-anchor="middle">Crop SSOT (tomato-engine)</text>

  <rect class="infra" x="260" y="155" width="200" height="44" rx="6"/>
  <text class="label" x="360" y="180" text-anchor="middle">Greenhouse SSOT</text>

  <rect class="infra" x="480" y="155" width="200" height="44" rx="6"/>
  <text class="label" x="580" y="180" text-anchor="middle">Scenario Library + Composer</text>

  <rect class="infra" x="40"  y="210" width="200" height="44" rx="6"/>
  <text class="label" x="140" y="235" text-anchor="middle">Camera Manager (FOV/RGB-D/mask)</text>

  <rect class="infra" x="260" y="210" width="200" height="44" rx="6"/>
  <text class="label" x="360" y="235" text-anchor="middle">Robot Model Library (URDF)</text>

  <rect class="infra" x="480" y="210" width="200" height="44" rx="6"/>
  <text class="label" x="580" y="235" text-anchor="middle">Decision/Label System</text>

  <rect class="infra" x="40"  y="265" width="200" height="44" rx="6"/>
  <text class="label" x="140" y="290" text-anchor="middle">External API (WS+REST)</text>

  <rect class="infra" x="260" y="265" width="200" height="44" rx="6"/>
  <text class="label" x="360" y="290" text-anchor="middle">Reference Truth Diff</text>

  <rect class="infra" x="480" y="265" width="200" height="44" rx="6"/>
  <text class="label" x="580" y="290" text-anchor="middle">Determinism (seed lock + Seal)</text>

  <text x="360" y="340" text-anchor="middle" font-size="11" fill="#666">모드별 코드 분기 금지 — 모든 모드가 동일 SSOT를 호출</text>
</svg>

## §4. 활용 시나리오 (3차원 데이터의 필요성)

### 4.1 왜 3D인가
적과·적심은 **수직 공간 의사결정**이다. 작업 대상(과실·생장점·곁순)의 높이·기울기·가림 여부가 본질적으로 3차원이며, 2D 평면 관제로는 다음을 표현할 수 없다.

| 정보 | 3D만 가능한 이유 |
|---|---|
| 화방 높이 분포 | 매니퓰레이터 도달 가능성 |
| 잎-과실 가림 | 시야 방향·거리 종속, 평면 도식 불가 |
| 로봇 자세 vs 작물 자세 | end-effector와 줄기 angle 상호 위치 |
| 통로 통과 가능성 | 잎 침범 정도와 로봇 폭 관계 |
| 시간대 조명 영향 | 햇빛 방향 → 그림자·역광 → 인식 신뢰도 |
| 카메라 FOV 시뮬레이션 | frustum이 작물의 어느 부분을 포함 |

### 4.2 시나리오 그룹 A — 자율주행 (시기별)
- **초기 (D0~D30)**: 작물 짧음, 다음 모종 이동 정확도
- **중기 (D30~D70)**: 화방 출현, 카메라-작물 거리 변화
- **후기 (D70~D120)**: 잎 밀도 최대, 줄기 통로 침범, leaf brushing

### 4.3 시나리오 그룹 B — 적과·적심·방제 의사결정 (시기별)
- **적과 (~D50~)**: 화방 내 과실 중 어떤 것을 제거할 것인가
- **적심 (~D80~)**: 생장점 절단 시기
- **곁순 제거 (전 시기)**: 어느 곁순을 제거할 것인가
- **방제 (전 시기)**: 살포 위험 구역 식별

### 4.4 시나리오 그룹 C — 모드별
| 모드 | 카메라 구성 |
|---|---|
| Workbench (정지 검증) | RGB 헤드 + RGB end-effector + depth end-effector |
| Twin (레일 주행) | RGB 전방 + RGB 측면 + top-down |
| Twin (다구역 관제) | 자유 시점 + zone heatmap overlay |

상세 카탈로그: [04-scenario-catalog.md](04-scenario-catalog.md). Foundry 인식 도메인: [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md).

### 4.5 시나리오 진입 시 정교 컨트롤 (Scenario Composer)

시나리오는 불변 템플릿, **Composer (L3.5)**는 그 위에서 25개 조건 dial로 fine-tune. 결과를 새 시나리오로 저장·fork·diff·재현 키 발급 가능. 사용자별 `My Scenarios` 네임스페이스 + 공식 카탈로그 승격 절차. 상세: [04-scenario-catalog.md](04-scenario-catalog.md) §Composer, [08-entry-and-ux.md](08-entry-and-ux.md) §L3.5.

## §5. 과업 범위

### 5.1 작물 모델 (C)
- C1 생육 단계별 형상 (초장·마디·절간·줄기굵기/각도) 시간 함수
- C2 화방 발생·기하학·과실 배치 (peduncle/rachis/pedicel 3층)
- C3 과실: 직경 Gompertz · 색 6단계 · 무게 · 개별 형질
- C4 잎: 발생/확장/노화/탈락 · LAI · **잎-과실 광학 가림 시뮬레이션**
- C5 곁순: 발생·정점지배·적심 상태 (`pruned`)
- C6 줄기 굽힘: 과실 질량 → bending moment

### 5.2 환경 모델 (E)
- E1 온실 골조 (실 K-smartfarm 규격)
- E2 다중 베드 배열 (≥10 베드, 통로 폭, 행간)
- E3 유인 구조 (와이어·twine)
- E4 레일 (Ø48.3mm급, gauge, hairpin)
- E5 기질 (코코피트 등)
- E6 환경 동역학: 시간대 태양 · 그림자 · 역광 · 바람·잎 흔들림
- E7 외부 API로 환경 변수 변경 가능 (시간/바람/조도)

### 5.3 로봇 모델 (R)
- R1 레일 위 AGV chassis
- R2 6DOF 매니퓰레이터 (또는 발주자 지정 자유도)
- R3 End-effector: 적과 그리퍼 + 적심 절단기 (교체 가능)
- R4 RGB-D 센서 (헤드 + end-effector)
- R5 카메라 frustum 시각화 (FOV cone, near/far)
- R6 다중 시점 카메라 매니저
- R7 단순 forward kinematics + 충돌 박스 (rough 허용)

### 5.4 시나리오 엔진 (T)
- T1 시기별 시나리오 카탈로그 (그룹 A/B/C)
- T2 작업 대상 식별 (화방별 과실 / 생장점 / 곁순)
- T3 작업 가능/불가 판단 (가림·도달·자세)
- T4 작업 실행 시 식물 상태 동기 (`pruned`·과실 제거)
- T5 작업 이력 로그 (시각·대상·결과·좌표)
- T6 **Scenario Composer**: 25개 조건 dial + Lock/Variable + Save/Fork/Diff + Reproducibility Seal

### 5.5 관제 연계 (M) — 비아 관제 통합
- M1 양방향 인터페이스: WebSocket (실시간) + REST (히스토리)
- M2 zone 단위 상태 노출: 생육 단계 · 작업 가능 · 잎 밀도 · 가림 · 작업 난이도
- M3 표준 생육 대비 이상 구역 식별
- M4 가상-실제 작업 이력 비교 API
- M5 관제 대시보드 임베드용 web component
- 상세 스키마: [05-wire-protocol.md](05-wire-protocol.md)
- SSO·권한: [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §SSO

### 5.6 합성 데이터 (D)
- D1 RGB / depth / segmentation mask / 2D & 3D bbox 동시 캡처
- D2 객체 라벨: 생장점, 주줄기, 곁순, 화방, 개별 과실, 잎, 절단 위치, 작업 금지 영역
- D3 가림(occlusion) 라벨 (노출도 0~1)
- D4 조건 조합 자동 변화 매트릭스
- D5 표준 포맷 export: COCO JSON 필수, YOLO/Pascal-VOC 옵션
- D6 배치 파이프라인 (단일 명령 → 수천~수만 장)
- 상세: [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md)

### 5.7 진입·UX (U)
- U1 L0~L4 진입 아키텍처 (Launcher · Identity · Mode · Scenario · Composer · Workspace)
- U2 UX/UI 8원칙 + 핵심 화면 와이어프레임 + 페르소나별 여정
- U3 핵심 UI 컴포넌트: TimelineBar · CameraDock · ValueChip · PassFailChip · RefDiffPanel · ZoneHeatmap · WireStatus · ScenarioCard
- 상세: [08-entry-and-ux.md](08-entry-and-ux.md)

### 5.8 검증·표준 (S)
- S1 Reference Truth 자동 검증 (문헌 ±20%)
- S2 실측 주입 채널 (도메인 전문가 워크플로우)
- S3 결정성 회귀 방어선 (frame hash · trajectory hash)
- 상세: [06-reference-truth-railway.md](06-reference-truth-railway.md), [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §결정성

## §6. 가치명제별 충족 요건 (모드 × 인프라 매핑)

| 가치명제 | 필수 모드 | 필수 인프라 | 검증 |
|---|---|---|---|
| V1 Decision Workbench | Workbench | Scenario, Camera, Robot, Decision, Determinism | V1·V3·V6·V7 |
| V2 Data Foundry | Foundry | Scenario, Camera, Label, Determinism | V5·V7 |
| V3 Mirror Twin | Twin | External API, Scenario | V4 |
| V4 Reference Truth | Workbench (Calibration tab) | Reference Truth Diff, 실측 채널 | V1 |
| V5 Integration Hub | 전 모드 | External API, Robot Model Library, SSO | V4·V8 |

## §7. 검증 기준 (V1~V8)

| ID | 항목 | 기준 | 검증 주체 |
|---|---|---|---|
| V1 | Crop 표준 | 문헌 ±20% 자동 검증 PASS | 외주 자체 80% + 도메인 전문가 20% |
| V2 | 환경 규격 | 실 K-smartfarm 규격 부합 보고서 | 외주 자체 |
| V3 | 시나리오 통과 | §초기 카탈로그 12종 이상 PASS | 외주 70% + 비아 PM 30% |
| V4 | 관제 API | zone polling ≤1초 · WS 재연결 동작 | **비아 관제팀 (제3자)** |
| V5 | 합성 데이터 | COCO 파서 무오류, 단일 시드 ≥10k frames | 외주 + 외부 파서 |
| V6 | 모드 전환 | ≤1초 | 외주 자체 |
| V7 | 결정성 | 동일 시드 → 동일 frame hash | CI 자동 + PM 검수 |
| V8 | UX 도달 | 신규 사용자 5분 안에 가치 이해 | **비아 사용자 테스트 (제3자)** |

자기검증 vs 제3자 비율 상세: [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §검증 객관성.

## §8. 산출물 (Deliverables)

| ID | 산출물 | 형식 |
|---|---|---|
| D1 | 실행 가능 빌드 | web/desktop |
| D2 | SoW 최종판 | 본 문서 V1.x |
| D3 | 시나리오 카탈로그 | `.scenario.jsonc` × ≥20개 + [04-scenario-catalog.md](04-scenario-catalog.md) |
| D4 | 와이어 프로토콜 명세서 | [05-wire-protocol.md](05-wire-protocol.md) 최종판 |
| D5 | Reference Truth 검증 보고 | dashboard HTML + CSV + 1쪽 요약 |
| D6 | Foundry 매뉴얼 + 라벨 스키마 | [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md) 최종판 + COCO 샘플 |
| D7 | 완료보고서 + Annexes | [02-final-report-template.md](02-final-report-template.md) 채워서 제출 + [annexes/A-screenshots/](annexes/) · B-reference-truth/ · C-coco-samples/ · D-twin-embed/ · E-licenses/ · F-handover/ 6개 폴더 모두 채움 |
| D8 | 소스 코드 (권리 비아 귀속) | git repo + 인수 산출물 (architecture·runbook·onboarding docs → [annexes/F-handover/](annexes/F-handover/)) |

## §9. 비아 관제 통합 방식

1. 관제 화면 내 3D 뷰 영역에 Phytosim Twin을 **web component**로 임베드 ([05-wire-protocol.md](05-wire-protocol.md) §M5).
2. 실제 로봇/현장 센서 데이터를 **WebSocket push**로 가상에 반영 → 가상-실제 동기화.
3. 관제 의사결정 모듈이 **REST**로 zone 상태 polling → 작업 우선순위 결정.
4. **Foundry 합성 데이터**로 인식 모델 사전 학습, 실제 데이터로 fine-tune.
5. SSO/권한: 비아 관제 OIDC IdP 신뢰, 5개 역할 (`viewer`/`operator`/`engineer`/`expert`/`admin`).

## §10. 컨소시엄 기여 방식

> 파트너 명단은 발주 전 비아 내부 결정 — `[TBD]` 표시.

| 파트너 역할 | 파트너명 | Phytosim 제공 | 환류 |
|---|---|---|---|
| 로봇 H/W | [TBD] | Workbench 매니퓰레이터·카메라 사전 검증 | H/W 설계 반영 |
| 인식 알고리즘 | [TBD] | Foundry 합성 데이터셋, mask GT | 모델 정확도 |
| 농생물 | [TBD] | Reference Truth diff dashboard | 모델 보정 |
| 운영·실증 | [TBD] | Twin 시나리오 기반 SOP | 운영 절차 |
| 발주자(비아) | viasoft.ai | 관제 임베드, zone 의사결정 baseline | 관제 UX |

본 디지털트윈은 컨소시엄 산출물 중 **시간 변수를 직접 제어할 수 있는 유일한 검증 환경**이며, 다른 파트너 결과물을 사전 검증·환류시키는 허브 역할을 한다.

## §11. 발주자 사전 자산 (외주에 무상 제공)

| 자산 | 경로 | 용도 |
|---|---|---|
| Crop SSOT (TOMSIM/TOMGRO 기반) | [packages/tomato-engine/](../../packages/tomato-engine/) | C1~C6 출발점, 재작성 회피 |
| Greenhouse SSOT | [src/scene/greenhouse/](../../src/scene/greenhouse/) | E1~E5 출발점 |
| Archive Robot/FOV/UI | [src/_archive/](../../src/_archive/) | R1~R5·M5 복원 출발점 |
| Calibration Reference Pack v0.1 | (`reference/literature.json` 후보) | S1 Reference Truth 시드 |
| 캡처 인프라 | [`_capture.mjs`](../../_capture.mjs) · `tests/architecture/_probe-*.spec.ts` | D1·D6 시작점 |
| brand SSOT | [src/modes/brand.ts](../../src/modes/brand.ts) | 도구 명명 단일 소스 |
| 아키텍처·calibration docs | [docs/architecture/](../architecture/), [docs/stage-by-stage.md](../stage-by-stage.md), [docs/growth-gap-analysis.md](../growth-gap-analysis.md) | 도메인 이해 |
| 본 RFP plan SSOT | [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) | 전체 정합성 |

## §12. 외주사 선정 + 입찰 평가표 (100점)

### 12.1 적합 외주사 프로필
- 3D 그래픽 역량 (Babylon.js 또는 동급, 실시간 렌더링·PBR·shader·RTT)
- 시뮬레이션 도메인 이해 (procedural 생장 / 농업·자연 모델링 경험 가산)
- 백엔드·관제 통합 (WebSocket·OIDC·REST·embed)
- 데이터 파이프라인 (배치 캡처·COCO·segmentation)
- 유지보수 마인드 (docs·architecture·spec test 작성 경험)

### 12.2 입찰 평가표

| 항목 | 배점 | 평가 방법 |
|---|---|---|
| 도메인 이해도 (식물·스마트팜·로봇) | 15 | 제안서 + 인터뷰 |
| Babylon.js (또는 동급) 실적 | 15 | 참고 사례 ≥2건 |
| 시뮬레이션 모델링 실적 | 10 | 참고 사례 |
| 백엔드·관제 통합 실적 | 10 | 참고 사례 |
| 데이터 파이프라인 실적 | 5 | 참고 사례 |
| 본 RFP 이해도·재구성 능력 | 15 | 단일 시나리오 시연 + Q&A |
| 일정·예산 합리성 | 10 | 마일스톤별 분해 |
| 팀 구성·역할 | 10 | CV + 책임 분담표 |
| 유지보수 의지·재계약 | 5 | 인터뷰 |
| 보안·IP·라이선스 정책 | 5 | 정책 문서 |
| **합계** | **100** | Short-list 70점 이상 |

### 12.3 시연 요구 (`hello` 시나리오)

입찰 시 본 RFP의 `hello` 시나리오 1종을 시연. 외주사가 본 RFP를 정확히 이해했는지 확인하기 위한 게이트. **시연 시나리오 후보는 발주 전 비아가 1종 픽 — [발주 전 협의]**.

후보:
- `hello-workbench-D70-truss` — Workbench 진입 → 시나리오 1개 로드 → end-effector 카메라 → 작업 실행
- `hello-foundry-50-frames` — Foundry 진입 → 매트릭스 sub-cube → 50장 mask 생성
- `hello-twin-bed3-heatmap` — Twin 진입 → bed-3 zone heatmap → WS mock 데이터 동기
- `hello-composer-fork` — Composer → 시나리오 fork → diff
- `hello-reference-truth-trajectory` — Calibration tab → 변수 trajectory 표시

비아 내부 결정 후 입찰 공고에 포함.

## §13. IP·라이선스·데이터 권리

| 자산 | 권리자 | 라이선스 |
|---|---|---|
| 본 RFP 패키지 | 비아 | 외주 시 NDA 적용 |
| 외주사 작성 코드 | 비아 (인수 후) | 비아 결정 (비공개 또는 OSS) |
| Crop/Greenhouse SSOT (기존) | 비아 | 비아 결정 |
| OSS 의존성 (Babylon Apache 2.0, React MIT, etc.) | 원 저작자 | 인수 시 license inventory 제출 의무 |
| 합성 데이터 (Foundry 출력) | 비아 (자산), 컨소시엄 합의 범위 공유 | 컨소시엄 합의문 |
| 실측 데이터 | 측정 제공자 + 비아 사용권 | 농가 동의서, 익명화, 사용 범위 제한 |
| 시나리오 카탈로그 | 비아 + 작성자 | 공식 승격 시 비아 |
| Reproducibility Seal | 공개 | n/a |

GPL/AGPL 의존성 사전 검토 의무. 자세한 데이터 권리 절차: [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §데이터 권리.

## §14. 일정 및 마일스톤 (권장안 — [발주 전 협의])

> 본 표의 주차는 권장 일정이며, 외주사 견적·일정 협의 후 계약 시점에 확정한다.

| MS | 시점 (권장) | 산출 | 게이트 |
|---|---|---|---|
| Phase 0 | 착수~2주 [발주 전 협의] | 정체성·UX 합의, 스키마 합의 (G4·G5·G10·G14) | 비아 디자이너·PM 합의 |
| MS1 | 2주 [발주 전 협의] | 공통 인프라 스키마 합의 | 게이트: 합의서 |
| MS2 | 6주 [발주 전 협의] | Phase 1 완료, 단위 데모 | 게이트: 단위 데모 |
| MS3 | 12주 [발주 전 협의] | Phase 2 완료, 모드 3종 동작 | 게이트: 모드 데모 |
| MS4 | 16주 [발주 전 협의] | Phase 3 완료, 카탈로그·dashboard·대량 데이터 | 게이트: 시나리오 12종 통과 |
| MS5 | 18주 [발주 전 협의] | 검수·완료보고서 | 게이트: V1~V8 PASS |
| S8 인수 | 18~22주 | 4주 페어 개발 + 워크숍 | 게이트: 인수확인서 |
| S9 워런티 | 22~32주 | 90일 버그 수정 책임 | n/a |

실행 트랙 상세 (Task Card 28개 포함): [03-gap-and-execution-plan.md](03-gap-and-execution-plan.md) §3.8.

**Diagram 3 — S1~S10 발주 사이클 흐름도**

<svg width="720" height="220" viewBox="0 0 720 220" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12">
  <style>
    .stage  { fill:#eef5ff; stroke:#2c6cdf; stroke-width:1.4; }
    .gate   { fill:#fff7e8; stroke:#d6831e; stroke-width:1.4; }
    .label  { fill:#222; }
    .strong { font-weight:bold; }
    .arrow  { stroke:#888; stroke-width:1.3; fill:none; marker-end:url(#arr); }
  </style>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L6,4 L0,8 Z" fill="#888"/>
    </marker>
  </defs>

  <!-- Row 1: S1-S5 -->
  <rect class="stage" x="20"  y="40" width="120" height="46" rx="6"/>
  <text class="label strong" x="80"  y="62" text-anchor="middle">S1 발주준비</text>
  <text class="label" x="80"  y="78" text-anchor="middle">RFP V1.0</text>

  <rect class="stage" x="160" y="40" width="120" height="46" rx="6"/>
  <text class="label strong" x="220" y="62" text-anchor="middle">S2 입찰공고</text>
  <text class="label" x="220" y="78" text-anchor="middle">Q&amp;A</text>

  <rect class="gate"  x="300" y="40" width="120" height="46" rx="6"/>
  <text class="label strong" x="360" y="62" text-anchor="middle">S3 평가/시연</text>
  <text class="label" x="360" y="78" text-anchor="middle">평가표 70+</text>

  <rect class="stage" x="440" y="40" width="120" height="46" rx="6"/>
  <text class="label strong" x="500" y="62" text-anchor="middle">S4 계약</text>
  <text class="label" x="500" y="78" text-anchor="middle">NDA·IP·SLA</text>

  <rect class="stage" x="580" y="40" width="120" height="46" rx="6"/>
  <text class="label strong" x="640" y="62" text-anchor="middle">S5 착수</text>
  <text class="label" x="640" y="78" text-anchor="middle">자산 인계</text>

  <!-- Arrows row 1 -->
  <path class="arrow" d="M 140 63 L 158 63"/>
  <path class="arrow" d="M 280 63 L 298 63"/>
  <path class="arrow" d="M 420 63 L 438 63"/>
  <path class="arrow" d="M 560 63 L 578 63"/>

  <!-- Row 2: S6-S10 (reverse direction visual) -->
  <rect class="stage" x="20"  y="130" width="120" height="46" rx="6"/>
  <text class="label strong" x="80"  y="152" text-anchor="middle">S6 개발</text>
  <text class="label" x="80"  y="168" text-anchor="middle">MS1~MS5</text>

  <rect class="gate"  x="160" y="130" width="120" height="46" rx="6"/>
  <text class="label strong" x="220" y="152" text-anchor="middle">S7 검수</text>
  <text class="label" x="220" y="168" text-anchor="middle">V1~V8 PASS</text>

  <rect class="stage" x="300" y="130" width="120" height="46" rx="6"/>
  <text class="label strong" x="360" y="152" text-anchor="middle">S8 인수</text>
  <text class="label" x="360" y="168" text-anchor="middle">4주 페어</text>

  <rect class="stage" x="440" y="130" width="120" height="46" rx="6"/>
  <text class="label strong" x="500" y="152" text-anchor="middle">S9 운영</text>
  <text class="label" x="500" y="168" text-anchor="middle">90일 워런티</text>

  <rect class="stage" x="580" y="130" width="120" height="46" rx="6"/>
  <text class="label strong" x="640" y="152" text-anchor="middle">S10 V2</text>
  <text class="label" x="640" y="168" text-anchor="middle">우선 협상</text>

  <!-- Wrap arrow S5 -> S6 -->
  <path class="arrow" d="M 640 86 L 640 110 L 80 110 L 80 130"/>

  <!-- Arrows row 2 -->
  <path class="arrow" d="M 140 153 L 158 153"/>
  <path class="arrow" d="M 280 153 L 298 153"/>
  <path class="arrow" d="M 420 153 L 438 153"/>
  <path class="arrow" d="M 560 153 L 578 153"/>

  <text x="360" y="20" text-anchor="middle" font-size="13" class="strong">발주 사이클 (10단계) — 게이트는 황색</text>
  <text x="360" y="208" text-anchor="middle" font-size="11" fill="#666">상세: [09-lifecycle-kpi-governance.md] §10</text>
</svg>

## §15. 책임·SLA

### 15.1 책임 분담

| 영역 | 발주자(비아) | 수주자(외주사) |
|---|---|---|
| 시나리오 정의·검증 케이스 확정 | ✓ | (Phase 0에서 외주가 작성, 비아 PM 승인) |
| 관제 API 메시지 스키마 | ✓ (관제팀 합의) | 구현 |
| 도메인 검수 (V1·V3) | ✓ | (시뮬 결과 제공) |
| 사전 자산 제공 (§11) | ✓ | (활용) |
| 마일스톤 게이트 통과 판정 | ✓ | (산출물 제출) |
| §5 전 범위 구현 | | ✓ |
| §8 산출물 제출 | | ✓ |
| 인수 산출물 (architecture/runbook/onboarding) | | ✓ |
| 90일 워런티 | | ✓ |

### 15.2 책임자 (계약 시 채움)

| 역할 | 이름·소속 |
|---|---|
| 발주자 책임자 | [입찰 후 확정] |
| 수주자 책임자 | [입찰 후 확정] |
| 비아 Tech Lead | [입찰 후 확정] |
| 비아 Crop SSOT Owner (도메인) | [입찰 후 확정] |
| 비아 관제팀 contact | [입찰 후 확정] |

### 15.3 인수 후 SLA (옵션)
- Monthly retainer (긴급 지원)
- V2 우선 협상권
- 상세: [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §Maintainership.

## §16. 부속 문서

본 SoW는 다음 부속 문서와 함께 외주 계약을 구성한다.

| 부속 | 문서 | 역할 |
|---|---|---|
| A | [02-final-report-template.md](02-final-report-template.md) | 검수 양식 + Annex A~F 인덱스 |
| B | [03-gap-and-execution-plan.md](03-gap-and-execution-plan.md) | Gap·실행·위험·MVP + **Task Card 28개 (§3.8)** |
| C | [04-scenario-catalog.md](04-scenario-catalog.md) | 시나리오 카탈로그 + Composer |
| D | [05-wire-protocol.md](05-wire-protocol.md) | 와이어 프로토콜 |
| E | [06-reference-truth-railway.md](06-reference-truth-railway.md) | Reference Truth |
| F | [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md) | Foundry · 라벨 |
| G | [08-entry-and-ux.md](08-entry-and-ux.md) | 진입·UX |
| H | [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) | 라이프사이클·거버넌스·SSO·결정성·실측·Maintainership·청자 요약·plan 메타 |

## §17. 예산 [발주 전 협의]

> 예산 범위는 발주 전 비아 내부 결정 — `[발주 전 협의: 예산 범위]` 표시.

### 17.1 비용 항목 (외주 견적 분해 양식)

| 항목 | 산정 근거 | 비용 |
|---|---|---|
| Phase 0 정체성·UX 합의 (2주, ~28 PD) | T0a~T0e | [발주 전 협의] |
| Phase 1 공통 인프라 (~4주, ~100 PD) | T1~T8b | [발주 전 협의] |
| Phase 2 모드 구현 (~6주, ~44 PD) | T9~T11b | [발주 전 협의] |
| Phase 3 가치명제 검증 (~4주, ~34 PD) | T12~T15c | [발주 전 협의] |
| Phase 4 검수 (~2주, ~8 PD) | T16·T17 | [발주 전 협의] |
| S8 인수 (4주 페어 + 워크숍) | 외주 1인 × 4주 | [발주 전 협의] |
| S9 90일 워런티 | 버그 수정 시간 | [발주 전 협의] |
| Foundry 컴퓨팅 (10만 frames 생성) | ~3일 컴퓨팅 비용 | [발주 전 협의] |
| 데이터 저장소 (S3 등) | 데이터셋·screenshot·영상 | [발주 전 협의] |
| **합계 (권장 범위)** | | [발주 전 협의: 예산 범위] |

### 17.2 옵션 비용
- V2 evolution 우선 협상권 행사 시 별도 SoW
- Monthly retainer (긴급 지원)
- 추가 작목 확장 (V2)
- 다른 엔진 마이그레이션 (V2+)

### 17.3 결제 게이트

각 마일스톤(MS1~MS5) 통과 시 분할 결제. 비율은 [발주 전 협의].

## §18. 다음 단계 (발주 전 비아 내부 액션)

본 RFP를 발주 가능 상태로 만들기 위한 비아 내부 액션 목록. **모든 [TBD]·[발주 전 협의]·[입찰 후 확정] marker 해소가 본 §18 완료 조건**.

| # | 액션 | 책임자 | 기한 |
|---|---|---|---|
| 1 | **모호성 검수** — 외주사 후보 1~2사에 본 RFP 사전 공유, Q&A 수집 후 v1.1 갱신 | 비아 PM | [TBD] |
| 2 | **컨소시엄 파트너 확정** — §10 [TBD] 채움 (로봇 H/W·인식·농생물·운영 4 영역) | 비아 PM + 임원진 | [TBD] |
| 3 | **시연 시나리오 1종 픽** — §12.3 후보 5종 중 비아가 1종 선택 | 비아 PM | [TBD] |
| 4 | **예산 범위 합의** — §17 [발주 전 협의] 항목별 범위 결정 | 비아 임원진 + 재무 | [TBD] |
| 5 | **일정 검토** — §14 [발주 전 협의] 주차 확정 (착수 가능 시점 기준) | 비아 PM | [TBD] |
| 6 | **관제 API 스키마 사전 합의** — [05-wire-protocol.md](05-wire-protocol.md) 토픽 명세 비아 관제팀 review | 비아 관제팀 | [TBD] |
| 7 | **OIDC IdP 신뢰 설정** — 비아 관제 SSO와 Phytosim의 OIDC 통합 사전 검토 | 비아 관제팀 | [TBD] |
| 8 | **사전 자산 인계 준비** — §11 자산을 외주사가 즉시 활용할 수 있는 형태로 정리 | 비아 R&D | [TBD] |
| 9 | **법무 검토** — §13 IP·라이선스·데이터 권리 조항 법무팀 review | 비아 법무 | [TBD] |
| 10 | **본 RFP v1.1 최종 승인** — 임원진 결재 | 비아 임원진 | [TBD] |

위 10개 액션 모두 완료 시 본 RFP를 외주사에 정식 발주.

## §19. 한 줄

> 본 과업은 단순 시각화 외주가 아니라, **결정 검증·데이터 주조·실시간 미러·표준 레퍼런스·통합 허브** 5개 가치를 동시 충족하는 Phytosim 디지털트윈 모듈을 비아 관제 시스템과 컨소시엄에 통합 가능한 형태로 구축하는 것을 목적으로 한다.
