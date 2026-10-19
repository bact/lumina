/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- the "Generator log" view: what the server did to make the
// SBOM it checked (`result.generation_log`), in order and in a monospace font:
// the steps Lumina took (the real `git clone` command line), what git printed
// and every record Pitloom logged (INFO and above). Shown only for a generated
// SBOM; the lines are exactly what the API returned.

const { useState: _useSG } = React;

const formatElapsed = (ms) => `${(ms / 1000).toFixed(1)}s`;

// The log as plain text, for copying: "  0.4s  pitloom  WARNING  message".
function generatorLogText(lines) {
  return lines
    .map(l => `${formatElapsed(l.elapsed_ms).padStart(7)}  ${l.source.padEnd(7)}  ${l.level.toUpperCase().padEnd(7)}  ${l.message}`)
    .join("\n");
}

function GeneratorLog({ lines }) {
  const [copyState, setCopyState] = _useSG("");
  async function copy() {
    try {
      await copyText(generatorLogText(lines));
      setCopyState("Copied the generator log to the clipboard.");
    } catch (err) {
      setCopyState(`Could not copy: ${err.message || err}`);
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="sbom-toolbar">
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", maxWidth: "60ch" }}>
          What the server did to generate this SBOM, in order. <Mono>lumina</Mono> lines are steps
          Lumina took, <Mono>git</Mono> lines are git's own output, <Mono>pitloom</Mono> lines are
          the generator's INFO, WARNING and ERROR log records (a quiet run has few).
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{lines.length.toLocaleString("en")} {lines.length === 1 ? "line" : "lines"}</span>
          <Button size="sm" icon="copy" onClick={copy} aria-label="Copy the generator log to the clipboard">Copy</Button>
        </div>
      </div>
      <div role="status" className="sr-only">{copyState}</div>
      {copyState && <div aria-hidden="true" style={{ fontSize: 12, color: "var(--ink-3)" }}>{copyState}</div>}
      <div className="gen-log" tabIndex={0} role="region" aria-label={`Generator log, ${lines.length} lines`}>
        {lines.map((l, i) => (
          <div key={i} className={`gen-log-line gen-log-line--${l.level}`}>
            <span className="gen-log-time">{formatElapsed(l.elapsed_ms)}</span>
            <span className="gen-log-src">{l.source}</span>
            <span className="gen-log-level">{l.level.toUpperCase()}</span>
            <span className="gen-log-msg">{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { GeneratorLog, generatorLogText });
