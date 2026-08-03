# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tailor is a static, single-page web app. A user drops in resumes/letters/reports they already have, pastes a job
posting link, and exports a tailored one-page resume as `.docx`. Live at
https://yashulanki.github.io/tailor/

**There is no build step, no bundler, no package.json, and no test runner.** Four hand-written files plus three
vendored libraries. Edit a file, reload the page.

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Deployment is `git push` — GitHub Pages serves the repo root from `main`. Pages caches hard; hard-refresh
(⌘⇧R) after a push.

## Architecture: three seams

Load order in `index.html` matters, because these communicate through two globals and nothing else:

```
vendor/fflate.js  vendor/docx.iife.js      → window.fflate, window.docx
extract.js                                 → window.Extract  { ingest, readFile, parseResume, merge }
docxgen.js                                 → window.DocxGen  { build, download, inline }
app.js                                     → IIFE, owns all state
```

**`extract.js` — documents in, library out.** Reads `.docx` by unzipping with fflate and regex-parsing
`word/document.xml` (plus `word/_rels/document.xml.rels` for hyperlink targets — Word stores link URLs
separately from their display text). Reads `.pdf` via a lazy dynamic `import()` of pdf.js, grouping text items
into lines by their y-transform. Then `parseResume()` walks paragraphs, classifying by section heading, date
range, and bullet marker. `merge()` folds multiple documents into one library with deduplication.

**`docxgen.js` — library out, Word file in the browser.** A direct port of a CLI builder, so page size, margins,
fonts, spacing and numbering are identical to it. If you change layout here, the two diverge.

**`app.js` — everything else.** State, localStorage persistence (key `tailor.v1`), JD term extraction and
scoring, page-fit selection, the live preview, and the budget audit. One IIFE, no framework, delegated event
listeners on `document` keyed off `data-*` attributes.

## The two ideas the code is built around

**1. It never writes prose.** The app scores and selects; it does not generate or rewrite. This is the product's
reason to exist — an LLM rewriter can silently promote "supported" into "led," and this cannot. If you add
generation, you break the core promise, so don't without discussing it.

**2. A resume is a selection, not a concatenation.** `autoSelectToFit()` in `app.js` takes the highest-scoring
bullets that actually fit the target page count, capped at `MAX_BULLETS_PER_POSITION`. Import deliberately
selects *nothing* — scoring against a posting is what picks bullets. An earlier version pre-selected everything
found and produced an unusable multi-page dump.

## Two calibrations that must stay in sync

**Length budgets** live in `BUDGET` (app.js) and are calibrated for Times New Roman 10.5pt on US Letter with
0.5in margins — matching `SIZE`/`FONT`/`MARGIN` in `docxgen.js`. Change the font or margins in one place and the
character limits in the other become wrong.

Counting is done on *rendered* length: `plain()` strips `**bold**`, `*italic*` and `[label](url)` markers before
measuring, so `**Python**` is 6 characters.

**Line estimation** uses `LINES_PER_PAGE = 48` and `fixedLines()`. It's an estimate. The interface deliberately
does *not* show it — an earlier version printed "≈57 lines · about 2 pages · 6 bullets past the 2-line limit",
which is internal bookkeeping and read as noise. Users see one fact ("7 bullets on this resume"); per-bullet
budgets stay visible in the Library where they are actionable. Real verification is `workflows/verify_export.md`.

## Visual standard

The layout deliberately matches the reference documents in the originating CLI kit
(`resume_builder/examples/example_resume.pdf`): left-aligned serif name, contact and tagline stacked beneath,
Title-Case section headings with a rule underneath, skills as a bold group label followed by `–` prefixed
sub-lines, `·` bullets, and dates right-aligned in grey.

**Semicolons in a skills group split it into sub-lines.** `"Python, SQL – pipelines; Query optimisation"`
renders as two `–` lines under one bold label. This is why `fixedLines()` counts sub-lines rather than groups —
counting groups alone undercounts the page badly.

`styles.css .sheet` and `docxgen.js` implement the same layout twice, in CSS and in OOXML. Change one and you
must change the other, or the preview stops predicting the export.

## Formatting markers

Only three, everywhere in the data model: `**bold**`, `*italic*`, `[label](url)`. Everything else is literal
Unicode — `–`, `—`, `%`, `°` are typed directly. No LaTeX, no HTML in stored text. `docxgen.js:inline()` and
`app.js:mdHtml()` both parse these and must agree.

## Network behaviour

The app makes **no** network requests except one: reading a job posting from a URL. Direct `fetch` is attempted
first and nearly always fails (job boards send no permissive CORS headers), then `READERS` in `app.js` falls
back to `r.jina.ai` and `corsproxy.io`. **That discloses the posting's URL to a third party**, which is stated in
the UI and README. The paste path is fully local. Preserve that distinction and that disclosure.

## Known weak spot

Position and section detection is unreliable across varied resume formats. Federal-style resumes with address
and "40 hours/week" lines, and PDFs that wrap sentences mid-line, produce phantom positions. Fixes so far have
been narrow guards: `looksLikeDegree()` rejects wrapped coursework fragments, `orgKey()` matches employers
fuzzily, `sameDegree()` collapses `M.S.` against `Master of Science`. Each new regex risks breaking another
format — verify against several real documents before and after any parser change.

## Verifying a change

There is a verification harness under `tools/` driven by SOPs in `workflows/`. Read
`workflows/verify_parser.md` before touching `extract.js` and `workflows/verify_export.md` before touching
`docxgen.js` or the budget constants.

```bash
# parser: build fixtures, parse them, score against ground truth
python3 tools/make_fixtures.py && node tools/parse_corpus.mjs && python3 tools/score_parse.py
python3 tools/score_parse.py --check            # exits 1 on regression against fixtures/baseline.json

# export: build a .docx with the real writer, then validate it
node tools/build_docx_headless.mjs --sample --out .tmp/out.docx
python3 tools/validate_docx.py --file .tmp/out.docx --expect-pages 1 --expect-font "Times New Roman"
```

Current parser baseline is **88.4%** across four layout styles. `01_chronological` and `03_academic_cv` are at
100%; `02_federal` and `04_compact` have known open failures documented in the workflow. Never edit an
`expected.json` to make a check pass — ground truth changes only when the fixture's content does.

You can also poke at it in the browser console:

```js
// parse real documents without going through the drop UI
const f = new File([await (await fetch('sample.docx')).blob()], 'sample.docx');
const { lib, notes } = await window.Extract.ingest([f]);

// confirm the exported file is genuinely valid OOXML, not just non-empty
const d = JSON.parse(localStorage.getItem('tailor.v1'));
const blob = await window.docx.Packer.toBlob(window.DocxGen.build(d.state, new Set(d.chosen)));
```

A valid `.docx` starts with the `PK\x03\x04` ZIP signature and contains `word/document.xml`, `word/styles.xml`,
`word/numbering.xml` and `[Content_Types].xml`.

`.gitignore` excludes `*.docx` and `*.pdf`, so test fixtures can sit in the repo root without being committed.
Delete them anyway when finished.

## Privacy constraint

`data/sample.json` is a deliberately fictional person (Jordan Rivera). No real personal data belongs anywhere in
this repo — it is public. Before committing, grep for phone numbers, street addresses, and real employer names.
The only intentional real-name occurrence is the copyright line in `LICENSE`.
