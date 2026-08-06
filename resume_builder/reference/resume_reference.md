# Resume & CV Generation — Reference

> Resume/CV-specific rules. Read by `/make-resume` and `/edit-resume`.
> Companion files: `docx_spec.md` (**the output contract — read it first**), `cl_reference.md` (CL rules),
> `critical_rules.md` (compact re-read).
> Shared rules (provenance, anti-fabrication): `CLAUDE.md`

---

## OUTPUT PIPELINE (DOCX, not LaTeX)

```
JD  ->  bullet plan (user approves)  ->  <name>.json  ->  build_docx.js  ->  <name>.docx
```

```bash
node resume_builder/helpers/build_docx.js output/<Folder>/<name>.json -o output/<Folder>/<name>.docx
```

Both the `.json` spec and the `.docx` are deliverables. The JSON is the editable source — `/edit-resume`
modifies the JSON and re-runs the build, never the `.docx` directly. Schema and section types: `docx_spec.md`.

Inline formatting inside any text field: `**bold**`, `*italic*`, `[label](url)`, and literal Unicode for
dashes (`–`, `—`), Greek (`β`), degrees (`°`), and percent (`%`). No LaTeX — no `\textbf{}`, `\ce{}`, `$...$`.

---

## QUICK BUDGET CARD (read this FIRST)

```
RESUME (2-page, "format": "resume"):  ~20 variable bullets | Skills 13 lines (4-3-2-2-2) | 5 pubs | 5 awards
CV     (4-page, "format": "cv"):      19-21 variable bullets (45 rendered lines) | Skills 17 lines (4-4-3-3-3) | all pubs | 6 awards

Resume bullet: max 2 rendered lines | 1L: 105-115 chars (max 122) | 2L: 195-215 chars (max 230)
CV bullet:     max 3 rendered lines | 2L: 175-190 chars (max 200)  | 3L: 260-280 chars (max 295)

Summary: resume 480-560 chars (4-5 sentences) | CV 490-545 chars
Tagline: 80-95 chars, one line | Skills: <= 115 chars per group

Cover letter: Resume = 1 page (250-300 words) | CV = 1-2 pages (350-450 words)
Full package: Resume + CL = 3 pages | CV + CL = 5-6 pages
```

**If your bullet count doesn't match the budget above, STOP and fix before generating.**

---

## Section-by-Section Specs

### Resume (`"format": "resume"`)

1. **Summary** (bundle Section 2) — `summary` section: 4-5 sentences, 480-560 chars. Orphan: last line >= 78 chars.
   - **Headline Tagline:** `header.tagline`, 80-95 chars, must stay on exactly 1 line.
2. **Technical Skills** (bundle Section 4 + skills_taxonomy.md) — `skills` section: Format C — 5 groups, default 4-3-2-2-2 (13 lines). Each group renders as `**Name:** item, item, item`. `<= 115` chars per group; if a group carries 25+ bold characters, target ~105.
3. **Research Experience** (experience files + achievement_reframing_guide.md) — `experience` section: Write bullets FRESH per Experience Bullet Writing Protocol (below). Max 2 rendered lines per bullet. Run char_count.py after each position.
   - Resume uses the FLIPPED position form: `theme` is the bold line, and `role`/`org`/`location` are joined into ONE italic subtitle by the renderer. `dates` right-aligns on the theme line.
   - **After all positions: verify total variable bullet count matches budget**
4. **Education**: FIXED — copy verbatim from `resume_builder/templates/fixed_sections.json`
5. **Selected Publications** (pub_metadata.md): 5 publications scored per JD. Copy FIXED author+journal blocks, GENERATE JD-shortened title + tags. 2 rendered lines hard limit per entry.
6. **Honors & Awards**: FIXED — items from `fixed_sections.json`
7. **Immigration notice**: FIXED for USA JDs. Delete for non-USA JDs.

### CV (`"format": "cv"`)

1. **Research Summary** (bundle Section 2) — `summary` section: 490-545 chars. Orphan: last line >= 62 chars. Technical identity, not narrative.
2. **Education**: FIXED — copy verbatim from `fixed_sections.json`
3. **Technical Expertise** (bundle Section 4 + skills_taxonomy.md) — `skills` section: 4-4-3-3-3 ALWAYS (17 body lines). `<= 115` chars per group; 25+ bold chars in a group → target ~105.
4. **Research Experience**: Exactly 45 rendered bullet lines across 19-21 bullets, plus sub-theme lines.
   - CV uses the CONVENTIONAL position form: **omit `theme`** so `role` becomes the bold line; `org`/`location` form the italic subtitle. `dates` right-aligns on the role line.
   - Max 3 rendered lines per bullet. CV-2L <= 200, CV-3L <= 295 (target ~175-190 / ~260-280)
   - **Running total must reach exactly 45 rendered lines**
