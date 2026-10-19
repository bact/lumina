/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- regulations, API helpers, the regulation picker and the
// Generate & check screen. The result view every check screen shares is
// ArtifactResult (result-view.jsx).
//
// Every screen renders only what the API returns: the regulation list comes
// from GET /api/v1/regulations, results are SbomCheckResponse objects, and a
// failed request shows the server's own error `detail`.

const { useState: _useSC, useRef: _useRef, useEffect: _useEffect } = React;

// The one place regulation ids get human labels and a short description of
// what the check covers. Which regulations exist, and which are ready, comes
// from GET /api/v1/regulations; an id missing here is shown by its id.
const IMPORT_REGULATIONS = {
  ntia: {
    label: "NTIA Minimum Elements",
    covers: "NTIA 2021 minimum elements: the seven data fields (supplier, component name, version, other unique identifiers, dependency relationship, SBOM author, timestamp). Per-rule results.",
    href: "https://www.ntia.gov/report/2021/minimum-elements-software-bill-materials-sbom",
  },
  bsi: {
    label: "BSI TR-03183-2",
    covers: "BSI TR-03183-2 v2.1 SBOM content requirements (section 5.2). Per-rule, SPDX 3 only: elements SPDX 3.0.1 cannot show are listed as not checked.",
    href: "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03183/BSI-TR-03183-2_v2_1_0.html",
  },
  g7ai: {
    label: "G7 SBOM for AI",
    covers: "G7 2026 SBOM for AI minimum elements. Partial, SPDX 3 only: rules the checker cannot check are listed as not checked.",
    href: "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/SBOM-for-AI_minimum-elements.pdf",
  },
  cisa2026: {
    label: "CISA 2026 Minimum Elements",
    covers: "CISA 2026 minimum elements. Partial, SPDX 3 only: rules the checker cannot check are listed as not checked.",
    href: "https://www.cisa.gov/sites/default/files/2026-07/2026_cisa_sbom_minimum_elements_508c.pdf",
  },
  fsct2024: {
    label: "FSCT 2024 (CISA Framing)",
    covers: "2024 CISA Framing Software Component Transparency, minimum expectation. Partial.",
    href: "https://www.cisa.gov/resources-tools/resources/framing-software-component-transparency-2024",
  },
  mof: {
    label: "Model Openness Framework",
    covers: "Not supported by the checker; the API refuses it with HTTP 501.",
    href: "https://isitopen.ai/",
  },
};

// Preselected on the check screens when the API lists it as ready.
const DEFAULT_REGULATION = "g7ai";

// Example URLs for the Generate & check screen (the demo script, DEMO.md).
// Each fills the URL field and picks the standard the demo uses for it; the
// result is still whatever the server generates and checks.
const DEMO_EXAMPLES = [
  { label: "Model with a dataset", note: "Hugging Face", regulation: "g7ai",
    url: "https://huggingface.co/distilbert/distilbert-base-cased-distilled-squad" },
  { label: "Project with a fastText model", note: "GitHub", regulation: "g7ai",
    url: "https://github.com/bact/sentimentdemo" },
  { label: "Project with ONNX models", note: "GitHub, about 12 s", regulation: "g7ai",
    url: "https://github.com/PyThaiNLP/pythainlp" },
  { label: "Plain Python project", note: "GitHub", regulation: "ntia",
    url: "https://github.com/pallets/flask" },
];

const regulationLabel = (id) => (IMPORT_REGULATIONS[id] && IMPORT_REGULATIONS[id].label) || id;

// Rule clusters per regulation (the cluster segment of the rule id), in order.
// A cluster the result has but this table lacks is still shown, by its code.
const RULE_CLUSTERS = {
  ntia: [
    { code: "DF", name: "Data fields" },
  ],
  bsi: [
    { code: "DOC",  name: "SBOM document" },
    { code: "COMP", name: "Components" },
  ],
  g7ai: [
    { code: "MD",  name: "Metadata" },
    { code: "SLP", name: "System-level properties" },
    { code: "MDL", name: "Models" },
    { code: "DP",  name: "Dataset properties" },
    { code: "INF", name: "Infrastructure" },
    { code: "SP",  name: "Security properties" },
    { code: "KPI", name: "Key performance indicators" },
  ],
  cisa2026: [
    { code: "META", name: "SBOM metadata" },
    { code: "COMP", name: "Component data" },
    { code: "PP",   name: "Practices and processes" },
  ],
  fsct2024: [
    { code: "META", name: "SBOM meta-information" },
    { code: "COMP", name: "Component attributes" },
  ],
};

