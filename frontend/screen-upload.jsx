/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- Upload SBOM (Mode 2) and Import SARIF (Mode 3) screens.
//
//   POST /api/v1/sbom/check    multipart: file + standard -> SbomCheckResponse
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

// ─── Example files ──────────────────────────────────────────────────────
// Real files in frontend/examples/ (see working-docs/frontend.md for how each was
// made). Choosing one picks it as if the visitor had chosen it from disk, so
// the check that follows is the ordinary upload or import.
const EXAMPLE_SBOMS = [
  { label: "Safetensors model with 80K parameters", file: "phi-tiny-random.spdx3.json", standard: "g7ai",
    note: "made by Pitloom from a tiny test model file" },
  { label: "Safetensors model with 14.7B parameters", file: "phi-4.spdx3.json", standard: "g7ai",
    note: "microsoft/phi-4, made by Pitloom from the Hub metadata on 2026-10-20" },
  { label: "GGUF model with 630M parameters", file: "qwen2.5-0.5b-instruct-gguf.spdx3.json", standard: "g7ai",
    note: "Qwen2.5-0.5B-Instruct-GGUF, made by Pitloom from the Hub metadata on 2026-10-20" },
  { label: "Container image with an SPDX 2 SBOM", file: "chainguard-image.spdx.json", standard: "ntia",
    note: "an SBOM in SPDX 2 JSON, made by apko for a Chainguard container image" },
];

const EXAMPLE_SARIFS = [
  { label: "Safetensors model with 80K parameters (G7)", file: "phi-tiny-random.g7ai.sarif.json",
    note: "G7 SBOM for AI result for the tiny test model's SBOM" },
  { label: "Safetensors model with 14.7B parameters (G7)", file: "phi-4.g7ai.sarif.json",
    note: "G7 SBOM for AI result for the microsoft/phi-4 SBOM" },
  { label: "Safetensors model with 14.7B parameters (NTIA)", file: "phi-4.ntia.sarif.json",
    note: "NTIA result for the same SBOM" },
  { label: "Container image with an SPDX 2 SBOM (NTIA)", file: "chainguard-image.ntia.sarif.json",
    note: "NTIA result for the Chainguard container image SBOM" },
];

// A row of buttons; `onPick(file, example)` gets the example as a File (or, with
// `as="text"`, as its text) and returns a short phrase for what else it set.
// What was chosen, with the example's note, stays on screen (and is announced)
// under the buttons; `where` says where it went.
function ExampleFiles({ labelId, examples, disabled, onPick, as = "file", where = "is selected" }) {
  const [note, setNote] = _useSU("");
  const [error, setError] = _useSU("");
  const latest = _useRefU(0); // the newest choice; an older load that ends later is dropped
  async function choose(ex) {
    const mine = ++latest.current;
    setError("");
    try {
      const response = await fetch(`/examples/${ex.file}`);
      if (!response.ok) throw new Error(`the server answered ${response.status}`);
      const blob = await response.blob();
      const content = as === "text" ? await blob.text() : new File([blob], ex.file, { type: "application/json" });
      if (mine !== latest.current) return;
      const extra = onPick(content, ex) || "";
      setNote(`Example chosen: ${ex.label} (${ex.note}). The file ${ex.file} ${where}${extra}.`);
    } catch (err) {
      if (mine !== latest.current) return;
      setNote("");
      setError(`Could not load the example file ${ex.file}: ${String(err.message || err)}`);
    }
  }
  return (
    <>
      <div role="group" aria-labelledby={labelId} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span id={labelId} style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Try an example:</span>
        {examples.map(ex => (
          <Button key={ex.file} size="sm" variant="ghost" disabled={disabled}
            title={`${ex.file} (${ex.note})`} onClick={() => choose(ex)}>
            {ex.label}
          </Button>
        ))}
      </div>
      <div role="status" style={note ? { fontSize: 12.5, color: "var(--ink-3)" } : undefined}>{note}</div>
      {error && <ErrorCard title="Could not load the example">{error}</ErrorCard>}
    </>
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
  // Check the SBOM of `previous` again; if that fails, `previous` stays on
  // screen with the reason above it. Returns whether the new check succeeded.
  async function recheck(previous, request, failureText) {
    setPhase("running"); setResult(null); setErrorMsg("");
    try {
      setResult(await request()); setPhase("done");
      return true;
    } catch (err) {
      setResult(previous); setPhase("done");
      setErrorMsg(`${failureText}\n${String(err.message || err)}`);
      return false;
    }
  }
  return { phase, result, errorMsg, start, reset, recheck };
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
      {check.phase === "done" && check.errorMsg && <ErrorCard title="Could not switch the standard">{check.errorMsg}</ErrorCard>}
      {check.phase === "done" && check.result && <ArtifactResult result={check.result} />}
    </>
  );
}

