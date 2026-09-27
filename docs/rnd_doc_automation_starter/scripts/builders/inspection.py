from __future__ import annotations

from .common import *


def add_photo_appendix(doc: Document, data: dict[str, Any]):
    photos = get(data, "work.inspection_photos", [])
    add_heading(doc, "5", "검수 사진")
    if not photos:
        add_para(doc, "검수 사진은 별도 첨부자료로 관리한다.")
        return

    for group_start in range(0, len(photos), 4):
        if group_start:
            page_break(doc)
        group = photos[group_start : group_start + 4]
        rows = (len(group) + 1) // 2
        table = doc.add_table(rows=rows, cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = True

        for local_idx, photo in enumerate(group):
            row_idx = local_idx // 2
            col_idx = local_idx % 2
            idx = group_start + local_idx + 1
            cell = table.rows[row_idx].cells[col_idx]
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            cell.text = ""

            caption = photo.get("caption", f"사진 {idx}")
            path = Path(photo.get("path", ""))

            caption_para = cell.paragraphs[0]
            caption_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            caption_para.paragraph_format.keep_with_next = True
            caption_para.paragraph_format.space_after = Pt(4)
            caption_run = caption_para.add_run(caption)
            caption_run.bold = True
            caption_run.font.name = "Malgun Gothic"
            caption_run._element.rPr.rFonts.set(qn("w:eastAsia"), "Malgun Gothic")
            caption_run.font.size = Pt(8.5)

            image_para = cell.add_paragraph()
            image_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            image_para.paragraph_format.keep_together = True
            image_para.paragraph_format.space_after = Pt(10)
            if path.exists():
                image_para.add_run().add_picture(str(path), width=Inches(2.7))
            else:
                missing = image_para.add_run(f"이미지 파일 확인 필요: {path}")
                missing.font.name = "Malgun Gothic"
                missing._element.rPr.rFonts.set(qn("w:eastAsia"), "Malgun Gothic")
                missing.font.size = Pt(8.0)

        for local_idx in range(len(group), rows * 2):
            row_idx = local_idx // 2
            col_idx = local_idx % 2
            table.rows[row_idx].cells[col_idx].text = ""

        doc.add_paragraph().paragraph_format.space_after = Pt(4)

_SIMULATOR_OPINION = (
    "검수자는 과업지시서, 발주서 및 납품 산출물 목록을 기준으로 시뮬레이터 시작품의 실행 빌드, "
    "소스코드 패키지, 디텍션 모델 자산, 시나리오·데이터셋, 시스템 아키텍처 설계서, 운용 매뉴얼, "
    "개발자/관리자 가이드, 검수 플랜, 검수 시험 결과 보고서, 운용 데모 녹화의 제출 여부와 검수 기준 충족 여부를 확인하였다."
)

_HARDWARE_OPINION = (
    "검수자는 과업지시서, 발주서 및 납품자료 목록을 기준으로 시제품 본체, 외관 상태, 구동부 구성, "
    "조작부 구성, BOM·사양서·도면자료·구동자료 제출 여부를 확인하였다."
)

def _opinion_for(data):
    return _SIMULATOR_OPINION if get(data, "package.work_type") == "simulator" else _HARDWARE_OPINION


def build_inspection(data: dict[str, Any], out: Path):
    doc = new_doc()
    add_cover(doc, "검수확인서", get(data, "work.short_item_name"), None)
    add_para(doc, "검수 결과: 적합 / 검수 완료", size=12, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, after=10)
    add_heading(doc, "1", "검수 대상")
    kv_table(doc, [
        ("문서명", "검수확인서"),
        ("검수일자", get(data, "schedule.inspection_date")),
        ("납품일자", get(data, "schedule.delivery_date")),
        ("검수대상", get(data, "work.short_item_name")),
        ("수행업체", get(data, "vendor.name")),
        ("납품수량", "1식"),
        ("공급가액", money(get(data, "money.supply"))),
        ("부가세", money(get(data, "money.vat"))),
        ("총 지급 예정액", money(get(data, "money.total"))),
    ])
    add_heading(doc, "2", "과제 정보")
    kv_table(doc, project_rows(data) + [("집행 비목", get(data, "money.budget_item"))])
    add_heading(doc, "3", "납품 산출물")
    # 검수확인서는 실제 검수 시점이므로 구체적 산출물 (파일명·핵심 내용) 명기.
    delivs = get(data, "work.deliverables", [])
    deliv_rows = []
    for idx, item in enumerate(delivs, 1):
        name = item.get("name", "")
        fh = item.get("file_hint", "")
        desc = item.get("description", "")
        summary = (desc[:58] + "…") if len(desc) > 60 else desc
        deliv_rows.append([idx, name, fh, summary])
    data_table(doc, ["번호", "산출물", "파일명/경로", "핵심 내용"], deliv_rows, size=7.4)

    add_heading(doc, "4", "검수 기준 및 확인 결과")
    data_table(doc, ["구분", "확인 내용", "결과"], inspection_rows(data), size=7.5)
    add_heading(doc, "5", "검수 의견")
    add_para(doc, _opinion_for(data))
    add_para(doc, "확인 결과 주요 산출물이 제출되었고 검수 기준상 보완이 필요한 사항은 발견되지 않았으므로 본 건을 검수 완료로 판단한다.")
    data_table(doc, ["구분", "내용"], [
        ["보완사항", "검수 기준상 즉시 보완이 필요한 사항 없음"],
        ["검수 결과", "납품 산출물과 검수 기준을 확인한 결과 적합으로 판정"],
        ["후속 처리", "완료보고서 작성 및 대금 지급 증빙 확보 절차 진행"],
    ])
    add_signature_table(doc, "검수 확인")
    page_break(doc)
    add_photo_appendix(doc, data)
    return save_doc(doc, out)
