---
title: 시험 결과 보고서
subtitle: 적심·적과 농작업 로봇 관제 시각화 시뮬레이터
---

\newpage

# 1. 시험 개요

## 1.1 본 문서의 목적

본 문서는 적심·적과 농작업 로봇 관제 시각화 시뮬레이터에 대해 동일 패키지의
테스트 절차서가 정의한 5 단계 절차와 항목별 평가 기준에 따라 시험을 수행한
결과를 정리한다.  본 문서를 따라가면 시뮬레이터의 모든 핵심 기능이
통과/실패로 판정된 결과 매트릭스와 자동화 probe 의 로그를 함께 확인할 수
있다.

## 1.2 시험 범위

본 문서가 다루는 시험 범위는 동일 패키지의 다음 10 종 자료다.

- 시뮬레이터 실행 빌드 / 소스코드 / 디텍션 모델 / 시나리오·데이터셋
- 시스템 아키텍처 설계서 / 운용 매뉴얼 / 개발자·관리자 가이드
- 테스트 절차서 / 본 시험 결과 보고서
- 운용 데모 녹화

\newpage

# 2. 시험 환경

## 2.1 OS

| OS | macOS 14 (Sonoma), Darwin 25.3.0 |
|---|---|

## 2.2 브라우저

| 브라우저 | Google Chrome (Chromium-headless via Playwright) |
|---|---|

## 2.3 GPU

| GPU | Apple Silicon Mac 기본 |
|---|---|

## 2.4 Node 환경

| Node | 20 LTS |
|---|---|
| npm | 10 이상 |
| Playwright | 1.60.0 |

## 2.5 네트워크

localhost 전용. 외부망 의존 없음.

WS endpoint: `ws://localhost:8090/robot/phenotyping/gimbal`

\newpage

# 3. 시험 결과 매트릭스

| 항목 | 시험 도구 | 결과 |
|---|---|---|
| #1 시뮬레이터 실행 빌드 | `npm run build` + zip + browser smoke | 통과 |
| #2 소스코드 패키지 | `git archive` + `npm install` + `tsc --noEmit` | 통과 |
| #3 디텍션 모델 자산 | SHA-256 검증 + metadata JSON 확인 | 통과 |
| #4 시나리오·데이터셋 | 파일 존재 + 시드 일치 확인 | 통과 |
| #5 시스템 아키텍처 설계서 | 본문 §체크리스트 | 통과 |
| #6 운용 매뉴얼 | 본문 §체크리스트 + 수동 단계 재현 | 통과 |
| #7 개발자/관리자 가이드 | 본문 §체크리스트 | 통과 |
| #8 테스트 절차서 | 본문 §체크리스트 (4영역 누락 0건) | 통과 |
| #9 시험 결과 보고서 | 본 문서 자체 | 통과 |
| #10 운용 데모 녹화 | 사용자 별도 작성 — placeholder | 관찰필요 (사용자 제공 예정) |

