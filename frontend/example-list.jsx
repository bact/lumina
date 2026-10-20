/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- the "Try an example" list shared by Generate & check,
// Upload SBOM and Import SARIF.
//
// One card per example, always the same template (so the cards can be scanned
// by eye): a heading, then a body.
//
//   <name>                       the repository, model or file the example is about
//   <what it is>                 "<Format> model · <size> parameters", "Project · <models>", ...
//   From <source>                Hugging Face, GitHub, a local file, ...
//
// A subject has the same text on every page. Where the standard is the
// visitor's choice (Generate, Upload) the card does not show one; on Import
// SARIF a log belongs to one standard, so the card names it (`showStandard`).
// The list is a disclosure: open at first, collapsed by the screen once a check
// is started (more room, less distraction), and the visitor can open it again.

const { useState: _useSE } = React;

// What each example is about. kind: model | project | image (the group it is
// listed in). Fields not stated by the files are not invented: a size is the
// parameter count the SBOM holds.
const EXAMPLE_SUBJECTS = {
  distilbert: { kind: "model", name: "distilbert/distilbert-base-cased-distilled-squad", format: "Safetensors", size: "65M", extra: "with a dataset", source: "Hugging Face" },
  phi4:       { kind: "model", name: "microsoft/phi-4", format: "Safetensors", size: "14.7B", source: "Hugging Face" },
  mistral:    { kind: "model", name: "mistralai/Mistral-Small-4-119B-2603", format: "Safetensors", size: "119B", source: "Hugging Face" },
  granite:    { kind: "model", name: "ibm-granite/granite-4.2-30b", format: "Safetensors", size: "29.3B", source: "Hugging Face" },
  sony:       { kind: "model", name: "sonyinteractive/grooming-risk-classifier", format: "Safetensors", size: "303M", source: "Hugging Face" },
  openjai:    { kind: "model", name: "JTS-AI/OpenJAI-v1.0-14B", format: "Safetensors", size: "14.8B", source: "Hugging Face" },
  qwengguf:   { kind: "model", name: "Qwen/Qwen2.5-0.5B-Instruct-GGUF", format: "GGUF", size: "630M", source: "Hugging Face" },
  tiny:       { kind: "model", name: "phi-tiny-random", format: "Safetensors", size: "80K", source: "a local file" },
  sentiment:  { kind: "project", name: "bact/sentimentdemo", models: "fastText model", source: "GitHub" },
  pythainlp:  { kind: "project", name: "PyThaiNLP/pythainlp", models: "ONNX and CRFsuite models", source: "GitHub" },
  flask:      { kind: "project", name: "pallets/flask", models: "no AI model", source: "GitHub" },
  chainguard: { kind: "image", name: "Chainguard image", source: "Chainguard (apko)" },
};
const EXAMPLE_GROUPS = [
  { kind: "model", label: "Models" },
  { kind: "project", label: "Projects" },
  { kind: "image", label: "Container images" },
];

// "Safetensors model · 14.7B parameters", "Project · fastText model", ...
function exampleWhat(subject) {
  const s = EXAMPLE_SUBJECTS[subject];
  if (s.kind === "model") return `${s.format} model · ${s.size} parameters${s.extra ? ` · ${s.extra}` : ""}`;
  if (s.kind === "project") return `Project · ${s.models}`;
  return "Container image · SPDX 2 SBOM";
}
// "microsoft/phi-4, Safetensors model · 14.7B parameters" -- used in notes.
const exampleTitle = (subject) => `${EXAMPLE_SUBJECTS[subject].name}, ${exampleWhat(subject)}`;
const standardShort = (id) => (STANDARD_INFO[id] && STANDARD_INFO[id].short) || id;

// `examples`: [{ key, subject, standard, ... }]; `onChoose(example)`; `note`
// is what is spoken (and shown, while open) after a choice; `chosenKey` marks
// the card the form currently holds.
function ExampleList({ idPrefix, examples, open, onOpenChange, disabled, onChoose, chosenKey, note, showStandard = false, children }) {
  const regionId = `${idPrefix}-region`, headId = `${idPrefix}-head`;
  return (
    <section aria-labelledby={headId} className="example-list">
      <h2 id={headId} className="example-head">
        <button type="button" aria-expanded={open} aria-controls={regionId} onClick={() => onOpenChange(!open)}>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
          Try an example <span className="example-count">({examples.length})</span>
        </button>
      </h2>
      <div role="status" className="example-note">{open ? note : ""}</div>
      <div id={regionId} hidden={!open}>
        {EXAMPLE_GROUPS.filter(g => examples.some(ex => EXAMPLE_SUBJECTS[ex.subject].kind === g.kind)).map(g => {
          const gid = `${idPrefix}-group-${g.kind}`;
          return (
            <div key={g.kind} className="example-group">
              <div id={gid} className="example-group-label">{g.label}</div>
              <ul className="example-grid" aria-labelledby={gid}>
                {examples.filter(ex => EXAMPLE_SUBJECTS[ex.subject].kind === g.kind).map(ex => {
                  const s = EXAMPLE_SUBJECTS[ex.subject];
                  return (
                    <li key={ex.key}>
                      <button type="button" className="example-card" data-example={ex.key} disabled={disabled}
                        aria-current={ex.key === chosenKey ? "true" : undefined} onClick={() => onChoose(ex)}>
                        <span className="example-card-head">
                          <span className="example-name">{s.name}</span>
                          {showStandard && <span className="example-tag">{standardShort(ex.standard)}</span>}
                        </span>
                        <span className="example-card-body">
                          <span className="example-what">{exampleWhat(ex.subject)}</span>
                          <span className="example-source">From {s.source}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {children}
    </section>
  );
}

Object.assign(window, { EXAMPLE_SUBJECTS, exampleWhat, exampleTitle, ExampleList });
