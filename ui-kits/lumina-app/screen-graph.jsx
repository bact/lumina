/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- Graph screen
//
// Dependency tree under the root component. Each node is colored by its
// conformance against the active regulation; AI elements get an M / D mark;
// components with known CVEs get a shu-red `!`.
//
// Scale strategy (Art's note: real SBOMs can have hundreds or thousands of
// components, not 14):
//   1. Zoom & pan -- drag to pan, wheel/buttons to zoom (0.3×–2.5×).
//   2. "Key components only" -- filter to high-centrality nodes (anything
//      with ≥ 2 dependency links, plus everything with vulnerabilities or
//      missing fields, plus the root). Layout re-flows on filtered set.
//   3. Live readout -- header tells you how many nodes are visible vs total.
//
// The transform is applied to a single inner <g>, keeping the SVG viewBox
// fixed so labels stay crisp and hit-testing math stays simple.

const { useState: _useSG, useMemo: _useMG, useRef: _useRG, useEffect: _useEG, useCallback: _useCBG } = React;

function GraphScreen({ data, onOpenComponent }) {
  const initReg = data.regulations.find(r => r.active)?.id || data.regulations[0].id;
  const [activeReg, setActiveReg] = _useSG(initReg);
  const [selectedId, setSelectedId] = _useSG(null);
  const [keyOnly, setKeyOnly] = _useSG(false);

  // ── Pan / zoom transform state ───────────────────────────────────────
  const [tx, setTx] = _useSG(0);
  const [ty, setTy] = _useSG(0);
  const [scale, setScale] = _useSG(1);
  const viewportRef = _useRG(null);
  const panState = _useRG(null);  // { startX, startY, baseTx, baseTy }

  const reg = data.regulations.find(r => r.id === activeReg);
  const summary = data.regSummary(activeReg);

  // ── Conformance per component (drives node coloring) ─────────────────
  const conformancePerComp = _useMG(() => {
    const out = {};
    data.components.forEach(c => {
      let missing = 0, unverified = 0, applicable = 0;
      reg.fields.forEach(f => {
        if (!data.fieldAppliesTo(f, c, reg)) return;
        applicable++;
        const v = data.componentField(c, f.key);
        if (!v.present) missing++;
        else if (f.key === "provenance" && !c.provenance.signed) unverified++;
      });
      out[c.id] = { missing, unverified, applicable };
    });
    return out;
  }, [activeReg]);

  // ── Adjacency + degree (for centrality filtering) ────────────────────
  const adjacency = _useMG(() => {
    const childrenOf = {}; const parentsOf = {};
    data.components.forEach(c => { childrenOf[c.id] = []; parentsOf[c.id] = []; });
    data.edges.forEach(([a, b]) => { childrenOf[a].push(b); parentsOf[b].push(a); });
    const degree = {};
    data.components.forEach(c => { degree[c.id] = childrenOf[c.id].length + parentsOf[c.id].length; });
    return { childrenOf, parentsOf, degree };
  }, []);

  // ── Visible-node set: either all, or key components + their ancestors ─
  const visibleIds = _useMG(() => {
    if (!keyOnly) return new Set(data.components.map(c => c.id));
    const root = data.components.find(c => c.root)?.id;
    const seeds = new Set();
    data.components.forEach(c => {
      const conf = conformancePerComp[c.id] || { missing: 0, unverified: 0 };
      const isImportant =
        c.root ||
        adjacency.degree[c.id] >= 2 ||
        (c.vulnerabilities || []).length > 0 ||
        conf.missing > 0 ||
        conf.unverified > 0;
      if (isImportant) seeds.add(c.id);
    });
    // Walk ancestors so the visible subgraph stays connected to the root
    const visible = new Set(seeds);
    const stack = [...seeds];
    while (stack.length) {
      const n = stack.pop();
      adjacency.parentsOf[n].forEach(p => { if (!visible.has(p)) { visible.add(p); stack.push(p); } });
    }
    if (root) visible.add(root);
    return visible;
  }, [keyOnly, activeReg, adjacency, conformancePerComp]);

  // ── Layout: BFS from root over visible nodes only ────────────────────
  const layout = _useMG(() => {
    const root = data.components.find(c => c.root).id;
    const depth = { [root]: 0 };
    const queue = [root];
    while (queue.length) {
      const n = queue.shift();
      adjacency.childrenOf[n].forEach(child => {
        if (!visibleIds.has(child)) return;
        if (!(child in depth)) { depth[child] = depth[n] + 1; queue.push(child); }
      });
    }
    const cols = {};
    Object.entries(depth).forEach(([id, d]) => { (cols[d] = cols[d] || []).push(id); });
    const colWidth = 260, rowHeight = 56;
    const positions = {};
    let maxRows = 0;
    Object.keys(cols).forEach(d => { maxRows = Math.max(maxRows, cols[d].length); });
    const h = Math.max(420, maxRows * rowHeight + 40);
    Object.keys(cols).forEach(d => {
      const items = cols[d];
      const totalH = items.length * rowHeight;
      const yStart = (h - totalH) / 2 + rowHeight / 2;
      items.forEach((id, i) => { positions[id] = { x: 40 + d * colWidth, y: yStart + i * rowHeight }; });
    });
    const maxDepth = Math.max(0, ...Object.values(depth));
    return { positions, depth, maxDepth, h, w: (maxDepth + 1) * colWidth + 80 };
  }, [visibleIds, adjacency]);

  // ── Visible edges: both endpoints must be in the visible set ─────────
  const visibleEdges = _useMG(() =>
    data.edges.filter(([a, b]) => visibleIds.has(a) && visibleIds.has(b) && layout.positions[a] && layout.positions[b])
  , [visibleIds, layout]);

  // ── Pan handlers (mouse / touch on viewport) ─────────────────────────
  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    panState.current = { startX: e.clientX, startY: e.clientY, baseTx: tx, baseTy: ty };
    viewportRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!panState.current) return;
    const dx = e.clientX - panState.current.startX;
    const dy = e.clientY - panState.current.startY;
    setTx(panState.current.baseTx + dx);
    setTy(panState.current.baseTy + dy);
  };
  const onPointerUp = (e) => {
    panState.current = null;
    viewportRef.current?.releasePointerCapture?.(e.pointerId);
  };

  // ── Wheel zoom -- keeps the cursor anchored to its world point ────────
  const onWheel = (e) => {
    if (!viewportRef.current) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = Math.max(0.3, Math.min(2.5, scale * factor));
    const rect = viewportRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    // Solve: keep (px,py) over the same world coords before/after zoom.
    const worldX = (px - tx) / scale;
    const worldY = (py - ty) / scale;
    setScale(next);
    setTx(px - worldX * next);
    setTy(py - worldY * next);
  };

  const zoomBy = (factor) => {
    if (!viewportRef.current) return;
    const next = Math.max(0.3, Math.min(2.5, scale * factor));
    const rect = viewportRef.current.getBoundingClientRect();
    const px = rect.width / 2, py = rect.height / 2;
    const worldX = (px - tx) / scale, worldY = (py - ty) / scale;
    setScale(next);
    setTx(px - worldX * next);
    setTy(py - worldY * next);
  };
  const resetView = _useCBG(() => {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const padding = 32;
    const sFit = Math.min(
      (rect.width  - padding * 2) / layout.w,
      (rect.height - padding * 2) / layout.h,
      1
    );
    setScale(sFit);
    setTx((rect.width  - layout.w * sFit) / 2);
    setTy((rect.height - layout.h * sFit) / 2);
  }, [layout]);

  // Re-fit whenever the visible set changes (toggle, reg switch)
  _useEG(() => { resetView(); }, [resetView]);

  // ── Selection ────────────────────────────────────────────────────────
  const handleSelect = (id) => {
    setSelectedId(id);
    if (onOpenComponent) {
      const c = data.components.find(x => x.id === id);
      if (c) onOpenComponent(c);
    }
  };

  const visibleNodes = data.components.filter(c => visibleIds.has(c.id) && layout.positions[c.id]);

  return (
    <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, margin: "0 auto" }}>
      <div>
        <Eyebrow>Graph view</Eyebrow>
        <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em" }}>How the components depend</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-3)" }}>
          The dependency tree under ghost-mesh. Each node is colored by its conformance against the active regulation. AI elements appear with an indigo M / D mark.
          Drag to pan, scroll or use the controls to zoom -- and switch to <strong style={{ color: "var(--ink-2)", fontWeight: 500 }}>key components</strong> when the graph is too dense to read at full size.
        </p>
      </div>

      <RegStrip data={data} activeReg={activeReg} setActiveReg={setActiveReg} />
      <RegSummaryLine summary={summary} reg={reg} />

      <Card padding={18}>
        {/* ── Top toolbar: density toggle + legend ──────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 11.5, color: "var(--ink-3)", marginBottom: 12, flexWrap: "wrap" }}>
          <Mono style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {visibleNodes.length} / {data.components.length} nodes · {visibleEdges.length} / {data.edges.length} edges · {reg.scope === "ai" ? "AI scope" : "software scope"}
          </Mono>
          <div role="radiogroup" aria-label="Graph density" style={{
            display: "inline-flex", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden",
            background: "var(--white)",
          }}>
            <DensityToggle label="All components" selected={!keyOnly} onClick={() => setKeyOnly(false)}
              detail={`${data.components.length}`} />
            <DensityToggle label="Key components" selected={keyOnly} onClick={() => setKeyOnly(true)}
              detail="High centrality" />
          </div>
          <div style={{ flex: 1 }} />
          <Legend color="var(--moss)"   label="Conformant" />
          <Legend color="var(--indigo)" label="Unverified" />
          <Legend color="var(--ochre)"  label="Missing fields" />
          <Legend color="var(--ink-4)"  label="Out of scope" />
        </div>

        {/* ── Pannable / zoomable viewport ──────────────────────────── */}
        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          role="application"
          aria-label={`Dependency graph: ${visibleNodes.length} components visible, checked against ${reg.tag}. Drag to pan, scroll to zoom.`}
          style={{
            position: "relative", height: 560, overflow: "hidden",
            background: "var(--paper-2)", border: "1px solid var(--border-soft)",
            borderRadius: 4, cursor: panState.current ? "grabbing" : "grab",
            touchAction: "none", userSelect: "none",
          }}>
          {/* Dot-grid background, drawn at world coords so it pans/zooms with content */}
          <svg width={layout.w} height={layout.h}
            style={{
              position: "absolute", top: 0, left: 0,
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: "0 0",
              pointerEvents: panState.current ? "none" : "auto",
            }}>
            <defs>
              <pattern id="lumina-dotgrid" width="8" height="8" patternUnits="userSpaceOnUse">
                <circle cx="0.5" cy="0.5" r="0.5" fill="#E6E1D4" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={layout.w} height={layout.h} fill="url(#lumina-dotgrid)" />

            {visibleEdges.map(([a, b], i) => {
              const pa = layout.positions[a], pb = layout.positions[b];
              const c1x = pa.x + 110, c2x = pb.x - 20;
              return (
                <path key={i}
                  d={`M ${pa.x + 110} ${pa.y} C ${(c1x + c2x) / 2} ${pa.y}, ${(c1x + c2x) / 2} ${pb.y}, ${pb.x - 20} ${pb.y}`}
                  fill="none" stroke="#DAD4C5" strokeWidth="1" />
              );
            })}

            {visibleNodes.map(c => {
              const p = layout.positions[c.id];
              const conf = conformancePerComp[c.id];
              const outOfScope = conf.applicable === 0;
              const ringColor = outOfScope ? "var(--ink-4)"
                : conf.missing > 0 ? "var(--ochre)"
                : conf.unverified > 0 ? "var(--indigo)"
                : "var(--moss)";
              const isSel = selectedId === c.id;
              const hasVulns = (c.vulnerabilities || []).length > 0;
              const kindMark = c.kind === "model" ? "M" : c.kind === "dataset" ? "D" : null;
              const hiddenChildren = adjacency.childrenOf[c.id].filter(id => !visibleIds.has(id)).length;
              const status = outOfScope ? "out of scope"
                : conf.missing > 0 ? `${conf.missing} missing fields`
                : conf.unverified > 0 ? `${conf.unverified} unverified fields`
                : "conformant";
              return (
                <g key={c.id} transform={`translate(${p.x - 20}, ${p.y - 18})`}
                  role="button" tabIndex="0"
                  aria-label={`${c.name} ${c.version} -- ${status}${hasVulns ? `, ${c.vulnerabilities.length} known vulnerabilities` : ""}${hiddenChildren > 0 ? `, ${hiddenChildren} dependencies hidden` : ""}. Open component details.`}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); handleSelect(c.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(c.id); } }}>
                  <rect x="0" y="0" width="220" height="36" rx="3"
                        fill={isSel ? "var(--shu-soft)" : "var(--white)"}
                        stroke={isSel ? "var(--shu)" : "var(--border)"} strokeWidth={isSel ? 1.5 : 1}
                        opacity={outOfScope ? 0.75 : 1} />
                  <circle cx="14" cy="18" r="4" fill={ringColor} />
                  <text x="26" y="16" fontSize="12" fontFamily="var(--font-sans)" fontWeight="500" fill="var(--ink)">{c.name}</text>
                  <text x="26" y="28" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-3)">{c.version} · {c.ecosystem}</text>
                  {kindMark && (
                    <>
                      <rect x="188" y="6" width="14" height="14" rx="2" fill="var(--indigo-soft)" />
                      <text x="195" y="16" textAnchor="middle" fontSize="9" fontFamily="var(--font-sans)" fontWeight="600" fill="var(--indigo-ink)">{kindMark}</text>
                    </>
                  )}
                  {hasVulns && (
                    <g transform={`translate(${kindMark ? 170 : 188}, 6)`}>
                      <rect width="14" height="14" rx="2" fill="var(--shu-soft)" />
                      <text x="7" y="10" textAnchor="middle" fontSize="9" fontFamily="var(--font-sans)" fontWeight="600" fill="var(--shu-ink)">!</text>
                    </g>
                  )}
                  {(conf.missing > 0 || conf.unverified > 0) && (
                    <text x="210" y="32" textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill={conf.missing > 0 ? "var(--ochre-ink)" : "var(--indigo-ink)"}>
                      {conf.missing > 0 ? `−${conf.missing}` : `?${conf.unverified}`}
                    </text>
                  )}
                  {/* Collapsed-children marker -- tells user there's more under this node */}
                  {hiddenChildren > 0 && (
                    <g transform="translate(224, 12)" aria-hidden="true">
                      <rect width="22" height="14" rx="7" fill="var(--paper-2)" stroke="var(--border)" />
                      <text x="11" y="10" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-3)">+{hiddenChildren}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* ── Floating zoom controls (HTML overlay, fixed to viewport) ── */}
          <div style={{
            position: "absolute", top: 12, right: 12,
            display: "flex", flexDirection: "column", gap: 4,
            background: "var(--white)", border: "1px solid var(--border)",
            borderRadius: 4, padding: 4, boxShadow: "var(--shadow-2)",
          }}>
            <ZoomButton icon="plus"        label="Zoom in"          onClick={() => zoomBy(1.2)} disabled={scale >= 2.5} />
            <ZoomButton icon="minus"       label="Zoom out"         onClick={() => zoomBy(1 / 1.2)} disabled={scale <= 0.3} />
            <ZoomButton icon="maximize"    label="Fit to viewport"  onClick={resetView} />
          </div>

          {/* Scale readout -- small confirmation of current zoom */}
          <div aria-live="polite" style={{
            position: "absolute", bottom: 10, left: 12,
            fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)",
            background: "rgba(255,255,255,0.85)", padding: "3px 8px", borderRadius: 999,
            border: "1px solid var(--border-soft)",
          }}>
            {Math.round(scale * 100)}%
          </div>

          {/* When key-only mode hides a lot, show how much */}
          {keyOnly && visibleNodes.length < data.components.length && (
            <div style={{
              position: "absolute", bottom: 10, right: 12,
              fontSize: 11.5, color: "var(--ink-3)",
              background: "rgba(255,255,255,0.92)", padding: "5px 10px", borderRadius: 4,
              border: "1px solid var(--border-soft)",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <Icon name="filter" size={11} style={{ color: "var(--ink-3)" }} />
              Hiding {data.components.length - visibleNodes.length} low-centrality nodes
            </div>
          )}
        </div>

        {/* Help text below the canvas -- gentle nudge for first-time users */}
        <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--ink-3)", display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span><Mono>drag</Mono> to pan</span>
          <span><Mono>scroll</Mono> to zoom</span>
          <span><Mono>+N</Mono> chip = collapsed dependencies</span>
        </div>
      </Card>
    </div>
  );
}

// ─── DensityToggle -- segmented button inside the radiogroup ─────────────
function DensityToggle({ label, detail, selected, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      style={{
        appearance: "none", fontFamily: "inherit", fontSize: 11.5,
        padding: "5px 10px", border: 0, borderRight: "1px solid var(--border)",
        background: selected ? "var(--ink)" : "transparent",
        color: selected ? "var(--paper)" : "var(--ink-2)",
        cursor: "pointer", display: "inline-flex", alignItems: "baseline", gap: 6,
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      <span style={{ fontWeight: selected ? 500 : 400 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, opacity: 0.75 }}>{detail}</span>
    </button>
  );
}

// ─── ZoomButton -- single icon-only control in the floating stack ────────
function ZoomButton({ icon, label, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      aria-label={label} title={label}
      style={{
        appearance: "none", border: 0, background: "transparent",
        width: 28, height: 28, borderRadius: 3, cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "var(--ink-4)" : "var(--ink-2)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <Icon name={icon} size={14} />
    </button>
  );
}

Object.assign(window, { GraphScreen });
