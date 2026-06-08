# Annex B — Reference Truth

**책임**: 외주사 + 비아 도메인 전문가
**채움 시점**: T13 (Phase 3) 완료 시 자동 생성, 도메인 전문가 검수 후 확정
**검수**: 비아 도메인 전문가 (V1 PASS 판정)

## 채워야 할 파일

### 자동 생성 (T13)
- `dashboard.html` — Reference Truth dashboard (trajectory + heatmap 통합)
- `dashboard.png` — dashboard 상단 캡처 (1280px width)
- `trajectory.png` — 변수별 trajectory chart (height 예시)
- `heatmap.png` — 편차 heatmap (9 변수 × 7 시기)
- `raw.csv` — 원자료 (변수 × 일자 × deviation)
- `summary.md` — 1쪽 요약 (PASS/FAIL + 우선 검토 항목)

### 데이터 소스 (인수 시 함께 commit)
- `literature.json` — 문헌 표준 범위 (TOMSIM/TOMGRO/Gillaspy 등)
- `standard-ranges.json` — 거버넌스 board 합의본
- `measurements/` — 실측 CSV 폴더 (인수 시점까지 누적된 실측)
  - `measurements/B-2026-W14-farm-A.csv` (예시 형식)

## 검증 절차

[06-reference-truth-railway.md](../../06-reference-truth-railway.md) §4 참조.

1. 시뮬레이션 실행 (deterministic seed × N)
2. 일자별 변수 dump
3. `standard-ranges.json` 로드 후 diff
4. ±20% 초과 항목 fail 표시
5. dashboard 자동 생성
6. 도메인 전문가 검수 → `summary.md` 코멘트

## 검수 체크리스트

- [ ] dashboard.html 외부 열림 정상
- [ ] 9 검증 변수 모두 trajectory 포함
- [ ] heatmap 9 × 7 매트릭스 색상 정상
- [ ] ±20% 통과 비율 100% 또는 명시적 예외 사유 기록
- [ ] 도메인 전문가 sign-off in `summary.md`
- [ ] `literature.json` 출처 명시
- [ ] `measurements/` 농가 동의서 확인 (`E-licenses/` 폴더에 동의서 사본)
