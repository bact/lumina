/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- About screen
//
// What Lumina is, what it stands on, its licence, and the standards the
// API lists (GET /api/v1/standards) with what each check covers.

function AboutScreen() {
  const { t, locale } = useLocale();
  const standardList = useStandards();

  // ── Dependencies Lumina leans on directly ──────────────────────────────
  const dependencies = [
    {
      name: "ntia-conformance-checker",
      role: "Conformance checker",
      detail: "Runs every check (the G7, CISA 2026, FSCT and BSI rules are in the bact fork Lumina pins). Lumina turns its SARIF log into the result the screens show.",
      href: "https://github.com/bact/ntia-conformance-checker",
    },
    {
      name: "Pitloom",
      role: "SBOM generator",
      detail: "Generates the SPDX 3 SBOM for a Git repository or Hugging Face model on the Generate & check screen.",
      href: "https://github.com/bact/pitloom",
    },
    {
      name: "LicenseID",
      role: "Licence identifier",
      detail: "Pitloom uses it while generating an SBOM, to recognise a licence text and name it with its SPDX licence identifier.",
      href: "https://github.com/bact/licenseid",
    },
  ];

  return (
    <div className="screen-frame" style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 960, margin: "0 auto" }}>
      {/* ── Header / one-line description ───────────────────────────────── */}
      <div>
        <div lang={locale}>
          <Eyebrow>{t("nav.about")}</Eyebrow>
          <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>
            <span style={{ color: "var(--ink-3)" }}>{t("screen.about.titleBefore")}</span>
            <Logo size={32} />
            <span style={{ color: "var(--ink-3)" }}>{t("screen.about.titleAfter")}</span>
          </h1>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 15, color: "var(--ink-2)", lineHeight: 1.6, maxWidth: 640 }}>
          Lumina checks a Software Bill of Materials (SBOM) against a
          minimum elements standard and shows, rule by rule, which of its
          elements the SBOM has a property for. Bring an SBOM, a SARIF log from a
          checker, or a Git or Hugging Face URL to generate one from.
        </p>
      </div>

      {/* ── Dependencies ────────────────────────────────────────────────── */}
      <section aria-labelledby="about-deps-h">
        <Eyebrow id="about-deps-h">Major dependencies</Eyebrow>
        <Card padding={0} style={{ marginTop: 8 }}>
          {dependencies.map((d, i) => (
            <div key={d.name} style={{
              padding: "16px 20px",
              borderBottom: i === dependencies.length - 1 ? 0 : "1px solid var(--border-soft)",
              display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 16, alignItems: "baseline",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{d.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{d.role}</div>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{d.detail}</div>
              <a href={d.href} target="_blank" rel="noopener noreferrer" style={{
                fontSize: 12, color: "var(--ink-2)", textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 5,
                borderBottom: "1px solid var(--ink-4)", paddingBottom: 1,
              }}
              aria-label={`Open ${d.name} project page (new tab)`}>
                Project page <Icon name="external-link" size={11} />
              </a>
            </div>
          ))}
        </Card>
      </section>

      {/* ── License ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="about-license-h">
        <Eyebrow id="about-license-h">Licence</Eyebrow>
        <Card padding={18} style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Apache License 2.0</div>
              <Mono style={{ fontSize: 12, color: "var(--ink-3)" }}>SPDX: Apache-2.0</Mono>
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
              Lumina is open source. Use, modify, and redistribute under the
              terms of the Apache License, Version 2.0. {" "}
              <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer" style={inlineLinkStyle}>
                Read the licence
              </a>.
            </div>
          </div>
        </Card>
      </section>

      {/* ── Standards, as the API lists them ──────────────────────────── */}
      <section aria-labelledby="about-specs-h">
        <Eyebrow id="about-specs-h">Minimum elements standards</Eyebrow>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-3)", lineHeight: 1.55 }}>
          Each check reports, per rule, whether the SBOM has the property the
          rule asks for. Present means the property exists, not that its value
          is right. SBOMs are read as SPDX 2 or SPDX 3; the version is detected
          from the file.
        </p>
        {standardList.error
          ? <div style={{ marginTop: 8 }}><ErrorCard title="Could not load the list of minimum elements standards">{standardList.error}</ErrorCard></div>
          : (
            <Card padding={0} style={{ marginTop: 8 }}>
              {!standardList.standards && <div style={{ padding: "14px 20px", fontSize: 12.5, color: "var(--ink-3)" }}>Loading minimum elements standards…</div>}
              {(standardList.standards || []).map((r, i, all) => (
                <SpecRow key={r.id} reg={r} isLast={i === all.length - 1} />
              ))}
            </Card>
          )}
      </section>

      {/* ── Author / institution ────────────────────────────────────────── */}
      <section aria-labelledby="about-author-h">
        <Eyebrow id="about-author-h">Author</Eyebrow>
        <Card padding={18} style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, alignItems: "start" }}>
            <div role="img" aria-label="Author avatar: AS" style={{
              width: 48, height: 48, borderRadius: 999, background: "var(--shu-soft)",
              color: "var(--shu-ink)", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 16, fontWeight: 500, letterSpacing: "0.02em",
            }}>AS</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>Arthit Suriyawongkul</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.55 }}>
                PhD researcher at the{" "}
                <a href="https://d-real.ie/" target="_blank" rel="noopener noreferrer" style={inlineLinkStyle}>
                  Research Ireland Centre for Research Training in Digitally-Enhanced Reality (d-real)
                </a>
                {" "}and the{" "}
                <a href="https://www.scss.tcd.ie/" target="_blank" rel="noopener noreferrer" style={inlineLinkStyle}>
                  School of Computer Science and Statistics, Trinity College Dublin
                </a>.
              </div>
            </div>
          </div>
        </Card>
      </section>

      <MarginNote title="A note">
        Lumina is research software developed in the open. Field mappings and
        standard citations track public guidance documents but are not legal
        advice -- verify against the canonical source before relying on a
        conformance result.
      </MarginNote>
    </div>
  );
}

// ─── SpecRow -- one standard the API lists ─────────────────────────────
function SpecRow({ reg, isLast }) {
  const info = STANDARD_INFO[reg.id] || {};
  return (
    <div style={{
      padding: "14px 20px",
      borderBottom: isLast ? 0 : "1px solid var(--border-soft)",
      display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14, alignItems: "center",
    }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}>
          {standardLabel(reg.id)} <Mono style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 400 }}>{reg.id}</Mono>
        </div>
        {info.covers && <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.5 }}>{info.covers}</div>}
      </div>
      <StatusChip status={reg.ready ? "present" : "neutral"}>{reg.ready ? "Supported" : "Not supported"}</StatusChip>
      {info.href ? (
        <a href={info.href} target="_blank" rel="noopener noreferrer" style={{
          fontSize: 12, color: "var(--ink-2)", textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 5,
          borderBottom: "1px solid var(--ink-4)", paddingBottom: 1,
        }}
        aria-label={`Open the source document for ${standardLabel(reg.id)} (new tab)`}>
          Source <Icon name="external-link" size={11} />
        </a>
      ) : <span aria-hidden="true" style={{ fontSize: 12, color: "var(--ink-4)" }}>--</span>}
    </div>
  );
}

const inlineLinkStyle = {
  color: "var(--ink)", textDecoration: "none",
  borderBottom: "1px solid var(--ink-4)", paddingBottom: 1,
};

Object.assign(window, { AboutScreen });
