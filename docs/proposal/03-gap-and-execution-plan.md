# 03. Gap + 실행 플랜

**문서 분류**: 산출물 (c) · 비아 내부 PM 진행 추적 + 외주사 작업 분해 기준
**문서 버전**: v1.0
**근거 plan**: [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) §8, §10.3

---

## §1. 현재 사내 자산 요약

| 분류 | 상태 | 위치 | 비고 |
|---|---|---|---|
| Crop SSOT (생장 엔진) | ✅ 강함 | [packages/tomato-engine/](../../packages/tomato-engine/) | TOMSIM/TOMGRO 기반 |
| Greenhouse SSOT (골조·베드·레일·유인) | ✅ 강함 | [src/scene/greenhouse/](../../src/scene/greenhouse/) | 24×34m·13 베드 |
| 환경 동역학 (조명·바람·그림자) | ✅ 강함 | [src/scene/SceneSetup.ts](../../src/scene/SceneSetup.ts), `WindTab`/`LightingTab` | |
| Robot · FOV cone · zone UI · CaptureSession | ⚠️ archive | [src/_archive/](../../src/_archive/), [src/data/mockScenario.ts](../../src/data/mockScenario.ts) | Iter 35 제거됨, 복원 출발점 |
| 캡처 인프라 (Playwright sweep) | ⚠️ 부분 | [`_capture.mjs`](../../_capture.mjs), `tests/architecture/_probe-*.spec.ts` | RGB만, segmentation 미구현 |
| 외부 API (WS/REST) | ❌ 부재 | n/a | 완전 신규 |
| COCO/YOLO export | ❌ 부재 | n/a | 완전 신규 |
| 잎-과실 광학 가림 | ❌ 부재 | LAI 계산만 존재 | 완전 신규 |
| 시나리오 1급 객체 | ❌ 부재 | n/a | 완전 신규 |
| Reference Truth 자동 dashboard | ⚠️ 부분 | `growth-calibration/scripts/dump-growth-checkpoints.ts` | diff·heatmap 미자동화 |

## §2. Gap 매트릭스

[01-statement-of-work.md](01-statement-of-work.md) §7 검증 기준 PASS를 막는 결손 항목.

| # | 항목 | 가치명제 | 현 상태 | 보완 작업 | 자산 기반 |
|---|---|---|---|---|---|
| G1 | Robot + 그리퍼·절단기 | V1·V5 | archive | Robot.ts 복원 + 그리퍼·절단기 신규 모델 | 부분 |
| G2 | RGB-D + FOV + 다중 카메라 | V1·V2·V3 | archive | RTT + frustum + 카메라 매니저 | 부분 |
| G3 | 잎-과실 가림 광학 | V1·V2 | ❌ | ray cast 기반 occlusion 또는 voxel grid | 신규 |
| G4 | 시나리오 1급 객체 + 카탈로그 | V1·V2·V3 | ❌ | 스키마·로더·플레이어·카탈로그 | 신규 |
| G5 | 와이어 프로토콜 + WS/REST 서버 | V3·V5 | ❌ | WS+REST 서버 + 메시지 스키마 | 신규 |
| G6 | Reference Truth 자동 dashboard | V4 | 부분 | diff·heatmap·HTML 자동화 | 부분 |
| G7 | Foundry 배치 + COCO + mask | V2 | 부분 | 매트릭스 러너 + mask 렌더 + COCO writer | 부분 |
| G8 | 관제 UI 임베드 (web component) | V3·V5 | archive | TopBar/ZoneCard 복원 + WC 화 | 부분 |
| G9 | 결정성 (seed pinning) | V1·V7 | 부분 | mode 진입 시 전 시스템 seed lock | 부분 |
| G10 | 로봇 모델 URDF swap | V5 | ❌ | 모델 라이브러리 + 로더 | 신규 |
| G11 | 잎 수 표준 보정 | V4 | W16 +27~74% | LeafGrowthModel 튜닝 | 보정 |
| G12 | Workbench UI (작업 실행/슬라이더) | V1 | ❌ | React panel + 작업 트리거 | 신규 |
| G13 | L0~L4 진입 아키텍처 | V1·V2·V3·V5 | ❌ | Launcher·Identity·Mode·Scenario picker·Workspace shell | 신규 |
| G14 | UX/UI 시스템 + 핵심 컴포넌트 | 전 명제 | ❌ | TimelineBar·CameraDock·ValueChip·PassFailChip·RefDiffPanel·ZoneHeatmap·WireStatus·ScenarioCard | 신규 |
| G15 | In-app onboarding tour | V1·V5 | ❌ | 페르소나별 5분 가이드 | 신규 |
| G16 | 거버넌스·표준 변경 절차 docs | V4·V5 | ❌ | 시나리오 승인·표준 모델 변경·스키마 versioning 문서 | 신규 |
| G17 | KPI 대시보드 | V5 | ❌ | 활성 시나리오·통과율·임베드 uptime·Foundry 처리량 | 신규 |
| G18 | Scenario Composer (L3.5 dial + Lock/Variable + Save/Fork/Diff) | V1·V2·V3·V5 | ❌ | dial UI + 상태 모델 + fork API + diff renderer | 신규 |
| G19 | Reproducibility Seal (hash 발급·저장·검증) | V1·V4·V7 | 부분 | seal 생성기 + store + 재현 검증 액션 + CI 통합 | 부분 |

## §3. 실행 트랙 (Phase 0~4)

### 3.1 Phase 0 — 정체성·UX 합의 (선행, ~2주)
| Task | 설명 | Gap |
|---|---|---|
| T0a | 가치명제·페르소나·여정 문서 합의 | (정체성) |
| T0b | 진입 아키텍처 L0~L4 설계 | G13 |
| T0c | UX/UI 시스템·와이어프레임 확정 | G14 |
| T0d | 거버넌스 docs 초안 | G16 |
| T0e | URDF·시나리오·라벨 스키마 합의 | G4·G10·D2 |

