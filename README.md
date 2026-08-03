<div align="center">

# ◆ Tailor

### Drop your documents. Paste a link. Export a resume.

**No forms. No account. No server.**
Your files are parsed in your browser and never leave your machine.

[**→ Try it live**](https://yashulanki.github.io/tailor/)

<sub>Vanilla JS · zero build step · nothing to install</sub>

</div>

---

## The problem with AI resume tools

Paste your resume, paste a job description, get a rewrite. You can't see what changed or why, and they will
quietly promote "supported" into "led." The output reads fluent and says things you can't defend in an interview.

**Tailor never writes anything.** It reads what you already wrote, scores it against the posting, and shows you
the scores. Choosing what goes on the page stays your decision — made from evidence instead of vibes.

It also tells you what you *don't* have. The gap panel lists terms the posting stresses that appear in none of
your bullets. That's the honest input to a cover letter, not a prompt to embellish.

---

## Three steps

<table>
<tr>
<td width="33%" valign="top">

### 1 · Documents

Drop in the resumes, cover letters, project reports and transcripts you already have.

`.docx` `.pdf` `.txt` `.md` `.tex`

Word files are unzipped and their XML read directly, including hyperlink targets. PDFs go through pdf.js with
text runs regrouped into lines.

Drop several at once — a resume and an old CV each fill gaps in the other.

</td>
<td width="33%" valign="top">

### 2 · Job

Paste the posting's link. It's read, then **every bullet is scored** against the actual requirement text, with
matched terms highlighted.

Weighted term extraction with bigram detection, so `machine learning` survives as a phrase instead of splitting
into noise.

Plus the gap list: what the posting wants that you haven't shown.

</td>
<td width="33%" valign="top">

### 3 · Export

A live sheet in Times New Roman at true 8.5″ page width — what you see is what the file contains.

A page-count estimate warns you *before* you find the overflow in Word.

Then `.docx` built in the browser, or print to PDF.

</td>
</tr>
</table>

---

## What makes the output usable

**It respects the page.** Every bullet is measured as you type. One that would spill onto a ragged third line is
flagged red; one that wraps to a nearly-empty second line is flagged as an orphan — the subtler mistake, and the
one that reads as careless.

| Element | Target | Hard limit |
|:--|:--|:--|
| Bullet — one line | 105–122 | 122 |
| Bullet — two lines | 195–230 | 230 |
| Summary — 1-page resume | 290–400 | — |
| Summary — 2-page resume | 480–560 | — |
| Skills group line | ≤ 115 | 115 |
| Position heading | ≤ 62 | 62 |

<sub>Characters, calibrated for Times New Roman 10.5pt on US Letter with 0.5″ margins. Formatting markers don't
count, so <code>**Python**</code> is 6.</sub>

**It watches your prose, not just your layout.** More than two em-dashes across the document gets flagged — the
single most reliable tell that a resume was machine-written.

**Formatting is three markers, not a toolbar.**

| Write | Renders |
|:--|:--|
| `**text**` | **bold** |
| `*text*` | *italic* |
| `[label](url)` | link |

Everything else is literal Unicode. Type `–`, `—`, `%`, `°` directly.

---

## Privacy, precisely

Parsing, scoring and `.docx` generation all happen in your browser. Your documents are never uploaded. Your
library lives in `localStorage` on your machine.

> **One exception, worth stating plainly.** A browser cannot read another site's page unless that site sends
> permissive CORS headers — and job boards don't. So reading a posting *from a link* routes through a public
> reader service (`r.jina.ai`, falling back to `corsproxy.io`), which means that service sees the URL you pasted.
> Nothing of yours is sent, just the posting's address. Prefer **Paste the text instead** and the app makes no
> network requests at all.

---

## Limits

Stated up front, because a tool that hides these wastes your time later.

- **Parsing is heuristic, not AI.** It only moves text you already wrote and never invents a claim — but it will
  mis-file things. A heading read as an employer, a city merged into a company name. That's why step 1 ends in a
  review panel: fix it once and it stays fixed for every future application.
- **Legacy `.doc` is not supported.** Save as `.docx` first.
- **Scanned PDFs won't work.** pdf.js extracts embedded text; there's no OCR.
- **Some postings can't be read from a link** — anything behind a login, or a portal that blocks automated reads.
  Pasting always works.

---

## Run it locally

No build step, no `npm install`:

```bash
git clone https://github.com/YashuLanki/tailor.git
cd tailor
python3 -m http.server 8000
```

Open `http://localhost:8000`. To publish your own copy: fork, then **Settings → Pages → deploy from branch root**.

---

## Under the hood

```
index.html          markup and layout
styles.css          app chrome, plus the resume sheet
extract.js          document readers (.docx / .pdf / text) and the resume parser
app.js              state, JD reading, term matching, budget audit, live preview
docxgen.js          Word generation — a browser port of the CLI builder
data/sample.json    a fictional profile, for trying the flow
vendor/             docx · fflate · pdf.js — vendored, so no CDN is ever contacted
```

The `.docx` writer is a direct port of a command-line builder, so page size, margins, fonts, spacing and
numbering definitions are identical. What the browser exports is what the CLI exports.

---

<div align="center">

**MIT licensed** · see [LICENSE](LICENSE)

<sub>Built because tailoring forty applications by hand is a worse use of an afternoon than building the tool.</sub>

</div>