// ─── API helpers ───────────────────────────────────────────────────────
// The explanation a failed response carries: FastAPI's `detail` (a string,
// or a list of validation errors), else the body text, else the status text.
async function apiErrorMessage(response) {
  const text = await response.text().catch(() => "");
  let detail = "";
  try {
    const body = JSON.parse(text);
    if (typeof body.detail === "string") detail = body.detail;
    else if (Array.isArray(body.detail)) {
      detail = body.detail.map(d => {
        const where = Array.isArray(d.loc) ? d.loc.join(".") + ": " : "";
        const why = d.ctx && d.ctx.error ? ` (${d.ctx.error})` : "";
        return where + (d.msg || JSON.stringify(d)) + why;
      }).join("\n");
    } else if (body.detail !== undefined) detail = JSON.stringify(body.detail);
  } catch (e) {
    detail = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  }
  return `HTTP ${response.status}${response.statusText ? " " + response.statusText : ""}${detail ? ": " + detail : ""}`;
}

// POST and return the SbomCheckResponse, or throw with the server's detail.
async function postForResult(url, init) {
  const response = await fetch(url, { method: "POST", ...init });
  if (!response.ok) throw new Error(await apiErrorMessage(response));
  return response.json();
}

// GET /api/v1/regulations -> { regulations: [{ id, ready }], error }.
function useRegulations() {
  const [state, setState] = _useSC({ regulations: null, error: "" });
  _useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch("/api/v1/regulations");
        if (!response.ok) throw new Error(await apiErrorMessage(response));
        const body = await response.json();
        if (!body || !Array.isArray(body.regulations)) throw new Error("The regulation list is malformed.");
        if (alive) setState({ regulations: body.regulations, error: "" });
      } catch (err) {
        if (alive) setState({ regulations: null, error: String(err.message || err) });
      }
    })();
    return () => { alive = false; };
  }, []);
  return state;
}

// The selected regulation id: until the user picks, DEFAULT_REGULATION when
// it is ready, else the first ready one.
function useSelectedRegulation(regulations) {
  const [picked, setPicked] = _useSC(null);
  const ready = (regulations || []).filter(r => r.ready).map(r => r.id);
  if (picked && ready.includes(picked)) return [picked, setPicked];
  return [ready.includes(DEFAULT_REGULATION) ? DEFAULT_REGULATION : ready[0] || null, setPicked];
}

// ─── RegulationPicker -- radio chips for the regulations the API lists ──
function RegulationPicker({ state, value, onChange, disabled }) {
  if (state.error) return <ErrorCard title="Could not load the regulation list">{state.error}</ErrorCard>;
  if (!state.regulations) return <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Loading regulations…</div>;
  return (
    <div role="radiogroup" aria-label="Regulation" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {state.regulations.map(r => (
        <RegTag key={r.id} role="radio" ariaChecked={value === r.id} active={value === r.id}
          disabled={!r.ready}
          ariaLabel={r.ready ? regulationLabel(r.id) : `${regulationLabel(r.id)} (not supported)`}
          onClick={() => { if (!disabled) onChange(r.id); }}>
          {regulationLabel(r.id)}{r.ready ? null : " (not supported)"}
        </RegTag>
      ))}
    </div>
  );
}

