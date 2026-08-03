# AGENTS.md

WAT framework (Workflows · Agents · Tools) as applied to this repository, plus a proposed set of subagents.

Companion to [CLAUDE.md](CLAUDE.md), which covers the codebase itself.

---

## The architecture

Probabilistic AI handles reasoning; deterministic code handles execution. That separation is what makes the
system reliable.

**Layer 1 — Workflows.** Markdown SOPs in `workflows/`. Each states an objective, required inputs, which tools to
call, expected outputs, and how to handle edge cases. Plain language, the way you'd brief a teammate.

**Layer 2 — Agents.** The coordinating role. Read the workflow, run tools in sequence, recover from failures, ask
when genuinely blocked. Connect intent to execution without trying to do the execution.

**Layer 3 — Tools.** Python scripts in `tools/` that do the work. Consistent, testable, fast. Secrets in `.env`.

**Why it matters:** at 90% per-step accuracy, five chained steps land at 59%. Offloading execution to
deterministic scripts keeps the agent doing what it's good at — orchestration and judgment.

## Operating rules

1. **Check `tools/` before building.** Only write a new script when nothing covers the task.
2. **Treat failures as inputs.** Read the whole trace, fix the tool, retest, then record what you learned in the
   workflow. Ask before re-running anything that spends credits.
3. **Keep workflows current, but don't rewrite them unprompted.** They're accumulated instructions, not scratch
   files. Ask before creating or overwriting one.

**The loop:** identify what broke → fix the tool → verify → update the workflow → continue with a more robust
system.

## Directory layout

```
.tmp/         disposable intermediates (fixtures, exports, screenshots)
tools/        Python scripts — deterministic execution
workflows/    Markdown SOPs
.env          API keys, never anywhere else
```

Local files are for processing. Anything a human needs to see is a deliverable.

**Adaptation for this repo:** Tailor is a static browser app, so its "execution layer" is partly the browser
itself. Tools here drive a headless browser (Playwright) to exercise `window.Extract` and `window.DocxGen`
directly, then assert on real return values rather than screenshots.

---

# Proposed subagents

Each is grounded in a defect that actually shipped and had to be caught by hand. Ordered by how much pain it
would have saved.

## 1 · `parser-regression` — the one that matters most

**The failure it prevents.** Uploading four real resumes produced 10 positions including `"40 hours/week"`,
`"and exam preparation"` and `"management system"`; every degree listed twice; two invented degrees named
`"Equations"` and `"Multivariable Calculus"`; employers duplicated because `"Nauru Agreement"` and
`"Nauru Agreement, Majuro, MH"` didn't match. Each fix was a narrow regex guard, and **every guard risks breaking
a format it wasn't tested against.** Nothing currently catches that.

**Tools**
```
tools/parse_corpus.py        --corpus .tmp/fixtures/ --out .tmp/parse_report.json
tools/score_parse.py         --report .tmp/parse_report.json --expected fixtures/expected.json
```
`parse_corpus.py` launches headless Chromium, loads the app, calls `window.Extract.ingest()` on every fixture,
and dumps the resulting library. `score_parse.py` diffs against hand-checked expectations and reports per-field
accuracy: positions found vs. expected, phantom positions, duplicate rate, degree count, contact correctness.

**Workflow:** `workflows/verify_parser.md` — run before and after any `extract.js` change; fail the change if any
metric regresses, even when the target format improves.

**Fixture corpus needs breadth on purpose:** chronological, functional, federal (address + hours lines),
academic CV, one-page and three-page, `.docx` and `.pdf`, and at least one PDF that wraps sentences mid-line.

**Why an agent and not just a script:** deciding whether a diff is a regression or an intended improvement is
judgment. The script produces numbers; the agent decides.

## 2 · `docx-validator`

**The failure it prevents.** I verified the exported file by hand — checking the `PK\x03\x04` signature and the
presence of `word/document.xml`, `styles.xml`, `numbering.xml`, `[Content_Types].xml`. A malformed export would
otherwise reach a recruiter's inbox as a file that won't open.

**Tools**
```
tools/build_docx_headless.py  --spec .tmp/spec.json --out .tmp/out.docx
tools/validate_docx.py        --file .tmp/out.docx --expect-pages 1
```
`validate_docx.py` checks the ZIP is intact, the required parts exist, the XML parses, then converts via
LibreOffice and asserts the page count. Page overflow is the most common real defect and only shows up after
rendering.

