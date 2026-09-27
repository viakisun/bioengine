# R&D Document Automation Starter

정부연구개발사업의 시제품 제작, UX/UI, HMI 모듈, 시뮬레이터 등 과업별 증빙 문서 패키지를 반복 생성하기 위한 로컬 자동화 스타터입니다.

이 패키지의 목표는 문서 양식을 복사하는 것이 아니라, 다음 흐름을 자동화하는 것입니다.

1. 과제/과업 입력값을 하나의 JSON으로 정리
2. 문서 순서와 날짜 흐름을 고정
3. 기안서, 과업지시서, 발주서, 계약서, 검수확인서, 완료보고서, 업체 요청자료를 생성
4. 날짜, 품명, 업체명, 금액, 산출물명 정합성을 자동 검수

## 왜 웹앱보다 CLI부터인가

처음부터 웹프로그램을 만들면 입력값, 문서 규칙, 검수 규칙이 아직 흔들리는 상태에서 UI까지 같이 흔들립니다. 먼저 CLI로 문서 생성/검수가 안정된 뒤 웹 UI를 얹는 편이 좋습니다.

권장 순서:

1. 이 패키지로 JSON 입력과 문서 생성 규칙을 안정화
2. Claude Code 또는 Codex로 입력값을 채우고 생성/검수 반복
3. 업체 수취 PDF 검수 기능 추가
4. 반복 업무가 충분히 쌓이면 Streamlit/FastAPI 웹 UI 추가
5. Codex/Claude 양쪽에서 공용 도구처럼 쓰고 싶을 때 MCP 서버화

## 빠른 실행

```powershell
cd rnd_doc_automation_starter

# HMI 샘플 문서 생성
python scripts/generate_package.py inputs/sample_hmi_module.json --out outputs/hmi_sample

# 생성 결과 정합성 검수
python scripts/audit_package.py inputs/sample_hmi_module.json --docs outputs/hmi_sample --out outputs/hmi_sample_audit.md
```

Codex Desktop의 번들 Python을 직접 쓸 경우:

```powershell
& "C:\Users\kisun\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts/generate_package.py inputs/sample_hmi_module.json --out outputs/hmi_sample
& "C:\Users\kisun\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts/audit_package.py inputs/sample_hmi_module.json --docs outputs/hmi_sample --out outputs/hmi_sample_audit.md
```

## 입력 파일 원칙

실행 기준 입력은 `inputs/*.json`입니다. YAML이 더 편하면 Claude/Codex에게 YAML로 초안을 쓰게 한 뒤 JSON으로 변환해서 실행하세요.

핵심 입력 범위:

- `project`: 과제번호, 사업명, 사업기간, 주관기관, 수행기관
- `work`: 품명, 목적, 배경, 업체 수행 범위, 내부 수행 범위, 제외 범위, 산출물, 검수 기준
- `vendor`: 업체명, 대표자, 주소, 사업자번호
- `schedule`: 기안일, 과업지시일, 견적일, 발주/계약일, 납품일, 검수일, 완료보고일
- `money`: 공급가액, 부가세, 총액, 집행 비목
- `rules`: 기안서에 업체명/금액을 제외할지, 금지어, 문서별 필수값

## 구조와 추가 검수 명령

`scripts/generate_package.py`는 얇은 CLI이며 실제 문서별 작성 로직은 `scripts/builders/` 아래에 나뉘어 있습니다. 공통 스타일과 표 생성은 `builders/common.py`, 문서별 본문은 `builders/memo.py`, `task_order.py`, `purchase_order.py`, `contract.py`, `inspection.py`, `completion.py`에서 관리합니다.

정합성 감사는 입력 JSON의 `package.work_type`에 맞는 `profiles/*.json`을 자동으로 선택합니다. 필요할 때만 `--profile`로 다른 profile을 명시하세요.

납품자료 폴더 또는 ZIP이 있으면 입력 JSON의 산출물 파일명과 실제 납품자료를 대조합니다.

```powershell
python scripts/audit_delivery_package.py inputs/my_case.json --delivery outputs/delivery_package --profile profiles/hardware_prototype.json --out outputs/my_case_delivery_audit.md
```

업체가 보낸 PDF 증빙은 다음처럼 확인합니다.

```powershell
python scripts/audit_vendor_docs.py inputs/my_case.json --quotation vendor_quote.pdf --transaction-statement statement.pdf --tax-invoice tax_invoice.pdf --out outputs/my_case_vendor_audit.md
```

Word에서 PDF로 내보낸 뒤에는 PDF 렌더 QA를 실행합니다.

```powershell
python scripts/render_quality_check.py --pdf-dir outputs/my_case --out-dir outputs/my_case_render_qa --report outputs/my_case_render_qa.md --fail-on-error
```

## 문서 생성 규칙

- 01 기안서에는 원칙적으로 업체명과 금액을 넣지 않습니다.
- 02 과업지시서는 업체가 수행할 범위와 발주기관 내부 수행 범위를 분리합니다.
- 04 발주서와 05 계약서부터 업체명, 금액, 계약기간을 반영합니다.
- 09 검수확인서는 납품일, 검수일, 검수 항목, 검수 결과 중심으로 작성합니다.
- 10 완료보고서는 진행 경과, 산출물 파일명, 검수 결과, 종합 의견만 간결하게 작성합니다.
- 견적서, 거래명세서, 전자세금계산서, 사업자등록증, 통장사본, 이체확인증은 업체/사내 수취 문서로 관리하고 생성하지 않습니다.

## 웹앱으로 확장할 때

CLI가 안정되면 다음 중 하나로 확장하면 됩니다.

- 빠른 내부 도구: Streamlit
- 여러 사용자가 쓰는 사내 도구: FastAPI + React
- Codex/Claude에서 도구 호출: MCP 서버

현재 단계에서는 `generate_package.py`와 `audit_package.py`가 API의 원형입니다. 웹앱이나 MCP는 이 두 스크립트를 감싸면 됩니다.