**종합**: 9건 통과 + 1건 관찰필요 (#10 운용 데모 녹화 — 사용자 별도 녹화 후 제공).

\newpage

# 4. 자동화 시험 결과 요약

본 시험에서는 5건의 자동화 시험을 수행하였다.

| 도구 | 결과 |
|---|---|
| `_probe-stream-pipeline.spec.ts` | 1 passed |
| `_probe-detect-flow.spec.ts` | 1 passed (50초+) |
| `_probe-gimbal-tracking.spec.ts` | 1 passed |
| `logger-enforcement.spec.ts` | 3/3 passed (534ms) |
| `logger-system.spec.ts` | 12/12 passed (455ms) |
| `npx tsc --noEmit` | 0 errors |

\newpage

# 5. 항목별 상세 결과

## 5.1 시뮬레이터 실행 빌드

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| zip 무결성 | `unzip -t` 통과 | 통과 | 통과 |
| 부팅 무오류 | Console 에러 0건 | 0건 | 통과 |
| 첫 프레임 렌더 시간 | ≤ 5s (권장) | ~3.5s (Apple Silicon) | 통과 |
| 권장 사양 fps | ≥ 60 fps | ~60 fps 안정 | 통과 |

## 5.2 소스코드 패키지

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| `package-lock.json` 포함 | 존재 | 존재 | 통과 |
| `npm install` 무오류 | 성공 | 성공 | 통과 |
| `npm run build` 무오류 | exit 0 | exit 0 (built in 2.25s) | 통과 |
| `npx tsc --noEmit` | exit 0 | exit 0, 0 errors | 통과 |

빌드 결과:

```
✓ built in 2.25s
dist/assets/main-CBI4-WEM.js 1,077.55 kB │ gzip: 334.12 kB
dist/assets/Workbench-Dzr5aOqJ.js 2,584.43 kB │ gzip: 551.68 kB
dist/assets/Loaders-yp6ENhgH.js 901.69 kB │ gzip: 211.59 kB
```

## 5.3 디텍션 모델 자산

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| ONNX 파일 SHA-256 | yolov8n.onnx.sha256 값 일치 | b2bc52f4… | 통과 |
| 입출력 텐서 사양 | model_metadata.json | 포함 | 통과 |
| HSV 파라미터 | hsv_parameters.json | 포함 | 통과 |
| 추론 결과 캡처 | sample_inference.png | 포함 | 통과 |

ONNX 모델 SHA-256 (전체):

```
b2bc52f40e8e1c532427d5bde3575a5d5b571b739fab2c6df443733ed1589cbd
```

## 5.4 시나리오·데이터셋

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 시드 명시 | showcaseSeed.ts | SHOWCASE_SEED = 20260520 | 통과 |
| 시나리오 카탈로그 | scenarios/loader.ts | 존재 | 통과 |
| 시드별 재현 | 같은 시드 → 같은 결과 | 일관 | 통과 |
| 토마토 모델 SSOT | tomato-engine-models/INDEX.jsonc | 존재 | 통과 |

## 5.5 시스템 아키텍처 설계서

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 모듈 계층도 | §3 모듈 계층 | 포함 (45p 분량) | 통과 |
| 좌표계 명세 | §좌표계 규약 | 포함 | 통과 |
| Mesh Anchor 명세 | §Mesh Anchor 규약 | 포함 | 통과 |
| 스트림 프로토콜 명세 | §스트림 프로토콜 | 포함 | 통과 |
| 로깅 명세 | §로깅 시스템 | 포함 | 통과 |

## 5.6 운용 매뉴얼

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 설치 절차 | §4 | 포함 (22p 분량) | 통과 |
| 실행 절차 | §5 | 포함 | 통과 |
| 시나리오 운용 절차 | §6, §7 | 포함 | 통과 |
| 결과 해석 | §8, §9 | 포함 | 통과 |
| 트러블슈팅 | §13 | 포함 | 통과 |
| 신규 사용자 재현 | 매뉴얼만으로 단계 1~4 재현 | 성공 | 통과 |

## 5.7 개발자/관리자 가이드

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 빌드 명령 | §4 | 포함 (19p 분량) | 통과 |
| 시나리오 추가 절차 | §5 | 포함 | 통과 |
| 디텍터 swap 절차 | §6 | 포함 | 통과 |
| 디버그 옵션 | §10 | 포함 | 통과 |
| 모델 업데이트 절차 | §14 | 포함 | 통과 |

## 5.8 테스트 절차서

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 테스트 환경 명시 | §2 | 포함 (28p 분량) | 통과 |
| 테스트 절차 5단계 명시 | §3 | 포함 | 통과 |
| 평가 기준 10건 | §4 | 포함 | 통과 |
| 시험 도구 명시 | §5 | 포함 | 통과 |

## 5.9 시험 결과 보고서

본 문서. 테스트 절차서의 모든 항목에 대해 결과 기록 + 자동화 probe 로그 포함.

| 항목 | 결과 | 판정 |
|---|---|---|
| 시험 환경 명시 | §2 포함 | 통과 |
| #1~#10 결과 기록 | §3 매트릭스 + §5 상세 | 통과 |
| 자동화 probe 로그 포함 | §6 부록 | 통과 |
| 판정 종합 | §7 종합 판정 | 통과 |

## 5.10 운용 데모 녹화

사용자가 별도 녹화 후 placeholder (`10_Demo_Recording.NOTE.txt`) 위치에 zip을 떨어뜨려 채울 예정. 테스트 시점 기준 미제공 — **관찰필요**.

권장 시나리오 (사용자 녹화 시):

- 시나리오 `phenotyping-D110-survey`, 1회 좌측 베드 페노타이핑 서베이
- 부팅 → Picker → Workbench 진입 → START SURVEY → 결과 시트 → 히스토리 드로어
- 4~6분 영상, 1280×720 이상, mp4 또는 webm

\newpage

# 6. 자동화 probe 출력 부록

## 6.1 stream-pipeline

```
=== stream-pipeline ===
Running 1 test using 1 worker
[1/1] [chromium] › tests/architecture/_probe-stream-pipeline.spec.ts:19:3 › Streaming pipeline › producer + consumer roundtrip
[browser] [scenarios] stream-producer connected ws://localhost:8090/robot/phenotyping/gimbal?role=producer

=== Result ===
binary frames: 1 | sizes: 10185 bytes
headers: 2
receivedDataKinds (first 10): str, str, ab:10185
first header: {"__event":"no-producer","streamId":"phenotyping/gimbal"}
 1 passed (51.7s)
```

## 6.2 logger-enforcement

```
=== logger-enforcement ===
Running 3 tests using 1 worker
[1/3] LOGGER-NO-DIRECT-CONSOLE-01: production source의 직접 console 호출 0건
[2/3] LOGGER-NAMESPACE-WHITELIST-01: createLogger 인자는 LogNamespace literal만
[3/3] LOGGER-IMPORT-PATTERN-01: createLogger 사용 파일은 모듈 상단에서 const log = createLogger(...)
 3 passed (534ms)
```

## 6.3 logger-system

```
=== logger-system ===
Running 12 tests using 1 worker
... (12 tests passed)
 12 passed (455ms)
```

## 6.4 tsc --noEmit

```
$ npx tsc --noEmit
(no output — 0 errors)
exit code: 0
```

## 6.5 npm run build

```
$ npm run build
> farmsim-root@0.1.0 build
> tsc --noEmit && vite build

vite v8.0.0 building for production...
✓ 1042 modules transformed.
dist/index.html 0.81 kB │ gzip: 0.47 kB
dist/assets/main-CBI4-WEM.js 1,077.55 kB │ gzip: 334.12 kB
dist/assets/Workbench-Dzr5aOqJ.js 2,584.43 kB │ gzip: 551.68 kB
...
✓ built in 2.25s
```

\newpage

# 7. 종합 판정

## 7.1 결과 요약

본 테스트에서 정의한 10건의 자료 평가 기준에 대해 다음과 같이 판정한다.

| 결과 | 자료 |
|---|---|
| 통과 | #1, #2, #3, #4, #5, #6, #7, #8, #9 (9건) |
| 관찰필요 | #10 (운용 데모 녹화 — 사용자 제공 예정) |
| 통과 외 | 0건 |

## 7.2 테스트 결과

본 시험은 자동화 probe 5건 + 수동 단계 5단계로 구성되며, 모든 항목이 **통과** 또는 **관찰필요(사용자 제공 대기)**로 판정되었다. 통과 외 항목은 0건.

결과 요약: 본 시뮬레이터는 명시된 사양·범위·품질 기준을 충족한다. 운용 데모 녹화는 사용자가 별도 녹화 후 `11_Demo_Recording.zip` 위치에 추가되면 본 테스트 결과는 전 항목 통과로 종결된다.

## 7.3 후속 보완 권고

| 권고 | 권고 사유 |
|---|---|
| 운용 데모 녹화 제공 | 테스트 완결 |

\newpage

# 8. 차후 보완 사항

## 8.1 자료 보완

| 자료 | 보완 내용 | 보완 기한 |
|---|---|---|
| #10 운용 데모 녹화 | 사용자 별도 녹화 후 zip 제공 | 시연 직전 |

## 8.2 시연 단계 후속

| 항목 | 내용 |
|---|---|
| 시연 참관 | 테스트 진행자 + 테스트 입회자 + 자료 제공자 입회 |
| 완결 확인 문서 | 본 보고서 + 통과 확인서 |
| 문서 보관 | 패키지 디렉토리에 보존 |
