# 입력 JSON 구조

실행 기준 입력 파일은 JSON입니다. Claude/Codex가 YAML로 초안을 만들 수는 있지만, 스크립트 실행 전에는 JSON으로 저장하세요.

## 최상위 구조

```json
{
  "package": {},
  "project": {},
  "work": {},
  "vendor": {},
  "schedule": {},
  "money": {},
  "rules": {}
}
```

## package

| 필드 | 설명 |
|---|---|
| `work_type` | `hardware_prototype`, `uxui`, `hmi_module`, `simulator` 등 |
| `output_prefix` | 생성 파일명 접두어 |
| `doc_set_name` | 문서 패키지 이름 |

## project

| 필드 | 설명 |
|---|---|
| `number` | 과제번호 |
| `name` | 사업명 |
| `period` | 사업기간 |
| `lead_org` | 주관연구개발기관 |
| `performing_org` | 수행기관/발주기관 |

## work

| 필드 | 설명 |
|---|---|
| `title` | 과업 제목 |
| `short_item_name` | 견적서/거래명세서/계약서에 들어갈 짧은 품명 |
| `purpose` | 과업 목적 |
| `background` | 추진 배경 |
| `business_relevance` | 과제 관련성 |
| `vendor_scope` | 업체 수행 범위 배열 |
| `internal_scope` | 발주기관 내부 수행 범위 배열 |
| `excluded_scope` | 제외 범위 배열 |
| `specifications` | 주요 제작 사양 배열 |
| `verification_scope` | 과제/플랫폼 검증 활용 범위 배열 |
| `deliverables` | 산출물 배열 |
| `inspection_criteria` | 검수 기준 배열 |
| `inspection_photos` | 검수확인서 별첨 사진 배열 |
| `expected_effects` | 기안서 기대 효과 배열 |
| `followup_documents` | 기안 이후 확보할 증빙서류 배열 |

### deliverables 예시

```json
{"name": "BOM", "description": "주요 구성품 목록", "file_hint": "01_BOM.xlsx"}
```

### inspection_photos 예시

```json
{"caption": "사진 1. 시제품 외관", "path": "C:\\Users\\user\\Pictures\\inspection_01.png"}
```

`inspection_photos.path`는 로컬 절대경로를 권장합니다. 파일이 존재하면 검수확인서 별첨에 자동 삽입하고, 파일이 없으면 확인 필요 문구를 남깁니다.

## vendor

업체가 미정이면 `name`에 `업체명 미정`을 넣고, 발주/계약 단계에서 갱신합니다.

## schedule

문서 흐름상 다음 순서를 지켜야 합니다.

`memo_date` <= `task_order_date` <= `quote_date` <= `order_date` <= `contract_date` <= `delivery_date` <= `inspection_date` <= `completion_date`

## money

| 필드 | 설명 |
|---|---|
| `supply` | 공급가액, 숫자 |
| `vat` | 부가세, 숫자 |
| `total` | 총액, 숫자 |
| `budget_item` | 집행 비목/세목 |

## rules

| 필드 | 설명 |
|---|---|
| `memo_exclude_vendor` | 기안서에 업체명 제외 여부 |
| `memo_exclude_amount` | 기안서에 금액 제외 여부 |
| `task_order_exclude_amount` | 과업지시서에 금액 제외 여부 |
| `forbidden_terms` | 문서에 남으면 안 되는 표현 |
