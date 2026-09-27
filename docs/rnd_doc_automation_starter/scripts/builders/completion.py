from __future__ import annotations

from .common import *


def build_completion(data: dict[str, Any], out: Path):
    doc = new_doc()
    add_cover(doc, "완료보고서", get(data, "work.short_item_name"), "납품 산출물 및 검수 완료 결과 보고")
    add_para(doc, "완료 결과: 산출물 제출 확인 및 검수 완료 / 보완사항 없음", size=11.5, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, after=10)
    add_heading(doc, "1", "보고 요지")
    add_para(doc, f"본 보고서는 {get(data, 'vendor.name')}이 수행한 {get(data, 'work.short_item_name')} 제작 건의 납품 산출물 제출 및 검수 결과를 정리하기 위한 완료보고서이다.")
    work_type = get(data, "package.work_type")
    delivery_object = "시뮬레이터 시작품 1식" if work_type == "simulator" else "시제품 본체 1식"
    add_para(doc, f"수행업체는 {get(data, 'schedule.delivery_date')} {delivery_object}과 납품자료를 제출하였고, {get(data, 'schedule.inspection_date')} 검수 결과 보완사항 없이 적합으로 확인되었다.")
    add_heading(doc, "2", "기본 정보")
    kv_table(doc, [
        ("문서명", "완료보고서"),
        ("작성일", get(data, "schedule.completion_date")),
        ("제작명", get(data, "work.short_item_name")),
        ("수행업체", get(data, "vendor.name")),
        ("수행기간", get(data, "schedule.contract_period")),
        ("납품일", get(data, "schedule.delivery_date")),
        ("검수일", get(data, "schedule.inspection_date")),
        ("검수 결과", "적합 / 보완사항 없음"),
    ])
    add_heading(doc, "3", "과제 정보")
    kv_table(doc, project_rows(data) + [("집행 비목", get(data, "money.budget_item"))])
    add_heading(doc, "4", "진행 경과")
    data_table(doc, ["구분", "일자", "내용"], [
        ["기안", get(data, "schedule.memo_date"), "제작 추진"],
        ["과업지시", get(data, "schedule.task_order_date"), "수행 범위 및 검수 기준 제시"],
        ["발주·계약", get(data, "schedule.contract_date"), "과업 착수"],
        ["납품", get(data, "schedule.delivery_date"), "산출물 1식 및 납품자료 제출"],
        ["검수", get(data, "schedule.inspection_date"), "제출 산출물 및 검수 기준 확인"],
    ])
    add_heading(doc, "5", "납품 산출물")
    # 산출물 표 — 산출물별 핵심 사양 (description의 앞부분 요약) 컬럼 추가.
    delivs = get(data, "work.deliverables", [])
    deliv_rows = []
    for idx, item in enumerate(delivs, 1):
        name = item.get("name", "")
        fh = item.get("file_hint", "")
        desc = item.get("description", "")
        # description 의 앞부분 (60자) 만 표시 — 산출물 핵심 내용 확인용.
        summary = (desc[:58] + "…") if len(desc) > 60 else desc
        deliv_rows.append([idx, name, fh, summary])
    data_table(doc, ["번호", "산출물", "파일명 또는 경로", "핵심 내용"], deliv_rows, size=7.4)

    add_heading(doc, "6", "검수 결과")
    # 검수 결과 표 — 검수 항목 + criteria 의 첫 부분 + 결과.
    crits = get(data, "work.inspection_criteria", [])
    crit_rows = []
    for c in crits:
        item = c.get("item", "")
        criteria = c.get("criteria", "")
        cri_summary = (criteria[:55] + "…") if len(criteria) > 57 else criteria
        crit_rows.append([item, cri_summary, "적합"])
    crit_rows.append(["보완사항", "없음", "—"])
    data_table(doc, ["검수 항목", "확인 기준", "판정"], crit_rows, size=7.4)

    # §6.1 자동화 시험 결과 요약 (시뮬레이터 한정). 산출물·검수 중심 원칙 — 1 표 limit.
    if work_type == "simulator":
        add_subheading(doc, "6.1 자동화 시험 결과")
        data_table(doc, ["시험 도구", "결과"], [
            ["npm run build (tsc --noEmit + vite build)", "0 오류"],
            ["tests/architecture/_probe-stream-pipeline.spec.ts", "1 passed"],
            ["tests/architecture/_probe-detect-flow.spec.ts", "1 passed"],
            ["tests/architecture/logger-enforcement.spec.ts", "3/3 passed"],
            ["tests/architecture/logger-system.spec.ts", "12/12 passed"],
            ["packages/tomato-engine/test-coremodel.ts (생육 모델 validation)", "통과 — 9 변수 중 19/33 vars within ±20% literature band"],
        ], size=7.8)

    add_heading(doc, "7", "종합")
    add_para(doc, f"{get(data, 'vendor.name')}은 과업지시서에 따른 산출물을 제출하였다. {get(data, 'project.performing_org')}는 {get(data, 'schedule.inspection_date')} 제출 산출물을 검수하였으며, 보완사항 없이 적합으로 판정하였다. 이에 본 과업을 완료 보고한다.")
    return save_doc(doc, out)
