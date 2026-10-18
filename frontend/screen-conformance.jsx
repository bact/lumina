/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- regulations, API helpers, the Generate & check screen and
// the result view every check screen shares.
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
    covers: "BSI TR-03183-2. The checker reports a verdict only (conforms or not), with no per-rule detail.",
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

const regulationLabel = (id) => (IMPORT_REGULATIONS[id] && IMPORT_REGULATIONS[id].label) || id;

// Rule clusters per regulation (the cluster segment of the rule id), in order.
// A cluster the result has but this table lacks is still shown, by its code.
const RULE_CLUSTERS = {
  ntia: [
    { code: "DF", name: "Data fields" },
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

// The selected regulation id: the first ready one until the user picks.
function useSelectedRegulation(regulations) {
  const [picked, setPicked] = _useSC(null);
  const ready = (regulations || []).filter(r => r.ready).map(r => r.id);
  return [picked && ready.includes(picked) ? picked : ready[0] || null, setPicked];
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
          style={{ flex: 1, minWidth: 320 }}
        />
        <Button variant="primary" icon={phase === "running" ? "loader" : "play"}
          onClick={run} disabled={phase === "running" || !url.trim() || !regId}>
          {phase === "running" ? "Working…" : "Generate & check"}
        </Button>
      </div>

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
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 880, margin: "0 auto" }}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>{intro}</p>
      </div>
      {children}
    </div>
  );
}

// ─── RuleClusters -- per-rule outcomes grouped by cluster ───────────────
// "Not applicable" and "out of scope" rules are listed but never counted as
// missing: out-of-scope rules are catalogue-only, the checker cannot check them.
const RULE_CHIP = {
  present: { status: "present" },
  missing: { status: "missing" },
  "not-applicable": { status: "neutral", label: "Not applicable" },
  "out-of-scope": { status: "neutral", label: "Not checked" },
};

function ruleClusters(regulationId, rules) {
  const known = RULE_CLUSTERS[regulationId] || [];
  const codes = known.map(cl => cl.code);
  rules.forEach(r => { if (!codes.includes(r.cluster)) codes.push(r.cluster); });
  return codes.map(code => ({
    code,
    name: (known.find(cl => cl.code === code) || {}).name || code || "Other",
    rules: rules.filter(r => r.cluster === code),
  })).filter(cl => cl.rules.length > 0);
}

