/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- fixture SBOM data
// Illustrative only. Mimics SPDX 3.0 shape without claiming completeness.
//
// Exposes window.LUMINA_DATA with:
//   projects      -- switcher list (4 projects, one is the deep example)
//   components    -- full ghost-mesh component list (software + AI elements)
//   edges         -- dependency graph edges [parent, child]
//   regulations   -- minimum-element definitions (NTIA, BSI TR-03183, G7 AI SBOM, MOF)
//   findHints     -- "Where to look" guidance per field
//   docFields     -- document-level fields (author / timestamp)
//   rawDoc        -- assembled SPDX 3.0 JSON-LD document
//   LICENSES      -- license metadata (SPDX list / OSI / FSF flags)
//   findings      -- derived list of gaps across active regulations (for Overview)
// And helpers:
//   componentField(c, key)         -- read a field off a component
//   regSummary(regId)              -- present / missing / unverified counts + gaps
//   fieldAppliesTo(field, c, reg)  -- whether a reg field is checked for a given component
//   componentsForReg(reg)          -- scope-aware component list (e.g. AI scope filters)
//   allVulns()                     -- flat list of {component, vuln}
//   vulnsForComponent(c)           -- c.vulnerabilities || []
//   licenseInfo(c)                 -- LICENSES entry for c.license, or unknown shape

