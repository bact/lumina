/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- About screen
//
// Surfaces the app's identity: what it is, what it stands on, what it's
// licensed under, what specs / regulations it tracks, and who's behind it.
// Kept intentionally text-first; this is a reference page, not a marketing
// piece.

function AboutScreen({ data }) {
  const { t } = useLocale();

  // ── Dependencies Lumina leans on directly ──────────────────────────────
  const dependencies = [
    {
      name: "Pitloom",
      role: "SBOM generator",
      detail: "Resolves manifests and lockfiles into the SPDX 3.0 documents Lumina reads.",
      href: "https://github.com/pitloom/pitloom",
    },
    {
      name: "NTIA Conformance Checker",
      role: "Minimum-elements validator",
      detail: "Reference implementation Lumina cross-checks against when reporting NTIA conformance.",
      href: "https://github.com/spdx/ntia-conformance-checker",
    },
  ];

  // ── Specs & regulations Lumina recognises ──────────────────────────────
  // Hand-picked source URLs -- these are the canonical references, not
  // secondary explainers.
  const specLinks = {
    ntia:  "https://www.ntia.gov/report/2021/minimum-elements-software-bill-materials-sbom",
    cra:   "https://eur-lex.europa.eu/eli/reg/2024/2847/oj",
    bsi:   "https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr03183/TR-03183_node.html",
    g7ai:  "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/SBOM-for-AI_minimum-elements.html",
    mof:   "https://isitopen.ai/",
  };
  // SBOM format specs Lumina reads. Versions match what the underlying
  // parser (spdx/tools-python) supports -- keep this list in lockstep with
  // tools-python release notes.
  const standards = [
    { name: "SPDX",  version: "2.2, 2.3, 3.0",  href: "https://spdx.dev/use/specifications/" },
  ];

  return (
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 960, margin: "0 auto" }}>
      {/* ── Header / one-line description ───────────────────────────────── */}
      <div>
        <Eyebrow>About</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>
          <span style={{ color: "var(--ink-3)" }}>What </span>
          <Logo size={32} />
          <span style={{ color: "var(--ink-3)" }}> is.</span>
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 15, color: "var(--ink-2)", lineHeight: 1.6, maxWidth: 640 }}>
          Lumina is a viewer for Software Bills of Materials. It reads an SBOM
          and shows whether the fields a given regulation actually asks for
          are present -- so the answer to <em>"are we conformant?"</em> stops being
          a folder of PDFs.
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
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{d.role}</div>
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
        <Eyebrow id="about-license-h">License</Eyebrow>
        <Card padding={18} style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Apache License 2.0</div>
              <Mono style={{ fontSize: 11, color: "var(--ink-3)" }}>SPDX: Apache-2.0</Mono>
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
              Lumina is open source. Use, modify, and redistribute under the
              terms of the Apache License, Version 2.0. {" "}
              <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", textDecoration: "none", borderBottom: "1px solid var(--ink-4)", paddingBottom: 1 }}>
                Read the license
              </a>.
            </div>
          </div>
        </Card>
      </section>

      {/* ── Supported specs / regulations ───────────────────────────────── */}
      <section aria-labelledby="about-specs-h">
        <Eyebrow id="about-specs-h">Supported specs &amp; regulations</Eyebrow>
        <Card padding={0} style={{ marginTop: 8 }}>
          {/* Regulations sourced from the live data set so this page stays
             in lockstep with the conformance engine. */}
          {data.regulations.map((r, i) => (
            <SpecRow key={r.id}
              tag={r.tag}
              name={r.name}
              version={r.version}
              scope={r.scope === "ai" ? "AI scope" : "Software scope"}
              href={specLinks[r.id]}
              isLast={false} />
          ))}
          {/* SBOM format specs Lumina reads. Versions reflect spdx/tools-python coverage. */}
          {standards.map((s, i) => (
            <SpecRow key={s.name}
              tag="SPDX"
              name={s.name}
              version={s.version}
              scope="SBOM format"
              href={s.href}
              isLast={i === standards.length - 1} />
          ))}
        </Card>
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

      <MarginNote title="A note --">
        Lumina is research software developed in the open. Field mappings and
        regulation citations track public guidance documents but are not legal
        advice -- verify against the canonical source before relying on a
        conformance result.
      </MarginNote>
    </div>
  );
}

// ─── SpecRow -- one line of the specs table ──────────────────────────────
function SpecRow({ tag, name, version, scope, href, isLast }) {
  return (
    <div style={{
      padding: "14px 20px",
      borderBottom: isLast ? 0 : "1px solid var(--border-soft)",
      display: "grid", gridTemplateColumns: "120px 1fr auto auto", gap: 14, alignItems: "center",
    }}>
      <RegTag>{tag}</RegTag>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}>{name}</div>
        <Mono style={{ fontSize: 11, color: "var(--ink-3)" }}>{version}</Mono>
      </div>
      <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{scope}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{
          fontSize: 12, color: "var(--ink-2)", textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 5,
          borderBottom: "1px solid var(--ink-4)", paddingBottom: 1,
        }}
        aria-label={`Open canonical source for ${name} (new tab)`}>
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
