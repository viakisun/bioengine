---
title: 시각 수용 갤러리 (Visual Acceptance Pack)
subtitle: 적심·적과 농작업 로봇 관제 시각화 시뮬레이터 시작품
author: 주식회사 비아
date: 2026-06-27
---

# 본 자료의 위치 — 검수자는 이것부터 펴보세요

본 갤러리는 **본 시작품의 운영 흐름·시나리오 변주·생육 모델 시각화** 를
한 PDF 로 압축한 시각 수용 자료다.  검수 입회 전·후 30 초 안에 본 시작품의
가치와 동작을 파악할 수 있도록 설계되었으며, 본 산출물이 _다른 9 건 산출물의
시각적 인덱스_ 역할을 한다.

| 구성 | 내용 | 페이지 |
|---|---|---|
| Part A | 운영 흐름 (Operation Flow) — 부팅 → Workbench → START SURVEY → 결과 시트 | 10 컷 |
| Part B | 시나리오 변주 갤러리 — drive / spray / thin / prune / phenotyping / hsv-probe | 6 컷 |
| Part C | 생육 모델 시각화 — GDD · LAI · Gompertz · cultivar 5종 비교 | 4 차트 |

각 컷은 Playwright probe 로 재현 가능하다. probe 위치는 캡션에 명시되어
있다.

---

| 항목 | 내용 |
|---|---|
| 과제번호 | RS-2025-02219411 |
| 사업명 | 스마트팜 다부처패키지 혁신기술개발사업 — 과채류 맞춤형 농작업 지능로봇 및 관제 시스템 개발 및 실증 |
| 산출물 | **#1 · 시각 수용 갤러리 (Visual Acceptance Pack)** |
| 발주처 | 주식회사 비아 |
| 작성일 | 2026.06.27 |
| 사이드매핑 | 운영 흐름은 산출물 #7 (운용 매뉴얼) 의 §5~§11 단계와 1:1 일치 |

\newpage

# Part A — 운영 흐름 (Operation Flow)

본 Part 의 10 컷은 본 시작품을 인수받은 운영자가 _순서대로_ 거치는 화면이다.
각 컷의 caption 우측에 매뉴얼 §, 우측 끝에 재현 probe 가 명시되어 있다.

## A-1.  EntryScreen — 모드 선택

![그림 A-1. 부팅 직후 ModeSelector 화면. 5종 모드 카드 (Workbench·SinglePlant·Foundry·Twin·Calibration) 중 Workbench 선택  /  매뉴얼 §5.1  /  probe: `_probe-entry-screen.spec.ts`](_assets/screenshots/06-01-boot.png)

## A-2.  로딩 화면 — 식물 인스턴스 빌드

![그림 A-2. 모드 진입 직후 로딩 화면.  식물 인스턴스 빌드 단계가 가장 오래 걸린다 (시드별 식물 군집 생성)  /  매뉴얼 §5.2  /  probe: `_probe-entry-screen.spec.ts`](_assets/screenshots/06-02-modeselect.png)

## A-3.  Workbench 진입

![그림 A-3. 첫 프레임 렌더 완료 시점. 좌측 도크·메인 카메라·우측 TaskPanel 의 3-zone 레이아웃 표시  /  매뉴얼 §5.3  /  probe: `_probe-boot-trace.spec.ts`](_assets/screenshots/06-03-workbench.png)

## A-4.  시나리오 Picker

![그림 A-4. 시나리오 Picker. 적심·적과 관제 시연용 권장 시나리오는 `phenotyping-D110-survey`  /  매뉴얼 §6.1  /  probe: `_probe-phenotyping.spec.ts`](_assets/screenshots/06-04-picker.png)

## A-5.  START SURVEY — 페노타이핑 서베이

![그림 A-5. TaskPanel 의 START SURVEY 직후. 좌측 베드 forward 스캔 진행 중  /  매뉴얼 §7.2  /  probe: `_probe-scenario-20.spec.ts (drive-D15)`](_assets/screenshots/06-05-survey.png)

## A-6.  Gimbal PiP — 짐벌 카메라 시점