function RuleClusters({ regulationId, rules, judgedByModel }) {
  const count = (list, outcome) => list.filter(r => r.outcome === outcome).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {regulationId === "g7ai" && judgedByModel && (
        <MarginNote title="System judged by model">
          This SBOM describes only one AI model and nothing else. The system-level rules were judged by that model, <Mono>{judgedByModel}</Mono>.
        </MarginNote>
      )}
      {ruleClusters(regulationId, rules).map(cl => (
        <Card key={cl.code} padding={0}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 500, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>{cl.name}</span>
            <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>
              {count(cl.rules, "present")} present · {count(cl.rules, "missing")} missing · {count(cl.rules, "not-applicable")} not applicable · {count(cl.rules, "out-of-scope")} not checked
            </span>
          </div>
          {cl.rules.map((r, i) => {
            const chip = RULE_CHIP[r.outcome] || { status: "neutral", label: r.outcome };
            return (
              <div key={r.rule_id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "9px 16px", borderBottom: i < cl.rules.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ flex: "0 0 112px", paddingTop: 1 }}><StatusChip status={chip.status}>{chip.label}</StatusChip></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--ink)" }}>{r.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    <Mono>{r.rule_id.split("-").slice(2).join("-")}</Mono>{r.provision ? <> · {r.provision}</> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}

// ─── ArtifactResult -- render one SbomCheckResponse ────────────────────
// Counts, per-rule outcomes, gaps and run notifications, exactly as the API
// returned them. Three honest states replace the counts:
//   - the SBOM could not be checked (run.execution_successful is false);
//   - nothing was checked (an `sbom.nothing-applies` notification);
//   - a verdict-only result (an `sbom.verdict` notification and no counts,
//     rules or gaps, as BSI gives today): the verdict is the result.
function ArtifactResult({ result }) {
  const c = result.conformance || {};
  const run = result.run || {};
  const notes = run.notifications || [];
  const gaps = c.gaps || [];
  const rules = c.rules || [];
  const ok = run.execution_successful !== false;
  const nothingApplies = notes.some(n => n.descriptor_id === "sbom.nothing-applies");
  const verdict = notes.find(n => n.descriptor_id === "sbom.verdict");
  const verdictOnly = ok && !nothingApplies && verdict && rules.length === 0 && gaps.length === 0
    && !(c.total > 0) && !(c.missing > 0);
  const showFindings = ok && !nothingApplies && !verdictOnly;
  const listed = verdictOnly ? notes.filter(n => n !== verdict) : notes;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <RunLine result={result} />

      {ok && nothingApplies && (
        <Card variant="default" padding={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-2)", fontSize: 14, fontWeight: 500 }}>
            <Icon name="info" size={16} /> Nothing was checked: no rule of this regulation applies to this SBOM
          </div>
        </Card>
      )}
      {!ok && (
        <Card variant="default" padding={16} style={{ borderColor: "var(--shu)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--shu)", fontSize: 14, fontWeight: 500 }}>
            <Icon name="alert-triangle" size={16} /> The SBOM could not be checked
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}>
            See the notifications below.
          </div>
        </Card>
      )}
      {verdictOnly && (
        <Card variant="default" padding={16} style={{ borderColor: verdict.level === "note" ? "var(--moss)" : "var(--ochre)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: verdict.level === "note" ? "var(--moss-ink)" : "var(--ochre-ink)" }}>
            <Icon name={verdict.level === "note" ? "check" : "alert-triangle"} size={16} /> Verdict
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.6 }}>{verdict.message}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
            The checker reports only a verdict for {regulationLabel(c.regulation_id)}, so there are no per-rule counts.
          </div>
        </Card>
      )}

      {showFindings && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${(c.unverified ?? 0) > 0 ? 4 : 3}, 1fr)`, gap: 12 }}>
          <SummaryTile label="Fields checked" value={c.total ?? 0} />
          <SummaryTile label="Present" value={c.present ?? 0} accent="var(--moss)" />
          <SummaryTile label="Missing" value={c.missing ?? 0} accent={(c.missing ?? 0) > 0 ? "var(--ochre)" : undefined} />
          {(c.unverified ?? 0) > 0 && <SummaryTile label="Unverified" value={c.unverified} accent="var(--indigo)" />}
        </div>
      )}

      {showFindings && rules.length > 0 && <RuleClusters regulationId={c.regulation_id} rules={rules} judgedByModel={c.system_judged_by_model} />}

      {showFindings && gaps.length > 0 && (
        <Card padding={0}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 500 }}>
            Gaps ({gaps.length})
          </div>
          <div>
            {gaps.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 16px", borderBottom: i < gaps.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ flex: "0 0 auto", paddingTop: 1 }}><StatusChip status={g.level === "unverified" ? "unverified" : "missing"} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--ink)" }}><Mono>{g.field_key}</Mono></div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.5 }}>
                    {g.component_id ? <>{g.component_id} &middot; </> : null}{g.note}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showFindings && gaps.length === 0 && (
        <Card padding={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--moss)", fontSize: 14, fontWeight: 500 }}>
            <Icon name="check" size={16} /> No conformance gaps found
          </div>
        </Card>
      )}

      {listed.length > 0 && (
        <Card padding={0}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 500 }}>
            Notifications ({listed.length})
          </div>
          <div>
            {listed.map((n, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", borderBottom: i < listed.length - 1 ? "1px solid var(--border)" : "none" }}>
                <StatusChip status={n.level === "error" ? "invalid" : n.level === "warning" ? "missing" : "neutral"}>{n.level}</StatusChip>
                <div style={{ minWidth: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
                  {n.descriptor_id ? <Mono style={{ marginRight: 6 }}>{n.descriptor_id}</Mono> : null}{n.message}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── RunLine -- which regulation, which tool, which generator ──────────
const SOURCE_NOTE = {
  "external-sarif": "a third-party SARIF producer",
  "lumina-internal": "Lumina (the checker did not run)",
};

function RunLine({ result }) {
  const c = result.conformance || {};
  const run = result.run || {};
  const tool = c.source === "lumina-internal" ? "" : [run.tool_name, run.tool_version].filter(Boolean).join(" ");
  return (
    <div style={{ fontSize: 12.5, color: "var(--ink-3)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
      <RegTag active>{regulationLabel(c.regulation_id)}</RegTag>
      {tool ? <span>· run by <Mono>{tool}</Mono></span> : null}
      {SOURCE_NOTE[c.source] ? <span>· from {SOURCE_NOTE[c.source]}</span> : null}
      {run.generator ? <span>· SBOM generated by <Mono>{run.generator}</Mono></span> : null}
    </div>
  );
}

Object.assign(window, {
  ArtifactResult,
  IMPORT_REGULATIONS, RULE_CLUSTERS, regulationLabel, apiErrorMessage, postForResult,
  useRegulations, useSelectedRegulation, RegulationPicker, ScreenFrame,
  ImportScreen, RuleClusters,
});
