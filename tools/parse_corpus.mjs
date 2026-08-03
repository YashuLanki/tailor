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
      bulletTexts: (p.bullets || []).map((b) => b.text),
    })),
    education: (lib.education || []).map((e) => ({ degree: e.degree, dates: e.dates || "" })),
    projects: (lib.projects || []).length,
    projectTexts: (lib.projects || []).map((p) => p.text),
  };
}

const ctx = loadExtract();

if (!fs.existsSync(FIXTURES)) {
  console.error(`No fixtures at ${FIXTURES}. Run: python3 tools/make_fixtures.py`);
  process.exit(2);
}

const all = fs.readdirSync(FIXTURES).filter((f) => /\.(docx|txt|md)$/i.test(f)).sort();
const skipped = fs.readdirSync(FIXTURES).filter((f) => /\.pdf$/i.test(f));

/* Files named "NN_case__a" and "NN_case__b" are ingested TOGETHER as one case.
   That is how most people actually use this — an old resume plus a newer one — so
   deduplication across documents needs a fixture, not just a unit test. */
const groups = new Map();
for (const name of all) {
  const stem = path.parse(name).name;
  const key = stem.includes("__") ? stem.split("__")[0] : stem;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(name);
}

const report = { generated: null, cases: {}, skipped };

for (const [key, names] of groups) {
  const files = names.map((n) => new ctx.File([fs.readFileSync(path.join(FIXTURES, n))], n));
  try {
    const { lib, notes } = await ctx.Extract.ingest(files);
    report.cases[key] = { ok: true, notes, parsed: summarize(lib), files: names };
    const p = report.cases[key].parsed;
    console.log(`  ${key}${names.length > 1 ? ` (${names.length} files)` : ""}: ` +
      `${p.positions.length} positions, ${p.positions.reduce((n, x) => n + x.bullets, 0)} bullets, ` +
      `${p.education.length} degrees, ${p.projects} projects`);
  } catch (err) {
    report.cases[key] = { ok: false, error: err.message };
    console.error(`  ${key}: FAILED — ${err.message}`);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\n${groups.size} case(s) parsed${skipped.length ? `, ${skipped.length} pdf skipped` : ""} -> ${OUT}`);
