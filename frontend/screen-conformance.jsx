/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- Conformance + Import screens
//
// Conformance shows one regulation at a time, with a big % completeness header
// and per-field cards listing which components are missing the field, plus
// "Where to look" guidance pulled from data.findHints.

const { useState: _useSC, useRef: _useRef, useEffect: _useEffect } = React;

function ConformanceScreen({ data, onOpenComponent }) {
  const activeRegInit = data.regulations.find(r => r.active)?.id || data.regulations[0].id;
  const [activeReg, setActiveReg] = _useSC(activeRegInit);

  const reg = data.regulations.find(r => r.id === activeReg);
  const summary = data.regSummary(activeReg);
  const pct = summary.total > 0 ? Math.round((summary.present / summary.total) * 100) : 100;
  const inScopeCount = data.componentsForReg(reg).length;

  return (
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 22, maxWidth: 1240, margin: "0 auto" }}>
      <div>
        <Eyebrow>Conformance</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>What the regulations ask for</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>Pick a regulation. Lumina compares your SBOM against its minimum fields, shows what's missing, and points to where the answer usually lives.</p>
      </div>

      {/* Regulation picker -- single-select chip strip (radio group).
         auto-fit so adding/removing regulations doesn't break the layout. */}
      <div role="radiogroup" aria-label="Active regulation" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {data.regulations.map(r => {
          const sel = r.id === activeReg;
          const s = data.regSummary(r.id);
          const rPct = s.total > 0 ? Math.round((s.present / s.total) * 100) : 100;
          // For tiered regs, surface the strongest qualified class as the
          // headline summary (e.g. "Class III") -- it's more useful than a
          // mean-across-fields percentage when the model is being judged
          // on a ladder.
          let headline = `${rPct}%`;
          if (r.tiered && s.tiers) {
            const ids = s.tiers.map(t => t.qualified).filter(x => x != null);
            const best = ids.length ? Math.min(...ids) : null;  // smaller id = stronger class
            headline = best == null ? "--" : (r.classes.find(c => c.id === best)?.label || "--");
          }
          return (
            <Card key={r.id} variant={sel ? "default" : "recessed"} padding={14} onClick={() => setActiveReg(r.id)}
              role="radio"
              ariaChecked={sel}
              ariaLabel={`${r.name}. ${r.tiered ? `Best qualified class: ${headline}` : `${rPct}% present`}. ${r.fields.length} required fields${r.scope === "ai" ? ", AI scope" : ""}.`}
              style={{ borderColor: sel ? "var(--ink)" : "var(--border-soft)", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <RegTag active={sel}>{r.tag}</RegTag>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: sel ? "var(--ink-2)" : "var(--ink-3)" }}>{headline}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 10, color: sel ? "var(--ink)" : "var(--ink-2)" }}>{r.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
                {r.fields.length} required fields{r.scope === "ai" ? (r.kind === "model" ? " · model scope" : " · AI scope") : ""}
              </div>
              <div style={{ display: "flex", height: 3, marginTop: 12, borderRadius: 999, overflow: "hidden", background: "var(--paper-3)" }}>
                <span style={{ flex: s.present, background: "var(--moss)" }} />
                <span style={{ flex: s.unverified, background: "var(--indigo)" }} />
                <span style={{ flex: s.missing, background: "var(--ochre)" }} />
              </div>
            </Card>
          );
        })}
      </div>

      {reg.tiered
        ? <MofTierLadder reg={reg} summary={summary} />
        : <ConformancePercentCard reg={reg} summary={summary} pct={pct} inScopeCount={inScopeCount} />}

      <MarginNote title="A note --" onLearnMore={() => {}} onDismiss={() => {}}>
        {reg.tiered
          ? <>MOF is a <strong>tiered</strong> openness assessment, not a pass/fail check. Each model is awarded the highest class it fully satisfies; the field cards below are grouped by class, so you can see exactly what each model would need to climb the ladder.</>
          : <>Lumina checks <strong>fields</strong>, not just files. Each card below counts how many in-scope components have the field filled, lists the ones that don't, and shows where that information usually lives.</>}
      </MarginNote>

      {/* Required fields -- per-field card list (grouped by class for tiered regs) */}
      {reg.tiered
        ? <MofFieldsByClass reg={reg} data={data} onOpenComponent={onOpenComponent} />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reg.fields.map(f => (
              <FieldCard key={f.key} field={f} reg={reg} data={data} onOpenComponent={onOpenComponent} />
            ))}
          </div>
        )}
    </div>
  );
}

