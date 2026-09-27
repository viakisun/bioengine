# 개선 플랜 — 적심·적과 농작업 로봇 관제 시각화 시뮬레이터 시작품 제작 증빙 문서

작성일 2026.06.22. 작성자 작업자.

---

## 0. 산출물 카운트 정리 (질문 답)

용어가 세 가지를 모두 가리킬 수 있어 혼동을 피하기 위해 분리합니다.

| 분류 | 개수 | 내용 |
|---|---:|---|
| **사업 산출물 (work.deliverables)** | **10건** | 시뮬레이터 실행 빌드 / 소스코드 패키지 / 디텍션 모델 자산 / 시나리오·데이터셋 / 시스템 아키텍처 설계서 / 운용 매뉴얼 / 개발자·관리자 가이드 / **검수 플랜** / 검수 시험 결과 보고서 / 운용 데모 녹화 |
| **검수 기준 (work.inspection_criteria)** | 10건 (1:1 매핑) | 각 산출물별 정량/정성 기준 명시 |
| **증빙 문서 패키지 (생성된 파일)** | **6 docx + 2 md** | 01 기안서·02 과업지시서·04 발주서·05 계약서·09 검수확인서·10 완료보고서 + 00 생성문서 목록 + 업체_제출요청자료 |

업체에 “산출물 몇 개?”를 묻는 답은 **10건**. 사내 결재·정산 패키지에 들어가는 문서는 **8개 파일** (docx 6 + md 2).

---

## 1. 현재 상태 요약

`scripts/audit_package.py`의 자동 정합성 감사 결과:

| 문서 | 점수 | 정합성 이슈 |
|---|---:|---|
| 01 기안서 | 100 | 0건 |
| 02 과업지시서 | 100 | 0건 |
| 04 발주서 | 100 | 0건 |
| 05 계약서 | 100 | 0건 |
| 09 검수확인서 | 100 | 0건 |
| 10 완료보고서 | 100 | 0건 |

자동 감사는 통과했으나 **본문 직접 검토 결과 builder 하드코딩 텍스트에서 하드웨어/시제품 잔재가 남아 있는 곳이 5건** 식별됨. audit는 `forbidden_terms`(A-SW · 통합제어기 · 실차 시험 · 무인자율)만 검사하므로 더 일반적인 하드웨어 어휘(`시제품 본체` · `BOM` · `도면자료` · `전장회로도` · `부품 모델`)는 통과하고 만 것이 원인.

---

## 2. 본문 직접 검토 결과 — 문서별 이슈 매트릭스

### 2-1. 01 기안서

| 위치 | 현재 표현 | 문제 | 우선도 |
|---|---|---|---|
| P33 (제작 사양 끝 단락) | “…세부 수치 또는 **부품 모델**은 업체 견적·제작 가능성 검토 과정에서 동등 이상 범위로 협의할 수 있다.” | 시뮬레이터는 부품이 아닌 라이브러리·구현 수단 | LOW |
| 그 외 | — | 양호 | — |

### 2-2. 02 과업지시서

| 위치 | 현재 표현 | 문제 | 우선도 |
|---|---|---|---|
| (없음) | — | 본문 정합. 적심·적과 관제 컨텍스트로 일관 | — |

### 2-3. 04 발주서  ★ 가장 큰 잔재

| 위치 | 현재 표현 | 문제 | 우선도 |
|---|---|---|---|
| **TABLE 4 R1** (발주 조건) | **수량 / “시제품 본체 및 납품자료 1식”** | 시뮬레이터에 “시제품 본체”는 부적절 | **HIGH** |
| **TABLE 4 R2** (발주 조건) | **산출물 / “BOM, 사양서, 도면자료, 전장회로도, 모터드라이버 및 MDAS 관련 자료 포함”** | 완전한 하드웨어 잔재. 우리 산출물 10건과 무관 | **CRITICAL** |

### 2-4. 05 계약서

| 위치 | 현재 표현 | 문제 | 우선도 |
|---|---|---|---|
| (없음) | — | TABLE 5에 산출물 10건이 정확히 명시되어 양호 | — |

### 2-5. 09 검수확인서  ★ 두 번째 큰 잔재

