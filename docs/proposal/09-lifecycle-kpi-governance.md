# 09. Lifecycle · KPI · Governance · Procurement · SSO · Maintainership

**문서 분류**: 통합 운영 문서 · PM·도메인 전문가·관제 통합·인수 owner
**문서 버전**: v1.0
**근거 plan**: [/Users/adminvia/.claude/plans/sleepy-roaming-lagoon.md](../../../../.claude/plans/sleepy-roaming-lagoon.md) §9, §10

---

## §1. 도구 라이프사이클 (도입 → 정착 → 확장)

| 단계 | 시점 | 정의 | 종료 조건 |
|---|---|---|---|
| L1 도입 | 외주 진행 중 | Phase 0~3 완료 | V1~V8 PASS, 완료보고서 인수 |
| L2 정착 | 외주 인수 후 6개월 | 비아 관제에 흡수, 합의 시나리오 ≥12종 | §2 KPI 모두 임계 도달 |
| L3 확장 | 정착 후 | 신규 작목·새 로봇 모델, V2 evolution | 추가 작목 1종 또는 시즌 1회 통과 |
| L4 회수 | 후속 사업 | 데이터·시나리오·표준 모델을 차기 과제로 이전 | 결과물 archive |

## §2. KPI (도구 성공의 측정 기준)

| KPI | 임계 | 측정 방법 |
|---|---|---|
| 활성 시나리오 카탈로그 수 | ≥20 | `scenarios/` 디렉토리 count |
| 시나리오 검증 통과율 | ≥90% | CI 결과 집계 |
| Twin 임베드 uptime | ≥99% | 비아 관제 모니터링 |
| Foundry 처리량 | ≥10k frames/day | Foundry 진행률 로그 |
| Reference Truth 통과 변수 비율 | 100% | dashboard 자동 집계 |
| 컨소시엄 환류 사례 | ≥5/분기 | 파트너 회의록 |
| 신규 사용자 5분 도달율 | ≥80% | onboarding analytics |
| 메시지 스키마 안정성 | 6개월 무파괴 변경 | semver 로그 |

KPI 베이스라인 측정: [02-final-report-template.md](02-final-report-template.md) §9.

## §3. 거버넌스

| 영역 | 결정권자 | 절차 |
|---|---|---|
| 시나리오 카탈로그 승인 | 비아 PM | PR 리뷰 + 도메인 1인 코멘트 |
| 표준 생육 모델 변경 | 농생물 도메인 전문가 + 비아 R&D | RFC + Reference Truth 통과 확인 |
| 메시지 스키마 versioning | 비아 백엔드 PM | semver + 6개월 backward compat |
| 라벨 스키마 변경 | 인식 알고리즘 파트너 합의 | RFC + 영향도 평가 |
| 로봇 모델 추가 | 비아 H/W + 외주 | URDF spec 검수 |
| Reproducibility Seal 폐기 | 비아 PM | 폐기 사유 기록 |

### 3.1 시나리오 라이프사이클 거버넌스
```
draft (개인) → review (org) → catalog (official, 비아 PM 승인) → deprecated
```
- draft: 누구나
- review: org admin
- catalog: 비아 PM + 도메인 1인
- deprecated: 비아 PM (사유 기록)

### 3.2 Governance Board
- 멤버: 비아 PM · Tech Lead · 도메인 전문가 (+ 컨소시엄 파트너 1인 옵션)
- 주기: 분기 1회
- 안건: KPI 검토 · 표준 변경 RFC · 스키마 변경 · anti-pattern 모니터 · MVP 재정의

## §4. Anti-pattern (실패 시나리오 사전 경고)

| Anti-pattern | 증상 | 방어 |
|---|---|---|
| 도구가 단순 시각화로 전락 | 검증·데이터 export 사용 0 | KPI 임계 미달 시 알람 |
| 시나리오 카탈로그 stale | 3개월 무갱신 | 갱신 SLA + 자동 알림 |
| 와이어 프로토콜 ad-hoc 확장 | 사용자별 토픽 fork | 스키마 PR 강제 |
| Reference Truth 자기충족 | 측정값 없이 모델끼리만 비교 | 분기별 실측 주입 |
| 모드별 코드 분기 | Crop SSOT 위반 | architecture spec test |
| 가상↔실제 동기화 흐름 단절 | 데이터 입력 stale | seq lag 알람 |
| 발표용 화면이 실제 사용 화면과 분리 | 데모 모드 별도 코드 | 시네마틱은 옵션으로만 |
| Composer가 Save 없이 ad-hoc만 | "재활용" 가치 미실현 | KPI: 카탈로그 등록률 |

