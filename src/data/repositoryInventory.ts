import { RepositoryReferenceRecord } from '../types/foundry';

export const REPOSITORY_INVENTORY: RepositoryReferenceRecord[] = [
  {
    id: 'uor-workflow',
    name: 'UOR-Workflow',
    owner: 'JH9384',
    canonicalUrl: 'https://github.com/JH9384/UOR-Workflow',
    role: 'Primary Foundry Workflow & Intake Boundary Reference',
    epistemicCondition: 'DOCUMENTED',
    accessVerified: true,
    observedCapabilities: [
      '4-file public workflow specification (README.md, docs/PUBLICATION_BOUNDARY.md, qualification/policies/acceptance-policy.example.json, templates/product-intake/README.md).',
      'Defines separation of duties: execution, technical qualification, and release authorization are distinct decisions.',
      'Enforces fail-closed gates and local-only storage boundary for raw controller runs, logs, execution IDs, and credentials.',
    ],
    documentedInterfaces: [
      'Gates: REGISTER -> REVIEW -> AUTHORIZE TEST -> EXECUTE -> VERIFY EVIDENCE -> QUALIFY -> REVIEW RELEASE.',
      'Intake fields: Product family (application | formal verification | scientific computation | other), Purpose, Inputs, Environment, Execution, Qualification, Evidence, Governance.',
      'Policy schema: uor.acceptance-policy.example.v1 (execution_authorization: SEPARATE_APPROVAL_REQUIRED, technical_acceptance: NOT_ASSESSED, release_authorization: DEFER).',
    ],
    existingTemplatesOrWorkflows: [
      'templates/product-intake/README.md (Product intake template)',
      'qualification/policies/acceptance-policy.example.json (Acceptance policy example)',
      'docs/PUBLICATION_BOUNDARY.md (Publication boundary checklist)',
    ],
    dependencies: ['None declared in public repository (documentation/template repo).'],
    verificationMechanisms: [
      'Manual 6-step publication checklist in docs/PUBLICATION_BOUNDARY.md.',
      'Fail-closed gate model requiring independent qualification and separate release governance.',
    ],
    missingOrUnclear: [
      'Proposed directories docs/architecture/, docs/engineering-captures/, and workflows/ are listed in README.md as planned areas but do not yet exist in the repository.',
      'No executable Windmill flow YAML/JSON or controller runtime code is committed.',
    ],
    consoleIntegrationPoints: [
      'Overview & Projects: Intake fields, product family taxonomy, fail-closed release blockers.',
      'Engineering Workflows: Canonical 7-gate lifecycle mapped onto 8 console stages.',
      'Approvals & Governance: Separation of execution authorization, technical qualification, and release authorization.',
    ],
  },
  {
    id: 'prismpm',
    name: 'PrismPM',
    owner: 'UOR-Foundation',
    canonicalUrl: 'https://github.com/UOR-Foundation/PrismPM',
    role: 'Product Engineering Lifecycle, Build, Verification & Artifact Packaging',
    epistemicCondition: 'DOCUMENTED',
    accessVerified: true,
    observedCapabilities: [
      'Compiles closed .lex.tex + lexlean.lock source graphs into verified Rust crates, hologram:guest/core-wasm@1 Wasm guests, HOLOVIEW browser artifacts, and binary Hologram v4 (.holo) archives.',
      'Defines versioned JSON contract schemas in CONTRACTS.md (e.g., prismpm/model-document/7, prismpm/library-verification-manifest/2, prismpm/verification-closure/1).',
      'Tracks explicit release boundaries in RELEASE-STATUS.md (v0.4.0 is a development SDK candidate, not an accepted production release; PP2011 Browser profile remains closed).',
    ],
    documentedInterfaces: [
      'CLI: cargo run --locked --offline -p prismpm -- --project <dir> check | build | verify',
      'Artifact container: Binary Hologram v4 (.holo starting with HOLO\\x04\\x00) and canonical model.prism.json.',
      'Example project root: examples/Calculator (src/Calculator.lex.tex + lexlean.lock -> .prism/build/ & .prism/verified/).',
    ],
    existingTemplatesOrWorkflows: [
      'Justfile targets: vv (./scripts/vv.sh), vv-part, defects, validate, conformance, unit-tests, check-fixtures, check-reproducibility.',
      '.github/workflows/: vv.yml, conformance-gate.yml, release-qualify.yml, reproducibility.yml, browser-input-qualification.yml.',
    ],
    dependencies: [
      'LexLean (snapshot, Lean/LaTeX generation, proof evidence), lean4-prod, Rust/Cargo offline workspace, hologram-live (.holo format authority).',
    ],
    verificationMechanisms: [
      '15-gate VV suite (just vv) and planted-defect falsifiability tests (just defects).',
      'Conformance suites: contracts, core, holo-stdlib, desktop-browser, system-oci, verification-schemas.',
      'Content-addressed build/verification output directories (.prism/build/, .prism/verified/).',
    ],
    missingOrUnclear: [
      'RELEASE-STATUS.md explicitly states Foundry reachable modeled services, mailbox enrollment/recovery, peer interoperability, and full user-journey acceptance remain open.',
      'Live HTTP/Windmill orchestration wrapper for PrismPM CLI is not defined in this repo.',
    ],
    consoleIntegrationPoints: [
      'Engineering Workflows: Build, Test, Verify, and Package stages aligned with PrismPM check/build/verify.',
      'Artifacts & Provenance: .holo, .crate, .wasm, model.prism.json, and content-addressed manifest model.',
      'Verification & Evidence: Honest distinction between component checks and full release acceptance.',
    ],
  },
  {
    id: 'lexlean',
    name: 'LexLean',
    owner: 'UOR-Foundation',
    canonicalUrl: 'https://github.com/UOR-Foundation/LexLean',
    role: 'Controlled-Language Compiler, Lean 4 Verifier & Production Attestation Engine',
    epistemicCondition: 'DOCUMENTED',
    accessVerified: true,
    observedCapabilities: [
      'Compiles closed controlled-language .lex.tex modules into canonical LaTeX, Lean 4 programs (no prose), source maps, coverage, and certified Rust packages.',
      'Strictly separates check/build (which never claim verification) from lexlean verify (compiles with leanprover/lean4:v4.32.1, replays via leanchecker, audits #print axioms, emits content-addressed attestation).',
      'Publishes formal JSON schemas for production requests and results (SPEC.md §24.7).',
    ],
    documentedInterfaces: [
      'CLI: lexlean init | lock | fmt | check | build | verify | production build | migrate --to 1.2 (--diagnostic-format json --color never).',
      'Schemas: lexlean/production-request/1, lexlean/production-result/1, lexlean/command-result/1, lexlean/lock/2.',
      'Container image: ghcr.io/uor-foundation/lexlean:0.4.0 (carries pinned Lean 4.32.1 toolchain).',
    ],
    existingTemplatesOrWorkflows: [
      'Justfile / xtask acceptance gate: just vv (fmt-check, model, spec-links, lint, test, features, bdd, inventory, examples, golden, repro, deny).',
      '.github/workflows/: reproducibility.yml, ci/conformance workflows.',
    ],
    dependencies: ['Rust toolchain, Cargo, elan / leanprover/lean4:v4.32.1, leanchecker.'],
    verificationMechanisms: [
      'Kernel replay with leanchecker + exact #print axioms audit.',
      'Byte-reproducibility check across distinct build directories (check-reproducibility) and golden tree comparison (check-golden).',
    ],
    missingOrUnclear: [
      'No built-in HTTP daemon or Windmill connector; requires CLI invocation or lexlean-mcp gateway.',
    ],
    consoleIntegrationPoints: [
      'Verification & Evidence: Independent LexLean verification suite representation with explicit axiom/toolchain identity.',
      'Artifacts & Provenance: production-result/1 fields (compiler.lean_toolchain, semantics SHA-256, crate SHA-256, certificates).',
    ],
  },
  {
    id: 'lexlean-mcp',
    name: 'LexLean MCP',
    owner: 'UOR-Foundation',
    canonicalUrl: 'https://github.com/UOR-Foundation/lexlean-mcp',
    role: 'Model Context Protocol Tool & Host-Effect Contract Layer for LexLean',
    epistemicCondition: 'DOCUMENTED',
    accessVerified: true,
    observedCapabilities: [
      'Exposes LexLean engine capabilities over MCP while keeping semantic authority strictly inside LexLean over the UOR Atlas.',
      'Documents closed-schema MCP tools, profile/draft identity hashing (lexlean-mcp-profile-v1), Unicode NFC path admission, and observability SLIs.',
      'Defines three honesty levels in CONFORMANCE.md: some-true (reproduced authority fact), build (oracle-validated), open (measured, never asserted).',
    ],
    documentedInterfaces: [
      'MCP Tools: lexlean_check, lexlean_snapshot, lexlean_format, lexlean_build, lexlean_explain, lexlean_attestation (read-only lookup by ID or 64-hex SHA-256), lexlean_profiles, lexlean_lexicon_search, lexlean_draft_write.',
      'Resource URI template: lexlean://profiles/{profile}/lexicon/{package}@{version}.',
      'Host Effects (E1..E10): store.get, store.put, engine.check, engine.snapshot, engine.format, engine.build, verify.start, verify.control, lexicon.read, attestation.lookup.',
    ],
    existingTemplatesOrWorkflows: [
      '.github/workflows/: lexlean.yml, prismpm.yml, bootstrap.yml, conventional-commits.yml.',
      'gateway/ production model and recorded exchange vectors (gateway/vectors/exchanges.json).',
    ],
    dependencies: ['UOR-Foundation/LexLean (e0b74b8 / v0.4.0), UOR-Foundation/MCP, UOR-Foundation/PrismPM.'],
    verificationMechanisms: [
      'cargo xtask check-model, cargo xtask audit-limits, cargo test -p gateway-tool-tests.',
      'Planted defect gates recorded in ATTESTATION.md and CONFORMANCE.md.',
    ],
    missingOrUnclear: [
      'EFFECTS.md & README.md note that verify.start / verify.control live host execution (#11, #17) and upstream PrismPM#216 / MCP#14 closures remain open.',
    ],
    consoleIntegrationPoints: [
      'System Connections & Windmill Adapter: Typed E1..E10 effect registry and future Windmill MCP resource tool invocation (/mcp_call_tool/{path}).',
      'AI Assistance: Grounded rule that LLM outputs cannot invent meaning or bypass signed LexLean attestations.',
    ],
  },
  {
    id: 'prism',
    name: 'Prism',
    owner: 'UOR-Foundation',
    canonicalUrl: 'https://github.com/UOR-Foundation/prism',
    role: 'Prism Standard Library Façade & Cryptographic/Numeric Axis Crates',
    epistemicCondition: 'DOCUMENTED',
    accessVerified: true,
    observedCapabilities: [
      'Provides the standard-library Rust façade (uor-prism) re-exporting uor-foundation, uor-foundation-sdk, and Layer-3 axis crates.',
      'Implements HashAxis (SHA-2/3, BLAKE3, Keccak), CurveAxis, SignatureAxis, CommitmentAxis, BigIntAxis, FieldAxis, TensorAxis, and FheAxis.',
      'Enforces normative wiki backlinks in CI via tools/wiki-link-check.',
    ],
    documentedInterfaces: [
      'Crates: uor-prism, uor-prism-verify (ADR-005 replay façade), uor-prism-crypto, uor-prism-numerics, uor-prism-tensor, uor-prism-fhe.',
      'Rust API surface: prism::pipeline::{prism_model, run_route}, prism::crypto::Sha256Hasher.',
    ],
    existingTemplatesOrWorkflows: ['.github/workflows/ci.yml, docs.yml, release.yml, wiki-drift.yml.'],
    dependencies: ['uor-foundation (crates.io), uor-foundation-sdk (crates.io).'],
    verificationMechanisms: ['Per-crate conformance tests (conformance.rs, verbs_conformance.rs, merkle_scaling.rs) and wiki-link-check.'],
    missingOrUnclear: ['No workflow runner, UI specification, or service orchestration layer.'],
    consoleIntegrationPoints: [
      'Artifacts & Provenance: Cryptographic digest conventions (SHA-256 / BLAKE3) and uor-prism-verify replay façade reference.',
    ],
  },
  {
    id: 'uor-framework',
    name: 'UOR Framework',
    owner: 'UOR-Foundation',
    canonicalUrl: 'https://github.com/UOR-Foundation/UOR-Framework',
    role: 'Canonical UOR Ontology, Algebraic Identity Space (Z/(2^n)Z) & Schema Authority',
    epistemicCondition: 'DOCUMENTED',
    accessVerified: true,
    observedCapabilities: [
      'Formalizes the UOR Foundation ontology (v0.5.2: 34 namespaces, 474 classes, 948 properties, 3,601 named individuals).',
      'Generates typed Rust trait crate (uor-foundation) and standard semantic exports (JSON-LD 1.1, Turtle, OWL 2, JSON Schema Draft 2020-12, SHACL, EBNF).',
    ],
    documentedInterfaces: [
      'Workspace binaries (clients/): uor-build, uor-crate, uor-docs, uor-website, uor-conformance.',
      'Exports: public/uor.foundation.jsonld, public/uor.foundation.schema.json, public/uor.shapes.ttl.',
    ],
    existingTemplatesOrWorkflows: ['.github/workflows/ci.yml, release.yml; cargo-uor CLI subcommand (explain_iri).'],
    dependencies: ['Rust workspace (spec/, codegen/, foundation/, conformance/, clients/).'],
    verificationMechanisms: ['cargo run --bin uor-conformance, cargo clippy -- -D warnings, cargo test.'],
    missingOrUnclear: ['Pure ontology & codegen workspace; does not define product lifecycle workflows or Windmill jobs.'],
    consoleIntegrationPoints: [
      'Projects & Artifacts: Content-addressed object identity conventions and canonical ontology terminology.',
    ],
  },
  {
    id: 'hologram-os',
    name: 'Hologram OS',
    owner: 'Hologram-Technologies',
    canonicalUrl: 'https://github.com/Hologram-Technologies/hologram-os',
    role: 'Related Content-Addressed Browser Resolver & Distributed Application Architecture',
    epistemicCondition: 'DOCUMENTED',
    accessVerified: true,
    observedCapabilities: [
      'Describes a 3-layer serverless architecture: Resolver (hologram-os), Apps (hologram-apps), and Engine (holospaces).',
      'Establishes byte-fingerprint re-derivation on load ("an object is what it is, not where it lives") and did:holo self-verifying identity concept.',
    ],
    documentedInterfaces: [
      'Conceptual resolver flow: URL -> object fingerprint -> cache/network fetch -> byte fingerprint re-verification -> render.',
      'System docs: CONSTITUTION.md, MANIFESTO.md, system/architecture.md, system/laws.md.',
    ],
    existingTemplatesOrWorkflows: ['Static specification and architecture documentation (13 files on home branch).'],
    dependencies: ['References external hologram-apps and holospaces repositories.'],
    verificationMechanisms: ['Architectural invariant: every byte is re-verified against its content-addressed fingerprint before execution.'],
    missingOrUnclear: [
      'Explicitly NOT the authoritative repository for the UOR Forge Kernel or Hologram Forge Application Core.',
      'Does not contain executable Forge Kernel ABI checks or browser acceptance test suites.',
    ],
    consoleIntegrationPoints: [
      'Repository References & Verification: Architectural reference for content-addressed delivery, explicitly separated from unverified Forge Kernel / App Core.',
    ],
  },
  {
    id: 'windmill',
    name: 'Windmill',
    owner: 'windmill-labs',
    canonicalUrl: 'https://github.com/windmill-labs/windmill',
    role: 'Self-Hosted Workflow, Script, Resource, Approval & App Runtime (Future Target)',
    epistemicCondition: 'DOCUMENTED',
    accessVerified: true,
    observedCapabilities: [
      'Open-source self-hostable workflow orchestrator executing scripts (Rust, TypeScript, Python, Bash, Go, SQL) and DAG flows.',
      'Provides workspace-scoped REST APIs for job execution, progress polling, resource management, MCP tool invocation, and approvals.',
    ],
    documentedInterfaces: [
      'Jobs API (backend/windmill-api/src/jobs.rs): /api/w/{workspace}/jobs/run/f/{path}, /api/w/{workspace}/jobs/run/p/{path}, /api/w/{workspace}/jobs/run_progress/{id}.',
      'Resources & MCP API (resources.rs): /api/w/{workspace}/resources/mcp_tools/{path}, /api/w/{workspace}/resources/mcp_call_tool/{path}.',
      'Approvals & Governance (approvals.rs): suspension/approval endpoints for human-in-the-loop flow steps.',
    ],
    existingTemplatesOrWorkflows: ['Flows, scripts, raw_apps, and approval suspend-resume primitives in Windmill core.'],
    dependencies: ['PostgreSQL, Rust backend/worker, self-hosted Mac Studio target at http://127.0.0.1:8080 (workspace: uor-offline-foundry).'],
    verificationMechanisms: ['Backend API contract tests and job execution audit logs in Windmill.'],
    missingOrUnclear: [
      'Actual flows/scripts deployed inside the operator Mac Studio workspace "uor-offline-foundry" are local and uninspected.',
      'LM Studio bridge script inside Windmill is PROPOSED and NOT CONNECTED in this preview.',
    ],
    consoleIntegrationPoints: [
      'Application Services -> Windmill Adapter: Typed target contracts ready for future http://127.0.0.1:8080 wiring.',
      'System Connections: Shows Windmill & LM Studio as NOT CONNECTED with exact target workspace metadata.',
    ],
  },
  {
    id: 'unverified-forge-boundary',
    name: 'Forge Kernel / Application Core / Acceptance Suites',
    owner: 'Private / Local UOR Boundary',
    canonicalUrl: 'local://restricted-uor-foundry-boundary',
    role: 'Independent Acceptance, ABI Verification, and Browser/Identity Suites (Unverified)',
    epistemicCondition: 'UNVERIFIED',
    accessVerified: false,
    observedCapabilities: [
      'Authoritative repositories and execution paths are kept outside public GitHub and outside Google AI Studio.',
    ],
    documentedInterfaces: [
      'Referenced conceptually as independent ownership boundaries (Forge Kernel acceptance/ABI, Hologram Forge Application Core, Browser & Identity acceptance suites).',
    ],
    existingTemplatesOrWorkflows: ['Not publicly inspectable; pending local verification in uor-offline-foundry.'],
    dependencies: ['Local workstation / Mac Studio controlled storage and private toolchains.'],
    verificationMechanisms: ['Pending verification — must never be fabricated or marked PASS in this console.'],
    missingOrUnclear: [
      'Authoritative code paths, ABI schemas, and live acceptance test runners have not been established from public repos.',
    ],
    consoleIntegrationPoints: [
      'Verification & Evidence: Displayed with NOT VERIFIED status and UNVERIFIED condition.',
      'Approvals & Governance: Blocks production release authorization until independent local evidence is recorded.',
    ],
  },
];
