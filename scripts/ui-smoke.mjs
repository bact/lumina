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
//   - a verdict-only result (BSI) shows the verdict and no counts.
// It writes one screenshot per state to the output directory.
//
// Needs Node 18+ and, in one node_modules directory (not committed):
//   playwright-core react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0 lucide
// The page's CDN scripts are served from there, so no network is used.
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
const TOOL = { tool_name: "ntia-conformance-checker", tool_version: "0.0.0-mock" };
const NTIA_RESULT = {
  conformance: {
    regulation_id: "ntia", source: "ntia-conformance-checker", total: 7, present: 6, missing: 1, unverified: 0,
    gaps: [{ component_id: "SPDXRef-Package", field_key: "supplier", level: "missing", note: "Component 'glibc' is missing component supplier." }],
    rules: ["Component supplier", "Component name", "Component version", "Component identifier",
      "Dependency relationships", "SBOM author", "SBOM timestamp"].map((title, i) => ({
      rule_id: `BOM-NTIA2021-DF-00${i + 1}`, cluster: "DF", title, provision: "requirement",
      outcome: i === 0 ? "missing" : "present",
    })),
    system_judged_by_model: null,
  },
  run: { ...TOOL, generator: "pitloom 0.0.0-mock", execution_successful: true,
    notifications: [{ level: "warning", message: "Mock Pitloom warning.", descriptor_id: "pitloom.log" }] },
  embedded_sbom: null,
};
const BSI_RESULT = {
  conformance: { regulation_id: "bsi", source: "ntia-conformance-checker", total: 0, present: 0, missing: 0, unverified: 0, gaps: [], rules: [], system_judged_by_model: null },
  run: { ...TOOL, generator: "", execution_successful: true, notifications: [{
    level: "error", descriptor_id: "sbom.verdict",
    message: "The SBOM does not conform to the standard. The checker gives no per-requirement detail." }] },
  embedded_sbom: null,
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
    if (body.artifact_url.includes("refuse")) return r.fulfill({ status: 501, json: { detail: DETAIL_501 } });
    return r.fulfill({ status: 202, json: { job_id: "job-1" } });
  });
  await page.route("**/api/v1/jobs/job-1", r => r.fulfill({ json: { status: "done", result: NTIA_RESULT } }));
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

const CDN = {
  "react.development.js": "react/umd/react.development.js",
  "react-dom.development.js": "react-dom/umd/react-dom.development.js",
  "babel.min.js": "@babel/standalone/babel.min.js",
  "lucide.min.js": "lucide/dist/umd/lucide.min.js",
};

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
await page.route(/^https:\/\/unpkg\.com\//, r => {
  const local = CDN[path.basename(new URL(r.request().url()).pathname)];
  return local ? r.fulfill({ path: path.join(nm, local), contentType: "text/javascript" }) : r.abort();
});
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: "", contentType: "text/css" }));
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
  check(checked.length === 1 && checked[0] === LABELS.ntia, `${where}: first ready regulation is selected`);
  await page.getByRole("radio", { name: /Model Openness Framework/ }).click({ force: true });
  const after = await page.$$eval('[role=radio][aria-checked="true"]', els => els.map(e => e.textContent));
  check(after[0] === LABELS.ntia, `${where}: an unsupported regulation cannot be selected`);
}

await page.goto(base);
await page.waitForSelector("nav");

// Generate & check (default screen)
check((await page.getAttribute("main", "aria-label")) === "Generate & check screen", "main landmark label is localised, not a raw id");
await chipsMatchApi("Generate & check");
await noSampleData("Generate & check");
await shot("1-generate");
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
await shot("2-generate-result");

// Upload SBOM
await nav("Upload SBOM");
await chipsMatchApi("Upload SBOM");
await noSampleData("Upload SBOM");
await shot("3-upload");
await page.setInputFiles("#sbom-file", { name: "big.spdx.json", mimeType: "application/json", buffer: Buffer.from("{}") });
await page.getByRole("button", { name: "Check SBOM" }).click();
await page.waitForSelector(`text=${DETAIL_413}`, { timeout: 5000 }).catch(() => {});
check((await text()).includes(DETAIL_413), "Upload SBOM: a 413 shows the server detail");
await shot("4-upload-413");
await page.getByRole("radio", { name: LABELS.bsi }).click();
await page.getByRole("button", { name: "Check SBOM" }).click();
await page.waitForSelector("text=Verdict", { timeout: 5000 }).catch(() => {});
body = await text();
check(body.includes("does not conform") && !body.includes("Fields checked") && !body.includes("No conformance gaps"),
  "Upload SBOM: BSI shows the verdict, no counts and no 'no gaps' banner");
await shot("5-upload-bsi-verdict");
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
