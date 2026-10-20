// SPDX-FileContributor: Arthit Suriyawongkul
// SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
// SPDX-FileType: SOURCE
// SPDX-License-Identifier: Apache-2.0
//
// UI smoke test for frontend/: serves it from a local HTTP server, mocks every
// /api/ route, visits every side-nav screen in headless Chromium and asserts:
//   - no page errors and no console errors;
//   - none of the old sample-data strings appear;
//   - the standard chips equal the mocked GET /api/v1/standards response
//     (same ids, same order, ready=false not selectable);
//   - refused requests (413, 422, 501) show the server's `detail` text;
//   - a per-rule BSI result shows its DOC and COMP clusters with their counts;
//   - G7 SBOM for AI is preselected on both check screens;
//   - a result with `sbom` has a Download SBOM button that saves `sbom.text`,
//     "Result" / "SBOM source" tabs, per-rule Show more / Show less details
//     with the mocked evidence, and "Show in SBOM" marks the evidence lines in
//     the highlighted source; a 50,000-line source stays windowed and any line
//     can be reached; a result without `sbom` has none of these.
// It writes one screenshot per state to the output directory.
//
// Needs Node 18+ and playwright-core in one node_modules directory (not
// committed). The page's scripts are vendored in frontend/vendor/, so no
// network is used; any request to another host (fonts excepted) is a failure.
//
// Usage:
//   LUMINA_SMOKE_NODE_MODULES=/path/to/node_modules \
//   LUMINA_SMOKE_CHROMIUM=/path/to/chromium \
//   node scripts/ui-smoke.mjs [output-dir]
// LUMINA_SMOKE_CHROMIUM may be left unset when playwright-core finds its own
// browser. The output directory defaults to <tmp>/lumina-ui-smoke.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "frontend");
const nm = process.env.LUMINA_SMOKE_NODE_MODULES;
if (!nm) {
  console.error("ERROR: set LUMINA_SMOKE_NODE_MODULES to a node_modules directory (see the header).");
  process.exit(2);
}
const require = createRequire(path.join(path.resolve(nm), "noop.js"));
const { chromium } = require("playwright-core");
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), "lumina-ui-smoke"));
fs.mkdirSync(outDir, { recursive: true });

