This repo is my working copy of **[claude-resume-kit](https://github.com/ARPeeketi/claude-resume-kit)**,
an open-source Claude Code skill kit by [Akhil Reddy Peeketi](https://github.com/ARPeeketi) (MIT License —
see [Credits](#credits)). I use it for my own job search, and this copy reflects the version I actually run:
it outputs `.docx`/`.pdf` through a JSON-spec pipeline rather than the original's LaTeX templates (see
`resume_builder/reference/docx_spec.md` for the full contract). Personal data — my résumé content, job
descriptions, and generated output — has been stripped out; everything here is the reusable tool plus
generic placeholder examples.

---

## What it does

Most AI resume tools work the same way: paste resume + paste JD, get a rewrite. They don't know which of
your papers is published vs. under review. They don't know you only ran the simulations, not the
experiments. They'll upgrade "contributed to" into "developed" without blinking.

This is different. You extract your source material (papers, code, reports, past resumes) once — the
system asks structured questions about each one. After that, every new application is just pointing it at
a job description. It picks the right achievements, frames them for the audience, enforces accuracy, and
generates a Word document you can open and edit directly.

**Knowledge base, not a rewriter.** You extract once. Every application draws from verified source
material — not a pasted resume that gets "improved."

**Anti-fabrication by design.** Provenance flags on every achievement (published / under review /
internal). Verb discipline rules prevent overclaiming. A corrections log ensures fixed errors don't
reappear.

**AI fingerprint avoidance.** Banned-word lists, structural anti-patterns, and a post-generation scan so
output reads as human-written.

**Multi-perspective critique.** Reader personas score the resume across 8 dimensions in a fresh context
window.

**Word output, locally built.** No data leaves your machine beyond the Claude Code conversation.

---

## How it works

```
Your Papers --> /setup-extract --> Extractions --> /setup-build-kb --> Knowledge Base
                                                                          |
Job Description --> /make-resume --> Tailored Resume/CV (.docx + .pdf)    |
                        |              v                                  |
                   /make-cl --> Cover Letter (.docx + .pdf)               |
                        |              v                                  |
                   /critique --> 8-Part Score + AI Scan + Fixes           |
                        |              v                                  |
                   /edit-resume --> Refined Package                       |
```

| Skill | Purpose | Input | Output |
|-------|---------|-------|--------|
| `/setup-extract` | Extract structured data from a paper/report | Paper path | `knowledge_base/extractions/*.md` |
| `/setup-build-kb` | Build KB from extractions | All extractions | `resume_builder/{experience,bundles,support}/` |
| `/make-resume` | Generate tailored resume or CV | JD path | `output/<Folder>/*.docx` + `.pdf` + session file |
| `/make-cl` | Generate matching cover letter | Session file | `output/<Folder>/*_cover_letter.docx` |
| `/edit-resume` | Edit resume/CV/CL from feedback | Session + feedback | Updated spec + rebuilt `.docx` |
| `/critique` | Independent quality review | Session file | `output/<Folder>/critique_*.md` |

---

## Example output

The included example knowledge base is for a fictional researcher (Dr. Jordan Chen, computational
biologist). The `.tex` files under `resume_builder/examples/output/` are from the original LaTeX pipeline
and are kept for reference — new runs through this copy produce `.docx`/`.pdf`.

- [Example Resume (PDF)](resume_builder/examples/example_resume.pdf)
- [Example Cover Letter (PDF)](resume_builder/examples/example_cover_letter.pdf)
- [Example Session File](resume_builder/examples/example_session_file.md)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure

Edit `config.md` with your details (name, email, provenance flags, role types). See
`resume_builder/examples/example_config.md` for a complete filled-in example, and fill in
`resume_builder/templates/fixed_sections.json` with your real header/education (both ship with
`[placeholder]` values).

### 3. Extract your source material

```
/setup-extract knowledge_base/papers/my_paper.pdf
```

Claude reads it, asks clarifying questions about your contributions, and creates a structured extraction.
Repeat for each source document.

### 4. Build your knowledge base

```
/setup-build-kb
```

### 5. Generate for a job

```
/make-resume JDs/target_job.txt
```

Then in separate sessions: `/make-cl` for the cover letter, `/critique` for a scored review.

Each step uses a **separate Claude Code session** for best quality (fresh context = less bias).

---

## Prerequisites

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** CLI installed and authenticated
- **Node.js** (for `build_docx.js`) and **LibreOffice** (`soffice`, for the `.docx` → `.pdf` conversion step)
- Your source material ready for extraction

---

## Documentation

For architecture details, customization tables, the full critique system breakdown, and design decisions,
see the upstream project's **[DOCS.md](DOCS.md)**.

---

## Credits

Built on **[claude-resume-kit](https://github.com/ARPeeketi/claude-resume-kit)** by Akhil Reddy Peeketi,
MIT License. The skill definitions, reference docs, and example knowledge base in this repo originate from
that project; the DOCX output pipeline (`resume_builder/helpers/build_docx.js`,
`resume_builder/reference/docx_spec.md`) is a local modification replacing the original's LaTeX renderer.
Original license text below.

```
MIT License

Copyright (c) 2026 Akhil Reddy Peeketi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

This repository's own modifications are licensed under the [LICENSE](LICENSE) in this repo (MIT, © Yashu
Lanki).