### 3.2 Phase 1 — 공통 인프라 (병렬, ~6주)
| Task | 설명 | Gap | 선행 |
|---|---|---|---|
| T1 | Robot 복원 + 그리퍼·절단기 | G1 | T0e |
| T2 | 카메라 매니저 + FOV + RGB-D + mask 렌더 | G2 | T0e |
| T3 | 잎-과실 가림 광학 | G3 | — |
| T4 | 시나리오 1급 객체 (스키마·로더) | G4 | T0e |
| T4b | Scenario Composer (dial UI + Lock/Variable + Save/Fork/Diff) | G18 | T4 |
| T5 | WS+REST 서버 + 메시지 스키마 | G5 | T0e |
| T6 | 결정성 + 시드 락 | G9 | — |
| T6b | Reproducibility Seal | G19 | T6 |
| T7 | 로봇 모델 라이브러리 (URDF swap) | G10 | T0e |
| T8 | 잎 수 보정 | G11 | — |
| T8b | UI 컴포넌트 라이브러리 | G14 | T0c |

### 3.3 Phase 2 — 모드 구현 (Phase 0+1 의존, ~6주)
| Task | 설명 | Gap | 선행 |
|---|---|---|---|
| T9 | Workbench Mode UI + 작업 실행 | G12 | T1·T2·T6·T8b |
| T10 | Foundry 배치 러너 + COCO writer | G7 | T2·T3·T4·T8b |
| T11 | Twin 임베드 web component + 미러 | G8 | T5·T2·T8b |
| T11b | Launcher + Scenario Picker (L0·L3) | G13 | T4·T8b |

### 3.4 Phase 3 — 가치명제 검증 (~4주)
| Task | 설명 | Gap | 선행 |
|---|---|---|---|
| T12 | 시나리오 카탈로그 작성 + 통과 (≥12) | (V3) | T9·T10·T11 |
| T13 | Reference Truth dashboard | G6 | T6 |
| T14 | 와이어 프로토콜 통합 시험 (비아 관제팀) | (V4) | T11 |
| T15 | Foundry 대량 생성 + 라벨 검증 | (V5) | T10 |
| T15b | In-app onboarding tour | G15 | T9·T10·T11 |
| T15c | KPI dashboard | G17 | T11b |

### 3.5 Phase 4 — 검수 (~2주)
| Task | 설명 |
|---|---|
| T16 | V1~V8 통과 보고 |
| T17 | 완료보고서 작성 (산출물 b) |

### 3.6 의존성 다이어그램

```
Phase 0:
  T0a ─► T0b ─► T0c ─► T0e ─► (Phase 1 시작)

Phase 1 (병렬):
  T1, T2, T3, T4, T4b, T5, T6, T6b, T7, T8, T8b

Phase 1 → Phase 2:
  T1, T2, T6, T8b ─► T9   (Workbench)
  T2, T3, T4, T8b ─► T10  (Foundry)
  T5, T2, T8b     ─► T11  (Twin)
  T4, T8b         ─► T11b (Launcher+Picker)

Phase 2 → Phase 3:
  T9, T10, T11 ─► T12 (시나리오 통과)
  T6, T8       ─► T13 (Reference Truth)
  T11          ─► T14 (Wire 통합)
  T10          ─► T15 (Foundry 대량)
  T9, T10, T11 ─► T15b (Onboarding)
  T11b         ─► T15c (KPI dashboard)

Phase 3 → Phase 4:
  T12, T13, T14, T15 ─► T16 ─► T17
```

### 3.7 권장 인력 배치 (외주, 4팀 병렬)

| 팀 | 담당 Task |
|---|---|
| A 로봇·시나리오·Workbench | T0e·T1·T4·T4b·T7·T9·T12 |
| B 작물·광학·Reference | T3·T8·T13 |
| C 데이터·렌더·Foundry | T2·T10·T15 |
| D 백엔드·관제·Twin | T0b·T5·T6·T6b·T11·T11b·T14 |
| E 디자인·UX | T0c·T8b·T15b |
| PM 검수 | T16·T17 |

→ 4~5팀 병렬 가능. 직렬: Phase 0 → 1 → 2 → 3 → 4.

### 3.8 Task Cards (외주 즉시 작업 가능 단위)

각 Task에 대한 표준 form. 외주 엔지니어는 본 카드를 받아 1주 안에 sub-task 분해 없이 작업 시작 가능. 상세 spec은 04~07 깊이 트랙 참조.

#### Phase 0 — 정체성·UX 합의

##### Task T0a — 가치명제·페르소나·여정 문서 합의

| 필드 | 내용 |
|---|---|
| **Goal** | 비아 PM·외주·도메인 전문가가 V1~V5 · 9 페르소나 · 사용자 여정에 대해 1차 합의 |
| **Gap ID** | (정체성) |
| **Phase** | 0 |
| **Inputs** | [01-statement-of-work.md](01-statement-of-work.md) §3·§4 · plan v1.0 §1·§2·§3.7 |
| **Outputs** | `docs/proposal/agreement/identity-personas-journey.md` (서명본) |
| **Sub-tasks** | 1. 비아 내부 워크숍 1회<br>2. 외주 회의 1회 (Q&A)<br>3. 도메인 전문가 검토<br>4. 합의서 서명 |
| **Acceptance Criteria** | 가치명제 5개·페르소나 9종·여정 3구간이 명문화되고 3자(비아·외주·도메인) 서명 |
| **Estimated PD** | 3 person-days (회의 + 문서화) |
| **Dependencies** | — |
| **Verification** | 합의서가 docs/proposal/agreement/ 에 commit |
| **Definition of Done** | 서명본 PDF + markdown 양식 |

##### Task T0b — 진입 아키텍처 L0~L4 설계

| 필드 | 내용 |
|---|---|
| **Goal** | URL 구조·인증·라우팅·web component 임베드 점 확정 |
| **Gap ID** | G13 |
| **Phase** | 0 |
| **Inputs** | [08-entry-and-ux.md](08-entry-and-ux.md) §1 · [05-wire-protocol.md](05-wire-protocol.md) §8 |
| **Outputs** | `docs/proposal/agreement/entry-architecture.md` + 라우팅 다이어그램 SVG |
| **Sub-tasks** | 1. URL 구조 확정 (`phytosim/demo`·`/dev`·`/foundry`·`/calibration`·`/showcase`)<br>2. OIDC client 구성 명세<br>3. iframe / web component 경계 결정<br>4. 페르소나별 진입 시퀀스 sign-off |
| **Acceptance Criteria** | 7 페르소나 모두에 대해 진입 URL + 첫 도달 화면이 정해짐, 비아 관제팀 동의 |
| **Estimated PD** | 4 PD |
| **Dependencies** | — |
| **Verification** | 라우팅 다이어그램 + 비아 관제팀 review 통과 |
| **Definition of Done** | 합의문 merge + SVG 첨부 |

