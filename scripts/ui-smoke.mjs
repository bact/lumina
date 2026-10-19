// SPDX-FileContributor: Arthit Suriyawongkul
// SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
// SPDX-FileType: SOURCE
// SPDX-License-Identifier: Apache-2.0
//
// UI smoke test for frontend/: serves it from a local HTTP server, mocks every
// /api/ route, visits every side-nav screen in headless Chromium and asserts:
//   - no page errors and no console errors;
//   - none of the old sample-data strings appear;
//   - the regulation chips equal the mocked GET /api/v1/regulations response
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
// The regulation list includes an id the frontend has no label for: the UI
// must show it by id and must not hide or add any entry.
const REGULATIONS = [
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
  "Component supplier": { evidence: [{ ...PKG_EVIDENCE, status: "absent", items: [] }], evidence_more: 3 },
  "Component version": { evidence: [{ ...PKG_EVIDENCE, status: "found",
    items: [{ key: "software_packageVersion", value: "1.0", line: VERSION_LINE }] }], evidence_more: 0 },
};
// 50,000 lines: line n (2..49,999) is `  "key<n>": "value <n>",`.
const BIG_LINES = 50000;
const BIG_TEXT = ["{", ...Array.from({ length: BIG_LINES - 2 }, (_, i) => `  "key${i + 2}": "value ${i + 2}",`), "}"].join("\n");
const BIG_SBOM = { filename: "big.spdx3.json", format: "spdx3-json", text: BIG_TEXT, display: BIG_TEXT, line_count: BIG_LINES };
const posted = [];

