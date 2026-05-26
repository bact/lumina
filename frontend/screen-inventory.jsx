/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- Inventory + Component Detail screens

const { useState: _useSI } = React;

// Compute a component's status against a specific regulation.
// Returns "out-of-scope" | "neutral" | "missing" | "unverified" | "present".
function componentStatusForReg(c, reg, data) {
  const fields = reg.fields.filter(f => data.fieldAppliesTo(f, c, reg));
  if (fields.length === 0) {
    // The regulation simply doesn't apply to this kind of component
    // (e.g. G7 AI SBOM vs. a plain npm package).
    return reg.scope === "ai" && c.kind === "software" ? "out-of-scope"
         : reg.scope === "software" && (c.kind === "model" || c.kind === "dataset") ? "out-of-scope"
         : "neutral";
  }
  const anyMissing = fields.some(f => !data.componentField(c, f.key).present);
  if (anyMissing) return "missing";
  if (fields.some(f => f.key === "provenance") && c.provenance && !c.provenance.signed) return "unverified";
  return "present";
}

// ─── Inventory ──────────────────────────────────────────────────────────
function InventoryScreen({ data, onOpenComponent }) {
  const { t, formatNumber } = useLocale();
  const initReg = data.regulations.find(r => r.active)?.id || data.regulations[0].id;
  const [activeRegId, setActiveRegId] = _useSI(initReg);
  const [filter, setFilter] = _useSI("all");
  const [q, setQ] = _useSI("");
  const [hoverIdx, setHoverIdx] = _useSI(-1);

  const reg = data.regulations.find(r => r.id === activeRegId);
  // Per-component status against the selected regulation.
  const rowStatus = data.components.reduce((acc, c) => {
    acc[c.id] = componentStatusForReg(c, reg, data);
    return acc;
  }, {});

  const filters = [
    { id: "all",        label: t("inventory.filter.all"),           count: data.components.length },
    { id: "missing",    label: t("inventory.filter.missingFields"), count: data.components.filter(c => rowStatus[c.id] === "missing").length },
    { id: "unverified", label: t("inventory.filter.unverified"),    count: data.components.filter(c => rowStatus[c.id] === "unverified").length },
    { id: "present",    label: t("inventory.filter.fullyPresent"),  count: data.components.filter(c => rowStatus[c.id] === "present").length },
  ];
  const rows = data.components.filter(c => {
    const s = rowStatus[c.id];
    if (filter !== "all") {
      if (filter === "present" && s !== "present") return false;
      if (filter === "missing" && s !== "missing") return false;
      if (filter === "unverified" && s !== "unverified") return false;
    }
    if (q && !c.name.toLowerCase().includes(q.toLowerCase()) && !(c.purl || "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1240, margin: "0 auto" }}>
      <div>
        <Eyebrow>{t("nav.inventory")}</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>{t("inventory.title")}</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>{t("inventory.subtitle")}</p>
      </div>

      {/* Regulation selector -- the Status column is computed against this. */}
      <div role="radiogroup" aria-label={t("inventory.checkedAgainst")} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)", marginRight: 4, fontFamily: "var(--font-mono)" }}>{t("inventory.checkedAgainst")}</span>
        {data.regulations.map(r => (
          <RegTag key={r.id}
            active={r.id === activeRegId}
            onClick={() => setActiveRegId(r.id)}
            role="radio"
            ariaChecked={r.id === activeRegId}
            ariaLabel={`${t("inventory.checkedAgainst")}: ${r.name}`}>
            {r.tag}
          </RegTag>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <TextField icon="search" placeholder={t("inventory.search")} value={q} onChange={setQ} style={{ width: 320 }} />
        <Divider vertical style={{ height: 24 }} />
        <div role="group" aria-label={t("inventory.filter.all") + " / " + t("inventory.filter.missingFields") + " / " + t("inventory.filter.unverified") + " / " + t("inventory.filter.fullyPresent")} style={{ display: "flex", gap: 4, background: "var(--paper-2)", padding: 3, borderRadius: 4 }}>
          {filters.map(f => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
              aria-label={`${f.label}: ${formatNumber(f.count)}`}
              style={{
                background: filter === f.id ? "var(--white)" : "transparent",
                border: "1px solid " + (filter === f.id ? "var(--border)" : "transparent"),
                borderRadius: 3, padding: "5px 10px", fontFamily: "inherit", fontSize: 12, fontWeight: 500,
                color: filter === f.id ? "var(--ink)" : "var(--ink-3)", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
              {f.label}
              <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-4)", display: "inline-block", minWidth: 18, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(f.count)}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="sliders-horizontal">{t("inventory.columns")}</Button>
        <Button variant="secondary" size="sm" icon="log-out">{t("inventory.export")}</Button>
      </div>

      <Card padding={0}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <caption className="sr-only">
            {t("inventory.showing", { n: formatNumber(rows.length), total: formatNumber(data.components.length) })} -- {t("inventory.checkedAgainst")} {reg.tag}
          </caption>
          <thead>
            <tr>
              {[
                t("inventory.col.component"),
                t("inventory.col.version"),
                t("inventory.col.supplier"),
                t("inventory.col.license"),
                t("inventory.col.hash"),
                t("inventory.col.status"),
              ].map((h, i) => (
                <th key={i} scope="col" style={{ textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-3)", fontWeight: 500, padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--paper-2)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const hovered = hoverIdx === i;
              const isLast = i === rows.length - 1;
              const cellBg = hovered ? "var(--paper-2)" : "transparent";
              const cellBorder = isLast ? 0 : "1px solid var(--border-soft)";
              const baseCell = { padding: "11px 16px", borderBottom: cellBorder, background: cellBg, transition: "background var(--dur-quick)" };
              const s = rowStatus[c.id];
              const supplierMissing = !c.supplier;
              return (
                <tr key={c.name} onClick={() => onOpenComponent(c)}
                  role="button" tabIndex="0"
                  aria-label={`${c.name} ${c.version}${c.supplier ? " " + c.supplier : ""} -- ${s} vs ${reg.tag}. Press Enter to open details.`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenComponent(c); } }}
                  onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(-1)}
                  onFocus={() => setHoverIdx(i)} onBlur={() => setHoverIdx(-1)}
                  style={{ cursor: "pointer" }}>
                  <td style={baseCell}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ color: "var(--ink)", fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <Mono style={{ fontSize: 11, color: "var(--ink-3)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.purl}</Mono>
                    </div>
                  </td>
                  <td style={baseCell}>
                    <Mono style={{ fontSize: 12, color: "var(--ink-2)" }}>{c.version}</Mono>
                  </td>
                  <td style={{ ...baseCell, fontSize: 13, color: c.supplier ? "var(--ink-2)" : "var(--ink-4)" }}>
                    {c.supplier || <span aria-label={t("inventory.notDeclared")}>--</span>}
                  </td>
                  <td style={{ ...baseCell, fontSize: 13 }}>
                    {c.license ? <Mono style={{ color: "var(--ink-2)", fontSize: 12 }}>{c.license}</Mono> : <span aria-label={t("inventory.notDeclared")} style={{ color: "var(--ink-4)" }}>--</span>}
                  </td>
                  <td style={baseCell}>
                    {c.hash ? <Mono style={{ fontSize: 11, color: "var(--ink-3)" }}>{c.hash}</Mono> : <span aria-label={t("inventory.notDeclared")} style={{ color: "var(--ink-4)" }}>--</span>}
                  </td>
                  <td style={baseCell}>
                    {s === "out-of-scope"
                      ? <StatusChip status="neutral">out of scope</StatusChip>
                      : <StatusChip status={s} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--ink-3)" }}>
        <span>{t("inventory.showing", { n: formatNumber(rows.length), total: formatNumber(data.components.length) })}</span>
        <span>{t("inventory.format")}: <Mono style={{ color: "var(--ink-2)" }}>SPDX 3.0 JSON-LD</Mono></span>
      </div>
    </div>
  );
}

// ─── Component Detail (drill-in) ────────────────────────────────────────
function ComponentDetailScreen({ component, data, onBack }) {
  const c = component;
  const compFindings = data.findings.filter(f => f.component === c.name);
  return (
    <div style={{ padding: "28px 48px", display: "flex", flexDirection: "column", gap: 22, maxWidth: 1100, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "transparent", border: 0, padding: 0, color: "var(--ink-3)", fontFamily: "inherit", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
        <Icon name="arrow-left" size={14} /> Back to inventory
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div>
          <Eyebrow>Component</Eyebrow>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>{c.name}</h1>
            <Mono style={{ color: "var(--ink-3)", fontSize: 14 }}>{c.version}</Mono>
          </div>
          <Mono style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4, display: "inline-block" }}>{c.purl}</Mono>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" icon="git-pull-request">Request info from supplier</Button>
          <Button variant="primary" icon="check">Accept with rationale</Button>
        </div>
      </div>

      {compFindings.length > 0 && (
        <Card padding={0}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Eyebrow>Findings -- {compFindings.length}</Eyebrow>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>What this component is missing, per regulation</span>
          </div>
          {compFindings.map((f, i) => {
            const reg = data.regulations.find(r => r.id === f.reg);
            return (
              <div key={i} style={{ padding: "14px 18px", borderBottom: i === compFindings.length - 1 ? 0 : "1px solid var(--border-soft)", display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 16, alignItems: "center" }}>
                <Mono style={{ fontSize: 12, color: "var(--ink)", textTransform: "lowercase" }}>{f.field}</Mono>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{f.note}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <RegTag>{reg.tag}</RegTag>
                    <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{reg.name}</span>
                  </div>
                </div>
                <StatusChip status={f.severity} />
              </div>
            );
          })}
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14 }}>
        <Card padding={18}>
          <Eyebrow>Declared fields</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <FieldRow label="Name" value={c.name} status="present" />
            <FieldRow label="Version" value={<Mono>{c.version}</Mono>} status="present" />
            <FieldRow label="Supplier" value={c.supplier || "--"} status={c.supplier ? "present" : "missing"} />
            <FieldRow label="License" value={c.license ? <Mono>{c.license}</Mono> : "--"} status={c.license ? "present" : "missing"} />
            <FieldRow label="Hash" value={c.hash ? <Mono style={{ fontSize: 11 }}>{c.hash}</Mono> : "--"} status={c.hash ? "present" : "missing"} />
            <FieldRow label="Dependency relationship" value="direct" status="present" />
            <FieldRow label="PURL" value={<Mono>{c.purl}</Mono>} status="present" />
          </div>
        </Card>

        <Card padding={18}>
          <Eyebrow>Provenance</Eyebrow>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <ProvStep title="Detected by Pitloom" detail="From package-lock.json · 2h ago" first />
            <ProvStep title="Resolved upstream" detail={c.supplier ? `Registry: ${c.supplier}` : "Registry lookup failed"} ok={!!c.supplier} />
            <ProvStep title="Hash verified" detail={c.hash ? "sha256 matched upstream" : "No upstream signature found"} ok={!!c.hash} last />
          </div>

          <Divider style={{ margin: "16px 0" }} />

          <MarginNote title="A note --" onLearnMore={() => {}} onDismiss={() => {}}>
            <em>Provenance</em> describes where a fact came from, not just what the fact is. EU CRA Annex I §2(c) treats unverified provenance as a separate condition from missing data.
          </MarginNote>
        </Card>
      </div>
    </div>
  );
}

function FieldRow({ label, value, status }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 12, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
      <span style={{ fontSize: 13, color: status === "missing" ? "var(--ink-4)" : "var(--ink)" }}>{value}</span>
      <StatusChip status={status} />
    </div>
  );
}

function ProvStep({ title, detail, ok = true, first, last }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 10, position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3 }}>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: ok ? "var(--moss)" : "var(--ochre)", border: "1px solid " + (ok ? "var(--moss)" : "var(--ochre)") }} />
        {!last && <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: 4 }} />}
      </div>
      <div style={{ paddingBottom: last ? 0 : 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{detail}</div>
      </div>
    </div>
  );
}

Object.assign(window, { InventoryScreen, ComponentDetailScreen, componentStatusForReg });
