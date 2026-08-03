# Tailor

Build a reusable library of your experience once. Paste a job description. Get a tailored one-page resume as a
Word document.

Runs entirely in the browser — no server, no account, no upload. Your data lives in that browser's local storage
and nowhere else.

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

## What it does

- **Bullet library** — positions, bullets, skill groups, projects, education, entered once and reused
- **JD matching** — extracts weighted terms from the posting, scores each bullet, highlights the overlap
- **Gap detection** — frequent JD terms that appear in none of your bullets
- **Length budgets** — live per-bullet feedback so no bullet spills to a ragged third line
- **Page estimate** — warns before you discover the overflow in Word
- **Live preview** — Times New Roman at real page width, matching the exported file
- **Export** — `.docx` generated in-browser, or print to PDF
- **Portable data** — export/import your library as JSON

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
index.html      markup and layout
styles.css      app chrome plus the resume sheet
app.js          state, JD matching, audit, preview
docxgen.js      Word generation (browser port of the CLI builder)
vendor/         docx library, vendored so there's no CDN dependency
data/sample.json  fictional sample profile
```

## Privacy

No network requests are made after the page loads. Nothing is sent anywhere. Clearing your browser data clears
your library, so export the JSON if you want a backup.

## License

MIT — see [LICENSE](LICENSE).
