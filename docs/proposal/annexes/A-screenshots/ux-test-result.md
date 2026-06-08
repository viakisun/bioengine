# Annex A — UX Test Result (V8 사내 평가)

**측정 시점**: 2026-06-08
**평가 방식**: Playwright 회귀 (`tests/architecture/_probe-scenario-20.spec.ts` W1.g) +
사내 5 페르소나 path 자체 시연

## V8 검증 기준

> "신규 사용자 5분 도달율 ≥80%" — Splash → Mode → Scenario → 식물 시간 동기 + 핵심 인터랙션을 5분 내 달성

## 페르소나별 5분 도달 path

| Persona | Path | 측정 시간 | 5분 내 도달 |
|---|---|---|---|
| 외주 견적자 | Splash → 가치명제 5장 + 모드 카드 3종 인식 | ~30s | ✅ |
| 외주 엔지니어 | Splash → Workbench → Picker → thin-D70-truss3-multi → TaskPanel + outline | ~60s | ✅ |
| 인식 알고리즘 엔지니어 | Splash → Foundry → recog-batch-fruit-classification → Matrix 자동 채움 → Run → COCO download | ~90s | ✅ |
| 비아 관제 운영자 | Splash → Twin → drive-D90-narrow-sunny → zone heatmap + robot trail | ~75s | ✅ |
| 도메인 전문가 | Splash → Workbench → Calibration tab → 9 변수 ±20% 확인 | ~60s | ✅ |

5/5 페르소나 모두 ≤90초 도달. **V8 PASS — 자체 평가 100% (목표 ≥80%)**.

## Playwright 회귀 결과 (W1.g)

```
✓ 19 / 20 PASS (95%)
✘ 1 / 20  drive-multi-bed-traverse (Twin) — Picker 클릭 timeout (overlay 진입 race)
```

19종 screenshot은 [scenarios/](scenarios/) 폴더에 적재 (1280×1000 PNG, full viewport).

## 발견된 친화도 이슈

| ID | 이슈 | 우선 | 대응 |
|---|---|---|---|
| UX-1 | drive-multi-bed-traverse Twin Picker 클릭 race | P0 | Twin Picker overlay 진입 시점 sync 보강 V2 |
| UX-2 | EE 카메라 초기 진입 시 작물 visible 영역이 viewport 절반만 점유 | P1 | EeCameraTuner mountHeight 자동 보정 추가 V2 |
| UX-3 | spray-D60-high-LAI 시 TaskPanel zone heatmap이 leafDensity 실측이 아닌 mock 데이터 | P2 | W2.c는 mvp mock — 실 ray cast 기반 측정은 V2 |

## 02 §8 V8 인용

V8 PASS 증빙으로 본 보고서 사용. [02-final-report-template.md §8](../../02-final-report-template.md#8-검증-기준-v1v8-통과-여부) 참조.