// ─── Upload SBOM ───────────────────────────────────────────────────────
function UploadScreen() {
  const { t } = useLocale();
  const standardList = useStandards();
  const [standardId, setStandardId] = useSelectedStandard(standardList.standards);
  const [file, setFile] = _useSU(null);
  const check = useCheck();
  const running = check.phase === "running";

  function submit() {
    if (!file || !standardId) return;
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("standard", standardId);
    check.start(() => postForResult("/api/v1/sbom/check", { body: form }));
  }

  return (
    <ScreenFrame eyebrow={t("nav.upload")} title={t("screen.upload.title")}
      intro="Choose an SPDX 2 or SPDX 3 SBOM file and a minimum elements standard. The server checks it with ntia-conformance-checker; the file is deleted after the check. You can switch the standard afterwards without uploading again.">
      <StandardPicker state={standardList} value={standardId} disabled={running}
        onChange={(id) => {
          if (running || id === standardId) return;
          setStandardId(id);
          // A finished result is checked again against the new standard from its
          // own SBOM text; the file is not uploaded again.
          if (check.phase === "done" && canRecheck(check.result)) {
            const previous = check.result, previousId = standardId;
            check.recheck(previous, () => recheckSbom(previous, id),
              `Could not check this SBOM against ${standardLabel(id)}; the earlier result is shown.`)
              .then(ok => { if (!ok) setStandardId(previousId); });
          } else check.reset();
        }} />
      <FilePicker id="sbom-file" label="Choose SBOM file" file={file} disabled={running}
        onChange={(f) => { setFile(f); check.reset(); }} />
      <ExampleFiles labelId="example-sbom-label" examples={EXAMPLE_SBOMS} disabled={running}
        onPick={(f, ex) => {
          setFile(f); check.reset();
          const known = standardList.standards && standardList.standards.find(r => r.id === ex.standard);
          if (!(known && known.ready)) return "";
          setStandardId(ex.standard);
          return ` and ${standardLabel(ex.standard)} is selected`;
        }} />
      <div>
        <Button variant="primary" icon={running ? "loader" : "play"} onClick={submit} disabled={running || !file || !standardId}>
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
  const { t } = useLocale();
  const textRef = _useRefU(null);
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
    <ScreenFrame eyebrow={t("nav.sarif")} title={t("screen.sarif.title")}
      intro="Choose or paste a SARIF 2.1.0 log made by a conformance checker. Nothing is re-checked: Lumina reads the log's results. The standard is taken from the log's rule ids.">
      <FilePicker id="sarif-file" label="Choose SARIF file" accept=".sarif,.json,application/json" file={file} disabled={running}
        onChange={(f) => { setFile(f); check.reset(); }} />
      <ExampleFiles labelId="example-sarif-label" examples={EXAMPLE_SARIFS} disabled={running}
        as="text" where="is in the text box below"
        onPick={(content) => {
          const replaced = text.trim() !== "" || !!file;
          setFile(null); setText(content); check.reset();
          return replaced ? ", replacing what was there" : "";
        }} />
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <label htmlFor="sarif-text" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {file ? (text.trim() ? "A file is chosen and is used; the text you pasted is kept until you clear the file." : "A file is chosen; clear it to paste instead.") : "Or paste the SARIF JSON"}
          </label>
          {text !== "" && !file && (
            <Button variant="ghost" size="sm" icon="x" disabled={running}
              onClick={() => { setText(""); check.reset(); textRef.current && textRef.current.focus(); }}>Clear text</Button>
          )}
        </div>
        <textarea id="sarif-text" ref={textRef} value={text} disabled={running || !!file}
          onChange={(e) => { setText(e.target.value); check.reset(); }}
          rows={text ? 14 : 8} spellCheck={false}
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
