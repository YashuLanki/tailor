#!/usr/bin/env node
// Renders a resume/CV/cover-letter JSON spec to .docx
// Usage: node build_docx.js <spec.json> [-o out.docx]

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink,
  AlignmentType, TabStopType, BorderStyle, LevelFormat, convertInchesToTwip,
} = require("docx");

const PAGE = { width: 12240, height: 15840 };
const MARGIN = convertInchesToTwip(0.5);
const TEXT_WIDTH = PAGE.width - MARGIN * 2;

// Times New Roman per user preference. Sizes are in half-points (22 = 11pt).
// TNR has a smaller x-height than Calibri, so body runs 1pt larger to stay legible.
const FONT = { body: "Times New Roman", heading: "Times New Roman" };
const SIZE = {
  resume: { body: 21, name: 34, heading: 23, tagline: 20 },
  cv:     { body: 23, name: 36, heading: 25, tagline: 22 },
};

// `**bold**`, `*italic*`, and `[text](url)` -> TextRun / ExternalHyperlink array.
function inline(text, base = {}) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    if (m[1] !== undefined) out.push(new TextRun({ ...base, text: m[1], bold: true }));
    else if (m[2] !== undefined) out.push(new TextRun({ ...base, text: m[2], italics: true }));
    else out.push(new ExternalHyperlink({
      link: m[4],
      children: [new TextRun({ ...base, text: m[3], style: "Hyperlink" })],
    }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(new TextRun({ ...base, text: text.slice(last) }));
  return out;
}

function sectionHeading(text, sz) {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 2 } },
    children: [new TextRun({
      text: text.toUpperCase(), bold: true, size: sz.heading,
      font: FONT.heading, characterSpacing: 20,
    })],
  });
}

// Bold left label + right-aligned dates on one line.
function labelWithDates(label, dates, sz, opts = {}) {
  const children = inline(label, { size: sz.body, font: FONT.body, bold: opts.bold !== false });
  if (dates) {
    children.push(new TextRun({ text: "\t", size: sz.body }));
    children.push(new TextRun({ text: dates, size: sz.body, font: FONT.body, bold: opts.boldDates || false }));
  }
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
    spacing: { before: opts.before ?? 120, after: 0 },
    children,
  });
}

function subtitle(text, sz) {
  return new Paragraph({
    spacing: { before: 0, after: 40 },
    children: inline(text, { size: sz.body, font: FONT.body, italics: true }),
  });
}

function bullet(text, sz, level = 0) {
  return new Paragraph({
    numbering: { reference: "kit-bullets", level },
    spacing: { before: 0, after: 40, line: 240 },
    children: inline(text, { size: sz.body, font: FONT.body }),
  });
}

function buildHeader(header, sz) {
  const paras = [];
  const nameText = header.credential ? `${header.name}, ${header.credential}` : header.name;
  paras.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({
      text: nameText, bold: true, size: sz.name, font: FONT.heading, characterSpacing: 30,
    })],
  }));

  // Contact details and links share ONE centered line, separated by pipes.
  const sep = () => new TextRun({ text: "  |  ", size: sz.body, font: FONT.body });
  const kids = [];
  (header.contact || []).forEach((c) => {
    if (kids.length) kids.push(sep());
    kids.push(new TextRun({ text: c, size: sz.body, font: FONT.body }));
  });
  (header.links || []).forEach((l) => {
    if (kids.length) kids.push(sep());
    kids.push(new ExternalHyperlink({
      link: l.url,
      children: [new TextRun({ text: l.label, size: sz.body, font: FONT.body, style: "Hyperlink" })],
    }));
  });
  if (kids.length) {
    paras.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: kids,
    }));
  }

  if (header.tagline) {
    paras.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: inline(header.tagline, { size: sz.tagline, font: FONT.body, italics: true }),
    }));
  }
  return paras;
}

