from __future__ import annotations

from .common import *


def _condition_rows(data):
    names = [d.get("name", "") for d in get(data, "work.deliverables", []) or []]
    return [
        ["수량", f"{get(data, 'work.short_item_name')} 1식 및 납품자료"],
        ["산출물", ", ".join(n for n in names if n) + " 포함"],
        ["보완", "검수 결과 보완사항이 확인되는 경우 보완자료 제출"],
        ["자료 사용", "제출자료는 과제 수행, 검수, 완료보고 및 정산 증빙 목적으로 활용"],
    ]


def build_purchase_order(data: dict[str, Any], out: Path):
    T = {"condition_rows": _condition_rows(data)}
    doc = new_doc()
    add_cover(doc, "발주서", get(data, "work.short_item_name"), f"발주일: {get(data, 'schedule.order_date')}")
    add_heading(doc, "1", "발주 개요")
    kv_table(doc, [
        ("발주 문서", "발주서"),
        ("발주일", get(data, "schedule.order_date")),
        ("발주자", get(data, "project.performing_org")),
        ("수주자", get(data, "vendor.name")),
        ("발주 목적", get(data, "work.purpose")),
    ])
    add_heading(doc, "2", "과제 정보")
    kv_table(doc, project_rows(data) + [("집행 비목", get(data, "money.budget_item"))])
    add_heading(doc, "3", "발주 품목 및 금액")
    data_table(doc, ["품명", "규격/내용", "수량", "공급가액", "부가세", "합계"], [[
        get(data, "work.short_item_name"),
        "과업지시서 기준 산출물 제작 및 납품자료 제출",
        "1식",
        money(get(data, "money.supply")),
        money(get(data, "money.vat")),
        money(get(data, "money.total")),
    ]], size=7.5)
    add_heading(doc, "4", "납품 및 검수 조건")
    kv_table(doc, [
        ("계약상 수행기간", get(data, "schedule.contract_period")),
        ("납품기한", get(data, "schedule.delivery_due_date")),
        ("납품장소", "발주자가 지정하는 장소"),
        ("검수 기준", "과업지시서 및 납품 산출물 기준에 따른 확인"),
        ("지급 조건", "납품 산출물 제출 및 검수확인서 작성 완료 후 거래·세무 증빙을 갖추어 지급"),
    ])
    page_break(doc)
    add_heading(doc, "5", "발주 조건")
    data_table(doc, ["구분", "조건"], T["condition_rows"])
    add_heading(doc, "6", "발주 확인")
    add_para(doc, f"상기와 같이 {get(data, 'work.short_item_name')}을 발주하며, 수주자는 과업지시서 및 본 발주서의 조건에 따라 제작, 납품 및 자료 제출을 이행한다.")
    data_table(doc, ["구분", "기관/업체", "확인"], [
        ["발주자", get(data, "project.performing_org"), ""],
        ["수주자", get(data, "vendor.name"), ""],
    ])
    return save_doc(doc, out)
