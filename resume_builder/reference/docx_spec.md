# DOCX Output Spec — the generation contract

> This kit emits **Word documents**, not LaTeX. Skills write a JSON spec file; the renderer turns it into `.docx`.
> Read this before generating any resume, CV, or cover letter.

---

## Pipeline

```
JD -> bullet plan (user approves) -> spec.json -> build_docx.js -> .docx + .pdf
```

Build command — emits **both `.docx` and `.pdf`** in one step (pass `--no-pdf` to skip the PDF):

```bash
node resume_builder/helpers/build_docx.js \
  resume_builder/specs/<Company>/<Role>/<name>.json \
  -o output/<Company>/<Role>/<Name>.docx
```

**Layout rules — follow these when creating any new package:**
- `output/<Company>/<Role>/` holds **deliverables only: `.docx` and `.pdf`.** Never write a `.json` there.
- Build specs go in `resume_builder/specs/<Company>/<Role>/`.
- One folder per company; a subfolder per role. Include the requisition ID when there is one
  (e.g. `Vanguard/Data_Scientist_Specialist_180805`).
- Update `output/INDEX.md` when adding a package.

The spec is the editable source — `/edit-resume` modifies the spec and re-runs the build, never the `.docx`
directly.

---

## Inline formatting

Inside any text field, use these markers. Do **not** write LaTeX.

| Want | Write | Notes |
|------|-------|-------|
| **bold** | `**text**` | Used for bolded tools in Skills |
| *italic* | `*text*` | Rare in body text |
| link | `[label](url)` | Header links use the `links` array instead |
| en-dash | `–` | Literal Unicode character |
| em-dash | `—` | Literal Unicode. **Max 2 in prose** (see below). |
| degree, Greek, math | `°`, `β`, `×` | Literal Unicode — no `$...$`, no `\ce{}`, no `mhchem` |
| percent | `%` | Plain. Never `\%` |

**Everything is plain Unicode.** There is no markup to escape and no LaTeX to strip.

**Em-dash rule:** at most 2 in *prose* (summary text, experience bullets) — more reads as AI-written. Em-dashes
used as *structural separators* are exempt and conventional: `**Project** (tools) — description`,
`Degree — Institution`. The rule is about prose voice, not punctuation counting.

---

## Schema

### Resume / CV

```json
{
  "format": "resume",
  "title": "[Your Full Name] — [Target Role]",
  "header": {
    "name": "[Your Full Name]",
    "credential": "[e.g. M.S., or leave blank]",
    "contact": ["[City, State]", "[Phone]", "[Email]"],
    "links": [{ "label": "Portfolio", "url": "https://..." }],
    "tagline": "[Role] | [Domain] | [Differentiator]"
  },
  "sections": [ ... ]
}
```

`format` is `"resume"` (10pt) or `"cv"` (11pt). `credential`, `links`, and `tagline` are optional.

### Section types

| `type` | Keys | Renders as |
|--------|------|-----------|
| `summary` | `heading`, `text` | One justified paragraph |
| `skills` | `heading`, `groups[{name, items[]}]` | `**Name:** item, item, item` per line |
| `experience` | `heading`, `positions[]` | Position block, see below |
| `projects` | `heading`, `positions[]` | Identical to `experience` |
| `education` | `heading`, `entries[{degree, org, location, dates, details[]}]` | Degree + dates, org subtitle, detail bullets |
| `list` | `heading`, `items[]` | Flat bullet list (honors, awards, certifications) |
| `text` | `heading`, `paragraphs[]` | Plain paragraphs |

### Position object

```json
{
  "theme": "[Bold left-hand line — the achievement headline]",
  "role": "[Job Title]",
  "org": "[Employer]",
  "location": "[City, State]",
  "dates": "[Month Year] – [Month Year or Present]",
  "bullets": ["...", "..."]
}
```

`theme` is the bold left-hand line — the **primary JD-customization lever**. Rewrite it per JD.
`role`/`org`/`location` render as one italic subtitle. `dates` right-aligns on the theme line.
Omit `theme` to make `role` the bold line (conventional CV style).

### Cover letter

```json
{
  "format": "cover_letter",
  "sender": ["[Your Full Name]", "[Street Address]", "[City, State ZIP]"],
  "date": "[Month Day, Year]",
  "recipient": ["Hiring Team", "[Company]", "[City, State]"],
  "salutation": "Dear Hiring Team,",
  "body": ["para 1", "para 2", "para 3", "para 4"],
  "closing": "Sincerely,",
  "signature": "[Your Full Name]"
}
```

---

## Length budgets

Calibrated for Calibri at 0.5in margins (7.5in text width). Count **plain characters** — strip only the
`**`/`*` markers.

| Variant | Document | Lines | Target range | Hard max |
|---------|----------|-------|-------------|----------|
| Resume-1L | resume | 1 | 105–115 | 122 |
| Resume-2L | resume | 2 | 195–215 | 230 |
| CV-2L | cv | 2 | 175–190 | 200 |
| CV-3L | cv | 3 | 260–280 | 295 |

**Other elements**

| Element | Budget |
|---------|--------|
| Summary (2-page resume) | 480–560 chars, 4–5 sentences |
| Summary (1-page resume) | 290–400 chars, 2–3 sentences — set `"pages": 1` in the spec so the audit uses this range |
| Summary (cv) | 490–545 chars |
| Tagline | 80–95 chars, must stay on one line |
| Skills line | ≤ 115 chars per group (bold costs ~1.15× width) |
| Position theme + dates | must fit one line: theme ≤ 62 chars |
| Cover letter (resume pkg) | 250–300 words |
| Cover letter (cv pkg) | 350–450 words |

**Bold width:** bold renders ~15% wider. If a skills group has 25+ bold characters, cut the target to ~105.

Verify with the helper:

```bash
python3 resume_builder/helpers/char_count.py -f output/<Folder>/<name>.json
```

---

## Page-count verification (MANDATORY before declaring done)

The renderer does not enforce page count. You must check it:

```bash
soffice --headless --convert-to pdf --outdir output/<Folder> output/<Folder>/<name>.docx
pdfinfo output/<Folder>/<name>.pdf | grep Pages
```

Resume must be 2 pages, CV 4, cover letter 1. If it spills, shorten **variable** content only — summary,
skills items, bullet text. Never touch FIXED sections.

To eyeball the layout:

```bash
pdftoppm -jpeg -r 80 output/<Folder>/<name>.pdf page
```

Then Read the resulting images.

---

## What changed from the LaTeX original

- No `.cls`, no `.tex`, no `pdflatex`, no `mhchem`, no `$...$`
- No LaTeX-markup stripping when counting characters — count the plain string
- No `\vspace`/`\geometry` immutables; spacing lives in `build_docx.js` and should not be edited per document
- FIXED sections are now JSON fragments in `resume_builder/templates/fixed_sections.json`, copied verbatim
- Char budgets are slightly wider than the LaTeX ones (Calibri is narrower than Computer Modern)