// ─── ConformancePercentCard ─ standard "% present" summary header ──────
function ConformancePercentCard({ reg, summary, pct, inScopeCount }) {
  return (
    <Card padding={24}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <RegTag active>{reg.tag}</RegTag>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.018em" }}>{reg.name}</h2>
            <Mono style={{ color: "var(--ink-3)", fontSize: 13 }}>{reg.version}</Mono>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
            Checked against {inScopeCount} {reg.scope === "ai" ? "AI element" + (inScopeCount === 1 ? "" : "s") : "component" + (inScopeCount === 1 ? "" : "s")} · {reg.fields.length} required fields
          </p>
        </div>
        {summary.missing === 0 && summary.unverified === 0
          ? <StatusChip status="present">Conformant</StatusChip>
          : <StatusChip status="missing">{summary.missing + summary.unverified} gaps</StatusChip>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 32, alignItems: "center", marginTop: 22 }}>
        <div>
          <div aria-hidden="true" style={{ fontSize: 64, fontWeight: 300, letterSpacing: "-0.028em", lineHeight: 1, color: summary.missing === 0 ? "var(--moss)" : "var(--ink)" }}>{pct}%</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
            <strong style={{ color: "var(--ink-2)", fontWeight: 500 }}>{summary.present}</strong> of <strong style={{ color: "var(--ink-2)", fontWeight: 500 }}>{summary.total}</strong> required fields present
          </div>
        </div>
        <div>
          <div role="progressbar"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}
            aria-label={`${reg.tag} required-field completeness: ${pct}%`}
            style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "var(--paper-3)" }}>
            <span style={{ flex: summary.present, background: "var(--moss)" }} />
            <span style={{ flex: summary.unverified, background: "var(--indigo)" }} />
            <span style={{ flex: summary.missing, background: "var(--ochre)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
            <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "var(--moss)", marginRight: 6, verticalAlign: "middle" }} />{summary.present} present</span>
            <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "var(--indigo)", marginRight: 6, verticalAlign: "middle" }} />{summary.unverified} unverified</span>
            <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "var(--ochre)", marginRight: 6, verticalAlign: "middle" }} />{summary.missing} missing</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── MofTierLadder ─ per-model class assessment + progress to next ────
//
// MOF is tiered, not pass/fail. Each model gets a row showing the highest
// class it fully satisfies plus progress toward the next one up (e.g.
// "Class III · in progress to Class II 60%"). Mirrors the readout style
// used by https://mot.isitopen.ai/ so users coming from that tool feel
// at home.
function MofTierLadder({ reg, summary }) {
  const tiers = summary.tiers || [];
  return (
    <Card padding={24}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <RegTag active>{reg.tag}</RegTag>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.018em" }}>{reg.name}</h2>
            <Mono style={{ color: "var(--ink-3)", fontSize: 13 }}>{reg.version}</Mono>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.55, maxWidth: 640 }}>
            Per-model openness class. Each model is awarded the highest class for which all required
            disclosures are present; the bar shows progress to the next class up.
          </p>
        </div>
      </div>

      {/* Legend -- one row describing what each class means */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 18 }}>
        {reg.classes.map(cls => (
          <div key={cls.id} style={{
            border: "1px solid var(--border-soft)", borderRadius: 3, padding: "10px 12px",
            background: "var(--paper-2)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-2)", fontWeight: 500 }}>{cls.label}</span>
              <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>{cls.subtitle}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.5 }}>{cls.description}</div>
          </div>
        ))}
      </div>

      {/* Per-model rows */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column" }}>
        {tiers.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 4px" }}>No models in scope.</div>
        )}
        {tiers.map((t, i) => <MofModelRow key={t.component.id} tier={t} reg={reg} isLast={i === tiers.length - 1} />)}
      </div>
    </Card>
  );
}

