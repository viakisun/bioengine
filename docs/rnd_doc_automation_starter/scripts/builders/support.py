from __future__ import annotations

from .common import *


def build_vendor_request(data: dict[str, Any], out: Path):
    lines = [
        "# 업체 제출요청 자료 정리",
        "",
        "## 기준 정보",
        "",
        f"- 품명: {get(data, 'work.short_item_name')}",
        f"- 수행업체: {get(data, 'vendor.name')}",
        f"- 발주/계약일: {get(data, 'schedule.contract_date')}",
        f"- 수행기간: {get(data, 'schedule.contract_period')}",
        f"- 납품일: {get(data, 'schedule.delivery_date')}",
        f"- 검수일: {get(data, 'schedule.inspection_date')}",
        f"- 공급가액: {money(get(data, 'money.supply'))}",
        f"- 부가가치세: {money(get(data, 'money.vat'))}",
        f"- 총액: {money(get(data, 'money.total'))}",
        "",
        "## 요청자료",
        "",
        f"- 견적서: 견적일자 {get(data, 'schedule.quote_date')} 기준",
        f"- 계약서 날인본: 계약일 {get(data, 'schedule.contract_date')} 기준",
        "- 사업자등록증 및 통장사본",
        f"- 거래명세서: 거래일자 {get(data, 'schedule.delivery_date')} 기준",
        f"- 전자세금계산서: 작성일자/공급일자 {get(data, 'schedule.delivery_date')} 기준, 발행은 검수일 이후 진행",
        "",
        "## 요청 문구",
        "",
        "아래 제작 건 정산 및 증빙 처리를 위해 다음 자료를 PDF 파일로 회신 부탁드립니다.",
        "",
        f"품명은 `{get(data, 'work.short_item_name')}`, 수량은 `1식`, 금액은 공급가액 `{money(get(data, 'money.supply'))}`, 부가가치세 `{money(get(data, 'money.vat'))}`, 합계 `{money(get(data, 'money.total'))}` 기준으로 작성 부탁드립니다.",
    ]
    out.write_text("\n".join(lines), encoding="utf-8")
    return out

def build_index(data: dict[str, Any], out: Path, files: list[Path]):
    rows = [
        "# 생성 문서 목록",
        "",
        f"- 과업명: {get(data, 'work.short_item_name')}",
        f"- 과제번호: {get(data, 'project.number')}",
        "",
    ]
    for path in files:
        rows.append(f"- {path.name}")
    out.write_text("\n".join(rows), encoding="utf-8")
