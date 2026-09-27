from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import pdfplumber


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


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
    return f"{int(value):,}"


def compact(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def pdf_text(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def expected_checks(data: dict[str, Any], doc_type: str) -> list[tuple[str, str]]:
    item = get(data, "work.short_item_name")
    supply = money(get(data, "money.supply"))
    vat = money(get(data, "money.vat"))
    total = money(get(data, "money.total"))
    checks = [("품명", item), ("공급가액", supply), ("부가세", vat), ("합계", total)]
    if doc_type == "quotation":
        checks.insert(0, ("견적일자", get(data, "schedule.quote_date")))
    elif doc_type == "transaction_statement":
        checks.insert(0, ("거래일자", get(data, "schedule.delivery_date")))
    elif doc_type == "tax_invoice":
        checks.insert(0, ("공급일자", get(data, "schedule.delivery_date")))
    return [(label, value) for label, value in checks if value]


def audit_pdf(data: dict[str, Any], doc_type: str, path: Path) -> list[dict[str, str]]:
    raw_text = pdf_text(path)
    flat = compact(raw_text)
    rows: list[dict[str, str]] = []
    for label, value in expected_checks(data, doc_type):
        candidates = {value, value.replace(".", "-"), value.replace("-", "."), value.replace(",", "")}
        if label == "품명":
            candidates.add(value.replace(" ", ""))
        ok = any(compact(candidate) in flat for candidate in candidates)
        rows.append({
            "file": str(path),
            "doc_type": doc_type,
            "label": label,
            "expected": value,
            "status": "PASS" if ok else "FAIL",
        })
    if not raw_text.strip():
        rows.append({
            "file": str(path),
            "doc_type": doc_type,
            "label": "PDF 텍스트 추출",
            "expected": "텍스트 추출 가능 PDF",
            "status": "FAIL",
        })
    return rows


def write_report(out: Path, rows: list[dict[str, str]]):
    fail_count = sum(1 for row in rows if row["status"] == "FAIL")
    pass_count = sum(1 for row in rows if row["status"] == "PASS")
    lines = [
        "# 업체 수취 PDF 정합성 검수 결과",
        "",
        f"- 확인 결과: PASS {pass_count}, FAIL {fail_count}",
        "",
        "| 상태 | 문서유형 | 파일 | 항목 | 기대값 |",
        "|---|---|---|---|---|",
    ]
    for row in rows:
        lines.append(f"| {row['status']} | {row['doc_type']} | `{row['file']}` | {row['label']} | `{row['expected']}` |")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Audit vendor PDF evidence documents.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--quotation", type=Path)
    parser.add_argument("--transaction-statement", type=Path)
    parser.add_argument("--tax-invoice", type=Path)
    parser.add_argument("--out", type=Path, default=Path("outputs/vendor_docs_audit.md"))
    parser.add_argument("--fail-on-missing", action="store_true")
    args = parser.parse_args()

    data = load_json(args.input)
    rows: list[dict[str, str]] = []
    paths = [
        ("quotation", args.quotation),
        ("transaction_statement", args.transaction_statement),
        ("tax_invoice", args.tax_invoice),
    ]
    for doc_type, path in paths:
        if path:
            rows.extend(audit_pdf(data, doc_type, path))
    if not rows:
        rows.append({
            "file": "",
            "doc_type": "",
            "label": "검수 대상",
            "expected": "견적서/거래명세서/세금계산서 PDF 중 1개 이상",
            "status": "FAIL",
        })
    write_report(args.out, rows)
    print(args.out)
    if args.fail_on_missing and any(row["status"] == "FAIL" for row in rows):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
