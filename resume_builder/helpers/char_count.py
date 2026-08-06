#!/usr/bin/env python3
"""
Count rendered characters in resume/CV/cover-letter content for the DOCX pipeline.

Rendered length = the plain string with only the `**bold**` / `*italic*` / `[label](url)`
markers removed. Everything else is literal Unicode and counts as itself.

Usage:
  python3 char_count.py "Built a **queryable database** tracking 49 properties"
  echo "bullet text" | python3 char_count.py
  python3 char_count.py -f output/Vanguard/e2e_resume.json     # audit a whole spec
  python3 char_count.py --raw "bullet text"                    # just the number
  python3 char_count.py --format cv "bullet text"              # force CV budgets
"""

import argparse
import json
import re
import sys

# Budgets from resume_builder/reference/docx_spec.md
TIERS = {
    'resume': [
        # variant, target_lo, target_hi, hard_max, orphan_min
        ('1L', 105, 115, 122, None),
        ('2L', 195, 215, 230, 78),
    ],
    'cv': [
        ('1L', 88, 95, 102, None),
        ('2L', 175, 190, 200, 65),
        ('3L', 260, 280, 295, 65),
    ],
}

ELEMENT_BUDGETS = {
    'summary_resume': (480, 560),
    'summary_resume_1p': (290, 400),
    'summary_cv': (490, 545),
    'tagline': (80, 95),
    'skills_line': (0, 115),
    'theme': (0, 62),
}

MARKER_RE = re.compile(r'\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)')


def strip_markers(text):
    """Remove **bold**, *italic*, and [label](url) markers; keep the visible text."""
    def repl(m):
        return m.group(1) or m.group(2) or m.group(3) or ''
    return MARKER_RE.sub(repl, text).strip()


def count_bold_chars(text):
    return sum(len(m) for m in re.findall(r'\*\*([^*]+)\*\*', text))


def count_em_dashes(text):
    return text.count('—')


def check_latex_residue(text):
    """The DOCX pipeline must contain no LaTeX. Flag leftovers."""
    hits = []
    for pat, label in [
        (r'\\[a-zA-Z]+', 'LaTeX command'),
        (r'\$[^$]*\$', 'math mode'),
        (r'\\%', 'escaped percent'),
        (r'---', 'LaTeX em-dash (use —)'),
    ]:
        if re.search(pat, text):
            hits.append(label)
    return hits


def classify(n, bold, fmt):
    tiers = TIERS[fmt]
    effective_note = None
    if bold >= 25:
        effective_note = 'bold >= 25 chars: tighten per-line target to ~105'

    for variant, lo, hi, hard_max, orphan in tiers:
        if n <= hard_max:
            if n < lo:
                status = 'SHORT'
            elif n <= hi:
                status = 'OK'
            else:
                status = 'NEAR MAX'
            return variant, status, lo, hi, hard_max, orphan, effective_note
    return 'OVER', 'OVER LIMIT', 0, 0, tiers[-1][3], None, effective_note


def report_one(raw, fmt, label=None):
    rendered = strip_markers(raw)
    n = len(rendered)
    bold = count_bold_chars(raw)
    em = count_em_dashes(raw)
    residue = check_latex_residue(raw)

    variant, status, lo, hi, hard_max, orphan, note = classify(n, bold, fmt)

    lines = []
    head = f"  {n:3d} chars | {variant} {fmt.upper()} | {status}"
    if lo:
        head += f" (target {lo}-{hi}, max {hard_max})"
    lines.append(head)
    if bold:
        lines.append(f"  Bold: {bold} chars" + (f" -- {note}" if note else ""))
    if em:
        lines.append(f"  Em-dashes: {em} (max 2 per document)")
    if residue:
        lines.append(f"  !! LaTeX residue: {', '.join(residue)} -- remove it")
    lines.append(f"  Text: {rendered}")
    if label:
        lines.insert(0, f"{label}:")
    return '\n'.join(lines), variant, em, bool(residue)