const TOOL = { tool_name: "ntia-conformance-checker", tool_version: "0.0.0-mock" };
const NTIA_RESULT = {
  conformance: {
    regulation_id: "ntia", source: "ntia-conformance-checker", total: 7, present: 6, missing: 1, unverified: 0,
    gaps: [{ component_id: "SPDXRef-Package", field_key: "supplier", level: "missing", note: "Component 'glibc' is missing component supplier." }],
    rules: ["Component supplier", "Component name", "Component version", "Component identifier",
      "Dependency relationships", "SBOM author", "SBOM timestamp"].map((title, i) => ({
      rule_id: `BOM-NTIA2021-DF-00${i + 1}`, cluster: "DF", title, provision: "requirement",
      outcome: i === 0 ? "missing" : "present",
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
  conformance: { regulation_id: "g7ai", source: "lumina-internal", total: 0, present: 0, missing: 0, unverified: 0, gaps: [], rules: [], system_judged_by_model: null },
  run: { tool_name: "lumina", tool_version: "", generator: "", execution_successful: false, notifications: [{
    level: "error", descriptor_id: "git.clone-failed", message: "fatal: repository not found" }] },
  embedded_sbom: null,
  generation_log: [
    { source: "lumina", level: "info", message: "Generating an SBOM for https://github.com/o/gone", elapsed_ms: 0 },
    { source: "lumina", level: "error", message: "[git.clone-failed] fatal: repository not found", elapsed_ms: 410 },
  ],
};
const BIG_RESULT = { ...NTIA_RESULT,
  conformance: { ...NTIA_RESULT.conformance, rules: NTIA_RESULT.conformance.rules.map((r, i) => (i !== 1 ? { ...r, evidence: [] }
    : { ...r, evidence: [{ status: "found", element_id: "document", element_type: "SpdxDocument", element_name: null,
      line: 1, end_line: BIG_LINES, items: [{ key: "key40000", value: "value 40000", line: 40000 }] }] })) },
  sbom: BIG_SBOM };
const BSI_RESULT = {
  conformance: { regulation_id: "bsi", source: "ntia-conformance-checker", total: 3, present: 1, missing: 2, unverified: 0, optional_present: 0, optional_missing: 1,
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
  conformance: { regulation_id: "g7ai", source: "ntia-conformance-checker", total: 0, present: 0, missing: 0, unverified: 0, gaps: [], rules: [], system_judged_by_model: null },
  run: { ...TOOL, generator: "", execution_successful: false, notifications: [{
    level: "error", descriptor_id: "spdx.parsing-error", message: "The SBOM could not be read." }] },
  embedded_sbom: null,
};
// A rule in a cluster the frontend has no name for must still be shown.
const SARIF_RESULT = {
  conformance: { regulation_id: "g7ai", source: "external-sarif", total: 2, present: 1, missing: 1, unverified: 0,
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
const DETAIL_501 = "Regulation 'cisa2026' is not supported by ntia-conformance-checker.";

async function mockApi(page) {
  await page.route("**/api/v1/regulations", r => r.fulfill({ json: { regulations: REGULATIONS } }));
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
    if (/name="regulation"\r\n\r\nbsi/.test(raw)) return r.fulfill({ json: BSI_RESULT });
    if (/name="regulation"\r\n\r\ng7ai/.test(raw)) return r.fulfill({ json: UNREADABLE_RESULT });
    return r.fulfill({ status: 413, json: { detail: DETAIL_413 } });
  });
  await page.route("**/api/v1/sarif/import", r => {
    if ((r.request().postData() || "").includes("CISA2025")) return r.fulfill({ status: 422, json: { detail: DETAIL_422 } });
    return r.fulfill({ json: SARIF_RESULT });
  });
}

// ── Static server for frontend/ ──────────────────────────────────────────
const TYPES = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
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
  await page.waitForSelector('[role=radiogroup][aria-label="Regulation"] [role=radio]');
  const chips = await page.$$eval('[role=radiogroup][aria-label="Regulation"] [role=radio]',
    els => els.map(e => ({ text: e.textContent, disabled: e.getAttribute("aria-disabled") === "true" })));
  const expected = REGULATIONS.map(r => ({ label: LABELS[r.id] || r.id, disabled: !r.ready }));
  check(chips.length === expected.length && chips.every((c, i) => c.text.startsWith(expected[i].label) && c.disabled === expected[i].disabled),
    `${where}: regulation chips equal the API list ${JSON.stringify(chips.map(c => c.text))}`);
  const checked = await page.$$eval('[role=radio][aria-checked="true"]', els => els.map(e => e.textContent));
  check(checked.length === 1 && checked[0] === LABELS.g7ai, `${where}: G7 SBOM for AI is preselected`);
  await page.getByRole("radio", { name: /Model Openness Framework/ }).click({ force: true });
  const after = await page.$$eval('[role=radio][aria-checked="true"]', els => els.map(e => e.textContent));
  check(after[0] === LABELS.g7ai, `${where}: an unsupported regulation cannot be selected`);
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
  const toggle = page.getByRole("button", { name: "Show more: Component version" });
  await toggle.click();
  let body = await text();
  check(await page.getByRole("button", { name: "Show less: Component version" }).getAttribute("aria-expanded") === "true"
      && body.includes("software_packageVersion") && body.includes("mock-pkg") && body.includes("software_Package") && body.includes("Found"),
    `${where}: Show more shows the rule's evidence`);
  await page.getByRole("button", { name: "Expand all" }).click();
  body = await text();
  const states = await page.$$eval("button[aria-controls^=rule-details-]", els => els.map(e => e.getAttribute("aria-expanded")));
  check(states.length === 7 && states.every(s => s === "true") && body.includes("No evidence available for this rule")
      && body.includes("and 3 more") && body.includes("Absent"), `${where}: Expand all opens every rule, empty ones say so`);
  await shot("2b-generate-expanded");
  await page.getByRole("button", { name: "Collapse all" }).click();
  check((await page.$$eval("button[aria-controls^=rule-details-]", els => els.map(e => e.getAttribute("aria-expanded")))).every(s => s === "false"),
    `${where}: Collapse all closes every rule`);
  await toggle.click();
  await page.getByRole("button", { name: /^Show mock-pkg in SBOM/ }).first().click();
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
await page.getByRole("button", { name: "Plain Python project" }).click();
check(await page.getByPlaceholder(/github/).inputValue() === "https://github.com/pallets/flask"
  && await page.getByRole("radio", { name: "NTIA Minimum Elements" }).getAttribute("aria-checked") === "true",
  "Generate & check: an example fills the URL and picks its standard");
await page.getByRole("button", { name: "Model with a dataset" }).click();
check((await page.getByPlaceholder(/github/).inputValue()).startsWith("https://huggingface.co/distilbert/")
  && await page.getByRole("radio", { name: "G7 SBOM for AI" }).getAttribute("aria-checked") === "true",
  "Generate & check: the model example fills the URL and picks G7 SBOM for AI");
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
check(posted.at(-1).regulation_id === "g7ai", "Generate & check: the default request names g7ai");
await shot("2-generate-result");
await evidenceAndSource("Generate & check");

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
await page.getByRole("radio", { name: LABELS.g7ai }).click();
await page.getByRole("button", { name: "Check SBOM" }).click();
await page.waitForSelector("text=could not be checked", { timeout: 5000 }).catch(() => {});
body = await text();
check(body.includes("The SBOM could not be checked") && body.includes("spdx.parsing-error") && !body.includes("Fields checked"),
  "Upload SBOM: an unreadable SBOM shows no counts, only why");
await shot("5b-upload-unreadable");

// Import SARIF
await nav("Import SARIF");
await noSampleData("Import SARIF");
await shot("6-sarif");
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
check(REGULATIONS.every(r => body.includes(r.id)), "About: lists every regulation the API returns");
await noSampleData("About");
await shot("9-about");

// Language switch: nav labels and the main label follow the locale.
await page.getByRole("button", { name: /Language/ }).click();
await page.getByRole("option", { name: /Deutsch/ }).click();
check(await page.getByRole("navigation").getByRole("button", { name: "SBOM hochladen" }).isVisible(), "German nav labels");
check((await page.getAttribute("main", "aria-label")) === "Ansicht Über", "German main landmark label");
await shot("10-about-de");

check(errors.length === 0, `no page or console errors ${JSON.stringify(errors)}`);
await browser.close();
server.close();
console.log(`screenshots: ${outDir}`);
if (failures.length) { console.error(`ERROR: ${failures.length} check(s) failed`); process.exit(1); }