## §5. 학습 / Onboarding

| 자료 | 대상 | 형식 |
|---|---|---|
| In-app tour | 모든 페르소나 | 5단계 가이드 (Workbench / Foundry / Twin 각) |
| 5분 영상 | Splash 진입자 | 임베드 |
| 샘플 시나리오 (`hello-*`) | 신규 사용자 | 자동 로드 3종 |
| Docs | 외주·내부 owner | docs/ 폴더 (API · scenario schema · governance) |
| Internal training | 비아 내부 | 1회 세션, 외주 인수 시 |
| 외주 ↔ 비아 페어 개발 | 인수 시 | 4주 |
| 컨소시엄 워크숍 | 파트너 | 1회 (인수 직전) |

## §6. 결정성·재현성 회귀 방어선

도구가 검증 환경으로 신뢰받으려면 "같은 입력 → 같은 출력"이 깨지지 않아야 함.

### 6.1 방어선
| 방어선 | 메커니즘 |
|---|---|
| **Frame hash** | 시나리오+시드 → 특정 frame의 RGB+depth+mask hash. CI reference set 보유. |
| **Trajectory hash** | 시뮬레이션 0~120일 final state hash. 빠른 회귀 감지. |
| **Random source 통제** | `Math.random`·`Date.now()`·`crypto.randomUUID()` 직접 호출 금지. architecture spec test로 lint. |
| **외부 entropy 격리** | 시나리오 시작 시 timestamp·환경변수 픽스. |
| **순서 보장** | 시뮬레이션 step은 단일 thread 순차. |

### 6.2 회귀 감지 워크플로우
```
1. CI: 시나리오 카탈로그의 reference hash bundle 저장
2. PR마다 hash diff 자동 비교
3. 깨지면 reviewer가 의도 변경 vs 회귀 판정
4. 의도 변경이면 (a) RFC → (b) reference hash 업데이트 PR → (c) 비아 PM 승인
5. 회귀면 PR 반려
```

[06-reference-truth-railway.md](06-reference-truth-railway.md) §7 참조.

### 6.3 Reproducibility Seal
조건+시드의 hash. 누구나 키로 동일 시뮬 재현. 발급·저장·검증 절차: [06-reference-truth-railway.md](06-reference-truth-railway.md) §8.

## §7. Reference Truth 실측 주입 채널

도메인 전문가 워크플로우 + 데이터 소스 3종 + 4-액션 절차: [06-reference-truth-railway.md](06-reference-truth-railway.md) §3, §6.

요약:
- 정적: `reference/literature.json`
- 동적: `reference/measurements/<batch-id>.csv`
- 합의: `reference/standard-ranges.json` (governance board가 통합)

## §8. SSO / 권한 모델 (비아 관제 통합)

### 8.1 SSO
- 비아 관제 시스템의 OIDC IdP를 신뢰. 도구는 OIDC client.
- JWT 기반 세션. Refresh ≤30일, access token ≤24시간.
- 임베드 시 parent-frame OIDC token relay (postMessage 화이트리스트).

### 8.2 역할
| Role | 권한 요약 |
|---|---|
| `viewer` | Twin view 읽기 전용 |
| `operator` | Twin view + `/robot/cmd` publish |
| `engineer` | Workbench / Foundry / 시나리오 편집 |
| `domain-expert` | Reference Truth 측정 업로드 + 표준 범위 RFC |
| `admin` | 시나리오 승인 + 표준 변경 최종 승인 |

### 8.3 권한 매트릭스
| 영역 | viewer | operator | engineer | expert | admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Twin view | ✓ | ✓ | ✓ | ✓ | ✓ |
| Twin `/robot/cmd` | | ✓ | | | ✓ |
| Workbench 시나리오 실행 | | | ✓ | ✓ | ✓ |
| Workbench 시나리오 편집 | | | ✓ | | ✓ |
| Foundry 배치 실행 | | | ✓ | | ✓ |
| Reference 측정 업로드 | | | | ✓ | ✓ |
| 시나리오 카탈로그 승인 | | | | | ✓ |
| 표준 범위 변경 | | | | (2인 review) | ✓ |

### 8.4 임베드 보안
- iframe sandbox + CSP `frame-ancestors`.
- CORS 화이트리스트 (비아 관제 도메인만).
- postMessage 토픽 스키마 validation.

