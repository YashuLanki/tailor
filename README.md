# Tailor

Drop in the documents you already have. Paste a job posting's link. Get a tailored one-page resume as a Word
document.

No forms to fill in. No server, no account, no sign-up. Your library is parsed and stored in your own browser.

**[Live demo →](https://yashulanki.github.io/tailor/)**

---

## Why this exists

Most AI resume tools take your resume and a JD and hand back a rewrite. You can't see what changed or why, and
they'll quietly upgrade "supported" into "led."

Tailor works the other way around. You write your bullets once, in your own words. For each new posting it scores
every bullet against the actual text of the JD and shows you the score, so choosing what goes on the page is a
decision you make from evidence. Nothing is invented, because nothing is generated — the tool selects and
measures, it doesn't write.

It also names what you *don't* have. The gap list shows terms the posting stresses that none of your bullets
mention, which is the honest input to a cover letter rather than a prompt to embellish.

## How it works

**1 · Drop your documents.** Resumes, old cover letters, project reports, transcripts — `.docx`, `.pdf`, `.txt`,
`.md`, `.tex`. Word files are unzipped and their XML read directly; PDFs go through pdf.js. The parser finds
section headings, date ranges and bullet markers, then sorts everything into a library: profile, positions,
bullets, skills, education, projects. Drop several files and they merge, so a resume plus an old CV fills in
more than either alone.

**2 · Paste the posting's link.** It's read, then every bullet is scored against the actual text of the
requirements, with matched terms highlighted. You get a gap list too — terms the posting stresses that none of
your bullets mention.

**3 · Preview and export.** A live sheet at real page width, a page-count estimate, and a `.docx` built in the
browser.

## What it does

- **Automatic import** — `.docx`, `.pdf`, plain text, Markdown, LaTeX, all parsed locally
- **JD matching** — weighted term extraction, per-bullet scoring, match highlighting
- **Gap detection** — frequent JD terms that appear in none of your bullets
- **Length budgets** — live per-bullet feedback so nothing spills to a ragged third line
- **Page estimate** — warns before you discover the overflow in Word
- **Live preview** — Times New Roman at real page width, matching the exported file
- **Export** — `.docx` generated in-browser, or print to PDF
- **Portable data** — back up and restore your library as JSON

## Run it

No build step. Any static server works:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

To publish: push to GitHub, then Settings → Pages → deploy from branch root.

## How the length budgets work

Calibrated for Times New Roman 10.5pt on US Letter with 0.5in margins:

| Element | Target | Hard limit |
|---|---|---|
| Bullet, one line | 105–122 chars | 122 |
| Bullet, two lines | 195–230 chars | 230 |
| Summary, 1-page resume | 290–400 chars | — |
| Summary, 2-page resume | 480–560 chars | — |
| Skills group line | ≤ 115 chars | 115 |
| Position heading | ≤ 62 chars | 62 |

Characters are counted after stripping formatting markers, so `**Python**` counts as 6. A bullet between the
one- and two-line bands gets flagged as a thin second line — the orphan case that reads as sloppy on the page.

## Formatting markers

| Write | Renders |
|---|---|
| `**text**` | **bold** |
| `*text*` | *italic* |
| `[label](url)` | link |

Everything else is literal Unicode — use `–`, `—`, `%`, `°` directly.

## Structure

```
index.html        markup and layout
styles.css        app chrome plus the resume sheet
extract.js        document readers (.docx/.pdf/text) and the resume parser
app.js            state, JD reading, matching, audit, preview
docxgen.js        Word generation (browser port of the CLI builder)
vendor/           docx, fflate, pdf.js — vendored, no CDN dependency
data/sample.json  fictional sample profile
```

## Privacy

Document parsing, matching and `.docx` generation all happen in your browser. Your documents are never uploaded
and your library is stored in `localStorage` on your machine only.

**One exception, and it's worth knowing about.** A browser cannot read another site's page unless that site sends
permissive CORS headers, and job boards don't. So reading a posting *from a link* routes through a public reader
service (`r.jina.ai`, falling back to `corsproxy.io`), which means that service sees the URL you pasted. Nothing
of yours is sent — just the job posting's address. If you'd rather keep everything local, use **Or paste the
text** instead; that path makes no network requests at all.

Clearing your browser data clears your library, so use **Back up** if you want a copy.

## Limits worth knowing

- **Parsing is heuristic, not AI.** It moves text you already wrote and never invents a claim, but it will
  mis-file things — a heading read as an employer, a location merged into an org name. That's why step 1 ends in
  a review panel. Fix it once and it stays fixed.
- **Legacy `.doc` isn't supported.** Save as `.docx` first.
- **Scanned PDFs won't work.** pdf.js extracts embedded text; it doesn't OCR images.
- **Some postings can't be read from a link** — anything behind a login, or a portal that blocks automated
  reads. Pasting always works.

## License

MIT — see [LICENSE](LICENSE).
