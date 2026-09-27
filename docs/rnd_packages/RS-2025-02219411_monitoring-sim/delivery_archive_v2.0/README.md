# 적심·적과 농작업 로봇 관제 시각화 시뮬레이터 시작품 — 납품 산출물 패키지

| 항목 | 내용 |
|---|---|
| 과제번호 | RS-2025-02219411 |
| 사업명 | 스마트팜 다부처패키지 혁신기술개발사업 — 과채류 맞춤형 농작업 지능로봇 및 관제 시스템 개발 및 실증 |
| 산출물명 | 적심·적과 농작업 로봇 관제 시각화 시뮬레이터 시작품 |
| 사업기간 | 2025.04.01 ~ 2027.12.31 |
| 주관기관 | 메타파머스 |
| 공동연구기관 (발주) | 주식회사 비아 |
| 납품일 | 2026.06.16 |
| 검수일 | 2026.06.17 |
| 완료일 | 2026.06.18 |
| 본 README 갱신일 | 2026.06.27 |

본 패키지는 위 과제 산출물 **11건** 과 그 보조 자료(HTML 원본 + 공용 stylesheet)를
한 디렉토리에 모은 최종 납품 패키지이다.  무결성 확인은 `MANIFEST.json`의
SHA-256 값과 `shasum -a 256 <파일>` 출력을 비교한다.

---

## ★ 검수자는 #1 부터 펴보세요

산출물 #1 [`01_Visual_Acceptance_Pack.pdf`](01_Visual_Acceptance_Pack.pdf)
은 본 시작품의 **시각 인덱스 — 운영 흐름 10컷 + 시나리오 변주 6컷 + 생육
모델 시각화 4건**.  30 초 안에 본 시작품의 가치와 동작을 파악할 수 있도록
설계되었다.  본 갤러리가 다른 10 건 산출물의 시각적 anchor 역할을 한다.

---

## 산출물 11건 (납품 본)

| # | 파일 | 형식 | 설명 |
|---|---|---|---|
| **01** | `01_Visual_Acceptance_Pack.pdf` | PDF (모노크롬) | **★ 검수자 first-stop** — 운영 흐름 10컷 + 시나리오 6컷 + 생육 모델 시각화 4건. 시각 인덱스. |
| 02 | `02_Monitoring_Sim_Build.zip` | zip | 시뮬레이터 실행 빌드 (`dist/`). 압축 해제 후 정적 호스팅 또는 `index.html` 직접 열기로 동작 |
| 03 | `03_Source_Code.zip` | zip | 시뮬레이터 소스코드 (working tree 기준) |
| 04 | `04_Detection_Models.zip` | zip | YOLOv8n ONNX + 메타데이터 + HSV 파라미터 + 추론 샘플 |
| 05 | `05_Scenario_Datasets.zip` | zip | 시나리오 카탈로그·시드·tomato-engine 모델·SCENARIO_README |
| 06 | `06_Architecture_Spec.pdf` | PDF (모노크롬) | 시스템 아키텍처 설계서 (57p) — 5 layer, 좌표계, mesh anchor, 스트림 프로토콜, **생육 모델링 chapter (15p)** 포함 |
| 07 | `07_User_Manual.pdf` | PDF (모노크롬) | 운용 매뉴얼 (27p) — 제3자 인수자 관점, 스크린샷 10장 임베드 |
| 08 | `08_Developer_Guide.pdf` | PDF (모노크롬) | 개발자/관리자 가이드 (24p) |
| 09 | `09_Inspection_Plan.pdf` | PDF (모노크롬) | 검수 환경·절차·합부 기준·도구·기록 (19p) |
| 10 | `10_Test_Report.pdf` | PDF (모노크롬) | Playwright probe 결과 + 수동 시험 결과 (15p) |
| 11 | `11_Demo_Recording.NOTE.txt` | txt | 운용 데모 녹화 placeholder — 사용자가 추후 zip 배치 |

## 보조 자료 (HTML 원본 — PDF 재출력 가능)

PDF 6건은 모두 동일 디렉토리의 `html/<n>.html` 파일을 브라우저로 열어 인쇄 →
PDF 저장으로 재생산할 수 있다.  공용 stylesheet (`html/_assets/style.css`)는
모노크롬 print 전용으로, 컬러 액센트가 0건이며, 표/코드 블록/도표/스크린샷의
편집 품질을 정밀 제어한다.

| 파일 | 설명 |
|---|---|
| `html/01_Visual_Acceptance_Pack.html` | #1의 HTML 원본 |
| `html/06_Architecture_Spec.html` | #6의 HTML 원본 |
| `html/07_User_Manual.html` | #7의 HTML 원본 (스크린샷 10건 임베드) |
| `html/08_Developer_Guide.html` | #8의 HTML 원본 |
| `html/09_Inspection_Plan.html` | #9의 HTML 원본 |
| `html/10_Test_Report.html` | #10의 HTML 원본 |
| `html/_assets/style.css` | 공용 print stylesheet (모노크롬) |
| `html/_assets/screenshots/` | 운용 매뉴얼·갤러리용 캡처 (16장) |
| `html/_assets/diagrams/` | SVG 도표 7건 (아키텍처 3건 + 생육 모델 4건) |

