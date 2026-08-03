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
      const rRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*>/g;
      let r;
      while ((r = rRe.exec(relXml)) !== null) {
        if (/hyperlink/i.test(rRe.lastIndex ? relXml.slice(r.index, rRe.lastIndex) : "")) rels[r[1]] = r[2];
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
      const tRe = /<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
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

  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
  const PHONE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  const URL = /\b(?:https?:\/\/|www\.)[^\s|,)]+|\b[\w-]+\.(?:com|org|net|io|dev|me|ai|co)\/[^\s|,)]+/i;

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

    // Split on strong separators only. Commas are handled after, and cautiously —
    // headings like "Portfolio Monitoring, Risk Screening & AI Tooling" must survive intact.
    let parts = s.split(/\s*[|—–]\s*|\s{2,}|\s+at\s+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length === 1 && (s.match(/,/g) || []).length === 1) {
      const [left, right] = s.split(",").map((x) => x.trim());
      // "Data Analyst, Acme Corp" splits. "Portfolio Monitoring, Risk Screening & AI Tooling"
      // must not — an "&" or "and" on the right means the comma joins a phrase, not an employer.
      const orgish = /\b(inc|llc|ltd|corp|corporation|company|co|group|university|college|school|bank|labs?|institute|foundation|systems|technologies|partners)\b\.?$/i.test(right);
      const listish = /\s(&|and)\s/.test(right);
      if (left && right && !listish && (orgish || (left.split(/\s+/).length <= 4 && right.split(/\s+/).length <= 3))) {
        parts = [left, right];
      }
    }
    if (parts.length === 1) out.role = parts[0];
    else if (parts.length >= 2) {
      out.role = parts[0];
      out.org = parts[1];
      // Trailing "City, ST" is a location, not part of the org.
      const last = parts[parts.length - 1];
      if (parts.length > 2 && /^[A-Za-z .'-]+,?\s*[A-Z]{2}$|remote/i.test(last)) {
        out.location = last;
        if (parts.length > 3) out.org = parts.slice(1, -1).join(", ");
      } else if (parts.length > 2) {
        out.org = parts.slice(1).join(", ");
      }
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
      const ure = new RegExp(URL.source, "gi");
      while ((um = ure.exec(t)) !== null) found.push(um[0]);
      (p.urls || []).forEach((u) => found.push(u));
      found.forEach((raw) => {
        const url = raw.replace(/[.,)]+$/, "");
        if (EMAIL.test(url)) return;
        const full = /^https?:/i.test(url) ? url : "https://" + url;
        let label = "Link";
        if (/linkedin/i.test(url)) label = "LinkedIn";
        else if (/github/i.test(url)) label = "GitHub";
        else if (/scholar\.google/i.test(url)) label = "Scholar";
        else if (/orcid/i.test(url)) label = "ORCID";
        else label = "Portfolio";
        if (!lib.profile.links.some((l) => l.url === full)) lib.profile.links.push({ label, url: full });
      });
    });
    lib.profile.contact = [...contact];

    // Name: the first line that looks like a person, not contact details.
    for (const p of head) {
      const t = p.text.replace(/\s{2,}/g, " ").trim();
      if (!t || EMAIL.test(t) || PHONE.test(t) || URL.test(t)) continue;
      if (t.split(/\s+/).length > 6) continue;
      const cm = t.match(/^(.+?),\s*(Ph\.?D\.?|M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|B\.?S\.?|M\.?Eng\.?)$/i);
      if (cm) { lib.profile.name = cm[1].trim(); lib.profile.credential = cm[2].trim(); }
      else lib.profile.name = t;
      break;
    }

    // ── walk the sections ──
    let cur = null;
    let pending = null;          // position being built
    const summaryParts = [];

    const pushPending = () => {
      if (pending && (pending.bullets.length || pending.role)) lib.positions.push(pending);
      pending = null;
    };

    for (let i = firstSection; i < paras.length; i++) {
      const p = paras[i];
      const sec = sectionOf(p.text);
      if (sec) { pushPending(); cur = sec; continue; }
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
          lib.education.push({ degree, dates: h.dates, details: [] });
        }
        continue;
      }

      if (cur === "projects") {
        if (bulletish(p)) { lib.projects.push({ text: stripMarker(p.text) }); continue; }
        if (p.text.length > 40) lib.projects.push({ text: p.text });
        else if (p.text) lib.projects.push({ text: "**" + p.text + "**" });
        continue;
      }

      if (cur === "experience") {
        if (bulletish(p)) {
          if (!pending) pending = { theme: "", role: "", org: "", location: "", dates: "", bullets: [] };
          pending.bullets.push({ text: stripMarker(p.text) });
          continue;
        }
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
          if (sepCount >= 1 || h2.org) {
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

    // A cover letter has no sections — treat its prose as summary raw material.
    if (opts.kind === "letter" && !lib.summary) {
      const body = paras.filter((p) => p.text.length > 80).map((p) => p.text);
      if (body.length) lib._letter = body.join("\n\n");
    }

    return lib;
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

    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    add.positions.forEach((p) => {
      const hit = o.positions.find((x) => norm(x.org) && norm(x.org) === norm(p.org));
      if (hit) {
        const have = new Set(hit.bullets.map((b) => norm(b.text).slice(0, 60)));
        p.bullets.forEach((b) => { if (!have.has(norm(b.text).slice(0, 60))) hit.bullets.push(b); });
        ["role", "location", "dates"].forEach((k) => { if (!hit[k] && p[k]) hit[k] = p[k]; });
      } else o.positions.push(p);
    });

    add.projects.forEach((pr) => {
      if (!o.projects.some((x) => norm(x.text).slice(0, 60) === norm(pr.text).slice(0, 60))) o.projects.push(pr);
    });
    add.education.forEach((e) => {
      if (!o.education.some((x) => norm(x.degree) === norm(e.degree))) o.education.push(e);
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
    if (lib) { delete lib._notes; lib.notes = notes; }
    return { lib, notes };
  }

  global.Extract = { ingest, readFile, parseResume, merge };
})(window);
