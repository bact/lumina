/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- shared primitives for the Raw / Graph / Vulnerabilities screens
//
// Small visual atoms reused across the three "viewer" screens. Kept in a
// separate module so each screen file stays focused on its own layout.

// ─── FieldStatusDot ─────────────────────────────────────────────────────
function FieldStatusDot({ present, unverified }) {
  const color = !present ? "var(--ochre)" : unverified ? "var(--indigo)" : "var(--moss)";
  return <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: color, display: "inline-block", flex: "0 0 6px" }} />;
}

// ─── KindTag -- small AI-model / dataset tag ─────────────────────────────
function KindTag({ kind }) {
  if (!kind || kind === "software") return null;
  const map = {
    model:   { label: "AI model", fg: "var(--indigo-ink)", bg: "var(--indigo-soft)" },
    dataset: { label: "Dataset",   fg: "var(--moss-ink)",   bg: "var(--moss-soft)" },
  };
  const m = map[kind] || { label: kind, fg: "var(--ink-3)", bg: "var(--paper-2)" };
  return <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 2, background: m.bg, color: m.fg }}>{m.label}</span>;
}

// ─── SeverityChip -- vulnerability severity ──────────────────────────────
function SeverityChip({ severity, cvss }) {
  const map = {
    critical: { bg: "#F5DAD4",          fg: "var(--shu-ink)",   dot: "var(--shu)" },
    high:     { bg: "var(--ochre-soft)",fg: "var(--ochre-ink)", dot: "var(--ochre)" },
    medium:   { bg: "var(--ochre-soft)",fg: "var(--ochre-ink)", dot: "var(--ochre)", soft: true },
    low:      { bg: "var(--paper-2)",   fg: "var(--ink-3)",     dot: "var(--ink-4)" },
  };
  const c = map[severity] || map.low;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: c.bg, color: c.fg, lineHeight: 1.4, opacity: c.soft ? 0.85 : 1 }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: c.dot, flex: "0 0 6px" }} />
      {severity}{cvss ? ` · ${cvss.toFixed(1)}` : ""}
    </span>
  );
}

// ─── FixChip -- fix availability state for a CVE ─────────────────────────
function FixChip({ vuln, installedVersion }) {
  if (vuln.fixedIn && vuln.fixedIn === installedVersion) {
    return <span style={{ fontSize: 11, fontWeight: 500, color: "var(--moss-ink)", background: "var(--moss-soft)", padding: "3px 9px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 5 }}>
      <Icon name="check" size={11} /> Patched in this version
    </span>;
  }
  if (vuln.fixAvailable) {
    return <span style={{ fontSize: 11, fontWeight: 500, color: "var(--indigo-ink)", background: "var(--indigo-soft)", padding: "3px 9px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 5 }}>
      <Icon name="arrow-up-right" size={11} /> Upgrade available
    </span>;
  }
  return <span style={{ fontSize: 11, fontWeight: 500, color: "var(--shu-ink)", background: "var(--shu-soft)", padding: "3px 9px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 5 }}>
    <Icon name="clock" size={11} /> No fix yet
  </span>;
}

// ─── Legend -- small color/label pair used in graph view ─────────────────
function Legend({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      <span>{label}</span>
    </span>
  );
}

// ─── RegStrip -- single-select chip strip; radio-group semantics ─────────
function RegStrip({ data, activeReg, setActiveReg }) {
  return (
    <div role="radiogroup" aria-label="Regulation to check against" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span id="reg-strip-label" style={{ fontSize: 11, color: "var(--ink-3)", marginRight: 4, fontFamily: "var(--font-mono)" }}>Check against</span>
      {data.regulations.map(r => (
        <RegTag key={r.id}
          active={r.id === activeReg}
          onClick={() => setActiveReg(r.id)}
          role="radio"
          ariaChecked={r.id === activeReg}
          ariaLabel={`Check against ${r.name}`}>{r.tag}</RegTag>
      ))}
    </div>
  );
}

// ─── RegSummaryLine -- small completeness banner shown above Raw / Graph ─
function RegSummaryLine({ summary, reg }) {
  const pct = summary.total > 0 ? Math.round((summary.present / summary.total) * 100) : 100;
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 12, color: "var(--ink-3)" }}>
      <span>
        <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{pct}%</strong>
        {" "}· {summary.present} of {summary.total} {reg.tag} fields present
      </span>
      <div role="progressbar"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}
        aria-label={`${reg.tag} required-field completeness`}
        style={{ flex: 1, height: 4, borderRadius: 999, overflow: "hidden", background: "var(--paper-3)", display: "flex", maxWidth: 360 }}>
        <span style={{ flex: summary.present, background: "var(--moss)" }} />
        <span style={{ flex: summary.unverified, background: "var(--indigo)" }} />
        <span style={{ flex: summary.missing, background: "var(--ochre)" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)" }}>
        <span style={{ color: "var(--ochre-ink)" }}>{summary.missing} missing</span>
        {summary.unverified > 0 && <> · <span style={{ color: "var(--indigo-ink)" }}>{summary.unverified} unverified</span></>}
      </span>
    </div>
  );
}

// ─── SummaryTile -- small labeled KPI card ───────────────────────────────
function SummaryTile({ label, value, accent }) {
  return (
    <Card padding={18}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.018em", lineHeight: 1, marginTop: 8, color: accent || "var(--ink)" }}>{value}</div>
    </Card>
  );
}

Object.assign(window, { FieldStatusDot, KindTag, SeverityChip, FixChip, Legend, RegStrip, RegSummaryLine, SummaryTile });
