/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- Screens (5 core views with click-through state)

const { useState: _useS, useMemo, useRef: _useROv, useEffect: _useEOv } = React;

// ─── Screen: Overview (dashboard) ────────────────────────────────────────
function OverviewScreen({ project, data, onOpenInventory, onOpenConformance }) {
  const { t, formatNumber } = useLocale();
  const { findings, regulations, components } = data;
  const projFindings = findings;
  const activeRegs = regulations.filter(r => r.active);
  const isLive = project.id === "ghost-mesh";

  // For the live project, use the real component set; for others, fall back to project metadata.
  const compCount = isLive ? components.length : project.components;
  const componentsAffected = isLive
    ? new Set(findings.map(f => f.component)).size
    : Math.min(project.missing, 4);
  const missingCount = isLive
    ? findings.filter(f => f.severity === "missing").length
    : project.missing;
  const presentCount = compCount - componentsAffected;

  return (
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 28, maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
        <div>
          <Eyebrow>Overview</Eyebrow>
          <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>
            <span style={{ color: "var(--ink-3)" }}>The </span>
            <span style={{ fontWeight: 300, letterSpacing: "-0.022em" }}>pattern</span>
            <span style={{ color: "var(--ink-3)" }}> in your SBOM.</span>
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>
            {compCount} components woven by Pitloom · last checked {project.last}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Export -- explicit menu so report vs annotated-SBOM is unambiguous */}
          <ExportMenu activeRegs={activeRegs} />
          {/* Run conformance -- clarified label + tooltip so it's obvious this
              just re-runs the check (read-only) and opens the result page. */}
          <Button
            variant="primary" icon="play"
            onClick={onOpenConformance}
            title="Re-check this SBOM against active regulations and open the report. Your SBOM is not modified.">
            Run conformance
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Card padding={18}>
          <Eyebrow>{t("kpi.components")}</Eyebrow>
          <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.018em", marginTop: 8, lineHeight: 1 }}>{formatNumber(compCount)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{t("kpi.acrossManifests", { n: formatNumber(4) })}</div>
        </Card>
        <Card padding={18}>
          <Eyebrow>{t("kpi.fullyPresent")}</Eyebrow>
          <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.018em", marginTop: 8, lineHeight: 1, color: "var(--moss)" }}>{formatNumber(presentCount)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{t("kpi.allFieldsFilled")}</div>
        </Card>
        <Card padding={18}>
          <Eyebrow>{t("kpi.missingFields")}</Eyebrow>
          <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.018em", marginTop: 8, lineHeight: 1, color: "var(--ochre-ink)" }}>{formatNumber(missingCount)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{t("kpi.componentsAffected", { n: formatNumber(componentsAffected) })}</div>
        </Card>
        <Card padding={18}>
          <Eyebrow>{t("kpi.regulationsActive")}</Eyebrow>
          <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.018em", marginTop: 8, lineHeight: 1 }}>{formatNumber(activeRegs.length)}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            {activeRegs.map(r => <RegTag key={r.id} active>{r.tag}</RegTag>)}
          </div>
        </Card>
      </div>

      <MarginNote
        title="A note --"
        onLearnMore={() => {}}
        onDismiss={() => {}}>
        Lumina checks <strong>fields</strong>, not just files. A component can pass format validation and still be missing the supplier name a regulation needs. That's why <em>missing</em> is a different shade from <em>invalid</em>.
      </MarginNote>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <Card padding={0}>
          <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-soft)" }}>
            <div>
              <Eyebrow>Open findings</Eyebrow>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{projFindings.length} items need attention</div>
            </div>
            <Button variant="ghost" size="sm" iconAfter="arrow-right" onClick={onOpenConformance}>View all</Button>
          </div>
          {projFindings.slice(0, 4).map((f, i) => (
            <div key={i} style={{ padding: "12px 18px", borderBottom: i === 3 ? 0 : "1px solid var(--border-soft)", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14, alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Mono style={{ fontSize: 12, color: "var(--ink)" }}>{f.component}</Mono>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{f.note}</div>
              </div>
              <RegTag>{(data.regulations.find(r => r.id === f.reg) || {}).tag}</RegTag>
              <StatusChip status={f.severity} />
            </div>
          ))}
        </Card>

        <Card padding={18}>
          <Eyebrow>Connected loom</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <Mono style={{ fontSize: 13, color: "var(--ink)" }}>pitloom</Mono>
              <StatusChip status="present">Live</StatusChip>
            </div>
            <Divider />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <Row label="Format">SPDX 3.0 JSON-LD</Row>
              <Row label="Source">CI · <Mono>main</Mono></Row>
              <Row label="Manifests">package.json, go.mod, requirements.txt, Cargo.toml</Row>
              <Row label="Last weave">2 hours ago</Row>
            </div>
            <Button variant="secondary" size="sm" icon="external-link" style={{ alignSelf: "flex-start", marginTop: 4 }}>Open in Pitloom</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 12 }}>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
      <span style={{ color: "var(--ink-2)", fontSize: 13 }}>{children}</span>
    </div>
  );
}