5. **Fellowships & Honors**: FIXED — items from `fixed_sections.json`
6. **Publications**: FIXED — full list from `fixed_sections.json`
7-10. **Presentations, Mentorship, Collaborations, Computing**: All FIXED from `fixed_sections.json`

---

## Character Limits (HARD STOPS — ZERO TOLERANCE)

**MANDATORY: Count rendered characters for EVERY bullet BEFORE writing it.** Do not write a bullet and check afterward — pre-calculate the count. If a bullet exceeds the limit, rewrite it BEFORE moving to the next bullet. This is not a post-generation check; it is a per-bullet gate.

**How to count rendered characters:**
Count the plain string with only the `**` and `*` markers removed. `**DFT**` -> `DFT` (3 chars);
`[Portfolio](https://...)` -> `Portfolio` (9 chars). Everything else is literal Unicode and counts as
written — `–`, `—`, `β`, `°`, `%` are each 1 char. There is no LaTeX markup to strip.
Count all remaining characters including spaces.

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

> **WARNING: AIM FOR THE MIDDLE OF THE TARGET RANGE — NOT THE HARD MAX.**
> A Resume-2L bullet should target ~205 chars, not 230. A CV-2L should target ~180, not 200.
> The hard max exists as a safety valve, not a target. Proportional fonts have variable char widths —
> a bullet at the hard max WILL overflow if it contains wide characters (m, w, W, capitals, em-dashes).
> Em-dash (`—`) counts as 1 char but renders ~2x wide. Budget 2 extra chars per em-dash in the bullet.

### Variant Naming

| Variant | Document | Lines | Target Range | HARD MAX | Orphan | Word Target |
|---------|----------|-------|-------------|----------|--------|-------------|
| Resume-1L | 1/2-page resume | 1 | 105-115 | 122 | -- | ~13-14 words |
| Resume-2L | 2-page resume | 2 | 195-215 | 230 | >= 78 | ~25-27 words |
| CV-2L | 4-page CV | 2 | 175-190 | 200 | >= 65 | ~22-24 words |
| CV-3L | 4-page CV | 3 | 260-280 | 295 | >= 65 | ~33-35 words |

> **Word targets** are approximate first-draft heuristics for prose bullets (~7.9 chars/word). After drafting, always verify with precise char count. Skills groups: NO word proxy -- use iterative char count only (technical tool lists average ~11 chars/word).

### Bold Width Penalty

Bold characters render ~15% wider than normal text. If a skills group has 25+ bold characters, cut the
target from 115 to ~105 chars. The same instinct applies to bullets: a bullet dense with `**bolded tools**`
should sit at the low end of its target range, not the high end.

**Per-bullet enforcement protocol:**
1. Write the bullet text (the JSON string, with `**`/`*` markers where needed)
2. Count chars with the markers removed → rendered char count
3. If count > HARD MAX → rewrite immediately (do NOT proceed)
4. If multi-line and last line < orphan threshold → rewrite to fill or shorten
5. **Aim for the middle of the range**, not the max. A bullet at 230 rendered chars (resume 2L) is risky — target ~205.

**Orphan rule:** For any multi-line bullet, the last rendered line must fill at least 70% of the line width. If it doesn't, rewrite to either fill the line or shorten to one fewer line.

### Char Verification Protocol (EVERY written element)

For each element you write from scratch or modify (summary, skills group, tagline, any edited bullet):

1. **DRAFT** -- Use word-count target as initial guess (prose only, NOT skills groups)
2. **STRIP** -- Remove only the `**`/`*` markers to get the rendered text
3. **COUNT** -- Count rendered characters precisely. In Claude Code, use the helper: `python3 resume_builder/helpers/char_count.py "bullet text"` or verify a full spec: `python3 resume_builder/helpers/char_count.py -f output/<Folder>/<name>.json`
4. **CHECK** -- Compare against target range (use tighter targets from Variant Naming table, not HARD MAX)
5. **FIX** -- If OVER and attempts < 3: rewrite/trim, go to step 2
6. **FLAG** -- If OVER after 3 attempts: record `OVER LIMIT: [element] [N] chars, target [M]` in the session file (JSON has no comment syntax — never park notes inside the spec), move on
7. **PASS** -- If within range: move to next element

