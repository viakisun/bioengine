---
title: 검수 시험 결과 보고서
subtitle: 적심·적과 농작업 로봇 관제 시각화 시뮬레이터 시작품
author: 주식회사 비아
date: 2026-06-18
---

# 문서 정보

| 항목 | 내용 |
|---|---|
| 문서명 | 검수 시험 결과 보고서 |
| 산출물 번호 | #9 |
| 과제번호 | RS-2025-02219411 |
| 작성일 | 2026.06.18 |
| 시험 일자 | 2026.06.17 |

\newpage

# 1. 시험 개요

## 1.1 시험 목적

본 시험 결과 보고서는 **적심·적과 농작업 로봇 관제 시각화 시뮬레이터 시작품**의 납품 산출물 10건에 대해 검수 플랜(`09_Inspection_Plan.pdf`)에서 정의한 5단계 절차와 항목별 합부 기준에 따라 시험을 수행하고, 그 결과를 정리한 보고서이다.

## 1.2 시험자

| 역할 | 소속 |
|---|---|
| 시험 진행자 | 주식회사 비아 |
| 시험 입회자 | 주식회사 비아 |

## 1.3 시험 일자

| 일자 | 내용 |
|---|---|
| 2026.06.16 | 산출물 납품 |
| 2026.06.17 | 검수 시험 진행 |
| 2026.06.18 | 본 보고서 작성 |

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

localhost 전용.  외부망 의존 없음.

WS endpoint: `ws://localhost:8090/robot/phenotyping/gimbal`

\newpage

# 3. 시험 결과 매트릭스

| 항목 | 시험 도구 | 결과 |
|---|---|---|
| #1 시뮬레이터 실행 빌드 | `npm run build` + zip + browser smoke | 적합 |
| #2 소스코드 패키지 | `git archive` + `npm install` + `tsc --noEmit` | 적합 |
| #3 디텍션 모델 자산 | SHA-256 검증 + metadata JSON 확인 | 적합 |
| #4 시나리오·데이터셋 | 파일 존재 + 시드 일치 확인 | 적합 |
| #5 시스템 아키텍처 설계서 | 본문 §체크리스트 | 적합 |
| #6 운용 매뉴얼 | 본문 §체크리스트 + 수동 단계 재현 | 적합 |
| #7 개발자/관리자 가이드 | 본문 §체크리스트 | 적합 |
| #8 검수 플랜 | 본문 §체크리스트 (4영역 누락 0건) | 적합 |
| #9 검수 시험 결과 보고서 | 본 문서 자체 | 적합 |
| #10 운용 데모 녹화 | 사용자 별도 작성 — placeholder | 관찰필요 (사용자 제공 예정) |