| 위치 | 현재 표현 | 문제 | 우선도 |
|---|---|---|---|
| **P14** (검수 의견 본문) | “검수자는 과업지시서, 발주서 및 납품자료 목록을 기준으로 **시제품 본체, 외관 상태, 구동부 구성, 조작부 구성, BOM·사양서·도면자료·구동자료 제출 여부**를 확인하였다.” | 시뮬레이터에 ‘외관/구동부/조작부/BOM/도면’ 모두 부적절 | **CRITICAL** |
| TABLE 2 마지막 행 “보완사항 / 검수 기준상 즉시 보완이 필요한 사항 없음 / 없음” | 검수 항목과 보완사항이 같은 표 안에 있음 | 가독성·정렬상 별도 행 분리 | MEDIUM |
| P21 (검수 사진) | “검수 사진은 별도 첨부자료로 관리한다.” | `inspection_photos` 빈 배열이라 자리표시자 | MEDIUM (사용자 확보) |

### 2-6. 10 완료보고서

| 위치 | 현재 표현 | 문제 | 우선도 |
|---|---|---|---|
| P10 (보고 요지) | “…수행업체는 2026.06.16 **시제품 본체 1식**과 납품자료를 제출하였고…” | “시제품 본체”는 시뮬레이터에 부적절. ‘시뮬레이터 시작품 1식’이 옳음 | HIGH |
| TABLE 3 (산출물 표) | 산출물 10건 정확히 매핑 | 정합 | — |
| 그 외 | — | 양호 | — |

### 2-7. 부가 (목록 / 업체_제출요청자료)

| 위치 | 평가 |
|---|---|
| 00 생성문서_목록.md | 정합 |
| 업체_제출요청자료.md | 정합. 단 “수량 1식”에 “시제품” 어휘 없음(좋음) |

---

## 3. 개선 우선순위와 조치

### CRITICAL — builder 하드코딩 잔재 (반드시 수정)

발주서·검수확인서 본문의 “BOM, 사양서, 도면자료, 전장회로도, 모터드라이버, MDAS, 시제품 본체, 외관/구동부/조작부” 표현이 `scripts/builders/purchase_order.py` 와 `scripts/builders/inspection.py` 안에 하드코딩되어 있음.  이전에 memo.py/task_order.py에 적용한 `_SIMULATOR_TEXTS` / `_HARDWARE_TEXTS` + `_texts_for(data)` 분기 패턴을 동일하게 적용해야 합니다.

대상 파일:

- `scripts/builders/purchase_order.py` — 발주서 “수량 / 산출물 / 보완 / 자료 사용” 표 분기
- `scripts/builders/inspection.py` — 검수 의견 본문 분기

### HIGH — 완료보고서 본문 잔재

- `scripts/builders/completion.py` 의 보고 요지 단락에서 “시제품 본체”를 work_type별 분기로 (`시뮬레이터 시작품`).

### MEDIUM — 강제 사전 차단 (forbidden_terms 보강)

audit이 잡지 못한 일반 하드웨어 어휘를 `inputs/monitoring_sim_RS-2025-02219411.json` 의 `rules.forbidden_terms`에 명시 추가:

```diff
- ["무제한 유지보수", "상용 배포 포함", "AMR", "통합제어기", "A-SW", "실차 시험", "무인자율"]
+ ["무제한 유지보수", "상용 배포 포함", "AMR", "통합제어기", "A-SW", "실차 시험", "무인자율",
+  "시제품 본체", "BOM", "도면자료", "전장회로도", "모터드라이버", "MDAS", "외관 상태", "구동부 구성", "조작부 구성", "부품 모델"]
```

이렇게 두면 향후 builder 분기가 빠지더라도 audit가 즉시 잡아냄.

### MEDIUM — 검수확인서 보완사항 행 분리

`scripts/builders/inspection.py` 가 ‘검수 결과’ 별도 표를 한 번 더 만들도록 수정 (TABLE 2에서 마지막 행 빼고, 보완사항·후속 처리는 TABLE 3에서 단독 표현).

### MEDIUM — 기안서 “부품 모델” 단락

`scripts/builders/memo.py` line ≈86 부근 “상기 사양은 견적요청 및 과업지시서의 기준 사양이며, 세부 수치 또는 **부품 모델**은…” 단락을 work_type별 분기로 (`시뮬레이터` 라이브러리·구현 수단으로 협의 가능).

