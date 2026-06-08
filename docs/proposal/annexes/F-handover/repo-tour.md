# Repo Tour (S7 인수 가이드)

S1~S7 구현 후의 저장소 구조 walkthrough. 새 개발자가 30분 안에 코드 위치 파악.

## 최상위 구조

```
_FarmSim/
├── packages/
│   ├── tomato-engine/        Crop SSOT (TOMSIM/TOMGRO)
│   └── tomato-geometry/      식물 기하학
│
├── src/
│   ├── app/                  App.tsx (mode dispatcher) + SinglePlantApp (legacy)
│   ├── core/                 Determinism (seed lock + SeededRng) ★ S1.g
│   ├── hud/                  TimelineBar · ValueChip · CameraDock ★ S1/S4
│   ├── modes/
│   │   ├── brand.ts          Phytosim 정체성 + 가치명제 V1~V5 ★ S1.a
│   │   ├── registry.ts       5 모드 등록 (Workbench·Foundry·Twin + legacy 2) ★ S1.b
│   │   ├── EntryScreen.tsx   Splash + 가치명제 카드 + 모드 grid ★ S1.c
│   │   ├── ModeCard.tsx      coming-soon 처리 + valueProps 칩 ★ S1.b
│   │   ├── workbench/        Workbench overlay + RobotPlaceholder ★ S1.g/S4
│   │   ├── composer/         Composer + composerStore + MyScenarios ★ S2.b/c
│   │   ├── scenarios/        Picker (검색·필터) ★ S1.e/S2.d
│   │   ├── calibration/      Reference Truth trajectory + heatmap ★ S3
│   │   ├── foundry/          Foundry Matrix Setup + progress mock ★ S5
│   │   └── twin/             Twin zone heatmap + WireStatus + KPI ★ S6
│   ├── scenarios/
│   │   ├── types.ts          Zod schema ★ S1.d
│   │   ├── loader.ts         jsonc + import.meta.glob ★ S1.d/S2.a
│   │   └── reference/
│   │       └── literature.ts 9 검증 변수 더미 ★ S3.c
│   ├── scene/                Babylon scene · greenhouse · 식물 mesh
│   ├── state/                twinStore (zustand)
│   └── utils/
│       └── logger.ts         namespace 기반 logger (scenarios·workbench 추가) ★ S1.d
│
└── docs/proposal/            RFP 패키지 + 시나리오 + Annex (S1~S7 산출물)
    ├── 01-statement-of-work.md
    ├── 02-final-report-template.md  (S7 채움 완료)
    ├── ...
    ├── scenarios/            20종 .scenario.jsonc ★ S1.g + S2.e
    └── annexes/              A·B·C·D·E·F (E·F는 S7 skeleton)
```

## 진입점

- **dev 서버**: `pnpm dev` (Vite, port 5173 default 또는 `--port 8090`)
- **TypeScript 검증**: `npx tsc --noEmit -p tsconfig.json`
- **Engine 컴파일**: `pnpm tsc:engine`
- **GeometryDump**: `pnpm plant:dump`

## URL 기반 진입

- `/?mode=workbench` — Workbench 직진입 (selector 우회)
- `/?mode=foundry` — Foundry 직진입
- `/?mode=twin` — Twin 직진입
- `/?mode=single-plant` — legacy 직진입
- `/?quality=high` — quality override
- `/?outlineDebug=1` — leaf outline 디버그

## 주요 파일 찾기

| 기능 | 파일 |
|---|---|
| Splash 가치명제 추가 | `src/modes/brand.ts` `VALUE_PROPS` |
| 새 모드 추가 | `src/modes/registry.ts` `MODES` + `src/modes/types.ts` `ModeKey` |
| 새 시나리오 추가 | `docs/proposal/scenarios/{id}.scenario.jsonc` (자동 glob) |
| 새 Composer dial | `src/modes/composer/composerStore.ts` `DialKey` + `Composer.tsx` `DIAL_DEFS` |
| 새 카메라 view | `src/hud/CameraDock.tsx` `DEFAULT_VIEWS` |
| 새 KPI | `src/modes/twin/Twin.tsx` `KPIS` |
| 새 매트릭스 차원 | `src/modes/foundry/Foundry.tsx` `MATRIX_DIMS` |
| 새 검증 변수 | `src/scenarios/reference/literature.ts` `LITERATURE` |

## 회귀 방어선 (mvp)

- `npx tsc --noEmit` — TypeScript 컴파일 PASS 필수
- `tests/architecture/*.spec.ts` — 좌표·mesh anchor·logger 규약 (기존)
- 시드 락 (`Determinism.lockSeed`) — 시나리오 재진입 시 동일 결과

## V2 evolution 후보 (Repo 내 archived)

- `src/_archive/twin/Robot.ts` → `src/scene/robot/Robot.ts` (S4 full 시)
- `src/_archive/components/TopBar.tsx` · `src/_archive/ui/ZoneCard.tsx` → Twin 임베드 (S6 full 시)
- `src/data/mockScenario.ts` → 정식 scenario catalog로 흡수됨 (S1.d 완료)
