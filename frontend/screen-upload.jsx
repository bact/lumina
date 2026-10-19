/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- Upload SBOM (Mode 2) and Import SARIF (Mode 3) screens.
//
//   POST /api/v1/sbom/check    multipart: file + regulation -> SbomCheckResponse
//   POST /api/v1/sarif/import  SARIF 2.1.0 JSON body        -> SbomCheckResponse
//
// Both render the result with ArtifactResult (screen-conformance.jsx) and show
// the server's error detail for a refused request (413, 422, 501, ...).

const { useState: _useSU, useRef: _useRefU } = React;

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(1)} MiB`;
}

// ─── FilePicker -- a native file input with a visible label ─────────────
function FilePicker({ id, label, accept, file, onChange, disabled }) {
  const inputRef = _useRefU(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <input ref={inputRef} id={id} type="file" accept={accept} disabled={disabled}
        className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => onChange(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
      <Button icon="file-up" disabled={disabled} onClick={() => inputRef.current && inputRef.current.click()}>{label}</Button>
      <span aria-live="polite" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
        {file ? <><Mono style={{ color: "var(--ink-2)" }}>{file.name}</Mono> · {formatBytes(file.size)}</> : "No file chosen"}
      </span>
      {file && !disabled && (
        <Button variant="ghost" size="sm" icon="x" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ""; }}>Clear</Button>
      )}
    </div>
  );
}

// Shared phase handling: run `request`, keep its result or its error text.
function useCheck() {
  const [phase, setPhase] = _useSU("idle"); // idle | running | done | error
  const [result, setResult] = _useSU(null);
  const [errorMsg, setErrorMsg] = _useSU("");
  async function start(request) {
    setPhase("running"); setResult(null); setErrorMsg("");
    try {
      setResult(await request()); setPhase("done");
    } catch (err) {
      setErrorMsg(String(err.message || err)); setPhase("error");
    }
  }
  const reset = () => { setPhase("idle"); setResult(null); setErrorMsg(""); };
  return { phase, result, errorMsg, start, reset };
}

function CheckOutcome({ check }) {
  return (
    <>
      <ResultAnnouncer result={check.phase === "done" ? check.result : null} />
      {check.phase === "running" && (
        <div role="status" style={{ fontSize: 12.5, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} /> Working…
        </div>
      )}
      {check.phase === "error" && <ErrorCard>{check.errorMsg}</ErrorCard>}
      {check.phase === "done" && check.result && <ArtifactResult result={check.result} />}
    </>
  );
}

// ─── Upload SBOM ───────────────────────────────────────────────────────
function UploadScreen() {
  const regs = useRegulations();
  const [regId, setRegId] = useSelectedRegulation(regs.regulations);
  const [file, setFile] = _useSU(null);
  const check = useCheck();
  const running = check.phase === "running";

  function submit() {
    if (!file || !regId) return;
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("regulation", regId);
    check.start(() => postForResult("/api/v1/sbom/check", { body: form }));
  }

  return (
    <ScreenFrame eyebrow="Upload SBOM" title="Check an SBOM file"
      intro="Choose an SPDX 2 or SPDX 3 SBOM file and a minimum elements standard. The server checks it with ntia-conformance-checker; the file is deleted after the check. You can switch the standard afterwards without uploading again.">
      <RegulationPicker state={regs} value={regId} disabled={running}
        onChange={(id) => {
          if (running || id === regId) return;
          setRegId(id);
          // A finished result is checked again against the new standard from its
          // own SBOM text; the file is not uploaded again.
          if (check.phase === "done" && canRecheck(check.result)) {
            const previous = check.result;
            check.start(() => recheckSbom(previous, id));
          } else check.reset();
        }} />
      <FilePicker id="sbom-file" label="Choose SBOM file" file={file} disabled={running}
        onChange={(f) => { setFile(f); check.reset(); }} />
      <div>
        <Button variant="primary" icon={running ? "loader" : "play"} onClick={submit} disabled={running || !file || !regId}>
          {running ? "Checking…" : "Check SBOM"}
        </Button>
      </div>
      <CheckOutcome check={check} />
    </ScreenFrame>
  );
}

// ─── Import SARIF ──────────────────────────────────────────────────────
// The SARIF log goes to the server as-is: it, not the browser, decides
// whether the text is valid JSON and a usable SARIF 2.1.0 log.
function SarifScreen() {
  const [file, setFile] = _useSU(null);
  const [text, setText] = _useSU("");
  const check = useCheck();
  const running = check.phase === "running";
  const hasInput = !!file || text.trim() !== "";

  function submit() {
    if (!hasInput) return;
    check.start(async () => postForResult("/api/v1/sarif/import", {
      headers: { "Content-Type": "application/json" },
      body: file ? await file.text() : text,
    }));
  }

  return (
    <ScreenFrame eyebrow="Import SARIF" title="Read a SARIF conformance log"
      intro="Choose or paste a SARIF 2.1.0 log made by a conformance checker. Nothing is re-checked: Lumina reads the log's results. The standard is taken from the log's rule ids.">
      <FilePicker id="sarif-file" label="Choose SARIF file" accept=".sarif,.json,application/json" file={file} disabled={running}
        onChange={(f) => { setFile(f); check.reset(); }} />
      <div>
        <label htmlFor="sarif-text" style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>
          {file ? "A file is chosen; clear it to paste instead." : "Or paste the SARIF JSON"}
        </label>
        <textarea id="sarif-text" value={text} disabled={running || !!file}
          onChange={(e) => { setText(e.target.value); check.reset(); }}
          rows={8} spellCheck={false}
          placeholder='{"version": "2.1.0", "runs": [ ... ]}'
          style={{
            width: "100%", boxSizing: "border-box", resize: "vertical",
            fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)",
            background: file ? "var(--paper-2)" : "var(--white)",
            border: "1px solid var(--border)", borderRadius: 4, padding: 10,
          }} />
      </div>
      <div>
        <Button variant="primary" icon={running ? "loader" : "log-in"} onClick={submit} disabled={running || !hasInput}>
          {running ? "Importing…" : "Import SARIF"}
        </Button>
      </div>
      <CheckOutcome check={check} />
      <MarginNote title="Which logs are read?">
        Rule ids must follow the SBOM requirements ontology (<Mono>BOM-[SPEC][YEAR]-…</Mono>, for example <Mono>BOM-NTIA2021-DF-001</Mono>) and name one supported standard and edition. A log for another edition, or one that mixes standards, is refused with the reason.
      </MarginNote>
    </ScreenFrame>
  );
}

Object.assign(window, { UploadScreen, SarifScreen });
