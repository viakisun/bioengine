from __future__ import annotations

from .common import *


_SIMULATOR_TEXTS = {
    "purpose_intro_tail": "업체는 시뮬레이터 시작품 제작과 산출물 제출을 담당하고, 관제 요구사항 정의, 주관기관 관제 시스템과의 연동 검토, 학술 성장 모델 매핑 검토는 {performing}가 수행한다.",
    "approve_rows": [
        ["제작 추진", "과제 수행에 필요한 관제 시각화 시뮬레이터 시작품 제작 추진", "내부 승인"],
        ["과업지시서 작성", "수행 범위, 산출물, 검수 기준을 문서화", "업체 송부용"],
        ["견적요청", "과업지시서 기준 견적서 및 증빙 가능 자료 요청", "금액 확정 전"],
        ["후속 발주 검토", "견적 수취 후 발주서·계약서 작성 여부 검토", "별도 절차"],
    ],
    "relevance_rows": [
        ["실증 시연 환경", "실제 운용 전 관제 화면·시나리오의 사전 시연 환경이 필요", "주관기관 관제 시스템 시연·검증 환경 보완"],
        ["디텍션 파이프라인", "디텍션 결과의 좌표 역투영 및 오버레이 정합 검증 필요", "디텍션 결과 표시·로그 관리 기준 데이터 확보"],
        ["문서 증빙", "정부연구개발사업 집행·정산에는 제작 목적, 산출물, 검수 근거가 필요", "완료보고 및 정산 증빙 연계"],
    ],
    "platform_para": "본 시작품은 업체가 단독으로 운영·배포하는 대상이 아니라, 주관기관이 개발하는 관제 시스템의 시연·검증 환경 보완용 산출물로 활용한다.",
    "quote_rows": [
        ["제작 가능성", "과업지시서상 시뮬레이터 시작품 제작 범위 수행 가능 여부", "견적서 및 업체 회신 확인"],
        ["산출물 제출", "실행 빌드, 소스코드, 디텍션 모델 자산, 시나리오·데이터셋, 매뉴얼, 검수 자료 제출 가능 여부", "제출자료 목록 확인"],
        ["일정 적정성", "계약기간 내 제작 및 납품 가능 여부", "수행기간 및 납품기한 확인"],
        ["비용 적정성", "견적 금액과 제작 범위의 합리성", "내부 예산 및 시장 수준 검토"],
    ],
}

_HARDWARE_TEXTS = {
    "purpose_intro_tail": "업체는 하드웨어 플랫폼 제작과 납품자료 제출을 담당하고, A-SW 서비스 플랫폼 적용, ROS2 응용 소프트웨어 구성, 실차 시험 항목 정의는 {performing}가 수행한다.",
    "approve_rows": [
        ["제작 추진", "과제 수행에 필요한 하드웨어 플랫폼 시제품 제작 추진", "내부 승인"],
        ["과업지시서 작성", "제작 범위, 산출물, 검수 기준을 문서화", "업체 송부용"],
        ["견적요청", "과업지시서 기준 견적서 및 증빙 가능 자료 요청", "금액 확정 전"],
        ["후속 발주 검토", "견적 수취 후 발주서·계약서 작성 여부 검토", "별도 절차"],
    ],
    "relevance_rows": [
        ["실물 기준 프로젝트", "가상 데이터만으로는 플랫폼 기능 검증에 한계가 있음", "실제 납품자료와 검수자료 기반 프로젝트 등록"],
        ["구동 하드웨어", "통합제어기 및 제어 소프트웨어의 입출력·배포·시험 이력 검증 필요", "실차 시험 준비 및 로그 관리"],
        ["문서 증빙", "정부연구개발사업 집행·정산에는 제작 목적, 산출물, 검수 근거가 필요", "완료보고 및 정산 증빙 연계"],
    ],
    "platform_para": "본 시제품은 업체가 개발 소프트웨어를 납품하는 대상이 아니라, 비아가 개발하는 A-SW 서비스 플랫폼 및 ROS2 기반 제어 소프트웨어의 적용·관리·시험을 위한 하드웨어 기준물로 활용한다.",
    "quote_rows": [
        ["제작 가능성", "과업지시서상 하드웨어 플랫폼 제작 범위 수행 가능 여부", "견적서 및 업체 회신 확인"],
        ["산출물 제출", "BOM, 사양서, 도면, 전장회로도, 구동자료 제출 가능 여부", "제출자료 목록 확인"],
        ["일정 적정성", "3개월 이내 제작 및 납품 가능 여부", "수행기간 및 납품기한 확인"],
        ["비용 적정성", "견적 금액과 제작 범위의 합리성", "내부 예산 및 시장 수준 검토"],
    ],
}

