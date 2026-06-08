# 08. Entry Architecture + UX/UI

**문서 분류**: 깊이 트랙 D · 외주 디자이너·UI 개발 spec
**문서 버전**: v1.0
**근거 plan**: [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) §3.5, §3.6, §3.7

> 도구 이름 SSOT: [src/modes/brand.ts:18](../../src/modes/brand.ts#L18) — `Phytosim` · v0.40.0 preview · "식물 생장 알고리즘 가상 환경 / Botanical Growth Algorithm Simulation"

---

## §1. 진입 아키텍처 (L0~L4)

도구가 어떤 URL/화면으로 처음 만나는지의 계층.

```
L0 Launcher       Splash / 가치명제 / 모드 선택
L1 Identity       무로그인 / 토큰 / 비아 관제 SSO
L2 Mode           Workbench / Foundry / Twin
L3 Scenario       카탈로그에서 선택 (또는 ad-hoc)
L3.5 Composer     ★ 시뮬레이션 조건 dial 정교 조정
L4 Workspace      실제 작업 화면 (3D + panel + timeline)
```

### 1.1 L3.5 Composer의 역할 (재활용성의 핵심)

시나리오는 불변 템플릿, **Composer는 그 위에서 25개 조건 dial로 fine-tune**. 결과를 새 시나리오로 저장·fork·diff·재현 키 발급 가능. 사용자별 `My Scenarios` 네임스페이스 + 공식 카탈로그 승격 절차.

상세 다이얼 카탈로그: [04-scenario-catalog.md](04-scenario-catalog.md) §3.

### 1.2 페르소나별 진입 시퀀스

| 페르소나 | 진입 URL | 경로 | 첫 도달 화면 (≤5분) |
|---|---|---|---|
| 외주 견적자 (첫 만남) | `phytosim/demo` | L0 → 시나리오 데모 1개 자동 재생 | 가치명제 5장 + 5분 데모 |
| 외주 엔지니어 | `phytosim/dev` | L0 → L2 → L3 → L3.5 → L4 | Workbench 메인 + 도크 패널 |
| 인식 알고리즘 엔지니어 | `phytosim/foundry` | L0 → L2(=Foundry) → L3 → L3.5 → L4 | Foundry 매트릭스 setup + Run |
| 비아 관제 운영자 | 비아 관제 화면 내부 (iframe) | embedded Twin → L4 | zone heatmap + 로봇 라이브 카메라 |
| 도메인 전문가 | `phytosim/calibration` | L0 → L2(=Workbench) → L3 → L3.5 → Reference Truth tab | diff dashboard + 변수 trajectory |
| 발표자/투자자 | `phytosim/showcase` | L0 → 시나리오 자동 cycle | 시네마틱 카메라로 시나리오 순회 |
| 컨소시엄 협업 | `phytosim/api/v1/*` (REST/WS) | L1 → API | JSON 응답 (UI 진입 없음) |

### 1.3 권한·Identity 정책
- **공개**: Demo / Showcase / Docs.
- **인증**: Workbench / Foundry / Reference Truth (개발자 토큰).
- **상호인증**: Twin embed (비아 관제 시스템 SSO).
- **명령 권한**: 가상→실제 명령 송신은 별도 ACL.

상세: [09-lifecycle-kpi-governance.md](09-lifecycle-kpi-governance.md) §SSO.

## §2. UX/UI 원칙 (8조)

1. **가치명제 즉시 노출** — 어디서든 V1~V5 중 현재 화면이 어떤 가치를 실현하는지 30초 안에 전달.
2. **시나리오가 first-class, 모드는 view-state** — 동일 시나리오 위에서 모드만 교체. 시나리오 ID는 URL에 직접 반영.
3. **시간 슬라이더는 글로벌** — 모든 모드 동일 위치 (하단). 0~120일 + 압축/확장.
4. **비교가 일등** — 표준 vs 측정, 가상 vs 실제, t1 vs t2를 어느 화면이든 토글 가능.
5. **PASS/FAIL은 binary로 즉시** — 검증 결과는 항상 단색 칩(녹/적/회)으로 표시.
6. **카메라 뷰는 단축키 1~9** — 객관/end-effector/로봇헤드/top-down 등.
7. **모바일은 Twin 모니터링 only** — Workbench/Foundry는 데스크탑.
8. **실시간 연결 상태는 상단 상시 노출** — WS/latency/seq lag.

## §3. 핵심 화면 와이어프레임

### 3.1 L0 Launcher (Splash)

```
┌─────────────────────────────────────────────────┐
│  Phytosim                                       │
│  식물 생장 알고리즘 가상 환경                   │
│  Botanical Growth Algorithm Simulation          │
│                                                 │
│  V1 결정 검증  V2 데이터 주조  V3 실시간 미러   │
│  V4 표준 레퍼런스      V5 통합 허브             │
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │Workbench │ │ Foundry  │ │   Twin   │         │
│  │결정 검증 │ │데이터주조│ │실시간미러│         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                 │
│  [→ 시나리오 카탈로그] [+ Composer] [docs][API] │
└─────────────────────────────────────────────────┘
```

### 3.2 L3 Scenario Picker

```
┌─────────────────────────────────────────────────┐
│ 시나리오 카탈로그   [필터: 도메인▼ 시기▼ 조건▼] │
├─────────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────┐ ┌────────────┐    │
│ │ drive-D90  │ │ thin-D70   │ │ prune-D80  │    │
│ │ 후기·역광  │ │ truss3 다중│ │ apex 적심  │    │
│ │ Twin       │ │ Workbench  │ │ Workbench  │    │
│ │ ✅ PASS    │ │ ⚠ 부분     │ │ ✅ PASS    │    │
│ └────────────┘ └────────────┘ └────────────┘    │
│                                                 │
│ [+ 새 시나리오 (Composer)]   [My Scenarios]     │
└─────────────────────────────────────────────────┘
```

### 3.3 L3.5 Composer

```
┌─────────────────────────────────────────────────┐
│ Composer: drive-D90-narrow-backlit              │
│ (base 시나리오 위에 fine-tune. Lock/Variable)   │
├─────────────────────────────────────────────────┤
│ Crop                                            │
│  day               [▓▓▓▓▓░░░░░] 90    🔒        │
│  seed              [0x42A7] [🎲] [🔒]            │
│  leafDensityScale  [▓▓▓▓▓▓░░░░] 1.15  🔒        │
│  trussTimingOffset [▓▓▓▓▓░░░░░] 0     ⚡ Var   │
│                                                 │
│ Env                                             │
│  manualHour        [▓▓▓▓▓▓▓▓░░] 17    🔒        │
│  lightingPreset    [golden ▼]         ⚡ Var   │
│  windStrength      [▓▓▓▓░░░░░░] 0.4   🔒        │
│                                                 │
│ Robot                                           │
│  model             [via-agv-6dof-v1 ▼]          │
│  endEffector       [thinning-cutter ▼]          │
│                                                 │
│ Task                                            │
│  type              [drive-traverse ▼]           │
│  targets           [bed==3 || bed==4 || bed==5] │
│                                                 │
│ [Save as scenario] [Fork] [Diff] [Seal]         │
│ [▶ Run]                                         │
└─────────────────────────────────────────────────┘
```

### 3.4 L4 Workbench

```
┌─────────────────────────────────────────────────┐
│ scenario: thin-D70-truss3-multi   [▼]  ●V1 ●V4 │
├──────┬──────────────────────────────────┬───────┤
│ Cam  │                                  │ Plant │
│ [1]  │     (3D 메인 — 작물 + 로봇)      │ Info  │
│ Obj  │                                  ├───────┤
│ [2]  │                                  │ Ref   │
│ EE   │                                  │ Diff  │
│ [3]  │                                  │ ±20%  │
│ Head │                                  ├───────┤
│      │                                  │ Task  │
│      │                                  │ [Run] │
├──────┴──────────────────────────────────┴───────┤
│ time ─◄ 0d ─────●(70d)──── 120d ►─ speed×8 [▶] │
└─────────────────────────────────────────────────┘
```

### 3.5 L4 Foundry

```
┌─────────────────────────────────────────────────┐
│ Batch Matrix Setup                              │
│  ☑ time-of-day [6, 9, 12, 15, 18]          (5) │
│  ☑ light-preset [default, overcast, …]     (4) │
│  ☑ growth-day [15..105]                    (7) │
│  ☐ leaf-perturbation                       (3) │
│  ☑ camera-angle [0..300]                   (8) │
│  ☑ camera-height [0.5..2.0]                (4) │
│  ☐ wind                                    (3) │
│  ─────────────────────────────────────────     │
│  Estimated: 4480 frames × 16 seeds = 71,680    │
│  Storage est: ~27 GB                            │
│                                                 │
│  Output: ☑ COCO  ☐ YOLO  ☐ VOC  ☑ mask  ☑ depth│
│                                                 │
│  [Run] [Schedule] [Resume]      WS ●  Q: 3 jobs │
│  Progress: ████████░░░ 71% (50,892 / 71,680)    │
└─────────────────────────────────────────────────┘
```

### 3.6 L4 Twin

```
┌─────────────────────────────────────────────────┐
│ Live 2026-06-06 11:23   WS●  lat 142ms   seq✓  │
├──────────────────────────────┬──────────────────┤
│                              │ Bed-3 zone       │
│   (온실 3D 메인)              │  task: 12 pend.  │
│   robot●                      │  ⚠ B5: anomaly   │
│   bed1 bed2 bed3 …           ├──────────────────┤
│                              │ Robot Cam Live   │
│                              │  [thumbnail]     │
│                              ├──────────────────┤
│                              │ Recent events    │
├──────────┬───────────────────┴──────────────────┤
│ Cam free │ replay ◄ 14:00 ───●(now)────────►    │
└──────────┴──────────────────────────────────────┘
```

### 3.7 Calibration tab (Reference Truth)

```
┌─────────────────────────────────────────────────┐
│ Reference Truth Calibration   ⚠ 2 vars > ±20%  │
├─────────────────────────────────────────────────┤
│ Variable: leafCount               [▼]           │
│                                                 │
│  count                                          │
│   30 │                            ╱ sim         │
│   25 │                       ╱╱╱                │
│   20 │     ┌─────────────┐ ←  ±20% band         │
│   15 │     │             ┤●  measurement (farmA)│
│   10 │     └─────────────┘                      │
│      └─────────────────────────────             │
│      D28  D56  D84  D112                        │
│                                                 │
│ Heatmap (rows: vars, cols: days)                │
│  height    │ +05 +07 +03 +12 +08 +15 +18 │      │
│  leafCount │ +28 +35 +47 +52 +27 +74 +68 │ ⚠   │
│  ...                                            │
│                                                 │
│ [Upload measurement] [Recompute] [Export HTML]  │
│                                                 │
│ Anomalies:                                      │
│  • leafCount D84: +52% > ±20%                   │
│    Actions: [Model RFC] [Re-measure] [Std RFC]  │
│             [Ignore w/ reason]                  │
└─────────────────────────────────────────────────┘
```

## §4. 핵심 UI 컴포넌트 카탈로그

| 컴포넌트 | 위치 | 책임 |
|---|---|---|
| **TimelineBar** | 전역, 하단 | 0~120일 + 압축/확장, 시나리오 키 이벤트 마커 |
| **CameraDock** | 모드별, 좌측 | 1~9 단축키, 썸네일 프리뷰 |
| **ValueChip** | 전역, 헤더 | 현재 화면이 실현하는 V1~V5 칩 |
| **PassFailChip** | 어디서나 | 녹/적/회 binary |
| **RefDiffPanel** | Workbench/Calibration | 변수 trajectory + ±20% band |
| **ZoneHeatmap** | Twin | top-down 2.5D, 생육 단계·작업 가능·가림 색상 |
| **WireStatus** | Twin/Foundry | WS 상태·latency·seq lag |
| **ScenarioCard** | L3 | 도메인·시기·모드·이전 결과 |
| **ComposerDial** | L3.5 | 슬라이더 + Lock/Variable 토글 + 숫자 입력 |
| **ReproducibilityBadge** | 어디서나 | seal_xxx 칩, 클릭 시 재현 검증 |

## §5. 사용자 여정 (페르소나 × 단계)

| 페르소나 | First-time (≤5분) | Daily (반복) | Edge-case |
|---|---|---|---|
| 외주 견적자 | Splash → 1개 시나리오 자동 데모 | n/a | 견적 문의 시 시나리오 첨부 |
| 외주 엔지니어 | dev URL → Mode → 1개 시나리오 검증 | 시나리오 추가·디버그·PR | 시나리오 통과 실패 분석 |
| 인식 알고리즘 | foundry URL → 매트릭스 setup → 100장 시범 | 야간 배치 → 결과 다운로드 | mask 안정성 회귀 |
| 비아 관제 운영자 | embed 안 zone heatmap 자동 표시 | 작업 우선순위 결정·이상 알림 | 실시간 미러 끊김 대응 |
| 도메인 전문가 | Calibration tab → diff dashboard | 주차별 검증 | ±20% 초과 항목 조사 |
| 발표자 | showcase URL → 시나리오 cycle | 1회 데모 | 라이브 시연 실패 대비 |
| 컨소시엄 | API docs → curl 예제 | 정기 데이터 fetch | 메시지 스키마 변경 대응 |

## §6. 모바일 정책

- **Twin 모니터링 only**: zone heatmap·로봇 카메라 라이브·작업 이벤트 알림.
- Workbench / Foundry / Composer 는 데스크탑 (터치 정밀도 한계).
- 모바일 임베드: 비아 관제 모바일 앱 안에 web component 호환.

## §7. 단축키

| 키 | 동작 |
|---|---|
| 1~9 | 카메라 뷰 전환 (CameraDock) |
| Space | 시간 슬라이더 ▶/⏸ |
| ←/→ | 시간 ±1일 (Shift+: ±10일) |
| , / . | 속도 ÷2 / ×2 |
| C | Composer 열기 |
| S | 시나리오 저장 |
| ? | 단축키 도움말 |
| Ctrl+/ | docs |

## §8. 접근성

- WCAG 2.1 AA 준수 (color contrast, 키보드 nav).
- 색맹 친화 (PassFailChip: 색 + 아이콘 동시).
- 다국어: 한국어 / 영어 (Splash tagline 양 언어 노출).

## §9. 외주 작업 spec

> Task Card 상세: [03-gap-and-execution-plan.md §3.8](03-gap-and-execution-plan.md#38-task-cards-외주-즉시-작업-가능-단위).

| Task | 산출 | Task Card |
|---|---|---|
| T0b | 진입 아키텍처 L0~L4 설계 | [03 §3.8 T0b](03-gap-and-execution-plan.md) |
| T0c | UX/UI 시스템·와이어프레임 확정 (Figma 또는 동급) | [03 §3.8 T0c](03-gap-and-execution-plan.md) |
| T8b | UI 컴포넌트 라이브러리 (React + Babylon overlay) | [03 §3.8 T8b](03-gap-and-execution-plan.md) |
| T11b | Launcher + Scenario Picker (L0·L3) | [03 §3.8 T11b](03-gap-and-execution-plan.md) |
| T15b | In-app onboarding tour (페르소나별 5분 가이드) | [03 §3.8 T15b](03-gap-and-execution-plan.md) |

검증:
- V6 모드 전환 ≤1초.
- V8 신규 사용자 5분 안에 가치 이해 (비아 사용자 테스트, 제3자).

증빙 첨부: [annexes/A-screenshots/](annexes/A-screenshots/) — 모드별 메인 캡처·시나리오 갤러리·모드 전환 영상.

## §10. 한 줄

> L0~L4 5단 진입 + Composer로 정교 컨트롤 + 8 UX 원칙 + 10종 UI 컴포넌트 + 페르소나별 여정. 데스크탑 메인, 모바일은 Twin 모니터링 한정. V8은 비아 사용자 테스트로 제3자 검증.
