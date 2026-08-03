/* polish.js — language checks ported from the CLI kit's ai_fingerprint_rules.md.
 *
 * The app never rewrites your prose. But the bullets come from resumes you already
 * had, which may carry the patterns readers now recognise as machine-written. This
 * finds them and names the fix; you decide.
 *
 * Every rule here is deterministic. No model, no network.
 */

(function (global) {
  "use strict";

  // ── 1 · words that give it away ──────────────────────────────────────────

  // Tier 1: never appropriate in a resume bullet.
  const TIER1 = [
    "delve", "tapestry", "multifaceted", "pivotal", "realm", "synergy", "paradigm",
    "holistic", "nuanced", "embark", "spearhead", "cornerstone", "groundbreaking",
    "cutting-edge",
  ];

  // Swap-in replacements. Kept as a map so the flag can name the fix.
  const SWAPS = {
    robust: "strong, reliable",
    comprehensive: "thorough, broad",
    innovative: "new, original — or cut it",
    meticulous: "careful, precise",
    diverse: "varied, wide-ranging",
    extensive: "broad, deep, or a number",
    leverage: "use, apply, draw on",
    utilize: "use",
    utilized: "used",
    harness: "apply, use",
    foster: "support, build, grow",
    fostered: "supported, built",
    facilitate: "run, lead, coordinate",
    facilitated: "ran, led, coordinated",
    showcase: "show, demonstrate",
    showcased: "showed, demonstrated",
    underscore: "show, highlight",
    bolster: "strengthen, support",
    bolstered: "strengthened",
    meticulously: "carefully",
    notably: "cut it",
    subsequently: "then, later",
    remarkably: "cut it",
    seamlessly: "cut it",
    thereby: "so",
  };

  // Metaphorical only — "free energy landscape" is fine, "the data landscape" is not.
  const METAPHOR = ["landscape", "journey"];

  const PHRASES = [
    "proven track record", "passionate about", "i am excited to apply",
    "demonstrated ability to", "strong foundation in", "well-versed in", "adept at",
    "in today's rapidly evolving", "at the forefront of", "it is worth noting that",
    "this experience has taught me", "i am uniquely positioned to", "in an era of",
    "groundbreaking research", "cutting-edge methodology", "novel approach",
    "significant contributions to the field", "at the intersection of",
    "responsible for", "duties included", "helped to", "worked on",
  ];

  const plain = (t) => String(t || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

  const flag = (out, severity, where, what, fix) => out.push({ severity, where, what, fix });

  /** Per-item checks: words, phrases, and the -ing ending. */
  function checkItem(text, where, out) {
    const t = plain(text);
    const low = t.toLowerCase();

    TIER1.forEach((w) => {
      if (new RegExp("\\b" + w.replace("-", "[- ]") + "\\w*\\b", "i").test(t)) {
        flag(out, "high", where, '"' + w + '"', "Cut it. There is always a plainer word.");
      }
    });

    Object.keys(SWAPS).forEach((w) => {
      if (new RegExp("\\b" + w + "\\b", "i").test(t)) {
        flag(out, "med", where, '"' + w + '"', "Try: " + SWAPS[w]);
      }
    });

    METAPHOR.forEach((w) => {
      // Only metaphorical use. A technical noun before it means it is literal.
      const re = new RegExp("\\b(the|a|this|our|its|todays?|current|evolving)\\s+\\w*\\s?" + w + "\\b", "i");
      if (re.test(t)) {
        flag(out, "med", where, '"' + w + '" used as a metaphor', "Name the actual thing.");
      }
    });

    PHRASES.forEach((p) => {
      if (low.includes(p)) {
        flag(out, "high", where, '"' + p + '"', "Say what you did instead.");
      }
    });

    /* The most reliable structural marker: a bullet trailing off into a vague
       consequence. "…enabling improved outcomes" says nothing a reader can check.
       Concrete "-ing" endings are fine and common in good writing —
       "…replacing a four-hour manual rebuild" names a real thing — so only the
       filler participles followed by an abstraction are flagged. */
    const FILLER = /^(thereby\s+|thus\s+|so\s+)?(enabling|contributing|allowing|helping|improving|advancing|driving|ensuring|facilitating|fostering|supporting|promoting|leading to|resulting in|paving)\b/i;
    const ABSTRACT = /\b(outcomes?|efficiency|efficiencies|visibility|success|growth|performance|productivity|quality|collaboration|innovation|impact|value|understanding|awareness|engagement|alignment|synergy|excellence|capabilities|effectiveness|satisfaction|the field|better\s+\w+|improved\s+\w+|greater\s+\w+|enhanced\s+\w+)\b/i;

    const tail = t.replace(/[.\s]+$/, "");
    const m = tail.match(/,\s+((?:thereby\s+|thus\s+|so\s+)?\w+ing\b[^,]*)$/i);
    if (m) {
      const clause = m[1];
      const vague = FILLER.test(clause) && !/\d/.test(clause) &&
        (ABSTRACT.test(clause) || clause.split(/\s+/).length <= 4);
      if (vague) {
        flag(out, "high", where, 'trails off: "…, ' + clause.slice(0, 44) + '"',
          "End on a result, number or named object instead.");
      }
    }
  }

  /** Document-level checks: em-dashes, sentence rhythm, triplets, passive voice. */
  function checkDocument(items, summary, out) {
    const prose = [summary].concat(items).map(plain).filter(Boolean);
    const all = prose.join(" ");

    const dashes = (all.match(/—/g) || []).length;
    if (dashes > 2) {
      flag(out, "med", "whole document", dashes + " em-dashes in prose",
        "Two or fewer. Replace the rest with commas, semicolons or parentheses.");
    }

    // Three consecutive sentences of near-identical length reads as generated.
    const sentences = all.split(/(?<=[.!?])\s+/).map((s) => s.trim().split(/\s+/).length)
      .filter((n) => n > 3);
    for (let i = 0; i + 2 < sentences.length; i++) {
      const [a, b, c] = sentences.slice(i, i + 3);
      if (Math.max(a, b, c) - Math.min(a, b, c) <= 2) {
        flag(out, "low", "whole document", "three consecutive sentences of similar length",
          "Vary the rhythm — mix a short sentence in among the long ones.");
        break;
      }
    }

    const triplets = (all.match(/\b\w+,\s+\w+,?\s+and\s+\w+/g) || []).length;
    if (triplets > 2) {
      flag(out, "low", "whole document", triplets + ' "X, Y, and Z" lists',
        "Two at most. Use pairs, single items, or lists of four or more.");
    }

    // Passive voice in bullets buries who did the work.
    const passive = items.filter((b) => /\b(was|were|been|being|is|are)\s+\w+(ed|en)\b/i.test(plain(b)));
    if (items.length && passive.length / items.length > 0.2) {
      flag(out, "med", "bullets", passive.length + " of " + items.length + " bullets are passive",
        "Lead with the verb: \"Built\", not \"was responsible for building\".");
    }
  }

  /**
   * Scan the selected content.
   * @returns {{flags: Array, counts: {high:number, med:number, low:number}}}
   */
  function scan(state, chosen) {
    const out = [];
    const items = [];

    (state.positions || []).forEach((p, pi) => {
      (p.bullets || []).forEach((b, bi) => {
        if (!chosen.has("p" + pi + "b" + bi) || !plain(b.text).trim()) return;
        const where = p.org || p.role || p.theme || "Experience";
        items.push(b.text);
        checkItem(b.text, where, out);
      });
    });
    (state.projects || []).forEach((p, i) => {
      if (!chosen.has("j" + i) || !plain(p.text).trim()) return;
      items.push(p.text);
      checkItem(p.text, "Projects", out);
    });
    if (plain(state.summary).trim()) checkItem(state.summary, "Summary", out);

    checkDocument(items, state.summary, out);

    const counts = { high: 0, med: 0, low: 0 };
    out.forEach((f) => { counts[f.severity]++; });
    const order = { high: 0, med: 1, low: 2 };
    out.sort((a, b) => order[a.severity] - order[b.severity]);
    return { flags: out, counts };
  }

  global.Polish = { scan };
})(window);
