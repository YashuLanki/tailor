/* letter.js — draft a summary and a cover letter from the user's own material.
 *
 * The rest of this app never composes prose. These two do, because a resume with no
 * summary and an application with no letter are real gaps. The compromise that keeps
 * it honest:
 *
 *   - Every factual clause is lifted VERBATIM from a bullet the user wrote.
 *   - Connective tissue is fixed template text, never invented detail.
 *   - Nothing numeric, no employer, no claim is ever synthesised.
 *   - Output is labelled a draft, and the UI says to read every line.
 *
 * Structure follows the reference documents in the originating CLI kit
 * (resume_builder/examples/): identity, strongest evidence, foundations, close.
 */

(function (global) {
  "use strict";

  const plain = (t) => String(t || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").trim();

  /** Strip a leading past-tense verb so a bullet can be re-used mid-sentence. */
  function toClause(text) {
    let t = plain(text).replace(/\.$/, "");
    // Lowercase the opening word unless it is a proper noun or an acronym.
    const first = t.split(/\s+/)[0] || "";
    if (first && first === first[0].toUpperCase() + first.slice(1).toLowerCase() &&
        !/^[A-Z]{2,}$/.test(first)) {
      t = first.toLowerCase() + t.slice(first.length);
    }
    return t;
  }

  /** The bullets currently on the resume, strongest first if scores are known. */
  function selectedBullets(state, chosen, scores) {
    const out = [];
    (state.positions || []).forEach((p, pi) => {
      (p.bullets || []).forEach((b, bi) => {
        const key = "p" + pi + "b" + bi;
        if (!chosen.has(key) || !plain(b.text)) return;
        out.push({ key, text: b.text, org: p.org || p.role || "", role: p.role || "", dates: p.dates || "" });
      });
    });
    if (scores) out.sort((a, b) => (scores[b.key] || 0) - (scores[a.key] || 0));
    return out;
  }

  /** A bullet carrying a number is the most persuasive thing available. */
  const hasNumber = (t) => /\d/.test(plain(t));

  // ── summary ──────────────────────────────────────────────────────────────

  /**
   * Draft a summary in the reference shape:
   *   [identity from degree + current role] . [strongest quantified evidence] . [second evidence] .
   * Every clause after the identity sentence is the user's own wording.
   */
  function draftSummary(state, chosen, scores) {
    const bullets = selectedBullets(state, chosen, scores);
    if (!bullets.length) return { text: "", note: "Add some experience bullets first." };

    // Identity: field of study plus the current job title. Both are facts already on file.
    const degree = (state.education || []).map((e) => plain(e.degree)).find(Boolean) || "";
    const field = (((degree.match(/(?:in|,|—)\s*([A-Z][A-Za-z ]{3,40})/) || [])[1]) ||
                   (degree.split(/[—,]/)[1] || "")).replace(/\s+/g, " ").trim();
    const level = /ph\.?d|doctor/i.test(degree) ? "Ph.D." :
                  /m\.?s|m\.?a|master/i.test(degree) ? "master's" :
                  /b\.?s|b\.?a|bachelor/i.test(degree) ? "bachelor's" : "";
    const title = plain(bullets[0].role) || "";

    let identity = "";
    if (title && level && field) identity = title + " with a " + level + " in " + field + ".";
    else if (title && level) identity = title + " with a " + level + " degree.";
    else if (title) identity = title + ".";
    else if (level && field) identity = level.charAt(0).toUpperCase() + level.slice(1) + " in " + field + ".";

    // Evidence: prefer bullets with numbers, keep the user's exact wording.
    const numbered = bullets.filter((b) => hasNumber(b.text));
    const rest = bullets.filter((b) => !hasNumber(b.text));
    const picked = numbered.slice(0, 2).concat(rest.slice(0, 2)).slice(0, 2);

    const sentences = [identity].filter(Boolean);
    picked.forEach((b, i) => {
      const clause = toClause(b.text);
      sentences.push((i === 0 ? "I have " : "I also ") + clause + ".");
    });

    let text = sentences.join(" ").replace(/\s+/g, " ").trim();

    // Respect the page budget: drop the last sentence rather than overflow.
    const cap = (state.pages === 1) ? 400 : 560;
    while (text.length > cap && sentences.length > 2) {
      sentences.pop();
      text = sentences.join(" ").replace(/\s+/g, " ").trim();
    }

    return {
      text,
      note: "Draft assembled from your own bullets. Rewrite it in your voice before sending — " +
            "it reads like a list because it is one.",
    };
  }

  // ── cover letter ─────────────────────────────────────────────────────────

  /**
   * Draft a cover letter following the reference layout.
   * @param opts {company, roleTitle, recipient, jdTerms}
   */
  function draftLetter(state, chosen, scores, opts) {
    opts = opts || {};
    const company = (opts.company || "").trim();
    const role = (opts.roleTitle || "").trim();
    const bullets = selectedBullets(state, chosen, scores);

    if (!bullets.length) return null;
    if (!company || !role) return { needs: ["company", "roleTitle"] };

    const current = bullets[0];
    const currentOrg = plain(current.org);
    const earlier = bullets.find((b) => plain(b.org) && plain(b.org) !== currentOrg);

    const numbered = bullets.filter((b) => hasNumber(b.text) && plain(b.org) === currentOrg);
    const lead = numbered[0] || current;
    const second = bullets.find((b) => b.key !== lead.key && plain(b.org) === currentOrg);

    const body = [];

    /* Paragraph 1 — the hook. This is the one place a template cannot do the work:
       a good opening names something specific about the employer. So it leads with
       the applicant's strongest concrete fact and says plainly that the reader should
       replace the second half. */
    body.push("I am applying for the " + role + " position at " + company + ". " +
      "At " + (currentOrg || "my current role") + " I " + toClause(lead.text) + ".");

    // Paragraph 2 — more evidence from the same role, still verbatim.
    if (second) {
      body.push("I also " + toClause(second.text) + "." +
        (numbered[1] && numbered[1].key !== second.key ? " And I " + toClause(numbered[1].text) + "." : ""));
    }

    // Paragraph 3 — earlier work, to show a trajectory rather than one job.
    if (earlier) {
      body.push("Earlier, at " + plain(earlier.org) + ", I " + toClause(earlier.text) + ".");
    }

    // Paragraph 4 — the gaps. Naming them is more credible than implying coverage.
    if (opts.gaps && opts.gaps.length) {
      body.push("Two things I should be straightforward about: I have not worked with " +
        opts.gaps.slice(0, 3).join(", ") + ". " +
        "[Say here whether you are learning them, or why the work still transfers.]");
    }

    body.push("Thank you for your consideration. I would welcome the chance to talk about the work.");

    const contact = (state.profile.contact || []).filter(Boolean);
    return {
      format: "cover_letter",
      sender: [state.profile.name || "Your Name"].concat(contact),
      date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      recipient: [(opts.recipient || "Hiring Team"), company].filter(Boolean),
      salutation: "Dear " + (opts.recipient || "Hiring Team") + ",",
      body,
      closing: "Sincerely,",
      signature: state.profile.name || "Your Name",
      note: "Draft. Every factual sentence is lifted from your own bullets, so the prose is stiff and the " +
            "opening says nothing specific about " + company + " yet. Read and rewrite before sending — " +
            "a letter that reads as assembled is worse than a short one that sounds like you.",
    };
  }

  global.Letter = { draftSummary, draftLetter, toClause };
})(window);
