/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- Vulnerabilities screen
//
// Components with one or more CVE / GHSA records, grouped by component and
// ordered worst-first. Required disclosure under EU CRA §2(d).

function VulnerabilitiesScreen({ data, onOpenComponent }) {
  const items = data.allVulns();
  const counts = items.reduce((acc, { vuln }) => { acc[vuln.severity] = (acc[vuln.severity] || 0) + 1; return acc; }, {});
  const fixable = items.filter(i => i.vuln.fixAvailable).length;
  const unfixed = items.filter(i => !i.vuln.fixAvailable).length;

  // Group by component, ordered by worst severity
  const byComp = {};
  items.forEach(({ component, vuln }) => {
    (byComp[component.id] = byComp[component.id] || { component, vulns: [] }).vulns.push(vuln);
  });
  const groups = Object.values(byComp).sort((a, b) => {
    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    const aMax = Math.max(...a.vulns.map(v => rank[v.severity] || 0));
    const bMax = Math.max(...b.vulns.map(v => rank[v.severity] || 0));
    return bMax - aMax;
  });

  return (
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 22, maxWidth: 1240, margin: "0 auto" }}>
      <div>
        <Eyebrow>Vulnerabilities</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>Known advisories</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>Components in this SBOM with one or more CVE / GHSA records. Required disclosure under EU CRA §2(d).</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <SummaryTile label="Total CVEs"      value={items.length} />
        <SummaryTile label="High / Critical" value={(counts.high || 0) + (counts.critical || 0)} accent="var(--ochre-ink)" />
        <SummaryTile label="Fix available"   value={fixable} accent="var(--moss)" />
        <SummaryTile label="No fix yet"      value={unfixed} accent="var(--shu-deep)" />
      </div>

      <Card padding={0}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Eyebrow>Components with known vulnerabilities</Eyebrow>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{groups.length} of {data.components.length} components</span>
        </div>

        {groups.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
            No known vulnerabilities across {data.components.length} components.
          </div>
        )}

        {groups.map((g, gi) => (
          <div key={g.component.id} style={{ borderBottom: gi === groups.length - 1 ? 0 : "1px solid var(--border-soft)" }}>
            <div
              role={onOpenComponent ? "button" : undefined}
              tabIndex={onOpenComponent ? 0 : undefined}
              aria-label={onOpenComponent ? `${g.component.name} ${g.component.version} -- ${g.vulns.length} ${g.vulns.length === 1 ? "advisory" : "advisories"}. Open component details.` : undefined}
              onClick={() => onOpenComponent && onOpenComponent(g.component)}
              onKeyDown={(e) => { if (onOpenComponent && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenComponent(g.component); } }}
              style={{ padding: "13px 18px", display: "flex", alignItems: "center", gap: 14, cursor: onOpenComponent ? "pointer" : "default" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--ink)", fontWeight: 500, fontSize: 13 }}>{g.component.name}</span>
                  <KindTag kind={g.component.kind} />
                </div>
                <Mono style={{ fontSize: 11, color: "var(--ink-3)" }}>{g.component.version} · {g.component.ecosystem}</Mono>
              </div>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{g.vulns.length} {g.vulns.length === 1 ? "advisory" : "advisories"}</span>
            </div>
            {g.vulns.map((v) => (
              <div key={v.id} style={{
                padding: "12px 18px 14px 36px",
                display: "grid", gridTemplateColumns: "180px 110px 1fr auto", gap: 14, alignItems: "start",
                borderTop: "1px dashed var(--border-soft)",
              }}>
                <Mono style={{ fontSize: 12, color: "var(--ink)" }}>{v.id}</Mono>
                <SeverityChip severity={v.severity} cvss={v.cvss} />
                <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  {v.summary}
                  {v.note && <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{v.note}</div>}
                  <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "var(--ink-3)" }}>
                    <span><Icon name="calendar" size={10} style={{ verticalAlign: "middle", marginRight: 3, color: "var(--ink-4)" }} />{v.published}</span>
                    {v.fixedIn && <span><Icon name="git-merge" size={10} style={{ verticalAlign: "middle", marginRight: 3, color: "var(--ink-4)" }} />fixed in {v.fixedIn}</span>}
                  </div>
                </div>
                <FixChip vuln={v} installedVersion={g.component.version} />
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}

Object.assign(window, { VulnerabilitiesScreen });
