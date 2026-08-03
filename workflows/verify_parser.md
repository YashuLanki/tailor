# Workflow: verify the parser

**Run this before and after any change to `extract.js`.** Parser hardening is adversarial with itself — a regex
that fixes one resume format usually breaks another. Without a before/after score you are guessing.

## Objective

Prove that a parser change improves at least one format and regresses none.

## Inputs

- `fixtures/cases/*.html` — resumes authored as HTML, one per layout style
- `fixtures/cases/*.expected.json` — ground truth, read off the document **by a human**, not copied from parser
  output. These describe what is true, not what the code currently does.
- `fixtures/baseline.json` — the score at last commit

## Steps

```bash
python3 tools/make_fixtures.py            # HTML -> .tmp/fixtures/*.docx via LibreOffice
node    tools/parse_corpus.mjs            # run extract.js over each -> .tmp/parse_report.json
python3 tools/score_parse.py              # score against ground truth, list failures
```

Record the score. Make the change. Re-run all three, then gate:

```bash
python3 tools/score_parse.py --check      # exits 1 if any case dropped
```

When the new score is genuinely better and nothing regressed:

```bash
python3 tools/score_parse.py --save-baseline
```

Commit the updated `fixtures/baseline.json` alongside the parser change so the number is reviewable in the diff.

## Expected outputs

- Per-case percentage plus each failing check named in plain language
- `.tmp/parse_report.json` — the full parse of every fixture, for inspecting what actually came out
- Exit code 1 from `--check` on any regression

## Judgement calls that are yours, not the script's

- **A drop is not automatically a regression.** If you deliberately traded a rare format for a common one, say so
  and re-baseline. The script reports; you decide.
- **Never edit an `expected.json` to make a test pass.** Ground truth changes only when the fixture's content
  changes. Editing expectations to match the parser is how a harness becomes decorative.
- **A new format means a new fixture.** If you fix a bug found in a real document, add a fixture reproducing it
  first, watch it fail, then fix. Otherwise nothing stops it recurring.

## Adding a fixture

1. Write `fixtures/cases/NN_name.html` in the layout you want to cover. HTML rather than a binary keeps the
   corpus reviewable in a diff and means no personal documents enter the repo.
2. Use a fictional person. `ALEX MORGAN` and the `example.com` addresses are the convention.
3. Write `NN_name.expected.json` by reading your own fixture. Supported keys: `name`, `credential`,
   `contactMustInclude`, `contactMustExclude`, `links`, `skillGroups`, `summaryMinChars`, `positions`
   (`org`/`role`/`dates`/`bullets`), `positionsMustNotInclude`, `education`, `educationMustNotInclude`,
   `projects`, `projectsMin`.
4. `--save-baseline` to admit it into the gate.

## Known state and what it means

Recorded 2026-08-03 at **88.4%** overall.

| Case | Score | Outstanding |
|---|---|---|
| `01_chronological` | 100% | — |
| `03_academic_cv` | 100% | — |
| `02_federal` | 84.6% | Supervisor and "may contact" lines become phantom positions |
| `04_compact` | 66.7% | Organisation-first layout swaps org and role; name inline with contact isn't found |

These two are open, deliberately. They are the honest cost of heuristic parsing, and they are visible rather than
hidden — which is the whole point of the corpus.

## Learned constraints

Things discovered the hard way. Don't rediscover them.

- **LibreOffice needs its export filter named for HTML input.** Plain `--convert-to docx` fails with
  "no export filter found". Use `--convert-to 'docx:MS Word 2007 XML'`.
- **The parser runs in Node under a `vm` shim** — it only needs `TextDecoder`, `File` and `fflate`, so no headless
  browser is required. Much faster, and it exercises the shipped code with no test double.
- **PDF fixtures cannot use the Node runner.** `readPdf` dynamically imports pdf.js as an ES module and expects
  browser globals; `parse_corpus.mjs` reports them as skipped. Verify PDF cases in the browser.
- **Relationship attribute order is not fixed.** Word writes `Id`/`Type`/`Target`; LibreOffice does not. Parse
  each attribute independently or hyperlinks vanish.
- **Never name a module-level constant `URL`.** Doing so shadows the `URL` constructor, so `new URL(...)` throws
  and every link is silently dropped. This shipped, and only the corpus caught it. The regex is `URL_RE`.
- **URL comparison must ignore a trailing slash.** LibreOffice appends one; that is not a difference worth failing.
