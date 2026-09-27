from __future__ import annotations

from .common import *


def build_contract(data: dict[str, Any], out: Path):
    doc = new_doc()
    add_cover(doc, "계약서", get(data, "work.short_item_name"), f"계약일: {get(data, 'schedule.contract_date')}")
    add_heading(doc, None, "계약 당사자")
    kv_table(doc, [
        ("발주자", get(data, "project.performing_org")),
        ("수급자", get(data, "vendor.name")),
        ("계약명", get(data, "work.short_item_name")),
        ("계약일", get(data, "schedule.contract_date")),
        ("계약기간", get(data, "schedule.contract_period")),
        ("계약금액", f"공급가액 {money(get(data, 'money.supply'))}, 부가가치세 {money(get(data, 'money.vat'))}, 총 {money(get(data, 'money.total'))}"),
    ])
    add_heading(doc, None, "과제 정보")
    kv_table(doc, project_rows(data) + [("집행 비목", get(data, "money.budget_item"))])
    add_heading(doc, None, "계약 조건")
    data_table(doc, ["구분", "조건"], [
        ["계약 목적", "정부연구개발사업 수행을 위한 연구재료 제작 및 납품자료 확보"],
        ["계약 대상", f"{get(data, 'work.short_item_name')} 1식"],
        ["적용 문서", "본 계약서, 발주서, 과업지시서, 견적서 및 상호 확인한 납품자료"],
    ])
    add_heading(doc, "1", "목적")
    add_para(doc, f"본 계약은 발주자가 수행하는 정부연구개발사업과 관련하여 {get(data, 'work.short_item_name')}을 수급자가 제작·납품하는 데 필요한 사항을 정함을 목적으로 한다.")
    add_heading(doc, "2", "계약 대상")
    add_para(doc, f"계약 대상은 {get(data, 'work.short_item_name')} 1식으로 한다. 세부 범위, 산출물 및 검수 기준은 본 계약서, 발주서 및 과업지시서에 따른다.")
    page_break(doc)
    add_heading(doc, "3", "계약금액")
    kv_table(doc, [
        ("공급가액", money(get(data, "money.supply"))),
        ("부가가치세", money(get(data, "money.vat"))),
        ("계약금액 합계", money(get(data, "money.total"))),
    ])
    add_heading(doc, "4", "계약기간 및 납품")
    kv_table(doc, [
        ("계약기간", get(data, "schedule.contract_period")),
        ("납품기한", get(data, "schedule.delivery_due_date")),
        ("납품일", get(data, "schedule.delivery_date")),
        ("납품장소", "발주자가 지정하는 장소"),
    ])
    add_heading(doc, "5", "납품 산출물")
    data_table(doc, ["번호", "산출물", "내용", "파일명/형태"], deliverable_rows(data), size=7.5)
    add_heading(doc, "6", "검수")
    add_para(doc, "발주자는 납품된 산출물을 과업지시서 및 납품자료 기준으로 검수한다. 보완사항이 확인되는 경우 수급자는 합리적인 범위에서 보완 후 재확인 자료를 제출하여야 한다.")
    add_heading(doc, "7", "대금 지급")
    add_para(doc, "발주자는 납품 산출물 제출 및 검수확인서 작성 완료 후 계약금액을 지급한다. 대금 지급은 거래명세서, 전자세금계산서, 사업자등록증, 통장사본 등 지급 및 정산에 필요한 증빙서류를 갖춘 후 내부 절차에 따라 진행한다.")
    add_heading(doc, "8", "변경 및 협의")
    add_para(doc, "제작 과정에서 사양, 납품자료 또는 일정의 변경이 필요한 경우 수급자는 발주자에게 사전 공유하고, 상호 협의한 범위에서 변경 사항을 반영한다.")
    add_heading(doc, "9", "자료 사용")
    add_para(doc, "발주자는 수급자가 제출한 납품자료를 본 과제 수행, 검수, 완료보고 및 정부연구개발사업 정산 증빙 목적으로 사용할 수 있다.")
    add_heading(doc, "10", "비밀유지")
    add_para(doc, "양 당사자는 본 계약 수행 과정에서 알게 된 상대방의 비공개 기술자료, 사업정보 및 과제 관련 자료를 계약 목적 외로 사용하거나 제3자에게 임의로 제공하지 않는다.")
    add_heading(doc, "11", "하자 및 보완")
    add_para(doc, "납품 후 검수 과정에서 과업지시서상 기준에 미달하거나 제출자료 누락이 확인되는 경우 수급자는 발주자의 합리적인 보완 요청에 응하여야 한다.")
    add_heading(doc, "12", "분쟁 해결")
    add_para(doc, "본 계약과 관련하여 이견이 발생하는 경우 양 당사자는 우선 협의로 해결하며, 협의가 어려운 사항은 관련 법령과 상관례에 따른다.")
    add_heading(doc, "13", "첨부 문서")
    data_table(doc, ["번호", "문서", "용도"], [
        [1, "과업지시서", "제작 범위 및 검수 기준"],
        [2, "견적서", "계약금액 산정 근거"],
        [3, "발주서", "발주 조건 확인"],
        [4, "납품 산출물 목록", "검수 및 완료보고 근거"],
    ])
    data_table(doc, ["구분", "기관/업체", "대표/담당", "서명"], [
        ["발주자", get(data, "project.performing_org"), "", ""],
        ["수급자", get(data, "vendor.name"), "", ""],
    ])
    return save_doc(doc, out)
