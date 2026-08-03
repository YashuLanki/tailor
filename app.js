/* app.js — state, JD matching, budget audit, live preview.
   No network calls. State persists to localStorage only. */

(function () {
  "use strict";

  const KEY = "tailor.v1";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ── length budgets, mirroring the desktop pipeline ──
  const BUDGET = {
    bullet: { l1: [105, 122], l2: [195, 230] },
    summary: { 1: [290, 400], 2: [480, 560] },
    skillLine: 115,
    theme: 62,
  };

  /** Visible length: strip the **bold**, *italic* and [label](url) markers. */
  function plain(t) {
    return String(t || "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .trim();
  }
  const len = (t) => plain(t).length;

  /** Grade a bullet: under one line, a clean two-liner, or overflowing. */
  function gradeBullet(t) {
    const n = len(t);
    if (!n) return { n, cls: "", label: "" };
    if (n <= BUDGET.bullet.l1[1]) return { n, cls: "ok", label: n + " · 1 line" };
    if (n < BUDGET.bullet.l2[0]) return { n, cls: "warn", label: n + " · thin 2nd line" };
    if (n <= BUDGET.bullet.l2[1]) return { n, cls: "ok", label: n + " · 2 lines" };
    return { n, cls: "bad", label: n + " · over" };
  }

  // ── state ──
  const blank = () => ({
    profile: { name: "", credential: "", contact: [], links: [] },
    summary: "",
    skills: [{ name: "", items: "" }],
    positions: [{ theme: "", role: "", org: "", location: "", dates: "", bullets: [{ text: "" }] }],
    projects: [],
    education: [{ degree: "", dates: "", details: [] }],
    pages: 1,
  });

  let state = blank();
  let chosen = new Set();      // keys of bullets/projects included in the resume
  let keywords = [];           // [{term, count}] from the JD

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ state, chosen: [...chosen] })); } catch (e) { /* quota */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      state = Object.assign(blank(), d.state);
      // Libraries stored before duplicate detection improved can carry repeats.
      if (window.Extract && window.Extract.dedupeLibrary) window.Extract.dedupeLibrary(state);
      chosen = new Set(d.chosen || []);
      return true;
    } catch (e) { return false; }
  }

  // ─────────────────────────── JD matching ───────────────────────────

  const STOP = new Set(("a an the and or but if then than that this these those of in on at to for with from by as is are was were be been being will would can could should may might must have has had do does did not no nor so such own same too very just about into over under again further once here there when where why how all any both each few more most other some only own s t don now you your yours we our ours they their them he she his her it its i me my mine us who whom which what while also across per within without upon via etc e g ie eg role team work working works job position candidate applicant company please apply application experience experienced years year including include includes included ability able strong excellent good great new using use used uses provide provides providing support supports supporting help helps helping ensure ensures ensuring related requirements required require requires preferred plus etc").split(/\s+/));

  /** Pull ranked terms out of the JD: single words plus common bigrams. */
  function extractKeywords(text) {
    const words = String(text).toLowerCase()
      .replace(/[^a-z0-9+#./\- ]+/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^[-./]+|[-./]+$/g, ""))
      .filter((w) => w.length > 1);

    const uni = new Map();
    words.forEach((w) => {
      if (STOP.has(w) || /^\d+$/.test(w) || w.length < 3) return;
      uni.set(w, (uni.get(w) || 0) + 1);
    });

    // Bigrams whose halves are both meaningful ("data science", "power bi")
    const bi = new Map();
    for (let i = 0; i < words.length - 1; i++) {
      const a = words[i], b = words[i + 1];
      if (STOP.has(a) || STOP.has(b) || a.length < 3 || b.length < 2) continue;
      const g = a + " " + b;
      bi.set(g, (bi.get(g) || 0) + 1);
    }

    const terms = [];
    bi.forEach((c, g) => { if (c >= 2) terms.push({ term: g, count: c, n: 2 }); });
    // Drop unigrams already covered by a kept bigram.
    const inBigram = new Set();
    terms.forEach((t) => t.term.split(" ").forEach((w) => inBigram.add(w)));
    uni.forEach((c, w) => { if (!inBigram.has(w) || c >= 4) terms.push({ term: w, count: c, n: 1 }); });

    return terms
      .sort((x, y) => (y.count * y.n) - (x.count * x.n) || y.count - x.count)
      .slice(0, 45);
  }

  /** All bullets and projects, flattened with a stable key and a source label. */
  function allItems() {
    const out = [];
    (state.positions || []).forEach((p, pi) => {
      (p.bullets || []).forEach((b, bi) => {
        if (!plain(b.text)) return;
        out.push({ key: "p" + pi + "b" + bi, text: b.text, src: p.org || p.role || p.theme || "Experience" });
      });
    });
    (state.projects || []).forEach((p, i) => {
      if (!plain(p.text)) return;
      out.push({ key: "j" + i, text: p.text, src: "Project" });
    });
    return out;
  }

  /** Score an item by which JD terms it contains, weighted by term frequency. */
  function scoreItem(text, terms) {
    const hay = " " + plain(text).toLowerCase().replace(/[^a-z0-9+#./ ]+/g, " ") + " ";
    let score = 0;
    const hits = [];
    terms.forEach((t) => {
      if (hay.indexOf(" " + t.term) !== -1 || hay.indexOf(t.term + " ") !== -1) {
        score += t.count * t.n;
        hits.push(t.term);
      }
    });
    return { score, hits };
  }

  const LINES_PER_PAGE = 48;
  const MAX_BULLETS_PER_POSITION = 4;

  /** Lines consumed by everything that isn't an experience bullet. */
  function fixedLines() {
    let n = 4;                                                    // header block
    if (plain(state.summary)) n += 2 + Math.ceil(len(state.summary) / 118);
    // Skills groups now render as a bold label plus one line per semicolon-separated
    // sub-line, so counting groups alone undercounts badly.
    const groups = (state.skills || []).filter((g) => g.name || g.items);
    if (groups.length) {
      n += 2;
      groups.forEach((g) => {
        n += g.name ? 1 : 0;
        n += String(g.items || "").split(";").filter((x) => x.trim()).length;
      });
    }
    if (plain(state.profile.tagline)) n += 1;
    const ed = (state.education || []).filter((e) => e.degree).length;
    if (ed) n += 2 + ed;
    return n;
  }

  /* Pick the highest-scoring bullets that actually fit the page, rather than
     selecting everything found. This is the editorial step: a resume is a
     selection, and a two-page dump of every bullet is not a tailored document. */
  function autoSelectToFit(scored) {
    chosen.clear();
    const budget = LINES_PER_PAGE * (state.pages || 1) - fixedLines();
    const perPosition = {};
    const posSeen = new Set();
    let used = 0;

    for (const s of scored) {
      if (s.score <= 0) continue;                                 // no relevance to this posting
      const posId = s.key.startsWith("p") ? s.key.split("b")[0] : "proj";
      if ((perPosition[posId] || 0) >= MAX_BULLETS_PER_POSITION) continue;

      const cost = len(s.text) > BUDGET.bullet.l1[1] ? 2 : 1;
      const heading = posSeen.has(posId) ? 0 : 2;                 // position title + subtitle
      if (used + cost + heading > budget) continue;

      chosen.add(s.key);
      perPosition[posId] = (perPosition[posId] || 0) + 1;
      posSeen.add(posId);
      used += cost + heading;
    }
  }

  function runMatch() {
    const jd = $("#f-jd").value.trim();
    if (!jd) { $("#match-note").textContent = "Paste a job description first."; return; }

    keywords = extractKeywords(jd);
    const items = allItems();
    if (!items.length) {
      $("#match-note").textContent = "Add some experience bullets in the Library tab first.";
      return;
    }

    const scored = items.map((it) => Object.assign({}, it, scoreItem(it.text, keywords)))
      .sort((a, b) => b.score - a.score);
    const max = scored[0].score || 1;

    autoSelectToFit(scored);

    $("#kw-cloud").innerHTML = keywords.slice(0, 30)
      .map((t) => '<span class="chip' + (t.count >= 3 ? " hot" : "") + '">' + esc(t.term) + " ·" + t.count + "</span>")
      .join("");
    $("#kw-card").hidden = false;

    $("#match-list").innerHTML = scored.map((s) => {
      const tier = s.score >= max * 0.6 ? "s3" : s.score >= max * 0.3 ? "s2" : s.score > 0 ? "s1" : "s0";
      return '<div class="match">' +
        '<input type="checkbox" data-key="' + s.key + '"' + (chosen.has(s.key) ? " checked" : "") + '>' +
        '<div class="body"><div class="src">' + esc(s.src) + "</div>" +
        '<div class="txt">' + highlight(s.text, s.hits) + "</div></div>" +
        '<span class="score ' + tier + '">' + s.score + "</span></div>";
    }).join("");
    $("#match-card").hidden = false;
    $("#match-card").open = true;

    // Terms the JD stresses that no bullet mentions.
    const covered = new Set();
    scored.forEach((s) => s.hits.forEach((h) => covered.add(h)));
    const gaps = keywords.filter((t) => !covered.has(t.term) && t.count >= 2).slice(0, 24);
    $("#gap-cloud").innerHTML = gaps.length
      ? gaps.map((t) => '<span class="chip gap">' + esc(t.term) + "</span>").join("")
      : '<span class="hint">Your bullets touch every frequent term in this posting.</span>';
    $("#gap-card").hidden = false;

    const n = scored.filter((s) => chosen.has(s.key)).length;
    $("#match-note").textContent = "";

    // The detail panels stay available but closed — the useful signal is "it worked,
    // go look at the result", not a wall of term frequencies.
    $("#kw-card").open = false;
    $("#gap-card").open = false;
    $("#match-card").open = false;

    const done = $("#done-banner");
    if (done) {
      done.hidden = false;
      done.innerHTML = '<strong>Done.</strong> Scored ' + scored.length + " bullets against this posting and " +
        "picked the " + n + " strongest that fit the page. " +
        '<button class="primary" data-goto="p-preview" type="button">Look at the preview →</button>';
    }
    save();
    render();
  }

  function highlight(text, hits) {
    let s = esc(plain(text));
    hits.slice().sort((a, b) => b.length - a.length).forEach((h) => {
      s = s.replace(new RegExp("(" + h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"), "<mark>$1</mark>");
    });
    return s;
  }

  // ─────────────────────────── Library UI ───────────────────────────

  function fieldRow(label, val, path, ph) {
    return '<label>' + label + '<input value="' + esc(val || "") + '" data-path="' + path +
      '" placeholder="' + esc(ph || "") + '"></label>';
  }

  function renderSkills() {
    $("#skills-list").innerHTML = (state.skills || []).map((g, i) => {
      const n = len((g.name ? g.name + ": " : "") + g.items);
      const cls = n > BUDGET.skillLine ? "bad" : n ? "ok" : "";
      return '<div class="item"><div class="item-head"><strong>Group ' + (i + 1) + "</strong>" +
        '<span class="bullet-meta ' + cls + '">' + (n ? n + "/" + BUDGET.skillLine : "") + "</span>" +
        '<button class="mini" data-del="skill:' + i + '" type="button">Remove</button></div>' +
        fieldRow("Label", g.name, "skills." + i + ".name", "Languages & Query") +
        '<label>Items <span class="hint">comma-separated</span>' +
        '<input value="' + esc(g.items || "") + '" data-path="skills.' + i + '.items" ' +
        'placeholder="**Python**, SQL, Excel"></label></div>';
    }).join("");
  }

  function renderPositions() {
    $("#positions-list").innerHTML = (state.positions || []).map((p, i) => {
      const tn = len(p.theme || p.role);
      return '<div class="item"><div class="item-head"><strong>Position ' + (i + 1) + "</strong>" +
        '<span class="bullet-meta ' + (tn > BUDGET.theme ? "bad" : "") + '">' +
        (tn ? "heading " + tn + "/" + BUDGET.theme : "") + "</span>" +
        '<button class="mini" data-del="position:' + i + '" type="button">Remove</button></div>' +
        '<div class="grid2">' +
        fieldRow("Heading <span class='hint'>the JD-facing theme</span>", p.theme, "positions." + i + ".theme", "Reporting Automation") +
        fieldRow("Dates", p.dates, "positions." + i + ".dates", "June 2024 – Present") +
        "</div><div class='grid2'>" +
        fieldRow("Job title", p.role, "positions." + i + ".role", "Data Analyst") +
        fieldRow("Organization", p.org, "positions." + i + ".org", "Company") +
        "</div>" +
        fieldRow("Location", p.location, "positions." + i + ".location", "Phoenix, AZ") +
        '<div class="bullets">' + (p.bullets || []).map((b, bi) => {
          const g = gradeBullet(b.text);
          return '<div class="bullet-row">' +
            '<textarea rows="2" data-path="positions.' + i + ".bullets." + bi + '.text" ' +
            'placeholder="Action, what you built, and the result.">' + esc(b.text || "") + "</textarea>" +
            '<span class="bullet-meta ' + g.cls + '">' + g.label + "</span>" +
            '<button class="mini" data-del="bullet:' + i + ":" + bi + '" type="button">×</button></div>';
        }).join("") + "</div>" +
        '<button class="add" data-add="bullet:' + i + '" type="button">+ Add bullet</button></div>';
    }).join("");
  }

  function renderProjects() {
    $("#projects-list").innerHTML = (state.projects || []).map((p, i) => {
      const g = gradeBullet(p.text);
      return '<div class="bullet-row">' +
        '<textarea rows="2" data-path="projects.' + i + '.text" ' +
        'placeholder="**Project name** (tools) — what it does.">' + esc(p.text || "") + "</textarea>" +
        '<span class="bullet-meta ' + g.cls + '">' + g.label + "</span>" +
        '<button class="mini" data-del="project:' + i + '" type="button">×</button></div>';
    }).join("");
  }

  function renderEducation() {
    $("#education-list").innerHTML = (state.education || []).map((e, i) =>
      '<div class="item"><div class="item-head"><strong>Degree ' + (i + 1) + "</strong>" +
      '<button class="mini" data-del="education:' + i + '" type="button">Remove</button></div><div class="grid2">' +
      fieldRow("Degree and school", e.degree, "education." + i + ".degree", "M.S., Statistics — State University") +
      fieldRow("Dates", e.dates, "education." + i + ".dates", "2022 – 2024") +
      "</div></div>").join("");
  }

  const LINK_FIELDS = {
    "l-portfolio": "Portfolio", "l-github": "GitHub",
    "l-linkedin": "LinkedIn", "l-other": "Link",
  };

  function renderLinks() {
    Object.keys(LINK_FIELDS).forEach((id) => {
      const hit = (state.profile.links || []).find((l) => l.label === LINK_FIELDS[id]);
      const el = $("#" + id);
      if (el) el.value = hit ? hit.url : "";
    });
  }

  function renderLibrary() {
    $("#f-name").value = state.profile.name || "";
    $("#f-cred").value = state.profile.credential || "";
    $("#f-contact").value = (state.profile.contact || []).join(", ");
    $("#f-summary").value = state.summary || "";
    $("#f-pages").value = String(state.pages || 1);
    renderLinks();
    renderSkills(); renderPositions(); renderProjects(); renderEducation();
    updateBadges();
  }

  function updateSummaryCount() {
    const n = len(state.summary);
    const [lo, hi] = BUDGET.summary[state.pages] || BUDGET.summary[1];
    const el = $("#sum-count");
    if (!el) return;
    el.textContent = n ? n : "0";
    el.title = "target " + lo + "–" + hi + " characters";
    el.className = "badge" + (!n ? "" : (n < lo || n > hi) ? " warn" : " on");
  }

  /** Keep the collapsed section headers honest about what's inside them. */
  function updateBadges() {
    const set = (id, txt, cls) => {
      const el = $("#" + id);
      if (!el) return;
      el.textContent = txt;
      el.className = "badge" + (cls ? " " + cls : "");
    };
    const bullets = (state.positions || []).reduce((n, p) =>
      n + (p.bullets || []).filter((b) => plain(b.text)).length, 0);
    const skills = (state.skills || []).filter((g) => g.name || g.items).length;
    const projects = (state.projects || []).filter((p) => plain(p.text)).length;
    const edu = (state.education || []).filter((e) => e.degree).length;
    const positions = (state.positions || []).filter((p) => p.role || p.org || p.theme).length;

    set("skills-badge", skills, skills ? "on" : "");
    set("pos-badge", positions + " · " + bullets + " bullets", positions ? "on" : "");
    set("proj-badge", projects, projects ? "on" : "");
    set("edu-badge", edu, edu ? "on" : "");

    const total = bullets + projects;
    set("lib-badge", total ? total + " bullets" : "empty", total ? "on" : "warn");
    set("sel-badge", chosen.size + " on", chosen.size ? "on" : "warn");
    updateSummaryCount();
  }

  // ─────────────────────────── preview + audit ───────────────────────────

  function md(t) {
    return esc(plain(String(t)))
      .replace(/&lt;/g, "&lt;");   // plain() already stripped markers; keep text literal
  }
  /** Render markers as HTML for the preview. */
  function mdHtml(t) {
    let s = esc(String(t || ""));
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
         .replace(/\*([^*]+)\*/g, "<em>$1</em>")
         .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return s;
  }

  function render() {
    const s = state, out = [];
    const nameLine = s.profile.credential ? s.profile.name + ", " + s.profile.credential : s.profile.name;
    out.push('<p class="r-name">' + esc(nameLine || "Your Name") + "</p>");

    const bits = (s.profile.contact || []).filter(Boolean).map(esc)
      .concat((s.profile.links || []).filter((l) => l.url)
        .map((l) => '<a href="' + esc(l.url) + '">' + esc(l.label || l.url) + "</a>"));
    if (bits.length) out.push('<p class="r-contact">' + bits.join(" | ") + "</p>");
    if (s.profile.tagline) out.push('<p class="r-tagline">' + mdHtml(s.profile.tagline) + "</p>");

    if (plain(s.summary)) {
      out.push("<h3>Summary</h3><p class='r-sum'>" + mdHtml(s.summary) + "</p>");
    }

    const skills = (s.skills || []).filter((g) => g.name || g.items);
    if (skills.length) {
      out.push("<h3>Technical Skills</h3>");
      skills.forEach((g) => {
        if (g.name) out.push('<p class="r-skillgroup">' + esc(g.name) + "</p>");
        String(g.items || "").split(";").map((x) => x.trim()).filter(Boolean).forEach((line) => {
          const over = len(line) > BUDGET.skillLine;
          out.push('<p class="r-skill' + (over ? " over" : "") + '">&ndash; ' + mdHtml(line) + "</p>");
        });
      });
    }

    const positions = (s.positions || []).map((p, pi) => ({
      p, bl: (p.bullets || []).filter((b, bi) => chosen.has("p" + pi + "b" + bi) && plain(b.text)),
    })).filter((x) => x.bl.length);

    if (positions.length) {
      out.push("<h3>Experience</h3>");
      positions.forEach(({ p, bl }) => {
        out.push('<p class="r-head"><span>' + mdHtml(p.theme || p.role) +
          '</span><span class="r-dates">' + esc(p.dates || "") + "</span></p>");
        const sub = [p.theme ? p.role : "", p.org, p.location].filter(Boolean).join(" — ");
        if (sub) out.push('<p class="r-sub">' + esc(sub) + "</p>");
        out.push("<ul>" + bl.map((b) => {
          const g = gradeBullet(b.text);
          return '<li class="' + (g.cls === "bad" ? "over" : "") + '">' + mdHtml(b.text) + "</li>";
        }).join("") + "</ul>");
      });
    }

    const projects = (s.projects || []).filter((p, i) => chosen.has("j" + i) && plain(p.text));
    if (projects.length) {
      out.push("<h3>Selected Projects</h3><ul>" +
        projects.map((p) => "<li>" + mdHtml(p.text) + "</li>").join("") + "</ul>");
    }

    const edu = (s.education || []).filter((e) => e.degree);
    if (edu.length) {
      out.push("<h3>Education</h3>");
      edu.forEach((e) => out.push('<p class="r-head"><span>' + mdHtml(e.degree) +
        '</span><span class="r-dates">' + esc(e.dates || "") + "</span></p>"));
    }

    $("#sheet").innerHTML = out.join("");
    renderAudit();
    updateBadges();
  }

  /* The old readout ("~57 lines, about 2 pages, 6 bullets past the 2-line limit")
     was internal bookkeeping leaking into the interface. Users get one plain fact;
     the detailed budgets stay available per-bullet in the Library. */
  function renderAudit() {
    const n = allItems().filter((i) => chosen.has(i.key)).length;
    const el = $("#audit");
    if (!el) return;
    el.innerHTML = n
      ? '<span class="a ok">' + n + " bullet" + (n === 1 ? "" : "s") + " on this resume</span>"
      : '<span class="a warn">No bullets selected yet — score a posting on step 2</span>';
  }


  // ─────────────────────────── document ingest ───────────────────────────

  function goto(panel) {
    $$(".tab").forEach((x) => x.classList.toggle("active", x.dataset.panel === panel));
    $$(".panel").forEach((x) => x.classList.toggle("active", x.id === panel));
    if (panel === "p-preview") render();
    window.scrollTo(0, 0);
  }

  function logIngest(notes, busy) {
    const box = $("#ingest-log");
    box.hidden = false;
    const rows = notes.map((n) => {
      if (!n.ok) {
        return '<div class="item"><div class="item-head"><strong>' + esc(n.file) + "</strong>" +
          '<span class="bullet-meta bad">could not read</span></div>' +
          '<p class="hint">' + esc(n.error) + "</p></div>";
      }
      const c = n.counts;
      const found = [
        c.positions + " position" + (c.positions === 1 ? "" : "s"),
        c.bullets + " bullet" + (c.bullets === 1 ? "" : "s"),
        c.skills + " skill group" + (c.skills === 1 ? "" : "s"),
        c.education + " degree" + (c.education === 1 ? "" : "s"),
        c.projects + " project" + (c.projects === 1 ? "" : "s"),
      ].join(" · ");
      const empty = !c.positions && !c.bullets && !c.skills && !c.education && !c.projects;
      return '<div class="item"><div class="item-head"><strong>' + esc(n.file) + "</strong>" +
        '<span class="bullet-meta ' + (empty ? "warn" : "ok") + '">' + (empty ? "no structure found" : "read") +
        "</span></div><p class=\"hint\">" + esc(found) +
        (empty ? " — if this is prose rather than a resume, its text was kept as summary material." : "") +
        "</p></div>";
    });
    if (busy) rows.push('<div class="item"><p class="hint">Reading…</p></div>');
    box.innerHTML = rows.join("");
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    logIngest([], true);

    const { lib, notes } = await window.Extract.ingest(files);
    logIngest(notes, false);

    if (lib) {
      // Merge so multiple drops accumulate — but never merge into the demo profile,
      // or a user who tried the sample first ends up with a mix of their data and Jordan's.
      const hasContent = !state._sample &&
        state.positions.some((p) => (p.bullets || []).some((b) => plain(b.text)));
      const base = hasContent ? state : null;
      const merged = base ? window.Extract.merge(base, lib) : Object.assign(blank(), lib);
      delete merged.notes;
      // Drop the empty scaffold rows the blank state starts with.
      merged.skills = (merged.skills || []).filter((g) => g.name || g.items);
      merged.positions = (merged.positions || []).filter((p) => p.role || p.org || (p.bullets || []).some((b) => plain(b.text)));
      merged.education = (merged.education || []).filter((e) => e.degree);
      if (!merged.skills.length) merged.skills = [{ name: "", items: "" }];
      if (!merged.positions.length) merged.positions = [{ theme: "", role: "", org: "", location: "", dates: "", bullets: [{ text: "" }] }];
      if (!merged.education.length) merged.education = [{ degree: "", dates: "", details: [] }];

      delete merged._sample;
      state = merged;
      // Deliberately select nothing. Scoring against a posting is what picks bullets;
      // pre-selecting everything produced a multi-page dump instead of a resume.
      chosen = new Set();
      save(); renderLibrary(); render();
      $("#review-card").open = true;

      updateBadges();
    }
  }

  /* Reading a posting from a URL.

     A browser can't read another site's page unless that site sends permissive
     CORS headers, and job boards don't. So: try direct first (works for a few),
     then fall back to a public reader service that fetches server-side and
     returns plain text. That service sees the URL — which is why pasting is
     offered as the fully-local alternative. */
  const READERS = [
    { name: "r.jina.ai", url: (u) => "https://r.jina.ai/" + u },
    { name: "corsproxy.io", url: (u) => "https://corsproxy.io/?" + encodeURIComponent(u) },
  ];

  function textFromHtml(body) {
    if (!/<[a-z][\s\S]*>/i.test(body)) return body;           // already plain text
    const doc = new DOMParser().parseFromString(body, "text/html");
    doc.querySelectorAll("script,style,noscript,nav,header,footer,svg").forEach((n) => n.remove());
    const main = doc.querySelector("main,[role=main],article") || doc.body;
    return (main.innerText || main.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  async function tryFetchJd() {
    let url = $("#f-jd-url").value.trim();
    const note = $("#fetch-note");
    if (!url) { note.textContent = "Paste the posting's URL first."; return; }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    const attempts = [{ name: "direct", url: (u) => u }].concat(READERS);
    for (const a of attempts) {
      note.textContent = "Reading the posting… (" + a.name + ")";
      try {
        const res = await fetch(a.url(url));
        if (!res.ok) throw new Error("HTTP " + res.status);
        const text = textFromHtml(await res.text());
        if (text.length < 300) throw new Error("returned almost no text");
        $("#f-jd").value = text;
        note.innerHTML = "Read " + text.length.toLocaleString() + " characters via <strong>" + esc(a.name) +
          "</strong>. Scoring now — check the text below if the results look off.";
        runMatch();
        return;
      } catch (err) { /* try the next route */ }
    }

    note.innerHTML = "<strong>Couldn't read that posting.</strong> Job boards block automated reads, and some " +
      "require a login. Open the posting, select all, and paste it into the box below — that always works.";
    $("#paste-card").open = true;
    $("#f-jd").focus();
  }

  // ─────────────────────────── wiring ───────────────────────────

  function setPath(path, val) {
    const parts = path.split(".");
    let o = state;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = val;
  }

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.path) { setPath(el.dataset.path, el.value); save(); render(); return; }

    switch (el.id) {
      case "f-name": state.profile.name = el.value; break;
      case "f-cred": state.profile.credential = el.value; break;
      case "f-contact":
        state.profile.contact = el.value.split(",").map((s) => s.trim()).filter(Boolean); break;
      case "f-summary": state.summary = el.value; updateSummaryCount(); break;
      default:
        if (LINK_FIELDS[el.id]) {
          const label = LINK_FIELDS[el.id];
          const url = el.value.trim();
          state.profile.links = (state.profile.links || []).filter((l) => l.label !== label);
          if (url) state.profile.links.push({ label, url: /^https?:/i.test(url) ? url : "https://" + url });
          break;
        }
        return;
    }
    save(); render();
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "f-pages") {
      state.pages = Number(e.target.value); updateSummaryCount(); save(); render(); return;
    }
    if (e.target.matches("input[type=checkbox][data-key]")) {
      const k = e.target.dataset.key;
      e.target.checked ? chosen.add(k) : chosen.delete(k);
      save(); render();
    }
  });

  document.addEventListener("click", (e) => {
    const t = e.target;

    if (t.classList.contains("tab")) return goto(t.dataset.panel);
    if (t.dataset.goto) return goto(t.dataset.goto);
    if (t.id === "btn-fetch") return tryFetchJd();

    if (t.closest("#drop") && !t.closest("input")) { $("#file-docs").click(); return; }

    if (t.id === "btn-reset") {
      if (!confirm("Clear your whole library from this browser? Back it up first if you want a copy.")) return;
      localStorage.removeItem(KEY);
      state = blank(); chosen = new Set();
      $("#ingest-log").hidden = true; $("#ingest-log").innerHTML = "";
      $("#f-jd").value = ""; $("#f-jd-url").value = "";
      ["kw-card", "match-card", "gap-card"].forEach((i) => { $("#" + i).hidden = true; });
      renderLibrary(); render(); goto("p-upload");
      return;
    }

    const add = t.dataset.add;
    if (add) {
      if (add === "skill") state.skills.push({ name: "", items: "" });
      else if (add === "position") state.positions.push({ theme: "", role: "", org: "", location: "", dates: "", bullets: [{ text: "" }] });
      else if (add === "project") state.projects.push({ text: "" });
      else if (add === "education") state.education.push({ degree: "", dates: "", details: [] });
      else if (add.startsWith("bullet:")) state.positions[+add.split(":")[1]].bullets.push({ text: "" });
      save(); renderLibrary(); render(); return;
    }

    const del = t.dataset.del;
    if (del) {
      const [kind, a, b] = del.split(":");
      if (kind === "skill") state.skills.splice(+a, 1);
      else if (kind === "position") state.positions.splice(+a, 1);
      else if (kind === "project") state.projects.splice(+a, 1);
      else if (kind === "education") state.education.splice(+a, 1);
      else if (kind === "bullet") state.positions[+a].bullets.splice(+b, 1);
      chosen.clear();                    // indices shifted; selection is no longer valid
      save(); renderLibrary(); render(); return;
    }

    if (t.id === "btn-match") return runMatch();
    if (t.id === "btn-print") return window.print();

    if (t.id === "btn-docx") {
      window.DocxGen.download(state, chosen).catch((err) => alert("Could not build the file: " + err.message));
      return;
    }

    if (t.id === "btn-sample") {
      fetch("data/sample.json").then((r) => r.json()).then((d) => {
        state = Object.assign(blank(), d);
        state._sample = true;         // dropping real files replaces this rather than merging
        // Fit to the page even without a posting, so the sample shows a real resume
        // rather than every bullet at once.
        autoSelectToFit(allItems().map((i) => Object.assign({ score: 1 }, i)));
        save(); renderLibrary(); render();
        goto("p-upload");
      }).catch(() => alert("Could not load the sample file."));
      return;
    }

    if (t.id === "btn-import") return $("#file-import").click();

    if (t.id === "btn-export-json") {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "tailor-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return;
    }
  });

  // ── file drop + picker ──
  $("#file-docs").addEventListener("change", (e) => { handleFiles(e.target.files); e.target.value = ""; });

  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add("over");
  }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove("over");
  }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer) handleFiles(e.dataTransfer.files); });
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file-docs").click(); }
  });

  $("#file-import").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        state = Object.assign(blank(), JSON.parse(fr.result));
        chosen = new Set(allItems().map((i) => i.key));
        save(); renderLibrary(); render();
      } catch (err) { alert("That file isn't valid JSON."); }
    };
    fr.readAsText(f);
    e.target.value = "";
  });

  // ── boot ──
  // First visit starts empty: the point is to drop your own documents in.
  load();
  renderLibrary();
  render();
})();