window.LUMINA_DATA = (() => {

  // ── Projects ───────────────────────────────────────────────────────────
  const projects = [
    { id: "ghost-mesh", name: "ghost-mesh", repo: "acme/ghost-mesh", components: 14,  missing: 6, last: "2 hours ago", status: "needs-attention" },
    { id: "atlas-cli",  name: "atlas-cli",  repo: "acme/atlas-cli",  components: 87,  missing: 0, last: "Yesterday",   status: "conformant" },
    { id: "pillar-api", name: "pillar-api", repo: "acme/pillar-api", components: 204, missing: 41,last: "3 days ago",  status: "needs-attention" },
    { id: "loom-core",  name: "loom-core",  repo: "acme/loom-core",  components: 56,  missing: 2, last: "Mar 4",       status: "needs-attention" },
  ];

  // ── Licenses (lookup table) ────────────────────────────────────────────
  const LICENSES = {
    "MIT":          { spdx: true,  osi: true,  fsf: true,  name: "MIT License" },
    "Apache-2.0":   { spdx: true,  osi: true,  fsf: true,  name: "Apache License 2.0" },
    "BSD-3-Clause": { spdx: true,  osi: true,  fsf: true,  name: "BSD 3-Clause" },
    "WTFPL":        { spdx: true,  osi: false, fsf: true,  name: "Do What The F*ck You Want To Public License" },
    "CC0-1.0":      { spdx: true,  osi: false, fsf: true,  name: "Creative Commons Zero v1.0 Universal" },
    "LicenseRef-Llama-3-Community": { spdx: false, osi: false, fsf: false, name: "Llama 3 Community License (custom)" },
  };

  // ── Components ────────────────────────────────────────────────────────
  // Superset: software packages + AI elements (model / dataset).
  const components = [
    { id: "c1",  kind: "software", name: "ghost-mesh",   version: "0.4.2",  ecosystem: "internal", supplier: "Acme",                license: "Apache-2.0", purl: "pkg:internal/ghost-mesh@0.4.2",        hash: "sha256:a912…44e1", status: "present",   root: true,
      sourceUri: "https://github.com/acme/ghost-mesh", securityContact: "psirt@acme.example",
      provenance: { source: "package.json", verifiedHash: true, signed: true, fetched: "2 hours ago" } },
    { id: "c2",  kind: "software", name: "react",        version: "18.3.1", ecosystem: "npm",      supplier: "Meta Platforms",      license: "MIT",         purl: "pkg:npm/react@18.3.1",                 hash: "sha256:7c4a…0e91", status: "present",
      sourceUri: "https://github.com/facebook/react",
      provenance: { source: "npm registry", verifiedHash: true, signed: true, fetched: "2 hours ago" } },
    { id: "c3",  kind: "software", name: "lodash",       version: "4.17.21",ecosystem: "npm",      supplier: "OpenJS Foundation",   license: "MIT",         purl: "pkg:npm/lodash@4.17.21",               hash: "sha256:9f3a…b21c", status: "present",
      sourceUri: "https://github.com/lodash/lodash",
      provenance: { source: "npm registry", verifiedHash: true, signed: true, fetched: "2 hours ago" } },
    { id: "c4",  kind: "software", name: "left-pad",     version: "1.3.0",  ecosystem: "npm",      supplier: null,                  license: "WTFPL",       purl: "pkg:npm/left-pad@1.3.0",               hash: null,               status: "missing",
      sourceUri: null,
      provenance: { source: "npm registry", verifiedHash: false, signed: false, fetched: "2 hours ago" } },
    { id: "c5",  kind: "software", name: "openssl",      version: "3.2.0",  ecosystem: "generic",  supplier: "OpenSSL Project",     license: "Apache-2.0",  purl: "pkg:generic/openssl@3.2.0",            hash: "sha256:01ab…f8d2", status: "present",
      sourceUri: "https://github.com/openssl/openssl", securityContact: "openssl-security@openssl.org",
      provenance: { source: "system pkgmgr", verifiedHash: true, signed: true, fetched: "2 hours ago" },
      vulnerabilities: [
        { id: "CVE-2024-0727", severity: "medium", cvss: 5.5, summary: "PKCS12 file parsing -- NULL pointer dereference.", fixAvailable: true, fixedIn: "3.2.1", published: "2024-01-26" },
      ],
    },
    { id: "c6",  kind: "software", name: "log4j-core",   version: "2.17.1", ecosystem: "maven",    supplier: "Apache Foundation",   license: "Apache-2.0",  purl: "pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1", hash: "sha256:c9e1…aa44", status: "unverified",
      sourceUri: "https://github.com/apache/logging-log4j2", securityContact: "security@apache.org",
      provenance: { source: "maven central", verifiedHash: true, signed: false, fetched: "2 hours ago" },
      vulnerabilities: [
        { id: "CVE-2021-44832", severity: "medium", cvss: 6.6, summary: "Remote code execution via JDBC Appender configuration.", fixAvailable: true, fixedIn: "2.17.1", published: "2021-12-28", note: "Fixed in installed version." },
      ],
    },
    { id: "c7",  kind: "software", name: "axios",        version: "1.6.7",  ecosystem: "npm",      supplier: "Axios Contributors",  license: "MIT",         purl: "pkg:npm/axios@1.6.7",                  hash: "sha256:0d2c…71be", status: "present",
      sourceUri: "https://github.com/axios/axios",
      provenance: { source: "npm registry", verifiedHash: true, signed: true, fetched: "2 hours ago" },
      vulnerabilities: [
        { id: "CVE-2024-39338", severity: "high", cvss: 7.5, summary: "Server-side request forgery via protocol-relative URLs.", fixAvailable: true, fixedIn: "1.7.4", published: "2024-08-12" },
      ],
    },
    { id: "c8",  kind: "software", name: "rxjava",       version: "3.1.8",  ecosystem: "maven",    supplier: null,                  license: null,          purl: "pkg:maven/io.reactivex.rxjava3/rxjava@3.1.8", hash: "sha256:e442…2210", status: "missing",
      sourceUri: "https://github.com/ReactiveX/RxJava",
      provenance: { source: "maven central", verifiedHash: true, signed: false, fetched: "2 hours ago" } },
    { id: "c9",  kind: "software", name: "tensorflow",   version: "2.15.0", ecosystem: "pypi",     supplier: "Google",              license: "Apache-2.0",  purl: "pkg:pypi/tensorflow@2.15.0",           hash: "sha256:55bc…dd31", status: "present",
      sourceUri: "https://github.com/tensorflow/tensorflow", securityContact: "security@tensorflow.org",
      provenance: { source: "pypi", verifiedHash: true, signed: true, fetched: "2 hours ago" },
      vulnerabilities: [
        { id: "CVE-2024-31573", severity: "high", cvss: 7.8, summary: "Heap buffer overflow in `ParameterizedTruncatedNormal`.", fixAvailable: false, fixedIn: null, published: "2024-05-01", note: "Upstream advisory open. Workaround: avoid affected op." },
        { id: "CVE-2024-27775", severity: "low",  cvss: 3.7, summary: "Denial of service in `tf.raw_ops.QuantizeAndDequantizeV2`.", fixAvailable: true, fixedIn: "2.16.0", published: "2024-03-08" },
      ],
    },
    { id: "c10", kind: "software", name: "llama-cpp",    version: "0.2.41", ecosystem: "pypi",     supplier: "ggerganov",           license: "MIT",         purl: "pkg:pypi/llama-cpp-python@0.2.41",     hash: null,               status: "unverified",
      sourceUri: "https://github.com/abetlen/llama-cpp-python",
      provenance: { source: "pypi", verifiedHash: false, signed: false, fetched: "2 hours ago" },
      vulnerabilities: [
        { id: "GHSA-56xg-wj5h-7cw5", severity: "high", cvss: 8.6, summary: "Server-side template injection in chat template handler.", fixAvailable: true, fixedIn: "0.2.72", published: "2024-05-10" },
      ],
    },
    { id: "c11", kind: "software", name: "internal-auth",version: "0.0.7",  ecosystem: "internal", supplier: "Acme (internal)",     license: null,          purl: "pkg:internal/auth@0.0.7",              hash: "sha256:7711…0aa0", status: "missing",
      sourceUri: "https://github.acme.example/platform/auth",
      provenance: { source: "monorepo", verifiedHash: true, signed: false, fetched: "2 hours ago" } },

    // ── AI elements (SPDX 3.0 AI profile) ─────────────────────────────────
    { id: "ai1", kind: "model", name: "llama-3-8b-instruct", version: "instruct", ecosystem: "huggingface",
      supplier: "Meta Platforms", license: "LicenseRef-Llama-3-Community",
      purl: "pkg:huggingface/meta-llama/Meta-Llama-3-8B-Instruct",
      hash: "sha256:b88c…39a4", status: "unverified",
      sourceUri: "https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct",
      provenance: { source: "huggingface hub", verifiedHash: true, signed: false, fetched: "2 hours ago" },
      ai: {
        modelArchitecture: "Transformer decoder · 32 layers · 8B parameters",
        modelCard: "https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct/blob/main/MODEL_CARD.md",
        intendedUse: "Assistant-style chat in English; safety-tuned via RLHF.",
        trainingData: "Llama 3 pretraining mix (~15T tokens, publicly available sources). Composition not fully disclosed.",
        trainingDataOpen: false,           // MOF §I.2 -- corpus is not released under an open license
        trainingEnergy: "1.3 GWh (estimated) · ~390 tCO₂e",
        computeUsed: "~1.3M H100-hours",
        evalResults: "MMLU 68.4 · HellaSwag 78.6 · GSM-8K 79.6",
        hyperparameters: "ctx 8192, lr 3e-4 cosine, bsz 16M tokens",
      },
      // MOF-specific signals -- what the provider has released alongside
      // the weights. Lacks training corpus access + training code, so we
      // expect this model to land at Class III with partial Class II.
      mof: {
        inferenceCode:   "https://github.com/meta-llama/llama3",
        evalCode:        "https://github.com/meta-llama/llama3/tree/main/eval",
        technicalReport: "https://ai.meta.com/research/publications/the-llama-3-herd-of-models/",
        dataCard:        null,
        trainingCode:    null,
        researchPaper:   null,
      },
    },
    { id: "ai2", kind: "dataset", name: "common-crawl",  version: "2024-Q1", ecosystem: "dataset",
      supplier: "Common Crawl Foundation", license: "CC0-1.0",
      purl: "pkg:dataset/commoncrawl/2024-Q1",
      hash: "sha256:fe22…3a09", status: "present",
      sourceUri: "https://commoncrawl.org/2024-q1",
      provenance: { source: "commoncrawl.org", verifiedHash: true, signed: false, fetched: "2 hours ago" },
      ai: {
        trainingData: "3.1 PB web crawl, Jan–Mar 2024.",
        intendedUse: "Pretraining corpus for LLMs; no PII filter applied.",
      },
    },
    { id: "ai3", kind: "model", name: "ghost-rag-tune", version: "0.1.0", ecosystem: "internal",
      supplier: "Acme (internal)", license: null,
      purl: "pkg:internal/ghost-rag-tune@0.1.0",
      hash: "sha256:24ee…9101", status: "missing",
      sourceUri: "https://github.acme.example/ai/ghost-rag-tune",
      provenance: { source: "monorepo", verifiedHash: true, signed: false, fetched: "2 hours ago" },
      ai: {
        modelArchitecture: "LoRA adapter on llama-3-8b-instruct · rank 16",
        // Gaps below drive the G7 AI conformance view.
        modelCard: null,
        intendedUse: null,
        trainingData: null,
        trainingDataOpen: false,
        trainingEnergy: null,
        computeUsed: "~120 A100-hours",
        evalResults: null,
        hyperparameters: "ctx 4096, lr 2e-5",
      },
      // Internal fine-tune -- nothing public, so MOF lands below Class III.
      mof: {
        inferenceCode:   null,
        evalCode:        null,
        technicalReport: null,
        dataCard:        null,
        trainingCode:    null,
        researchPaper:   null,
      },
    },
  ];

  // ── Dependency edges (parent → child) ─────────────────────────────────
  const edges = [
    ["c1","c2"], ["c1","c3"], ["c1","c7"], ["c1","c9"], ["c1","c11"], ["c1","ai3"],
    ["c2","c4"], ["c7","c3"], ["c11","c6"], ["c9","c10"], ["c9","c5"],
    ["c6","c5"], ["c11","c8"],
    ["ai3","ai1"], ["ai1","ai2"], ["ai3","c10"],
  ];

  // ── Regulations ───────────────────────────────────────────────────────
  const regulations = [
    { id: "ntia", tag: "NTIA Min",  name: "NTIA Minimum Elements", version: "2021-07", active: true, scope: "software",
      fields: [
        { key: "supplier",  label: "Supplier name",            cite: "§I.A.1", rationale: "Identifies who produced the component." },
        { key: "name",      label: "Component name",           cite: "§I.A.2", rationale: "Distinguishes the unit being inventoried." },
        { key: "version",   label: "Version string",           cite: "§I.A.3", rationale: "Pins the exact release being shipped." },
        { key: "purl",      label: "Other unique identifier",  cite: "§I.A.4", rationale: "A second identifier (PURL/CPE/SWID) for cross-reference." },
        { key: "dep",       label: "Dependency relationship",  cite: "§I.A.5", rationale: "How this component reaches the top-level." },
        { key: "author",    label: "Author of SBOM data",      cite: "§I.A.6", rationale: "Who assembled this SBOM document." },
        { key: "timestamp", label: "Timestamp",                cite: "§I.A.7", rationale: "When the SBOM was created." },
      ]
    },
    { id: "bsi", tag: "BSI TR-03183", name: "BSI TR-03183 Part 2 (SBOM)", version: "v2.1.0", active: true, scope: "software",
      fields: [
        { key: "author",          label: "Creator of SBOM",          cite: "§5.2.1", rationale: "Mandatory. Identifies the party producing the SBOM document." },
        { key: "timestamp",       label: "Timestamp",                cite: "§5.2.1", rationale: "Mandatory. ISO-8601 creation time of the SBOM." },
        { key: "supplier",        label: "Supplier",                 cite: "§5.2.2", rationale: "Mandatory. The natural or legal person responsible for the component." },
        { key: "name",            label: "Component name",           cite: "§5.2.2", rationale: "Mandatory." },
        { key: "version",         label: "Version",                  cite: "§5.2.2", rationale: "Mandatory. The exact released version." },
        { key: "dep",             label: "Dependency",               cite: "§5.2.2", rationale: "Mandatory. Relationship to the rest of the product." },
        { key: "license",         label: "License",                  cite: "§5.2.2", rationale: "Mandatory. SPDX expression or declared text." },
        { key: "hash",            label: "Hash value",               cite: "§5.2.2", rationale: "Mandatory at integrity level. Cryptographic hash of the binary." },
        { key: "purl",            label: "Unique identifier",        cite: "§5.2.2", rationale: "Mandatory. PURL / CPE / SWID for cross-reference." },
        { key: "sourceUri",       label: "Source code URI",          cite: "§5.2.2", rationale: "Mandatory at recommended level. Where the source can be obtained." },
        { key: "securityContact", label: "Security contact (PSIRT)", cite: "§5.2.3", rationale: "Mandatory at recommended level. Channel for vulnerability reports." },
      ]
    },
    { id: "g7ai", tag: "G7 AI SBOM", name: "G7 SBOM for AI Minimum Elements", version: "2026-05", active: false, scope: "ai",
      fields: [
        { key: "supplier",              label: "Provider / supplier",       cite: "§Identity",   rationale: "The entity providing the AI model or dataset." },
        { key: "name",                  label: "Model / dataset name",      cite: "§Identity",   rationale: "Identifies the AI element." },
        { key: "version",               label: "Version",                   cite: "§Identity",   rationale: "Specific release of the model or dataset." },
        { key: "license",               label: "License",                   cite: "§Rights",     rationale: "License covering use and redistribution of the artifact." },
        { key: "hash",                  label: "Artifact integrity hash",   cite: "§Integrity",  rationale: "Cryptographic hash of model weights / dataset archive." },
        { key: "ai.modelArchitecture",  label: "Model architecture",        cite: "§AI.1",       rationale: "Class of model, parameter count, layer structure." },
        { key: "ai.trainingData",       label: "Training data sources",     cite: "§AI.2",       rationale: "Provenance and composition of training datasets." },
        { key: "ai.trainingEnergy",     label: "Training energy & compute", cite: "§AI.3",       rationale: "Energy consumed and compute used during training." },
        { key: "ai.evalResults",        label: "Evaluation results",        cite: "§AI.4",       rationale: "Benchmark scores and known limitations." },
        { key: "ai.modelCard",          label: "Model card",                cite: "§AI.5",       rationale: "Card describing the model's purpose, scope, and risks." },
        { key: "ai.intendedUse",        label: "Intended use",              cite: "§AI.6",       rationale: "Declared purpose and out-of-scope uses." },
      ]
    },

    // ── MOF (Model Openness Framework) ───────────────────────────────────
    // Tiered, not pass/fail. Each model is awarded the highest class for
    // which ALL fields at that class AND every lower class are present.
    //   Class III  Open Model     -- weights are usable, documented, licensed
    //   Class II   Open Tooling   -- + inference / eval code, technical report, datasheet
    //   Class I    Open Science   -- + training code, open training data, peer-reviewed paper
    // The conformance screen renders this differently from a flat % view.
    { id: "mof", tag: "MOF", name: "Model Openness Framework", version: "v1.0", active: false, scope: "ai", kind: "model", tiered: true,
      classes: [
        { id: 3, label: "Class III", subtitle: "Open Model",   description: "Weights are documented, licensed, and architecturally disclosed." },
        { id: 2, label: "Class II",  subtitle: "Open Tooling", description: "Inference / evaluation code and a technical report ship alongside the model." },
        { id: 1, label: "Class I",   subtitle: "Open Science", description: "Training code, open training data, and a peer-reviewed paper round out the release." },
      ],
      fields: [
        { key: "license",              label: "Open model license",       cls: 3, cite: "MOF §III.1", rationale: "OSI-approved license attached to the weights." },
        { key: "ai.modelCard",         label: "Model card",               cls: 3, cite: "MOF §III.2", rationale: "Documents purpose, scope, and limitations." },
        { key: "ai.modelArchitecture", label: "Architecture disclosure",  cls: 3, cite: "MOF §III.3", rationale: "Architecture and parameter count are public." },
        { key: "mof.inferenceCode",    label: "Inference code",           cls: 2, cite: "MOF §II.1",  rationale: "Code to run the model end-to-end is released." },
        { key: "mof.evalCode",         label: "Evaluation code",          cls: 2, cite: "MOF §II.2",  rationale: "Code that reproduces the published evals." },
        { key: "ai.evalResults",       label: "Evaluation results",       cls: 2, cite: "MOF §II.3",  rationale: "Benchmark scores published with the release." },
        { key: "mof.technicalReport",  label: "Technical report",         cls: 2, cite: "MOF §II.4",  rationale: "Detailed write-up of design and training." },
        { key: "mof.dataCard",         label: "Datasheet / data card",    cls: 2, cite: "MOF §II.5",  rationale: "Describes training-data composition and sourcing." },
        { key: "mof.trainingCode",     label: "Training code",            cls: 1, cite: "MOF §I.1",   rationale: "Scripts that produce the model from data." },
        { key: "ai.trainingData",      label: "Open training data",       cls: 1, cite: "MOF §I.2",   rationale: "Training data released under an open license." },
        { key: "mof.researchPaper",    label: "Peer-reviewed paper",      cls: 1, cite: "MOF §I.3",   rationale: "Full scientific publication of the work." },
      ]
    },
  ];

  // ── Planned regulations (roadmap) ─────────────────────────────────────
  // Reserved ids for regulations Lumina intends to cover but does not yet
  // support: no field definitions, no checker, and no screen renders them.
  // Promotion is mechanical: move an entry into `regulations` above with a
  // `fields` list (screens are data-driven and pick it up automatically),
  // then extend RegulationId and CHECKER_MAP in backend/app/conformance.py.
  const plannedRegulations = [
    { id: "eucra",   tag: "EU CRA",       name: "EU Cyber Resilience Act (SBOM requirements)",       scope: "software" },
    { id: "eo14028", tag: "EO 14028",     name: "US Executive Order 14028 (software supply chain)",  scope: "software" },
    { id: "fdapmp",  tag: "FDA PMP",      name: "FDA Premarket Cybersecurity (medical device SBOM)", scope: "software" },
    { id: "iso5230", tag: "ISO/IEC 5230", name: "ISO/IEC 5230 (OpenChain license compliance)",       scope: "software" },
  ];

  // ── "Where to look" guidance ──────────────────────────────────────────
  const findHints = {
    supplier: { title: "Where to find a supplier name", sources: [
      { who: "Package registry", detail: "npm / PyPI / Maven POM list a publisher or organization." },
      { who: "Upstream repo",    detail: "README, package.json `author`, LICENSE header." },
      { who: "Maintainer",       detail: "Open an issue or email to confirm legal entity." },
      { who: "You",              detail: "For internal components, the team-of-record owns the field." },
    ]},
    license: { title: "Where to find a license", sources: [
      { who: "License file",     detail: "LICENSE or COPYING at the repo root." },
      { who: "Package metadata", detail: "SPDX expression in package.json / setup.py / pom.xml." },
      { who: "ClearlyDefined",   detail: "Crowd-curated license metadata, scoped by version." },
      { who: "Legal review",     detail: "For ambiguous or absent declarations." },
    ]},
    hash: { title: "Where to find an integrity hash", sources: [
      { who: "Registry", detail: "npm `dist.integrity`, PyPI `digests`, Maven `.sha256` artifact." },
      { who: "Pitloom",  detail: "Re-run with `--verify-hashes` to compute on download." },
      { who: "Sigstore", detail: "If the artifact is signed, transparency log records the digest." },
    ]},
    purl: { title: "Where to find a unique identifier", sources: [
      { who: "purl spec", detail: "Construct from ecosystem + name + version (auto-derivable)." },
      { who: "CPE dict",  detail: "NVD's official CPE for CVE matching." },
    ]},
    dep: { title: "Where dependency relationships come from", sources: [
      { who: "Build tool", detail: "package-lock.json, poetry.lock, go.sum, Cargo.lock -- exact." },
      { who: "Pitloom",    detail: "Resolves transitively at SBOM-build time." },
    ]},
    author: { title: "Author of the SBOM data", sources: [
      { who: "Tool that built it", detail: "Pitloom emits its own identity into `creationInfo.creators`." },
      { who: "CI pipeline",        detail: "Job actor + organization for traceability." },
    ]},
    timestamp: { title: "Timestamp", sources: [
      { who: "SBOM document", detail: "`creationInfo.created` field -- must be ISO-8601." },
    ]},
    provenance: { title: "Provenance evidence", sources: [
      { who: "Sigstore / cosign",  detail: "Signed attestation for the artifact." },
      { who: "SLSA",               detail: "Build-level provenance describing how it was made." },
      { who: "Upstream signature", detail: "PGP key in registry or release tarball detached signature." },
    ]},
    vuln: { title: "Vulnerability disclosure", sources: [
      { who: "OSV / NVD",     detail: "Query by PURL or CPE." },
      { who: "GHSA",          detail: "GitHub Security Advisories for OSS ecosystems." },
      { who: "Vendor PSIRT",  detail: "Required for commercial components under CRA." },
    ]},
    sourceUri: { title: "Source code URI", sources: [
      { who: "Registry metadata", detail: "`repository` field in package metadata." },
      { who: "Upstream homepage", detail: "Project README usually links the source repo." },
      { who: "VCS tag",           detail: "The exact tag matching this version, when available." },
    ]},
    securityContact: { title: "Security contact (PSIRT)", sources: [
      { who: "security.txt",            detail: "RFC 9116 file at `/.well-known/security.txt`." },
      { who: "Project SECURITY.md",     detail: "GitHub-recognised security policy file in the repo." },
      { who: "Vendor disclosure page",  detail: "Required for commercial products under BSI TR-03183." },
    ]},
    name:    { title: "Component name", sources: [{ who: "Manifest", detail: "The build manifest is the source of truth." }] },
    version: { title: "Version string", sources: [{ who: "Manifest", detail: "Resolved lockfile is authoritative." }] },

    "ai.modelArchitecture": { title: "Model architecture", sources: [
      { who: "Model card",         detail: "Card on Hugging Face / vendor site typically declares it." },
      { who: "Config.json",        detail: "Transformers `config.json` lists layer count and width." },
      { who: "Training framework", detail: "Re-derive from the training script if internal." },
    ]},
    "ai.trainingData": { title: "Training data sources", sources: [
      { who: "Model card",      detail: "Datasheet section, if the provider supplies one." },
      { who: "Paper / report",  detail: "Provider's technical report for the model release." },
      { who: "Internal ledger", detail: "For fine-tunes, your own data registry should record the corpus." },
    ]},
    "ai.trainingEnergy": { title: "Training energy & compute", sources: [
      { who: "Vendor report",      detail: "Model card or technical paper -- often given as GPU-hours or kWh." },
      { who: "MLCO2 / CodeCarbon", detail: "Estimate from compute + region carbon intensity." },
      { who: "Internal logs",      detail: "Training cluster's power telemetry, for fine-tunes." },
    ]},
    "ai.evalResults": { title: "Evaluation results", sources: [
      { who: "Model card",          detail: "Benchmarks declared by the provider." },
      { who: "HELM / OpenLLM Lb",   detail: "Third-party leaderboards for cross-reference." },
      { who: "Internal eval suite", detail: "Run your own task-specific eval before adoption." },
    ]},
    "ai.modelCard": { title: "Model card", sources: [
      { who: "Provider's hub page", detail: "Hugging Face / vendor model page." },
      { who: "Inside the artifact", detail: "Some safetensors archives include MODEL_CARD.md." },
      { who: "Author it yourself",  detail: "For internal models -- template at huggingface.co/docs/hub/model-cards." },
    ]},
    "ai.intendedUse": { title: "Intended use & out-of-scope", sources: [
      { who: "Model card",    detail: "Standard section per HF / Mitchell et al. (2019) template." },
      { who: "Risk register", detail: "Required input for EU AI Act risk classification." },
    ]},

    // ── MOF-specific signals ──────────────────────────────────────
    "mof.inferenceCode": { title: "Inference code", sources: [
      { who: "Vendor repo",  detail: "Look for the inference / serving repo linked from the model card." },
      { who: "Model card",   detail: "Hugging Face model cards often link a reference implementation." },
    ]},
    "mof.evalCode": { title: "Evaluation code", sources: [
      { who: "Vendor repo",  detail: "`eval/` or `benchmarks/` subdir of the model release repo." },
      { who: "lm-eval-harness", detail: "Many providers publish their config against EleutherAI's harness." },
    ]},
    "mof.technicalReport": { title: "Technical report", sources: [
      { who: "Vendor publications", detail: "PDF on the provider's research page." },
      { who: "arXiv",        detail: "Provider's technical report is often on arXiv on release day." },
    ]},
    "mof.dataCard": { title: "Datasheet / data card", sources: [
      { who: "Dataset repo", detail: "`README.md` of the training dataset repo, or a dedicated `DATASHEET.md`." },
      { who: "Model card",   detail: "Sometimes inlined into the model card as a 'training data' section." },
    ]},
    "mof.trainingCode": { title: "Training code", sources: [
      { who: "Vendor repo",  detail: "Look for `train/`, `pretrain/`, or a separate training repo." },
      { who: "Reproduction", detail: "Projects like OLMo, Pythia, and DCLM publish their full training stack." },
    ]},
    "mof.researchPaper": { title: "Peer-reviewed paper", sources: [
      { who: "Venue",        detail: "NeurIPS / ICLR / ICML proceedings for the work." },
      { who: "arXiv",        detail: "Preprint with venue accepted status." },
    ]},
  };

  // ── Document-level fields ─────────────────────────────────────────────
  const docFields = {
    author:    { value: "Pitloom 0.9.4 (Acme/ghost-mesh CI)", status: "present" },
    timestamp: { value: "2026-05-11T08:14:22Z",               status: "present" },
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  function getNested(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function componentField(c, key) {
    if (key === "name")            return { value: c.name, present: true };
    if (key === "version")         return { value: c.version, present: !!c.version };
    if (key === "supplier")        return { value: c.supplier, present: !!c.supplier };
    if (key === "license")         return { value: c.license, present: !!c.license };
    if (key === "hash")            return { value: c.hash, present: !!c.hash };
    if (key === "purl")            return { value: c.purl, present: !!c.purl };
    if (key === "dep")             return { value: "direct", present: true };
    if (key === "sourceUri")       return { value: c.sourceUri, present: !!c.sourceUri };
    if (key === "securityContact") return { value: c.securityContact, present: !!c.securityContact };
    if (key === "author")          return { value: docFields.author.value, present: true, doc: true };
    if (key === "timestamp")       return { value: docFields.timestamp.value, present: true, doc: true };
    if (key === "provenance")      return { value: c.provenance && (c.provenance.signed ? "signed" : c.provenance.verifiedHash ? "hash-verified" : null), present: !!(c.provenance && (c.provenance.signed || c.provenance.verifiedHash)) };
    if (key === "vuln")            return { value: null, present: false };
    // MOF-specific signals live under c.mof.*; flat URL/string presence test.
    if (key.startsWith("mof."))    { const v = getNested(c, key); return { value: v, present: !!v }; }
    // MOF §I.2 reuses the ai.trainingData key but the bar is higher: data
    // must be OPEN, not merely declared. The reg passes context via the
    // field's `cls` so we can detect this case.
    if (key.startsWith("ai."))     { const v = getNested(c, key); return { value: v, present: !!v }; }
    return { value: null, present: false };
  }
  // Some fields have a stricter MOF-only bar than their G7 cousins. We
  // re-evaluate presence given the active regulation.
  function componentFieldForReg(c, field, reg) {
    const base = componentField(c, field.key);
    if (reg.id === "mof" && field.key === "ai.trainingData") {
      // Class I requires open training data, not just "we describe it"
      return { value: base.value, present: !!(c.ai && c.ai.trainingDataOpen) };
    }
    if (reg.id === "mof" && field.key === "license") {
      // Class III wants an OSI-recognised license, not just "any license"
      const li = c.license ? LICENSES[c.license] : null;
      return { value: c.license, present: !!(li && li.osi) };
    }
    return base;
  }
  function fieldAppliesTo(field, comp, reg) {
    if (reg.kind && comp.kind !== reg.kind) return false;
    if (reg.scope === "ai") return comp.kind === "model" || comp.kind === "dataset";
    if (field.key.startsWith("ai.") || field.key.startsWith("mof.")) return comp.kind === "model" || comp.kind === "dataset";
    return true;
  }
  function componentsForReg(reg) {
    if (reg.kind)            return components.filter(c => c.kind === reg.kind);
    if (reg.scope === "ai")  return components.filter(c => c.kind === "model" || c.kind === "dataset");
    return components;
  }
  // MOF tier assessment for a single model. Returns:
  //   { qualified: 3|2|1|null, next: classObj|null,
  //     progress: { present, total } toward `next`,
  //     perClass: { 3: {present,total}, 2: ..., 1: ... } }
  function mofTier(comp, reg) {
    const perClass = {};
    reg.classes.forEach(cls => {
      const fields = reg.fields.filter(f => f.cls === cls.id);
      let present = 0;
      fields.forEach(f => { if (componentFieldForReg(comp, f, reg).present) present++; });
      perClass[cls.id] = { present, total: fields.length };
    });
    // Cumulative: must satisfy this class AND all easier classes (higher id).
    // Easier-to-hardest order: 3, 2, 1.
    let qualified = null;
    for (const id of [3, 2, 1]) {
      const pc = perClass[id];
      if (pc.present === pc.total) qualified = id; else break;
    }
    // Progress is toward the NEXT class up (the one that just failed).
    const nextId = qualified === 1 ? null
                 : qualified === 2 ? 1
                 : qualified === 3 ? 2
                 : 3;
    const next = nextId ? reg.classes.find(c => c.id === nextId) : null;
    return { qualified, next, progress: nextId ? perClass[nextId] : null, perClass };
  }
  function regSummary(regId) {
    const reg = regulations.find(r => r.id === regId);
    let total = 0, present = 0, missing = 0, unverified = 0;
    const gaps = [];
    const inScope = componentsForReg(reg);
    inScope.forEach(c => {
      reg.fields.forEach(f => {
        if (!fieldAppliesTo(f, c, reg)) return;
        total++;
        const v = componentFieldForReg(c, f, reg);
        if (v.present) {
          if (f.key === "provenance" && c.provenance && !c.provenance.signed) {
            unverified++;
            gaps.push({ component: c, field: f, level: "unverified", note: "Hash verified but upstream signature missing." });
          } else {
            present++;
          }
        } else {
          missing++;
          gaps.push({ component: c, field: f, level: "missing", note: `Add ${f.label.toLowerCase()} -- ${f.rationale}` });
        }
      });
    });
    // For tiered regs, also compute per-component class assessment so the
    // conformance screen can render the tier ladder.
    let tiers = null;
    if (reg.tiered) {
      tiers = inScope.map(c => ({ component: c, ...mofTier(c, reg) }));
    }
    return { reg, total, present, missing, unverified, gaps, tiers };
  }
  function allVulns() {
    const out = [];
    components.forEach(c => (c.vulnerabilities || []).forEach(v => out.push({ component: c, vuln: v })));
    return out;
  }
  function vulnsForComponent(c) { return c.vulnerabilities || []; }
  function licenseInfo(c) {
    if (!c.license) return null;
    return LICENSES[c.license] || { spdx: false, osi: false, fsf: false, name: c.license + " (unknown)" };
  }

  // ── Raw SBOM document (SPDX 3.0 JSON-LD shape) ────────────────────────
  const rawDoc = {
    "@context": "https://spdx.org/rdf/3.0/spdx-context.jsonld",
    "specVersion": "3.0.1",
    "profiles": ["core", "software", "ai", "dataset", "security"],
    "documentNamespace": "https://acme.example/ghost-mesh/0.4.2/sbom",
    "creationInfo": {
      "created": docFields.timestamp.value,
      "creators": [docFields.author.value],
      "licenseListVersion": "3.23"
    },
    "name": "ghost-mesh@0.4.2 SBOM",
    "rootElement": "c1",
    "elements": components.map(c => {
      const type = c.kind === "model"   ? "ai_AIPackage"
                 : c.kind === "dataset" ? "dataset_DatasetPackage"
                 : "software_Package";
      const base = {
        "spdxId": c.id,
        "type": type,
        "name": c.name,
        "packageVersion": c.version,
        "supplier": c.supplier || null,
        "licenseDeclared": c.license || null,
        "checksums": c.hash ? [{ "algorithm": "SHA256", "checksumValue": c.hash.replace(/^sha256:/, "") }] : [],
        "externalIdentifiers": [{ "type": "purl", "identifier": c.purl }],
        "originatedBy": c.provenance.source,
      };
      if (c.sourceUri)       base.downloadLocation = c.sourceUri;
      if (c.securityContact) base.securityContact = c.securityContact;
      if (c.ai) {
        if (c.ai.modelArchitecture) base.modelArchitecture = c.ai.modelArchitecture;
        if (c.ai.trainingData)      base.trainingData      = c.ai.trainingData;
        if (c.ai.trainingEnergy)    base.energyConsumption = c.ai.trainingEnergy;
        if (c.ai.evalResults)       base.evaluationResults = c.ai.evalResults;
        if (c.ai.modelCard)         base.modelCard         = c.ai.modelCard;
        if (c.ai.intendedUse)       base.intendedUse       = c.ai.intendedUse;
      }
      return base;
    }),
    "relationships": edges.map(([a, b]) => ({ "from": a, "to": b, "relationshipType": "DEPENDS_ON" }))
  };

  // ── Derived findings list ─────────────────────────────────────────────
  // Flat list across active regulations, in the shape Overview / older
  // screens expect: { component, field, reg, severity, note }.
  const findings = (() => {
    const out = [];
    regulations.filter(r => r.active).forEach(reg => {
      const s = regSummary(reg.id);
      s.gaps.forEach(g => {
        out.push({
          component: g.component.name,
          field: g.field.key,
          reg: reg.id,
          severity: g.level,
          note: g.level === "unverified"
            ? `${g.field.label} declared but provenance is unverified.`
            : `${reg.tag} ${g.field.cite} requires ${g.field.label.toLowerCase()}.`,
        });
      });
    });
    return out;
  })();

  return {
    projects, components, edges, regulations, plannedRegulations, findHints, docFields, rawDoc, LICENSES, findings,
    componentField, componentFieldForReg, regSummary, fieldAppliesTo, componentsForReg,
    mofTier,
    allVulns, vulnsForComponent, licenseInfo,
  };
})();