def _texts_for(data):
    return _SIMULATOR_TEXTS if get(data, "package.work_type") == "simulator" else _HARDWARE_TEXTS


def build_memo(data: dict[str, Any], out: Path):
    doc = new_doc()
    T = _texts_for(data)
    work_type = get(data, "package.work_type")
    doc_heading = "시뮬레이터 시작품 제작 기안서" if work_type == "simulator" else "시제품 제작 기안서"
    add_cover(doc, doc_heading, get(data, "work.short_item_name"), get(data, "schedule.memo_date"))

    add_heading(doc, None, "문서 정보 및 기안 요지")
    kv_table(doc, [
        ("문서명", doc_heading),
        ("기안 제목", f"{get(data, 'work.short_item_name')} 추진 건"),
        ("작성일", get(data, "schedule.memo_date")),
        ("문서 성격", "제작 필요성 검토, 과업지시서 작성 및 견적요청 추진 근거"),
        ("집행 금액", "견적서 수취 및 내부 검토 후 확정"),
        ("수행업체", "견적요청 및 업체 검토 후 확정"),
    ])
    add_subheading(doc, "과제정보")
    kv_table(doc, project_rows(data))
    add_subheading(doc, "기안 요지")
    add_para(doc, f"본 문서는 {get(data, 'project.name')} 수행 과정에서 필요한 {get(data, 'work.short_item_name')} 제작 추진을 승인받기 위한 내부 기안서이다.")
    add_para(doc, "본 단계에서는 제작 필요성, 과업 범위, 산출물, 검수 방향 및 후속 발주 절차를 정리하며, 특정 업체 또는 확정 금액은 견적서 수취 이후 별도 검토한다.")
    add_body_index(doc, [
        "기안 목적 및 승인 요청 범위",
        "과제 관련성 및 추진 필요성",
        "제작 개요",
        "플랫폼 활용 및 검증 범위",
        "주요 제작 사양",
        "납품 산출물",
        "견적요청 및 업체 선정 기준",
        "후속 발주 및 집행 계획",
        "검수 및 완료 기준",
        "기대 효과",
        "첨부 및 후속 확보 서류",
        "결재 요청",
    ])
    page_break(doc)

    add_heading(doc, "1", "기안 목적 및 승인 요청 범위")
    add_para(doc, f"본 기안서는 {get(data, 'work.short_item_name')} 제작 필요성을 검토하고, 과업지시서 작성 및 견적요청 절차를 진행하기 위한 내부 승인 문서이다.")
    add_para(doc, f"제작 목적은 {get(data, 'work.purpose')} " + T["purpose_intro_tail"].format(performing=get(data, "project.performing_org")))
    data_table(doc, ["승인 요청 항목", "내용", "비고"], T["approve_rows"])

    add_heading(doc, "2", "과제 관련성 및 추진 필요성")
    add_para(doc, get(data, "work.background"))
    add_para(doc, get(data, "work.business_relevance"))
    data_table(doc, ["구분", "필요성", "과제 활용"], T["relevance_rows"])

    add_heading(doc, "3", "제작 개요")
    kv_table(doc, [
        ("제작명", get(data, "work.short_item_name")),
        ("제작 수량", "1식"),
        ("제작 방식", "외부 전문업체 의뢰 제작"),
        ("집행 비목", get(data, "money.budget_item")),
        ("금액 확정", "과업지시서 송부 및 견적서 수취 후 확정"),
        ("업체 확정", "견적서 수취 및 내부 검토 후 확정"),
        ("예정 수행기간", get(data, "schedule.contract_period")),
    ])
    page_break(doc)

    add_heading(doc, "4", "플랫폼 활용 및 검증 범위")
    add_para(doc, T["platform_para"])
    data_table(doc, ["번호", "활용 영역", "검증 내용", "주관"], verification_rows(data), size=7.8)

    add_heading(doc, "5", "주요 제작 사양")
    data_table(doc, ["번호", "항목", "사양"], specs_rows(data), size=7.8)
    spec_postscript = (
        "상기 사양은 견적요청 및 과업지시서의 기준 사양이며, 세부 수치 또는 구현 수단(라이브러리·모델 버전 등)은 업체 견적·제작 가능성 검토 과정에서 동등 이상 범위로 협의할 수 있다."
        if work_type == "simulator" else
        "상기 사양은 견적요청 및 과업지시서의 기준 사양이며, 세부 수치 또는 부품 모델은 업체 견적·제작 가능성 검토 과정에서 동등 이상 범위로 협의할 수 있다."
    )
    add_para(doc, spec_postscript)

    add_heading(doc, "6", "예정 산출물 (카테고리)")
    add_para(doc, "본 단계에서는 산출물의 _카테고리_ 만 정의한다. 구체적인 파일 구성·페이지 수·핵심 내용은 과업 진행 결과에 따라 검수확인서·완료보고서 단계에서 명기된다.")
    data_table(doc, ["번호", "산출물 카테고리", "예정 내용"], abstract_deliverable_rows(data), size=8.0)
    page_break(doc)

    add_heading(doc, "7", "견적요청 및 업체 선정 기준")
    data_table(doc, ["검토 항목", "검토 기준", "확인 방법"], T["quote_rows"])

    add_heading(doc, "8", "후속 발주 및 집행 계획")
    delivery_summary = "시뮬레이터 시작품 및 납품자료 수령" if work_type == "simulator" else "시제품 본체 및 납품문서 수령"
    data_table(doc, ["순서", "예정일", "문서/절차", "주요 내용"], [
        [1, get(data, "schedule.memo_date"), "기안서", "제작 추진 및 과업지시서 작성 승인"],
        [2, get(data, "schedule.task_order_date"), "과업지시서", "업체 송부용 제작 범위 및 검수 기준 제시"],
        [3, get(data, "schedule.quote_date"), "견적서 수취", "품명, 수량, 금액, 유효기간 확인"],
        [4, get(data, "schedule.order_date"), "발주서/계약서", "발주 조건 및 계약 조건 확정"],
        [5, get(data, "schedule.delivery_date"), "납품", delivery_summary],
        [6, get(data, "schedule.inspection_date"), "검수확인서/완료보고서", "산출물 확인 및 완료 보고"],
    ], size=7.8)

    add_heading(doc, "9", "검수 및 완료 기준")
    data_table(doc, ["구분", "검수 기준", "완료 판단"], inspection_rows(data), size=7.5)

    add_heading(doc, "10", "기대 효과")
    effects = get(data, "work.expected_effects", [])
    if not effects:
        effects = [
            "실제 하드웨어 기반의 A-SW 서비스 플랫폼 프로젝트 등록 및 산출물 관리 검증",
            "ROS2 패키지, 컨트롤러별 배포 이력, 시험 로그 관리의 기준 데이터 확보",
            "정부연구개발사업 연구재료비 집행 목적과 납품·검수·완료 증빙 체계 정비",
        ]
    bullet_list(doc, effects)

    add_heading(doc, "11", "첨부 및 후속 확보 서류")
    followups = get(data, "work.followup_documents", [])
    if not followups:
        followups = ["과업지시서", "견적서", "발주서", "계약서", "거래명세서", "전자세금계산서", "사업자등록증", "통장사본", "검수확인서", "완료보고서"]
    data_table(doc, ["구분", "서류", "확보 시점"], [[idx, name, "해당 절차 진행 시"] for idx, name in enumerate(followups, 1)], size=8.0)

    add_heading(doc, "12", "결재 요청")
    add_para(doc, f"상기와 같이 {get(data, 'work.short_item_name')} 제작 추진, 과업지시서 작성 및 견적요청 절차 진행을 승인하여 주시기 바랍니다.")
    data_table(doc, ["결재 구분", "확인 내용", "비고"], [
        ["기안", "제작 추진 필요성 및 과업 범위 확인", "작성자"],
        ["검토", "집행 비목, 과제 관련성, 후속 증빙 확보 가능성 확인", "검토자"],
        ["승인", "과업지시서 작성 및 견적요청 진행 승인", "승인자"],
    ])
    return save_doc(doc, out)
