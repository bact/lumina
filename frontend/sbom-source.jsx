/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- the SBOM source view: the checked SBOM as the API
// returned it (`result.sbom.display`), with line numbers and JSON syntax
// highlighting, plus the download and copy helpers.
//
// A 10 MiB SBOM can have hundreds of thousands of lines, so the view is
// windowed: every line has the same height, and only the lines in (and just
// around) the visible part of the scroll box are in the DOM. Any line can be
// reached by scrolling or by `target` (a line range to scroll to and mark).
// Highlighting runs per line and renders React text nodes, never HTML.

const { useState: _useSS, useRef: _useRefS, useEffect: _useEffS, useMemo: _useMemoS, useLayoutEffect: _useLayoutS } = React;

const SBOM_LINE_HEIGHT = 20;   // px; every row has this height (no wrapping)
const SBOM_OVERSCAN = 40;      // rows rendered above and below the visible ones
const SBOM_MAX_LINE_CHARS = 4000; // a longer line is cut in the view (not in copy or download)

// ─── Download and copy ──────────────────────────────────────────────────
const isJsonSbom = (sbom) => /json/.test(sbom.format || "") || /\.json$/i.test(sbom.filename || "");

// Save `sbom.text` (the original bytes, as the API returned them) under
// `sbom.filename`. A Blob URL works offline and needs no second request.
function downloadSbom(sbom) {
  const blob = new Blob([sbom.text], { type: isJsonSbom(sbom) ? "application/json" : "text/plain" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = sbom.filename || (isJsonSbom(sbom) ? "sbom.json" : "sbom.txt");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

// The Clipboard API exists only in a secure context; plain-HTTP deployments
// fall back to a hidden textarea and execCommand.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("The browser refused to copy.");
}

// The download button every result with an SBOM shows.
function DownloadSbomButton({ sbom, size = "md", label = "Download SBOM" }) {
  return (
    <Button size={size} icon="download" onClick={() => downloadSbom(sbom)}
      aria-label={`${label}: ${sbom.filename || "SBOM"}`} title={sbom.filename || undefined}>
      {label}
    </Button>
  );
}

// ─── JSON highlighting, one line at a time ─────────────────────────────
// `display` is pretty-printed JSON, so every token sits on one line. A line
// that is not JSON still renders: what the pattern does not know stays plain.
const SBOM_TOKEN_RE = /("(?:[^"\\]|\\.)*"?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)|([^"\s{}[\],:]+)/g;

function tokenizeJsonLine(line) {
  const tokens = [];
  SBOM_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = SBOM_TOKEN_RE.exec(line)) !== null) {
    if (m[1] !== undefined) {
      const isKey = /^\s*:/.test(line.slice(SBOM_TOKEN_RE.lastIndex));
      tokens.push({ kind: isKey ? "key" : "string", text: m[1] });
    } else if (m[2] !== undefined) tokens.push({ kind: "number", text: m[2] });
    else if (m[3] !== undefined) tokens.push({ kind: "literal", text: m[3] });
    else if (m[4] !== undefined) tokens.push({ kind: "punct", text: m[4] });
    else tokens.push({ kind: null, text: m[0] });
  }
  return tokens;
}

function SourceLine({ text, highlight }) {
  const cut = text.length > SBOM_MAX_LINE_CHARS;
  const shown = cut ? text.slice(0, SBOM_MAX_LINE_CHARS) : text;
  return (
    <>
      {highlight
        ? tokenizeJsonLine(shown).map((tok, i) => (tok.kind
          ? <span key={i} className={"sbom-tok-" + tok.kind}>{tok.text}</span>
          : tok.text))
        : shown}
      {cut && <span className="sbom-cut"> … {(text.length - SBOM_MAX_LINE_CHARS).toLocaleString("en")} more characters on this line (copy or download for all)</span>}
    </>
  );
}

// ─── GoToLine -- jump to any line by number ────────────────────────────
function GoToLine({ max, onGo }) {
  const [value, setValue] = _useSS("");
  const n = parseInt(value, 10);
  const valid = n >= 1 && n <= max;
  return (
    <form className="sbom-goto" onSubmit={(e) => { e.preventDefault(); if (valid) onGo(n); }}>
      <label htmlFor="sbom-goto-line">Go to line</label>
      <input id="sbom-goto-line" type="number" inputMode="numeric" min={1} max={max}
        value={value} onChange={(e) => setValue(e.target.value)} />
      <Button size="sm" type="submit" disabled={!valid} aria-label="Go to the line">Go</Button>
    </form>
  );
}

