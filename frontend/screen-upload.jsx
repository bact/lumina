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

const { useState: _useSU, useRef: _useRefU, useEffect: _useEU } = React;

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(1)} MiB`;
}

// ─── FilePicker -- a native file input with a visible label ─────────────
function FilePicker({ id, label, accept, file, onChange, disabled }) {
  const inputRef = _useRefU(null);
  // The input forgets its own choice whenever the file changes (also when an
  // example, not the input, set it), so choosing the same file again always fires.
  _useEU(() => { if (inputRef.current) inputRef.current.value = ""; }, [file]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <input ref={inputRef} id={id} type="file" accept={accept} disabled={disabled}
        className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => onChange(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
      <Button id={`${id}-choose`} icon="file-up" disabled={disabled} onClick={() => inputRef.current && inputRef.current.click()}>{label}</Button>
      <span aria-live="polite" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
        {file ? <><Mono style={{ color: "var(--ink-2)" }}>{file.name}</Mono> · {formatBytes(file.size)}</> : "No file chosen"}
      </span>
      {file && !disabled && (
        <Button variant="ghost" size="sm" icon="x" onClick={() => {
          onChange(null);
          const choose = document.getElementById(`${id}-choose`);
          if (choose) choose.focus();
        }}>Clear</Button>
      )}
    </div>
  );
}

// ─── Example files ──────────────────────────────────────────────────────
// Real files in frontend/examples/ (see working-docs/frontend.md for how each was
// made). Choosing one picks it as if the visitor had chosen it from disk, so
// the check that follows is the ordinary upload or import.
const EXAMPLE_SBOMS = [
  { subject: "tiny", file: "phi-tiny-random.spdx3.json", standard: "g7ai",
    note: "made by Pitloom from a tiny test model file" },
  { subject: "phi4", file: "phi-4.spdx3.json", standard: "g7ai",
    note: "made by Pitloom from the Hub metadata on 2026-10-20" },
  { subject: "qwengguf", file: "qwen2.5-0.5b-instruct-gguf.spdx3.json", standard: "g7ai",
    note: "made by Pitloom from the Hub metadata on 2026-10-20" },
  { subject: "chainguard", file: "chainguard-image.spdx.json", standard: "ntia",
    note: "an SPDX 2 JSON SBOM made by apko" },
].map(ex => ({ ...ex, key: ex.file }));

const EXAMPLE_SARIFS = [
  { subject: "tiny", file: "phi-tiny-random.g7ai.sarif.json", standard: "g7ai",
    note: "the G7 SBOM for AI result for its SBOM" },
  { subject: "phi4", file: "phi-4.g7ai.sarif.json", standard: "g7ai",
    note: "the G7 SBOM for AI result for its SBOM" },
  { subject: "phi4", file: "phi-4.ntia.sarif.json", standard: "ntia",
    note: "the NTIA result for the same SBOM" },
  { subject: "chainguard", file: "chainguard-image.ntia.sarif.json", standard: "ntia",
    note: "the NTIA result for its SBOM" },
].map(ex => ({ ...ex, key: ex.file }));

// The list of examples (example-list.jsx) with the loading of the chosen file.
// `onPick(content, example)` gets the example as a File (or, with `as="text"`,
// as its text) and returns a short phrase for what else it set. What was chosen,
// with the example's note, stays on screen (and is announced) for as long as
// `stillChosen(content, example)` holds, so it never describes a choice the
// visitor has since changed. `epoch` changes whenever the visitor picks, types
// or clears by hand: a load still running then is dropped. `describe(example)`
// says where the content went. `open`/`onOpenChange` are the list's disclosure.
function ExampleFiles({ idPrefix, examples, disabled, onPick, stillChosen, epoch, open, onOpenChange, showStandard = false, as = "file",
  describe = (ex) => `The file ${ex.file} is selected` }) {
  const [chosen, setChosen] = _useSU(null); // { content, ex, extra }
  const [error, setError] = _useSU("");
  const latest = _useRefU(0); // the newest choice; an older load that ends later is dropped
  const epochRef = _useRefU(epoch);
  epochRef.current = epoch;
  async function choose(ex) {
    const mine = ++latest.current, startedAt = epochRef.current;
    setError("");
    try {
      const response = await fetch(`/examples/${ex.file}`);
      if (!response.ok) throw new Error(`the server answered ${response.status}`);
      const blob = await response.blob();
      const content = as === "text" ? await blob.text() : new File([blob], ex.file, { type: "application/json" });
      if (mine !== latest.current || startedAt !== epochRef.current) return;
      setChosen({ content, ex, extra: onPick(content, ex) || "" });
    } catch (err) {
      if (mine !== latest.current || startedAt !== epochRef.current) return;
      setChosen(null);
      setError(`Could not load the example file ${ex.file}: ${String(err.message || err)}`);
    }
  }
  const current = chosen && stillChosen(chosen.content, chosen.ex) ? chosen : null;
  const note = current
    ? `Example chosen: ${exampleTitle(current.ex.subject)} (${current.ex.note}). ${describe(current.ex)}${current.extra}.` : "";
  return (
    <>
      <ExampleList idPrefix={idPrefix} examples={examples} open={open} onOpenChange={onOpenChange}
        disabled={disabled} onChoose={choose} note={note} chosenKey={current ? current.ex.key : undefined}
        showStandard={showStandard} />
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

function CheckOutcome({ check, busy = "Working…" }) {
  return (
    <>
      <ResultAnnouncer result={check.phase === "done" ? check.result : null} />
      {check.phase === "running" && (
        <div role="status" style={{ fontSize: 12.5, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" size={14} /> {busy}
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
  const [epoch, setEpoch] = _useSU(0); // counts the visitor's own file choices
  const [examplesOpen, setExamplesOpen] = _useSU(true); // the list is open until a check is started
  const check = useCheck();
  const running = check.phase === "running";
  const readyStandard = (id) => !!(standardList.standards && standardList.standards.find(r => r.id === id && r.ready));

  function submit() {
    if (!file || !standardId) return;
    setExamplesOpen(false);
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
        onChange={(f) => { setEpoch(e => e + 1); setFile(f); check.reset(); }} />
      <ExampleFiles idPrefix="example-sbom" examples={EXAMPLE_SBOMS} disabled={running} epoch={epoch}
        open={examplesOpen} onOpenChange={setExamplesOpen}
        stillChosen={(f, ex) => file === f && (!readyStandard(ex.standard) || standardId === ex.standard)}
        describe={(ex) => `The file ${ex.file} is selected${readyStandard(ex.standard) ? ` and ${standardLabel(ex.standard)} is selected` : ""}`}
        onPick={(f, ex) => {
          setFile(f); check.reset();
          if (readyStandard(ex.standard)) setStandardId(ex.standard);
          return "";
        }} />
      <div>
        <Button variant="primary" icon={running ? "loader" : "play"} onClick={submit} disabled={running || !file || !standardId}>
          {running ? "Checking…" : "Check SBOM"}
        </Button>
      </div>
      <CheckOutcome check={check} busy="Checking the SBOM…" />
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
  const [epoch, setEpoch] = _useSU(0); // counts the visitor's own picks, edits and clears
  const [examplesOpen, setExamplesOpen] = _useSU(true); // the list is open until a check is started
  const live = _useRefU({ file, text }); // what is in the form now, for a load that ends later
  live.current = { file, text };
  const check = useCheck();
  const running = check.phase === "running";
  const hasInput = !!file || text.trim() !== "";

  function submit() {
    if (!hasInput) return;
    setExamplesOpen(false);
    check.start(async () => postForResult("/api/v1/sarif/import", {
      headers: { "Content-Type": "application/json" },
      body: file ? await file.text() : text,
    }));
  }

  return (
    <ScreenFrame eyebrow={t("nav.sarif")} title={t("screen.sarif.title")}
      intro="Choose or paste a SARIF 2.1.0 log made by a conformance checker. Nothing is re-checked: Lumina reads the log's results. The standard is taken from the log's rule ids.">
      <FilePicker id="sarif-file" label="Choose SARIF file" accept=".sarif,.json,application/json" file={file} disabled={running}
        onChange={(f) => { setEpoch(e => e + 1); setFile(f); check.reset(); }} />
      <ExampleFiles idPrefix="example-sarif" examples={EXAMPLE_SARIFS} disabled={running} epoch={epoch}
        open={examplesOpen} onOpenChange={setExamplesOpen}
        as="text" showStandard stillChosen={(content) => !file && text === content}
        describe={(ex) => `The text of ${ex.file} is in the text box below`}
        onPick={(content) => {
          const replaced = live.current.text.trim() !== "" || !!live.current.file;
          setFile(null); setText(content); check.reset();
          return replaced ? ", replacing what was there" : "";
        }} />
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <label htmlFor="sarif-text" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {file ? (text.trim() ? "A file is chosen and is used; the text in the box is kept until you clear the file." : "A file is chosen; clear it to paste instead.") : "Or paste the SARIF JSON"}
          </label>
          {text !== "" && !file && (
            <Button variant="ghost" size="sm" icon="x" disabled={running}
              onClick={() => { setEpoch(e => e + 1); setText(""); check.reset(); textRef.current && textRef.current.focus(); }}>Clear text</Button>
          )}
        </div>
        <textarea id="sarif-text" ref={textRef} value={text} disabled={running || !!file}
          onChange={(e) => { setEpoch(n => n + 1); setText(e.target.value); check.reset(); }}
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
      <CheckOutcome check={check} busy="Importing the log…" />
      <MarginNote title="Which logs are read?">
        Rule ids must follow the SBOM requirements ontology (<Mono>BOM-[SPEC][YEAR]-…</Mono>, for example <Mono>BOM-NTIA2021-DF-001</Mono>) and name one supported standard and edition. A log for another edition, or one that mixes standards, is refused with the reason.
      </MarginNote>
    </ScreenFrame>
  );
}

Object.assign(window, { UploadScreen, SarifScreen });