// ─── Generate & check (Mode 1) ─────────────────────────────────────────
// Paste a Git repository or Hugging Face Hub URL; the backend generates an
// SBOM (Pitloom, server-side) and checks it against a regulation:
//   POST /api/v1/artifact/check  -> { job_id }
//   GET  /api/v1/jobs/{job_id}   -> { status, result?, error? }
function ImportScreen() {
  const regs = useRegulations();
  const [regId, setRegId] = useSelectedRegulation(regs.regulations);
  const [url, setUrl] = _useSC("");
  const [phase, setPhase] = _useSC("idle"); // idle | running | done | error
  const [result, setResult] = _useSC(null); // SbomCheckResponse
  const [errorMsg, setErrorMsg] = _useSC("");
  const [exampleNote, setExampleNote] = _useSC(""); // spoken when an example fills the form
  const aliveRef = _useRef(true);
  _useEffect(() => () => { aliveRef.current = false; }, []);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run() {
    const artifactUrl = url.trim();
    if (!artifactUrl || !regId) return;
    setPhase("running"); setResult(null); setErrorMsg("");
    try {
      const { job_id } = await postForResult("/api/v1/artifact/check", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact_url: artifactUrl, regulation_id: regId }),
      });
      // Poll until the job finishes. Jobs are minutes-long at most; a ~2.5s
      // interval keeps the UI responsive without hammering the API.
      while (aliveRef.current) {
        await sleep(2500);
        const poll = await fetch(`/api/v1/jobs/${encodeURIComponent(job_id)}`);
        if (!poll.ok) throw new Error(await apiErrorMessage(poll));
        const rec = await poll.json();
        if (rec.status === "done") {
          if (!aliveRef.current) return;
          setResult(rec.result); setPhase("done"); return;
        }
        if (rec.status === "error") throw new Error(rec.error || "The generation job failed.");
      }
    } catch (err) {
      if (!aliveRef.current) return;
      setErrorMsg(String(err.message || err)); setPhase("error");
    }
  }

  const pick = (id) => { if (phase !== "running") { setRegId(id); setResult(null); setPhase("idle"); } };

  return (
    <ScreenFrame eyebrow="Generate & check" title="Check a repository or model"
      intro="Paste a Git repository URL or a Hugging Face Hub model URL. Lumina generates an SBOM for it (server-side, with Pitloom) and checks it against the regulation you pick.">
      <RegulationPicker state={regs} value={regId} onChange={pick} disabled={phase === "running"} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          icon="link"
          placeholder="https://github.com/owner/repo  ·  https://huggingface.co/org/model"
          label="Artefact URL"
          value={url}
          onChange={setUrl}
          onKeyDown={(e) => { if (e.key === "Enter" && phase !== "running") run(); }}
          disabled={phase === "running"}
          style={{ flex: "1 1 260px", minWidth: 0 }}
        />
        <Button variant="primary" icon={phase === "running" ? "loader" : "play"}
          onClick={run} disabled={phase === "running" || !url.trim() || !regId}>
          {phase === "running" ? "Working…" : "Generate & check"}
        </Button>
      </div>

      <div role="group" aria-labelledby="example-label" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span id="example-label" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Try an example:</span>
        {DEMO_EXAMPLES.map(ex => (
          <Button key={ex.url} size="sm" variant="ghost" title={`${ex.url} (${ex.note})`}
            disabled={phase === "running"}
            onClick={() => {
              setUrl(ex.url); setResult(null); setPhase("idle");
              const known = regs.regulations && regs.regulations.find(r => r.id === ex.regulation);
              if (known && known.ready) setRegId(ex.regulation);
              setExampleNote(`Example chosen: ${ex.label}. The URL field now holds ${ex.url}` +
                (known && known.ready ? ` and ${regulationLabel(ex.regulation)} is selected.` : "."));
            }}>
            {ex.label}
          </Button>
        ))}
      </div>

      <div role="status" className="sr-only">{exampleNote}</div>
      <ResultAnnouncer result={phase === "done" ? result : null} />

      {phase === "running" && (
        <div role="status" style={{ fontSize: 12.5, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} style={{ color: "var(--ink-3)" }} />
          Cloning &amp; generating the SBOM, then checking conformance. A large repository can take a couple of minutes.
        </div>
      )}

      {phase === "error" && <ErrorCard>{errorMsg}</ErrorCard>}
      {phase === "done" && result && <ArtifactResult result={result} />}

      <MarginNote title="What gets generated?">
        Lumina generates the SBOM on the server with{" "}
        <a href="https://github.com/bact/pitloom" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", borderBottom: "1px solid var(--ink-4)", paddingBottom: 1, textDecoration: "none" }}>Pitloom</a>{" "}
        (SPDX 3 JSON-LD). For a Git URL it shallow-clones the repository and reads its Python packaging metadata; for a Hugging Face URL it reads model metadata through the Hugging Face API &mdash; no model files are downloaded. Already have an SBOM or a SARIF log? Use <em>Upload SBOM</em> or <em>Import SARIF</em>.
      </MarginNote>
    </ScreenFrame>
  );
}

// ─── ScreenFrame -- heading + column every check screen uses ──────────
function ScreenFrame({ eyebrow, title, intro, children }) {
  return (
    <div className="screen-frame" style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 880, margin: "0 auto" }}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>{intro}</p>
      </div>
      {children}
    </div>
  );
}

Object.assign(window, {
  IMPORT_REGULATIONS, RULE_CLUSTERS, DEFAULT_REGULATION, DEMO_EXAMPLES, regulationLabel, apiErrorMessage, postForResult,
  useRegulations, useSelectedRegulation, RegulationPicker, ScreenFrame,
  ImportScreen,
});
