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

function ruleClusters(standardId, rules) {
  const known = RULE_CLUSTERS[standardId] || [];
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

// One element behind a rule: does it have the property the rule asks for?
// Deliberately not "Present" / "Missing": those words are the rule's verdict,
// which depends on every judged element (see ruleExplanation).
const EVIDENCE_CHIP = {
  found: { status: "present", label: "Has it" },
  absent: { status: "missing", label: "Lacks it" },
};

// What each kind of element the checker judges is (ntia-conformance-checker,
// "Kinds of component"); `one` and `many` name it in a sentence.
const ELEMENT_KINDS = {
  system: { one: "root package", many: "root packages", scope: "the system: each root package the SBOM describes" },
  ai_model: { one: "AI model", many: "AI models", scope: "each AI model package" },
  dataset: { one: "dataset", many: "datasets", scope: "each dataset package" },
  component: { one: "component", many: "components", scope: "each component" },
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The value(s) a rule's elements carry, for the default view of a row: the
// `items` of every "found" evidence entry, as the API returned them (a preview
// of at most 160 characters; the details show each in full with its line).
// An element reference "Name (https://...#Id)" is shortened to its name here.
// When the rule judged more than one element, each value is prefixed by its
// element's name, so a Missing rule over two root packages says which one has
// what (and a lone value is never mistaken for the whole rule's answer).
const shortValue = v => {
  const m = /^(.*\S) \((?:[a-z][a-z0-9+.-]*:\/\/|_:)[^\s)]*\)$/i.exec(v);
  return m ? m[1] : v;
};
const MAX_ROW_VALUES = 3;

function ruleValues(rule) {
  const all = Array.isArray(rule.evidence) ? rule.evidence : [];
  const ev = all.filter(e => e.status === "found" && Array.isArray(e.items) && e.items.length > 0);
  const several = all.length > 1; // judged on several elements, found or not
  const seen = new Set();
  const out = [];
  for (const e of ev) {
    for (const it of e.items) {
      const value = shortValue(String(it.value));
      const text = several ? `${e.element_name || e.element_type || "element"}: ${value}` : value;
      if (!seen.has(text)) { seen.add(text); out.push(text); }
    }
  }
  return { values: out.slice(0, MAX_ROW_VALUES), more: Math.max(0, out.length - MAX_ROW_VALUES) };
}

// How many of the judged elements lack the property, when the rule judges
// each element on its own and every one is listed; else null.
function elementCounts(rule) {
  const ev = Array.isArray(rule.evidence) ? rule.evidence : [];
  if (rule.combine || !ELEMENT_KINDS[rule.applies_to] || rule.evidence_more || ev.length === 0) return null;
  const lacks = ev.filter(e => e.status === "absent").length;
  return { total: ev.length, lacks, has: ev.length - lacks };
}

// Plain-language reason for a rule's verdict, from what the API returned
// (outcome, the kind of element it judges, how it combines, the evidence).
// Null when there is nothing to add (a document-level rule).
function ruleExplanation(rule) {
  if (rule.combine === "any-of") {
    return "A composite element: it is Present when at least one of its sub-elements is. The entries below come from the sub-elements; one that lacks the property does not make the rule Missing while another has it.";
  }
  if (rule.combine === "all-of") return "A composite element: it is Present only when all of its sub-elements are.";
  if (rule.combine === "self-only") return "Judged on its own evidence; its sub-elements do not change its outcome.";
  const kind = ELEMENT_KINDS[rule.applies_to];
  if (!kind) return null;
  const c = elementCounts(rule);
  if (!c) return `Judged on ${kind.scope}. It is Present only when every one of them has the property.`;
  const judged = `Judged on ${kind.scope}: ${plural(c.total, kind.one, kind.many)}.`;
  if (c.lacks === 0) return `${judged} Every one has the property, so the rule is Present.`;
  if (c.has === 0) return `${judged} ${c.total === 1 ? "It lacks" : "None has"} the property, so the rule is Missing.`;
  return `${judged} ${c.has} ${c.has === 1 ? "has" : "have"} the property and ${c.lacks} ${c.lacks === 1 ? "lacks" : "lack"} it. A rule is Present only when every judged element has the property, so one that lacks it makes the rule Missing.`;
}

// Short hint under a rule's title, visible without opening the details:
// "1 of 2 root packages lacks it" -- only when some, not all, lack it.
function ruleHint(rule) {
  const c = elementCounts(rule);
  if (!c || c.lacks === 0 || c.has === 0) return "";
  const kind = ELEMENT_KINDS[rule.applies_to];
  return `${c.lacks} of ${plural(c.total, kind.one, kind.many)} ${c.lacks === 1 ? "lacks" : "lack"} it`;
}

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
  const explanation = ruleExplanation(rule);
  if (evidence.length === 0 && more === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {explanation && <p className="rule-details-note">{explanation}</p>}
        <div className="rule-details-empty">No evidence available for this rule</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {explanation && <p className="rule-details-note">{explanation}</p>}
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
                  ariaLabel={`Show in SBOM: ${name}, ${lineRange(ev.line, ev.end_line)}`}>
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
  const { values, more } = ruleValues(rule);
  return (
    <div id={ruleRowId(rule)} className="rule-row" style={{ borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <div className="rule-row-main">
        <div style={{ flex: "0 0 112px", paddingTop: 1 }}><StatusChip status={chip.status}>{chip.label}</StatusChip></div>
        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
          <div style={{ fontSize: 13, color: "var(--ink)" }}>{rule.title}</div>
          {values.length > 0 && (
            <ul className="rule-values" aria-label={`Values in the SBOM for ${rule.title}`}>
              {values.map(v => <li key={v}>{v}</li>)}
              {more > 0 && <li className="rule-values-more">and {more} more in the details</li>}
            </ul>
          )}
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
            <Mono>{rule.rule_id.split("-").slice(2).join("-")}</Mono>{rule.provision ? <> · {rule.provision}</> : null}
            {ruleHint(rule) ? <> · {ruleHint(rule)}</> : null}
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
function RuleClusters({ standardId, rules, judgedByModel, details, expanded, onToggle, onShow }) {
  const count = (list, outcome) => list.filter(r => r.outcome === outcome && !(isOptional(r) && outcome === "missing")).length;
  const notProvided = list => list.filter(r => isOptional(r) && r.outcome === "missing").length;
  const open = expanded || new Set();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {standardId === "g7ai" && judgedByModel && (
        <MarginNote title="System judged by model">
          This SBOM describes only one AI model and nothing else. The system-level rules were judged by that model, <Mono>{judgedByModel}</Mono>.
        </MarginNote>
      )}
      {ruleClusters(standardId, rules).map(cl => (
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
