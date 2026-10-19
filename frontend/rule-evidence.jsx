/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- the per-rule outcomes of a result, grouped by cluster
// (`RuleClusters`), and what the API found in the SBOM for each rule
// (`RuleEvidence`: `rule.evidence`, `rule.evidence_more`).
//
// Each rule row has a Show more / Show less toggle when the result carries an
// SBOM (or any evidence). "Show in SBOM" and the line links call `onShow`
// with a line range of `result.sbom.display`; ArtifactResult (result-view.jsx)
// switches to the source tab.

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

// A rule the standard only permits (BSI "optional") is never a gap: lacking it
// is shown as "Not provided", not "Missing", and counted apart.
const isOptional = r => r.provision === "permission";
const ruleChip = r => (isOptional(r) && r.outcome === "missing"
  ? { status: "neutral", label: "Not provided" }
  : RULE_CHIP[r.outcome] || { status: "neutral", label: r.outcome });

// DOM ids for a rule row and its details (rule ids are unique in a result).
const ruleRowId = r => "rule-" + r.rule_id;
const ruleToggleId = r => "rule-toggle-" + r.rule_id;
const ruleDetailsId = r => "rule-details-" + r.rule_id;

const EVIDENCE_CHIP = {
  found: { status: "present", label: "Found" },
  absent: { status: "missing", label: "Absent" },
};

const lineRange = (from, to) => (to && to > from ? `lines ${from}–${to}` : `line ${from}`);

// A small text-styled button for "Show in SBOM" and line links.
function LinkButton({ children, onClick, ariaLabel }) {
  return (
    <button type="button" className="link-button" onClick={onClick} aria-label={ariaLabel}>{children}</button>
  );
}

// ─── RuleEvidence -- what the SBOM holds for one rule ──────────────────
// `onShow(range, rule)` is absent when the result has no SBOM source.
function RuleEvidence({ rule, onShow }) {
  const evidence = Array.isArray(rule.evidence) ? rule.evidence : [];
  const more = rule.evidence_more || 0;
  if (evidence.length === 0 && more === 0) {
    return <div className="rule-details-empty">No evidence available for this rule</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {evidence.map((ev, i) => {
        const chip = EVIDENCE_CHIP[ev.status] || { status: "neutral", label: ev.status };
        const name = ev.element_name || ev.element_id || "(unnamed element)";
        const items = Array.isArray(ev.items) ? ev.items : [];
        return (
          <div key={i} className="evidence">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <StatusChip status={chip.status}>{chip.label}</StatusChip>
              <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500, overflowWrap: "anywhere" }}>{name}</span>
              {ev.element_type && <Mono style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{ev.element_type}</Mono>}
              {onShow && ev.line ? (
                <LinkButton onClick={() => onShow({ line: ev.line, end_line: ev.end_line || ev.line }, rule)}
                  ariaLabel={`Show ${name} in SBOM, ${lineRange(ev.line, ev.end_line)}`}>
                  Show in SBOM
                </LinkButton>
              ) : null}
            </div>
            {ev.element_name && ev.element_id && (
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, overflowWrap: "anywhere" }}><Mono>{ev.element_id}</Mono></div>
            )}
            {items.length > 0 && (
              <dl className="evidence-items">
                {items.map((it, j) => (
                  <div key={j} className="evidence-item">
                    <dt><Mono>{it.key}</Mono></dt>
                    <dd>
                      <Mono style={{ color: "var(--ink-2)" }}>{it.value}</Mono>
                      {onShow && it.line ? (
                        <LinkButton onClick={() => onShow({ line: it.line, end_line: it.line }, rule)}
                          ariaLabel={`Show ${it.key} in SBOM, line ${it.line}`}>
                          line {it.line}
                        </LinkButton>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}
      {more > 0 && <div className="rule-details-empty">and {more.toLocaleString("en")} more</div>}
    </div>
  );
}

// ─── RuleRow -- one rule, with its details toggle ──────────────────────
function RuleRow({ rule, last, details, expanded, onToggle, onShow }) {
  const chip = ruleChip(rule);
  return (
    <div id={ruleRowId(rule)} className="rule-row" style={{ borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <div className="rule-row-main">
        <div style={{ flex: "0 0 112px", paddingTop: 1 }}><StatusChip status={chip.status}>{chip.label}</StatusChip></div>
        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
          <div style={{ fontSize: 13, color: "var(--ink)" }}>{rule.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
            <Mono>{rule.rule_id.split("-").slice(2).join("-")}</Mono>{rule.provision ? <> · {rule.provision}</> : null}
          </div>
        </div>
        {details && (
          <Button size="sm" variant="ghost" iconAfter={expanded ? "chevron-up" : "chevron-down"}
            id={ruleToggleId(rule)} aria-expanded={expanded} aria-controls={ruleDetailsId(rule)}
            aria-label={`${expanded ? "Show less" : "Show more"}: ${rule.title}`} onClick={() => onToggle(rule.rule_id)}>
            {expanded ? "Show less" : "Show more"}
          </Button>
        )}
      </div>
      {details && (
        <div id={ruleDetailsId(rule)} className="rule-details" hidden={!expanded}>
          {expanded && <RuleEvidence rule={rule} onShow={onShow} />}
        </div>
      )}
    </div>
  );
}

// `details`: whether rows get a toggle (the result has an SBOM or evidence).
// `expanded` is a Set of rule ids, owned by ArtifactResult so it survives a
// switch to the source tab and back.
function RuleClusters({ regulationId, rules, judgedByModel, details, expanded, onToggle, onShow }) {
  const count = (list, outcome) => list.filter(r => r.outcome === outcome && !(isOptional(r) && outcome === "missing")).length;
  const notProvided = list => list.filter(r => isOptional(r) && r.outcome === "missing").length;
  const open = expanded || new Set();
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
              {count(cl.rules, "present")} present · {count(cl.rules, "missing")} missing · {count(cl.rules, "not-applicable")} not applicable · {count(cl.rules, "out-of-scope")} not checked{notProvided(cl.rules) > 0 ? ` · ${notProvided(cl.rules)} optional not provided` : ""}
            </span>
          </div>
          {cl.rules.map((r, i) => (
            <RuleRow key={r.rule_id} rule={r} last={i === cl.rules.length - 1} details={details}
              expanded={open.has(r.rule_id)} onToggle={onToggle} onShow={onShow} />
          ))}
        </Card>
      ))}
    </div>
  );
}

Object.assign(window, { RuleClusters, RuleEvidence, ruleToggleId, ruleRowId });
