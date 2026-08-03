#!/usr/bin/env python3
"""Convert the authored HTML fixtures into .docx (and one .pdf) via LibreOffice.

Fixtures are authored as HTML and converted at test time rather than committed as
binaries, so the corpus stays reviewable in a diff and nothing personal or opaque
lands in git. Using LibreOffice as the producer is deliberate: it emits different
XML from Word, which is a free robustness test on the parser.

Usage:
  python3 tools/make_fixtures.py                       # all cases -> .tmp/fixtures/
  python3 tools/make_fixtures.py --only 02_federal
  python3 tools/make_fixtures.py --pdf 01_chronological # also emit a PDF variant
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASES = ROOT / "fixtures" / "cases"
OUT = ROOT / ".tmp" / "fixtures"

# LibreOffice needs the filter named explicitly for HTML input; without it the
# conversion fails with "no export filter found".
DOCX_FILTER = "docx:MS Word 2007 XML"
PDF_FILTER = "pdf:writer_pdf_Export"


def soffice() -> str:
    exe = shutil.which("soffice") or shutil.which("libreoffice")
    if not exe:
        sys.exit("LibreOffice not found. Install it, or add 'soffice' to PATH.")
    return exe


def convert(exe: str, src: Path, filt: str, ext: str) -> Path | None:
    subprocess.run(
        [exe, "--headless", "--convert-to", filt, "--outdir", str(OUT), str(src)],
        capture_output=True, text=True, timeout=120,
    )
    made = OUT / (src.stem + ext)
    return made if made.exists() else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="build a single case by stem, e.g. 02_federal")
    ap.add_argument("--pdf", action="append", default=[],
                    help="also emit a .pdf for this case (repeatable). PDFs exercise "
                         "line-wrap handling, which is a distinct failure mode.")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    exe = soffice()

    cases = sorted(CASES.glob("*.html"))
    if args.only:
        cases = [c for c in cases if c.stem == args.only]
        if not cases:
            sys.exit(f"no fixture named {args.only}")
    if not cases:
        sys.exit(f"no .html fixtures in {CASES}")

    made, failed = [], []
    for case in cases:
        docx = convert(exe, case, DOCX_FILTER, ".docx")
        (made if docx else failed).append(docx or case.name)
        if case.stem in args.pdf:
            pdf = convert(exe, case, PDF_FILTER, ".pdf")
            (made if pdf else failed).append(pdf or case.name + " (pdf)")

    for m in made:
        print(f"  built {Path(m).name}")
    for f in failed:
        print(f"  FAILED {f}", file=sys.stderr)
    print(f"\n{len(made)} built, {len(failed)} failed -> {OUT}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
