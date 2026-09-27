# Claude Code에 붙여넣을 핸드오프 프롬프트

아래 폴더는 정부연구개발사업 증빙 문서 자동화 스타터입니다.

먼저 `README.md`, `CLAUDE.md`, `INPUT_SCHEMA.md`, `RUNBOOK.md`를 읽고 구조를 파악하세요.

목표:

1. 사용자의 새 과업 설명을 바탕으로 `inputs/` 아래 JSON 입력 파일을 작성한다.
2. `scripts/generate_package.py`로 문서 패키지를 생성한다.
3. `scripts/audit_package.py`로 정합성과 완성도를 검수한다.
4. 검수 이슈가 있으면 입력 JSON 또는 생성 스크립트를 수정하고 다시 생성한다.

중요 규칙:

- 입력 JSON을 single source of truth로 유지한다.
- 기안서에는 업체명과 금액을 넣지 않는다.
- 과업지시서에는 업체 수행 범위, 발주기관 내부 수행 범위, 제외 범위를 분리한다.
- 발주서와 계약서부터 업체명, 금액, 계약기간을 넣는다.
- 검수확인서와 완료보고서는 납품일, 검수일, 산출물, 검수 결과 중심으로 간결하게 작성한다.
- 업체가 발행해야 하는 견적서, 거래명세서, 전자세금계산서는 생성하지 말고 요청 기준만 작성한다.
- 생성 후 반드시 정합성 검수 리포트를 만든다.

기본 실행:

```powershell
python scripts/generate_package.py inputs/sample_hmi_module.json --out outputs/hmi_sample
python scripts/audit_package.py inputs/sample_hmi_module.json --docs outputs/hmi_sample --out outputs/hmi_sample_audit.md
```

다음 과업 후보:

- UX/UI 설계 용역: `inputs/sample_uxui.json` 기반
- HMI 모듈 시작품: `inputs/sample_hmi_module.json` 기반
- 시뮬레이터 시작품: `inputs/sample_simulator.json` 기반

먼저 입력 JSON을 확정하고, 그다음 문서를 생성하세요.