// ── Mocked API ───────────────────────────────────────────────────────────
// The standard list includes an id the frontend has no label for: the UI
// must show it by id and must not hide or add any entry.
const STANDARDS = [
  { id: "ntia", ready: true }, { id: "bsi", ready: true }, { id: "g7ai", ready: true },
  { id: "cisa2026", ready: true }, { id: "fsct2024", ready: true }, { id: "mof", ready: false },
  { id: "xyz2030", ready: false },
];
// The checked SBOM as the API returns it (`sbom`), and evidence line ranges
// computed from its `display` the way the backend does (1-based, inclusive).
function sbomSource(obj, filename) {
  const display = JSON.stringify(obj, null, 2);
  return { filename, format: "spdx3-json", text: JSON.stringify(obj), display, line_count: display.split("\n").length };
}
const lineOf = (display, needle) => display.split("\n").findIndex(l => l.includes(needle)) + 1;
function blockOf(display, needle) {
  const lines = display.split("\n");
  const at = lineOf(display, needle) - 1;
  let start = at;
  while (start > 0 && !/^\s*\{$/.test(lines[start])) start -= 1;
  const indent = lines[start].match(/^\s*/)[0];
  let end = start + 1;
  while (end < lines.length && !new RegExp(`^${indent}\\},?$`).test(lines[end])) end += 1;
  return { line: start + 1, end_line: end + 1 };
}
const MOCK_SPDX = { "@context": "https://spdx.org/rdf/3.0.1/spdx-context.jsonld", "@graph": [
  { type: "CreationInfo", "@id": "_:CreationInfo0", specVersion: "3.0.1", created: "2026-01-01T00:00:00Z", createdBy: ["https://example.org/mock/tool"] },
  { type: "software_Package", spdxId: "https://example.org/mock/pkg", name: "mock-pkg", creationInfo: "_:CreationInfo0",
    software_packageVersion: "1.0", dataset_datasetSize: 1024, software_primaryPurpose: "library" },
] };
const SBOM = sbomSource(MOCK_SPDX, "r.spdx3.json");
const PKG_BLOCK = blockOf(SBOM.display, '"spdxId": "https://example.org/mock/pkg"');
const VERSION_LINE = lineOf(SBOM.display, '"software_packageVersion"');
const PKG_EVIDENCE = { element_id: "https://example.org/mock/pkg", element_type: "software_Package", element_name: "mock-pkg", ...PKG_BLOCK };
const NTIA_EVIDENCE = {
  "Component supplier": { evidence: [{ ...PKG_EVIDENCE, status: "absent", items: [] }], evidence_more: 3, applies_to: "component" },
  "Component version": { evidence: [{ ...PKG_EVIDENCE, status: "found",
    items: [{ key: "software_packageVersion", value: "1.0", line: VERSION_LINE }] }], evidence_more: 0, applies_to: "component" },
  // One judged element has the property and one lacks it: the rule is Missing.
  "Component identifier": { evidence: [{ ...PKG_EVIDENCE, status: "absent", items: [] },
    { ...PKG_EVIDENCE, element_name: "mock-model", element_type: "ai_AIPackage", status: "found",
      items: [{ key: "software_packageUrl", value: "pkg:generic/mock", line: VERSION_LINE }] }], evidence_more: 0, applies_to: "system" },
  "Dependency relationships": { evidence: [], evidence_more: 0, applies_to: "system", combine: "any-of" },
};
// 50,000 lines: line n (2..49,999) is `  "key<n>": "value <n>",`.
const BIG_LINES = 50000;
const BIG_TEXT = ["{", ...Array.from({ length: BIG_LINES - 2 }, (_, i) => `  "key${i + 2}": "value ${i + 2}",`), "}"].join("\n");
const BIG_SBOM = { filename: "big.spdx3.json", format: "spdx3-json", text: BIG_TEXT, display: BIG_TEXT, line_count: BIG_LINES };
const posted = [];

const TOOL = { tool_name: "ntia-conformance-checker", tool_version: "0.0.0-mock" };
const NTIA_RESULT = {
  conformance: {
    standard_id: "ntia", source: "ntia-conformance-checker", total: 7, present: 6, missing: 1, unverified: 0,
    gaps: [{ component_id: "SPDXRef-Package", field_key: "supplier", level: "missing", note: "Component 'glibc' is missing component supplier." }],
    rules: ["Component supplier", "Component name", "Component version", "Component identifier",
      "Dependency relationships", "SBOM author", "SBOM timestamp"].map((title, i) => ({
      rule_id: `BOM-NTIA2021-DF-00${i + 1}`, cluster: "DF", title, provision: "requirement",
      outcome: i === 0 || title === "Component identifier" ? "missing" : "present",
      ...(NTIA_EVIDENCE[title] || { evidence: [], evidence_more: 0 }),
    })),
    system_judged_by_model: null,
  },
  run: { ...TOOL, generator: "pitloom 0.0.0-mock", execution_successful: true,
    notifications: [{ level: "warning", message: "Mock Pitloom warning.", descriptor_id: "pitloom.log" }] },
  embedded_sbom: null,
  sbom: SBOM,
  generation_log: [
    { source: "lumina", level: "info", message: "Generating an SBOM for https://github.com/o/r", elapsed_ms: 0 },
    { source: "lumina", level: "info", message: "$ git -c http.followRedirects=false clone --depth 1 -- https://github.com/o/r <tmp>", elapsed_ms: 3 },
    { source: "git", level: "info", message: "Cloning into '<tmp>'...", elapsed_ms: 912 },
    { source: "pitloom", level: "warning", message: "FORMAT=gguf: mock log record", elapsed_ms: 1530 },
    { source: "lumina", level: "info", message: "Pitloom finished; reading the SBOM it wrote", elapsed_ms: 2104 },
  ],
};
const GEN_FAILED_RESULT = {
  conformance: { standard_id: "g7ai", source: "lumina-internal", total: 0, present: 0, missing: 0, unverified: 0, gaps: [], rules: [], system_judged_by_model: null },
  run: { tool_name: "lumina", tool_version: "", generator: "", execution_successful: false, notifications: [{
    level: "error", descriptor_id: "git.clone-failed", message: "fatal: repository not found" }] },
  embedded_sbom: null,
  generation_log: [
    { source: "lumina", level: "info", message: "Generating an SBOM for https://github.com/o/gone", elapsed_ms: 0 },
    { source: "lumina", level: "error", message: "[git.clone-failed] fatal: repository not found", elapsed_ms: 410 },
  ],
};
// The same SBOM checked against another standard (what POST /sbom/check returns
// for a re-check): no generator, no log -- the page must carry those over.
const RECHECK_RESULT = {
  conformance: { standard_id: "cisa2026", source: "ntia-conformance-checker", total: 1, present: 1, missing: 0, unverified: 0, gaps: [],
    rules: [{ rule_id: "BOM-CISA2026-META-001", cluster: "META", title: "Recheck mock rule", provision: "requirement", outcome: "present", evidence: [], evidence_more: 0 }],
    system_judged_by_model: null },
  run: { ...TOOL, generator: "", execution_successful: true, notifications: [] },
  embedded_sbom: null,
  sbom: SBOM,
};
const rechecks = [];
// A standard that covers SPDX 3 only, given an SPDX 2 SBOM: nothing is checked.
const spdx2Result = (message) => ({
  conformance: { standard_id: "g7ai", source: "ntia-conformance-checker", total: 0, present: 0, missing: 0, unverified: 0, gaps: [],
    rules: [{ rule_id: "BOM-G7AI2026-MD-001", cluster: "MD", title: "SBOM author", provision: "requirement", outcome: "not-applicable", evidence: [], evidence_more: 0 }],
    system_judged_by_model: null },
  run: { ...TOOL, generator: "", execution_successful: true, notifications: [{ level: "warning", message, descriptor_id: "sbom.nothing-applies" }] },
  embedded_sbom: null,
  sbom: { ...SBOM, filename: "old.spdx.json", format: "spdx2-json" },
});
const SPDX2_GENERIC = spdx2Result("No requirement of G7 SBOM for AI applies.");
const SPDX2_SPECIFIC = spdx2Result("G7 SBOM for AI: checked on SPDX 3 SBOMs only; this SBOM is SPDX 2, so no rule was checked.");
const BIG_RESULT = { ...NTIA_RESULT,
  conformance: { ...NTIA_RESULT.conformance, rules: NTIA_RESULT.conformance.rules.map((r, i) => (i !== 1 ? { ...r, evidence: [] }
    : { ...r, evidence: [{ status: "found", element_id: "document", element_type: "SpdxDocument", element_name: null,
      line: 1, end_line: BIG_LINES, items: [{ key: "key40000", value: "value 40000", line: 40000 }] }] })) },
  sbom: BIG_SBOM };
const BSI_RESULT = {
  conformance: { standard_id: "bsi", source: "ntia-conformance-checker", total: 3, present: 1, missing: 2, unverified: 0, optional_present: 0, optional_missing: 1,
    gaps: [{ component_id: "document", field_key: "BOM-BSI2025-DOC-001", level: "missing", note: "Doc creator is missing." }],
    rules: [
      { rule_id: "BOM-BSI2025-DOC-001", cluster: "DOC", title: "Doc creator", provision: "requirement", outcome: "missing" },
      { rule_id: "BOM-BSI2025-DOC-002", cluster: "DOC", title: "Timestamp", provision: "requirement", outcome: "present" },
      { rule_id: "BOM-BSI2025-DOC-003", cluster: "DOC", title: "SBOM-URI", provision: "requirement", outcome: "out-of-scope" },
      { rule_id: "BOM-BSI2025-COMP-001", cluster: "COMP", title: "Component creator", provision: "requirement", outcome: "missing" },
      { rule_id: "BOM-BSI2025-COMP-011", cluster: "COMP", title: "Source code URI", provision: "requirement", outcome: "not-applicable" },
      { rule_id: "BOM-BSI2025-COMP-017", cluster: "COMP", title: "URL of the security.txt", provision: "permission", outcome: "missing" },
    ],
    system_judged_by_model: null },
  run: { ...TOOL, generator: "", execution_successful: true, notifications: [] },
  embedded_sbom: null,
  sbom: { ...SBOM, filename: "upload.spdx3.json" },
};
const UNREADABLE_RESULT = {
  conformance: { standard_id: "g7ai", source: "ntia-conformance-checker", total: 0, present: 0, missing: 0, unverified: 0, gaps: [], rules: [], system_judged_by_model: null },
  run: { ...TOOL, generator: "", execution_successful: false, notifications: [{
    level: "error", descriptor_id: "spdx.parsing-error", message: "The SBOM could not be read." }] },
  embedded_sbom: null,
};
// A rule in a cluster the frontend has no name for must still be shown.
const SARIF_RESULT = {
  conformance: { standard_id: "g7ai", source: "external-sarif", total: 2, present: 1, missing: 1, unverified: 0,
    gaps: [{ component_id: "document", field_key: "BOM-G7AI2026-MDL-001", level: "missing", note: "Model name is missing." }],
    rules: [
      { rule_id: "BOM-G7AI2026-MD-001", cluster: "MD", title: "SBOM author", provision: "requirement", outcome: "present" },
      { rule_id: "BOM-G7AI2026-MDL-001", cluster: "MDL", title: "Model name", provision: "requirement", outcome: "missing" },
      { rule_id: "BOM-G7AI2026-MDL-002", cluster: "MDL", title: "Model licence", provision: "requirement", outcome: "out-of-scope" },
      { rule_id: "BOM-G7AI2026-ZZ-001", cluster: "ZZ", title: "Future cluster rule", provision: "requirement", outcome: "not-applicable" },
    ],
    system_judged_by_model: "mock-model" },
  run: { tool_name: "some-other-tool", tool_version: "1.0", generator: "", execution_successful: true, notifications: [] },
  embedded_sbom: null,
};
const DETAIL_413 = "SBOM is larger than 10485760 bytes.";
const DETAIL_422 = "Unsupported standard: no single supported standard in rule id spec(s) ['CISA2025']";
const DETAIL_501 = "Minimum elements standard 'cisa2026' is not supported by ntia-conformance-checker.";

async function mockApi(page) {
  await page.route("**/api/v1/standards", r => r.fulfill({ json: { standards: STANDARDS } }));
  await page.route("**/api/v1/artifact/check", r => {
    const body = JSON.parse(r.request().postData() || "{}");
    posted.push(body);
    if (body.artifact_url.includes("refuse")) return r.fulfill({ status: 501, json: { detail: DETAIL_501 } });
    return r.fulfill({ status: 202, json: { job_id: body.artifact_url.includes("big") ? "job-2" : body.artifact_url.includes("gone") ? "job-3" : "job-1" } });
  });
  await page.route("**/api/v1/jobs/job-1", r => r.fulfill({ json: { status: "done", result: NTIA_RESULT } }));
  await page.route("**/api/v1/jobs/job-3", r => r.fulfill({ json: { status: "done", result: GEN_FAILED_RESULT } }));
  await page.route("**/api/v1/jobs/job-2", r => r.fulfill({ json: { status: "done", result: BIG_RESULT } }));
  await page.route("**/api/v1/sbom/check", r => {
    const raw = r.request().postData() || "";
    if (raw.includes('filename="old.spdx.json"')) return r.fulfill({ json: SPDX2_GENERIC });
    if (raw.includes('filename="old-note.spdx.json"')) return r.fulfill({ json: SPDX2_SPECIFIC });
    if (/name="standard"\r\n\r\ncisa2026/.test(raw)) { rechecks.push(raw); return r.fulfill({ json: RECHECK_RESULT }); }
    if (/name="standard"\r\n\r\nbsi/.test(raw)) return r.fulfill({ json: BSI_RESULT });
    if (/name="standard"\r\n\r\ng7ai/.test(raw)) return r.fulfill({ json: UNREADABLE_RESULT });
    return r.fulfill({ status: 413, json: { detail: DETAIL_413 } });
  });
  await page.route("**/api/v1/sarif/import", r => {
    if ((r.request().postData() || "").includes("CISA2025")) return r.fulfill({ status: 422, json: { detail: DETAIL_422 } });
    return r.fulfill({ json: SARIF_RESULT });
  });
}

// ── Static server for frontend/ ──────────────────────────────────────────
const TYPES = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(root, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "text/javascript" });
    res.end(buf);
  });
}).listen(0, "127.0.0.1");
await new Promise(r => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/`;

// ── Checks ───────────────────────────────────────────────────────────────
const failures = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures.push(what); };
const SAMPLE = [/ghost-mesh/i, /acme/i, /\bRP\b/, /Last weave/i];
const LABELS = { ntia: "NTIA Minimum Elements", bsi: "BSI TR-03183-2", g7ai: "G7 SBOM for AI",
  cisa2026: "CISA 2026 Minimum Elements", fsct2024: "FSCT 2024 (CISA Framing)", mof: "Model Openness Framework" };

const browser = await chromium.launch({ executablePath: process.env.LUMINA_SMOKE_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
// The browser logs each refused request the mocks send on purpose; anything
// else on the console at error level is a failure.
const DELIBERATE = /^Failed to load resource: the server responded with a status of (413|422|501) /;
page.on("console", m => { if (m.type() === "error" && !DELIBERATE.test(m.text())) errors.push(m.text()); });
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => {
  if (/fonts\.(googleapis|gstatic)\.com/.test(r.request().url())) return r.fulfill({ body: "", contentType: "text/css" });
  errors.push(`external request: ${r.request().url()}`);
  return r.abort();
});
await mockApi(page);

// The page scrolls inside <main>; unclip it so a full-page shot shows everything.
const UNCLIP = "html,body{height:auto!important;overflow:visible!important}#root{height:auto!important}main{overflow:visible!important}";
const shot = async (name) => {
  const style = await page.addStyleTag({ content: UNCLIP });
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  await style.evaluate(el => el.remove());
};
const nav = async (label) => { await page.getByRole("navigation").getByRole("button", { name: label }).click(); };
const text = () => page.evaluate(() => document.body.innerText);

async function noSampleData(where) {
  const html = await page.content();
  const body = await text();
  for (const re of SAMPLE) check(!re.test(body) && !re.test(html), `${where}: no sample string ${re}`);
}

async function chipsMatchApi(where) {
  await page.waitForSelector('[role=radiogroup][aria-label="Minimum elements standard"] [role=radio]');
  const chips = await page.$$eval('[role=radiogroup][aria-label="Minimum elements standard"] [role=radio]',
    els => els.map(e => ({ text: e.textContent, disabled: e.getAttribute("aria-disabled") === "true" })));
  const expected = STANDARDS.map(r => ({ label: LABELS[r.id] || r.id, disabled: !r.ready }));
  check(chips.length === expected.length && chips.every((c, i) => c.text.startsWith(expected[i].label) && c.disabled === expected[i].disabled),
    `${where}: standard chips equal the API list ${JSON.stringify(chips.map(c => c.text))}`);
  const checked = await page.$$eval('[role=radio][aria-checked="true"]', els => els.map(e => e.textContent));
  check(checked.length === 1 && checked[0] === LABELS.g7ai, `${where}: G7 SBOM for AI is preselected`);
  await page.getByRole("radio", { name: /Model Openness Framework/ }).click({ force: true });
  const after = await page.$$eval('[role=radio][aria-checked="true"]', els => els.map(e => e.textContent));
  check(after[0] === LABELS.g7ai, `${where}: an unsupported standard cannot be selected`);

  // Keyboard: one tab stop (the chosen chip); arrows, Home and End move focus
  // between the usable chips without choosing; the unsupported chip is skipped.
  const group = '[role=radiogroup][aria-label="Minimum elements standard"]';
  const stops = await page.$$eval(`${group} [role=radio]`, els => els.filter(e => e.tabIndex === 0).map(e => e.textContent));
  check(stops.length === 1 && stops[0] === LABELS.g7ai, `${where}: the standard chips have one tab stop, the chosen one`);
  const focused = () => page.evaluate(() => document.activeElement.textContent);
  const chosen = () => page.$$eval('[role=radio][aria-checked="true"]', els => els.map(e => e.textContent).join("|"));
  await page.focus(`${group} [role=radio][aria-checked="true"]`);
  const trail = [];
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowLeft", "End", "ArrowRight", "Home", "ArrowDown", "ArrowDown", "ArrowUp"]) {
    await page.keyboard.press(key);
    trail.push(await focused());
  }
  const want = ["CISA 2026", "G7 SBOM", "BSI", "FSCT 2024", "NTIA", "NTIA", "BSI", "G7 SBOM", "BSI"];
  check(trail.every((t, i) => t.startsWith(want[i])), `${where}: arrow keys, Home and End move focus (${JSON.stringify(trail)})`);
  check(await chosen() === LABELS.g7ai, `${where}: moving focus with the keys does not choose a standard`);
  check(await page.getByRole("radiogroup", { name: "Minimum elements standard" }).getAttribute("aria-describedby") === "standard-hint"
    && (await page.locator("#standard-hint").innerText()).includes("arrow keys"), `${where}: the keys are described to screen readers`);
  await page.keyboard.press("ArrowRight"); // back on G7 SBOM for AI
  await page.focus("body");
}

// The Download SBOM button saves `sbom.text` under `sbom.filename`.
async function downloads(where, filename, content) {
  const button = page.getByRole("button", { name: /^Download SBOM/ });
  check(await button.isVisible(), `${where}: Download SBOM button is visible`);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), button.click()]);
  const saved = fs.readFileSync(await download.path(), "utf8");
  check(download.suggestedFilename() === filename && saved === content,
    `${where}: Download SBOM saves ${download.suggestedFilename()} with the SBOM text`);
}

// Line `n` of the source is in the DOM, inside the visible part of the scroll
// box, marked as a hit, and holds `needle`.
async function lineVisible(n, needle) {
  return page.evaluate(([n, needle]) => {
    const row = document.querySelector(`.sbom-line[data-line="${n}"]`);
    const box = document.querySelector(".sbom-source");
    if (!row || !box) return false;
    const r = row.getBoundingClientRect(); const b = box.getBoundingClientRect();
    return row.classList.contains("sbom-line--hit") && r.top >= b.top && r.bottom <= b.bottom && row.textContent.includes(needle);
  }, [n, needle]);
}

async function evidenceAndSource(where) {
  await downloads(where, SBOM.filename, SBOM.text);
  const tabs = await page.$$eval("[role=tablist] [role=tab]", els => els.map(e => [e.textContent, e.getAttribute("aria-selected")]));
  check(JSON.stringify(tabs) === JSON.stringify([["Result", "true"], ["SBOM source", "false"], ["Generator log", "false"]]), `${where}: Result | SBOM source | Generator log tabs ${JSON.stringify(tabs)}`);
  // The default view already shows the value an element carries, before any click.
  const rowValues = async (title) => page.locator(".rule-row", { hasText: title }).first().locator(".rule-values li").allInnerTexts();
  check(JSON.stringify(await rowValues("Component version")) === JSON.stringify(["1.0"]),
    `${where}: the row shows the version value without opening the details`);
  check(JSON.stringify(await rowValues("Component identifier")) === JSON.stringify(["mock-model: pkg:generic/mock"]),
    `${where}: a Missing rule with two elements shows the value of the one that has it, with its name`);
  check((await rowValues("Component supplier")).length === 0, `${where}: a rule with nothing found shows no value`);
  check(await page.locator(".rule-values").first().getAttribute("aria-label") !== null, `${where}: the values list has an accessible name`);
  const toggle = page.getByRole("button", { name: "Show more: Component version" });
  await toggle.click();
  let body = await text();
  check(await page.getByRole("button", { name: "Show less: Component version" }).getAttribute("aria-expanded") === "true"
      && body.includes("software_packageVersion") && body.includes("mock-pkg") && body.includes("software_Package") && body.includes("Has it"),
    `${where}: Show more shows the rule's evidence`);
  await page.getByRole("button", { name: "Expand all" }).click();
  body = await text();
  const states = await page.$$eval("button[aria-controls^=rule-details-]", els => els.map(e => e.getAttribute("aria-expanded")));
  check(states.length === 7 && states.every(s => s === "true") && body.includes("No evidence available for this rule")
      && body.includes("and 3 more") && body.includes("Lacks it"), `${where}: Expand all opens every rule, empty ones say so`);
  // A Missing rule whose elements split: the row says so, and the details say why.
  check(body.includes("1 of 2 root packages lacks it"), `${where}: the rule row says how many elements lack the property`);
  check(body.includes("Judged on the system: each root package the SBOM describes: 2 root packages. 1 has the property and 1 lacks it. A rule is Present only when every judged element has the property, so one that lacks it makes the rule Missing."),
    `${where}: the details explain why the rule is Missing`);
  check(body.includes("A composite element: it is Present when at least one of its sub-elements is."), `${where}: an any-of rule says how it combines`);
  check(!/Found|Absent/.test(await page.locator(".evidence").allInnerTexts().then(t => t.join(" "))), `${where}: element labels are not the rule verdict words`);
  await shot("2b-generate-expanded");
  await page.getByRole("button", { name: "Collapse all" }).click();
  check((await page.$$eval("button[aria-controls^=rule-details-]", els => els.map(e => e.getAttribute("aria-expanded")))).every(s => s === "false"),
    `${where}: Collapse all closes every rule`);
  await toggle.click();
  await page.getByRole("button", { name: /^Show in SBOM: mock-pkg/ }).first().click();
  await page.waitForSelector(".sbom-line--hit", { timeout: 5000 }).catch(() => {});
  check(await page.getAttribute("#result-tab-source", "aria-selected") === "true", `${where}: Show in SBOM switches to the source tab`);
  check(await lineVisible(PKG_BLOCK.line, "{") && await lineVisible(PKG_BLOCK.line + 2, '"spdxId": "https://example.org/mock/pkg"')
      && await page.locator(".sbom-line--hit").count() === PKG_BLOCK.end_line - PKG_BLOCK.line + 1,
    `${where}: the element block (lines ${PKG_BLOCK.line}-${PKG_BLOCK.end_line}) is shown and marked`);
  check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("sbom-source")), `${where}: focus moves to the source`);
  check(await page.evaluate(() => location.hash) === `#sbom-L${PKG_BLOCK.line}-L${PKG_BLOCK.end_line}`, `${where}: the URL hash names the block`);
  check(await page.locator(".hljs-string", { hasText: '"mock-pkg"' }).count() === 1 && await page.locator(".hljs-attr", { hasText: '"name"' }).count() > 0
      && await page.locator(".hljs-number", { hasText: "1024" }).count() === 1, `${where}: the source is syntax-highlighted`);
  check((await text()).includes(`${SBOM.line_count} lines`) && (await text()).includes(SBOM.filename), `${where}: the toolbar names the file and its line count`);
  await shot("2c-generate-source");
  await page.getByRole("button", { name: "Back to result" }).click();
  check(await page.getAttribute("#result-tab-result", "aria-selected") === "true"
      && await page.evaluate(() => document.activeElement && document.activeElement.id === "rule-toggle-BOM-NTIA2021-DF-003"),
    `${where}: Back to result returns to the rule that linked`);
  await page.getByRole("button", { name: /^Show software_packageVersion in SBOM, line/ }).click();
  check(await lineVisible(VERSION_LINE, '"software_packageVersion": "1.0"') && await page.locator(".sbom-line--hit").count() === 1,
    `${where}: an item's line link marks line ${VERSION_LINE}`);
  await page.focus("#result-tab-source");
  await page.keyboard.press("ArrowLeft");
  check(await page.getAttribute("#result-tab-result", "aria-selected") === "true"
      && await page.evaluate(() => document.activeElement.id === "result-tab-result"), `${where}: arrow keys move between tabs`);
  // Narrow viewport (phone width).
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("2d-generate-narrow");
  await page.getByRole("tab", { name: "SBOM source" }).click();
  await shot("2d-generate-narrow-source");
  await page.getByRole("tab", { name: "Result" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
}

await page.goto(base);
await page.waitForSelector("nav");

// Generate & check (default screen)
check((await page.getAttribute("main", "aria-label")) === "Generate & check screen", "main landmark label is localised, not a raw id");
await chipsMatchApi("Generate & check");
await noSampleData("Generate & check");
await shot("1-generate");
// The example buttons fill the URL and pick the demo's standard.
await page.getByRole("button", { name: "Project with no AI model" }).click();
check(await page.getByPlaceholder(/github/).inputValue() === "https://github.com/pallets/flask"
  && await page.getByRole("radio", { name: "NTIA Minimum Elements" }).getAttribute("aria-checked") === "true",
  "Generate & check: an example fills the URL and picks its standard");
await page.getByRole("button", { name: "Safetensors model with a dataset" }).click();
check((await page.getByPlaceholder(/github/).inputValue()).startsWith("https://huggingface.co/distilbert/")
  && await page.getByRole("radio", { name: "G7 SBOM for AI" }).getAttribute("aria-checked") === "true",
  "Generate & check: the model example fills the URL and picks G7 SBOM for AI");
check(await page.getByRole("group", { name: "Try an example:" }).count() === 1
  && (await page.locator("[role=status].sr-only").allInnerTexts()).some(t => t.includes("Example chosen: Safetensors model with a dataset") && t.includes("G7 SBOM for AI")),
  "Generate & check: the examples are a named group and the choice is announced");
await page.getByRole("button", { name: "Safetensors model with 14.7B parameters" }).click();
check(await page.getByPlaceholder(/github/).inputValue() === "https://huggingface.co/microsoft/phi-4"
  && await page.getByRole("radio", { name: "G7 SBOM for AI" }).getAttribute("aria-checked") === "true",
  "Generate & check: the Safetensors model example fills the URL and picks G7 SBOM for AI");
await page.getByRole("button", { name: "Safetensors model with 119B parameters" }).click();
check(await page.getByPlaceholder(/github/).inputValue() === "https://huggingface.co/mistralai/Mistral-Small-4-119B-2603"
  && await page.getByRole("radio", { name: "G7 SBOM for AI" }).getAttribute("aria-checked") === "true",
  "Generate & check: the Mistral model example fills the URL and picks G7 SBOM for AI");
await page.getByRole("button", { name: "Safetensors model with 29.3B parameters" }).click();
check(await page.getByPlaceholder(/github/).inputValue() === "https://huggingface.co/ibm-granite/granite-4.2-30b"
  && await page.getByRole("radio", { name: "G7 SBOM for AI" }).getAttribute("aria-checked") === "true",
  "Generate & check: the Granite model example fills the URL and picks G7 SBOM for AI");
for (const [name, url] of [["Safetensors model with 303M parameters", "https://huggingface.co/sonyinteractive/grooming-risk-classifier"], ["Safetensors model with 14.8B parameters", "https://huggingface.co/JTS-AI/OpenJAI-v1.0-14B"]]) {
  await page.getByRole("button", { name }).click();
  check(await page.getByPlaceholder(/github/).inputValue() === url
    && await page.getByRole("radio", { name: "G7 SBOM for AI" }).getAttribute("aria-checked") === "true",
    `Generate & check: the example ${name} fills the URL and picks G7 SBOM for AI`);
}
await page.getByRole("button", { name: "GGUF model with 630M parameters" }).click();
check(await page.getByPlaceholder(/github/).inputValue() === "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF"
  && await page.getByRole("radio", { name: "G7 SBOM for AI" }).getAttribute("aria-checked") === "true",
  "Generate & check: the GGUF model example fills the URL and picks G7 SBOM for AI");
await page.getByPlaceholder(/github/).fill("https://github.com/o/refuse");
await page.getByRole("button", { name: "Generate & check" }).last().click();
await page.waitForSelector(`text=${DETAIL_501}`, { timeout: 5000 }).catch(() => {});
check((await text()).includes(DETAIL_501), "Generate & check: a 501 shows the server detail");
await page.getByPlaceholder(/github/).fill("https://github.com/o/r");
await page.getByRole("button", { name: "Generate & check" }).last().click();
await page.waitForSelector("text=Data fields", { timeout: 10000 }).catch(() => {});
let body = await text();
check(body.includes("Data fields") && body.includes("Component supplier") && body.includes("pitloom 0.0.0-mock"),
  "Generate & check: the job result renders with rules and generator");
check(posted.at(-1).standard_id === "g7ai", "Generate & check: the default request names g7ai");
await shot("2-generate-result");
await evidenceAndSource("Generate & check");

// A finished check is announced, and every tab's aria-controls names an existing panel.
check((await page.locator("[role=status].sr-only").allInnerTexts()).some(t => /^Check finished: \d+ present and \d+ missing of \d+ rules checked\.$/.test(t)),
  "Generate & check: the finished check is announced to screen readers");
check(await page.$$eval("[role=tab]", els => els.every(e => document.getElementById(e.getAttribute("aria-controls")))),
  "Generate & check: every tab's aria-controls names an existing panel");

// Generator log: a tab of its own, in a monospace font, lines as returned.
await page.getByRole("tab", { name: "Generator log" }).click();
await page.waitForSelector(".gen-log-line");
const logLines = await page.locator(".gen-log-line").allInnerTexts();
check(logLines.length === 5 && logLines[2].includes("git") && logLines[2].includes("Cloning into '<tmp>'...")
  && logLines[3].includes("WARNING") && logLines[3].includes("FORMAT=gguf: mock log record"),
  "Generate & check: the Generator log tab lists the returned lines with source and level");
check(await page.locator(".gen-log-line", { hasText: "$ git -c http.followRedirects=false clone" }).count() === 1,
  "Generate & check: the real clone command line is shown");
const logFont = await page.locator(".gen-log-msg").first().evaluate(e => getComputedStyle(e).fontFamily);
check(/mono/i.test(logFont), `Generate & check: the log is in a monospace font (${logFont})`);
await shot("2f-generator-log");
await page.getByRole("tab", { name: "Result" }).click();

// Switching the standard checks the same SBOM again: nothing is generated again,
// the SBOM text is what goes to the server, and what the generator did stays.
const artifactPosts = posted.length;
await page.getByRole("radio", { name: LABELS.cisa2026 }).click();
await page.waitForSelector("text=Recheck mock rule", { timeout: 10000 }).catch(() => {});
check(posted.length === artifactPosts && rechecks.length === 1, "switch standard: no new generation job, one re-check request");
check(rechecks.length === 1 && rechecks[0].includes('filename="r.spdx3.json"') && rechecks[0].includes("mock-pkg"),
  "switch standard: the re-check sends the SBOM text under its own file name");
body = await text();
check(body.includes("Recheck mock rule") && body.includes("pitloom 0.0.0-mock") && body.includes("Mock Pitloom warning."),
  "switch standard: the new result shows, with the generator and its warning carried over");
check(await page.getByRole("tab", { name: "Generator log" }).count() === 1
  && await page.getByRole("radio", { name: LABELS.cisa2026 }).getAttribute("aria-checked") === "true",
  "switch standard: the Generator log tab stays and the chosen standard is selected");
check((await page.locator("[role=status].sr-only").allInnerTexts()).some(t => /^Check finished: 1 present and 0 missing of 1 rules checked\.$/.test(t)),
  "switch standard: the new result is announced");
await shot("2g-switched-standard");
// A switch that fails (the mock refuses it with 413, as for an SBOM over the size
// limit) keeps the earlier result and standard and says why.
await page.getByRole("radio", { name: LABELS.fsct2024 }).click();
await page.waitForSelector("text=Could not switch the standard", { timeout: 10000 }).catch(() => {});
body = await text();
check(body.includes("Could not switch the standard") && body.includes(DETAIL_413) && body.includes("Recheck mock rule")
  && await page.getByRole("radio", { name: LABELS.cisa2026 }).getAttribute("aria-checked") === "true"
  && await page.getByRole("radio", { name: LABELS.fsct2024 }).getAttribute("aria-checked") === "false",
  "switch standard: a failed switch keeps the earlier result and standard and shows the reason");

// A failed generation still shows why, in the log.
await page.getByPlaceholder(/github/).fill("https://github.com/o/gone");
await page.getByRole("button", { name: "Generate & check" }).last().click();
await page.waitForSelector("text=fatal: repository not found", { timeout: 10000 }).catch(() => {});
check(await page.getByRole("tab", { name: "Generator log" }).count() === 1
  && await page.getByRole("tab", { name: "SBOM source" }).count() === 0,
  "failed generation: Result and Generator log tabs, no SBOM source tab");
await page.getByRole("tab", { name: "Generator log" }).click();
check((await page.locator(".gen-log-line--error").innerText()).includes("[git.clone-failed]"),
  "failed generation: the log ends with the error line");

// Big source: windowed, and any line can be reached.
await page.getByPlaceholder(/github/).fill("https://github.com/o/big");
await page.getByRole("button", { name: "Generate & check" }).last().click();
await page.waitForSelector("text=Data fields", { timeout: 10000 }).catch(() => {});
await page.getByRole("tab", { name: "SBOM source" }).click();
await page.waitForSelector(".sbom-line");
let lineNodes = await page.locator(".sbom-line").count();
check(lineNodes > 0 && lineNodes < 3000, `big source: ${lineNodes} of ${BIG_LINES} line nodes in the DOM`);
await page.getByLabel("Go to line").fill("40000");
await page.getByRole("button", { name: "Go to the line" }).click();
await page.waitForSelector('.sbom-line[data-line="40000"]', { timeout: 5000 }).catch(() => {});
check(await lineVisible(40000, '"key40000": "value 40000"'), "big source: Go to line 40000 shows and marks that line");
lineNodes = await page.locator(".sbom-line").count();
check(lineNodes < 3000, `big source: still windowed after the jump (${lineNodes} line nodes)`);
check(await page.evaluate(() => location.hash) === "#sbom-L40000", "big source: the URL hash names the line");
await shot("2e-generate-big-source");
await page.getByRole("tab", { name: "Result" }).click();
await page.getByRole("button", { name: "Show more: Component name" }).click();
await page.getByRole("button", { name: /Show key40000 in SBOM, line 40000/ }).click();
check(await lineVisible(40000, '"key40000"'), "big source: an evidence line link reaches line 40000");
await page.evaluate(() => { location.hash = "#sbom-L12345"; });
await page.waitForSelector('.sbom-line--hit[data-line="12345"]', { timeout: 5000 }).catch(() => {});
check(await lineVisible(12345, '"key12345"'), "big source: a #sbom-L12345 hash jumps to line 12345");

// Upload SBOM
await nav("Upload SBOM");
await chipsMatchApi("Upload SBOM");
await noSampleData("Upload SBOM");
await shot("3-upload");
// No example holds an email address (AGENTS.md: no personal data in fixtures).
for (const f of fs.readdirSync(path.join(root, "examples"))) {
  const found = fs.readFileSync(path.join(root, "examples", f), "utf8").match(/[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/g);
  check(!found, `Examples: ${f} holds no email address${found ? ` (${found[0]})` : ""}`);
}
// Example SBOMs: each listed file exists and is a real SBOM; choosing one
// selects it as a file and, when the standard is ready, picks its standard.
const sbomExamples = await page.evaluate(() => EXAMPLE_SBOMS);
for (const ex of sbomExamples) {
  const doc = JSON.parse(fs.readFileSync(path.join(root, "examples", ex.file), "utf8"));
  check(Boolean(doc.spdxVersion || doc["@graph"]), `Upload SBOM: example ${ex.file} is an SPDX document`);
  await page.getByRole("button", { name: ex.label, exact: true }).click();
  await page.waitForSelector(`text=${ex.file}`, { timeout: 5000 }).catch(() => {});
  check(await page.getByText(ex.file, { exact: false }).first().isVisible()
      && await page.getByRole("radio", { name: LABELS[ex.standard] }).getAttribute("aria-checked") === "true"
      && (await page.locator("[role=status]").allInnerTexts()).some(t => t.includes(`Example chosen: ${ex.label} (${ex.note})`) && t.includes(LABELS[ex.standard])),
    `Upload SBOM: choosing the example ${ex.label} selects its file and standard, and says so`);
}
// Two quick choices: the slower, older load must not replace the newer one.
await page.route("**/examples/phi-4.spdx3.json", async r => { await new Promise(res => setTimeout(res, 700)); await r.continue(); });
await page.getByRole("button", { name: "Safetensors model with 14.7B parameters", exact: true }).click();
await page.getByRole("button", { name: "GGUF model with 630M parameters", exact: true }).click();
await page.waitForTimeout(1200);
check((await page.locator("[role=status]").allInnerTexts()).some(t => t.includes("Example chosen: GGUF model with 630M parameters"))
    && !(await page.locator("[role=status]").allInnerTexts()).some(t => t.includes("Example chosen: Safetensors model with 14.7B parameters"))
    && await page.getByText("qwen2.5-0.5b-instruct-gguf.spdx3.json").first().isVisible(),
  "Upload SBOM: an older, slower example load does not replace a newer choice");
await page.unroute("**/examples/phi-4.spdx3.json");
const sentBodies = [];
page.on("request", q => { if (q.url().endsWith("/api/v1/sbom/check")) sentBodies.push(q.postData() || ""); });
await page.getByRole("button", { name: "Container image with an SPDX 2 SBOM", exact: true }).click();
await page.getByRole("button", { name: "Check SBOM" }).click();
await page.waitForTimeout(500);
check(sentBodies.length === 1 && sentBodies[0].includes('filename="chainguard-image.spdx.json"') && sentBodies[0].includes("SPDX-2.3"),
  "Upload SBOM: an example is uploaded as its real file");
await page.getByRole("button", { name: "Clear" }).click();
await page.setInputFiles("#sbom-file", { name: "big.spdx.json", mimeType: "application/json", buffer: Buffer.from("{}") });
await page.getByRole("radio", { name: LABELS.ntia }).click();
await page.getByRole("button", { name: "Check SBOM" }).click();
await page.waitForSelector(`text=${DETAIL_413}`, { timeout: 5000 }).catch(() => {});
check((await text()).includes(DETAIL_413), "Upload SBOM: a 413 shows the server detail");
await shot("4-upload-413");
await page.getByRole("radio", { name: LABELS.bsi }).click();
await page.getByRole("button", { name: "Check SBOM" }).click();
await page.waitForSelector("text=SBOM document", { timeout: 5000 }).catch(() => {});
body = await text();
check(body.includes("SBOM document") && body.includes("Components") && body.includes("Doc creator")
    && body.includes("1 present · 1 missing · 0 not applicable · 1 not checked")
    && body.includes("0 present · 1 missing · 1 not applicable · 0 not checked · 1 optional not provided")
    && body.includes("FIELDS CHECKED") && !body.includes("erdict"),
  "Upload SBOM: BSI shows its DOC and COMP clusters with per-rule counts");
check(/not provided/i.test(body) && body.includes("OPTIONAL PROVIDED") && body.includes("0 of 1"),
  "Upload SBOM: an optional rule is Not provided, apart from Missing");
await downloads("Upload SBOM", "upload.spdx3.json", SBOM.text);
check(await page.getByRole("tab", { name: "Generator log" }).count() === 0, "Upload SBOM: no Generator log tab (nothing was generated)");
await shot("5-upload-bsi-rules");
// Switching the standard on the Upload page checks the shown SBOM again without a new upload.
rechecks.length = 0;
await page.getByRole("radio", { name: LABELS.cisa2026 }).click();
await page.waitForSelector("text=Recheck mock rule", { timeout: 10000 }).catch(() => {});
check(rechecks.length === 1 && rechecks[0].includes('filename="upload.spdx3.json"') && (await text()).includes("Recheck mock rule"),
  "Upload SBOM: switching the standard re-checks the same SBOM from its text");
await page.getByRole("radio", { name: LABELS.g7ai }).click();
await page.getByRole("button", { name: "Check SBOM" }).click();
await page.waitForSelector("text=could not be checked", { timeout: 5000 }).catch(() => {});
body = await text();
check(body.includes("The SBOM could not be checked") && body.includes("spdx.parsing-error") && !body.includes("Fields checked"),
  "Upload SBOM: an unreadable SBOM shows no counts, only why");
await shot("5b-upload-unreadable");

// Nothing was checked: the banner says why. An SPDX 2 SBOM under a standard that
// covers SPDX 3 only gets that reason even from a checker that only says the
// generic "no requirement applies"; a checker that says why is quoted as it is.
for (const [name, reason] of [
  ["old.spdx.json", "G7 SBOM for AI is checked on SPDX 3 SBOMs only; this SBOM is SPDX 2."],
  ["old-note.spdx.json", "G7 SBOM for AI: checked on SPDX 3 SBOMs only; this SBOM is SPDX 2, so no rule was checked."],
]) {
  await page.setInputFiles("#sbom-file", { name, mimeType: "application/json", buffer: Buffer.from("{}") });
  await page.getByRole("radio", { name: LABELS.g7ai }).click();
  await page.getByRole("button", { name: "Check SBOM" }).click();
  await page.waitForSelector("text=Nothing was checked", { timeout: 5000 }).catch(() => {});
  const banner = await text();
  check(banner.includes("Nothing was checked") && banner.includes(reason) && !banner.includes("Fields checked"),
    `Upload SBOM: the nothing-checked banner gives the reason for ${name}`);
  check((await page.locator("[role=status].sr-only").allInnerTexts()).some(t => t === `Check finished. Nothing was checked. ${reason}`),
    `Upload SBOM: the nothing-checked reason is announced for ${name}`);
}

// Import SARIF
await nav("Import SARIF");
await noSampleData("Import SARIF");
await shot("6-sarif");
const sarifExamples = await page.evaluate(() => EXAMPLE_SARIFS);
for (const ex of sarifExamples) {
  const raw = fs.readFileSync(path.join(root, "examples", ex.file), "utf8");
  const log = JSON.parse(raw);
  check(log.version === "2.1.0" && log.runs.length > 0, `Import SARIF: example ${ex.file} is a SARIF 2.1.0 log`);
  await page.getByRole("button", { name: ex.label, exact: true }).click();
  await page.waitForFunction(r => document.getElementById("sarif-text").value === r, raw, { timeout: 5000 }).catch(() => {});
  check(await page.inputValue("#sarif-text") === raw
      && (await page.locator("[role=status]").allInnerTexts()).some(t => t.includes(`Example chosen: ${ex.label} (${ex.note})`) && t.includes("in the text box below")),
    `Import SARIF: choosing the example ${ex.label} puts its SARIF in the text box, and says so`);
}
// Choosing an example replaces what was in the box, and says so; Clear text empties it.
await page.fill("#sarif-text", "pasted text");
await page.getByRole("button", { name: "Safetensors model with 14.7B parameters (G7)", exact: true }).click();
await page.waitForFunction(() => document.getElementById("sarif-text").value !== "pasted text", null, { timeout: 5000 }).catch(() => {});
check((await page.locator("[role=status]").allInnerTexts()).some(t => t.includes("replacing what was there")), "Import SARIF: an example that replaces pasted text says so");
await page.getByRole("button", { name: "Clear text" }).click();
check(await page.inputValue("#sarif-text") === "" && await page.evaluate(() => document.activeElement.id) === "sarif-text", "Import SARIF: Clear text empties the box and keeps focus in it");
// A file chosen with the picker leaves the pasted text in place.
await page.fill("#sarif-text", "pasted text");
await page.setInputFiles("#sarif-file", { name: "own.sarif.json", mimeType: "application/json", buffer: Buffer.from("{}") });
check(await page.inputValue("#sarif-text") === "pasted text" && (await text()).includes("the text you pasted is kept"),
  "Import SARIF: choosing a file keeps the pasted text, and the label says so");
await page.getByRole("button", { name: "Clear", exact: true }).click();
check(await page.inputValue("#sarif-text") === "pasted text" && !(await page.locator("#sarif-text").isDisabled()),
  "Import SARIF: the pasted text is back when the file is cleared");
await page.getByRole("button", { name: "Clear text" }).click();
await page.getByRole("button", { name: "Safetensors model with 14.7B parameters (NTIA)", exact: true }).click();
await page.waitForFunction(() => document.getElementById("sarif-text").value.length > 0, null, { timeout: 5000 }).catch(() => {});
const sentLogs = [];
page.on("request", q => { if (q.url().endsWith("/api/v1/sarif/import")) sentLogs.push(q.postData() || ""); });
await page.getByRole("button", { name: "Import SARIF" }).last().click();
await page.waitForTimeout(500);
check(sentLogs.length === 1 && sentLogs[0].includes('"ruleId"'), "Import SARIF: an example is sent as its real log");
await page.getByRole("button", { name: "Clear text" }).click();
await page.fill("#sarif-text", '{"version": "2.1.0", "runs": [{"results": [{"ruleId": "BOM-CISA2025-META-001"}]}]}');
await page.getByRole("button", { name: "Import SARIF" }).last().click();
await page.waitForSelector("text=Unsupported standard", { timeout: 5000 }).catch(() => {});
check((await text()).includes(DETAIL_422), "Import SARIF: a 422 shows the server detail");
await shot("7-sarif-422");
await page.fill("#sarif-text", '{"version": "2.1.0", "runs": []}');
await page.getByRole("button", { name: "Import SARIF" }).last().click();
await page.waitForSelector("text=Future cluster rule", { timeout: 5000 }).catch(() => {});
body = await text();
check(body.includes("Future cluster rule") && body.includes("a third-party SARIF producer") && body.includes("mock-model"),
  "Import SARIF: result renders, unknown cluster included");
check(await page.locator("[role=tablist]").count() === 0 && await page.getByRole("button", { name: /Download SBOM/ }).count() === 0
    && await page.getByRole("button", { name: /^Show more/ }).count() === 0,
  "Import SARIF: a result without sbom has no tabs, no download and no details toggles");
await shot("8-sarif-result");

// About
await nav("About");
await page.waitForSelector("text=Model Openness Framework");
body = await text();
check(/present means the property exists, not that its value is right/i.test(body), "About: states what present means");
check(STANDARDS.every(r => body.includes(r.id)), "About: lists every standard the API returns");
await noSampleData("About");
await shot("9-about");

// Top bar: a plain-language title, whose link name contains it (label in name).
const topTitle = "Generate and check SBOMs against G7 SBOM for AI";
check(await page.getByRole("banner").getByRole("link", { name: `${topTitle} -- go to main content` }).innerText() === topTitle,
  "Top bar: the visible title is the link, and its accessible name contains it");
// Language switch: nav labels and the main label follow the locale.
await page.getByRole("button", { name: /Language/ }).click();
await page.getByRole("option", { name: /Deutsch/ }).click();
check(await page.getByRole("navigation").getByRole("button", { name: "SBOM hochladen" }).isVisible(), "German nav labels");
check((await page.getByRole("banner").innerText()).includes("SBOMs erzeugen und gegen G7 SBOM for AI prüfen"), "German top bar title");
check((await page.getAttribute("main", "aria-label")) === "Ansicht Über", "German main landmark label");
await shot("10-about-de");
// The other locales: nav label, top bar title, main label and <html lang>.
const LOCALES = [
  { option: /Français/, lang: "fr", nav: "Téléverser un SBOM", title: "Générer des SBOM et les vérifier selon G7 SBOM for AI", main: "Écran À propos" },
  { option: /Gaeilge/, lang: "ga", nav: "Uaslódáil SBOM", title: "Gin SBOManna agus seiceáil iad i gcoinne G7 SBOM for AI", main: "Scáileán Maidir leis" },
  { option: /ไทย/, lang: "th", nav: "อัปโหลด SBOM", title: "สร้าง SBOM และตรวจสอบตาม G7 SBOM for AI", main: "หน้าจอ เกี่ยวกับ" },
];
for (const loc of LOCALES) {
  await page.getByRole("button", { name: /^[A-Z]{2}, / }).click();
  await page.getByRole("option", { name: loc.option }).click();
  check(await page.getByRole("navigation").getByRole("button", { name: loc.nav }).isVisible()
      && (await page.getByRole("banner").innerText()).includes(loc.title)
      && (await page.getAttribute("main", "aria-label")) === loc.main
      && (await page.getAttribute("html", "lang")) === loc.lang,
    `Locale ${loc.lang}: nav label, top bar title, main label and html lang`);
}
await page.getByRole("button", { name: /^[A-Z]{2}, / }).click();
check(JSON.stringify(await page.getByRole("option").allInnerTexts()) === JSON.stringify(["English", "Deutsch\nGerman", "Français\nFrench", "Gaeilge\nIrish", "日本語\nJapanese", "ไทย\nThai"])
    && (await page.getByRole("option", { name: "Gaeilge Irish" }).count()) === 1,
  "Language picker: each option is named by its visible text (native name, then English name)");
await page.keyboard.press("Escape");
// Each screen's heading follows the locale: generate, upload, sarif, about.
// innerText puts a space after the inline logo, so "lumina?" reads "lumina ?".
const TITLES = {
  de: ["Repository oder Modell prüfen", "SBOM-Datei prüfen", "SARIF-Konformitätsprotokoll lesen", "Was lumina ist."],
  fr: ["Vérifier un dépôt ou un modèle", "Vérifier un fichier SBOM", "Lire un journal de conformité SARIF", "Qu'est-ce que lumina ?"],
  ga: ["Seiceáil stór nó samhail", "Seiceáil comhad SBOM", "Léigh logchomhad comhlíonta SARIF", "Cad é lumina ?"],
  ja: ["リポジトリまたはモデルをチェック", "SBOM ファイルをチェック", "SARIF 適合性ログを読み込む", "lumina とは"],
  th: ["ตรวจสอบรีโพซิทอรีหรือโมเดล", "ตรวจสอบไฟล์ SBOM", "อ่านบันทึกความสอดคล้อง SARIF", "lumina คืออะไร"],
};
for (const [code, label] of [["de", /Deutsch/], ["fr", /Français/], ["ga", /Gaeilge/], ["ja", /日本語/], ["th", /ไทย/]]) {
  await page.getByRole("button", { name: /^[A-Z]{2}, / }).click();
  await page.getByRole("option", { name: label }).click();
  const heads = [];
  for (let i = 0; i < 4; i++) {
    await page.getByRole("navigation").getByRole("button").nth(i).click();
    await page.waitForTimeout(150);
    heads.push((await page.locator("main h1").innerText()).replace(/\s+/g, " ").trim());
  }
  check(JSON.stringify(heads) === JSON.stringify(TITLES[code]), `Locale ${code}: each screen's heading is translated ${JSON.stringify(heads)}`);
}
await page.getByRole("button", { name: /^[A-Z]{2}, / }).click();
await page.getByRole("option", { name: /^English/ }).click();
const missingKeys = await page.evaluate(() => {
  const { STRINGS } = window.LUMINA_I18N;
  return Object.entries(STRINGS).flatMap(([code, cat]) => Object.keys(STRINGS.en).filter(k => cat[k] === undefined).map(k => `${code}:${k}`));
});
check(missingKeys.length === 0, `every catalogue has every shell key ${JSON.stringify(missingKeys)}`);

// Round 2 accessibility: document titles, focus on navigation, language of parts,
// headings in a result, minimum text size, and the language picker's keyboard.
await page.getByRole("button", { name: /^[A-Z]{2}, / }).click();
await page.getByRole("option", { name: /^English/ }).click();
const EN_TITLES = ["Check a repository or model | Lumina", "Check an SBOM file | Lumina", "Read a SARIF conformance log | Lumina", "About | Lumina"];
const gotTitles = [], gotFocus = [];
for (let i = 0; i < 4; i++) {
  await page.getByRole("navigation").getByRole("button").nth(i).click();
  await page.waitForTimeout(150);
  gotTitles.push(await page.title());
  gotFocus.push(await page.evaluate(() => document.activeElement.id));
}
check(JSON.stringify(gotTitles) === JSON.stringify(EN_TITLES), `Document title follows the screen ${JSON.stringify(gotTitles)}`);
check(gotFocus.every(id => id === "main-content"), `Choosing a screen moves focus to its main landmark ${JSON.stringify(gotFocus)}`);
await page.getByRole("button", { name: /^[A-Z]{2}, / }).click();
await page.getByRole("option", { name: /ไทย/ }).click();
await page.getByRole("navigation").getByRole("button").nth(1).click();
check((await page.title()) === "ตรวจสอบไฟล์ SBOM | Lumina", "Document title is translated");
check(await page.evaluate(() => document.querySelector("main h1").closest("[lang]").lang === "th"
    && document.querySelector("main p").closest("[lang]").lang === "en"
    && document.querySelector("main [role=group]").closest("[lang]").lang === "en"),
  "In Thai, the heading is lang=th and the English body is lang=en");
await page.getByRole("button", { name: /^[A-Z]{2}, / }).click();
await page.getByRole("option", { name: /^English/ }).click();
// A result: cluster and section headings, and no text under 12 px.
await page.setInputFiles("#sbom-file", { name: "bsi.spdx.json", mimeType: "application/json", buffer: Buffer.from("{}") });
await page.getByRole("radio", { name: LABELS.bsi }).click();
await page.getByRole("button", { name: "Check SBOM" }).click();
await page.waitForSelector("text=Fields checked", { timeout: 5000 }).catch(() => {});
// The skip link over the rule list: hidden until focused, then jumps past the list.
const skipRules = page.getByRole("link", { name: "Skip the rule list" });
check(await skipRules.count() === 1 && (await skipRules.boundingBox()).width <= 1, "Skip the rule list: one link, hidden until it has focus");
await page.getByRole("button", { name: /Expand all|Collapse all/ }).first().focus().catch(() => {});
await page.keyboard.press("Tab");
check(await page.evaluate(() => document.activeElement.textContent === "Skip the rule list") && (await skipRules.boundingBox()).width > 50,
  "Skip the rule list: Tab reaches it (before the first rule) and it shows");
await page.keyboard.press("Enter");
check(await page.evaluate(() => document.activeElement.id === "after-rules") , "Skip the rule list: Enter moves focus past the list");
const afterSkip = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top > 0 && r.top < innerHeight; });
check(afterSkip, "Skip the rule list: the target is scrolled into view");
await page.keyboard.press("Tab");
check(await page.evaluate(() => !document.activeElement.id.startsWith("rule-toggle-")), "Skip the rule list: the next Tab is not a rule's Show more");
const h2s = await page.locator("main h2").allInnerTexts();
check(h2s.length >= 2, `A result has h2 headings for its clusters and sections ${JSON.stringify(h2s)}`);
const small = await page.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll("#root *")) {
    if (e.closest(".sr-only") || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 12) out.push(`${fs}px ${e.tagName} ${e.textContent.trim().slice(0, 20)}`);
  }
  return out;
});
check(small.length === 0, `No text under 12 px ${JSON.stringify(small.slice(0, 3))}`);
// Language picker: ArrowDown opens it with focus on the selected option; arrows,
// Home and End move; Escape closes and returns focus; Tab closes.
const trigger = page.getByRole("button", { name: /^[A-Z]{2}, / });
await trigger.focus();
await page.keyboard.press("ArrowDown");
const focusName = () => page.evaluate(() => document.activeElement.innerText.replace(/\s+/g, " ").trim());
const k1 = await focusName();
await page.keyboard.press("ArrowDown"); const k2 = await focusName();
await page.keyboard.press("End"); const k3 = await focusName();
await page.keyboard.press("ArrowDown"); const k4 = await focusName();
await page.keyboard.press("Home"); const k5 = await focusName();
check(k1 === "English" && k2 === "Deutsch German" && k3 === "ไทย Thai" && k4 === "English" && k5 === "English",
  `Language picker: focus starts on the selected option and arrows, Home and End move it ${JSON.stringify([k1, k2, k3, k4, k5])}`);
