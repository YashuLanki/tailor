#!/usr/bin/env python3
"""Score a parse report against hand-checked ground truth.

Expected files describe what a human reads off the document, NOT what the parser
currently produces. So a fresh run is expected to fail some checks — that is the
point. The baseline file records today's score, and the gate is "did anything get
worse", which is what you actually want when hardening a parser: a regex that
fixes one format usually breaks another.

Usage:
  python3 tools/score_parse.py                       # score and print
  python3 tools/score_parse.py --save-baseline       # record current score
  python3 tools/score_parse.py --check               # exit 1 if worse than baseline
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASES = ROOT / "fixtures" / "cases"
REPORT = ROOT / ".tmp" / "parse_report.json"
BASELINE = ROOT / "fixtures" / "baseline.json"


def norm(s: str) -> str:
    return "".join(c for c in str(s or "").lower() if c.isalnum() or c == " ").strip()


def contains(hay: str, needle: str) -> bool:
    return norm(needle) in norm(hay)


def score_case(exp: dict, got: dict) -> tuple[list[str], list[str]]:
    """Return (passes, failures) as human-readable check descriptions."""
    ok, bad = [], []

    def check(cond, label):
        (ok if cond else bad).append(label)

    check(contains(got["name"], exp["name"]), f"name == {exp['name']!r}")
    if exp.get("credential"):
        check(contains(got["credential"], exp["credential"]), f"credential == {exp['credential']!r}")

    for want in exp.get("contactMustInclude", []):
        check(any(contains(c, want) for c in got["contact"]), f"contact includes {want!r}")
    for avoid in exp.get("contactMustExclude", []):
        check(not any(contains(c, avoid) for c in got["contact"]), f"contact excludes {avoid!r}")

    # Producers normalise URLs differently (LibreOffice appends a trailing slash),
    # which is not a meaningful difference.
    def same_url(a, b):
        return a.rstrip("/") == b.rstrip("/")

    for want in exp.get("links", []):
        hit = next((l for l in got["links"] if same_url(l["url"], want["url"])), None)
        check(hit is not None, f"link {want['url']} present")
        if hit:
            check(hit["label"] == want["label"],
                  f"link {want['url']} labelled {want['label']!r} (got {hit['label']!r})")

    if "skillGroups" in exp:
        check(got["skillGroups"] == exp["skillGroups"],
              f"{exp['skillGroups']} skill groups (got {got['skillGroups']})")
    if "summaryMinChars" in exp:
        check(got["summaryChars"] >= exp["summaryMinChars"],
              f"summary >= {exp['summaryMinChars']} chars (got {got['summaryChars']})")

    # Positions: count, then per-employer role/dates/bullets.
    want_pos = exp.get("positions", [])
    check(len(got["positions"]) == len(want_pos),
          f"{len(want_pos)} positions (got {len(got['positions'])})")

    for wp in want_pos:
        # Match on employer appearing anywhere in the position's fields, because
        # which field it lands in is itself one of the things under test.
        hit = next((gp for gp in got["positions"]
                    if any(contains(gp[f], wp["org"]) for f in ("org", "role", "theme", "location"))), None)
        check(hit is not None, f"position for {wp['org']!r} found")
        if not hit:
            continue
        check(contains(hit["org"], wp["org"]), f"{wp['org']!r} lands in org (got {hit['org']!r})")
        if wp.get("role"):
            check(any(contains(hit[f], wp["role"]) for f in ("role", "theme")),
                  f"{wp['org']}: role {wp['role']!r} captured")
        if wp.get("dates"):
            check(contains(hit["dates"], wp["dates"]),
                  f"{wp['org']}: dates {wp['dates']!r} (got {hit['dates']!r})")
        if "bullets" in wp:
            check(hit["bullets"] == wp["bullets"],
                  f"{wp['org']}: {wp['bullets']} bullets (got {hit['bullets']})")

    for avoid in exp.get("positionsMustNotInclude", []):
        leaked = [gp for gp in got["positions"]
                  if any(contains(gp[f], avoid) for f in ("org", "role", "theme", "location"))]
        check(not leaked, f"no phantom position containing {avoid!r}")

    want_edu = exp.get("education", [])
    check(len(got["education"]) == len(want_edu),
          f"{len(want_edu)} degrees (got {len(got['education'])})")
    for want in want_edu:
        check(any(contains(e["degree"], want.split("—")[0].strip()) for e in got["education"]),
              f"degree {want!r} present")
    for avoid in exp.get("educationMustNotInclude", []):
        check(not any(contains(e["degree"], avoid) for e in got["education"]),
              f"no phantom degree containing {avoid!r}")

    if "projects" in exp:
        check(got["projects"] == exp["projects"], f"{exp['projects']} projects (got {got['projects']})")
    if "projectsMin" in exp:
        check(got["projects"] >= exp["projectsMin"],
              f"projects >= {exp['projectsMin']} (got {got['projects']})")

    return ok, bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--save-baseline", action="store_true")
    ap.add_argument("--check", action="store_true", help="exit 1 if any case regressed")
    ap.add_argument("--verbose", "-v", action="store_true", help="list passing checks too")
    args = ap.parse_args()

    if not REPORT.exists():
        sys.exit(f"no report at {REPORT}. Run: node tools/parse_corpus.mjs")
    report = json.loads(REPORT.read_text())

    scores, total_ok, total_all = {}, 0, 0
    for stem, case in sorted(report["cases"].items()):
        exp_path = CASES / f"{stem}.expected.json"
        if not exp_path.exists():
            print(f"\n{stem}: no expected file, skipping")
            continue
        if not case.get("ok"):
            print(f"\n{stem}: PARSE FAILED — {case.get('error')}")
            scores[stem] = 0.0
            continue

        exp = json.loads(exp_path.read_text())
        ok, bad = score_case(exp, case["parsed"])
        pct = 100.0 * len(ok) / max(1, len(ok) + len(bad))
        scores[stem] = round(pct, 1)
        total_ok += len(ok)
        total_all += len(ok) + len(bad)

        print(f"\n{stem}  {len(ok)}/{len(ok) + len(bad)} checks  ({pct:.0f}%)")
        for f in bad:
            print(f"    ✗ {f}")
        if args.verbose:
            for p in ok:
                print(f"    ✓ {p}")

    overall = round(100.0 * total_ok / max(1, total_all), 1)
    print(f"\n{'=' * 60}\nOVERALL  {total_ok}/{total_all} checks  ({overall}%)")
    for stem, pct in scores.items():
        print(f"  {stem:<24} {pct:>5}%")

    if args.save_baseline:
        BASELINE.write_text(json.dumps({"overall": overall, "cases": scores}, indent=2) + "\n")
        print(f"\nbaseline saved -> {BASELINE.relative_to(ROOT)}")
        return 0

    if args.check:
        if not BASELINE.exists():
            print("\nNo baseline yet. Run with --save-baseline first.")
            return 0
        base = json.loads(BASELINE.read_text())
        regressed = [(s, base["cases"][s], scores.get(s, 0.0))
                     for s in base["cases"]
                     if scores.get(s, 0.0) < base["cases"][s] - 0.05]
        if regressed:
            print("\nREGRESSION:")
            for stem, was, now in regressed:
                print(f"  {stem}: {was}% -> {now}%")
            return 1
        improved = [(s, base["cases"][s], scores[s]) for s in scores
                    if s in base["cases"] and scores[s] > base["cases"][s] + 0.05]
        for stem, was, now in improved:
            print(f"  improved: {stem} {was}% -> {now}%")
        print("\nNo regressions.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
