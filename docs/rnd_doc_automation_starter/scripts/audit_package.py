from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from zipfile import ZipFile


def load_input(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_profile(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def default_profile_path(data: dict[str, Any]) -> Path | None:
    work_type = get(data, "package.work_type")
    if not work_type:
        return None
    candidate = Path(__file__).resolve().parents[1] / "profiles" / f"{work_type}.json"
    return candidate if candidate.exists() else None


def get(data: dict[str, Any], path: str, default: Any = "") -> Any:
    cur: Any = data
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


def money(value: Any) -> str:
    if value in (None, ""):
        return ""
    return f"{int(value):,}원"


def docx_text(path: Path) -> str:
    with ZipFile(path) as docx:
        parts = []
        for name in docx.namelist():
            if name.startswith("word/") and name.endswith(".xml"):
                parts.append(docx.read(name).decode("utf-8", "ignore"))
    text = " ".join(parts)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text


def parse_date(value: str) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    for fmt in ("%Y.%m.%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            pass
    return None


def severity_rank(severity: str) -> int:
    return {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "INFO": 3}.get(severity, 9)


def add_issue(issues: list[dict[str, str]], severity: str, doc: str, message: str):
    issues.append({"severity": severity, "document": doc, "message": message})


def find_doc(docs_dir: Path, prefix: str) -> Path | None:
    matches = sorted(docs_dir.glob(f"{prefix}_*.docx"))
    return matches[0] if matches else None


def audit(data: dict[str, Any], docs_dir: Path, profile: dict[str, Any] | None = None) -> tuple[list[dict[str, str]], dict[str, int]]:
    profile = profile or {}
    issues: list[dict[str, str]] = []
    scores: dict[str, int] = {}
    docs = {
        "01 기안서": find_doc(docs_dir, "01"),
        "02 과업지시서": find_doc(docs_dir, "02"),
        "04 발주서": find_doc(docs_dir, "04"),
        "05 계약서": find_doc(docs_dir, "05"),
        "09 검수확인서": find_doc(docs_dir, "09"),
        "10 완료보고서": find_doc(docs_dir, "10"),
    }

    expected = {
        "과제번호": get(data, "project.number"),
        "사업명": get(data, "project.name"),
        "품명": get(data, "work.short_item_name"),
        "업체명": get(data, "vendor.name"),
        "계약기간": get(data, "schedule.contract_period"),
        "납품일": get(data, "schedule.delivery_date"),
        "검수일": get(data, "schedule.inspection_date"),
        "공급가액": money(get(data, "money.supply")),
        "부가세": money(get(data, "money.vat")),
        "총액": money(get(data, "money.total")),
    }
    forbidden = list(get(data, "rules.forbidden_terms", []))

    text_by_doc: dict[str, str] = {}
    for doc_name, path in docs.items():
        if path is None:
            add_issue(issues, "HIGH", doc_name, "문서 파일을 찾을 수 없습니다.")
            scores[doc_name] = 0
            continue
        text = docx_text(path)
        text_by_doc[doc_name] = text
        score = 100

        for label in ("과제번호", "사업명", "품명"):
            if expected[label] and expected[label] not in text:
                add_issue(issues, "HIGH", doc_name, f"{label} 누락 또는 불일치: {expected[label]}")
                score -= 20

        for term in forbidden:
            if term and term in text:
                add_issue(issues, "MEDIUM", doc_name, f"금지어 또는 지양 표현 포함: {term}")
                score -= 10

        scores[doc_name] = max(0, score)

    memo_text = text_by_doc.get("01 기안서", "")
    if get(data, "rules.memo_exclude_vendor", True) and expected["업체명"] and expected["업체명"] != "업체명 미정" and expected["업체명"] in memo_text:
        add_issue(issues, "HIGH", "01 기안서", "기안서에 업체명이 포함되어 있습니다.")
        scores["01 기안서"] = max(0, scores.get("01 기안서", 100) - 20)
    if get(data, "rules.memo_exclude_amount", True) and expected["총액"] and expected["총액"] in memo_text:
        add_issue(issues, "HIGH", "01 기안서", "기안서에 확정 금액이 포함되어 있습니다.")
        scores["01 기안서"] = max(0, scores.get("01 기안서", 100) - 20)

    task_text = text_by_doc.get("02 과업지시서", "")
    if get(data, "rules.task_order_exclude_amount", True) and expected["총액"] and expected["총액"] in task_text:
        add_issue(issues, "MEDIUM", "02 과업지시서", "과업지시서에 확정 금액이 포함되어 있습니다.")
        scores["02 과업지시서"] = max(0, scores.get("02 과업지시서", 100) - 10)
    for phrase in ("업체 수행 범위", "발주기관 내부 수행 범위", "과업 제외 범위"):
        if phrase not in task_text:
            add_issue(issues, "MEDIUM", "02 과업지시서", f"범위 구분 섹션이 부족합니다: {phrase}")
            scores["02 과업지시서"] = max(0, scores.get("02 과업지시서", 100) - 8)

    for prefix, spec in profile.get("documents", {}).items():
        profile_doc_name = f"{prefix} {spec.get('name', '')}".strip()
        path = find_doc(docs_dir, prefix)
        if path is None:
            add_issue(issues, "HIGH", profile_doc_name, "profile 기준 문서 파일을 찾을 수 없습니다.")
            scores[profile_doc_name] = 0
            continue
        text = text_by_doc.get(profile_doc_name) or docx_text(path)
        for section in spec.get("required_sections", []):
            if section not in text:
                add_issue(issues, "MEDIUM", profile_doc_name, f"profile 필수 섹션 누락: {section}")
                scores[profile_doc_name] = max(0, scores.get(profile_doc_name, 100) - 6)
        if spec.get("forbid_vendor") and expected["업체명"] and expected["업체명"] in text:
            add_issue(issues, "HIGH", profile_doc_name, "profile 규칙 위반: 업체명이 포함되어 있습니다.")
            scores[profile_doc_name] = max(0, scores.get(profile_doc_name, 100) - 20)
        if spec.get("forbid_amount") and expected["총액"] and expected["총액"] in text:
            add_issue(issues, "HIGH", profile_doc_name, "profile 규칙 위반: 확정 금액이 포함되어 있습니다.")
            scores[profile_doc_name] = max(0, scores.get(profile_doc_name, 100) - 20)
        if spec.get("requires_images"):
            with ZipFile(path) as z:
                media = [n for n in z.namelist() if n.startswith("word/media/")]
            if not media:
                add_issue(issues, "MEDIUM", profile_doc_name, "profile 규칙 위반: 이미지 별첨이 없습니다.")
                scores[profile_doc_name] = max(0, scores.get(profile_doc_name, 100) - 10)

    for doc_name in ("04 발주서", "05 계약서", "09 검수확인서", "10 완료보고서"):
        text = text_by_doc.get(doc_name, "")
        if expected["업체명"] and expected["업체명"] not in text:
            add_issue(issues, "MEDIUM", doc_name, "업체명이 누락되어 있습니다.")
            scores[doc_name] = max(0, scores.get(doc_name, 100) - 10)

    for doc_name in ("04 발주서", "05 계약서", "09 검수확인서"):
        text = text_by_doc.get(doc_name, "")
        for label in ("공급가액", "부가세", "총액"):
            if expected[label] and expected[label] not in text:
                add_issue(issues, "MEDIUM", doc_name, f"{label} 누락 또는 불일치: {expected[label]}")
                scores[doc_name] = max(0, scores.get(doc_name, 100) - 8)

    inspection_text = text_by_doc.get("09 검수확인서", "")
    completion_text = text_by_doc.get("10 완료보고서", "")
    for label in ("납품일", "검수일"):
        if expected[label] and expected[label] not in inspection_text:
            add_issue(issues, "HIGH", "09 검수확인서", f"{label} 누락 또는 불일치: {expected[label]}")
            scores["09 검수확인서"] = max(0, scores.get("09 검수확인서", 100) - 15)
        if expected[label] and expected[label] not in completion_text:
            add_issue(issues, "HIGH", "10 완료보고서", f"{label} 누락 또는 불일치: {expected[label]}")
            scores["10 완료보고서"] = max(0, scores.get("10 완료보고서", 100) - 15)

    deliverables = get(data, "work.deliverables", [])
    for item in deliverables:
        name = item.get("name", "")
        hint = item.get("file_hint", "")
        if name and name not in completion_text:
            add_issue(issues, "MEDIUM", "10 완료보고서", f"완료보고서 산출물명 누락: {name}")
            scores["10 완료보고서"] = max(0, scores.get("10 완료보고서", 100) - 5)
        if hint and hint not in completion_text:
            add_issue(issues, "LOW", "10 완료보고서", f"완료보고서 파일명/경로 누락: {hint}")
            scores["10 완료보고서"] = max(0, scores.get("10 완료보고서", 100) - 3)

    date_fields = [
        ("memo_date", "기안일"),
        ("task_order_date", "과업지시일"),
        ("quote_date", "견적일"),
        ("order_date", "발주일"),
        ("contract_date", "계약일"),
        ("delivery_date", "납품일"),
        ("inspection_date", "검수일"),
        ("completion_date", "완료보고일"),
    ]
    parsed = [(field, label, parse_date(get(data, f"schedule.{field}"))) for field, label in date_fields]
    previous = None
    previous_label = ""
    for _, label, value in parsed:
        if value is None:
            continue
        if previous and value < previous:
            add_issue(issues, "HIGH", "일정", f"{label}이 {previous_label}보다 빠릅니다.")
        previous = value
        previous_label = label

    return sorted(issues, key=lambda x: (severity_rank(x["severity"]), x["document"], x["message"])), scores


def write_report(path: Path, issues: list[dict[str, str]], scores: dict[str, int]):
    lines = ["# 정합성 및 완성도 검수 결과", ""]
    if not issues:
        lines.append("전체적으로 치명적인 정합성 이슈가 없습니다.")
    else:
        lines.append("## 이슈 목록")
        lines.append("")
        lines.append("| 우선도 | 문서 | 내용 |")
        lines.append("|---|---|---|")
        for issue in issues:
            lines.append(f"| {issue['severity']} | {issue['document']} | {issue['message']} |")
    lines.append("")
    lines.append("## 문서별 완성도")
    lines.append("")
    lines.append("| 문서 | 점수 |")
    lines.append("|---|---:|")
    for doc_name, score in sorted(scores.items()):
        lines.append(f"| {doc_name} | {score} |")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Audit generated R&D document package.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--docs", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("outputs/audit.md"))
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--fail-on-high", action="store_true")
    args = parser.parse_args()

    data = load_input(args.input)
    profile_path = args.profile or default_profile_path(data)
    profile = load_profile(profile_path)
    issues, scores = audit(data, args.docs, profile)
    write_report(args.out, issues, scores)
    print(args.out)
    if args.fail_on_high and any(issue["severity"] == "HIGH" for issue in issues):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
