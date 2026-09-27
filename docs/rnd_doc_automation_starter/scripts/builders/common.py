from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt


BLACK = "000000"
GRAY = "666666"
FILL = "EDEDED"
LIGHT_FILL = "F7F7F7"

def load_input(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))

def money(value: Any) -> str:
    if value in (None, ""):
        return ""
    return f"{int(value):,}원"

def safe_name(text: str) -> str:
    text = re.sub(r"[\\/:*?\"<>|]+", "_", text)
    text = re.sub(r"\s+", "_", text.strip())
    return text[:80]

def get(data: dict[str, Any], path: str, default: Any = "") -> Any:
    cur: Any = data
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur

def set_cell_shading(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)

def set_cell_text(
    cell,
    text: Any,
    *,
    bold: bool = False,
    size: float = 9.0,
    fill: str | None = None,
    align=WD_ALIGN_PARAGRAPH.LEFT,
):
    cell.text = ""
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    if fill:
        set_cell_shading(cell, fill)
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.1
    run = p.add_run(str(text or ""))
    run.bold = bold
    run.font.name = "Malgun Gothic"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Malgun Gothic")
    run.font.size = Pt(size)

def set_table_borders(table):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "6")
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), BLACK)

def configure_document(doc: Document):
    section = doc.sections[0]
    section.top_margin = Inches(0.75)
    section.bottom_margin = Inches(0.75)
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)
    section.header_distance = Inches(0.45)
    section.footer_distance = Inches(0.45)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Malgun Gothic"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Malgun Gothic")
    normal.font.size = Pt(9.5)
    normal.paragraph_format.line_spacing = 1.15
    normal.paragraph_format.space_after = Pt(6)

def add_para(
    doc: Document,
    text: str = "",
    *,
    size: float = 9.5,
    bold: bool = False,
    align=None,
    after: float = 6,
    before: float = 0,
):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.15
    r = p.add_run(text)
    r.bold = bold
    r.font.name = "Malgun Gothic"
    r._element.rPr.rFonts.set(qn("w:eastAsia"), "Malgun Gothic")
    r.font.size = Pt(size)
    return p

def add_heading(doc: Document, number: str | None, title: str):
    text = f"{number}. {title}" if number else title
    return add_para(doc, text, size=14 if number else 12, bold=True, after=7, before=4)

def add_subheading(doc: Document, title: str):
    return add_para(doc, title, size=10.5, bold=True, after=3, before=2)

def add_rule(doc: Document):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(12)
    p_pr = p._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "8")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), BLACK)
    borders.append(bottom)
    p_pr.append(borders)

def page_break(doc: Document):
    doc.add_page_break()

def add_cover(doc: Document, title: str, subtitle: str, date: str | None = None):
    add_para(doc, "", after=150)
    add_para(doc, title, size=25, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, after=12)
    add_para(doc, subtitle, size=13, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, after=4)
    if date:
        add_para(doc, date, size=9.5, align=WD_ALIGN_PARAGRAPH.CENTER, after=16)
    add_rule(doc)
    add_para(doc, "정부연구개발사업 집행·정산 증빙용", size=9, align=WD_ALIGN_PARAGRAPH.CENTER, after=4)
    page_break(doc)