function buildSection(sec, sz) {
  const paras = [];
  if (sec.heading) paras.push(sectionHeading(sec.heading, sz));

  switch (sec.type) {
    case "summary":
      paras.push(new Paragraph({
        spacing: { before: 40, after: 60, line: 240 },
        alignment: AlignmentType.JUSTIFIED,
        children: inline(sec.text, { size: sz.body, font: FONT.body }),
      }));
      break;

    case "skills":
      (sec.groups || []).forEach((g) => {
        paras.push(new Paragraph({
          spacing: { before: 20, after: 20, line: 240 },
          indent: { left: 180, hanging: 180 },
          children: [
            new TextRun({ text: `${g.name}: `, bold: true, size: sz.body, font: FONT.body }),
            ...inline((g.items || []).join(", "), { size: sz.body, font: FONT.body }),
          ],
        }));
      });
      break;

    case "experience":
    case "projects":
      (sec.positions || []).forEach((p) => {
        paras.push(labelWithDates(p.theme || p.role, p.dates, sz));
        const sub = [p.role && p.theme ? p.role : null, p.org, p.location]
          .filter(Boolean).join(" — ");
        if (sub) paras.push(subtitle(sub, sz));
        (p.bullets || []).forEach((b) => paras.push(bullet(b, sz)));
      });
      break;

    case "education":
      (sec.entries || []).forEach((e) => {
        paras.push(labelWithDates(e.degree, e.dates, sz));
        const sub = [e.org, e.location].filter(Boolean).join(" — ");
        if (sub) paras.push(subtitle(sub, sz));
        (e.details || []).forEach((d) => paras.push(bullet(d, sz)));
      });
      break;

    case "list":
      (sec.items || []).forEach((i) => paras.push(bullet(i, sz)));
      break;

    case "text":
      (Array.isArray(sec.paragraphs) ? sec.paragraphs : [sec.text]).forEach((t) => {
        paras.push(new Paragraph({
          spacing: { before: 40, after: 80, line: 260 },
          children: inline(t, { size: sz.body, font: FONT.body }),
        }));
      });
      break;

    default:
      throw new Error(`Unknown section type: ${sec.type}`);
  }
  return paras;
}

// Cover letters are plain blocks: sender, date, recipient, salutation, body, closing.
function buildCoverLetter(spec, sz) {
  const paras = [];
  const push = (text, opts = {}) => paras.push(new Paragraph({
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120, line: 260 },
    alignment: opts.align,
    children: inline(text, { size: sz.body, font: FONT.body, bold: opts.bold }),
  }));

  (spec.sender || []).forEach((l, i) =>
    paras.push(new Paragraph({
      spacing: { after: i === spec.sender.length - 1 ? 200 : 0 },
      children: inline(l, { size: sz.body, font: FONT.body, bold: i === 0 }),
    })));

  if (spec.date) push(spec.date, { after: 200 });
  (spec.recipient || []).forEach((l, i) =>
    paras.push(new Paragraph({
      spacing: { after: i === spec.recipient.length - 1 ? 200 : 0 },
      children: inline(l, { size: sz.body, font: FONT.body }),
    })));

  if (spec.salutation) push(spec.salutation, { after: 160 });
  (spec.body || []).forEach((p) => push(p, { after: 160 }));
  if (spec.closing) push(spec.closing, { after: 60 });
  if (spec.signature) push(spec.signature, { bold: true });
  return paras;
}

function build(spec) {
  const format = spec.format === "cv" ? "cv" : "resume";
  const sz = SIZE[format];
  const children = spec.format === "cover_letter"
    ? buildCoverLetter(spec, SIZE.resume)
    : [...buildHeader(spec.header || {}, sz),
       ...(spec.sections || []).flatMap((s) => buildSection(s, sz))];

  return new Document({
    creator: (spec.header && spec.header.name) || "claude-resume-kit",
    title: spec.title || "Resume",
    numbering: {
      config: [{
        reference: "kit-bullets",
        levels: [0, 1].map((lvl) => ({
          level: lvl,
          format: LevelFormat.BULLET,
          text: lvl === 0 ? "•" : "◦",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 200 + lvl * 200, hanging: 160 } } },
        })),
      }],
    },
    styles: {
      default: { document: { run: { font: FONT.body, size: sz.body } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children,
    }],
  });
}

// Deliverables are .docx + .pdf. Render the PDF via LibreOffice unless --no-pdf.
function renderPdf(docxPath) {
  const { execFileSync } = require("child_process");
  const outDir = path.dirname(path.resolve(docxPath));
  const pdfPath = docxPath.replace(/\.docx$/, ".pdf");
  try {
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", outDir, docxPath],
      { stdio: "ignore" });
  } catch {
    console.error("  PDF skipped: 'soffice' (LibreOffice) not available or failed.");
    return null;
  }
  return fs.existsSync(pdfPath) ? pdfPath : null;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("Usage: node build_docx.js <spec.json> [-o out.docx] [--no-pdf]");
    process.exit(1);
  }
  const specPath = args[0];
  const oi = args.indexOf("-o");
  const outPath = oi !== -1 ? args[oi + 1] : specPath.replace(/\.json$/, "") + ".docx";

  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const doc = build(spec);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, await Packer.toBuffer(doc));
  console.log(`Wrote ${outPath}`);

  if (!args.includes("--no-pdf")) {
    const pdf = renderPdf(outPath);
    if (pdf) console.log(`Wrote ${pdf}`);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { build, inline };
