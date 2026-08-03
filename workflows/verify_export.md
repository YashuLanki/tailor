# Workflow: verify the export

**Run this on any change to `docxgen.js`, to `BUDGET` in `app.js`, or to the font, page size or margins.**

"The download worked" is not verification. A malformed `.docx` opens as a repair prompt in Word, and page
overflow only appears after rendering — which is the defect that actually reaches recruiters.

## Objective

Prove the exported file is valid OOXML, uses the intended typography, and fits its page budget.

## Steps

```bash
node    tools/build_docx_headless.mjs --sample --out .tmp/out.docx
python3 tools/validate_docx.py --file .tmp/out.docx --expect-pages 1 --expect-font "Times New Roman"
```

To check a specific library instead of the bundled sample, export your data from the app (**Back up**) and pass
it as a spec:

```bash
node tools/build_docx_headless.mjs --spec ~/Downloads/tailor-data.json --out .tmp/mine.docx
python3 tools/validate_docx.py --file .tmp/mine.docx --expect-pages 1
```

Add `"_chosen": ["p0b0", "p0b1", "j0"]` to a spec to build only a selection, matching what the app would export
after scoring. Without it, every bullet and project is included.

## What gets checked

| Check | Why it exists |
|---|---|
| `PK\x03\x04` signature | A writer failure produces bytes that are not a ZIP at all |
| Archive integrity | A truncated write passes a size check and fails to open |
| `[Content_Types].xml`, `word/document.xml`, `word/styles.xml` | Absent parts make Word offer to repair the file |
| `word/numbering.xml` | Missing means bullets render as plain paragraphs, silently |
| Every `.xml` and `.rels` parses | Catches unescaped content injected from user text |
| Paragraph count > 3 | Guards against a structurally valid but empty document |
| `w:pgSz` is 8.5in × 11in | A missing page size leaves readers to guess |
| Declared fonts | The character budgets are calibrated to one font; a silent change invalidates all of them |
| Rendered page count | The only real proof it fits |

## Expected outputs

Facts printed as `·` lines, problems as `✗`, and a final `VALID` or a problem count. Exit code 1 on any failure.

## Judgement calls that are yours

- **Page overflow is usually content, not code.** If the count is 2 when you expected 1, check whether the spec
  simply holds too many bullets before touching the writer. `autoSelectToFit()` in `app.js` is what normally
  prevents this.
- **A font mismatch is never cosmetic.** `BUDGET` in `app.js` is calibrated for Times New Roman 10.5pt on Letter
  with 0.5in margins, matching `FONT`/`SIZE`/`MARGIN` in `docxgen.js`. If one changes, every character limit in
  the other is wrong and every existing document needs re-fitting. Treat it as a coordinated change, not a tweak.

## Learned constraints

- **`docxgen.js` runs in Node under a `vm` shim** with `Blob`, `crypto` and a stub `document`. No browser needed,
  and it tests the shipped writer rather than a copy of it.
- **`Packer.toBlob` works in Node** — `toBuffer` is unnecessary; convert via `await blob.arrayBuffer()`.
- **Page count needs LibreOffice.** `validate_docx.py` skips that check with a note rather than failing when
  `soffice` is absent, so the rest still runs in a bare environment.
- **`pdfinfo` is preferred but optional** — the script falls back to counting `/Type /Page` objects.
- **The 48-lines-per-page constant in `app.js` is an estimate.** The audit strip warns; only this workflow proves.