**RULE: Never move to the next section with a violation in the current one. Fix first, then proceed.**

---

## Page Fill Budgets

**2-Page Resume (`"format": "resume"`, 10pt):**

Technical Skills uses Format C (categorized `skills` groups, 5 groups).
Any internship/fixed position is ALWAYS present (FIXED bullets, not counted in variable budget).

**Variable Bullet Budget (Format C):**

The exact variable bullet count depends on your skills configuration and whether a USA immigration line is present. Typical range: **20-21 variable bullets** across all research positions. Count your FIXED bullets separately — they come from `fixed_sections.json`.

**Adjustments:**
- Adding a skills line (e.g., 4-4-2-2-2 instead of 4-3-2-2-2): -1 variable bullet
- Removing immigration line (non-USA JD): +1 variable bullet in some configurations

**4-Page CV (`"format": "cv"`, 11pt) — LOCKED:**

Target: **4 pages.** 1-2 lines slack at the bottom of page 4 is acceptable. There is no pre-computed
per-page line total for DOCX output — the page count is established empirically by the page-count check
below, so build, convert, and count rather than predicting.

The exact line budget depends on the FIXED sections in `fixed_sections.json` (publications, presentations, awards, etc.). Count the FIXED lines there, then allocate the remainder to JD-dependent content. The key constraints:

| Category | Status |
|----------|--------|
| Header, Education, Honors, Pubs, Presentations, etc. | FIXED (count from `fixed_sections.json`) |
| Research Summary | JD-DEPENDENT (typically 7 lines: 1 heading + 6 body) |
| Technical Expertise | JD-DEPENDENT (typically 18 lines: 1 heading + 17 body) |
| Experience bullets | JD-DEPENDENT (**target 45 rendered lines**, 19-21 bullets, 2L/3L mix) |
| Sub-theme names | JD-DEPENDENT (varies by position count) |

**Experience bullet mix options (45 rendered lines):**
- 18x2L + 3x3L = 21 bullets | 15x2L + 5x3L = 20 | 12x2L + 7x3L = 19
- Allocate more bullets to JD-relevant positions, fewer to tangential ones

**Sub-theme rebalancing:** To shift bullet weight toward a more JD-relevant sub-theme: (a) drop the weakest bullet from a less-relevant sub-theme (-2L), (b) split a high-content 3L achievement into two 2L bullets (method + finding, +1L). Net = -1L saved while adding a bullet where it matters. Both split bullets must stay within char limits. Never split a 2L bullet — it becomes two 1L fragments that look thin.

**Position header rule:** The bold line (`theme` on a resume, `role` on a CV) plus the right-aligned `dates` must fit on ONE line: **`theme` <= 62 chars.** If it's too long, shorten it so the date doesn't wrap to a second line. Wrapped dates waste a full vertical line and break visual alignment. Verify on the converted PDF — if the date wraps, trim the theme.

**CV Page 1 rule:** The FIRST bullet of the FIRST experience position MUST be 2L (not 3L). A 3L first bullet pushes content below the page 1 fold, wasting prime real estate. Plan this during Phase 1 bullet planning — if the top-priority achievement needs 3L, make it the SECOND bullet and lead with a strong 2L bullet instead.