PDF는 다음 파이프라인으로 빌드된다 (재생산 시 동일 결과 보장).

```
markdown (delivery/sources/<n>.md)
   ↓ marked.js 18
HTML (delivery/html/<n>.html) + style.css
   ↓ Playwright Chromium page.pdf(A4)
PDF (delivery/<n>.pdf)
```

빌드 스크립트: [`scripts/build_delivery_pdfs.mjs`](../../../../scripts/build_delivery_pdfs.mjs).
실행: `node scripts/build_delivery_pdfs.mjs`.

---

## 디렉토리 구조

```
delivery/
├── README.md                              ← 본 문서
├── MANIFEST.json                          ← 무결성·메타 인덱스 (sha256·size)
├── sources/                               ← markdown 원본 (재생산 input)
│   ├── 01_Visual_Acceptance_Pack.md
│   ├── 06_Architecture_Spec.md
│   ├── 07_User_Manual.md
│   ├── 08_Developer_Guide.md
│   ├── 09_Inspection_Plan.md
│   └── 10_Test_Report.md
├── html/                                  ← HTML 원본 (PDF 재출력 가능)
│   ├── _assets/
│   │   ├── style.css                       (공용 monochrome print CSS)
│   │   ├── screenshots/                    (운용·갤러리 16장)
│   │   └── diagrams/                       (아키텍처 3건 + 생육 4건 SVG)
│   ├── 01_Visual_Acceptance_Pack.html
│   ├── 06_Architecture_Spec.html
│   ├── 07_User_Manual.html
│   ├── 08_Developer_Guide.html
│   ├── 09_Inspection_Plan.html
│   └── 10_Test_Report.html
├── 01_Visual_Acceptance_Pack.pdf          ← ★ 검수자 first-stop
├── 02_Monitoring_Sim_Build.zip
├── 03_Source_Code.zip
├── 04_Detection_Models.zip
├── 05_Scenario_Datasets.zip
├── 06_Architecture_Spec.pdf
├── 07_User_Manual.pdf
├── 08_Developer_Guide.pdf
├── 09_Inspection_Plan.pdf
├── 10_Test_Report.pdf
└── 11_Demo_Recording.NOTE.txt
```

---

## 검증 절차 (수령측)

1. **시각 인덱스 먼저 확인**
   - `01_Visual_Acceptance_Pack.pdf` 를 펴서 본 시작품의 동작·시나리오·생육 모델을 30초 안에 파악.
2. **무결성 확인**
   ```sh
   cd delivery
   shasum -a 256 *.zip *.pdf *.txt
   # MANIFEST.json 의 sha256 값과 1:1 비교
   ```
3. **zip 무결성**
   ```sh
   for z in *.zip; do unzip -t "$z" >/dev/null && echo "OK: $z" || echo "FAIL: $z"; done
   ```
4. **시뮬레이터 실행**
   ```sh
   mkdir -p _run && cd _run
   unzip ../02_Monitoring_Sim_Build.zip
   npx serve .        # 또는 index.html 더블클릭
   ```
5. **PDF 6종 가독성 확인** — 각 PDF 1페이지 시각 확인 (한글 깨짐 0).
6. **HTML 직접 인쇄 (선택)** — `delivery/html/<n>.html` 을 브라우저로 열어 Cmd-P → Save as PDF.
7. **시험 결과 매트릭스 확인** — `10_Test_Report.pdf` §4.

---

## 산출물 #11 (데모 녹화) 처리

- 현재 `11_Demo_Recording.NOTE.txt` placeholder.
- 사용자가 권장 시나리오에 따라 녹화한 mp4/webm zip을 같은 위치에 두면 완결.
- 그 시점에 `MANIFEST.json`의 #11 항목 sha256·size_bytes를 재계산하여 갱신.

---

## 카탈로그 v2.0 변경 이력

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-06-22 | 1.0 | 초기 10건 (Build/Source/Models/Scenarios/Architecture/User/Developer/Inspection/Test/Demo) |
| 2026-06-22 | 1.1 | HTML 원본 5건 aux 추가 (PDF 재출력 가능) |
| 2026-06-22 | 1.2 | 생육 모델링 chapter 추가 (06 안에 14p) |
| 2026-06-27 | **2.0** | **시각 수용 갤러리 #1 신설**, 기존 10건 모두 +1 시프트 (11건 총원). 행정 docx 6건 재생성 |

---

## 문의 / 보완 요청

검수 결과 부적합 또는 보완사항 발견 시 발주측(주식회사 비아) 담당자에게 통보 →
주관기관 측에서 수정 산출물 재납품 → 재검수.  보완 절차 상세는
`09_Inspection_Plan.pdf` §8 부적합 처리 절차 참조.
