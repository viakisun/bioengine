from __future__ import annotations

from .common import *


_SIMULATOR_TEXTS = {
    "summary_para_1": "본 과업은 {item} 1식을 제작하고, 결과 확인에 필요한 실행 빌드, 소스코드, 디텍션 모델 자산, 시나리오·데이터셋, 매뉴얼, 검수 시험 결과 및 운용 데모 자료를 제출하는 것을 범위로 한다.",
    "summary_para_2": "수행업체의 책임 범위는 시뮬레이터 시작품 제작과 산출물 제출이며, 관제 요구사항 정의, 주관기관 관제 시스템과의 연동 검토, 학술 성장 모델 매핑 검토는 발주기관 내부 수행 범위로 구분한다.",
    "applied_rows": [
        ["제작 대상", "{item}", "실행 가능한 시작품 1식"],
        ["수행 범위", "시뮬레이터 실행 빌드, 소스코드, 디텍션 모델 자산, 시나리오·데이터셋, 매뉴얼, 검수 자료 제작 및 제출", "업체 수행"],
        ["자료 범위", "아키텍처 설계서, 운용 매뉴얼, 개발자 가이드, 검수 플랜, 검수 시험 결과 보고서, 운용 데모 녹화", "업체 제출"],
        ["내부 활용", "관제 요구사항 정의, 주관기관 관제 시스템 연동 검토, 실증 사이트 운용 항목 매핑", "비아 수행"],
    ],
    "submission_rows": [
        ["견적", "견적서", "견적일자 {quote_date} 기준"],
        ["거래", "거래명세서", "거래일자 {delivery_date} 기준"],
        ["세무", "전자세금계산서", "검수 이후 발행, 공급가액·부가세·합계 일치"],
        ["업체", "사업자등록증, 통장사본", "대금 지급 및 정산 증빙용"],
        ["납품", "실행 빌드, 소스코드, 디텍션 모델 자산, 시나리오·데이터셋, 매뉴얼, 검수 자료", "완료보고서 산출물 표와 파일명 일치"],
    ],
}

_HARDWARE_TEXTS = {
    "summary_para_1": "본 과업은 {item} 1식을 제작하고, 제작 결과 확인에 필요한 BOM, 사양서, 도면자료, 전장회로도, 구동자료 및 검수사진을 제출하는 것을 범위로 한다.",
    "summary_para_2": "수행업체의 책임 범위는 하드웨어 플랫폼 제작과 납품자료 제출이며, A-SW 서비스 플랫폼 개발, ROS2 응용 소프트웨어 개발 및 자율주행 알고리즘 개발은 발주기관 내부 수행 범위로 구분한다.",
    "applied_rows": [
        ["제작 대상", "{item}", "실물 1식"],
        ["하드웨어 범위", "프레임, 외장, 구동부, 전장부, 배터리, 조작부 구성", "업체 수행"],
        ["자료 범위", "BOM, 사양서, 도면, 회로도, 모터드라이버 및 MDAS 자료", "업체 제출"],
        ["내부 활용", "A-SW 플랫폼 프로젝트 등록, ROS2 패키지 적용, 시험 로그 관리", "비아 수행"],
    ],
    "submission_rows": [
        ["견적", "견적서", "견적일자 {quote_date} 기준"],
        ["거래", "거래명세서", "거래일자 {delivery_date} 기준"],
        ["세무", "전자세금계산서", "검수 이후 발행, 공급가액·부가세·합계 일치"],
        ["업체", "사업자등록증, 통장사본", "대금 지급 및 정산 증빙용"],
        ["납품", "BOM, 사양서, 도면자료, 구동자료", "완료보고서 산출물 표와 파일명 일치"],
    ],
}

def _texts_for(data):
    return _SIMULATOR_TEXTS if get(data, "package.work_type") == "simulator" else _HARDWARE_TEXTS


