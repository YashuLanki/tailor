# tools

Deterministic execution layer. See `../workflows/` for the SOPs that call these,
and `../AGENTS.md` for the WAT architecture.

| Tool | Purpose |
|---|---|
| `make_fixtures.py` | Convert `fixtures/cases/*.html` → `.tmp/fixtures/*.docx` (and `--pdf`) via LibreOffice |
| `parse_corpus.mjs` | Run the real `extract.js` over every fixture → `.tmp/parse_report.json` |
| `score_parse.py` | Score that report against ground truth; `--check` gates on regression |
| `build_docx_headless.mjs` | Build a `.docx` from a spec using the real `docxgen.js` |
| `validate_docx.py` | Assert OOXML validity, typography and page count |

Python tools need only the standard library. The `.mjs` tools run the browser
modules in a Node `vm` context with a minimal `window` shim — no headless browser,
and no reimplementation of the code under test.

Requires: `node` (18+), `python3` (3.10+), LibreOffice (`soffice`) for conversion
and page counting, and optionally `pdfinfo`.