// ─── ExportMenu -- split download button ─────────────────────────────────
//
// Lumina is a viewer first. But there are two genuinely different things a
// user might want to take away from a session -- and conflating them under
// one "Export" button creates exactly the ambiguity Art flagged:
//
//   1. Conformance report -- a human-readable summary of which fields each
//      active regulation asks for, and whether they're present in the SBOM
//      as it stands. The SBOM itself is not touched.
//
//   2. Annotated SBOM -- a copy of the input SBOM with Lumina's per-field
//      findings attached as comment/annotation properties (SPDX 3.0
//      `lumina:conformance:*` keys). The original is never modified;
//      "annotated" means a new file is emitted alongside.
//
// Naming both outputs in the menu, with a one-line description for each,
// keeps the viewer/editor boundary visible without locking the door on the
// editor path we may want later.

function ExportMenu({ activeRegs }) {
  const ref = _useROv(null);
  const menuRef = _useROv(null);
  const [open, setOpen] = _useS(false);
  const menuId = "lumina-export-menu";

  _useEOv(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); ref.current?.focus(); } };
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  const regList = activeRegs.map(r => r.tag).join(", ") || "no active regulations";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Button
        variant="secondary" icon="log-out" iconAfter="chevron-down"
        onClick={() => setOpen(o => !o)}
        style={{ paddingRight: 10 }}>
        <span
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Export. Choose between conformance report and annotated SBOM. Active regulations: ${regList}.`}>
          Export
        </span>
      </Button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Export options"
          style={{
            position: "absolute", top: "100%", right: 0, marginTop: 6,
            background: "var(--white)", border: "1px solid var(--border)",
            boxShadow: "var(--shadow-2)", borderRadius: 4,
            width: 360, padding: 6, zIndex: 30,
          }}>
          <ExportMenuItem
            icon="file-text"
            title="Conformance report"
            subtitle="Human-readable summary of regulation gaps."
            meta="PDF · ~1–2 pp / regulation"
            onClick={() => { setOpen(false); /* TODO: trigger PDF report job */ }}
          />
          <ExportMenuItem
            icon="file-json"
            title="Annotated SBOM"
            subtitle="Your SBOM with Lumina's per-field findings attached as annotations. Your original file is not modified -- a new copy is emitted."
            meta="SPDX 3.0 JSON-LD · adds lumina:conformance:* fields"
            onClick={() => { setOpen(false); /* TODO: trigger annotated emit */ }}
          />
          <div style={{
            padding: "10px 12px 4px", borderTop: "1px solid var(--border-soft)",
            marginTop: 4, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.55,
          }}>
            Both exports reflect the active regulations: <Mono style={{ color: "var(--ink-2)" }}>{regList}</Mono>.
            Lumina does not edit your source SBOM in place.
          </div>
        </div>
      )}
    </div>
  );
}

function ExportMenuItem({ icon, title, subtitle, meta, onClick }) {
  const [hover, setHover] = _useS(false);
  return (
    <button type="button" role="menuitem" onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", appearance: "none", border: 0, textAlign: "left",
        background: hover ? "var(--paper-2)" : "transparent",
        borderRadius: 2, padding: "10px 12px", cursor: "pointer",
        display: "grid", gridTemplateColumns: "24px 1fr", gap: 12, alignItems: "start",
        fontFamily: "inherit",
      }}>
      <span style={{ paddingTop: 2, color: "var(--ink-2)" }}>
        <Icon name={icon} size={16} />
      </span>
      <span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", display: "block" }}>{title}</span>
        <span style={{ fontSize: 12, color: "var(--ink-3)", display: "block", marginTop: 2, lineHeight: 1.5 }}>{subtitle}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)", display: "block", marginTop: 4 }}>{meta}</span>
      </span>
    </button>
  );
}

Object.assign(window, { OverviewScreen });
