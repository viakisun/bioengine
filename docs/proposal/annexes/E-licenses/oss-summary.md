# OSS License Summary (S7)

**생성 시점**: 2026-06-07 (사내 구현 인수 시점)
**소스**: `npx license-checker --summary --production`

## 의존성 라이선스 분포

| 라이선스 | 개수 |
|---|---|
| MIT | 9 |
| Apache-2.0 | 5 |
| UNLICENSED | 1 (workspace package — 비아 내부) |

## GPL/AGPL 의존성

**없음** — RFP §13 IP 정책 준수. GPL/AGPL 사전 검토 결과 0건.

## 주요 의존성

- `@babylonjs/core` — Apache-2.0 (3D 엔진)
- `@babylonjs/gui` · `@babylonjs/loaders` · `@babylonjs/materials` — Apache-2.0
- `react` · `react-dom` — MIT
- `zustand` — MIT
- `zod` — MIT
- `jsonc-parser` — MIT

## 비아 워크스페이스 (UNLICENSED)

- `farmsim-root` — 비아 내부, 외부 공개 없음 (RFP §13 ip-policy.md 참조)

## 인수 시점 확인

`oss-inventory.json` (107줄) 함께 commit. 분기별 governance board에서 의존성 변화 모니터링.
