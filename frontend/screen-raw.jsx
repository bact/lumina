/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- Raw screen
//
// The SBOM as it really is -- line-by-line SPDX 3.0 JSON-LD with conformance
// annotations in the gutter. The active regulation drives which fields get
// dots and which lines flag "X requires this".

const { useState: _useSR, useMemo: _useMR } = React;

function RawScreen({ data, onOpenComponent }) {
  const initReg = data.regulations.find(r => r.active)?.id || data.regulations[0].id;
  const [activeReg, setActiveReg] = _useSR(initReg);
  const [selectedId, setSelectedId] = _useSR(null);

  const reg = data.regulations.find(r => r.id === activeReg);
  const summary = data.regSummary(activeReg);
  const doc = data.rawDoc;
  const fieldKeys = reg.fields.map(f => f.key);

  const statusFor = (comp, key, presentValue) => {
    if (!fieldKeys.includes(key)) return null;
    const field = reg.fields.find(f => f.key === key);
    if (!data.fieldAppliesTo(field, comp, reg)) return null;
    if (presentValue == null || presentValue === false) return "missing";
    if (key === "provenance" && !comp.provenance.signed) return "unverified";
    return "present";
  };

  const lines = _useMR(() => {
    const out = [];
    const push = (text, opts = {}) => out.push({ text, ...opts });
    push("{");
    push(`  "@context": "${doc["@context"]}",`);
    push(`  "specVersion": "${doc.specVersion}",`);
    push(`  "profiles": ${JSON.stringify(doc.profiles)},`);
    push(`  "documentNamespace": "${doc.documentNamespace}",`);
    push(`  "creationInfo": {`);
    push(`    "created": "${doc.creationInfo.created}",`, { fieldKey: "timestamp", status: fieldKeys.includes("timestamp") ? "present" : null });
    push(`    "creators": ["${doc.creationInfo.creators[0]}"],`, { fieldKey: "author", status: fieldKeys.includes("author") ? "present" : null });
    push(`    "licenseListVersion": "${doc.creationInfo.licenseListVersion}"`);
    push("  },");
    push(`  "name": "${doc.name}",`);
    push(`  "rootElement": "${doc.rootElement}",`);
    push(`  "elements": [`);
    doc.elements.forEach((e, i) => {
      const comp = data.components.find(c => c.id === e.spdxId);
      push(`    {`, { componentId: comp.id });
      push(`      "spdxId": "${e.spdxId}",`, { componentId: comp.id });
      push(`      "type": "${e.type}",`, { componentId: comp.id });
      push(`      "name": "${e.name}",`, { componentId: comp.id, fieldKey: "name", status: statusFor(comp, "name", e.name) });
      push(`      "packageVersion": "${e.packageVersion}",`, { componentId: comp.id, fieldKey: "version", status: statusFor(comp, "version", e.packageVersion) });
      push(`      "supplier": ${e.supplier === null ? "null" : `"${e.supplier}"`},`, { componentId: comp.id, fieldKey: "supplier", status: statusFor(comp, "supplier", e.supplier) });
      push(`      "licenseDeclared": ${e.licenseDeclared === null ? "null" : `"${e.licenseDeclared}"`},`, { componentId: comp.id, fieldKey: "license", status: statusFor(comp, "license", e.licenseDeclared) });
      if (e.checksums.length) {
        const k = e.checksums[0];
        push(`      "checksums": [{ "algorithm": "${k.algorithm}", "checksumValue": "${k.checksumValue}" }],`, { componentId: comp.id, fieldKey: "hash", status: statusFor(comp, "hash", k.checksumValue) });
      } else {
        push(`      "checksums": [],`, { componentId: comp.id, fieldKey: "hash", status: statusFor(comp, "hash", null) });
      }
      const pid = e.externalIdentifiers[0];
      push(`      "externalIdentifiers": [{ "type": "${pid.type}", "identifier": "${pid.identifier}" }],`, { componentId: comp.id, fieldKey: "purl", status: statusFor(comp, "purl", pid.identifier) });
      if (e.downloadLocation)  push(`      "downloadLocation": "${e.downloadLocation}",`, { componentId: comp.id, fieldKey: "sourceUri", status: statusFor(comp, "sourceUri", e.downloadLocation) });
      if (e.securityContact)   push(`      "securityContact": "${e.securityContact}",`, { componentId: comp.id, fieldKey: "securityContact", status: statusFor(comp, "securityContact", e.securityContact) });
      if (e.modelArchitecture) push(`      "modelArchitecture": "${e.modelArchitecture}",`, { componentId: comp.id, fieldKey: "ai.modelArchitecture", status: statusFor(comp, "ai.modelArchitecture", e.modelArchitecture) });
      if (e.trainingData)      push(`      "trainingData": ${JSON.stringify(e.trainingData)},`, { componentId: comp.id, fieldKey: "ai.trainingData", status: statusFor(comp, "ai.trainingData", e.trainingData) });
      if (e.energyConsumption) push(`      "energyConsumption": "${e.energyConsumption}",`, { componentId: comp.id, fieldKey: "ai.trainingEnergy", status: statusFor(comp, "ai.trainingEnergy", e.energyConsumption) });
      if (e.evaluationResults) push(`      "evaluationResults": "${e.evaluationResults}",`, { componentId: comp.id, fieldKey: "ai.evalResults", status: statusFor(comp, "ai.evalResults", e.evaluationResults) });
      if (e.modelCard)         push(`      "modelCard": "${e.modelCard}",`, { componentId: comp.id, fieldKey: "ai.modelCard", status: statusFor(comp, "ai.modelCard", e.modelCard) });
      if (e.intendedUse)       push(`      "intendedUse": ${JSON.stringify(e.intendedUse)},`, { componentId: comp.id, fieldKey: "ai.intendedUse", status: statusFor(comp, "ai.intendedUse", e.intendedUse) });
      push(`      "originatedBy": "${e.originatedBy}"`, { componentId: comp.id, fieldKey: "provenance", status: statusFor(comp, "provenance", true) });
      push(`    }${i === doc.elements.length - 1 ? "" : ","}`, { componentId: comp.id });
    });
    push("  ],");
    push(`  "relationships": [`);
    doc.relationships.forEach((r, i) => {
      push(`    { "from": "${r.from}", "to": "${r.to}", "relationshipType": "${r.relationshipType}" }${i === doc.relationships.length - 1 ? "" : ","}`);
    });
    push("  ]");
    push("}");
    return out;
  }, [activeReg]);

  const highlight = (text) => {
    const out = [];
    let m, re = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)/g;
    let last = 0, idx = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(<span key={idx++}>{text.slice(last, m.index)}</span>);
      let cls = null;
      if (m[1]) cls = "var(--ink)";
      else if (m[2]) cls = "var(--moss-ink)";
      else if (m[3]) cls = "var(--shu-deep)";
      else if (m[4]) cls = "var(--indigo)";
      out.push(<span key={idx++} style={{ color: cls, fontWeight: m[1] ? 500 : 400 }}>{m[0]}</span>);
      last = re.lastIndex;
    }
    if (last < text.length) out.push(<span key={idx++}>{text.slice(last)}</span>);
    return out;
  };

  const handleSelect = (id) => {
    setSelectedId(id);
    if (onOpenComponent) {
      const c = data.components.find(x => x.id === id);
      if (c) onOpenComponent(c);
    }
  };

  return (
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, margin: "0 auto" }}>
      <div>
        <Eyebrow>Raw view</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>The SBOM as it really is</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>The on-disk SPDX document, line by line. The gutter shows which fields the active regulation checks and whether each is present, missing, or unverified.</p>
      </div>

      <RegStrip data={data} activeReg={activeReg} setActiveReg={setActiveReg} />
      <RegSummaryLine summary={summary} reg={reg} />

      <div role="region" aria-label="Raw SBOM document"
        style={{ display: "grid", gridTemplateColumns: "32px 32px 1fr", background: "var(--white)", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        {lines.map((ln, i) => {
          const isSel = selectedId && ln.componentId === selectedId;
          const lineBg = isSel ? "var(--shu-soft)" : "transparent";
          const clickable = !!ln.componentId;
          const onKey = clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(ln.componentId); } } : undefined;
          const onClick = clickable ? () => handleSelect(ln.componentId) : undefined;
          const tab = clickable ? 0 : -1;
          return (
            <React.Fragment key={i}>
              <div onClick={onClick} onKeyDown={onKey} tabIndex={tab} role={clickable ? "button" : undefined} aria-label={clickable ? `Line ${i + 1} -- open component` : undefined}
                style={{ background: lineBg, color: "var(--ink-4)", padding: "0 6px", textAlign: "right", lineHeight: "20px", borderRight: "1px solid var(--border-soft)", cursor: clickable ? "pointer" : "default", userSelect: "none" }}>{i + 1}</div>
              <div aria-hidden="true" style={{ background: lineBg, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--border-soft)" }}>
                {ln.status && <FieldStatusDot present={ln.status !== "missing"} unverified={ln.status === "unverified"} />}
              </div>
              <div style={{ background: lineBg, padding: "0 12px", lineHeight: "20px", whiteSpace: "pre", color: "var(--ink-2)" }}>
                {highlight(ln.text)}
                {ln.status === "missing"    && <span style={{ marginLeft: 14, fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--ochre-ink)", background: "var(--ochre-soft)", padding: "0 6px", borderRadius: 2 }}>{reg.tag} requires this</span>}
                {ln.status === "unverified" && <span style={{ marginLeft: 14, fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--indigo-ink)", background: "var(--indigo-soft)", padding: "0 6px", borderRadius: 2 }}>unverified provenance</span>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { RawScreen });