def kv_table(doc: Document, rows: list[tuple[str, Any]], *, size: float = 8.8):
    table = doc.add_table(rows=len(rows), cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    set_table_borders(table)
    for idx, (label, value) in enumerate(rows):
        set_cell_text(table.rows[idx].cells[0], label, bold=True, fill=FILL, align=WD_ALIGN_PARAGRAPH.CENTER, size=size)
        set_cell_text(table.rows[idx].cells[1], value, size=size)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return table

def data_table(doc: Document, headers: list[str], rows: list[list[Any]], *, size: float = 8.2):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    set_table_borders(table)
    for c, header in enumerate(headers):
        set_cell_text(table.rows[0].cells[c], header, bold=True, fill=FILL, align=WD_ALIGN_PARAGRAPH.CENTER, size=size)
    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            value_text = str(value or "")
            align = WD_ALIGN_PARAGRAPH.CENTER if c == 0 or value_text in ("적합", "없음", "1식", "해당") else WD_ALIGN_PARAGRAPH.LEFT
            set_cell_text(table.rows[r].cells[c], value_text, size=size, align=align)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return table

def bullet_list(doc: Document, items: list[str]):
    for item in items:
        add_para(doc, f"- {item}", size=9.2, after=2)

def project_rows(data: dict[str, Any]) -> list[tuple[str, str]]:
    return [
        ("과제번호", get(data, "project.number")),
        ("사업명", get(data, "project.name")),
        ("사업기간", get(data, "project.period")),
        ("주관연구개발기관", get(data, "project.lead_org")),
        ("수행기관", get(data, "project.performing_org")),
    ]

def save_doc(doc: Document, out: Path):
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out)
    return out

def new_doc() -> Document:
    doc = Document()
    configure_document(doc)
    return doc

def add_signature_table(doc: Document, title: str = "확인"):
    add_subheading(doc, title)
    data_table(
        doc,
        ["구분", "소속/업체", "성명", "서명"],
        [
            ["작성", get_placeholder("작성자"), "", ""],
            ["검토", get_placeholder("검토자"), "", ""],
            ["승인", get_placeholder("승인자"), "", ""],
        ],
        size=8.2,
    )

def get_placeholder(label: str) -> str:
    return f"{label} 기재"

def add_body_index(doc: Document, items: list[str]):
    add_subheading(doc, "본문 구성")
    data_table(doc, ["번호", "구성"], [[idx, item] for idx, item in enumerate(items, 1)], size=8.2)

def specs_rows(data: dict[str, Any]) -> list[list[str]]:
    specs = get(data, "work.specifications", [])
    return [[idx, item.get("item", ""), item.get("value", "")] for idx, item in enumerate(specs, 1)]

def deliverable_rows(data: dict[str, Any]) -> list[list[str]]:
    deliverables = get(data, "work.deliverables", [])
    return [
        [idx, item.get("name", ""), item.get("description", ""), item.get("file_hint", "")]
        for idx, item in enumerate(deliverables, 1)
    ]


def abstract_deliverable_rows(data: dict[str, Any]) -> list[list[str]]:
    """기안서·과업지시서 단계용 — 산출물을 카테고리 단위로만 명기.
    구체 파일·페이지·크기 미확정. 실제 산출물 형태는 검수확인서·완료보고서에서 명기.
    """
    items = get(data, "work.abstract_deliverables", [])
    return [
        [idx, item.get("category", ""), item.get("description", "")]
        for idx, item in enumerate(items, 1)
    ]

def inspection_rows(data: dict[str, Any]) -> list[list[str]]:
    criteria = get(data, "work.inspection_criteria", [])
    return [[item.get("item", ""), item.get("criteria", ""), "적합"] for item in criteria]

def verification_rows(data: dict[str, Any]) -> list[list[str]]:
    rows = get(data, "work.verification_scope", [])
    if rows:
        return [[idx, item.get("area", ""), item.get("use", ""), item.get("owner", "")] for idx, item in enumerate(rows, 1)]
    return [
        [1, "프로젝트 등록", "A-SW 서비스 플랫폼에서 실제 하드웨어 제작 건을 기준 프로젝트로 등록", "비아"],
        [2, "도면·BOM 관리", "업체 납품 도면, BOM, 사양서를 산출물로 등록하고 이력 관리", "비아"],
        [3, "구동자료 관리", "모터드라이버 통신자료와 관련 파일을 시험자료로 분류", "비아"],
        [4, "실차 시험 준비", "ROS2 패키지와 컨트롤러별 배포 이력 검증에 활용", "비아"],
    ]
