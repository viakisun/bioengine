# Ownership (S1~S7 사내 구현 인수)

**작성 시점**: 2026-06-07
**기준 plan**: §9.9·§15.11

## 비아 내부 owner (사내 구현이므로 외주 → 비아가 아닌 비아 → 비아)

| Owner | 책임 영역 | 인계받은 코드 |
|---|---|---|
| Tech Lead | 아키텍처·통합·표준 변경 최종 승인 | `src/modes/brand.ts` · `registry.ts` · `App.tsx` · `core/Determinism.ts` · `architecture.md` |
| Crop SSOT Owner | Reference Truth · 표준 범위 · 시나리오 카탈로그 | `src/scenarios/` · `packages/tomato-engine/*` · `src/modes/calibration/*` · `literature.ts` |
| Mode Owner (Workbench) | Workbench + Composer + Picker + Camera Dock | `src/modes/workbench/*` · `src/modes/composer/*` · `src/modes/scenarios/Picker.tsx` · `src/hud/*` |
| Mode Owner (Foundry) | Foundry Matrix Setup + 실제 runner 통합 (V2) | `src/modes/foundry/*` |
| Mode Owner (Twin) | Twin zone heatmap + WS 서버 통합 (V2) | `src/modes/twin/*` |
| Infra Owner | logger · CI · 배포 | `src/utils/logger.ts` · CI (TBD) |
| Governance Board | 분기별 검토 (KPI · 표준 · anti-pattern) | docs/proposal/* · plan §15 |

## AI 협업 인계

- **Claude Code (Anthropic)**: S1~S7 supervised 구현. 향후 V2 evolution 시 동일 패턴 활용 가능.
- **Pair 작업 가이드**: 새 슬라이스 진입 시 plan §15.14 Task Card 1개 단위로 supervised request.
- **검증 체크**: 매 슬라이스 종료 시 `npx tsc --noEmit` + dev 서버 HTTP 200 + Acceptance Criteria UI 확인.

## RFP §15.2 책임자 placeholder

사내 구현이라 외주사 책임자 N/A. RFP의 `[입찰 후 확정]` marker는 그대로 유지 (V2 외주 옵션 행사 시 사용).