상세 메시지: [05-wire-protocol.md](05-wire-protocol.md) §7.

## §9. Maintainership (외주 인수 후 코드 소유)

### 9.1 인수 시점
- Phase 4 검수 PASS → 코드 권리 비아 귀속.
- 외주사 **90일 워런티** (버그 수정 책임).
- 외주사 ↔ 비아 페어 개발 **4주** (외주 1인 + 비아 1인).
- 외주 종료 직전 **1회 워크숍** (전 페르소나 대상).

### 9.2 비아 내부 owner 구조
| Owner | 책임 |
|---|---|
| Tech Lead (R&D 1인) | 아키텍처·통합·표준 변경 최종 승인 |
| Crop SSOT Owner (도메인 1인) | Reference Truth·표준 범위 |
| Mode Owners (3인 또는 겸직) | Workbench / Foundry / Twin |
| Infra Owner | WS/REST/CI/배포 |
| Governance Board | PM + Tech Lead + 도메인 전문가, 분기 1회 |

### 9.3 인수 산출물 (외주 의무)

모든 인수 산출물은 [annexes/F-handover/](annexes/F-handover/) 폴더에 정리. 채움 가이드: [annexes/F-handover/README.md](annexes/F-handover/README.md).

- `architecture.md` + `adrs/` (아키텍처 + ADR ≥5건) → [annexes/F-handover/](annexes/F-handover/)
- `runbook/` (배포·장애·복구·SLA) → [annexes/F-handover/runbook/](annexes/F-handover/)
- `onboarding/` (새 개발자 3일 진입 가이드) → [annexes/F-handover/onboarding/](annexes/F-handover/)
- Architecture spec tests (§6 회귀 방어선) → 코드 저장소 + handover docs에 가이드
- PR 템플릿 + 체크리스트 → [annexes/F-handover/pr-template.md](annexes/F-handover/)
- 코드 주석은 "비자명한 WHY" 한정 ([../../CLAUDE.md](../../CLAUDE.md) 글로벌 룰 준수)
- OSS license inventory → [annexes/E-licenses/oss-inventory.json](annexes/E-licenses/)
- 실측 농가 동의서 사본 → [annexes/E-licenses/consent-forms/](annexes/E-licenses/)
- ownership.md (외주 → 비아 owner 인계 매핑) → [annexes/F-handover/](annexes/F-handover/)

### 9.4 추가 옵션
- V2 evolution 우선 협상권 (외주사)
- Monthly retainer (긴급 지원 SLA)
- 분기 1회 코드 리뷰 (외주사 비아 합동)

## §10. 발주 운영 (사업 사이클)

### 10.1 S1~S10 단계
| 단계 | 비아 액션 | 외주사 액션 | 산출물 / 게이트 |
|---|---|---|---|
| S1 발주 준비 | 본 RFP 패키지 정리 | n/a | RFP V1.0 |
| S2 입찰 공고 | 후보사에 RFP 송부 + Q&A | 견적·제안서·참고 사례 | 제안서 |
| S3 평가 | 평가표 적용, 후보 2~3사 short-list, 시연 요청 | `hello` 시나리오 시연 | 평가표 + 시연 결과 |
| S4 계약 | NDA·라이선스·IP·SLA 합의 → 계약 | 동일 | 계약서 |
| S5 착수 | 자산 인계 | Phase 0 시작 | Phase 0 산출물 |
| S6 개발 | 마일스톤 단위 검수 (MS1~MS5) | Phase 1~3 실행 | 마일스톤별 데모 |
| S7 검수 | V1~V8 확인, 도메인 검수, KPI 베이스라인 | Phase 4 보고 | 완료보고서 |
| S8 인수 | 4주 페어 + 워크숍 1회 + 90일 워런티 시작 | 지식 이전 | 인수확인서 |
| S9 운영 | 비아 내부 owner 운영 + 분기 governance | (warranty 동안) 버그 수정 | 운영 리포트 |
| S10 V2 옵션 | 우선 협상권 행사 여부 결정 | V2 제안 | V2 SoW |

### 10.2 외주사 평가표 (100점)
[01-statement-of-work.md](01-statement-of-work.md) §12 참조.

## §11. 위험·MVP·Cuttable

[03-gap-and-execution-plan.md](03-gap-and-execution-plan.md) §5, §6 참조.

## §12. IP·라이선스·데이터 권리