### LOW — 검수 사진 (사용자 작업)

검수 시 캡처 확보 후 `inputs/monitoring_sim_RS-2025-02219411.json` 의 `work.inspection_photos`에 절대경로 추가:

```jsonc
"inspection_photos": [
  {"caption": "사진 1. 시뮬레이터 부팅 화면 — 진입 직후", "path": "/Users/adminvia/.../inspection_01.png"},
  {"caption": "사진 2. PiP 위 적심·적과 디텍션 오버레이", "path": "/Users/adminvia/.../inspection_02.png"},
  {"caption": "사진 3. 좌측 베드 페노타이핑 서베이 결과 시트", "path": "/Users/adminvia/.../inspection_03.png"}
]
```

`scripts/builders/inspection.py` 가 파일이 존재하면 자동 첨부.

### INFO — 산출물 폴더 실물 자료 매칭

`work.deliverables`의 10건 (file_hint) 과 실제 납품 폴더의 파일을 `scripts/audit_delivery_package.py`로 매칭:

```bash
cd docs/rnd_doc_automation_starter
.venv/bin/python scripts/audit_delivery_package.py \
  inputs/monitoring_sim_RS-2025-02219411.json \
  --delivery <업체로부터_받은_zip_or_folder> \
  --out outputs/monitoring_sim_delivery_audit.md
```

이건 업체가 실물 자료를 보낸 뒤에 실행.

---

## 4. 실행 순서

| 단계 | 내용 | 파일 |
|---|---|---|
| 1 | `rules.forbidden_terms`에 하드웨어 어휘 10개 추가 | `inputs/monitoring_sim_RS-2025-02219411.json` |
| 2 | `purchase_order.py` 에 `_SIMULATOR_TEXTS` / `_HARDWARE_TEXTS` 분기 도입 | `scripts/builders/purchase_order.py` |
| 3 | `inspection.py` 본문 분기 + 보완사항 행 별도 표 | `scripts/builders/inspection.py` |
| 4 | `completion.py` 본문 분기 (“시제품 본체” → “시뮬레이터 시작품”) | `scripts/builders/completion.py` |
| 5 | `memo.py` 의 “부품 모델” 단락 분기 | `scripts/builders/memo.py` |
| 6 | 재생성 → 재감사 → HIGH/MEDIUM 0건 확인 | `outputs/monitoring_sim_audit.md` |
| 7 | 최종 사본 갱신 | `docs/rnd_packages/RS-2025-02219411_monitoring-sim/` |
| 8 (검수 입회 후) | `inspection_photos` 추가 → 재생성 | 동일 |
| 9 (납품 자료 수취 후) | `audit_delivery_package.py` 실행 | `outputs/monitoring_sim_delivery_audit.md` |
| 10 (업체 PDF 수취 후) | `audit_vendor_docs.py` 실행 | `outputs/monitoring_sim_vendor_audit.md` |

각 단계는 builder만 고치고 `generate_package.py` 재실행하면 끝.  손으로 docx를 절대 고치지 않습니다 (CLAUDE.md 원칙).

---

## 5. 사후 검증 체크리스트

재생성 후 다음 grep으로 잔재 0건 확인:

```bash
cd /Users/adminvia/devwork/_FarmSim/docs/rnd_doc_automation_starter
.venv/bin/python <<'EOF'
import docx, pathlib
BANS = ["시제품 본체","BOM","도면자료","전장회로도","모터드라이버","MDAS","외관 상태","구동부 구성","조작부 구성","부품 모델","A-SW","통합제어기","실차 시험","무인자율"]
for p in sorted(pathlib.Path("outputs/monitoring_sim").glob("*.docx")):
    d = docx.Document(str(p))
    text = "\n".join(par.text for par in d.paragraphs) + "\n".join(c.text for t in d.tables for r in t.rows for c in r.cells)
    hits = [b for b in BANS if b in text]
    print(f"{p.name}: {'OK' if not hits else 'FAIL — ' + ', '.join(hits)}")
EOF
```

목표: 모든 docx가 `OK`. 위 스크립트를 `scripts/check_simulator_residue.py`로 묶어 한 명령으로 만들 수도 있음.
