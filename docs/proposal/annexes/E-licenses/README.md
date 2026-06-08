# Annex E — Licenses & IP

**책임**: 외주사
**채움 시점**: S7 검수 직전 일괄 commit
**검수**: 비아 PM·Tech Lead (IP·라이선스 정합성)

## 채워야 할 파일

### OSS license inventory
- `oss-inventory.json` — `npm ls --json` 또는 동급 도구 출력
- `oss-summary.md` — 라이선스별 그룹화 (MIT / Apache 2.0 / BSD / ISC / GPL / AGPL 등)
- `oss-review.md` — GPL/AGPL 의존성 사전 검토 결과

### IP·데이터 정책 확인서
- `ip-policy.md` — 비아 결정 라이선스 (코드 비공개 / 부분 OSS / 전체 OSS)
- `synthetic-data-policy.md` — 합성 데이터 컨소시엄 공유 범위 합의문
- `consent-forms/` — 실측 농가 동의서 사본 (개인정보·영업비밀 보호)
  - `consent-forms/farm-A-2026-W14.pdf`
  - 익명화 처리 완료 명시

### 메시지 스키마·라벨 스키마 컨소시엄 합의문
- `schema-agreement.md` — 메시지 스키마·라벨 스키마 컨소시엄 sign-off

## 검증 절차

[01-statement-of-work.md](../../01-statement-of-work.md) §13 + [09-lifecycle-kpi-governance.md](../../09-lifecycle-kpi-governance.md) §12 참조.

1. `npm ls --json` 자동 생성
2. license inventory에서 모든 의존성 분류
3. GPL/AGPL 의존성에 대한 비아 R&D 결정 기록
4. 합성 데이터 라이선스 컨소시엄 합의 확인
5. 실측 농가 동의서 익명화 검증

## 검수 체크리스트

- [ ] oss-inventory.json — 모든 의존성 분류
- [ ] GPL/AGPL 의존성 0건 또는 비아 R&D sign-off
- [ ] ip-policy.md — 비아 임원진 결재
- [ ] consent-forms/ — 모든 농가 동의서 사본 + 익명화
- [ ] schema-agreement.md — 인식 알고리즘 파트너 sign-off
- [ ] 컨소시엄 합의문 모든 파트너 sign-off
