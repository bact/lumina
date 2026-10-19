/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- `ArtifactResult`, the result view every check screen
// shares: one SbomCheckResponse rendered exactly as the API returned it.
//
// When the response carries the checked SBOM (`result.sbom`), the view has
// two tabs, "Result" and "SBOM source", and a Download SBOM button; a
// generated SBOM (or a failed generation) adds a "Generator log" tab. Without
// it (older responses, SARIF logs with no embedded JSON SBOM) the view is the
// result alone. "Show in SBOM" in a rule's details switches to the source
// tab at the line range it names and sets the URL hash (#sbom-L57 or
// #sbom-L57-L80); setting such a hash by hand jumps there too.

const { useState: _useSR, useEffect: _useEffR } = React;

const SBOM_HASH_RE = /^#sbom-L(\d+)(?:-L(\d+))?$/;
const sbomHash = (range) => `#sbom-L${range.line}${range.end_line > range.line ? `-L${range.end_line}` : ""}`;

// ─── ResultTabs -- "Result" | "SBOM source" | "Generator log" ──────────
// (WAI-ARIA tabs pattern). `tabs` lists only the views this result has.
const ALL_RESULT_TABS = {
  result: { id: "result", label: "Result" },
  source: { id: "source", label: "SBOM source" },
  log: { id: "log", label: "Generator log" },
};