##### Task T0c — UX/UI 시스템·와이어프레임 확정

| 필드 | 내용 |
|---|---|
| **Goal** | 8 UX 원칙·핵심 화면 와이어프레임 7종·10 컴포넌트 카탈로그 시안 확정 |
| **Gap ID** | G14 |
| **Phase** | 0 |
| **Inputs** | [08-entry-and-ux.md](08-entry-and-ux.md) §2·§3·§4 |
| **Outputs** | Figma URL 또는 동급 시안 + design tokens (`tokens.json`) |
| **Sub-tasks** | 1. Splash·Picker·Composer·Workbench·Foundry·Twin·Calibration 와이어프레임 high-fi 시안<br>2. design token (color·spacing·typography)<br>3. 10 컴포넌트 카탈로그 (Figma component library)<br>4. 비아 사용자 테스트 5분 통과율 측정 |
| **Acceptance Criteria** | 시안 7종 + 컴포넌트 라이브러리 + token; 비아 디자이너 sign-off |
| **Estimated PD** | 12 PD |
| **Dependencies** | T0b (URL 구조) |
| **Verification** | Figma 링크 + design token export |
| **Definition of Done** | sign-off 회의록 + Figma URL git에 기록 |

##### Task T0d — 거버넌스 docs 초안

| 필드 | 내용 |
|---|---|
| **Goal** | 시나리오 카탈로그 승인·표준 모델 변경·스키마 versioning 절차 문서화 |
| **Gap ID** | G16 |
| **Phase** | 0 |
| **Inputs** | [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §3 |
| **Outputs** | `docs/proposal/agreement/governance.md` |
| **Sub-tasks** | 1. RFC 템플릿<br>2. PR 리뷰 체크리스트<br>3. governance board 운영 규칙 |
| **Acceptance Criteria** | 5개 거버넌스 영역 모두에 절차 명시, 비아 PM 승인 |
| **Estimated PD** | 3 PD |
| **Dependencies** | — |
| **Verification** | 문서 merge + 비아 PM 승인 코멘트 |
| **Definition of Done** | merge |

##### Task T0e — URDF·시나리오·라벨 스키마 합의

| 필드 | 내용 |
|---|---|
| **Goal** | 로봇 URDF schema · 시나리오 jsonc schema (Zod) · 라벨 스키마 확정 |
| **Gap ID** | G4·G10·D2 |
| **Phase** | 0 |
| **Inputs** | [04-scenario-catalog.md](04-scenario-catalog.md) §2 · [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md) §3 |
| **Outputs** | `packages/phytosim-schemas/scenario.ts` (Zod) · `urdf-schema.md` · `label-schema.md` |
| **Sub-tasks** | 1. 시나리오 jsonc Zod schema<br>2. URDF subset 정의<br>3. 라벨 클래스 enum + attribute 명세<br>4. mesh ID 규약 합의 |
| **Acceptance Criteria** | 3개 스키마가 lint-pass, 인식 알고리즘 파트너 + 비아 관제팀 + 도메인 전문가 sign-off |
| **Estimated PD** | 6 PD |
| **Dependencies** | T0d (RFC 절차) |
| **Verification** | `pnpm tsc --noEmit` PASS, 컨소시엄 파트너 sign-off |
| **Definition of Done** | schema merge + 컨소시엄 sign-off |

#### Phase 1 — 공통 인프라

##### Task T1 — Robot 복원 + 그리퍼·절단기

| 필드 | 내용 |
|---|---|
| **Goal** | archive Robot.ts 복원 + 그리퍼/절단기 신규 모델링 |
| **Gap ID** | G1 |
| **Phase** | 1 |
| **Inputs** | `src/_archive/twin/Robot.ts` · T0e URDF 합의서 |
| **Outputs** | `src/scene/robot/Robot.ts` · `src/scene/robot/effectors/Gripper.ts` · `src/scene/robot/effectors/Cutter.ts` |
| **Sub-tasks** | 1. archive 복원 (Babylon API 호환성 spike)<br>2. AGV chassis 정합 시험<br>3. 6DOF arm 복원 + joint covers<br>4. Gripper mesh + tip transform<br>5. Cutter mesh + blade transform<br>6. effector swap API |
| **Acceptance Criteria** | scene에 robot 표시, 단축키 1로 진입 시 frustum cone 가시, effector swap 정상 |
| **Estimated PD** | 7~10 PD |
| **Dependencies** | T0e |
| **Verification** | `pnpm dev` → robot 가시 · effector swap UI · frustum cone visual |
| **Definition of Done** | (1) merge (2) screenshot 첨부 (3) playwright probe spec 1건 PASS |

##### Task T2 — 카메라 매니저 + FOV + RGB-D + mask 렌더

| 필드 | 내용 |
|---|---|
| **Goal** | 다중 카메라 매니저 + frustum 시각화 + RGB-D + segmentation mask render target |
| **Gap ID** | G2 |
| **Phase** | 1 |
| **Inputs** | `src/_archive/twin/Robot.ts`의 fovCone · [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md) §4 |
| **Outputs** | `src/scene/camera/CameraManager.ts` · `src/scene/camera/FrustumVisualizer.ts` · `src/scene/camera/MaskRenderPass.ts` · `src/scene/camera/DepthRenderPass.ts` |
| **Sub-tasks** | 1. CameraManager (1~9 단축키)<br>2. Frustum cone mesh<br>3. RTT depth pass<br>4. RTT mask material pass (옵션 B)<br>5. mesh instance ID 할당 시스템<br>6. PNG encoder |
| **Acceptance Criteria** | 카메라 9종 단축키 동작, mask·depth가 PNG로 저장, mesh ID 결정적 |
| **Estimated PD** | 12 PD |
| **Dependencies** | T0e (mesh ID 규약) |
| **Verification** | mask·depth PNG 샘플 10장 자동 생성 + CI에서 mesh ID hash 검증 |
| **Definition of Done** | merge + PNG 샘플 + probe spec PASS |

##### Task T3 — 잎-과실 가림 광학

| 필드 | 내용 |
|---|---|
| **Goal** | per-fruit `visible_fraction` 0~1 + occluding_class 계산 |
| **Gap ID** | G3 |
| **Phase** | 1 |
| **Inputs** | [packages/tomato-engine/](../../packages/tomato-engine/) · [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md) §3.2·§8 |
| **Outputs** | `src/plant/optics/Occlusion.ts` · `src/plant/optics/RayCaster.ts` |
| **Sub-tasks** | 1. ray cast 또는 voxel grid 결정 (R&D spike)<br>2. per-fruit ray N개 sampling<br>3. occluding mesh class 추적<br>4. realtime vs offline 분리 (60fps 한계 시 offline only) |
| **Acceptance Criteria** | `visible_fraction` 정확도 ±0.05 (수동 비교) · occluding_class enum 정상 |
| **Estimated PD** | 10 PD |
| **Dependencies** | — |
| **Verification** | scenario `thin-occluded-fruit`에서 occlusion 라벨 검증 |
| **Definition of Done** | merge + 시나리오 PASS + dashboard 통합 |

##### Task T4 — 시나리오 1급 객체 (스키마·로더)

| 필드 | 내용 |
|---|---|
| **Goal** | `.scenario.jsonc` 로드·검증·플레이어 |
| **Gap ID** | G4 |
| **Phase** | 1 |
| **Inputs** | [04-scenario-catalog.md](04-scenario-catalog.md) §2 · T0e Zod schema |
| **Outputs** | `packages/phytosim-scenarios/Loader.ts` · `Player.ts` · `Validator.ts` |
| **Sub-tasks** | 1. jsonc parser<br>2. Zod validation<br>3. 시나리오 실행 (mode dispatcher)<br>4. 메타데이터 추출 |
| **Acceptance Criteria** | 5종 샘플 + 12종 카탈로그 모두 load·validate PASS |
| **Estimated PD** | 6 PD |
| **Dependencies** | T0e |
| **Verification** | 카탈로그 회귀 테스트 통과 |
| **Definition of Done** | merge + 12 시나리오 자동 테스트 PASS |

##### Task T4b — Scenario Composer (dial UI + Lock/Variable + Save/Fork/Diff)

| 필드 | 내용 |
|---|---|
| **Goal** | L3.5 Composer — 25개 dial + Lock/Variable + Save/Fork/Diff/Seal |
| **Gap ID** | G18 |
| **Phase** | 1 |
| **Inputs** | [04-scenario-catalog.md](04-scenario-catalog.md) §3 · [08-entry-and-ux.md](08-entry-and-ux.md) §3.3 |
| **Outputs** | `src/modes/composer/Composer.tsx` · `ComposerState.ts` · `ScenarioDiff.ts` · `MyScenarios.tsx` |
| **Sub-tasks** | 1. 25개 dial 컴포넌트<br>2. Composer 상태 모델 (zustand)<br>3. Lock vs Variable 토글<br>4. Save as scenario API<br>5. Fork API (parentId 추적)<br>6. Diff renderer (변경 dial 강조)<br>7. My Scenarios 페이지<br>8. org namespace |
| **Acceptance Criteria** | 25개 dial 동작 · Save/Fork/Diff 모두 정상 · org namespace 동작 |
| **Estimated PD** | 18 PD |
| **Dependencies** | T4 (loader) |
| **Verification** | 시나리오 fork → diff 시각화 e2e 테스트 |
| **Definition of Done** | merge + e2e 테스트 + UX 5분 도달 통과 |

##### Task T5 — WS+REST 서버 + 메시지 스키마

| 필드 | 내용 |
|---|---|
| **Goal** | 와이어 프로토콜 서버 구현 + 메시지 publish/subscribe |
| **Gap ID** | G5 |
| **Phase** | 1 |
| **Inputs** | [05-wire-protocol.md](05-wire-protocol.md) §3·§4·§5 |
| **Outputs** | `packages/phytosim-api/server.ts` · `topics/` · `rest/` |
| **Sub-tasks** | 1. WS 서버 (uWS or socket.io)<br>2. 9개 토픽 구현<br>3. REST 5개 그룹<br>4. JWT 검증 + ACL<br>5. seq 단조 증가 + reconnect catch-up<br>6. TLS + CORS |
| **Acceptance Criteria** | 9 토픽 + 5 REST 그룹 모두 동작 · 비아 관제팀 polling 테스트 ≤1초 |
| **Estimated PD** | 15 PD |
| **Dependencies** | T0e (메시지 스키마) |
| **Verification** | 비아 관제팀 통합 시험 (T14에서) |
| **Definition of Done** | merge + API docs + 비아 관제팀 dry run PASS |

##### Task T6 — 결정성 + 시드 락

| 필드 | 내용 |
|---|---|
| **Goal** | mode 진입 시 전 시스템 seed lock + `Math.random`/`Date.now` lint |
| **Gap ID** | G9 |
| **Phase** | 1 |
| **Inputs** | [06-reference-truth-railway.md](06-reference-truth-railway.md) §7 · [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §6 |
| **Outputs** | `src/core/Determinism.ts` · `tests/architecture/no-direct-random.spec.ts` |
| **Sub-tasks** | 1. seed-passed RNG 라이브러리<br>2. Math.random/Date.now lint<br>3. 외부 entropy 격리<br>4. async 순서 보장 시뮬 step |
| **Acceptance Criteria** | 동일 시드 → 동일 frame hash · lint CI PASS |
| **Estimated PD** | 8 PD |
| **Dependencies** | — |
| **Verification** | frame hash CI · trajectory hash CI |
| **Definition of Done** | merge + lint spec PASS |

##### Task T6b — Reproducibility Seal

| 필드 | 내용 |
|---|---|
| **Goal** | hash 발급·저장·재현 검증 · PR/논문/사고 분석 첨부 |
| **Gap ID** | G19 |
| **Phase** | 1 |
| **Inputs** | [06-reference-truth-railway.md](06-reference-truth-railway.md) §8 |
| **Outputs** | `packages/phytosim-seals/issue.ts` · `verify.ts` · `store.ts` · `cli.ts` |
| **Sub-tasks** | 1. canonical(scenario) 직렬화<br>2. seal = sha256(...)<br>3. seal store (local + REST)<br>4. `phytosim seal verify <seal>` CLI<br>5. CI 통합 |
| **Acceptance Criteria** | seal로 재시뮬 → frame hash 일치 · CLI 동작 · CI에서 시나리오마다 seal 자동 발급 |
| **Estimated PD** | 5 PD |
| **Dependencies** | T6 |
| **Verification** | seal verify PASS for all 12 시나리오 |
| **Definition of Done** | merge + CLI docs |

##### Task T7 — 로봇 모델 라이브러리 (URDF swap)

| 필드 | 내용 |
|---|---|
| **Goal** | URDF-style 로봇 모델 등록·로드·swap |
| **Gap ID** | G10 |
| **Phase** | 1 |
| **Inputs** | T0e URDF schema · `src/scene/robot/Robot.ts` (T1) |
| **Outputs** | `packages/phytosim-robots/Loader.ts` · `models/via-agv-6dof-v1.urdf` · `models/mock.urdf` |
| **Sub-tasks** | 1. URDF subset 파서<br>2. mesh/joint mapping<br>3. 모델 등록 (drop-down)<br>4. 컨소시엄 파트너 모델 추가 가이드 |
| **Acceptance Criteria** | 2개 모델 swap 동작 · 신규 모델 추가 3 step 안에 가능 |
| **Estimated PD** | 7 PD |
| **Dependencies** | T0e · T1 |
| **Verification** | swap UI 동작 + 가이드 docs |
| **Definition of Done** | merge + 2 모델 + 가이드 |

##### Task T8 — 잎 수 표준 보정

| 필드 | 내용 |
|---|---|
| **Goal** | W16 +27~74% 잎 수 초과 → 표준 범위 ±20% 안으로 |
| **Gap ID** | G11 |
| **Phase** | 1 |
| **Inputs** | [packages/tomato-engine/src/LeafGrowthModel.ts](../../packages/tomato-engine/src/) · `docs/growth-gap-analysis.md` |
| **Outputs** | LeafGrowthModel 파라미터 조정 + 테스트 |
| **Sub-tasks** | 1. 현 상태 측정<br>2. phyllochron 또는 expansion rate 조정<br>3. ±20% 회귀 검증<br>4. dashboard 통과 확인 |
| **Acceptance Criteria** | W16에서 잎 수 ±20% 이내 · 다른 변수 회귀 없음 |
| **Estimated PD** | 4 PD |
| **Dependencies** | — |
| **Verification** | Reference Truth dashboard PASS |
| **Definition of Done** | merge + frame hash 업데이트 + 도메인 전문가 sign-off |

##### Task T8b — UI 컴포넌트 라이브러리

| 필드 | 내용 |
|---|---|
| **Goal** | 10 컴포넌트 (TimelineBar, CameraDock, ValueChip, PassFailChip, RefDiffPanel, ZoneHeatmap, WireStatus, ScenarioCard, ComposerDial, ReproducibilityBadge) 라이브러리 |
| **Gap ID** | G14 |
| **Phase** | 1 |
| **Inputs** | [08-entry-and-ux.md](08-entry-and-ux.md) §4 · T0c Figma 시안 |
| **Outputs** | `packages/phytosim-ui/src/` 10 컴포넌트 + Storybook |
| **Sub-tasks** | 1~10. 각 컴포넌트 React 구현 + Storybook 등록 |
| **Acceptance Criteria** | 10개 모두 Storybook · WCAG 2.1 AA 통과 · 색맹 친화 |
| **Estimated PD** | 15 PD |
| **Dependencies** | T0c |
| **Verification** | Storybook + a11y CI 통과 |
| **Definition of Done** | merge + Storybook URL 공유 |

#### Phase 2 — 모드 구현

##### Task T9 — Workbench Mode UI + 작업 실행

| 필드 | 내용 |
|---|---|
| **Goal** | Workbench 메인 화면 + 시간 슬라이더 + 작업 트리거 + Ref Diff Panel |
| **Gap ID** | G12 |
| **Phase** | 2 |
| **Inputs** | T1·T2·T6·T8b · [08-entry-and-ux.md](08-entry-and-ux.md) §3.4 |
| **Outputs** | `src/modes/workbench/Workbench.tsx` · `WorkbenchPanel.tsx` |
| **Sub-tasks** | 1. 3D scene 메인<br>2. CameraDock<br>3. TimelineBar<br>4. Plant Info / Ref Diff / Task panel<br>5. 작업 실행 → 식물 상태 동기 (`budState='pruned'` 등) |
| **Acceptance Criteria** | scenario thin-D70-truss3-multi 로드 → 작업 실행 → 식물 상태 갱신 |
| **Estimated PD** | 10 PD |
| **Dependencies** | T1·T2·T6·T8b |
| **Verification** | e2e 테스트: scenario load → run → diff |
| **Definition of Done** | merge + e2e + screenshot |

##### Task T10 — Foundry 배치 러너 + COCO writer

| 필드 | 내용 |
|---|---|
| **Goal** | 헤드리스 배치 매트릭스 실행기 + COCO JSON writer |
| **Gap ID** | G7 |
| **Phase** | 2 |
| **Inputs** | T2·T3·T4·T8b · [07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md) §6 |
| **Outputs** | `packages/phytosim-foundry/runner.ts` · `cocoWriter.ts` · `queue.ts` |
| **Sub-tasks** | 1. Playwright headless worker pool<br>2. 매트릭스 sub-cube partition<br>3. job queue (sqlite)<br>4. 진행률 streaming (REST polling)<br>5. COCO JSON writer<br>6. mask PNG · depth PNG · 3D bbox JSONL<br>7. 재개 (idempotent) |
| **Acceptance Criteria** | 단일 시드 ≥10k frames · COCO 파서 무오류 · 재개 동작 |
| **Estimated PD** | 14 PD |
| **Dependencies** | T2·T3·T4·T8b |
| **Verification** | pycocotools 파서 PASS · 진행률 streaming |
| **Definition of Done** | merge + 10k frames 생성 보고 |

##### Task T11 — Twin 임베드 web component + 미러

| 필드 | 내용 |
|---|---|
| **Goal** | `<phytosim-twin>` web component + 실시간 미러 동기화 |
| **Gap ID** | G8 |
| **Phase** | 2 |
| **Inputs** | T5·T2·T8b · [05-wire-protocol.md](05-wire-protocol.md) §8 |
| **Outputs** | `packages/phytosim-twin-embed/PhytosimTwin.ts` · `Mirror.ts` |
| **Sub-tasks** | 1. web component (Lit or vanilla)<br>2. iframe sandbox<br>3. postMessage 토픽<br>4. WS 미러 동기 (실제 → 가상 push)<br>5. zone heatmap overlay<br>6. WireStatus 표시 |
| **Acceptance Criteria** | iframe 임베드 → 비아 관제 환경에서 정상 동작 · latency ≤1초 |
| **Estimated PD** | 12 PD |
| **Dependencies** | T5·T2·T8b |
| **Verification** | 비아 관제팀 dry run |
| **Definition of Done** | merge + 임베드 데모 영상 |

##### Task T11b — Launcher + Scenario Picker (L0·L3)

| 필드 | 내용 |
|---|---|
| **Goal** | L0 Splash + L3 Scenario Picker |
| **Gap ID** | G13 |
| **Phase** | 2 |
| **Inputs** | T4·T8b · [08-entry-and-ux.md](08-entry-and-ux.md) §3.1·§3.2 |
| **Outputs** | `src/modes/launcher/Launcher.tsx` · `ScenarioPicker.tsx` |
| **Sub-tasks** | 1. Splash 화면 + 가치명제 노출<br>2. 모드 3 카드<br>3. ScenarioPicker (필터·검색)<br>4. + 새 시나리오 → Composer 진입<br>5. My Scenarios 진입 |
| **Acceptance Criteria** | 첫 사용자가 5분 안에 시나리오 1개 로드 |
| **Estimated PD** | 8 PD |
| **Dependencies** | T4·T8b |
| **Verification** | V8 사용자 테스트 (제3자) |
| **Definition of Done** | merge + UX 테스트 결과 |

#### Phase 3 — 가치명제 검증

##### Task T12 — 시나리오 카탈로그 작성 + 통과 (≥12)

| 필드 | 내용 |
|---|---|
| **Goal** | 15종 시나리오 작성 + 카탈로그 등록 + 자동 통과 |
| **Gap ID** | (V3) |
| **Phase** | 3 |
| **Inputs** | T9·T10·T11 · [04-scenario-catalog.md](04-scenario-catalog.md) §4 |
| **Outputs** | `scenarios/*.scenario.jsonc` × 15 + 통과 리포트 |
| **Sub-tasks** | 1. 자율주행 5종<br>2. 적과 4종<br>3. 적심 2종<br>4. 방제 1종<br>5. 인식 3종<br>6. 각 시나리오 successCriteria 통과 |
| **Acceptance Criteria** | ≥12 시나리오 PASS · 도메인 검수 통과 |
| **Estimated PD** | 8 PD |
| **Dependencies** | T9·T10·T11 |
| **Verification** | 시나리오 회귀 CI |
| **Definition of Done** | 15 jsonc merge + 통과 리포트 |

##### Task T13 — Reference Truth dashboard

| 필드 | 내용 |
|---|---|
| **Goal** | 자동 검증 dashboard HTML + CSV + 1쪽 요약 |
| **Gap ID** | G6 |
| **Phase** | 3 |
| **Inputs** | T6 · [06-reference-truth-railway.md](06-reference-truth-railway.md) §4·§5 |
| **Outputs** | `packages/phytosim-reference/dashboard.ts` · `reports/reference-truth-report.html` · `.csv` · `.md` |
| **Sub-tasks** | 1. growth-calibration scripts 활용<br>2. literature.json 로드<br>3. per-variable diff<br>4. trajectory chart<br>5. heatmap<br>6. HTML/CSV/MD 자동 생성 |
| **Acceptance Criteria** | 9 검증 변수 모두 ±20% 이내 (또는 명시적 예외) |
| **Estimated PD** | 6 PD |
| **Dependencies** | T6·T8 |
| **Verification** | dashboard CI |
| **Definition of Done** | dashboard 생성 + 도메인 검수 통과 |

##### Task T14 — 와이어 프로토콜 통합 시험 (비아 관제팀)

| 필드 | 내용 |
|---|---|
| **Goal** | 비아 관제 환경에서 WS+REST 통합 시험 (제3자 검증) |
| **Gap ID** | (V4) |
| **Phase** | 3 |
| **Inputs** | T11 · [05-wire-protocol.md](05-wire-protocol.md) §10 |
| **Outputs** | 비아 관제팀 시험 리포트 |
| **Sub-tasks** | 1. 비아 관제팀에 endpoint 제공<br>2. polling latency 측정<br>3. WS 재연결 시험<br>4. 메시지 손실율 측정<br>5. 임베드 iframe 시연 |
| **Acceptance Criteria** | latency ≤1초 · 재연결 정상 · 손실 ≤0.1% · 임베드 정상 |
| **Estimated PD** | 4 PD (외주) + 비아 관제팀 측정 시간 |
| **Dependencies** | T11 |
| **Verification** | 비아 관제팀 서명 리포트 |
| **Definition of Done** | 서명 리포트 + 02 §5 첨부 |

##### Task T15 — Foundry 대량 생성 + 라벨 검증

| 필드 | 내용 |
|---|---|
| **Goal** | 시드 16개 × 매트릭스 = ≥10만 장 생성 + COCO 검증 |
| **Gap ID** | (V5) |
| **Phase** | 3 |
| **Inputs** | T10 |
| **Outputs** | s3://phytosim/foundry/ (≥10만 장) · 통계 리포트 |
| **Sub-tasks** | 1. 매트릭스 실행<br>2. 라벨 클래스 분포 통계<br>3. mask 비공백 비율 확인<br>4. COCO 파서 무오류 검증<br>5. 가림 attribute 분포 |
| **Acceptance Criteria** | ≥10만 장 · COCO PASS · mask 비공백 100% |
| **Estimated PD** | 5 PD (러닝타임 별도, ~3일 컴퓨팅) |
| **Dependencies** | T10 |
| **Verification** | pycocotools |
| **Definition of Done** | 통계 리포트 + 02 §7 첨부 |

##### Task T15b — In-app onboarding tour

| 필드 | 내용 |
|---|---|
| **Goal** | 페르소나별 5분 가이드 tour |
| **Gap ID** | G15 |
| **Phase** | 3 |
| **Inputs** | T9·T10·T11 · [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §5 |
| **Outputs** | `src/onboarding/Tour.tsx` + 3 모드 × 5단계 |
| **Sub-tasks** | 1. 라이브러리 선택 (react-joyride 등)<br>2. Workbench tour<br>3. Foundry tour<br>4. Twin tour |
| **Acceptance Criteria** | 신규 사용자 5분 안에 모드별 핵심 행위 1회 완수 |
| **Estimated PD** | 5 PD |
| **Dependencies** | T9·T10·T11 |
| **Verification** | V8 사용자 테스트 |
| **Definition of Done** | merge + 사용자 테스트 결과 |

##### Task T15c — KPI dashboard

| 필드 | 내용 |
|---|---|
| **Goal** | 활성 시나리오·통과율·임베드 uptime·Foundry 처리량·환류 사례 dashboard |
| **Gap ID** | G17 |
| **Phase** | 3 |
| **Inputs** | T11b · [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §2 |
| **Outputs** | `src/admin/KpiDashboard.tsx` · `metrics/` |
| **Sub-tasks** | 1. 메트릭 수집기<br>2. 8개 KPI 카드<br>3. 임계 alarm<br>4. 분기별 히스토리 |
| **Acceptance Criteria** | 8 KPI 모두 표시 · 임계 alarm 동작 |
| **Estimated PD** | 6 PD |
| **Dependencies** | T11b |
| **Verification** | dashboard 시연 |
| **Definition of Done** | merge + 비아 PM sign-off |

#### Phase 4 — 검수

##### Task T16 — V1~V8 통과 보고

| 필드 | 내용 |
|---|---|
| **Goal** | V1~V8 항목별 PASS/FAIL 증빙 수집 |
| **Gap ID** | — |
| **Phase** | 4 |
| **Inputs** | Phase 3 모든 산출 · [01-statement-of-work.md](01-statement-of-work.md) §7 |
| **Outputs** | `verification-report.md` + 증빙 첨부 |
| **Sub-tasks** | 1. V1~V8 자동 통과 결과 수집<br>2. 제3자 검증 (V4·V8) 코디네이션<br>3. 도메인 검수 (V1·V3) 코디네이션 |
| **Acceptance Criteria** | V1~V8 모두 PASS 또는 명시적 예외 사유 |
| **Estimated PD** | 3 PD |
| **Dependencies** | Phase 3 전체 |
| **Verification** | 비아 PM·관제팀·도메인 sign-off |
| **Definition of Done** | sign-off |

##### Task T17 — 완료보고서 작성 (산출물 b)

| 필드 | 내용 |
|---|---|
| **Goal** | [02-final-report-template.md](02-final-report-template.md) 양식 빈칸 채워 제출 + annexes/A~F 폴더 채움 |
| **Gap ID** | — |
| **Phase** | 4 |
| **Inputs** | T16 결과 · Phase 3 모든 산출 |
| **Outputs** | `02-final-report-completed.md` + `annexes/A~F/*` |
| **Sub-tasks** | 1. §1~§14 빈칸 채움<br>2. annexes/A 스크린샷 캡처<br>3. annexes/B Reference Truth dashboard 첨부<br>4. annexes/C COCO 샘플<br>5. annexes/D 임베드 영상<br>6. annexes/E OSS license inventory<br>7. annexes/F 인수 산출물 docs |
| **Acceptance Criteria** | 02 양식 100% 채움 · annexes/A~F 모두 채움 · 비아 검수 통과 |
| **Estimated PD** | 5 PD |
| **Dependencies** | T16 |
| **Verification** | 비아 sign-off |
| **Definition of Done** | 02 + annexes/ commit + sign-off |

### 3.9 Definition of Done — 공통 체크리스트

모든 Task에 적용. Task Card의 "Definition of Done" 외에 다음 공통 항목 모두 충족:

- [ ] 코드가 main에 merge
- [ ] PR에 screenshot 또는 GIF 첨부 (UI 작업 시)
- [ ] playwright probe spec 또는 unit test 1건 이상 PASS
- [ ] [CLAUDE.md](../../CLAUDE.md) 규약 준수 (logger·coordinate·mesh anchor)
- [ ] architecture spec test 회귀 없음
- [ ] frame hash CI 회귀 없음 (의도 변경 시 RFC + 업데이트 PR)
- [ ] PR description에 Task ID + Gap ID 명시
- [ ] 외주 ↔ 비아 cross-review 1회

### 3.10 외주 주간 Standup 양식

매주 1회 (월요일 권장) 외주 → 비아 PM에게 다음 양식으로 보고. Jira/Linear 댓글로도 가능.

```markdown
## Phytosim Weekly Standup — Week NN (YYYY-MM-DD)

### 지난 주 완료
- T___ (Goal): merge URL, screenshot URL
- ...

### 이번 주 In progress
- T___: 진행률 NN%, blocker (있다면)
- ...

### 다음 주 계획
- T___
- ...

### 위험 / blocker
- (위험 ID 또는 신규)

### 비아 액션 필요
- (의사결정 요청, 자산 추가 제공 등)

### KPI 진척
- 활성 시나리오: NN/20
- 시나리오 통과율: NN%
- Foundry 누적: NN k frames
```

## §4. 자산 활용 (외주 단가 절감)

| 자산 | 절감 효과 |
|---|---|
| [packages/tomato-engine/](../../packages/tomato-engine/) | C1~C6 재작성 회피 (수 주 절감) |
| [src/scene/greenhouse/](../../src/scene/greenhouse/) | E1~E5 재작성 회피 |
| [src/_archive/](../../src/_archive/) | Robot/UI 단축 (복원 가이드 제공) |
| [`_capture.mjs`](../../_capture.mjs)·probe spec | Foundry 시작점 |
| Calibration Reference Pack v0.1 | Reference Truth 시드 |

## §5. 위험 매트릭스

| ID | 위험 | 영향 | 확률 | 대응 |
|---|---|---|---|---|
| R1 | 외주사 성과 미달 | 高 | 中 | [01-statement-of-work.md](01-statement-of-work.md) §12 평가표 + MS1·MS2 조기 게이트, 부분 인수 옵션 |
| R2 | Babylon 한계 (실시간 occlusion 60fps) | 中 | 中 | offline 캡처 분리 ([07-foundry-batch-and-labels.md](07-foundry-batch-and-labels.md) §mask render), R&D spike Phase 0 |
| R3 | 일정 지연 | 中 | 中 | MVP 우선 + cuttable scope (§7), 추가 리소스 옵션 |
| R4 | 컨소시엄 로봇 H/W 사양 미확정 | 中 | 中 | URDF placeholder + Mock 로봇으로 unblock |
| R5 | 정책 변화 (스마트팜 정부 정책) | 中 | 低 | 거버넌스 board 분기 검토 |
| R6 | 데이터 권리 분쟁 (실측·합성 IP) | 高 | 低 | [01-statement-of-work.md](01-statement-of-work.md) §13 + 사전 계약 명문화 |
| R7 | 비아 관제 시스템 마이그레이션 | 中 | 低 | API 계층 추상화, 메시지 스키마 versioning |
| R8 | 외주 인수 후 유지보수 책임 공백 | 高 | 中 | owner 구조 + 4주 페어 + 90일 워런티 ([09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §Maintainership) |
| R9 | 시나리오 카탈로그 stale | 中 | 高 | KPI 임계 + 갱신 SLA + alert |
| R10 | Crop SSOT 위반 (모드별 분기) | 高 | 中 | architecture spec test로 CI 강제 |
| R11 | archive 코드 Babylon API 호환성 (Iter 35 이후) | 中 | 中 | 복원 시 회귀 검증, Phase 1 초기에 빠른 spike |
| R12 | mesh ID 규약 미합의로 segmentation mask 불안정 | 高 | 中 | 외주 초기 mesh ID 규약 합의 의무 |
| R13 | 시나리오 12종 통과를 외주 단독 검증 어려움 | 中 | 中 | 비아 도메인 검수 동참 (V3 PM 30%) |

## §6. MVP — 필수 vs 확장

### 6.1 필수 (cut 불가, V1·V3·V4·V7 충족 최소)
- **C**: C1·C2·C3·C5·C6 (Crop SSOT 핵심)
- **E**: E1·E2·E3·E4·E6-sun (Greenhouse 핵심)
- **R**: R1·R3·R4·R5 (로봇·그리퍼·RGB-D·FOV)
- **T**: T1·T4·T6 (시나리오 + 작업 동기 + Composer)
- **M**: M5 web component (관제 임베드 최소)
- **D**: D1·D5 (RGB·mask·COCO)
- **U**: U1·U2 (진입·UX 최소)
- **S**: S1·S3 (Reference Truth + 결정성)
- **G**: G4·G18 (시나리오 1급 + Composer)

### 6.2 확장 (cut 가능, V2 evolution으로 미룸)
- E6-weather (안개·비·이슬)
- R7 forward kinematics + 충돌 박스
- D4·D6 배치 매트릭스 (단순 캡처로 축소)
- M3 이상 생육 / M4 가상-실제 비교
- D5 YOLO/VOC (COCO만 유지)
- WS publish 토픽 일부 (operator 권한 명령)
- 시네마틱 카메라 옵션
- In-app tour (docs로 대체 가능)

### 6.3 Cuttable 순서 (예산·일정 압박 시)
1. R7 → 2. E6-weather → 3. D5 YOLO/VOC → 4. 시네마틱 → 5. M3 이상생육 → 6. M4 가상-실제 비교 → 7. tour → 8. D4 일부 dim

## §7. 마일스톤 일정 (제안)

| MS | 시점 | 산출 |
|---|---|---|
| Phase 0 | 0~2주 | 정체성·UX 합의, 스키마 합의 |
| MS1 | 2주 | 공통 인프라 스키마 (G4·G5·G10·G14 합의서) |
| MS2 | 6주 | Phase 1 완료, 단위 데모 |
| MS3 | 12주 | Phase 2 완료, 모드 3종 동작 |
| MS4 | 16주 | Phase 3 완료, 카탈로그 ≥12종 PASS, dashboard, 대량 데이터 |
| MS5 | 18주 | 검수·완료보고서 |
| S8 인수 | 18~22주 | 4주 페어 + 워크숍 |
| S9 워런티 | 22~32주 | 90일 |

## §8. 검증 객관성 (자기검증 vs 제3자)

| 검증 항목 | 검증 주체 | 자동화 비율 |
|---|---|---|
| V1 Crop ±20% | 외주 자체 + 도메인 전문가 1인 검수 | 자동 80% + 검수 20% |
| V2 환경 규격 | 외주 자체 | 자동 100% |
| V3 시나리오 통과 | 외주 자체 + 비아 PM 검수 | 자동 70% + 검수 30% |
| V4 관제 API latency | **비아 관제팀 (제3자)** | 자동 100% |
| V5 데이터 포맷 | 외주 자체 + 외부 COCO 파서 | 자동 100% |
| V6 모드 전환 시간 | 외주 자체 | 자동 100% |
| V7 결정성 hash | CI 자동 + 비아 PM 검수 | 자동 100% |
| V8 UX 도달 시간 | **비아 사용자 테스트 (제3자)** | 수동 100% |

- 외주 self-report-only 항목: 0%.
- 제3자 검증 의무: V4 (관제팀), V8 (사용자 테스트).
- 도메인 검수: V1·V3 분기 1회.

## §9. PM 진행 추적 (비아 내부)

본 문서를 비아 내부 PM이 활용할 때:
- §3 Task 단위로 Jira/Linear 이슈 생성
- §5 위험 매트릭스를 분기 governance board에서 재평가
- §6 cuttable scope을 일정 압박 시 즉시 적용 가능한 룰북으로 활용
- §7 마일스톤을 외주 계약 지급 게이트와 동기

## §10. 한 줄

> Gap 19종 (G1~G19) 중 11종이 archive 또는 부분 자산을 활용 가능. 4팀 병렬로 Phase 0→1→2→3→4 18주 완수. MVP 잘라낼 항목은 §6.3 순서대로. 외주 자기검증 비율 0%, 제3자 검증 V4·V8 의무.
