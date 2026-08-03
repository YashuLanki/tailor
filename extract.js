/* extract.js — turn uploaded documents into a structured library.
   Reads .docx (zip + XML), .pdf (pdf.js) and plain text, then parses resume
   structure heuristically: section headings, date ranges, bullet markers.

   Deliberately no LLM. Everything runs locally, and the parser only ever moves
   text you already wrote — it never invents a claim. */

(function (global) {
  "use strict";

  // ───────────────────────── file readers ─────────────────────────

  async function readDocx(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const files = global.fflate.unzipSync(buf, {
      filter: (f) => /^word\/(document\.xml|_rels\/document\.xml\.rels)$/.test(f.name),
    });
    const xmlBytes = files["word/document.xml"];
    if (!xmlBytes) throw new Error("not a Word document");
    const xml = new TextDecoder().decode(xmlBytes);

    // Hyperlink targets live in the rels part, keyed by r:id. Without this,
    // a "Portfolio" link comes through as bare text with no URL.
    const rels = {};
    if (files["word/_rels/document.xml.rels"]) {
      const relXml = new TextDecoder().decode(files["word/_rels/document.xml.rels"]);
      // Attribute order is not guaranteed — Word writes Id/Type/Target, LibreOffice
      // does not. Pull each attribute out of the element independently.
      const rRe = /<Relationship\b([^>]*)>/g;
      let r;
      while ((r = rRe.exec(relXml)) !== null) {
        const attrs = r[1];
        const id = (attrs.match(/\bId="([^"]+)"/) || [])[1];
        const type = (attrs.match(/\bType="([^"]+)"/) || [])[1] || "";
        const target = (attrs.match(/\bTarget="([^"]+)"/) || [])[1];
        if (id && target && /hyperlink/i.test(type)) rels[id] = target;
      }
    }
    const linkUrls = Object.values(rels).filter((u) => /^https?:/i.test(u));

    // Each <w:p> is a paragraph; concatenate its <w:t> runs. <w:tab/> and
    // <w:br/> become spaces so right-aligned dates don't fuse onto words.
    const paras = [];
    const pRe = /<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
    let m;
    while ((m = pRe.exec(xml)) !== null) {
      const block = m[0];
      let text = "";
      // w:ptab is a positional tab (right-aligned dates). Without it, "Phoenix, AZ"
      // and "Anticipated December 2027" fuse into "AZAnticipated".
      const tRe = /<w:p?tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
      let t;
      while ((t = tRe.exec(block)) !== null) {
        text += t[1] === undefined ? "\t" : t[1];
      }
      text = text
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/ /g, " ");
      // Word marks list items in properties, not text — remember it for the parser.
      const isList = /<w:numPr\b/.test(block);
      // Attach any hyperlink targets referenced by this paragraph.
      const urls = [];
      const hRe = /<w:hyperlink\b[^>]*r:id="([^"]+)"/g;
      let h;
      while ((h = hRe.exec(block)) !== null) if (rels[h[1]]) urls.push(rels[h[1]]);
      paras.push({ text: text.trim(), list: isList, raw: text, urls });
    }
    const out = paras.filter((p) => p.text.length);
    // If Word stored links but we couldn't tie them to a paragraph, keep them
    // on the first line so the header parser still finds them.
    if (out.length && !out.some((p) => p.urls && p.urls.length) && linkUrls.length) {
      out[0].urls = linkUrls;
    }
    return out;
  }

  let pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import("./vendor/pdf.min.mjs").then((mod) => {
        mod.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";
        return mod;
      });
    }
    return pdfjsPromise;
  }

  async function readPdf(file) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const paras = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // Group text items into lines by their vertical position.
      const lines = new Map();
      content.items.forEach((it) => {
        if (!it.str) return;
        const y = Math.round(it.transform[5]);
        if (!lines.has(y)) lines.set(y, []);
        lines.get(y).push({ x: it.transform[4], s: it.str });
      });
      [...lines.keys()].sort((a, b) => b - a).forEach((y) => {
        const text = lines.get(y).sort((a, b) => a.x - b.x).map((o) => o.s).join(" ")
          .replace(/\s+/g, " ").trim();
        if (text) paras.push({ text, list: /^[•·▪◦\-–*]\s/.test(text), raw: text });
      });
    }
    return paras;
  }

  async function readText(file) {
    const txt = await file.text();
    return txt.split(/\r?\n/).map((l) => ({
      text: l.trim(), list: /^\s*[•·▪◦\-–*]\s/.test(l), raw: l,
    })).filter((p) => p.text.length);
  }

  async function readFile(file) {
    const n = file.name.toLowerCase();
    if (n.endsWith(".docx")) return readDocx(file);
    if (n.endsWith(".pdf")) return readPdf(file);
    if (/\.(txt|md|markdown|csv|tex)$/.test(n)) return readText(file);
    if (n.endsWith(".doc")) throw new Error("legacy .doc isn't readable in a browser — save as .docx first");
    throw new Error("unsupported file type");
  }

  // ───────────────────────── parsing helpers ─────────────────────────

  const SECTION = [
    { key: "summary", re: /^(professional\s+)?(summary|profile|objective|about\s+me|overview)\b/i },
    { key: "experience", re: /^(work\s+|professional\s+|relevant\s+|research\s+)?(experience|employment|history|positions?)\b/i },
    { key: "education", re: /^(education|academic\s+background|degrees?)\b/i },
    { key: "skills", re: /^(technical\s+)?(skills|competencies|proficiencies|technologies|tools)\b/i },
    { key: "projects", re: /^(selected\s+|personal\s+|academic\s+)?(projects?|portfolio)\b/i },
    { key: "publications", re: /^(publications?|papers?|research\s+output)\b/i },
    { key: "awards", re: /^(awards?|honors?|honours?|achievements?|certifications?)\b/i },
  ];

  // "Aug 2022 – May 2024", "2022-2024", "June 2026 – Present", "05/2023 - 08/2023"
  const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
  const DATE_RANGE = new RegExp(
    "((?:" + MONTH + "\\.?\\s*)?(?:19|20)\\d{2}|\\d{1,2}/(?:19|20)\\d{2})\\s*(?:–|—|-|to|through)\\s*" +
    "((?:" + MONTH + "\\.?\\s*)?(?:19|20)\\d{2}|\\d{1,2}/(?:19|20)\\d{2}|present|current|now|ongoing)", "i");
  const SINGLE_DATE = new RegExp("^(?:" + MONTH + "\\.?\\s*)?(?:19|20)\\d{2}$", "i");

  // "Austin, TX" / "Remote" / "Providence, RI 02903" — a place, not an employer.
  const LOCATION_ONLY = /^(remote|hybrid|onsite|[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}(\s+\d{5})?)$/i;

  /* Federal and government resumes carry administrative lines between the position
     header and its bullets: a street address, hours per week, a supervisor and
     whether they may be contacted, salary, grade. These are neither a position nor
     an achievement. Left unhandled they become phantom employers named
     "40 hours/week" that then swallow every following bullet. */
  const ADMIN_LINE = new RegExp([
    "\\b\\d+(\\.\\d+)?\\s*(hours?|hrs?)\\s*(per\\s*week|/\\s*week|a\\s*week)",
    "^\\s*supervisor\\s*:",
    "\\b(may|do\\s+not|okay\\s+to)\\s+contact\\b",
    "^\\s*(salary|pay\\s*grade|grade|series|gs-\\d+|step)\\s*[:.]",
    "^\\s*\\d+\\s+[NSEW]?\\.?\\s*[A-Z][\\w.'-]*(\\s+[\\w.'-]+)*\\s*,?\\s*(suite|ste|apt|unit|#)?",
    "\\b(street|st\\.|avenue|ave\\.|road|rd\\.|boulevard|blvd\\.|parkway|pkwy|drive|dr\\.|lane|ln\\.|court|ct\\.)\\s*,?\\s*(suite|ste|apt|unit|#|[A-Za-z ]+,\\s*[A-Z]{2})",
  ].join("|"), "i");

  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
  const PHONE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  // NB: named URL_RE, not URL — a module-level `const URL` would shadow the
  // URL constructor and silently break linkLabel().
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s|,)]+|\b[\w-]+\.(?:com|org|net|io|dev|me|ai|co)\/[^\s|,)]+/i;

  const isHeading = (t) => {
    const s = t.replace(/[^A-Za-z ]/g, "").trim();
    if (!s || s.length > 42) return false;
    // ALL CAPS, or Title Case with no sentence punctuation
    return s === s.toUpperCase() || (!/[.,;]$/.test(t) && t.split(/\s+/).length <= 5);
  };

  function sectionOf(text) {
    if (text.length > 48) return null;
    const clean = text.replace(/[^A-Za-z\s&]/g, " ").trim();
    for (const s of SECTION) if (s.re.test(clean)) return s.key;
    return null;
  }

  const bulletish = (p) =>
    p.list || /^[•·▪◦]\s/.test(p.text) || /^[-–*]\s+\S/.test(p.text);
  const stripMarker = (t) => t.replace(/^\s*[•·▪◦\-–*]\s*/, "").trim();

  /** Split "Role — Company, City   Aug 2022 – May 2024" into parts. */
  function parseHeader(text) {
    const out = { role: "", org: "", location: "", dates: "" };
    let s = text.replace(/\t+/g, "  ").trim();

    const dm = s.match(DATE_RANGE);
    if (dm) {
      out.dates = dm[0].replace(/\s*[-–—]\s*/, " – ").replace(/\s+/g, " ").trim();
      s = s.replace(dm[0], "").trim();
    } else {
      // Single or projected dates: "Anticipated December 2027", "May 2024", "Expected 2027"
      const sm = s.match(new RegExp(
        "((?:anticipated|expected|projected|graduating)\\s+)?(?:" + MONTH + "\\.?\\s+)?(?:19|20)\\d{2}\\s*$", "i"));
      if (sm && sm[0].trim()) {
        out.dates = sm[0].replace(/\s+/g, " ").trim();
        s = s.slice(0, sm.index).trim();
      }
    }
    s = s.replace(/[|,;–—-]+\s*$/, "").trim();

    // Split on strong separators first: pipe, em/en dash, spaced hyphen, double space, " at ".
    let parts = s.split(/\s*[|—–]\s*|\s+-\s+|\s{2,}|\s+at\s+/).map((x) => x.trim()).filter(Boolean);

    // A trailing location belongs in `location`, whichever separator preceded it.
    const peelLocation = (arr) => {
      if (arr.length >= 2 && LOCATION_ONLY.test(arr[arr.length - 1])) out.location = arr.pop();
      return arr;
    };
    parts = peelLocation(parts);

    // Whatever is left may still be "Role, Employer" on one line.
    if (parts.length === 1) {
      let segs = parts[0].split(",").map((x) => x.trim()).filter(Boolean);

      // "…, Scottsdale, AZ" arrives as two segments.
      if (!out.location && segs.length >= 3 && /^[A-Z]{2}$/.test(segs[segs.length - 1])) {
        const st = segs.pop();
        out.location = segs.pop() + ", " + st;
      }
      segs = peelLocation(segs);

      if (segs.length >= 2) {
        // A heading like "Portfolio Monitoring, Risk Screening & AI Tooling" must survive
        // intact; an "&" or "and" on the right means the comma joins a phrase.
        const rest = segs.slice(1).join(", ");
        const orgish = /\b(inc|llc|ltd|corp|corporation|company|co|group|university|college|school|bank|labs?|institute|foundation|systems|technologies|partners|investments|agreement|associates|solutions)\b\.?/i.test(rest);
        const listish = /\s(&|and)\s/.test(rest);
        parts = (!listish && (orgish || segs.length > 2 ||
                 (segs[0].split(/\s+/).length <= 5 && rest.split(/\s+/).length <= 4)))
          ? [segs[0], rest]
          : [segs.join(", ")];
      } else {
        parts = segs;
      }
    }

    if (parts.length === 1) out.role = parts[0];
    else if (parts.length >= 2) {
      let role = parts[0];
      let org = parts.slice(1).join(", ");
      // "Brightline Logistics — Data Analyst" puts the employer first. Swap when the
      // second part names a job and the first does not.
      const firstIsRole = ROLE_WORD.test(role), secondIsRole = ROLE_WORD.test(org);
      const firstIsOrg = ORG_WORD.test(role), secondIsOrg = ORG_WORD.test(org);
      if ((secondIsRole && !firstIsRole) || (firstIsOrg && !secondIsOrg && secondIsRole)) {
        const t = role; role = org; org = t;
      }
      out.role = role;
      out.org = org;
    }
    return out;
  }

  // ───────────────────────── the parser ─────────────────────────

  /** Build a library from parsed paragraphs of one or more documents. */
  function parseResume(paras, opts) {
    opts = opts || {};
    const lib = {
      profile: { name: "", credential: "", contact: [], links: [] },
      summary: "",
      skills: [],
      positions: [],
      projects: [],
      education: [],
      pages: 1,
      _notes: [],
    };

    // ── header block: name, contact, links (before the first section heading) ──
    let firstSection = paras.findIndex((p) => sectionOf(p.text));
    if (firstSection === -1) firstSection = Math.min(paras.length, 8);
    const head = paras.slice(0, firstSection);

    const contact = new Set();
    head.forEach((p) => {
      const t = p.text;
      const em = t.match(EMAIL); if (em) contact.add(em[0]);
      const ph = t.match(PHONE); if (ph) contact.add(ph[0].trim());
      const loc = t.match(/\b([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})\b(?!\w)/);
      if (loc && !EMAIL.test(loc[0])) contact.add(loc[0]);
      // URLs found in text, plus any hyperlink targets Word stored separately.
      const found = [];
      let um;
      const ure = new RegExp(URL_RE.source, "gi");
      while ((um = ure.exec(t)) !== null) found.push(um[0]);
      (p.urls || []).forEach((u) => found.push(u));
      found.forEach((raw) => {
        const url = raw.replace(/[.,)]+$/, "");
        if (EMAIL.test(url)) return;
        const full = /^https?:/i.test(url) ? url : "https://" + url;
        const label = linkLabel(full);
        if (!label) return;                                  // malformed, e.g. "github.io/Portfolio"
        // One link per label, and prefer the longer (more specific) URL.
        const existing = lib.profile.links.find((l) => l.label === label);
        if (!existing) lib.profile.links.push({ label, url: full });
        else if (full.length > existing.url.length) existing.url = full;
      });
    });
    lib.profile.contact = [...contact];

    /* Name: normally its own line. Compact layouts put it inline
       ("ALEX MORGAN · Austin, TX · (555) 201-3344"), so a line carrying contact
       details is still worth inspecting — just look only at its first segment. */
    for (const p of head) {
      let t = p.text.replace(/\s{2,}/g, " ").trim();
      if (!t) continue;
      if (EMAIL.test(t) || PHONE.test(t) || URL_RE.test(t)) {
        const first = t.split(/\s*[·•|,]\s*/)[0].trim();
        const words = first.split(/\s+/);
        const nameish = first && words.length >= 2 && words.length <= 5 &&
          !/\d/.test(first) && !EMAIL.test(first) && !PHONE.test(first) && !URL_RE.test(first);
        if (!nameish) continue;
        t = first;
      }
      if (t.split(/\s+/).length > 6) continue;
      const cm = t.match(/^(.+?),\s*(Ph\.?D\.?|M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|B\.?S\.?|M\.?Eng\.?)$/i);
      if (cm) { lib.profile.name = cm[1].trim(); lib.profile.credential = cm[2].trim(); }
      else lib.profile.name = t;
      break;
    }

    // ── walk the sections ──
    let cur = null;
    let pending = null;          // position being built
    let pendingProject = null;   // project whose title we've seen, awaiting its description
    const summaryParts = [];

    const pushPending = () => {
      if (pending && (pending.bullets.length || pending.role)) lib.positions.push(pending);
      pending = null;
    };

    for (let i = firstSection; i < paras.length; i++) {
      const p = paras[i];
      const sec = sectionOf(p.text);
      if (sec) { pushPending(); pendingProject = null; cur = sec; continue; }
      if (!cur) continue;

      if (cur === "summary") { summaryParts.push(p.text); continue; }

      if (cur === "skills") {
        const t = p.text;
        const cm = t.match(/^([^:]{2,42}):\s*(.+)$/);
        if (cm) lib.skills.push({ name: cm[1].trim(), items: cm[2].trim() });
        else if (bulletish(p)) {
          const s = stripMarker(t);
          const c2 = s.match(/^([^:]{2,42}):\s*(.+)$/);
          if (c2) lib.skills.push({ name: c2[1].trim(), items: c2[2].trim() });
          else lib.skills.push({ name: "Skills", items: s });
        } else if (t.includes(",")) {
          lib.skills.push({ name: "Skills", items: t });
        }
        continue;
      }

      if (cur === "education") {
        if (bulletish(p)) {
          const last = lib.education[lib.education.length - 1];
          if (last) (last.details = last.details || []).push(stripMarker(p.text));
          continue;
        }
        const h = parseHeader(p.text);
        if (h.role) {
          const degree = [h.role, h.org].filter(Boolean).join(" — ");
          if (looksLikeDegree(degree)) lib.education.push({ degree, dates: h.dates, details: [] });
        }
        continue;
      }

      if (cur === "projects") {
        // A project is a short title line followed by one or more description lines.
        // Emitting those separately produces an orphan bullet that is just a name,
        // so a title opens a pending project and following lines fold into it.
        const short = p.text.length <= 60 && !bulletish(p) && !/[.;]$/.test(p.text);
        if (short) {
          pendingProject = { title: p.text, body: [] };
          lib.projects.push(pendingProject);
          continue;
        }
        const line = bulletish(p) ? stripMarker(p.text) : p.text;
        if (pendingProject) pendingProject.body.push(line);
        else lib.projects.push({ title: "", body: [line] });
        continue;
      }

      if (cur === "experience") {
        if (bulletish(p)) {
          if (!pending) pending = { theme: "", role: "", org: "", location: "", dates: "", bullets: [] };
          pending.bullets.push({ text: stripMarker(p.text) });
          continue;
        }
        // Administrative lines are neither a header nor an achievement — drop them.
        if (ADMIN_LINE.test(p.text)) continue;

        // Not a bullet: either a new position header, or a subtitle for the current one.
        const h = parseHeader(p.text);
        const looksHeader = !!h.dates || isHeading(p.text) || DATE_RANGE.test(p.text);
        if (looksHeader && (!pending || pending.bullets.length)) {
          pushPending();
          pending = Object.assign({ theme: "", bullets: [] }, h);
        } else if (pending && !pending.bullets.length && p.text.length < 140) {
          // A second non-bullet line right after the header is a subtitle:
          // "Role — Organization — Location". Promote line 1 to the display heading
          // and let the subtitle supply the real role, org and location.
          const h2 = parseHeader(p.text);
          const sepCount = (p.text.match(/\s[—–|]\s/g) || []).length;
          // Only promote the header line to a display theme when the subtitle actually
          // supplies an employer. Otherwise a bare location line like "Austin, TX"
          // overwrites the employer the header already gave us.
          if (!pending.location && LOCATION_ONLY.test(p.text)) {
            pending.location = p.text;                        // "Austin, TX" / "Remote"
          } else if (h2.org && (sepCount >= 1 || h2.role)) {
            if (!pending.theme) pending.theme = [pending.role, pending.org].filter(Boolean).join(", ");
            pending.role = h2.role || "";
            pending.org = h2.org || "";
            pending.location = h2.location || "";
            if (h2.dates && !pending.dates) pending.dates = h2.dates;
          } else if (!pending.org) {
            pending.org = p.text;
          }
        } else if (p.text.length > 60) {
          if (!pending) pending = { theme: "", role: "", org: "", location: "", dates: "", bullets: [] };
          pending.bullets.push({ text: p.text });
        }
        continue;
      }

      // publications / awards → keep as projects so nothing is silently dropped
      if (cur === "publications" || cur === "awards") {
        const t = bulletish(p) ? stripMarker(p.text) : p.text;
        if (t.length > 12) lib.projects.push({ text: t });
      }
    }
    pushPending();

    lib.summary = summaryParts.join(" ").replace(/\s+/g, " ").trim();

    // Flatten projects to "**Title** — description", the shape the renderer expects.
    lib.projects = lib.projects.map((pr) => {
      if (typeof pr.text === "string") return pr;
      const body = (pr.body || []).join(" ").replace(/\s+/g, " ").trim();
      if (!pr.title) return { text: body };
      return { text: body ? "**" + pr.title + "** — " + body : "**" + pr.title + "**" };
    }).filter((pr) => (pr.text || "").trim());

    // A cover letter is addressed TO an employer, so its header block is the
    // employer's address, not yours. Keep only the prose; discard the structure.
    if (opts.kind === "letter") {
      const body = paras.filter((p) => p.text.length > 80).map((p) => p.text);
      return {
        profile: { name: lib.profile.name, credential: "", contact: [], links: [] },
        summary: "", skills: [], positions: [], projects: [], education: [], pages: 1,
        _letter: body.join("\n\n"),
      };
    }

    return lib;
  }

  /* Identity helpers for de-duplication.
     People upload several versions of the same resume, so the same employer and
     the same bullet arrive repeatedly with small wording differences. */

  const STOPORG = /\b(inc|llc|ltd|corp|corporation|company|co|group|the|of|and)\b/g;

  /** A stable key for an employer: drop location tails, suffixes and punctuation. */
  function orgKey(org) {
    return String(org || "")
      .split(",")[0]                                  // "Nauru Agreement, Majuro, MH" -> "Nauru Agreement"
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(STOPORG, " ")
      .split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  }

  /** A stable key for a bullet: first eight significant words. */
  function bulletKey(text) {
    return String(text || "").toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/).filter((w) => w.length > 2).slice(0, 8).join(" ");
  }

  /** Every significant word, for containment comparison. */
  function wordSet(text) {
    return new Set(String(text || "").toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/).filter((w) => w.length > 3));
  }

  /* True when one text substantially contains the other. A first-N-words key
     cannot catch "X description" against "**Title** - X description", which is
     exactly what happens when the same project arrives from two resumes that
     format it differently. */
  function nearDuplicate(a, b) {
    const A = wordSet(a), B = wordSet(b);
    if (A.size < 4 || B.size < 4) return false;
    const [small, large] = A.size <= B.size ? [A, B] : [B, A];
    let shared = 0;
    small.forEach((w) => { if (large.has(w)) shared++; });
    return shared / small.size >= 0.8;
  }

  /** Collapse near-duplicates in a list, keeping the fullest version of each. */
  function dedupeTexts(items, get) {
    const out = [];
    items.forEach((item) => {
      const text = get(item);
      const i = out.findIndex((o) => nearDuplicate(get(o), text));
      if (i === -1) { out.push(item); return; }
      if (text.length > get(out[i]).length) out[i] = item;
    });
    return out;
  }

  /** Clean duplicates that already accumulated in a stored library. */
  function dedupeLibrary(lib) {
    if (!lib) return lib;
    lib.projects = dedupeTexts(lib.projects || [], (p) => p.text || "");
    (lib.positions || []).forEach((pos) => {
      pos.bullets = dedupeTexts(pos.bullets || [], (b) => b.text || "");
    });
    // Then across positions — the same achievement often lands under two employers.
    const seen = [];
    (lib.positions || []).forEach((pos) => {
      pos.bullets = (pos.bullets || []).filter((b) => {
        if (seen.some((t) => nearDuplicate(t, b.text))) return false;
        seen.push(b.text);
        return true;
      });
    });
    lib.projects = (lib.projects || []).filter((p) => !seen.some((t) => nearDuplicate(t, p.text)));
    lib.education = dedupeTexts(lib.education || [], (e) => e.degree || "");
    return lib;
  }

  /* Which side of "A — B" is the employer? Job titles are a small, stable
     vocabulary; company names are not. So detect the title and infer the rest.
     Covers "Brightline Logistics — Data Analyst" as well as the reverse. */
  const ROLE_WORD = /\b(analyst|engineer|scientist|developer|manager|director|intern|internship|associate|assistant|specialist|consultant|coordinator|lead|architect|administrator|technician|instructor|faculty|professor|lecturer|researcher|fellow|officer|supervisor|clerk|designer|strategist|advisor|adviser|accountant|auditor|recruiter|representative|agent|nurse|therapist|paralegal|editor|writer|producer|buyer|planner|trainee|apprentice|volunteer|founder|owner|principal|partner|president|chief|head|vp|svp|evp)\b/i;
  const ORG_WORD = /\b(inc|llc|ltd|corp|corporation|company|co|group|university|college|school|academy|bank|labs?|laboratory|institute|foundation|systems|technologies|technology|solutions|services|partners|associates|holdings|industries|enterprises|investments|capital|ventures|agreement|hospital|clinic|health|medical|centre|center|department|ministry|agency|bureau|council|authority|district|society|association|studio)\b\.?/i;

  const DEGREE_WORD = /\b(m\.?s|m\.?a|m\.?b\.?a|b\.?s|b\.?a|ph\.?d|ed\.?d|j\.?d|m\.?eng|m\.?ed|master|bachelor|doctor|doctorate|associate|associate's|diploma|certificate)\b\.?/i;
  const SCHOOL_WORD = /\b(university|college|institute|school|academy|polytechnic|seminary)\b/i;

  /** A real degree line names a credential or an institution. Wrapped coursework
      fragments like "Multivariable Calculus" name neither. */
  function looksLikeDegree(text) {
    const t = String(text || "").trim();
    if (t.length < 8) return false;
    if (!DEGREE_WORD.test(t) && !SCHOOL_WORD.test(t)) return false;
    // "Coursework: ..." lines mention neither a credential nor a school, but guard anyway.
    if (/^(relevant\s+)?(coursework|courses|classes|curriculum)\b/i.test(t)) return false;
    return true;
  }

  /** Significant words, for comparing two spellings of the same thing. */
  function sigWords(text) {
    const DROP = new Set(["of", "the", "and", "in", "at", "for", "master", "bachelor",
      "science", "arts", "doctor", "doctorate", "degree"]);
    return new Set(String(text || "").toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !DROP.has(w)));
  }

  /** True when two degree strings describe the same credential.
      "M.S., Artificial Intelligence — Grand Canyon University" matches
      "Master of Science, Artificial Intelligence, Grand Canyon University — Phoenix, AZ". */
  function sameDegree(a, b) {
    const A = sigWords(a), B = sigWords(b);
    if (!A.size || !B.size) return false;
    let shared = 0;
    A.forEach((w) => { if (B.has(w)) shared++; });
    return shared / Math.min(A.size, B.size) >= 0.7;
  }

  function linkLabel(url) {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return null; }
    if (!host || !host.includes(".")) return null;              // reject "github.io/Portfolio"
    if (/(^|\.)github\.io$/.test(host)) return "Portfolio";     // personal pages, not GitHub itself
    if (/(^|\.)github\.com$/.test(host)) return "GitHub";
    if (/(^|\.)linkedin\.com$/.test(host)) return "LinkedIn";
    if (/(^|\.)orcid\.org$/.test(host)) return "ORCID";
    if (/scholar\.google\./.test(host)) return "Scholar";
    return "Portfolio";
  }

  /** Merge a freshly parsed library into an accumulating one. */
  function merge(into, add) {
    if (!into) return add;
    const o = into;
    ["name", "credential"].forEach((k) => { if (!o.profile[k] && add.profile[k]) o.profile[k] = add.profile[k]; });
    add.profile.contact.forEach((c) => { if (!o.profile.contact.includes(c)) o.profile.contact.push(c); });
    add.profile.links.forEach((l) => { if (!o.profile.links.some((x) => x.url === l.url)) o.profile.links.push(l); });
    if (!o.summary && add.summary) o.summary = add.summary;

    add.skills.forEach((g) => {
      const hit = o.skills.find((x) => x.name.toLowerCase() === g.name.toLowerCase());
      if (hit) {
        const have = new Set(hit.items.split(",").map((s) => s.trim().toLowerCase()));
        g.items.split(",").map((s) => s.trim()).forEach((it) => {
          if (it && !have.has(it.toLowerCase())) hit.items += ", " + it;
        });
      } else o.skills.push(g);
    });

    // Bullets are deduplicated across the WHOLE library, not just within a position,
    // because the same achievement is usually worded slightly differently per resume.
    const seen = new Set();
    const pool = [];
    o.positions.forEach((x) => x.bullets.forEach((b) => { seen.add(bulletKey(b.text)); pool.push(b.text); }));
    o.projects.forEach((x) => { seen.add(bulletKey(x.text)); pool.push(x.text); });

    add.positions.forEach((p) => {
      const key = orgKey(p.org) || orgKey(p.role);
      const hit = o.positions.find((x) => {
        const k = orgKey(x.org) || orgKey(x.role);
        if (k && key && k === key) return true;
        // Same employer written differently but the same tenure is still the same job.
        return !!(x.dates && p.dates && x.dates === p.dates && k && key && (k.includes(key) || key.includes(k)));
      });
      const target = hit || (() => { const n = Object.assign({}, p, { bullets: [] }); o.positions.push(n); return n; })();
      p.bullets.forEach((b) => {
        const bk = bulletKey(b.text);
        if (!bk || seen.has(bk)) return;
        if (pool.some((t) => nearDuplicate(t, b.text))) return;
        seen.add(bk); pool.push(b.text);
        target.bullets.push(b);
      });
      ["role", "org", "location", "dates", "theme"].forEach((k) => { if (!target[k] && p[k]) target[k] = p[k]; });
    });

    add.projects.forEach((pr) => {
      const bk = bulletKey(pr.text);
      if (!bk || seen.has(bk)) return;
      const i = o.projects.findIndex((x) => nearDuplicate(x.text, pr.text));
      if (i !== -1) {   // same project, keep the fuller wording
        if ((pr.text || "").length > (o.projects[i].text || "").length) o.projects[i] = pr;
        return;
      }
      if (pool.some((t) => nearDuplicate(t, pr.text))) return;
      seen.add(bk); pool.push(pr.text);
      o.projects.push(pr);
    });
    add.education.forEach((e) => {
      if (!looksLikeDegree(e.degree)) return;
      const hit = o.education.find((x) => sameDegree(x.degree, e.degree));
      if (!hit) { o.education.push(e); return; }
      // Same degree, two spellings. Keep the shorter, cleaner line and the better date.
      if (e.degree.length < hit.degree.length) hit.degree = e.degree;
      if (!hit.dates && e.dates) hit.dates = e.dates;
    });
    if (add._letter && !o._letter) o._letter = add._letter;
    return o;
  }

  /** Read and parse a list of files into one library, with per-file notes. */
  async function ingest(files) {
    let lib = null;
    const notes = [];
    for (const f of files) {
      try {
        const paras = await readFile(f);
        const kind = /cover|letter/i.test(f.name) ? "letter" : "resume";
        const parsed = parseResume(paras, { kind });
        const counts = {
          positions: parsed.positions.length,
          bullets: parsed.positions.reduce((n, p) => n + p.bullets.length, 0),
          skills: parsed.skills.length,
          education: parsed.education.length,
          projects: parsed.projects.length,
        };
        lib = merge(lib, parsed);
        notes.push({ file: f.name, ok: true, counts });
      } catch (err) {
        notes.push({ file: f.name, ok: false, error: err.message });
      }
    }
    if (lib) {
      delete lib._notes;
      // Unconditional: no ingest path may return a library containing duplicates.
      dedupeLibrary(lib);
      lib.notes = notes;
    }
    return { lib, notes };
  }

  global.Extract = { ingest, readFile, parseResume, merge, dedupeLibrary, nearDuplicate };
})(window);
