# Claude Code 작업 지시서

이 저장소는 정부연구개발사업 시제품/용역/개발 과업 증빙 문서 자동화 스타터입니다.

## 기본 원칙

1. `inputs/*.json`을 single source of truth로 취급한다.
2. 문서 본문에 임의의 날짜, 금액, 업체명, 산출물명을 만들지 않는다.
3. 기안서에는 `rules.memo_exclude_vendor`가 true이면 업체명을 넣지 않는다.
4. 기안서에는 `rules.memo_exclude_amount`가 true이면 금액을 넣지 않는다.
5. 과업지시서에는 업체 수행 범위, 내부 수행 범위, 제외 범위를 반드시 분리한다.
6. 발주서/계약서부터 업체명과 금액을 반영한다.
7. 완료보고서는 장황하게 늘리지 말고 산출물과 검수 결과 중심으로 작성한다.
8. 문서 생성 후 반드시 `scripts/audit_package.py`를 실행한다.
9. PDF 렌더 확인이 필요한 산출물은 `scripts/render_quality_check.py`로 contact sheet를 만든다.
10. 납품자료 폴더/ZIP과 업체 PDF 수취자료는 각각 `scripts/audit_delivery_package.py`, `scripts/audit_vendor_docs.py`로 검수한다.

## 추천 작업 흐름

1. 사용자의 과업 설명을 읽고 `inputs/sample_*.json` 중 가장 가까운 파일을 복사한다.
2. 필요한 입력값을 채운다.
3. 아래 명령으로 문서를 생성한다.

```powershell
python scripts/generate_package.py inputs/<input>.json --out outputs/<case_name>
```

4. 아래 명령으로 정합성을 검수한다.

```powershell
python scripts/audit_package.py inputs/<input>.json --docs outputs/<case_name> --out outputs/<case_name>_audit.md
```

5. DOCX를 PDF로 내보낸 뒤 아래 명령으로 렌더 품질을 확인한다.

```powershell
python scripts/render_quality_check.py --pdf-dir outputs/<case_name> --out-dir outputs/<case_name>_render_qa --report outputs/<case_name>_render_qa.md --fail-on-error
```

6. 납품자료가 있으면 산출물 파일명과 실제 파일을 대조한다.

```powershell
python scripts/audit_delivery_package.py inputs/<input>.json --delivery <delivery_folder_or_zip> --profile profiles/hardware_prototype.json --out outputs/<case_name>_delivery_audit.md
```

7. 업체 수취 PDF가 있으면 날짜, 품명, 금액을 확인한다.

```powershell
python scripts/audit_vendor_docs.py inputs/<input>.json --quotation <quote.pdf> --transaction-statement <statement.pdf> --tax-invoice <tax_invoice.pdf> --out outputs/<case_name>_vendor_audit.md
```

8. 검수표에서 `HIGH`, `MEDIUM`, `FAIL` 이슈가 있으면 입력값 또는 생성 규칙을 수정하고 다시 생성한다.
9. 사용자가 업체 제출 문구를 원하면 생성된 `업체_제출요청자료.md`를 기반으로 메시지를 다듬는다.

## 수정 시 주의

- `scripts/generate_package.py`는 CLI 진입점으로 유지한다. 문서별 본문은 `scripts/builders/*.py`에서 수정한다.
- 문서 스타일 공통 로직은 `scripts/builders/common.py`에서 수정한다.
- 특정 업무유형별 기본값은 입력 JSON의 `work_type`, `work.deliverables`, `work.inspection_criteria`, `work.excluded_scope`로 제어한다.
- 과업 유형별 필수 섹션과 검수 규칙은 `profiles/*.json`에 둔다. `audit_package.py`는 `package.work_type`에 맞는 profile을 자동 선택한다.
- 기존 산출물을 직접 손으로 고치기보다 입력 JSON과 생성 스크립트를 고친 뒤 재생성한다.

## 웹앱/MCP 판단

- 반복 사용자가 1명이고 로컬에서 생성하면 CLI면 충분하다.
- 입력 폼이 필요하면 Streamlit 웹 UI를 추가한다.
- Codex와 Claude가 같은 기능을 tool처럼 호출해야 하면 MCP 서버를 추가한다.
