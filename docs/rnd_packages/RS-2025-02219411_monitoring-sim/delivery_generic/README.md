# 적심·적과 농작업 로봇 관제 시각화 시뮬레이터 — 자료 패키지

본 패키지는 적심·적과 농작업 로봇 관제 시각화 시뮬레이터의 운영·아키텍처·
테스트 자료 11 건을 하나의 디렉토리에 모은 자료 패키지다.  무결성은
`MANIFEST.json` 의 SHA-256 값과 `shasum -a 256 <파일>` 출력을 비교하여 확인한다.

---

## 먼저 #1 부터 펴보세요

`01_Visual_Acceptance_Pack.pdf` 가 시각 인덱스 — 운영 흐름 10컷 + 시나리오
변주 6컷 + 생육 모델 시각화 4건.  30 초 안에 본 시뮬레이터의 동작과 가치를
파악할 수 있다.

---

## 자료 11건

| # | 파일 | 형식 | 내용 |
|---|---|---|---|
| 01 | `01_Visual_Acceptance_Pack.pdf` | PDF (모노크롬) | 시각 인덱스 — 운영 흐름 10컷 + 시나리오 6컷 + 생육 모델 시각화 4건 |
| 02 | `02_Monitoring_Sim_Build.zip` | zip | 시뮬레이터 실행 빌드 (`dist/`).  정적 호스팅 또는 `index.html` 직접 열기로 동작 |
| 03 | `03_Source_Code.zip` | zip | 시뮬레이터 소스코드 (working tree 기준) |
| 04 | `04_Detection_Models.zip` | zip | YOLOv8n ONNX + 메타데이터 + HSV 파라미터 + 추론 샘플 |
| 05 | `05_Scenario_Datasets.zip` | zip | 시나리오 카탈로그·시드·tomato-engine 모델·SCENARIO_README |
| 06 | `06_Architecture_Spec.pdf` | PDF (모노크롬) | 시스템 아키텍처 — 5 layer, 좌표계, mesh anchor, 스트림 프로토콜, 생육 모델링 chapter 포함 |
| 07 | `07_User_Manual.pdf` | PDF (모노크롬) | 운용 매뉴얼 — 처음 사용하는 운영자 관점, 스크린샷 10장 임베드 |
| 08 | `08_Developer_Guide.pdf` | PDF (모노크롬) | 개발자/관리자 가이드 |
| 09 | `09_Inspection_Plan.pdf` | PDF (모노크롬) | 테스트 절차서 — 환경·절차·평가 기준·도구·기록 |
| 10 | `10_Test_Report.pdf` | PDF (모노크롬) | 시험 결과 보고서 — Playwright probe 결과 + 수동 시험 결과 |
| 11 | `11_Demo_Recording.NOTE.txt` | txt | 운용 데모 녹화 placeholder — zip 배치 안내 |

## 보조 자료 (HTML 원본 — PDF 재출력 가능)

PDF 6건은 모두 `html/<n>.html` 을 브라우저로 열어 인쇄 → PDF 저장으로
재생산 가능하다.  공용 stylesheet (`html/_assets/style.css`)는 모노크롬
print 전용이다.

| 파일 | 설명 |
|---|---|
| `html/01_Visual_Acceptance_Pack.html` | #1의 HTML 원본 |
| `html/06_Architecture_Spec.html` | #6의 HTML 원본 |
| `html/07_User_Manual.html` | #7의 HTML 원본 (스크린샷 10건 임베드) |
| `html/08_Developer_Guide.html` | #8의 HTML 원본 |
| `html/09_Inspection_Plan.html` | #9의 HTML 원본 |
| `html/10_Test_Report.html` | #10의 HTML 원본 |
| `html/_assets/style.css` | 공용 print stylesheet (모노크롬) |
| `html/_assets/screenshots/` | 운용·갤러리용 캡처 (16장) |
| `html/_assets/diagrams/` | SVG 도표 7건 (아키텍처 3건 + 생육 모델 4건) |

PDF 빌드 파이프라인:

```
markdown (sources/<n>.md)
   ↓ marked.js 18
HTML (html/<n>.html) + style.css
   ↓ Playwright Chromium page.pdf(A4)
PDF (<n>.pdf)
```

---

## 디렉토리 구조

```
delivery_generic/
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
│   ├── _assets/ (style.css, screenshots/, diagrams/)
│   ├── 01_Visual_Acceptance_Pack.html
│   ├── 06_Architecture_Spec.html
│   ├── 07_User_Manual.html
│   ├── 08_Developer_Guide.html
│   ├── 09_Inspection_Plan.html
│   └── 10_Test_Report.html
├── 01_Visual_Acceptance_Pack.pdf
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

## 검증 절차

1. **시각 인덱스 먼저 확인** — `01_Visual_Acceptance_Pack.pdf` 를 펴서 본 시뮬레이터의 동작·시나리오·생육 모델을 30초 안에 파악.
2. **무결성 확인**
   ```sh
   shasum -a 256 *.zip *.pdf *.txt
   ```
3. **zip 무결성**
   ```sh
   for z in *.zip; do unzip -t "$z" >/dev/null && echo "OK: $z" || echo "FAIL: $z"; done
   ```
4. **시뮬레이터 실행**
   ```sh
   mkdir -p _run && cd _run
   unzip ../02_Monitoring_Sim_Build.zip
   npx serve .
   ```
5. **PDF 6종 가독성 확인** — 각 PDF 1페이지 시각 확인 (한글 깨짐 0).
6. **HTML 직접 인쇄 (선택)** — `html/<n>.html` 을 브라우저로 열어 Cmd-P → Save as PDF.

---

## 자료 #11 (데모 녹화) 처리

- 현재 `11_Demo_Recording.NOTE.txt` placeholder.
- 권장 시나리오에 따라 녹화한 mp4/webm zip 을 같은 위치에 두면 완결.
- 그 시점에 `MANIFEST.json` 의 #11 항목 sha256·size_bytes 를 재계산하여 갱신.