![그림 A-6. PiP frame at rail X = -0.95m. REC / GIMBAL CAM / MANUAL chip 모두 표시  /  매뉴얼 §7.3  /  probe: `_probe-scenario-20.spec.ts (pip-frame)`](_assets/screenshots/06-06-pip.png)

## A-7.  디텍션 오버레이 — HSV 5-band ripeness

![그림 A-7. Workbench 우측 패널에 HSV 분류 매트릭스. 5 ripeness bin (green·breaker·turning·pink·red) 별 카운트 + 분포  /  매뉴얼 §7.4  /  probe: `_probe-detect-flow.spec.ts`](_assets/screenshots/06-07-detect.png)

## A-8.  결과 시트 (Result Sheet)

![그림 A-8. 서베이 완료 후 결과 시트.  bin별 카운트 표 + 분포 차트 + 검수 메모  /  매뉴얼 §8  /  probe: `_probe-scenario-20.spec.ts (thin-D70)`](_assets/screenshots/06-08-result.png)

## A-9.  파노라마 뷰어 — 골격 오버레이

![그림 A-9. 좌측 베드 forward 패스 파노라마. 골격 오버레이 활성  /  매뉴얼 §9  /  probe: `_probe-scenario-20.spec.ts (tune-frame)`](_assets/screenshots/06-09-pano.png)

## A-10.  디버그 옵션 — 성능 HUD

![그림 A-10. `?debug=*&quality=10` 모드의 성능 HUD (우상단 perf 패널). fps · 메모리 · WS frame rate 확인  /  매뉴얼 §11  /  probe: `_probe-boot-trace.spec.ts`](_assets/screenshots/06-10-debug.png)

\newpage

# Part B — 시나리오 변주 갤러리

본 시작품은 단일 시나리오가 아닌 _다양한 운용 조건_ 에서 동작한다.  본 Part 는
시뮬레이션 결과의 일관성을 보여주는 6 컷이다.  각 컷의 시나리오 ID 와 시드는
산출물 #5 (`05_Scenario_Datasets.zip`) 의 카탈로그와 1:1 매핑된다.

## B-1.  drive-D15 — 정착 후 15일

![그림 B-1. drive-D15-standard-sunny 시나리오. 정착 후 15일, 표준 일사. 어린 식물 군집과 traverse 동작 검증  /  scenario: `drive-D15-standard-sunny`  /  probe: `_probe-scenario-20.spec.ts`](_assets/screenshots/gallery-01-drive-D15.png)

## B-2.  drive-D45 — 정착 후 45일, 흐린 날

![그림 B-2. drive-D45-standard-overcast 시나리오. 정착 후 45일, 흐린 날. 광량 변화에 대한 디텍션 robustness 검증  /  scenario: `drive-D45-standard-overcast`  /  probe: `_probe-scenario-20.spec.ts`](_assets/screenshots/gallery-02-drive-D45.png)

## B-3.  spray-D60 — 정착 후 60일, 고LAI

![그림 B-3. spray-D60-high-LAI 시나리오. 정착 후 60일, 고밀도 엽군. 분무 시연 + LAI ≈ 2.6 환경의 occlusion 검증  /  scenario: `spray-D60-high-LAI`  /  probe: `_probe-scenario-20.spec.ts`](_assets/screenshots/gallery-03-spray-D60.png)

## B-4.  thin-D70 — 정착 후 70일, 적과

![그림 B-4. thin-D70-truss3-multi 시나리오. 정착 후 70일, 3번째 truss 다중 적과 시연. 결과 시트의 적과 권장 라벨 검증  /  scenario: `thin-D70-truss3-multi`  /  probe: `_probe-scenario-20.spec.ts`](_assets/screenshots/gallery-04-thin-D70.png)

## B-5.  prune-D80 — 정착 후 80일, 적심

![그림 B-5. prune-D80-apex-topping 시나리오. 정착 후 80일, 정단 적심 시연. apex 제거 후 측지 발달 동작 검증  /  scenario: `prune-D80-apex-topping`  /  probe: `_probe-scenario-20.spec.ts`](_assets/screenshots/gallery-05-prune-D80.png)

## B-6.  hsv-probe — 디텍션 기준선