**Workflow:** `workflows/verify_export.md` — run on any `docxgen.js` change or budget-constant change.

## 3 · `budget-sync`

**The failure it prevents.** `BUDGET` in `app.js` is calibrated against `FONT`, `SIZE` and `MARGIN` in
`docxgen.js`. Change the font in one file and every character limit in the other silently becomes wrong — no
error, just resumes that overflow. This already happened once: moving Calibri 10pt → Times New Roman forced a
drop to 10.5pt and re-fitting every document.

**Tool**
```
tools/check_budget_sync.py   # parses both files, asserts the pairing, and empirically re-derives
                             # chars-per-line by rendering a known string
```

**Workflow:** `workflows/verify_budgets.md`. Cheap, fast, and the failure mode is invisible without it.

## 4 · `privacy-gate`

**The failure it prevents.** This repo is public and the surrounding work is a real job search. Personal data
nearly leaked more than once — and during this session four resume files were accidentally copied into an
unrelated directory. A pre-commit gate is strictly better than remembering.

**Tool**
```
tools/scan_secrets.py --staged   # phone patterns, street addresses, personal emails,
                                 # employer names from a denylist, and any real name
                                 # outside LICENSE; also asserts data/sample.json stays fictional
```

**Workflow:** `workflows/pre_commit_check.md`. Should also confirm no `.docx`/`.pdf` fixtures are staged.

## 5 · `reader-health`

**The failure it prevents.** Reading a posting from a URL depends on third-party services. One of my two
fallbacks (`allorigins`) was dead on arrival and I only noticed because I tested against a live posting.
These services rate-limit, change, and disappear.

**Tool**
```
tools/check_readers.py --urls fixtures/postings.txt   # tries each READER against real postings
                                                      # from Greenhouse, Workday, LinkedIn, amazon.jobs
```
Reports which reader/board pairs work. Also the honest place to record that some boards will never work
(login-gated, Cloudflare) so the UI keeps saying so.

**Workflow:** `workflows/verify_readers.md` — run periodically, not per-commit. Uses no credits but does hit
third parties, so don't loop it.

## 6 · `deploy-smoke`

**The failure it prevents.** "Is it live?" deserves evidence, not assumption. A missing vendored asset or a
Pages cache miss looks like a working site until someone drops a PDF and nothing happens.

**Tool**
```
tools/smoke_live.py --base https://yashulanki.github.io/tailor/
```
Asserts every asset returns 200, no console errors, the globals initialize, and a full
sample → score → export cycle produces a valid `.docx` **on the deployed host**.

**Workflow:** `workflows/verify_deploy.md` — run after every push to `main`.

## 7 · `copy-reviewer`

**The failure it prevents.** The interface grew into documentation and had to be torn back — the actual feedback
was "there's a lot of words here, it is all over the place." That's a real defect class and a script can measure
it: word count per panel, how many sentences sit above the first interactive element, reading grade, and whether
any explanatory text isn't behind a disclosure.

**Tool**
```
tools/audit_copy.py --html index.html --max-words-per-panel 60
```

**Workflow:** `workflows/verify_copy.md`. Flags, doesn't rewrite — tone is a judgment call for the agent.

---

## Build order

**Build now:** `parser-regression`, `docx-validator`. These cover the two failure modes that actually shipped
broken output.

**Build next:** `budget-sync` and `privacy-gate`. Both cheap, both prevent silent damage.

**Build when it stings:** `reader-health`, `deploy-smoke`, `copy-reviewer`.

Everything above depends on a fixture corpus, so **that is the real first task** — a dozen resumes across formats
with hand-checked expected output. Without it, `parser-regression` has nothing to compare against, and parser
work stays what it is today: change a regex and hope.

## One honest caveat

No amount of harnessing makes heuristic structure-parsing reliable across arbitrary resume formats. These agents
would tell you *when* a change regresses — genuinely valuable — but the underlying approach still tops out. The
path to reliable extraction is an LLM parsing pass, which fits WAT cleanly: `tools/extract_with_llm.py` reading
its key from `.env`, called by a workflow, with the current heuristics as the no-key fallback. Worth building
that before over-investing in guards around the regex approach.
