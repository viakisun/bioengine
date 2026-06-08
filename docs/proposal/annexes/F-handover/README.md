# Annex F — Handover Artifacts

**책임**: 외주사
**채움 시점**: S8 인수 (4주 페어 개발 종료 시)
**검수**: 비아 Tech Lead·Mode Owners·Infra Owner

## 채워야 할 파일

### 아키텍처
- `architecture.md` — 전체 시스템 아키텍처 + 다이어그램
- `adrs/` — Architecture Decision Records
  - `adrs/ADR-001-mesh-id-strategy.md`
  - `adrs/ADR-002-mask-render-pass-choice.md`
  - `adrs/ADR-003-deterministic-rng-pattern.md`
  - ... (Phase 0~3에서 내린 모든 주요 결정)

### Runbook
- `runbook/deploy.md` — 배포 절차
- `runbook/incident-response.md` — 장애 대응 (WS 끊김·시드 회귀·dashboard 오작동 등)
- `runbook/sla.md` — uptime·latency·복구 시간 SLA
- `runbook/rollback.md` — 롤백 절차

### Onboarding
- `onboarding/day-1.md` — 새 개발자 1일차 (저장소 클론·dev 실행·첫 PR)
- `onboarding/day-2.md` — 2일차 (모드 3종 진입·시나리오 1개 작성)
- `onboarding/day-3.md` — 3일차 (CI·spec test·Reference Truth 검증)
- `onboarding/glossary.md` — 도메인 용어 사전 (Phytomer·Gompertz·LAI·peduncle 등)

### 코드 품질·인계
- `pr-template.md` — PR 템플릿 + 체크리스트
- `architecture-spec-tests.md` — spec test 가이드 (frame hash·trajectory hash·Crop SSOT 위반 lint)
- `repo-tour.md` — 코드 구조 walkthrough (각 packages/ 와 src/ 폴더 책임)
- `bus-factor.md` — 핵심 의존성·외주 inter-personnel 인계 매핑

### 외주 → 비아 owner 매핑
- `ownership.md` — Tech Lead·Crop SSOT Owner·Mode Owners·Infra Owner에 무엇을 인계했는지 표

## 검증 절차

[09-lifecycle-kpi-governance.md](../../09-lifecycle-kpi-governance.md) §9 참조.

1. 4주 페어 개발 동안 비아 owner와 함께 작성
2. 1회 워크숍에서 전 페르소나 대상 walkthrough
3. owner별 sign-off
4. 90일 워런티 기간 동안 docs 보완 가능

## 검수 체크리스트

- [ ] architecture.md + ADRs ≥5건
- [ ] runbook 4종 모두
- [ ] onboarding 3일 가이드 + glossary
- [ ] pr-template 적용된 실제 PR ≥3건
- [ ] architecture-spec-tests CI에 통합
- [ ] ownership.md 비아 owner sign-off
- [ ] 워크숍 회의록