// ─── SbomSource -- the windowed, highlighted source of the checked SBOM ──
// `target` is { line, end_line, nonce } (1-based, inclusive) or null; a new
// nonce scrolls to the range again. `onJump(line)` asks the parent to target
// a line; `onBack` (when given) returns to the rule that linked here.
function SbomSource({ sbom, target, onJump, onBack, backLabel }) {
  const lines = _useMemoS(() => (sbom.display || "").split("\n"), [sbom.display]);
  const total = lines.length;
  const highlight = isJsonSbom(sbom);
  const boxRef = _useRefS(null);
  const [scrollTop, setScrollTop] = _useSS(0);
  const [viewHeight, setViewHeight] = _useSS(600);
  const [copyState, setCopyState] = _useSS("");
  const frame = _useRefS(0);

  _useEffS(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => setViewHeight(box.clientHeight || 600);
    measure();
    if (!window.ResizeObserver) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Scroll the target range into view (a third from the top), then move focus
  // to the source box so the keyboard scrolls it and screen readers land here.
  _useLayoutS(() => {
    const box = boxRef.current;
    if (!box || !target) return;
    const first = Math.min(Math.max(target.line, 1), total);
    const top = Math.max(0, (first - 1) * SBOM_LINE_HEIGHT - Math.floor(box.clientHeight / 3));
    box.scrollTop = top;
    setScrollTop(top);
    box.scrollIntoView({ block: "nearest" });
    box.focus({ preventScroll: true });
  }, [target && target.nonce]);

  const onScroll = (e) => {
    const top = e.currentTarget.scrollTop;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setScrollTop(top));
  };
  _useEffS(() => () => cancelAnimationFrame(frame.current), []);

  const first = Math.max(0, Math.floor(scrollTop / SBOM_LINE_HEIGHT) - SBOM_OVERSCAN);
  const last = Math.min(total, Math.ceil((scrollTop + viewHeight) / SBOM_LINE_HEIGHT) + SBOM_OVERSCAN);
  const hitFrom = target ? target.line : 0;
  const hitTo = target ? Math.max(target.end_line || target.line, target.line) : -1;
  const gutterCh = String(total).length + 1;

  async function copy() {
    try {
      await copyText(sbom.display);
      setCopyState("Copied the SBOM source to the clipboard.");
    } catch (err) {
      setCopyState(`Could not copy: ${err.message || err}`);
    }
  }

  const rows = [];
  for (let i = first; i < last; i += 1) {
    const n = i + 1;
    const hit = n >= hitFrom && n <= hitTo;
    rows.push(
      <div key={hit ? `${n}-${target.nonce}` : n} className={"sbom-line" + (hit ? " sbom-line--hit" : "")} data-line={n}>
        <span className="sbom-gutter" aria-hidden="true" style={{ width: `${gutterCh}ch` }}>{n}</span>
        <span className="sbom-code"><SourceLine text={lines[i]} highlight={highlight} /></span>
      </div>,
    );
  }

  const lineCount = typeof sbom.line_count === "number" ? sbom.line_count : total;
  const range = target ? (hitTo > hitFrom ? `lines ${hitFrom}–${hitTo}` : `line ${hitFrom}`) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="sbom-toolbar">
        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <Mono style={{ color: "var(--ink)", fontSize: 13, overflowWrap: "anywhere" }}>{sbom.filename || "SBOM"}</Mono>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{lineCount.toLocaleString("en")} {lineCount === 1 ? "line" : "lines"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <GoToLine max={total} onGo={onJump} />
          <Button size="sm" icon="copy" onClick={copy} aria-label="Copy the SBOM source to the clipboard">Copy</Button>
          <DownloadSbomButton sbom={sbom} size="sm" label="Download" />
        </div>
      </div>
      {(onBack || range) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, color: "var(--ink-3)" }}>
          {onBack && <Button size="sm" variant="ghost" icon="arrow-left" onClick={onBack}>{backLabel || "Back to result"}</Button>}
          {range && <span>Highlighted: {range}</span>}
        </div>
      )}
      <div role="status" className="sr-only">{range ? `Showing ${range} of ${sbom.filename || "the SBOM"}.` : ""} {copyState}</div>
      {copyState && <div aria-hidden="true" style={{ fontSize: 12, color: "var(--ink-3)" }}>{copyState}</div>}
      <div ref={boxRef} className="sbom-source" tabIndex={0} role="region" onScroll={onScroll}
        style={{ height: total * SBOM_LINE_HEIGHT + 14 }}
        aria-label={`Source of ${sbom.filename || "the SBOM"}, ${lineCount} lines`}>
        <div style={{ position: "relative", height: total * SBOM_LINE_HEIGHT }}>
          <div className="sbom-rows" style={{ top: first * SBOM_LINE_HEIGHT }}>{rows}</div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SbomSource, DownloadSbomButton, downloadSbom, tokenizeJsonLine, isJsonSbom });
