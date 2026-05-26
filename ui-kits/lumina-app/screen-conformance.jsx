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

const { useState: _useSC } = React;

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
function ImportScreen({ onComplete }) {
  const [stage, setStage] = _useSC("idle"); // idle | dragging | parsing | done
  return (
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 880, margin: "0 auto" }}>
      <div>
        <Eyebrow>Import</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>Bring in an SBOM</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>
          Drop an SBOM file, or paste a link to an SBOM file or a Hugging Face Hub model page. Lumina reads SBOMs &mdash; it doesn&rsquo;t generate them.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setStage("dragging"); }}
        onDragLeave={() => setStage("idle")}
        onDrop={(e) => { e.preventDefault(); setStage("parsing"); setTimeout(() => setStage("done"), 1400); }}
        style={{
          background: stage === "dragging" ? "var(--shu-soft)" : "var(--white)",
          border: "1.5px dashed " + (stage === "dragging" ? "var(--shu)" : "var(--border-strong)"),
          borderRadius: 4, padding: "44px 28px", textAlign: "center",
          transition: "background var(--dur-base), border-color var(--dur-base)",
        }}>
        {stage === "parsing" ? (
          <>
            <Icon name="loader" size={28} style={{ color: "var(--ink-3)" }} />
            <div style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 12 }}>Reading the weave…</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>14 components found · validating against SPDX 3.0</div>
          </>
        ) : stage === "done" ? (
          <>
            <Icon name="check" size={28} style={{ color: "var(--moss)" }} />
            <div style={{ fontSize: 16, color: "var(--ink)", marginTop: 12 }}>Imported. 14 components, 4 manifests.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setStage("idle")}>Import another</Button>
              <Button variant="primary" iconAfter="arrow-right" onClick={onComplete}>Open inventory</Button>
            </div>
          </>
        ) : (
          <>
            {/* Generic document icon -- reads as "a file you bring in"
                without leaning on the up/down/in/out arrow debate at all. */}
            <Icon name="file-text" size={28} style={{ color: "var(--ink-3)" }} />
            <div style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 12 }}>Drop an SBOM, or paste a link</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.6 }}>
              Files: <Mono>SPDX 2.2 / 2.3 / 3.0</Mono> &middot; JSON, XML, RDF, YAML, tag-value
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
              <Button variant="secondary" icon="folder" onClick={() => { setStage("parsing"); setTimeout(() => setStage("done"), 1400); }}>Choose file</Button>
              {/* One unified URL action -- the chain icon (`link`) carries
                  "this is a URL" without enumerating sources in the label. */}
              <Button variant="ghost" icon="link">Paste URL</Button>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 18, lineHeight: 1.6, maxWidth: 560, margin: "18px auto 0" }}>
              A URL can point to a hosted SBOM file, or to a model page on{" "}
              <Mono>huggingface.co</Mono>.
            </div>
          </>
        )}
      </div>

      {/* Pitloom margin note -- explains why Lumina is read-only and where
         SBOM generation actually happens. Replaces the old "Connect a
         repository" + "From CI" cards, which advertised a generator that
         isn&rsquo;t built. */}
      <MarginNote title="Need to generate an SBOM?">
        Lumina doesn&rsquo;t produce SBOMs &mdash; it reads them. Install{" "}
        <a href="https://github.com/bact/pitloom" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", borderBottom: "1px solid var(--ink-4)", paddingBottom: 1, textDecoration: "none" }}>Pitloom</a>{" "}
        locally &mdash; or run it as a step in your GitHub Actions workflow &mdash; then drop the resulting SBOM here.
        Model files (GGUF, ONNX, Safetensors) are usually too large for browser upload; generate the SBOM on the
        machine that has the model, then import just the SBOM.
      </MarginNote>
    </div>
  );
}

Object.assign(window, { ConformanceScreen, ImportScreen, WhereToLook });
