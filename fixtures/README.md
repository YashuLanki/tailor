# fixtures

The regression corpus. Every proposed verification agent depends on this, which is why
it exists before the agents do.

## Why HTML and not .docx

Cases are authored as HTML and converted at test time by `tools/make_fixtures.py`. That
keeps the corpus reviewable in a diff, keeps binaries out of git, and means no real
personal document ever enters a public repo. Using LibreOffice as the producer is a
bonus: it emits different XML from Word, so the parser gets tested against two producers
for free.

## Layout

```
cases/NN_name.html            the resume, in one specific layout style
cases/NN_name.expected.json   ground truth, read off the document by a human
baseline.json                 the score at last commit — the regression gate
```

## The rule about expected files

`expected.json` describes **what is true of the document**, never what the parser
currently produces. A fresh checkout therefore fails some checks. That is the point:
the gate is "did anything get worse", not "does everything pass".

Editing an expectation to make a check pass turns the harness into decoration. Ground
truth changes only when the fixture's content changes.

## Coverage, and why each case is here

| Case | Covers | Failure mode it targets |
|---|---|---|
| `01_chronological` | Standard reverse-chronological, tab-aligned dates | The common case |
| `02_federal` | Address, hours-per-week and supervisor lines | Those lines becoming phantom positions |
| `03_academic_cv` | Education before experience, a Publications section | Losing publications; misordered sections |
| `04_compact` | Organisation-first, em-dash separated, "to" in dates | org/role swapping; name inline with contact |
| `05_dupes` | **Two versions of the same resume, ingested together** | Duplicate employers, bullets and degrees surviving a merge |

All cases use the same fictional person, `ALEX MORGAN`, with `example.com` addresses.
Keep that convention when adding cases.

## Multi-file cases

Files named `NN_case__a.html` and `NN_case__b.html` are **ingested together** as one case.
That is how most people actually use the app — an old resume plus a newer one — so
cross-document deduplication needs a fixture rather than a unit test. `05_dupes` is
that case, and its expected file sets `noDuplicateBullets` and `noDuplicateProjects`,
which assert uniqueness directly rather than inferring it from a count.

## Still to cover

- A PDF whose sentences wrap mid-line (build with `--pdf`, but note `parse_corpus.mjs`
  skips PDFs — pdf.js needs the browser runner)
- A resume in a non-US layout (day-first dates, no state abbreviations)
- A two-column layout, which is where text-extraction order usually breaks down
- A resume with no section headings at all
- A CV long enough to span pages
