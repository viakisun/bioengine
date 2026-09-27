from __future__ import annotations

from pathlib import Path
from typing import Any

from .common import get, load_input, safe_name
from .completion import build_completion
from .contract import build_contract
from .inspection import build_inspection
from .memo import build_memo
from .purchase_order import build_purchase_order
from .support import build_index, build_vendor_request
from .task_order import build_task_order


def generate(data: dict[str, Any], out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = safe_name(get(data, "package.output_prefix", "RND_DOC"))
    files = [
        build_memo(data, out_dir / f"01_{prefix}_기안서.docx"),
        build_task_order(data, out_dir / f"02_{prefix}_과업지시서.docx"),
        build_purchase_order(data, out_dir / f"04_{prefix}_발주서.docx"),
        build_contract(data, out_dir / f"05_{prefix}_계약서.docx"),
        build_inspection(data, out_dir / f"09_{prefix}_검수확인서.docx"),
        build_completion(data, out_dir / f"10_{prefix}_완료보고서.docx"),
        build_vendor_request(data, out_dir / "업체_제출요청자료.md"),
    ]
    build_index(data, out_dir / "00_생성문서_목록.md", files)
    return files
