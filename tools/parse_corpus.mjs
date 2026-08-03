#!/usr/bin/env node
/* Run the real extract.js against every built fixture and dump what it produced.
 *
 * Runs the browser module in a Node `vm` context with a minimal `window` shim
 * rather than launching a headless browser: the parser touches only TextDecoder,
 * File and fflate, so a shim is faster, has no browser dependency, and exercises
 * exactly the shipped code with no test double.
 *
 * PDF cases are skipped here — pdf.js is loaded by dynamic import of an ES module
 * and expects browser globals. Those cases need the browser runner.
 *
 * Usage: node tools/parse_corpus.mjs [--out .tmp/parse_report.json]
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, ".tmp", "fixtures");
const outArg = process.argv.indexOf("--out");
const OUT = outArg !== -1 ? process.argv[outArg + 1] : path.join(ROOT, ".tmp", "parse_report.json");

function loadExtract() {
  const ctx = { console, TextDecoder, TextEncoder, URL, URLSearchParams, setTimeout, File, Blob };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["vendor/fflate.js", "extract.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  if (!ctx.Extract) throw new Error("extract.js did not define window.Extract");
  return ctx;
}

/** Reduce a parsed library to the shape the scorer compares. */
function summarize(lib) {
  return {
    name: lib.profile.name || "",
    credential: lib.profile.credential || "",
    contact: lib.profile.contact || [],
    links: (lib.profile.links || []).map((l) => ({ label: l.label, url: l.url })),
    summaryChars: (lib.summary || "").length,
    skillGroups: (lib.skills || []).filter((g) => g.name || g.items).length,
    positions: (lib.positions || []).map((p) => ({
      theme: p.theme || "",
      role: p.role || "",
      org: p.org || "",
      location: p.location || "",
      dates: p.dates || "",
      bullets: (p.bullets || []).length,
    })),
    education: (lib.education || []).map((e) => ({ degree: e.degree, dates: e.dates || "" })),
    projects: (lib.projects || []).length,
  };
}

const ctx = loadExtract();

if (!fs.existsSync(FIXTURES)) {
  console.error(`No fixtures at ${FIXTURES}. Run: python3 tools/make_fixtures.py`);
  process.exit(2);
}

const files = fs.readdirSync(FIXTURES).filter((f) => /\.(docx|txt|md)$/i.test(f)).sort();
const skipped = fs.readdirSync(FIXTURES).filter((f) => /\.pdf$/i.test(f));

const report = { generated: null, cases: {}, skipped };

for (const name of files) {
  const buf = fs.readFileSync(path.join(FIXTURES, name));
  const file = new ctx.File([buf], name);
  try {
    const { lib, notes } = await ctx.Extract.ingest([file]);
    report.cases[path.parse(name).name] = { ok: true, notes, parsed: summarize(lib) };
    const p = report.cases[path.parse(name).name].parsed;
    console.log(`  ${name}: ${p.positions.length} positions, ` +
      `${p.positions.reduce((n, x) => n + x.bullets, 0)} bullets, ` +
      `${p.education.length} degrees, ${p.skillGroups} skill groups`);
  } catch (err) {
    report.cases[path.parse(name).name] = { ok: false, error: err.message };
    console.error(`  ${name}: FAILED — ${err.message}`);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\n${files.length} parsed${skipped.length ? `, ${skipped.length} pdf skipped` : ""} -> ${OUT}`);
