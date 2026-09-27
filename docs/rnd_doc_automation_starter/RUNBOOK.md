# 운영 런북

## 새 과업 문서 세트 만들기

1. `inputs/sample_hmi_module.json`, `sample_uxui.json`, `sample_simulator.json` 중 가까운 파일을 복사한다.
2. 과업명, 범위, 날짜, 금액, 업체명, 산출물, 검수 기준을 수정한다.
3. 문서를 생성한다.

```powershell
python scripts/generate_package.py inputs/my_case.json --out outputs/my_case
```

4. 정합성을 검수한다.

```powershell
python scripts/audit_package.py inputs/my_case.json --docs outputs/my_case --out outputs/my_case_audit.md
```

5. `HIGH` 이슈가 있으면 입력값 또는 스크립트를 수정하고 다시 생성한다. `package.work_type`에 맞는 profile이 자동 선택되며, 예외 상황에서만 `--profile`을 명시한다.
6. DOCX를 PDF로 내보낸 뒤 렌더 QA를 실행한다.

```powershell
python scripts/render_quality_check.py --pdf-dir outputs/my_case --out-dir outputs/my_case_render_qa --report outputs/my_case_render_qa.md --fail-on-error
```

7. 생성된 `업체_제출요청자료.md`를 업체 메시지로 다듬어 보낸다.

## 업체 수취 문서가 들어온 뒤

업체 PDF를 받으면 아래 항목을 자동 검수한다.

```powershell
python scripts/audit_vendor_docs.py inputs/my_case.json --quotation vendor_quote.pdf --transaction-statement statement.pdf --tax-invoice tax_invoice.pdf --out outputs/my_case_vendor_audit.md --fail-on-missing
```

납품자료 폴더 또는 ZIP을 받으면 완료보고서 산출물 표의 파일명과 대조한다.

```powershell
python scripts/audit_delivery_package.py inputs/my_case.json --delivery outputs/delivery_package.zip --profile profiles/hardware_prototype.json --out outputs/my_case_delivery_audit.md --fail-on-missing
```

검수 결과 `FAIL`이 있으면 업체 재발행 또는 파일명 정리 요청을 먼저 처리한 뒤 완료보고서를 확정한다.

## 웹앱 전환 기준

다음 조건이 되면 웹앱을 만드는 편이 좋습니다.

- 같은 입력 항목을 반복해서 여러 번 작성한다.
- 사용자가 직접 JSON을 수정하기 어렵다.
- 과업 유형별 입력 폼이 필요하다.
- 생성 이력과 업체 수취 문서 상태를 관리하고 싶다.

권장 기술:

- 빠른 프로토타입: Streamlit
- 내부 서비스: FastAPI + React
- AI 도구 연동: MCP server wrapping `generate_package.py` and `audit_package.py`

## 코드 수정 기준

- 문서 생성 CLI: `scripts/generate_package.py`
- 문서별 builder: `scripts/builders/*.py`
- 공통 문서 스타일/표/날짜/금액 helper: `scripts/builders/common.py`
- 감사 profile: `profiles/*.json`
- 납품자료/업체 PDF/렌더 QA 감사: `scripts/audit_delivery_package.py`, `scripts/audit_vendor_docs.py`, `scripts/render_quality_check.py`