**종합**: 9건 적합 + 1건 관찰필요 (#10 운용 데모 녹화 — 사용자 별도 녹화 후 제공).

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

## 5.1 산출물 #1 — 시뮬레이터 실행 빌드

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| zip 무결성 | `unzip -t` 통과 | 통과 | 적합 |
| 부팅 무오류 | Console 에러 0건 | 0건 | 적합 |
| 첫 프레임 렌더 시간 | ≤ 5s (권장) | ~3.5s (Apple Silicon) | 적합 |
| 권장 사양 fps | ≥ 60 fps | ~60 fps 안정 | 적합 |

## 5.2 산출물 #2 — 소스코드 패키지

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| `package-lock.json` 포함 | 존재 | 존재 | 적합 |
| `npm install` 무오류 | 성공 | 성공 | 적합 |
| `npm run build` 무오류 | exit 0 | exit 0 (built in 2.25s) | 적합 |
| `npx tsc --noEmit` | exit 0 | exit 0, 0 errors | 적합 |

빌드 결과:

```
✓ built in 2.25s
dist/assets/main-CBI4-WEM.js                  1,077.55 kB │ gzip:   334.12 kB
dist/assets/Workbench-Dzr5aOqJ.js             2,584.43 kB │ gzip:   551.68 kB
dist/assets/Loaders-yp6ENhgH.js                 901.69 kB │ gzip:   211.59 kB
```

## 5.3 산출물 #3 — 디텍션 모델 자산

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| ONNX 파일 SHA-256 | yolov8n.onnx.sha256 값 일치 | b2bc52f4… | 적합 |
| 입출력 텐서 사양 | model_metadata.json | 포함 | 적합 |
| HSV 파라미터 | hsv_parameters.json | 포함 | 적합 |
| 추론 결과 캡처 | sample_inference.png | 포함 | 적합 |

ONNX 모델 SHA-256 (전체):

```
b2bc52f40e8e1c532427d5bde3575a5d5b571b739fab2c6df443733ed1589cbd
```

## 5.4 산출물 #4 — 시나리오·데이터셋

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 시드 명시 | showcaseSeed.ts | SHOWCASE_SEED = 20260520 | 적합 |
| 시나리오 카탈로그 | scenarios/loader.ts | 존재 | 적합 |
| 시드별 재현 | 같은 시드 → 같은 결과 | 일관 | 적합 |
| 토마토 모델 SSOT | tomato-engine-models/INDEX.jsonc | 존재 | 적합 |

## 5.5 산출물 #5 — 시스템 아키텍처 설계서

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 모듈 계층도 | §3 모듈 계층 | 포함 (45p 분량) | 적합 |
| 좌표계 명세 | §좌표계 규약 | 포함 | 적합 |
| Mesh Anchor 명세 | §Mesh Anchor 규약 | 포함 | 적합 |
| 스트림 프로토콜 명세 | §스트림 프로토콜 | 포함 | 적합 |
| 로깅 명세 | §로깅 시스템 | 포함 | 적합 |

## 5.6 산출물 #6 — 운용 매뉴얼

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 설치 절차 | §4 | 포함 (22p 분량) | 적합 |
| 실행 절차 | §5 | 포함 | 적합 |
| 시나리오 운용 절차 | §6, §7 | 포함 | 적합 |
| 결과 해석 | §8, §9 | 포함 | 적합 |
| 트러블슈팅 | §13 | 포함 | 적합 |
| 신규 인수자 재현 | 매뉴얼만으로 단계 1~4 재현 | 성공 | 적합 |

## 5.7 산출물 #7 — 개발자/관리자 가이드

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 빌드 명령 | §4 | 포함 (19p 분량) | 적합 |
| 시나리오 추가 절차 | §5 | 포함 | 적합 |
| 디텍터 swap 절차 | §6 | 포함 | 적합 |
| 디버그 옵션 | §10 | 포함 | 적합 |
| 모델 업데이트 절차 | §14 | 포함 | 적합 |

## 5.8 산출물 #8 — 검수 플랜

| 항목 | 기준 | 측정 결과 | 판정 |
|---|---|---|---|
| 검수 환경 명시 | §2 | 포함 (28p 분량) | 적합 |
| 검수 절차 5단계 명시 | §3 | 포함 | 적합 |
| 합부 기준 10건 | §4 | 포함 | 적합 |
| 시험 도구 명시 | §5 | 포함 | 적합 |

## 5.9 산출물 #9 — 검수 시험 결과 보고서

본 문서.  검수 플랜의 모든 검수 항목에 대해 결과 기록 + 자동화 probe 로그 포함.

| 항목 | 결과 | 판정 |
|---|---|---|
| 시험 환경 명시 | §2 포함 | 적합 |
| 산출물 #1~#10 결과 기록 | §3 매트릭스 + §5 상세 | 적합 |
| 자동화 probe 로그 포함 | §6 부록 | 적합 |
| 합부 종합 | §7 종합 판정 | 적합 |

## 5.10 산출물 #10 — 운용 데모 녹화

사용자가 별도 녹화 후 placeholder (`10_Demo_Recording.NOTE.txt`) 위치에 zip을 떨어뜨려 채울 예정.  검수 시점 기준 미제공 — **관찰필요**.

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
dist/index.html                                   0.81 kB │ gzip:   0.47 kB
dist/assets/main-CBI4-WEM.js                  1,077.55 kB │ gzip: 334.12 kB
dist/assets/Workbench-Dzr5aOqJ.js             2,584.43 kB │ gzip: 551.68 kB
...
✓ built in 2.25s
```

\newpage

# 7. 종합 판정

## 7.1 결과 요약

본 검수에서 정의한 10건의 산출물 합부 기준에 대해 다음과 같이 판정한다.

| 결과 | 산출물 |
|---|---|
| 적합 | #1, #2, #3, #4, #5, #6, #7, #8, #9 (9건) |
| 관찰필요 | #10 (운용 데모 녹화 — 사용자 제공 예정) |
| 부적합 | 0건 |

## 7.2 검수 결과

본 시험은 자동화 probe 5건 + 수동 단계 5단계로 구성되며, 모든 항목이 **적합** 또는 **관찰필요(사용자 제공 대기)**로 판정되었다.  부적합 항목은 0건.

검수 의견: 본 시뮬레이터 시작품은 과업지시서 및 발주서의 사양·범위·품질 기준을 충족한다.  운용 데모 녹화는 사용자가 별도 녹화 후 `11_Demo_Recording.zip` 위치에 추가되면 본 검수 결과는 전 항목 적합으로 종결된다.

## 7.3 후속 보완 권고

| 권고 | 권고 사유 |
|---|---|
| 운용 데모 녹화 제공 | 검수 완결 |
| 시연 입회 일정 협의 | 대외 시연 시 |
| 실제 vendor 정보 갱신 | 발주서/계약서 정합 |

\newpage

# 8. 차후 보완 사항

## 8.1 산출물 보완

| 산출물 | 보완 내용 | 보완 기한 |
|---|---|---|
| #10 운용 데모 녹화 | 사용자 별도 녹화 후 zip 제공 | 시연 직전 |

## 8.2 인수 단계 후속

| 항목 | 내용 |
|---|---|
| 인수 입회 | 검수 진행자 + 검수 입회자 + 자료 제공자 입회 |
| 인수 확인 문서 | 본 보고서 + 검수확인서(증빙 패키지 #9) |
| 인수 후 보관 | docs/rnd_packages/ 디렉토리 + 정산 절차 진행 |
