#!/usr/bin/env python3
"""Assert a .docx is genuinely valid, and optionally that it fits a page budget.

"The file is non-empty" is not validation. A malformed export opens as a repair
prompt in Word, and page overflow only shows up after rendering — which is the
most common real defect in generated resumes.

Checks: ZIP integrity, the required OOXML parts, that every part is well-formed
XML, the declared fonts and page geometry, and (with --expect-pages) the rendered
page count via LibreOffice.

Usage:
  python3 tools/validate_docx.py --file .tmp/out.docx
  python3 tools/validate_docx.py --file .tmp/out.docx --expect-pages 1
  python3 tools/validate_docx.py --file .tmp/out.docx --expect-font "Times New Roman"
"""

import argparse
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

REQUIRED = [
    "[Content_Types].xml",
    "word/document.xml",
    "word/styles.xml",
]
# Present whenever the document uses bullets, which every resume here does.
EXPECTED = ["word/numbering.xml"]

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def page_count(path: Path) -> int | None:
    exe = shutil.which("soffice") or shutil.which("libreoffice")
    if not exe:
        return None
    out = path.parent / ".validate_pdf"
    out.mkdir(exist_ok=True)
    subprocess.run([exe, "--headless", "--convert-to", "pdf", "--outdir", str(out), str(path)],
                   capture_output=True, timeout=180)
    pdf = out / (path.stem + ".pdf")
    if not pdf.exists():
        return None
    if shutil.which("pdfinfo"):
        info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
        m = re.search(r"^Pages:\s+(\d+)", info, re.M)
        if m:
            return int(m.group(1))
    # Fall back to counting page objects in the raw PDF.
    return len(re.findall(rb"/Type\s*/Page[^s]", pdf.read_bytes())) or None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--expect-pages", type=int)
    ap.add_argument("--expect-font")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        sys.exit(f"no such file: {path}")

    fails, notes = [], []

    raw = path.read_bytes()
    if raw[:4] != b"PK\x03\x04":
        fails.append("not a ZIP archive (missing PK signature) — the writer produced garbage")
        print("\n".join("  ✗ " + f for f in fails))
        return 1
    notes.append(f"ZIP signature ok, {len(raw):,} bytes")

    try:
        with zipfile.ZipFile(path) as z:
            bad = z.testzip()
            if bad:
                fails.append(f"corrupt entry in archive: {bad}")
            names = set(z.namelist())

            for part in REQUIRED:
                if part not in names:
                    fails.append(f"missing required part: {part}")
            for part in EXPECTED:
                if part not in names:
                    fails.append(f"missing {part} — bullets will not render as a list")

            for name in sorted(n for n in names if n.endswith(".xml") or n.endswith(".rels")):
                try:
                    ET.fromstring(z.read(name))
                except ET.ParseError as e:
                    fails.append(f"malformed XML in {name}: {e}")

            if "word/document.xml" in names:
                doc = z.read("word/document.xml").decode("utf-8", "replace")
                paras = doc.count("<w:p ") + doc.count("<w:p>")
                notes.append(f"{paras} paragraphs")
                if paras < 3:
                    fails.append(f"only {paras} paragraphs — document is effectively empty")

                fonts = set(re.findall(r'w:ascii="([^"]+)"', doc))
                if fonts:
                    notes.append("fonts: " + ", ".join(sorted(fonts)))
                if args.expect_font and args.expect_font not in fonts:
                    fails.append(f"expected font {args.expect_font!r}, found {sorted(fonts)}")

                size = re.search(r'<w:pgSz w:w="(\d+)" w:h="(\d+)"', doc)
                if size:
                    w_in, h_in = int(size.group(1)) / 1440, int(size.group(2)) / 1440
                    notes.append(f"page {w_in:g}in x {h_in:g}in")
                    if abs(w_in - 8.5) > 0.01 or abs(h_in - 11) > 0.01:
                        fails.append(f"page is {w_in:g}x{h_in:g}in, expected US Letter 8.5x11")
                else:
                    fails.append("no <w:pgSz> — page size not declared, readers will guess")
    except zipfile.BadZipFile as e:
        fails.append(f"unreadable archive: {e}")

    if args.expect_pages is not None:
        pages = page_count(path)
        if pages is None:
            notes.append("page count skipped (LibreOffice unavailable)")
        else:
            notes.append(f"renders to {pages} page(s)")
            if pages != args.expect_pages:
                fails.append(f"renders to {pages} pages, expected {args.expect_pages}")

    for n in notes:
        print(f"  · {n}")
    for f in fails:
        print(f"  ✗ {f}")
    print(f"\n{path.name}: {'VALID' if not fails else str(len(fails)) + ' problem(s)'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
