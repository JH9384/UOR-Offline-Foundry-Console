import { ReviewedSourceRecord } from '../types/foundry';

/**
 * Grounded UOR Source Review & Compliance Register.
 *
 * Every entry records the exact inspected commit SHA, license obligations,
 * documented capabilities, verification mechanisms, explicit claim distinctions
 * (proved | built | tested | observed | untested | blocked | refuted),
 * and integration status (never upgraded to QUALIFIED or CONNECTED by docs alone).
 */
export const REVIEWED_SOURCES_REGISTER: ReviewedSourceRecord[] = [
  {
    id: 'rule30',
    name: 'Rule 30 (LexLean & Lean 4 Formalization)',
    owner: 'afflom',
    canonicalUrl: 'https://github.com/afflom/rule30',
    reviewedCommitSha: 'e3be477fded263029479127363f7fb6a3597e7d4',
    reviewedCommitDate: '2026-11-12T02:08:28Z',
    relevantPaths: [
      'README.md',
      'frontier.toml',
      'pdf-manifest.json',
      'rule30-paper/src/Paper.lex.tex',
      'rule30-paper/src/Observations.lex.tex',
      'rule30-bridge/Rule30Bridge.lean',
      'rule30-api/CONFORMANCE.md',
      'scripts/check_no_choice.py',
    ],
    licenseSpdx: 'MIT',
    attributionNotice:
      'MIT License; compiled PDF/TeX mirrors in pdf-manifest.json require retaining source fingerprint & provenance.',
    documentedCapabilities: [
      'Lean 4 kernel (`leanprover/lean4:v4.32.1`) and `leanchecker` formalization of Rule 30 cellular automaton under constructive axioms `{propext, Quot.sound}` with zero `Classical.choice` (`scripts/check_no_choice.py`).',
      'Claim frontier register (`frontier.toml`) separating proved structural reductions (`center-defect-coupling`) from open Prize Problem 1 obligations (`aperiodic-compensation`).',
      'API conformance register (`rule30-api/CONFORMANCE.md`) mapping claims to three honesty levels (`some-true`, `build`, `open`) verified by `bin/r30 api check`.',
    ],
    intendedUorUse:
      'Inform the synthetic Formal Research Project template with claim-frontier tracking, constructivity axiom auditing, and non-conflation of proved lemmas with unresolved conjectures.',
    verificationMechanisms: [
      '`make check-research` enforcing every host module is a Lake root and axiom-audit import.',
      '`leanchecker` replay + `scripts/check_no_choice.py` rejecting `Classical.choice` and custom axioms.',
      '`bin/r30 api check` verifying `rule30-api/CONFORMANCE.md` against `features/suites/*.feature` and `model/ledger.toml`.',
    ],
    claimOrAcceptanceIds: [
      'problem1',
      'aperiodic-compensation',
      'center-defect-coupling',
      'center-periodic-of-coupling',
      'three-diagonal-band',
      'observed-5053d66f38fb',
    ],
    claims: [
      {
        id: 'center-defect-coupling',
        state: 'proved',
        statement: 'Exact lag-P fixed-point step relation published in `Observations.lex.tex`.',
        mechanism: 'Lean 4.32.1 kernel + `leanchecker` under `{propext, Quot.sound}`.',
      },
      {
        id: 'rule30-api-suites',
        state: 'built',
        statement: 'API routing, discovery, and register consistency scenarios.',
        mechanism: '`bin/r30 api check` oracle validation (honesty level: `build`, not mathematical proof).',
      },
      {
        id: 'observed-5053d66f38fb',
        state: 'observed',
        statement: 'Empirical finite-horizon phase and collision table records in `Rule30-Observations.pdf`.',
        mechanism: 'Pinned observational runs in `model/ledger.toml`.',
        limitationOrBlocker: 'Finite observations never establish universal periodicity/aperiodicity.',
      },
      {
        id: 'problem1',
        state: 'untested',
        statement: 'Wolfram Rule 30 Prize Problem 1 (non-periodicity of center column & interior bands).',
        mechanism: 'Reduced to `Rule30UOR.LeftBand.EightAperiodic` (`aperiodic-compensation`).',
        limitationOrBlocker: 'OPEN RESEARCH PROBLEM: explicitly marked unproved on `main`; must remain unverified.',
      },
      {
        id: 'aperiodic-compensation',
        state: 'blocked',
        statement: 'Bulk carries stripped of edge bands never equal ruler background plus periodic sequence.',
        mechanism: 'Remaining formal obligation `Rule30UOR.LeftBand.EightAperiodic`.',
        limitationOrBlocker: 'Blocked awaiting constructive proof; zero live research execution in AI Studio.',
      },
    ],
    testEvidenceAndLimitations: [
      'Proof audits cover only declared Lake root imports; `Rule30Prize` classical proofs are isolated and reproved constructively where used.',
      'No Lean 4 / Lake / `leanchecker` runtime exists inside Google AI Studio preview.',
    ],
    securityAndQualityRequirements: [
      'R1 single-source conformance register (`rule30-api/CONFORMANCE.md`).',
      'Strict constructivity axiom allowlist (`{propext, Quot.sound}` only) and zero `sorry` placeholders.',
    ],
    dependenciesAndOfflineAvailability: [
      'Requires offline `leanprover/lean4:v4.32.1`, `leanchecker`, LexLean binary, Python 3 (`check_no_choice.py`), and `bin/r30`. Unavailable in browser preview.',
    ],
    openIssuesAndBlockers: [
      'Rule 30 Prize Problem 1 (`problem1`) and `aperiodic-compensation` remain unproved.',
      'No live Windmill research execution runner is connected or authorized.',
    ],
    integrationStatus: 'REFERENCE ONLY',
  },
  {
    id: 'prism-devrel',
    name: 'Prism-DevRel (Product Generator & Source-Pinned Catalog)',
    owner: 'afflom',
    canonicalUrl: 'https://github.com/afflom/prism-devrel',
    reviewedCommitSha: '5f2ebfcec2bb6816c5bec6e6a17bbfdb6bab76a5',
    reviewedCommitDate: '2026-11-15T10:45:21Z',
    relevantPaths: [
      'README.md',
      'CONFORMANCE.md',
      'TEMPLATE-CONTRACT.md',
      'VERIFICATION.md',
      'devrel/subjects.json',
      'app/src/Catalog.lex.tex',
      'builder/assets/template/',
      'builder/vendor/prism-code/src/journey/template.mjs',
    ],
    licenseSpdx: 'MIT OR Apache-2.0',
    attributionNotice:
      'Dual-licensed MIT / Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`); vendored `builder/vendor/prism-code/LICENSE` retained separately.',
    documentedCapabilities: [
      'Models developer relations and reusable Prism app synthesis using `Foundation.DevRel.V1` subject pins (`devrel/subjects.json`).',
      'Enforces Diátaxis documentation structure (`tutorial`, `explanation`, `reference`) mapped to journey stages (`Discover`, `Evaluate`, `Learn`, `Build`, `Scale`) per `DR-14`..`DR-30`.',
      'Generates deterministic `uor/template-contract/1` project archives (`DR-09`, `DR-10`) and rejects catalogs with uncovered records or undeclared resources (`DR-01`, `DR-02`).',
    ],
    intendedUorUse:
      'Drive the synthetic Prism-Generated Application journey (facet coverage checklist, Diátaxis metadata preview, pinned subject inventory) while reserving real compilation/verification for local PrismPM/LexLean SDK.',
    verificationMechanisms: [
      '`just vv` / `cargo xtask check-model` & `cargo xtask audit-limits` enforcing R1–R6.',
      '`prismpm template check` and `prismpm lock check` verifying `uor/template-contract/1` bytes and multi-platform `prismpm.lock` digests.',
      'Lean kernel check of `Catalog::catalogCovered` (`DR-01`), `uncoveredRecordRefused` / `undeclaredResourceRefused` (`DR-02`), and UML 2.5.1 state invariants (`DR-17`).',
    ],
    claimOrAcceptanceIds: [
      'DR-01',
      'DR-02',
      'DR-03',
      'DR-07',
      'DR-09',
      'DR-10',
      'DR-11',
      'DR-14',
      'DR-15',
      'DR-16',
      'DR-17',
      'DR-18',
      'DR-30',
      'R1..R6',
    ],
    claims: [
      {
        id: 'DR-01..DR-03',
        state: 'built',
        statement: 'Catalog coverage, refusal of uncovered records, and pinned subject commitment enforcement.',
        mechanism: 'Lean kernel over generated `app/src/Catalog.lex.tex` (`build` honesty level).',
      },
      {
        id: 'DR-09..DR-11',
        state: 'built',
        statement: 'Deterministic ZIP synthesis from `UOR-Foundation/template` checked by locked SDK before publishing examples.',
        mechanism: 'Prompt builder + `prismpm.lock` devcontainer gate.',
        limitationOrBlocker: 'Requires locked PrismPM/LexLean SDK container; browser preview generation is synthetic only.',
      },
      {
        id: 'browser-prism-synthesis',
        state: 'untested',
        statement: 'Execution of real `.lex.tex` facet verification on synthesized browser inputs.',
        mechanism: 'Not present in browser preview.',
        limitationOrBlocker: 'Console preview cannot replace `prismpm` or `lexlean verify`.',
      },
    ],
    testEvidenceAndLimitations: [
      'Subject pages pin external commits in `devrel/subjects.json`; commit-pin validation fails (`DR-15`) if a checkout drifts.',
      'Builder preview alone never establishes `DR-11` SDK template acceptance.',
    ],
    securityAndQualityRequirements: [
      'R1–R6 template contract compliance (`VERIFICATION.md`): no blurred claim levels, no skipped tests, full escaping (`DR-05`, `DR-13`) treating subject text as data, not instructions.',
      'Pinned `prismpm.lock` SDK digests without mutable/wildcard dependencies.',
    ],
    dependenciesAndOfflineAvailability: [
      'Rust toolchain, Cargo offline lock (`Cargo.lock`), `prismpm.lock` SDK container, Node.js (`package-lock.json`). Browser lacks Rust/SDK.',
    ],
    openIssuesAndBlockers: [
      'Windmill / Mac Studio SDK runner (`uor-offline-foundry`) not connected; browser synthesis remains `DEMO` metadata only.',
    ],
    integrationStatus: 'CANDIDATE',
  },
  {
    id: 'stitch',
    name: 'Stitch (Routing-Layer Persistence & Custody Contracts)',
    owner: 'afflom',
    canonicalUrl: 'https://github.com/afflom/stitch',
    reviewedCommitSha: '1607d53dfc5a34324f8102123d166d727cc66634',
    reviewedCommitDate: '2026-11-15T00:33:45Z',
    relevantPaths: [
      'README.md',
      'CONTRACT.json',
      'docs/prism-model.md',
      'package.json',
      'src/layer1-uor/custody.js',
      'src/layer1-uor/generated-model.js',
      'app/src/Stitch/',
      'app/src/Product/',
      'product/source-verification.json',
      'product/source-attestation.json',
    ],
    licenseSpdx: 'MIT (declared in package.json/README; root LICENSE file missing)',
    attributionNotice:
      'MIT © Syntra Labs declared in `package.json` & `README.md` (GitHub API reports `null` license due to missing root `LICENSE`; third-party assets documented in `docs/vendor-provenance.md`).',
    documentedCapabilities: [
      'Full untruncated SHA-256 object commitments separating content identity from filenames and binding raw encoding, byte lengths, and 2-of-3 XOR parity fragments.',
      'RFC 8785 JCS canonical JSON codec (`src/layer1-uor/custody.js`) rejecting duplicate keys, `-0`, `NaN`, and `Infinity`.',
      'Explicit custody receipts (requested vs acknowledged vs committed) and semantic replay checkpoints for pure deterministic ring programs (`CONTRACT.json` v1.1.0).',
    ],
    intendedUorUse:
      'Adopt full SHA-256 byte commitments, byte-length tracking, deterministic pure-state checkpoint hashes, and explicit receipt-before-recovery semantics in Foundry artifacts & checkpoints—with ZERO P2P networking, relays, or external transport in this update.',
    verificationMechanisms: [
      '`node scripts/check-model.mjs`, `node scripts/check-source-evidence.mjs`, `npm test`, `python3 scripts/verify-custody.py`.',
      'Historical authoring run `43451144439` on commit `6c393bf7` (38 LexLean modules, 419 JS tests, 14 Chromium specs) preserved distinctly from latest revision `1607d53d`.',
    ],
    claimOrAcceptanceIds: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'],
    claims: [
      {
        id: 'C8 & C10',
        state: 'tested',
        statement: 'Signature round-trips, untruncated SHA-256 roots, JCS codec, and bounded DNS record sizing (<= 1024 B).',
        mechanism: 'Node + Python custody verification suites (`IMPLEMENTATION_TESTED`).',
        limitationOrBlocker: 'Session-key self-verification is not peer ownership trust.',
      },
      {
        id: 'authoring-run-43451144439',
        state: 'proved',
        statement: '38 LexLean modules verified on historical input commit `6c393bf736e316a9f58db38a3cc498948bd226fe`.',
        mechanism: 'LexLean/leanchecker attestation in `product/source-verification.json`.',
        limitationOrBlocker: 'Historical revision only; does NOT certify head `1607d53d` or pending native Prism artifact build.',
      },
      {
        id: 'C1',
        state: 'untested',
        statement: 'Physical direct WebRTC ICE setup across N >= 30 home/mobile/cloud pairs without TURN.',
        mechanism: 'Requires live cross-network trials.',
        limitationOrBlocker: 'UNTESTED in CI / browser mocks.',
      },
      {
        id: 'C2 & C5',
        state: 'blocked',
        statement: 'Recursive OS/ISP DNS cache staleness audit (C2) and BGP TCP 179/WireGuard announcements (C5).',
        mechanism: 'Requires authoritative DNS epoch probes & BIRD/FRR Linux daemon.',
        limitationOrBlocker: 'BLOCKED in browser environments.',
      },
      {
        id: 'C3, C4 & C6',
        state: 'refuted',
        statement: 'Poisson refresh superiority under uniform churn (C3 partial), periodic drop memorylessness (C4), and relayless WebRTC ICE (C6).',
        mechanism: 'Falsification suite (`CONTRACT.json`).',
        limitationOrBlocker: 'Explicitly REFUTED claims preserved against over-claiming.',
      },
    ],
    testEvidenceAndLimitations: [
      'Retained evidence (`product/source-verification.json`) is explicitly pinned to older commit `6c393bf7`, not `1607d53d`; native Prism artifact acceptance remains pending.',
      'Local browser trials do not qualify physical NAT traversal or external P2P transport.',
    ],
    securityAndQualityRequirements: [
      'Never equate a storage/publish request with a checked custody receipt.',
      'Origin-local keys cannot serve as cross-device authority; relay transport discloses non-private fragments and is disabled here.',
    ],
    dependenciesAndOfflineAvailability: [
      'Node.js >= 22, Python 3, optional Cargo (`--locked`) and pinned Prism/LexLean SDK.',
    ],
    openIssuesAndBlockers: [
      'Claims C1 (UNTESTED), C2/C5 (BLOCKED), and C3/C4/C6 (PARTIAL_REFUTED / REFUTED) forbid network/relay claims.',
      'Native Prism artifact build blocker recorded in `docs/native-build-diagnosis.md`; P2P transport intentionally excluded.',
    ],
    integrationStatus: 'REFERENCE ONLY',
  },
  {
    id: 'uorust',
    name: 'UORust (Cargo Workspace -> Prism/LexLean Model Translator)',
    owner: 'afflom',
    canonicalUrl: 'https://github.com/afflom/UORust',
    reviewedCommitSha: '2a2b674f15cd1d7bc638d4c52d0606ad135f3098',
    reviewedCommitDate: '2026-11-15T13:38:48Z',
    relevantPaths: [
      'README.md',
      'CONFORMANCE.md',
      'VERIFICATION.md',
      'TEMPLATE-CONTRACT.md',
      'Cargo.toml',
      'model/routes.toml',
      'crates/certified/manifest.toml',
      'crates/uorust/src/register.rs',
      'crates/conformance/tests/bdd.rs',
    ],
    licenseSpdx: 'MIT OR Apache-2.0',
    attributionNotice:
      'Dual-licensed MIT / Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`); self-certified manifest (`uorust/certified/1`) binds Rust spans.',
    documentedCapabilities: [
      'Inspects Cargo metadata, `Cargo.lock`, and `syn` AST facts with source spans through a deterministic route table (`model/routes.toml`).',
      'Enforces non-defaulting admission: ambiguous or unrouted Rust items produce typed `UorustError` / open claim refusals bound to exact source spans (`UE-03`, `UE-06`).',
      'Lifts pure subset functions into LexLean definitions and emits byte-identical Prism projections (`UE-02`, `UE-04`).',
    ],
    intendedUorUse:
      'Ground the synthetic Model Existing Rust Project template and prepare a fail-closed future Windmill workflow contract (`f/uor_foundry/uorust_model_workspace`) while never executing arbitrary imported repositories in AI Studio.',
    verificationMechanisms: [
      '`just vv` running `lexlean` + `prismpm` against self-modeled `app/` and committed fixtures (`thermostat`, `mir-path`, `advised`) (`UE-07`).',
      '`crates/conformance` BDD, ratchet, and self-model suites enforcing `UE-01`..`UE-16` and `R1`–`R6`.',
      '`uorust/certified/1` (`crates/certified/manifest.toml`) key-binding lifted functions to LexLean production results.',
    ],
    claimOrAcceptanceIds: [
      'UE-01',
      'UE-02',
      'UE-03',
      'UE-04',
      'UE-05',
      'UE-06',
      'UE-07',
      'UE-08',
      'UE-09',
      'UE-10',
      'UE-11..UE-16',
      'R1..R6',
    ],
    claims: [
      {
        id: 'UE-01..UE-07',
        state: 'built',
        statement: 'Byte-identical Cargo -> Prism projections, typed ambiguous/unrouted refusals, and router vector exactness.',
        mechanism: '`cargo test`, `crates/conformance`, `lexlean fmt/lock`, and `prismpm check` (`build` honesty level).',
      },
      {
        id: 'uorust-certified-lift',
        state: 'proved',
        statement: 'Lifted translator functions in `crates/certified/manifest.toml` checked by `lexlean production`.',
        mechanism: 'Lean kernel via `uorust certify sync`.',
        limitationOrBlocker: 'Applies strictly to listed certified root hashes (`result` array), not uninspected downstream Cargo crates.',
      },
      {
        id: 'browser-cargo-execution',
        state: 'blocked',
        statement: 'Running `cargo metadata` / `uorust` analysis directly inside AI Studio browser preview.',
        mechanism: 'Future Windmill runnable contract (`f/uor_foundry/uorust_model_workspace`) via local Mac Studio.',
        limitationOrBlocker: 'BLOCKED in browser sandbox for security & toolchain isolation; requires validated LOCAL Windmill.',
      },
    ],
    testEvidenceAndLimitations: [
      'Tested inside pinned SDK/Cargo environments (`rust-version = 1.89`, `Cargo.lock`); downstream imported Rust crates outside verified fixtures have no pre-established compliance.',
    ],
    securityAndQualityRequirements: [
      '`missing_docs = "deny"`, `unsafe_op_in_unsafe_fn = "deny"`, `cargo deny` wildcards denied (`wildcards = "deny"`).',
      'Untrusted third-party Rust `build.rs` / proc-macros must never execute inside AI Studio or unisolated browser sandboxes.',
    ],
    dependenciesAndOfflineAvailability: [
      'Rust >= 1.89, Cargo offline lock, `lexlean`, `prismpm`, `just`. Unavailable in AI Studio browser preview.',
    ],
    openIssuesAndBlockers: [
      'Live Windmill UORust workflow runnable (`f/uor_foundry/uorust_model_workspace`) is an unregistered proposal (`NOT CONNECTED`).',
      'Independent LexLean & PrismPM verification of modeled Cargo targets remains strictly separated from console preview.',
    ],
    integrationStatus: 'CANDIDATE',
  },
];
