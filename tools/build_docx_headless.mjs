#!/usr/bin/env node
/* Build a .docx from a spec using the real docxgen.js, outside the browser.
 *
 * Same `vm` shim approach as parse_corpus.mjs: docxgen only needs the vendored
 * docx library plus Blob, so this exercises the shipped writer rather than a
 * reimplementation of it.
 *
 * Usage:
 *   node tools/build_docx_headless.mjs --spec fixtures/specs/onepage.json --out .tmp/out.docx
 *   node tools/build_docx_headless.mjs --sample --out .tmp/out.docx   # use data/sample.json
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : dflt;
};

const OUT = arg("--out", path.join(ROOT, ".tmp", "out.docx"));
const useSample = process.argv.includes("--sample");
const SPEC = arg("--spec", useSample ? path.join(ROOT, "data", "sample.json") : null);
if (!SPEC) {
  console.error("Usage: node tools/build_docx_headless.mjs (--spec file.json | --sample) [--out out.docx]");
  process.exit(1);
}

const ctx = { console, TextDecoder, TextEncoder, URL, setTimeout, clearTimeout, Blob, File,
              atob, btoa, crypto };
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.document = { createElement: () => ({ click() {}, remove() {}, style: {} }), body: { appendChild() {}, removeChild() {} } };
vm.createContext(ctx);
for (const f of ["vendor/docx.iife.js", "docxgen.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
}
if (!ctx.DocxGen) throw new Error("docxgen.js did not define window.DocxGen");

const state = JSON.parse(fs.readFileSync(SPEC, "utf8"));

// Include every bullet and project unless the spec names a selection.
const chosen = new Set(state._chosen || (() => {
  const keys = [];
  (state.positions || []).forEach((p, pi) =>
    (p.bullets || []).forEach((b, bi) => { if ((b.text || "").trim()) keys.push(`p${pi}b${bi}`); }));
  (state.projects || []).forEach((p, i) => { if ((p.text || "").trim()) keys.push(`j${i}`); });
  return keys;
})());

const doc = ctx.DocxGen.build(state, chosen);
const blob = await ctx.docx.Packer.toBlob(doc);
const buf = Buffer.from(await blob.arrayBuffer());

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log(`built ${OUT} (${buf.length.toLocaleString()} bytes, ${chosen.size} items)`);