check(await page.evaluate(() => document.querySelectorAll("[role=option][tabindex='0']").length) === 1, "Language picker: one tab stop (roving tabindex)");
await page.keyboard.press("Escape");
check(await page.getByRole("listbox").count() === 0 && (await page.evaluate(() => document.activeElement.getAttribute("aria-haspopup"))) === "listbox", "Language picker: Escape closes it and returns focus to its button");
await trigger.focus(); await page.keyboard.press("Enter");
await page.keyboard.press("Tab");
check(await page.getByRole("listbox").count() === 0 && (await page.evaluate(() => document.activeElement.getAttribute("aria-haspopup"))) === "listbox", "Language picker: Tab closes it and keeps focus on its button");
await trigger.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
check((await page.getAttribute("html", "lang")) === "de", "Language picker: Enter on an option picks it");
await trigger.focus(); await page.keyboard.press("Enter");
await page.getByRole("option", { name: /^English/ }).click();

// Icons are drawn by the Icon component alone (no timer re-runs Lucide).
check(await page.evaluate(() => [...document.querySelectorAll(".lumina-icon")].every(e => e.querySelector("svg"))), "Every icon placeholder is drawn");
const idleCalls = await page.evaluate(() => new Promise(done => {
  let calls = 0; const real = window.lucide.createIcons;
  window.lucide.createIcons = (...args) => { calls++; return real.apply(window.lucide, args); };
  setTimeout(() => { window.lucide.createIcons = real; done(calls); }, 1500);
}));
check(idleCalls === 0, `Nothing re-runs the icon library while the page is idle (${idleCalls} calls in 1.5 s)`);
check(errors.length === 0, `no page or console errors ${JSON.stringify(errors)}`);
await browser.close();
server.close();
console.log(`screenshots: ${outDir}`);
if (failures.length) { console.error(`ERROR: ${failures.length} check(s) failed`); process.exit(1); }