function MofModelRow({ tier, reg, isLast }) {
  const { component: c, qualified, next, progress, perClass } = tier;
  const qualifiedCls = qualified ? reg.classes.find(x => x.id === qualified) : null;
  // Bar widths per class -- cumulative: each segment shows the share of that
  // class's fields the model has so far.
  return (
    <div style={{
      padding: "14px 0",
      borderBottom: isLast ? 0 : "1px solid var(--border-soft)",
      display: "grid", gridTemplateColumns: "260px 1fr 220px", gap: 18, alignItems: "center",
    }}>
      {/* Identity */}
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}>{c.name}</div>
        <Mono style={{ fontSize: 11, color: "var(--ink-3)" }}>{c.version} · {c.ecosystem}</Mono>
      </div>

      {/* Class progression bar -- three segments, one per class, with the
         qualified ones filled solid and the next-up one filled partially. */}
      <div>
        <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "var(--paper-3)", gap: 2 }}
          role="img"
          aria-label={qualifiedCls
            ? `${c.name}: qualifies for ${qualifiedCls.label} (${qualifiedCls.subtitle}).` + (next ? ` Progress toward ${next.label}: ${progress.present} of ${progress.total} fields.` : " Top class achieved.")
            : `${c.name}: below Class III. ${perClass[3].present} of ${perClass[3].total} Class III fields present.`}>
          {[3, 2, 1].map(id => {
            const pc = perClass[id];
            const filled = qualified !== null && id >= qualified;
            const partial = next && id === next.id;
            const fillPct = filled ? 100 : partial ? Math.round((pc.present / pc.total) * 100) : 0;
            const color = id === 3 ? "var(--moss)" : id === 2 ? "var(--shu)" : "var(--indigo)";
            return (
              <div key={id} style={{ flex: 1, background: "var(--paper-3)", position: "relative", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${fillPct}%`, background: color, transition: "width var(--dur-base)" }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
          <span>III · {perClass[3].present}/{perClass[3].total}</span>
          <span>II · {perClass[2].present}/{perClass[2].total}</span>
          <span>I · {perClass[1].present}/{perClass[1].total}</span>
        </div>
      </div>

      {/* Headline status */}
      <div style={{ textAlign: "right" }}>
        {qualifiedCls ? (
          <>
            <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{qualifiedCls.label}</span>
              <span style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{qualifiedCls.subtitle}</span>
            </div>
            {next ? (
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
                {Math.round((progress.present / progress.total) * 100)}% to {next.label}
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: "var(--moss-ink)", marginTop: 4 }}>Top class</div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ochre-ink)" }}>Below III</span>
              <span style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>Not yet open</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
              {Math.round((perClass[3].present / perClass[3].total) * 100)}% to Class III
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MofFieldsByClass ─ group the per-field cards under each class ────
function MofFieldsByClass({ reg, data, onOpenComponent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {reg.classes.map(cls => {
        const fields = reg.fields.filter(f => f.cls === cls.id);
        return (
          <div key={cls.id}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <Eyebrow>{cls.label}</Eyebrow>
              <span style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>{cls.subtitle}</span>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>· {fields.length} disclosures</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {fields.map(f => <FieldCard key={f.key} field={f} reg={reg} data={data} onOpenComponent={onOpenComponent} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldCard({ field, reg, data, onOpenComponent }) {
  const inScope = data.componentsForReg(reg).filter(c => data.fieldAppliesTo(field, c, reg));
  const missing = inScope.filter(c => !data.componentFieldForReg(c, field, reg).present);
  const unverified = field.key === "provenance"
    ? inScope.filter(c => data.componentFieldForReg(c, field, reg).present && c.provenance && !c.provenance.signed)
    : [];
  const ok = missing.length === 0 && unverified.length === 0;
  const presentCount = inScope.length - missing.length - unverified.length;
  const hint = data.findHints[field.key];

  const dotColor = missing.length > 0 ? "var(--ochre)"
                 : unverified.length > 0 ? "var(--indigo)"
                 : "var(--moss)";

  return (
    <Card padding={0} variant={ok ? "recessed" : "default"}>
      <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: dotColor, flex: "0 0 8px" }} />
            <span style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>{field.label}</span>
            <Mono style={{ fontSize: 11, color: "var(--ink-3)" }}>{field.cite}</Mono>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.55, maxWidth: 720 }}>{field.rationale}</div>
        </div>
        <div style={{ textAlign: "right", minWidth: 140 }}>
          <Mono style={{ fontSize: 13, color: "var(--ink-2)" }}>{presentCount}/{inScope.length}</Mono>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>components with this field</div>
          <div style={{ display: "flex", height: 4, marginTop: 8, borderRadius: 999, overflow: "hidden", background: "var(--paper-3)", width: 140, marginLeft: "auto" }}>
            <span style={{ flex: presentCount, background: "var(--moss)" }} />
            <span style={{ flex: unverified.length, background: "var(--indigo)" }} />
            <span style={{ flex: missing.length, background: "var(--ochre)" }} />
          </div>
        </div>
      </div>

      {(missing.length > 0 || unverified.length > 0) && (
        <div style={{ padding: "0 20px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            {missing.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--ochre-ink)", marginBottom: 8, fontWeight: 500 }}>
                  Missing on {missing.length} {missing.length === 1 ? "component" : "components"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {missing.map(c => (
                    <span key={c.id} onClick={() => onOpenComponent && onOpenComponent(c)} style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, padding: "3px 8px",
                      background: "var(--ochre-soft)", color: "var(--ochre-ink)", borderRadius: 2,
                      cursor: onOpenComponent ? "pointer" : "default",
                    }}>{c.name}</span>
                  ))}
                </div>
              </div>
            )}
            {unverified.length > 0 && (
              <div style={{ marginTop: missing.length > 0 ? 12 : 0 }}>
                <div style={{ fontSize: 11, color: "var(--indigo-ink)", marginBottom: 8, fontWeight: 500 }}>
                  Unverified on {unverified.length} {unverified.length === 1 ? "component" : "components"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {unverified.map(c => (
                    <span key={c.id} onClick={() => onOpenComponent && onOpenComponent(c)} style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, padding: "3px 8px",
                      background: "var(--indigo-soft)", color: "var(--indigo-ink)", borderRadius: 2,
                      cursor: onOpenComponent ? "pointer" : "default",
                    }}>{c.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {hint && missing.length > 0 && <WhereToLook hint={hint} />}
        </div>
      )}
    </Card>
  );
}

// ─── WhereToLook -- small inline panel with the "find this info" sources ──
function WhereToLook({ hint }) {
  return (
    <div style={{ background: "var(--paper-2)", border: "1px solid var(--border-soft)", borderRadius: 2, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ width: 5, height: 5, background: "var(--shu)", borderRadius: 999 }} />
        <span style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--shu-deep)" }}>Where to look</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {hint.sources.map((s, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, fontSize: 11.5, lineHeight: 1.5 }}>
            <span style={{ color: "var(--ink)", fontWeight: 500 }}>{s.who}</span>
            <span style={{ color: "var(--ink-3)" }}>{s.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Import / Upload screen ─────────────────────────────────────────────
//
// "Bring an SBOM into Lumina." Art's framing settled the arrow direction
// debate: up/down arrows mean opposite things to different people (upload
// vs. download mental models clash), so we use the horizontal "into a box"
// metaphor -- `log-in` for import here, `log-out` for export elsewhere.
//
// The drop area is the *only* ingress: drop a file, paste a GitHub repo
// URL, or paste a Hugging Face Hub URL. Lumina does not generate SBOMs
// itself -- for that, run Pitloom locally and bring the result back here.
// (Large model files like GGUF would be infeasible to drop into a browser
// tab anyway; metadata extraction belongs on the user's machine.)
// ImportScreen -- Mode 1 (artefact URL). Paste a Git repository or Hugging Face
// Hub URL; the backend generates an SBOM (Pitloom, server-side) and checks it
// against a regulation. This talks to the real API:
//   POST /api/v1/artifact/check  -> { job_id }
//   GET  /api/v1/jobs/{job_id}   -> { status, result?, error? }
//
// TODO (not done yet): this is the ONLY screen wired to real backend results.
// It is deliberately self-contained -- it renders its own compact result panel
// from SbomCheckResponse and does NOT feed the data.js-driven viewer screens
// (Overview, Inventory, Graph, Conformance), which still show static prototype
// data. Mapping SbomCheckResponse + the generated SBOM into those screens'
// data model is the remaining integration work. See docs/design.md
// "Implementation status (Stage 0)".
// Regulations the checker can report on a generated SBOM (see
// CHECKER_STANDARDS in backend/app/conformance.py).
const IMPORT_REGULATIONS = [
  { id: "ntia", label: "NTIA Minimum Elements" },
  { id: "g7ai", label: "G7 SBOM for AI" },
  { id: "cisa2026", label: "CISA 2026 Minimum Elements" },
];

// Rule clusters per regulation (the cluster segment of the rule id), in order.
const RULE_CLUSTERS = {
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
};

function ImportScreen({ onComplete }) {
  const [url, setUrl] = _useSC("");
  const [regId, setRegId] = _useSC("ntia");
  const [phase, setPhase] = _useSC("idle"); // idle | running | done | error
  const [result, setResult] = _useSC(null); // SbomCheckResponse
  const [errorMsg, setErrorMsg] = _useSC("");
  const aliveRef = _useRef(true);
  _useEffect(() => () => { aliveRef.current = false; }, []);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run() {
    const artifactUrl = url.trim();
    if (!artifactUrl) return;
    setPhase("running"); setResult(null); setErrorMsg("");
    try {
      const submit = await fetch("/api/v1/artifact/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact_url: artifactUrl, regulation_id: regId }),
      });
      if (!submit.ok) throw new Error(`Submit failed (HTTP ${submit.status})`);
      const { job_id } = await submit.json();

      // Poll until the job finishes. Jobs are minutes-long at most; a ~2.5s
      // interval keeps the UI responsive without hammering the API.
      while (aliveRef.current) {
        await sleep(2500);
        const poll = await fetch(`/api/v1/jobs/${job_id}`);
        if (!poll.ok) throw new Error(`Status check failed (HTTP ${poll.status})`);
        const rec = await poll.json();
        if (rec.status === "done") {
          if (!aliveRef.current) return;
          setResult(rec.result); setPhase("done"); return;
        }
        if (rec.status === "error") {
          throw new Error(rec.error || "Generation job failed");
        }
      }
    } catch (err) {
      if (!aliveRef.current) return;
      setErrorMsg(String(err.message || err)); setPhase("error");
    }
  }

  return (
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 880, margin: "0 auto" }}>
      <div>
        <Eyebrow>Generate &amp; check</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>Check a repository or model</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>
          Paste a Git repository URL or a Hugging Face Hub model URL. Lumina generates an SBOM for it (server-side, via Pitloom) and checks it against the regulation you pick.
        </p>
      </div>

      <div role="radiogroup" aria-label="Regulation" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {IMPORT_REGULATIONS.map(r => (
          <RegTag key={r.id} role="radio" ariaChecked={regId === r.id} active={regId === r.id}
            onClick={phase === "running" ? undefined : () => { setRegId(r.id); setResult(null); setPhase("idle"); }}>{r.label}</RegTag>
        ))}
      </div>

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
          onClick={run} disabled={phase === "running" || !url.trim()}>
          {phase === "running" ? "Working…" : "Generate & check"}
        </Button>
      </div>

      {phase === "running" && (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} style={{ color: "var(--ink-3)" }} />
          Cloning &amp; generating the SBOM, then checking conformance. A large repository can take a couple of minutes.
        </div>
      )}

      {phase === "error" && (
        <Card variant="default" padding={16} style={{ borderColor: "var(--shu)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--shu)", fontSize: 14, fontWeight: 500 }}>
            <Icon name="alert-triangle" size={16} /> Could not complete
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.6 }}>{errorMsg}</div>
        </Card>
      )}

      {phase === "done" && result && <ArtifactResult result={result} />}

      <MarginNote title="What gets generated?">
        Lumina generates the SBOM on the server with{" "}
        <a href="https://github.com/bact/pitloom" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", borderBottom: "1px solid var(--ink-4)", paddingBottom: 1, textDecoration: "none" }}>Pitloom</a>{" "}
        (SPDX 3 JSON-LD). For a Git URL it shallow-clones the repository and reads its Python packaging metadata; for a Hugging Face URL it reads model metadata via the HF API &mdash; no model files are downloaded. Already have an SBOM? Use the SBOM upload / SARIF import endpoints instead.
      </MarginNote>
    </div>
  );
}

// RuleClusters -- per-rule outcomes grouped by cluster (rule-id segment).
// "Not applicable" and "out of scope" rules are listed but never counted as
// missing: out-of-scope rules are catalogue-only, the checker cannot check them.
const RULE_CHIP = {
  present: { status: "present" },
  missing: { status: "missing" },
  "not-applicable": { status: "neutral", label: "Not applicable" },
  "out-of-scope": { status: "neutral", label: "Not checked" },
};

function RuleClusters({ regulationId, rules, judgedByModel }) {
  const clusters = (RULE_CLUSTERS[regulationId] || []).map(cl => ({ ...cl, rules: rules.filter(r => r.cluster === cl.code) }))
    .filter(cl => cl.rules.length > 0);
  const count = (list, outcome) => list.filter(r => r.outcome === outcome).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {judgedByModel && (
        <MarginNote title="System judged by model">
          This SBOM has no AI system of its own. The system-level rules were judged by the model <Mono>{judgedByModel}</Mono>.
        </MarginNote>
      )}
      {clusters.map(cl => (
        <Card key={cl.code} padding={0}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 500, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>{cl.name}</span>
            <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>
              {count(cl.rules, "present")} present · {count(cl.rules, "missing")} missing · {count(cl.rules, "out-of-scope")} not checked
            </span>
          </div>
          {cl.rules.map((r, i) => {
            const chip = RULE_CHIP[r.outcome];
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

// ArtifactResult -- compact render of a SbomCheckResponse: conformance counts,
// the gap list, and any run notifications. Self-contained on purpose.
function ArtifactResult({ result }) {
  const c = result.conformance || {};
  const run = result.run || {};
  const notes = run.notifications || [];
  const gaps = c.gaps || [];
  const rules = c.rules || [];
  const ok = run.execution_successful !== false;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!ok && (
        <Card variant="default" padding={16} style={{ borderColor: "var(--shu)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--shu)", fontSize: 14, fontWeight: 500 }}>
            <Icon name="alert-triangle" size={16} /> The run did not finish cleanly
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}>
            Tool: <Mono>{run.tool_name || "?"}</Mono>{c.source ? <> · source <Mono>{c.source}</Mono></> : null}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <SummaryTile label="Fields checked" value={c.total ?? 0} />
        <SummaryTile label="Present" value={c.present ?? 0} accent="#5F7A4F" />
        <SummaryTile label="Missing" value={c.missing ?? 0} accent={(c.missing ?? 0) > 0 ? "#B68333" : undefined} />
        <SummaryTile label="Unverified" value={c.unverified ?? 0} accent={(c.unverified ?? 0) > 0 ? "#2F4A6B" : undefined} />
      </div>

      {rules.length > 0 && <RuleClusters regulationId={c.regulation_id} rules={rules} judgedByModel={c.system_judged_by_model} />}

      {gaps.length > 0 && (
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

      {gaps.length === 0 && ok && (
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
                <div style={{ minWidth: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
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

Object.assign(window, { ConformanceScreen, ImportScreen, ArtifactResult, RuleClusters, WhereToLook });