### 12.1 권리 매트릭스
| 자산 | 권리자 | 라이선스 |
|---|---|---|
| 본 RFP 패키지 | 비아 | NDA |
| 외주사 작성 코드 | 비아 (인수 후) | 비아 결정 |
| Crop / Greenhouse SSOT (기존) | 비아 | 비아 결정 |
| OSS 의존성 | 원 저작자 | license inventory 필수 |
| 합성 데이터 | 비아 (자산), 컨소시엄 합의 공유 | 합의문 |
| 실측 데이터 | 측정 제공자 + 비아 사용권 | 동의서, 익명화 |
| 시나리오 카탈로그 | 비아 + 작성자 | 공식 승격 시 비아 |
| Reproducibility Seal | 공개 | n/a |

### 12.2 데이터 권리 세부
- **실측 농가**: 개인정보·영업비밀 보호. 동의서 + 익명화 + 사용 범위 제한.
- **합성**: 비아 보유, 컨소시엄 파트너 공유 범위 합의. 외부 공개 시 라이선스.
- **OSS**: `npm ls` 기반 inventory 인수 산출물 포함. GPL/AGPL 사전 검토.
- **모델 가중치 (Foundry 데이터로 학습)**: 컨소시엄 공통 자산 후보.

## §13. 검증 객관성 (자기검증 vs 제3자)

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

## §14. 청자별 요약본 (3종)

본 RFP 패키지의 동일 내용을 3개 청자에게 다르게 재구성. 모두 본 패키지에 포함.

### 14.1 A. 1페이지 Manifesto (투자자·심사·발표 청자)
- 도구의 의의 + 5 가치명제 + 1 다이어그램 (모드 3개 + 공통 인프라).
- "왜 3D인가" 1단락.
- KPI 5개.
- 분량: A4 1쪽.
- 기반 자료: [README.md](README.md) §2~§3 + [01-statement-of-work.md](01-statement-of-work.md) §3~§4.

### 14.2 B. Executive Summary (PM·발주자·컨소시엄 리더)
- README + SoW 요지 + 사업 사이클 + 위험·MVP + IP + KPI.
- 모드 와이어프레임 1개 (Twin) + 시나리오 카탈로그 요지.
- 분량: A4 5~8쪽.
- 기반 자료: [README.md](README.md) 전체 + [01-statement-of-work.md](01-statement-of-work.md) §§1~10 + [03-gap-and-execution-plan.md](03-gap-and-execution-plan.md) §§5~6.

### 14.3 C. Technical Summary (외주 엔지니어·도메인 전문가·내부 owner)
- 전체 RFP 패키지 + 4개 깊이 트랙 + 실행 트랙 + 라이프사이클·거버넌스·SSO·Maintainership.
- 분량: 본 패키지 전체 + 부록 (스키마·메시지·라벨).
- 기반 자료: 본 패키지 전체.

## §15. plan/문서 메타 (versioning · 검수 · 갱신)

### 15.1 Versioning
- 본 RFP 패키지: `v1.0`.
- 갱신 trigger:
  - 시나리오 카탈로그 추가 (분기 1회)
  - 기술 변화 (Babylon major, Crop SSOT 변경)
  - 거버넌스 board 분기 회의 후
  - 외주 마일스톤 검수 후 plan 조정

### 15.2 검수자
- **본 RFP 검수**: 비아 PM + Tech Lead + 도메인 전문가 + (선택) 외부 자문
- **최종 승인**: 비아 임원진

### 15.3 모호성 검수 (외주 발주 전)
- 외주사 후보 1~2사에 RFP 사전 공유 → 모호한 항목 Q&A 받음
- 모호성 발견 시 RFP 수정 → v1.1
- 외주 계약 시점에 최종 RFP v1.x를 계약 첨부

### 15.4 갱신 절차
1. 변경 제안 → GitHub PR (또는 `docs/proposal/CHANGELOG.md`)
2. 검수자 리뷰
3. 분기 governance board 승인
4. 버전 증가 + 외주사·컨소시엄 통지

## §16. 한 줄

> 도구가 외주 인수 후에도 멈추지 않으려면, 라이프사이클 4단·KPI 8개·거버넌스 6영역·anti-pattern 8종·결정성 5방어선·실측 4-액션·SSO 5역할·인수 owner 5인·사업 사이클 10단계·검증 객관성 8행·청자 요약 3종이 모두 살아있어야 한다. 본 문서가 그 운영 매뉴얼이다.