def audit_spec(path):
    """Walk a JSON spec and check every text element against its budget."""
    with open(path) as f:
        spec = json.load(f)

    fmt = 'cv' if spec.get('format') == 'cv' else 'resume'
    is_cl = spec.get('format') == 'cover_letter'
    # `pages: 1` selects the tighter 1-page summary budget.
    summary_key = 'summary_resume_1p' if (fmt == 'resume' and spec.get('pages') == 1) else f'summary_{fmt}'
    problems = 0
    em_total = 0

    print(f"Auditing {path}  (format: {spec.get('format', 'resume')})\n")

    if is_cl:
        words = sum(len(p.split()) for p in spec.get('body', []))
        print(f"Cover letter body: {words} words (resume pkg 250-300, CV pkg 350-450)")
        if not 250 <= words <= 450:
            problems += 1
            print("  !! outside both package ranges")
        for i, p in enumerate(spec.get('body', []), 1):
            em_total += count_em_dashes(p)
            residue = check_latex_residue(p)
            if residue:
                problems += 1
                print(f"  Para {i}: !! LaTeX residue: {', '.join(residue)}")
        print()
    else:
        header = spec.get('header', {})
        if header.get('tagline'):
            n = len(strip_markers(header['tagline']))
            lo, hi = ELEMENT_BUDGETS['tagline']
            ok = lo <= n <= hi
            problems += 0 if ok else 1
            print(f"Tagline: {n} chars (target {lo}-{hi}) {'OK' if ok else '!! OUT OF RANGE'}")
            em_total += count_em_dashes(header['tagline'])

        total_lines = 0
        for sec in spec.get('sections', []):
            stype = sec.get('type')
            heading = sec.get('heading', stype)

            if stype == 'summary':
                n = len(strip_markers(sec.get('text', '')))
                lo, hi = ELEMENT_BUDGETS[summary_key]
                ok = lo <= n <= hi
                problems += 0 if ok else 1
                print(f"\n[{heading}] summary: {n} chars (target {lo}-{hi}) "
                      f"{'OK' if ok else '!! OUT OF RANGE'}")
                em_total += count_em_dashes(sec.get('text', ''))

            elif stype == 'skills':
                print(f"\n[{heading}]")
                for g in sec.get('groups', []):
                    line = f"{g.get('name','')}: " + ', '.join(g.get('items', []))
                    n = len(strip_markers(line))
                    bold = count_bold_chars(line)
                    limit = 105 if bold >= 25 else ELEMENT_BUDGETS['skills_line'][1]
                    ok = n <= limit
                    problems += 0 if ok else 1
                    print(f"  {g.get('name','?'):<24} {n:3d} chars (max {limit}) "
                          f"{'OK' if ok else '!! OVER'}")
                    em_total += count_em_dashes(line)

            elif stype in ('experience', 'projects'):
                print(f"\n[{heading}]")
                for p in sec.get('positions', []):
                    theme = p.get('theme') or p.get('role', '')
                    tn = len(strip_markers(theme))
                    tmax = ELEMENT_BUDGETS['theme'][1]
                    ok = tn <= tmax
                    problems += 0 if ok else 1
                    print(f"  {theme[:50]!r} theme: {tn} chars (max {tmax}) "
                          f"{'OK' if ok else '!! OVER -- date will wrap'}")
                    for i, b in enumerate(p.get('bullets', []), 1):
                        rep, variant, em, bad = report_one(b, fmt)
                        em_total += em
                        if variant == 'OVER' or bad:
                            problems += 1
                        if variant != 'OVER':
                            total_lines += int(variant[0])
                        print(f"    bullet {i}:")
                        print('    ' + rep.replace('\n', '\n    '))

            elif stype == 'education':
                print(f"\n[{heading}]")
                for e in sec.get('entries', []):
                    for d in e.get('details', []):
                        rep, variant, em, bad = report_one(d, fmt)
                        em_total += em
                        if variant == 'OVER' or bad:
                            problems += 1
                        print('    ' + rep.replace('\n', '\n    '))

            elif stype == 'list':
                print(f"\n[{heading}]")
                for it in sec.get('items', []):
                    rep, variant, em, bad = report_one(it, fmt)
                    em_total += em
                    if variant == 'OVER' or bad:
                        problems += 1
                    print('    ' + rep.replace('\n', '\n    '))

        print(f"\nTotal rendered bullet lines: {total_lines}")

    print(f"Em-dashes across document: {em_total} (max 2)")
    if em_total > 2:
        problems += 1

    print(f"\n{'PASS -- no violations' if problems == 0 else f'{problems} violation(s) to fix'}")
    return 1 if problems else 0


def main():
    parser = argparse.ArgumentParser(
        description='Count rendered characters for the DOCX resume pipeline')
    parser.add_argument('input', nargs='?', help='Bullet text, or a .json spec path')
    parser.add_argument('-f', '--file', dest='spec_file',
                        help='Path to a .json spec to audit in full')
    parser.add_argument('--format', choices=['resume', 'cv'], default='resume',
                        help='Budget set for single-bullet mode (default: resume)')
    parser.add_argument('--raw', action='store_true', help='Output only the char count')
    args = parser.parse_args()

    spec = args.spec_file or (args.input if args.input and args.input.endswith('.json') else None)
    if spec:
        sys.exit(audit_spec(spec))

    if args.input:
        if args.raw:
            print(len(strip_markers(args.input)))
        else:
            print(report_one(args.input, args.format)[0])
    else:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            if args.raw:
                print(len(strip_markers(line)))
            else:
                print(report_one(line, args.format)[0])
                print()


if __name__ == '__main__':
    main()
