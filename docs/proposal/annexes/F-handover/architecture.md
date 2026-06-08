# Architecture (S1~S7 사내 구현 인수)

**작성 시점**: 2026-06-07
**대상**: 비아 내부 owner (Tech Lead · Mode Owners · Infra Owner)

## 시스템 개요

```
┌─────────────────────────────────────────────────────────────┐
│  EntryScreen (Splash)                                       │
│    ├─ Phytosim 정체성 + 가치명제 V1~V5 카드                  │
│    ├─ Phytosim Modes: Workbench · Foundry · Twin            │
│    └─ Legacy: single-plant · greenhouse                     │
└─────────────────────────────────────────────────────────────┘
                       │ mode 선택
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  App.tsx mode dispatcher                                    │
│    workbench  → Workbench overlay                           │
│    foundry    → Foundry page                                │
│    twin       → Twin page                                   │
│    legacy     → SinglePlantOverlay (호환성 보존)             │
└─────────────────────────────────────────────────────────────┘
```

## 모듈 구조

| 경로 | 책임 | Owner |
|---|---|---|
| `src/modes/brand.ts` | Phytosim 정체성 SSOT + 가치명제 V1~V5 | Tech Lead |
| `src/modes/registry.ts` | 5 모드 등록 + PRIMARY/LEGACY 분리 | Tech Lead |
| `src/modes/workbench/` | Workbench overlay + Picker/Composer/Calibration | Mode Owner (Workbench) |
| `src/modes/foundry/` | Foundry page (Matrix Setup + progress mock) | Mode Owner (Foundry) |
| `src/modes/twin/` | Twin page (Zone heatmap + KPI + WireStatus) | Mode Owner (Twin) |
| `src/modes/calibration/` | Reference Truth Calibration (trajectory + heatmap) | Crop SSOT Owner |
| `src/modes/composer/` | L3.5 Composer + composerStore + myScenariosStore | Mode Owner (Workbench) |
| `src/modes/scenarios/Picker.tsx` | 시나리오 카탈로그 picker | Mode Owner (Workbench) |
| `src/scenarios/` | scenario types + loader + literature | Crop SSOT Owner |
| `src/core/Determinism.ts` | seed lock + SeededRng (xorshift32) | Tech Lead |
| `src/hud/{TimelineBar,ValueChip,CameraDock}.tsx` | 공통 UI 컴포넌트 | Mode Owner (Workbench) |
| `packages/tomato-engine/*` | Crop SSOT (TOMSIM/TOMGRO 기반) | Crop SSOT Owner |
| `src/scene/greenhouse/*` | Greenhouse SSOT | Tech Lead |

## 데이터 흐름

1. **시나리오 로드**: `loader.ts` → `import.meta.glob('../../docs/proposal/scenarios/*.scenario.jsonc')` → jsonc-parser → Zod validate → `getCatalog()`
2. **시드 락**: `Determinism.lockSeed(scenario.crop.seed)` → `getActiveSeed()` 헤더 표시
3. **모드 전환**: App.tsx에서 mode === 'workbench' | 'foundry' | 'twin' 분기. Suspense lazy chunk.
4. **My Scenarios 영속**: `zustand/persist` → `localStorage['phytosim:my-scenarios:v1']`

## 향후 통합 포인트 (V2 evolution 후보)

1. **TimelineBar ↔ SkinMeshPlant.day hook**: Iter 35 PR4에서 제거된 `twinStore.currentDay/setDay` 재구축 필요.
2. **archive Robot.ts 복원**: [src/_archive/twin/Robot.ts](../../src/_archive/twin/Robot.ts) → `src/scene/robot/Robot.ts` (S4 full).
3. **Foundry runner**: Playwright headless worker pool + sqlite job queue + pycocotools 검증.
4. **WS+REST 서버**: `packages/phytosim-api/` 신설 + OIDC SSO + iframe sandbox.
5. **Reference Truth dashboard**: growth-calibration scripts 실제 호출, `literature.json` 정식 도입.

## 호환성 보존

- Legacy `single-plant`·`greenhouse` 모드 그대로 동작.
- BabylonEngine·SinglePlantApp·SceneInfrastructure 미변경 — Iter 35 회귀 위험 없음.

## 추가 ADR (예정)

- ADR-001 mesh-id-strategy (S4 mask render 전제)
- ADR-002 mask-render-pass-choice (옵션 B 별도 패스)
- ADR-003 deterministic-rng-pattern (현 xorshift32 mvp → Phase 0 합의 후 확정)
