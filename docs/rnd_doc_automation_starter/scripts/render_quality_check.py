from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader


DEFAULT_PDFTOPPM = Path(
    r"C:\Users\kisun\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe"
)


def find_pdftoppm() -> Path:
    if DEFAULT_PDFTOPPM.exists():
        return DEFAULT_PDFTOPPM
    found = shutil.which("pdftoppm")
    if found:
        return Path(found)
    raise FileNotFoundError("pdftoppm 실행 파일을 찾지 못했습니다.")


def pdf_page_count(pdf: Path) -> int:
    return len(PdfReader(str(pdf)).pages)


def render_pdf(pdf: Path, out_dir: Path, pdftoppm: Path, dpi: int) -> list[Path]:
    page_dir = out_dir / pdf.stem
    page_dir.mkdir(parents=True, exist_ok=True)
    for old_png in page_dir.glob("*.png"):
        old_png.unlink()
    prefix = page_dir / pdf.stem
    subprocess.run([str(pdftoppm), "-r", str(dpi), "-png", str(pdf), str(prefix)], check=True)
    return sorted(page_dir.glob(f"{pdf.stem}-*.png"))


def make_contact_sheet(images: list[Path], out: Path, label: str):
    if not images:
        return
    thumbs = []
    for image_path in images:
        img = Image.open(image_path).convert("RGB")
        scale = 720 / img.width
        thumb = img.resize((720, int(img.height * scale)))
        canvas = Image.new("RGB", (thumb.width, thumb.height + 34), "white")
        canvas.paste(thumb, (0, 34))
        draw = ImageDraw.Draw(canvas)
        draw.text((8, 8), image_path.stem, fill="black")
        thumbs.append(canvas)

    cols = 2
    gap = 24
    title_h = 42
    rows = (len(thumbs) + cols - 1) // cols
    cell_w = max(t.width for t in thumbs)
    cell_h = max(t.height for t in thumbs)
    sheet = Image.new("RGB", (cols * cell_w + (cols - 1) * gap, title_h + rows * cell_h + (rows - 1) * gap), "white")
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 10), label, fill="black")
    for idx, thumb in enumerate(thumbs):
        x = (idx % cols) * (cell_w + gap)
        y = title_h + (idx // cols) * (cell_h + gap)
        sheet.paste(thumb, (x, y))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)


def write_report(out: Path, rows: list[dict[str, str]], pdftoppm: Path):
    lines = [
        "# PDF 렌더 품질 확인 결과",
        "",
        f"- 렌더러: `{pdftoppm}`",
        f"- 확인 PDF 수: {len(rows)}",
        "",
        "| PDF | 페이지 | 렌더 PNG | Contact sheet | 상태 |",
        "|---|---:|---:|---|---|",
    ]
    for row in rows:
        lines.append(
            f"| `{row['pdf']}` | {row['pages']} | {row['rendered']} | `{row['contact']}` | {row['status']} |"
        )
    out.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Render PDFs to PNG pages and contact sheets for visual QA.")
    parser.add_argument("--pdf-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--dpi", type=int, default=120)
    parser.add_argument("--fail-on-error", action="store_true")
    args = parser.parse_args()

    pdftoppm = find_pdftoppm()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, str]] = []
    had_error = False
    for pdf in sorted(args.pdf_dir.glob("*.pdf")):
        try:
            pages = pdf_page_count(pdf)
            images = render_pdf(pdf, args.out_dir, pdftoppm, args.dpi)
            contact = args.out_dir / f"{pdf.stem}_contact.png"
            if contact.exists():
                contact.unlink()
            make_contact_sheet(images, contact, pdf.name)
            status = "PASS" if len(images) == pages and pages > 0 else "FAIL"
            if status == "FAIL":
                had_error = True
            rows.append({
                "pdf": pdf.name,
                "pages": str(pages),
                "rendered": str(len(images)),
                "contact": str(contact),
                "status": status,
            })
        except Exception as exc:
            had_error = True
            rows.append({
                "pdf": pdf.name,
                "pages": "0",
                "rendered": "0",
                "contact": "",
                "status": f"FAIL: {exc}",
            })
    args.report.parent.mkdir(parents=True, exist_ok=True)
    write_report(args.report, rows, pdftoppm)
    print(args.report)
    if args.fail_on_error and had_error:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
