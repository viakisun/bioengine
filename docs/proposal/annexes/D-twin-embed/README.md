# Annex D — Twin Embed & Wire Protocol

**책임**: 외주사 + 비아 관제팀
**채움 시점**: T11·T14 (Phase 2~3) 완료 시
**검수**: 비아 관제팀 (V4 PASS 판정 — 제3자 검증)

## 채워야 할 파일

### 임베드 시연
- `embed-screenshot.png` — 비아 관제 시스템 안에 `<phytosim-twin>` web component iframe 표시
- `mirror-sync.mp4` — 가상↔실제 동기화 영상 (30~60초)
- `mode-transition.mp4` — 모드 전환 ≤1초 (V6) — A-screenshots에도 가능

### 와이어 프로토콜
- `wire-protocol-final.md` — 토픽 명세 최종판 (외주가 채움)
- `ws-traffic.png` — Chrome DevTools WS 트래픽 1분 캡처
- `ws-traffic.log` — 위와 같은 시점의 raw WS 메시지 dump

### 비아 관제팀 측정 (제3자)
- `via-control-team-report.pdf` — 비아 관제팀 서명 리포트
  - 측정 항목: WS latency 평균/p95/p99, 재연결 동작, 메시지 손실율, 임베드 안정성
  - V4 PASS/FAIL 결정 + 서명

## 검증 절차

[05-wire-protocol.md](../../05-wire-protocol.md) §10 + [03-gap-and-execution-plan.md](../../03-gap-and-execution-plan.md) §8 참조.

1. 외주가 endpoint·web component 제공
2. 비아 관제팀이 자체 환경에서 시험
3. polling latency 측정 → ≤1초 PASS 기준
4. WS 재연결 (exponential backoff) 시험
5. 메시지 손실율 ≤0.1% 확인
6. 임베드 iframe 안정성 (CSP·CORS·postMessage 화이트리스트)
7. 관제팀 sign-off

## 검수 체크리스트

- [ ] embed-screenshot.png에 parent 관제 UI + phytosim Twin iframe 모두 표시
- [ ] mirror-sync.mp4 ≥30초
- [ ] wire-protocol-final.md가 [05-wire-protocol.md](../../05-wire-protocol.md) 스키마와 일치
- [ ] ws-traffic.png에 latency 통계 sidebar
- [ ] **비아 관제팀 서명 리포트** (V4 핵심 증빙) ⚠ 누락 시 인수 불가
- [ ] V4 PASS 결정 기록