function ResultTabs({ tabs, tab, onChange }) {
  const onKeyDown = (e) => {
    const i = tabs.findIndex(t => t.id === tab);
    let next = null;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`result-tab-${tabs[next].id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Result views" className="result-tabs" onKeyDown={onKeyDown}>
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" id={`result-tab-${t.id}`}
          aria-selected={tab === t.id} aria-controls="result-panel"
          tabIndex={tab === t.id ? 0 : -1} className="result-tab" onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── ResultAnnouncer -- tells a screen reader the check has finished ────
// Always mounted (a live region only announces changes to one that already
// exists); `result` is the finished SbomCheckResponse, or null. A failed
// request is announced by ErrorCard's own alert.
function ResultAnnouncer({ result }) {
  let message = "";
  if (result) {
    const c = result.conformance;
    message = result.run && result.run.execution_successful === false
      ? "The check could not be completed. See the result for why."
      : `Check finished: ${c.present} present and ${c.missing} missing of ${c.total} rules checked.`;
  }
  return <div role="status" className="sr-only">{message}</div>;
}

// ─── ArtifactResult -- render one SbomCheckResponse ────────────────────
function ArtifactResult({ result }) {
  const sbom = result.sbom && typeof result.sbom.display === "string" ? result.sbom : null;
  const log = Array.isArray(result.generation_log) && result.generation_log.length ? result.generation_log : null;
  const tabs = [ALL_RESULT_TABS.result, ...(sbom ? [ALL_RESULT_TABS.source] : []), ...(log ? [ALL_RESULT_TABS.log] : [])];
  const canDownload = !!(result.sbom && typeof result.sbom.text === "string");
  const [tab, setTab] = _useSR("result");
  const [expanded, setExpanded] = _useSR(() => new Set());
  const [target, setTarget] = _useSR(null);     // { line, end_line, nonce }
  const [origin, setOrigin] = _useSR(null);     // rule id "Show in SBOM" came from
  const [focusRule, setFocusRule] = _useSR(null);

  const jump = (range, rule) => {
    setTarget({ line: range.line, end_line: range.end_line || range.line, nonce: Date.now() + Math.random() });
    setOrigin(rule ? rule.rule_id : null);
    setTab("source");
    try { history.replaceState(null, "", sbomHash(range)); } catch (e) { /* a sandboxed page may refuse */ }
  };

  const back = () => {
    setTab("result");
    setFocusRule(origin);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* as above */ }
  };

  // A #sbom-L<n> hash typed or pasted in this session opens the source there.
  _useEffR(() => {
    if (!sbom) return undefined;
    const onHash = () => {
      const m = SBOM_HASH_RE.exec(location.hash);
      if (m) jump({ line: Number(m[1]), end_line: Number(m[2] || m[1]) }, null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [sbom]);

  // Back on the result tab: bring the rule that linked to the source into view.
  _useEffR(() => {
    if (tab !== "result" || !focusRule) return;
    const el = document.getElementById(ruleToggleId({ rule_id: focusRule }));
    if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); }
    setFocusRule(null);
  }, [tab, focusRule]);

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const resultView = (
    <ResultBody result={result} expanded={expanded} setExpanded={setExpanded} onToggle={toggle}
      onShow={sbom ? jump : null} details={!!sbom} />
  );
  if (tabs.length === 1) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {canDownload && <div><DownloadSbomButton sbom={result.sbom} /></div>}
        {resultView}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="result-header">
        <ResultTabs tabs={tabs} tab={tab} onChange={setTab} />
        {canDownload && <DownloadSbomButton sbom={sbom} />}
      </div>
      <div role="tabpanel" id="result-panel" aria-labelledby={`result-tab-${tab}`}
        tabIndex={tab === "result" ? 0 : undefined} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {tab === "result" ? resultView : tab === "log" ? <GeneratorLog lines={log} /> : (
          <SbomSource sbom={sbom} target={target} onBack={origin ? back : null}
            onJump={(line) => jump({ line, end_line: line }, null)} />
        )}
      </div>
    </div>
  );
}

// ─── ResultBody -- counts, per-rule outcomes, gaps, notifications ──────
// Two honest states replace the counts:
//   - the SBOM could not be checked (run.execution_successful is false);
//   - nothing was checked (an `sbom.nothing-applies` notification).
function ResultBody({ result, expanded, setExpanded, onToggle, onShow, details }) {
  const c = result.conformance || {};
  const run = result.run || {};
  const notes = run.notifications || [];
  const gaps = c.gaps || [];
  const rules = c.rules || [];
  const ok = run.execution_successful !== false;
  const nothingApplies = notes.some(n => n.descriptor_id === "sbom.nothing-applies");
  const showFindings = ok && !nothingApplies;
  const optionalTotal = (c.optional_present ?? 0) + (c.optional_missing ?? 0);
  const withDetails = details || rules.some(r => Array.isArray(r.evidence) && r.evidence.length > 0);
  const allOpen = rules.length > 0 && rules.every(r => expanded.has(r.rule_id));
  return (
    <>
      <RunLine result={result} />

      {ok && nothingApplies && (
        <Card variant="default" padding={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-2)", fontSize: 14, fontWeight: 500 }}>
            <Icon name="info" size={16} /> Nothing was checked: no rule of this standard applies to this SBOM
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
      {showFindings && (
        <div className="summary-tiles" style={{ gridTemplateColumns: `repeat(${3 + ((c.unverified ?? 0) > 0 ? 1 : 0) + (optionalTotal > 0 ? 1 : 0)}, 1fr)` }}>
          <SummaryTile label="Fields checked" value={c.total ?? 0} />
          <SummaryTile label="Present" value={c.present ?? 0} accent="var(--moss)" />
          <SummaryTile label="Missing" value={c.missing ?? 0} accent={(c.missing ?? 0) > 0 ? "var(--ochre)" : undefined} />
          {(c.unverified ?? 0) > 0 && <SummaryTile label="Unverified" value={c.unverified} accent="var(--indigo)" />}
          {optionalTotal > 0 && <SummaryTile label="Optional provided" value={`${c.optional_present ?? 0} of ${optionalTotal}`} />}
        </div>
      )}

      {showFindings && rules.length > 0 && withDetails && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
          <Button size="sm" variant="ghost" icon={allOpen ? "chevrons-down-up" : "chevrons-up-down"}
            onClick={() => setExpanded(allOpen ? new Set() : new Set(rules.map(r => r.rule_id)))}>
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      )}
      {showFindings && rules.length > 0 && (
        <RuleClusters standardId={c.standard_id} rules={rules} judgedByModel={c.system_judged_by_model}
          details={withDetails} expanded={expanded} onToggle={onToggle} onShow={onShow} />
      )}

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
                  <div style={{ fontSize: 13, color: "var(--ink)", overflowWrap: "anywhere" }}><Mono>{g.field_key}</Mono></div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.5, overflowWrap: "anywhere" }}>
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

      {notes.length > 0 && (
        <Card padding={0}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 500 }}>
            Notifications ({notes.length})
          </div>
          <div>
            {notes.map((n, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", borderBottom: i < notes.length - 1 ? "1px solid var(--border)" : "none" }}>
                <StatusChip status={n.level === "error" ? "invalid" : n.level === "warning" ? "missing" : "neutral"}>{n.level}</StatusChip>
                <div style={{ minWidth: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
                  {n.descriptor_id ? <Mono style={{ marginRight: 6 }}>{n.descriptor_id}</Mono> : null}{n.message}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

// ─── RunLine -- which standard, which tool, which generator ──────────
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
      <StandardTag active>{standardLabel(c.standard_id)}</StandardTag>
      {tool ? <span>· run by <Mono>{tool}</Mono></span> : null}
      {SOURCE_NOTE[c.source] ? <span>· from {SOURCE_NOTE[c.source]}</span> : null}
      {run.generator ? <span>· SBOM generated by <Mono>{run.generator}</Mono></span> : null}
    </div>
  );
}

Object.assign(window, { ArtifactResult, ResultAnnouncer, ResultTabs });