def build_task_order(data: dict[str, Any], out: Path):
    doc = new_doc()
    T = _texts_for(data)
    add_cover(doc, "과업지시서", get(data, "work.short_item_name"), get(data, "schedule.task_order_date"))

    add_heading(doc, None, "문서 정보 및 과업 요지")
    kv_table(doc, [
        ("문서명", "과업지시서"),
        ("과업명", get(data, "work.short_item_name")),
        ("작성일", get(data, "schedule.task_order_date")),
        ("수행업체", "견적 수취 및 발주 검토 후 확정"),
        ("예정 수행기간", get(data, "schedule.contract_period")),
        ("문서 용도", "견적요청, 발주·계약 및 검수 기준 문서"),
    ])
    add_subheading(doc, "과제정보")
    kv_table(doc, project_rows(data))
    add_subheading(doc, "과업 요지")
    add_para(doc, T["summary_para_1"].format(item=get(data, 'work.short_item_name')))
    add_para(doc, T["summary_para_2"])
    add_body_index(doc, [
        "과업 목적 및 적용 범위",
        "과업 수행 원칙",
        "제작 사양",
        "세부 과업 범위",
        "과업 제외 및 협의 필요 사항",
        "납품 산출물",
        "시험·검수 기준",
        "자료 제출 및 정산 증빙",
        "일정·변경·보완 관리",
        "확인",
    ])
    page_break(doc)

    add_heading(doc, "1", "과업 목적 및 적용 범위")
    add_para(doc, get(data, "work.purpose"))
    applied_rows = [[r[0], r[1].format(item=get(data, 'work.short_item_name')), r[2]] for r in T["applied_rows"]]
    data_table(doc, ["구분", "적용 범위", "비고"], applied_rows)

    add_heading(doc, "2", "과업 수행 원칙")
    work_type = get(data, "package.work_type")
    scope_principle = (
        "업체는 시뮬레이터 시작품 제작 및 납품자료 제출을 수행하며, 발주기관의 관제 시스템 본 개발 범위를 수행 범위에 포함하지 않는다."
        if work_type == "simulator" else
        "업체는 하드웨어 제작 및 납품자료 제출을 수행하며, 발주기관의 소프트웨어 개발 범위를 수행 범위에 포함하지 않는다."
    )
    data_table(doc, ["원칙", "내용"], [
        ["범위 명확화", scope_principle],
        ["동등 이상", "부품·구현 수단의 세부 변경이 필요한 경우 발주기관과 사전 협의하여 동등 이상 사양으로 조정한다."],
        ["자료 제출", "납품자료는 완료보고서 산출물 표와 파일명이 대조될 수 있도록 식별 가능한 파일명으로 제출한다."],
        ["검수 대응", "검수 결과 보완사항이 발생하면 업체는 합리적인 범위에서 보완자료 또는 재확인 자료를 제출한다."],
    ])

    page_break(doc)
    add_heading(doc, "3", "제작 사양")
    data_table(doc, ["번호", "항목", "사양"], specs_rows(data), size=7.6)
    page_break(doc)

    add_heading(doc, "4", "세부 과업 범위")
    add_subheading(doc, "업체 수행 범위")
    data_table(doc, ["번호", "수행 범위"], [[idx, item] for idx, item in enumerate(get(data, "work.vendor_scope", []), 1)], size=8.0)
    add_subheading(doc, "발주기관 내부 수행 범위")
    data_table(doc, ["번호", "내부 수행 범위"], [[idx, item] for idx, item in enumerate(get(data, "work.internal_scope", []), 1)], size=8.0)
    add_heading(doc, None, "과업 제외 및 협의 필요 사항")
    add_subheading(doc, "과업 제외 범위")
    data_table(doc, ["번호", "제외 범위"], [[idx, item] for idx, item in enumerate(get(data, "work.excluded_scope", []), 1)], size=8.0)

    add_heading(doc, "5", "예정 산출물 (카테고리)")
    add_para(doc, "본 과업지시서는 산출물의 카테고리 단위 기준을 정의한다. 카테고리별 구체적 파일 구성·페이지·핵심 내용은 과업 수행 결과에 따라 검수확인서·완료보고서 단계에서 식별 가능한 형태로 명기된다.")
    data_table(doc, ["번호", "산출물 카테고리", "예정 내용"], abstract_deliverable_rows(data), size=8.0)

    add_heading(doc, "6", "시험·검수 기준")
    data_table(doc, ["검수 항목", "확인 기준", "판정"], inspection_rows(data), size=7.5)
    page_break(doc)

    add_heading(doc, "7", "자료 제출 및 정산 증빙")
    submission_rows = [
        [r[0], r[1], r[2].format(quote_date=get(data, 'schedule.quote_date'), delivery_date=get(data, 'schedule.delivery_date'))]
        for r in T["submission_rows"]
    ]
    data_table(doc, ["구분", "제출 자료", "요청 기준"], submission_rows, size=7.8)

    add_heading(doc, "8", "일정·변경·보완 관리")
    kv_table(doc, [
        ("예정 착수일", get(data, "schedule.contract_date")),
        ("계약상 수행기간", get(data, "schedule.contract_period")),
        ("납품기한", get(data, "schedule.delivery_due_date")),
        ("검수 예정일", get(data, "schedule.inspection_date")),
        ("변경 관리", "사양·일정·산출물 변경이 필요한 경우 발주기관과 사전 협의"),
        ("보완 관리", "검수 결과 보완사항 발생 시 보완 후 재확인"),
    ])
    add_heading(doc, None, "확인")
    add_para(doc, "본 과업지시서는 제작 범위, 산출물, 검수 기준 및 증빙 확보 기준을 정하기 위한 문서이며, 세부 변경 사항은 발주기관과 선정업체 간 협의 후 반영한다.")
    data_table(doc, ["구분", "확인 내용", "서명"], [
        ["발주기관", "과업 범위, 산출물 및 검수 기준 확인", ""],
        ["수행업체", "제작 가능 범위, 일정 및 자료 제출 가능 여부 확인", ""],
    ])
    return save_doc(doc, out)
