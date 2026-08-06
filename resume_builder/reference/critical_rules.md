# Critical Rules — Compact Re-Read

> Quick reference for Phase 2 generation. Full rules in `resume_reference.md`. Output contract in `docx_spec.md`.

## Output Pipeline

```bash
node resume_builder/helpers/build_docx.js output/<Folder>/<name>.json -o output/<Folder>/<name>.docx
```

The `.json` spec is the editable source; the `.docx` is built from it. Both are deliverables.

## Character Limits

Count the plain string with only the `**`/`*` markers removed. `**DFT**` -> `DFT` (3 chars);
`[Portfolio](url)` -> `Portfolio` (9 chars). Everything else is literal Unicode and counts as written
(`–`, `—`, `β`, `°`, `%` = 1 char each). Nothing to strip.

**Resume (`"format": "resume"`, Calibri 10pt, 7.5in text width):**

| Target Lines | Rendered Char Range | HARD MAX | Orphan Threshold |
|-------|---------------|---------|------------------|
| 1 line | 105-115 chars | 122 | -- |
| 2 lines | 195-215 chars | 230 | Last line >= 78 chars |

**CV (`"format": "cv"`, Calibri 11pt, 7.5in text width):**

| Target Lines | Rendered Char Range | HARD MAX | Orphan Threshold |
|-------|---------------|---------|------------------|
| 2 lines | 175-190 chars | 200 | Last line >= 65 chars |
| 3 lines | 260-280 chars | 295 | Last line >= 65 chars |

### Variant Naming

| Variant | Document | Lines | Target Range | HARD MAX | Orphan | Word Target |
|---------|----------|-------|-------------|----------|--------|-------------|
| Resume-1L | 1/2-page resume | 1 | 105-115 | 122 | -- | ~13-14 words |
| Resume-2L | 2-page resume | 2 | 195-215 | 230 | >= 78 | ~25-27 words |
| CV-2L | 4-page CV | 2 | 175-190 | 200 | >= 65 | ~22-24 words |
| CV-3L | 4-page CV | 3 | 260-280 | 295 | >= 65 | ~33-35 words |

### Other Elements

| Element | Budget |
|---------|--------|
| Summary (resume) | 480-560 chars, 4-5 sentences |
| Summary (CV) | 490-545 chars |
| Tagline | 80-95 chars, must stay on one line |
| Skills line | <= 115 chars per group |
| Position `theme` + dates | one line: `theme` <= 62 chars |
| Cover letter (resume pkg) | 250-300 words |
| Cover letter (CV pkg) | 350-450 words |

**Aim for the middle of the range, not the hard max.** Resume-2L target ~205 (not 230); CV-2L target ~180 (not 200).

## Bold Width Penalty

Bold renders ~15% wider. If a skills group has 25+ bold characters, cut the target to ~105 chars.

## Orphan Rule

Multi-line bullet last rendered line must fill >= 70% of line width.
Resume 2L: last line >= 78 chars. CV 2L: >= 65 chars. CV 3L: >= 65 chars.

## FIXED Sections — NEVER Modify

All FIXED sections (internships, education, publications, honors/awards, header block) come from
`resume_builder/templates/fixed_sections.json` and are copied VERBATIM into the spec.
NEVER change: spacing, margins, fonts, heading style, header layout — these live in
`resume_builder/helpers/build_docx.js` and are not per-document knobs.
Only modify VARIABLE content: Summary, Technical Skills, Experience bullets, position themes.

## Page-Count Gate (before declaring done)

```bash
soffice --headless --convert-to pdf --outdir output/<Folder> output/<Folder>/<name>.docx
pdfinfo output/<Folder>/<name>.pdf | grep Pages
```

Resume = 2 pages, CV = 4 pages, cover letter = 1 page. If it spills, shorten VARIABLE content only.

## Provenance Flags

See `CLAUDE.md` for your project-specific provenance flags. Common patterns:

| Item Status | Rule |
|-------------|------|
| Under review | State journal name: "under review at [Journal]" |
| Unpublished | No specific numbers or publication claims |
| Internal/proprietary | "infrastructure I developed" — not peer-reviewed |
| Preprint only | Always flag provenance |

## Inline Formatting Quick-Ref

| Want | Write | Wrong |
|------|-------|-------|
| bold | `**DFT**` | `\textbf{DFT}` |
| italic | `*in situ*` | `\textit{in situ}` |
| link | `[Portfolio](https://...)` | `\href{...}{...}` |
| chemical formulas | `H₂O` (literal Unicode) | `\ce{H2O}`, `H$_2$O` |
| superscripts | `R²=0.99`, `X²Y` | `R$^2$`, `R^2`, `R2` |
| Greek letters | `α-phase` | `$\alpha$-phase` |
| approximately | `~64` | `$\sim$64` |
| en-dash / em-dash | `–` / `—` | `--` / `---` |
| percent, degrees | `%`, `°` | `\%`, `$^\circ$` |

Everything is plain Unicode — there is no markup to escape and no LaTeX to strip.
Em-dash (`—`): max 2 per document.

## KB Corrections

See `CLAUDE.md` for your project-specific KB corrections log. Always check before generation to avoid re-introducing known errors.

## Budget Reminder

Resume: ~20 variable bullets (exact count depends on skills config + immigration line). CV: 19-21 bullets, 45 rendered lines.
Resume bullets: ALL 2L. CV bullets: 2L/3L mix OK.
**CV Page 1 rule:** First bullet of first experience MUST be 2L. A 3L first bullet overflows page 1.