![그림 B-6. HSV 디텍션 기준선 캡처. 5-band ripeness 분류기의 baseline calibration target  /  scenario: `phenotyping-D110-survey`  /  probe: `_probe-hsv-detection.spec.ts`](_assets/screenshots/gallery-06-hsv-probe.png)

\newpage

# Part C — 생육 모델 시각화

본 시작품의 식물은 _3D 시각 자산이 아니라 학술 backbone 기반 mechanistic
crop model 의 일일 적분 결과_ 다.  Part C 는 그 모델의 시각 증빙 4건이다.
각 차트는 `10_Test_Report.pdf` §5.3 의 자동 검증 spec 결과로 만들어진다.

## C-1.  누적 Thermal Time (GDD) — CROPGRO 표준

![차트 C-1. 22 °C 상수 환경, 120 일 — slope = 12 GDD/day. T_base 10 °C / T_max 30 °C cardinal 범위. D 25 ≈ 첫 개화, D 80~100 ≈ 첫 적과 가능 시점](_assets/diagrams/growth-gdd.svg)

## C-2.  LAI 곡선 — TOMSIM mature canopy target band

![차트 C-2. LAI 시뮬레이션 곡선 vs Heuvelink 1996 TOMSIM mature target band [3.0, 4.0].  120 일 시뮬레이션 결과 LAI ≈ 3.5  → target band 통과](_assets/diagrams/growth-lai.svg)

## C-3.  과실 Gompertz 곡선 — 3 cultivar 비교

![차트 C-3. Gillaspy 1993 3-phase + Anaya-Ramirez 2024 Gompertz fit.  Tomimaru 200 g / Cherry 20 g / Beefsteak 280 g 의 fresh-weight 곡선. 같은 모델·다른 cultivar 파라미터로 다양한 표현형 도출](_assets/diagrams/growth-gompertz.svg)

## C-4.  Cultivar 5종 핵심 파라미터

![차트 C-4. 본 시작품에 포함된 5 cultivar (tomimaru-muchoo / round-generic / cherry-generic / beefsteak-generic / roma-generic) 의 fruit mass · phyllochron · first truss node 비교.  같은 GrowthEngine 위에서 cultivar JSON 한 파일만 바꿔 동작](_assets/diagrams/growth-cultivar-compare.svg)

\newpage

# 본 갤러리의 검증

본 갤러리는 다음 자동화 spec 로 매 release 이전에 재생성된다.

| spec | 위치 | 책임 |
|---|---|---|
| `_probe-entry-screen.spec.ts` | tests/architecture/ | A-1, A-2 재현 |
| `_probe-boot-trace.spec.ts` | tests/architecture/ | A-3, A-10 재현 |
| `_probe-phenotyping.spec.ts` | tests/architecture/ | A-4 재현 |
| `_probe-scenario-20.spec.ts` | tests/architecture/ | A-5, A-6, A-8, A-9 + B-1~B-5 재현 |
| `_probe-detect-flow.spec.ts` | tests/architecture/ | A-7 재현 |
| `_probe-hsv-detection.spec.ts` | tests/architecture/ | B-6 재현 |
| `test-coremodel.ts` | packages/tomato-engine/ | C-1~C-4 의 numeric backbone |

각 캡처의 원본 PNG 는 `delivery/html/_assets/screenshots/` 에, SVG 차트는
`delivery/html/_assets/diagrams/` 에 보존되어 있다.  본 갤러리의 PDF 가
재생성될 때마다 동일 재현이 보장된다.

# 본 갤러리 외 자료

본 갤러리에서 인용된 산출물의 정식 자료는 다음을 참조한다.

| 인용 | 산출물 |
|---|---|
| 운영 절차 전 단계 | `07_User_Manual.pdf` |
| 생육 모델 학술 backbone | `06_Architecture_Spec.pdf` §"생육 모델링 (GROWTH_MODEL)" |
| 시험 결과 및 spec 결과 | `10_Test_Report.pdf` |
| 시나리오 카탈로그·시드 | `05_Scenario_Datasets.zip` |
| 운용 데모 영상 | `11_Demo_Recording.zip` (사용자 별도 녹화) |