**Budget workflow:** Use the bullet counts above directly. After generation, verify that total bullet rendered lines = 45 (count each bullet's rendered lines and sum), then confirm the page count with the check below.

---

## Experience Bullet Writing Protocol (Experience-File-First)

**DO NOT use pre-written bullets.** Write every bullet FRESH from experience files, reframed for the target JD.

**Required files:** Experience files (all) + achievement_reframing_guide.md + bundle Section 1 (Priority Matrix) + bundle Section 3 (Reframing Map)

**Protocol:**
1. Determine document format -> look up bullet variant (Resume-1L/2L, CV-2L/3L) and budget
2. Allocate bullet count per position by JD relevance
3. For each position, consult bundle's **Priority Matrix** (Section 1) to rank achievements
4. For each achievement, consult **Achievement Reframing Guide** for role-type-specific framing directives
5. Write the bullet FRESH using target-domain vocabulary from bundle's **Reframing Map** (Section 3)
6. Verify char count per-bullet BEFORE moving to the next bullet
7. After all bullets written: run the **First-Pass Reframing Checklist** (in achievement_reframing_guide.md)

**Reframing during writing (NOT after):** Every bullet should use target-domain vocabulary from the start. Do not write in academic language and then "translate" -- write in target language directly using the Reframing Map. This is the single highest-ROI step: reframing alone moves scores from ~60 to ~85.

**Hybrid JDs (two role types):** Use primary role type's Priority Matrix for achievement ranking. Use secondary role type's Reframing Map for 1-2 bullets that bridge to the secondary domain.

---

## Position Title Format

**Resume -- FLIPPED format (JD theme as bold title, role as subtitle):**
Set `theme` = JD-customized domain theme (the single most powerful JD customization lever), <= 62 chars.
The renderer joins `role`, `org`, and `location` into ONE italic subtitle.

| Position | `theme` — Bold Line (JD-customizable) | Subtitle (`role` / `org` / `location`) |
|----------|-----------------------------|----------|
| Position 1 | [Theme, e.g., "First-Principles Discovery & ML-Accelerated Simulation"] | [Your Role], [Institution] |
| Position 2 | [Theme] ([Notable Award if applicable]) | [Your Role], [Institution] |
| Position 3 | [Theme] ([Fellowship if applicable]) | [Your Role], [Institution 1] & [Institution 2] |
| Internship | [Theme — FIXED] | [Your Role], [Company] | FLIPPED but FIXED |

**CV -- CONVENTIONAL format:**
Omit `theme` so `role` (the formal title) becomes the bold line; `org`/`location` form the italic subtitle.
Mentors go in the subtitle or a lead bullet. Story-thread sub-headers use `**bold**` — the renderer has no
underline, so never reach for one.

---

## Immutable Elements — NEVER Modify

**All layout lives in `resume_builder/helpers/build_docx.js`, and it is not a per-document knob.** Do not edit
the renderer to make one document fit, and do not try to override its layout from inside the JSON spec:

- **Spacing** (paragraph `before`/`after`, line spacing, bullet indents) — calibrated in `build_docx.js`.
- **Margins and page size** (0.5in margins, 7.5in text width) — set in `build_docx.js`.
- **Fonts and sizes** (Calibri; resume 10pt / CV 11pt body, heading and name sizes) — set in `build_docx.js`.
- **Section heading style** (uppercase, bottom rule, letter-spacing) — set in `build_docx.js`.
- **FIXED section content** (Education, Fellowships, Publications, Presentations, Mentorship, Collaborations, Computing, Internship) — copy the JSON fragments verbatim from `resume_builder/templates/fixed_sections.json`. Never rewrite, trim, or reorder.
- **Header layout** (name, contact line, links, tagline placement) — structure is renderer-locked. Only the field values (email address, link URLs, tagline text) are configurable.

**If content spills to an extra page (orphan lines):** Fix by shortening VARIABLE content only (summary, skills items, experience bullets). Count rendered characters to ensure bullets actually fit their target line count (2L or 3L). A bullet that is "2L" in the budget but renders as 3L due to character overflow is the most common cause of page spill. Before declaring any output done, run the page-count check below and verify page count matches target (resume=2, CV=4, cover letter=1).

**When updating an existing JSON spec (not generating from scratch):** Only modify VARIABLE content — summary text, skills group names/items, experience bullet text, position themes. Never touch FIXED sections or the renderer, even if a critique flags them as improvable. If a critique targets a FIXED section, note it for the next full regeneration instead.

---

## Page-Count Check (MANDATORY GATE before declaring done)

The renderer does not enforce page count. Build, convert, and count:

```bash
node resume_builder/helpers/build_docx.js output/<Folder>/<name>.json -o output/<Folder>/<name>.docx
soffice --headless --convert-to pdf --outdir output/<Folder> output/<Folder>/<name>.docx
pdfinfo output/<Folder>/<name>.pdf | grep Pages
```

Targets: **resume = 2 pages, CV = 4 pages, cover letter = 1 page.** If it spills, shorten VARIABLE content
only. Never trim a FIXED section to make the page count work.

To eyeball the layout:

```bash
pdftoppm -jpeg -r 80 output/<Folder>/<name>.pdf page
```

Then Read the resulting images.

---

## Post-Generation Verification

Run this checklist after the page-count check passes, before critique. Also used as Part 7 of critique_framework.md.

Before presenting final output, verify:

- [ ] All mechanical checks pass (chars, orphans, page fill, no submitted, sequences, variants)
- [ ] Em-dash count: max 2 per document (resume or CL). Fellowships items use `. ` not `—`.
- [ ] No -ing analysis endings on bullets ("...advancing the field", "...contributing to Y"). Restructure to end with a concrete result or metric.
- [ ] All content checks pass (ATS, terms, inflation, provenance, pubs, cover letter)
- [ ] All narrative checks pass (scan test, per-position flow, cross-position arc, CV sub-headers)
- [ ] Company/institution name spelled correctly throughout
- [ ] JSON spec is valid and `build_docx.js` exits 0 (no unknown section `type`, no missing required keys)
- [ ] No LaTeX residue anywhere in the spec (`\textbf{`, `\ce{`, `$`, `\href{`, `--`, `---`)
- [ ] Page-count check run and matches target (resume=2, CV=4, CL=1)
- [ ] Date format consistent (Mon YYYY – Mon YYYY, literal en-dash)

---

## Role-Type Decision Tree

> **The live decision tree lives in `config.md` ("Role Types" + "Role-Type Decision Tree") and is already
> filled in. Read it there and use it.** The table below only shows the expected shape — its rows are
> illustrative placeholders. Do not generate from them, and do not invent rows here.

| If JD mentions... | Primary profile | Secondary (hybrid) |
|-------------------|----------------|-------------------|
| _[your domain keywords]_ | _[your role type]_ | _[secondary or --]_ |
| _Example: national lab, DOE, postdoc_ | _National Lab_ | _--_ |
| _Example: machine learning, neural networks_ | _ML/AI_ | _National Lab_ |
| _Example: protein modeling, structural biology_ | _Computational Biology_ | _--_ |

**Hybrid resumes:** When a JD spans two role types, merge the two profiles. Primary sets priority matrix; secondary contributes supplementary bullets and keywords.

---

## Gap Assessment & Bridge Mappings

For each identified gap, assess:
- **Gap description:** What the JD asks for
- **Bridge framing (if available):** Use "methodology transferable to X" or "equivalent experience with Y" -- NEVER "experienced with X" unless directly demonstrated
- **Bridge confidence:** HIGH / MEDIUM / LOW
- **User decision:** Omit or bridge? (User decides per gap)

**Example bridge mappings** — generic placeholders showing the pattern only. The real tool/method inventory
lives in `config.md`, `skills_taxonomy.md`, and the experience files; derive bridges from those, never from
the examples below:
- Tool A → "Custom solvers (Tool B/Tool C; computational methodology transferable to Tool A)" [HIGH]
- Framework A → "Deep learning framework expertise (Framework B; directly transferable to Framework A)" [HIGH]
- Simulation Package A → "Molecular dynamics expertise (Package B; transferable to Package A)" [HIGH]
- Language A → "Scientific computing (Language B, Language C; transferable to Language A)" [MEDIUM]

---

## Content Density Rules

| Format | Bullets | Publications | Awards | Presentations |
|--------|---------|-------------|--------|---------------|
| 1-page resume | ~6 | 3-5 | 2 | Omit |
| 2-page resume | ~12+ | 5-8 | 2-3 | May omit |
| 4-page CV | Comprehensive | All published + under review | All | All |
| Full CV | Everything | All published + under review | All | All |

---

## Files to Read (by format)

**For resumes (1-page or 2-page):**
1. `reference/docx_spec.md` — Output contract: JSON schema, inline formatting, budgets, page-count check
2. `bundle_[role_type].md` — Role-specific generation content (Sections 1-5)
3. `achievement_reframing_guide.md` — Role-type framing directives for all achievements
4. `skills_taxonomy.md` — Full skills inventory for Format C generation
5. `pub_metadata.md` — Publication database with scoring tags
6. `templates/fixed_sections.json` — FIXED section fragments, copied verbatim into the spec
7. Experience files from `resume_builder/experience/`

**For CVs (4-page or full):**
1. `reference/docx_spec.md` — Output contract: JSON schema, inline formatting, budgets, page-count check
2. `bundle_[role_type].md` — Role-specific generation content (Sections 1-5)
3. `achievement_reframing_guide.md` — Role-type framing directives for all achievements
4. `skills_taxonomy.md` — Full skills inventory for Technical Expertise generation
5. `pub_metadata.md` — Publication database with scoring tags
6. `templates/fixed_sections.json` — FIXED section fragments, copied verbatim into the spec
7. Experience files from `resume_builder/experience/`

The generated artifacts are `output/<Folder>/<name>.json` (the editable source) and `output/<Folder>/<name>.docx`
(built from it). Both are deliverables.

**Role type to bundle mapping:**
Bundles live in `resume_builder/bundles/`. Map each JD role type to its corresponding bundle file (e.g., `bundle_[role_type].md`).
