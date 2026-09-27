from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any
from zipfile import ZipFile


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def get(data: dict[str, Any], path: str, default: Any = "") -> Any:
    cur: Any = data
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


def norm(text: str) -> str:
    text = text.replace("\\", "/")
    text = re.sub(r"/+", "/", text)
    return text.strip().strip("/")


def loose(text: str) -> str:
    return re.sub(r"[\s_\-./()]+", "", norm(text).lower())


def list_delivery_files(path: Path) -> list[str]:
    if path.is_dir():
        return sorted(norm(str(p.relative_to(path))) for p in path.rglob("*") if p.is_file())
    if path.suffix.lower() == ".zip":
        with ZipFile(path) as z:
            return sorted(norm(name) for name in z.namelist() if not name.endswith("/"))
    raise ValueError(f"지원하지 않는 납품자료 경로입니다: {path}")


def split_hints(file_hint: str) -> list[str]:
    parts = []
    for chunk in re.split(r"[,;\n]", file_hint or ""):
        chunk = norm(chunk)
        if chunk:
            parts.append(chunk)
    return parts


def should_skip(hint: str, profile: dict[str, Any]) -> bool:
    skip_terms = profile.get("delivery_audit", {}).get("skip_file_hints_containing", ["실물", "별첨"])
    return any(term in hint for term in skip_terms)


def match_hint(hint: str, files: list[str]) -> tuple[bool, str]:
    hint = norm(hint)
    if not hint:
        return True, ""
    if hint.endswith("/"):
        return any(f.startswith(hint) for f in files), hint
    if hint in files:
        return True, hint
    if any(f.endswith("/" + hint) or f == hint for f in files):
        return True, hint

    hint_loose = loose(hint)
    for f in files:
        file_loose = loose(f)
        if hint_loose and (hint_loose in file_loose or file_loose in hint_loose):
            return True, f
    return False, hint


def audit(data: dict[str, Any], delivery_path: Path, profile: dict[str, Any]) -> tuple[list[dict[str, str]], list[str]]:
    files = list_delivery_files(delivery_path)
    results: list[dict[str, str]] = []
    for item in get(data, "work.deliverables", []):
        name = item.get("name", "")
        hint_text = item.get("file_hint", "")
        hints = split_hints(hint_text)
        if not hints:
            results.append({"deliverable": name, "hint": "", "status": "SKIP", "match": "파일명 힌트 없음"})
            continue
        for hint in hints:
            if should_skip(hint, profile):
                results.append({"deliverable": name, "hint": hint, "status": "SKIP", "match": "실물/별첨 자료"})
                continue
            matched, matched_value = match_hint(hint, files)
            results.append({
                "deliverable": name,
                "hint": hint,
                "status": "PASS" if matched else "FAIL",
                "match": matched_value if matched else "납품자료 목록에서 찾지 못함",
            })
    return results, files


def write_report(out: Path, data: dict[str, Any], delivery_path: Path, results: list[dict[str, str]], files: list[str]):
    pass_count = sum(1 for r in results if r["status"] == "PASS")
    fail_count = sum(1 for r in results if r["status"] == "FAIL")
    skip_count = sum(1 for r in results if r["status"] == "SKIP")
    lines = [
        "# 납품문서 산출물 대조 결과",
        "",
        f"- 과업명: {get(data, 'work.short_item_name')}",
        f"- 납품자료 경로: `{delivery_path}`",
        f"- 확인 결과: PASS {pass_count}, FAIL {fail_count}, SKIP {skip_count}",
        "",
        "## 산출물별 대조",
        "",
        "| 상태 | 산출물 | 입력 파일명/경로 | 매칭 결과 |",
        "|---|---|---|---|",
    ]
    for row in results:
        lines.append(f"| {row['status']} | {row['deliverable']} | `{row['hint']}` | `{row['match']}` |")

    lines += [
        "",
        "## 납품자료 파일 목록",
        "",
    ]
    for file in files:
        lines.append(f"- `{file}`")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Audit delivery package files against input deliverables.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--delivery", type=Path, required=True)
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--out", type=Path, default=Path("outputs/delivery_audit.md"))
    parser.add_argument("--fail-on-missing", action="store_true")
    args = parser.parse_args()

    data = load_json(args.input)
    profile = load_json(args.profile) if args.profile else {}
    results, files = audit(data, args.delivery, profile)
    write_report(args.out, data, args.delivery, results, files)
    print(args.out)
    if args.fail_on_missing and any(row["status"] == "FAIL" for row in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
