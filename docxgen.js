/* docxgen.js — builds a Word document in the browser from app state.
   Browser port of the Node builder: same page size, margins, fonts and spacing,
   so what you download here matches the desktop pipeline's output. */

(function (global) {
  "use strict";

  const {
    Document, Packer, Paragraph, TextRun, ExternalHyperlink,
    AlignmentType, TabStopType, BorderStyle, LevelFormat,
  } = global.docx;

  const PAGE = { width: 12240, height: 15840 };   // US Letter, in DXA (1440 = 1in)
  const MARGIN = 720;                              // 0.5in
  const TEXT_WIDTH = PAGE.width - MARGIN * 2;

  const FONT = "Times New Roman";
  // Half-points: 21 = 10.5pt. Times runs small, so body sits a touch above 10pt.
  const SIZE = { body: 20, name: 36, heading: 22, tagline: 21 };
const GREY = "5A5A5A";   // dates, per the reference layout

  // `**bold**`, `*italic*`, `[label](url)` -> runs
  function inline(text, base) {
    base = base || {};
    const out = [];
    const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(new TextRun(Object.assign({}, base, { text: text.slice(last, m.index) })));
      if (m[1] !== undefined) out.push(new TextRun(Object.assign({}, base, { text: m[1], bold: true })));
      else if (m[2] !== undefined) out.push(new TextRun(Object.assign({}, base, { text: m[2], italics: true })));
      else out.push(new ExternalHyperlink({
        link: m[4],
        children: [new TextRun(Object.assign({}, base, { text: m[3], style: "Hyperlink" }))],
      }));
      last = re.lastIndex;
    }
    if (last < text.length) out.push(new TextRun(Object.assign({}, base, { text: text.slice(last) })));
    return out.length ? out : [new TextRun(Object.assign({}, base, { text: "" }))];
  }

  const runOpts = { size: SIZE.body, font: FONT };

  function sectionHeading(text) {
    return new Paragraph({
      spacing: { before: 180, after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 2 } },
      children: [new TextRun({ text, bold: true, size: SIZE.heading, font: FONT })],
    });
  }

  // Bold label on the left, dates right-aligned on the same line.
  function headWithDates(label, dates) {
    const kids = inline(label, Object.assign({}, runOpts, { bold: true }));
    if (dates) {
      kids.push(new TextRun({ text: "\t", size: SIZE.body }));
      kids.push(new TextRun({ text: dates, size: SIZE.body, font: FONT, color: GREY }));
    }
    return new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
      spacing: { before: 110, after: 0 },
      children: kids,
    });
  }

  function subtitle(text) {
    return new Paragraph({
      spacing: { before: 0, after: 30 },
      children: inline(text, Object.assign({}, runOpts, { italics: true })),
    });
  }

  function bullet(text) {
    return new Paragraph({
      numbering: { reference: "tailor-bullets", level: 0 },
      spacing: { before: 0, after: 30, line: 240 },
      children: inline(text, runOpts),
    });
  }

  function header(state) {
    const p = [];
    const nameText = state.profile.credential
      ? state.profile.name + ", " + state.profile.credential
      : state.profile.name;

    p.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: nameText, bold: true, size: SIZE.name, font: FONT })],
    }));

    // Contact details and links share one centered line.
    const kids = [];
    const sep = () => new TextRun({ text: "  |  ", size: SIZE.body, font: FONT });
    (state.profile.contact || []).filter(Boolean).forEach((c) => {
      if (kids.length) kids.push(sep());
      kids.push(new TextRun({ text: c, size: SIZE.body, font: FONT }));
    });
    (state.profile.links || []).forEach((l) => {
      if (!l.url) return;
      if (kids.length) kids.push(sep());
      kids.push(new ExternalHyperlink({
        link: l.url,
        children: [new TextRun({ text: l.label || l.url, size: SIZE.body, font: FONT, style: "Hyperlink" })],
      }));
    });
    if (kids.length) {
      p.push(new Paragraph({ spacing: { after: 20 }, children: kids }));
    }
    if (state.profile.tagline) {
      p.push(new Paragraph({
        spacing: { after: 40 },
        children: inline(state.profile.tagline, { size: SIZE.tagline, font: FONT }),
      }));
    }
    return p;
  }

  /* Cover letter, following the reference layout in the CLI kit's
     example_cover_letter.pdf: sender block right-aligned, date right, "To" with an
     italic recipient block left, justified body, signature block. */
  function buildLetter(spec) {
    const kids = [];
    const right = (text, opts) => new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: (opts && opts.after) || 0 },
      children: inline(text, Object.assign({}, runOpts, opts || {})),
    });

    (spec.sender || []).forEach((line, i) => {
      kids.push(right(line, i === 0
        ? { bold: true, after: 0 }
        : { italics: true, after: i === spec.sender.length - 1 ? 260 : 0 }));
    });

    if (spec.date) kids.push(right(spec.date, { after: 200 }));

    kids.push(new Paragraph({
      spacing: { after: 0 },
      children: [new TextRun({ text: "To", bold: true, size: SIZE.body, font: FONT })],
    }));
    (spec.recipient || []).forEach((line, i) => {
      kids.push(new Paragraph({
        spacing: { after: i === spec.recipient.length - 1 ? 300 : 0 },
        children: inline(line, Object.assign({}, runOpts, { italics: true })),
      }));
    });

    if (spec.salutation) {
      kids.push(new Paragraph({ spacing: { after: 240 }, children: inline(spec.salutation, runOpts) }));
    }

    (spec.body || []).forEach((para) => {
      kids.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200, line: 260 },
        children: inline(para, runOpts),
      }));
    });

    if (spec.closing) kids.push(new Paragraph({ spacing: { before: 200, after: 0 }, children: inline(spec.closing, runOpts) }));
    if (spec.signature) kids.push(new Paragraph({ spacing: { after: 0 }, children: inline(spec.signature, runOpts) }));
    (spec.signatureExtra || []).forEach((l) => {
      kids.push(new Paragraph({ spacing: { after: 0 }, children: inline(l, runOpts) }));
    });

    return new Document({
      creator: spec.signature || "Tailor",
      title: (spec.signature || "Cover Letter") + " — Cover Letter",
      styles: { default: { document: { run: { font: FONT, size: SIZE.body } } } },
      sections: [{
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },   // 0.75in, letter convention
          },
        },
        children: kids,
      }],
    });
  }

  /** Build a Document from app state plus the set of chosen bullet keys. */
  function build(state, chosen) {
    const kids = header(state);

    if (state.summary && state.summary.trim()) {
      kids.push(sectionHeading("Summary"));
      kids.push(new Paragraph({
        spacing: { before: 30, after: 50, line: 240 },
        alignment: AlignmentType.JUSTIFIED,
        children: inline(state.summary, runOpts),
      }));
    }

    const skills = (state.skills || []).filter((g) => g.name && g.items);
    if (skills.length) {
      kids.push(sectionHeading("Technical Skills"));
      skills.forEach((g) => {
        if (g.name) {
          kids.push(new Paragraph({
            spacing: { before: 70, after: 20 },
            indent: { left: 120 },
            children: [new TextRun({ text: g.name, bold: true, size: SIZE.body, font: FONT })],
          }));
        }
        // Semicolons split a group into separate sub-lines, matching the reference layout.
        String(g.items || "").split(";").map((x) => x.trim()).filter(Boolean).forEach((line) => {
          kids.push(new Paragraph({
            spacing: { before: 0, after: 15, line: 240 },
            indent: { left: 300, hanging: 130 },
            children: [new TextRun({ text: "– ", size: SIZE.body, font: FONT })].concat(inline(line, runOpts)),
          }));
        });
      });
    }

    // Only positions with at least one selected bullet appear.
    const positions = (state.positions || [])
      .map((pos, pi) => ({
        pos,
        bullets: (pos.bullets || []).filter((_, bi) => chosen.has("p" + pi + "b" + bi)),
      }))
      .filter((x) => x.bullets.length);

    if (positions.length) {
      kids.push(sectionHeading("Experience"));
      positions.forEach(({ pos, bullets }) => {
        kids.push(headWithDates(pos.theme || pos.role || "", pos.dates));
        const sub = [pos.theme ? pos.role : "", pos.org, pos.location].filter(Boolean).join(" — ");
        if (sub) kids.push(subtitle(sub));
        bullets.forEach((b) => kids.push(bullet(b.text)));
      });
    }

    const projects = (state.projects || []).filter((_, i) => chosen.has("j" + i));
    if (projects.length) {
      kids.push(sectionHeading("Selected Projects"));
      projects.forEach((p) => kids.push(bullet(p.text)));
    }

    const edu = (state.education || []).filter((e) => e.degree);
    if (edu.length) {
      kids.push(sectionHeading("Education"));
      edu.forEach((e) => {
        kids.push(headWithDates(e.degree, e.dates));
        (e.details || []).filter(Boolean).forEach((d) => kids.push(bullet(d)));
      });
    }

    return new Document({
      creator: state.profile.name || "Tailor",
      title: (state.profile.name || "Resume") + " — Resume",
      numbering: {
        config: [{
          reference: "tailor-bullets",
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: "·",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 200, hanging: 160 } } },
          }],
        }],
      },
      styles: { default: { document: { run: { font: FONT, size: SIZE.body } } } },
      sections: [{
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        children: kids,
      }],
    });
  }

  /** Build and trigger a download. Pass a letter spec to download that instead. */
  async function download(state, chosen, letterSpec) {
    const doc = letterSpec ? buildLetter(letterSpec) : build(state, chosen);
    const blob = await Packer.toBlob(doc);
    const safe = ((letterSpec && letterSpec.signature) || state.profile.name || "Resume")
      .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = safe + (letterSpec ? "_Cover_Letter.docx" : "_Resume.docx");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  global.DocxGen = { build, buildLetter, download, inline };
})(window);
