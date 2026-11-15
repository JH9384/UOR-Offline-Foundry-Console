# Mac Studio Prism-to-Hologram Qualification Guide

**Target Windmill Workspace:** `uor-offline-foundry` (`http://127.0.0.1:8080`)  
**Scope:** End-to-end local qualification on controlled Mac Studio hardware connecting `PrismPM`, `LexLean`, `Foundry`, `Hologram Live`, `Prism-DevRel`, `UORust`, `Rule30`, and `Stitch`. LM Studio remains untouched.

---

## 1. Pinned Upstream Repository & Toolchain Matrix

| Component / Repo | Canonical URL | Exact Pinned Commit SHA | License | Role in Pipeline |
| --- | --- | --- | --- | --- |
| `PrismPM` | `https://github.com/UOR-Foundation/PrismPM` | `6c876017bffa0e770cffc2225cb2d2422c35a69a` | `MIT OR Apache-2.0` | `v0.5.0` (MSRV `1.97`): `.lex.tex` closed-model compiler, `just vv` 15-gate suite, Core-Wasm, `HOLOVIEW`, `.holo` v4 (`HOLO\x04\0`) & v5 (`UORC\x02\x01`) |
| `LexLean` | `https://github.com/UOR-Foundation/LexLean` | `71defb4c663aaec5b9a3aab04cbc6a03e7106227` | `MIT OR Apache-2.0` | Closed semantic language (`lexlean fmt --check --all`, `lexlean check --all`, `lexlean build --all`, `lexlean verify --all`), Lean `4.32.1` |
| `Foundry` | `https://github.com/UOR-Foundation/foundry` | `760eaac29687628c7c66e8d492e126afa194656e` | `MIT OR Apache-2.0` | Forge Kernel / App Core boundaries (`INV-001`..`INV-004`), source-change proof invalidation, strict evidence gates |
| `Hologram Live` | `https://github.com/Hologram-Technologies/hologram-live` | `cbbf97b5b8199f5701c621cd3ba0b26187417ffa` | `MIT OR Apache-2.0` | `v1.0.0` (`hologram --json inspect/verify/holo plan/run`), import-free `hologram:guest/core-wasm@1` (`holo_run: (i32, i32) -> i64`) |
| `Prism-DevRel` | `https://github.com/afflom/prism-devrel` | `8af99e96f6bd9f5865721171e582d8df6ad53166` | `MIT OR Apache-2.0` | Guided Product 7-facet coverage model, `uor/template-contract/1`, Diataxis docs |
| `UORust` | `https://github.com/afflom/UORust` | `5868afe38012d647be00ad948949b1e384b87211` | `MIT OR Apache-2.0` | Cargo workspace -> `model/routes.toml` projection (`uorust project <ws> --out <dir>`) with typed non-defaulting `UorustError` span refusals |
| `Rule30` | `https://github.com/afflom/rule30` | `e3be477fded263029479127363f7fb6a3597e7d4` | `MIT` | Claim frontier register, constructive axioms `{propext, Quot.sound}` audit |
| `Stitch` | `https://github.com/afflom/stitch` | `1607d53dfc5a34324f8102123d166d727cc66634` | `MIT` | Full 64-hex SHA-256 commitment & pure-state checkpoint rules |

Required local toolchain pins on Mac Studio:
- Lean toolchain: `leanprover/lean4:v4.32.1`
- LexLean binary: `lexlean 0.4.0` (`ghcr.io/uor-foundation/lexlean:0.4.0`)
- PrismPM CLI: `v0.5.0` (`6c876017bffa0e770cffc2225cb2d2422c35a69a`, Rust `>= 1.97`)
- Hologram Live CLI: `v1.0.0` (`cbbf97b5b8199f5701c621cd3ba0b26187417ffa`)
- Rust toolchain: offline Cargo cache + `--locked --offline`
- Lockfiles verified per project before `BUILD`/`VERIFY`:
  - Native Prism & Guided Product: `prismpm.lock`, `lexlean.lock`, `standards.lock`
  - Existing Rust (UORust): `Cargo.lock`, `prismpm.lock`, `lexlean.lock`

---

## 2. Offline Dependency Closure Setup (Mac Studio)

1. Vendor all Rust crates cleanly inside each workspace before disconnecting network:
   ```bash
   cargo fetch --locked
   cargo vendor --locked vendor
   ```
2. Verify `.cargo/config.toml` points to `./vendor` with `offline = true`.
3. Verify lockfile closure hashes in `prismpm.lock`, `lexlean.lock`, `standards.lock`, and `Cargo.lock`. Missing or unpinned lockfiles fail Stage `03. Lock` with `PP5401`.

---

## 3. Fixed Windmill Command Registry Setup (`uor-offline-foundry`)

1. Start self-hosted Windmill (`http://127.0.0.1:8080`) on Mac Studio and select workspace `uor-offline-foundry`. Keep LM Studio configuration untouched.
2. Sync and validate the Windmill app bundle and generated registry/flow artifacts:
   ```bash
   npm run windmill:prepare
   npm run windmill:validate
   ```
   This generates `uor_foundry.raw_app/backend/generated_command_registry.ts` and `uor_foundry.raw_app/flows/prism_hologram_delivery.flow.json` directly from the single canonical registry `src/shared/adapters/windmillCommandRegistry.ts`.
3. Run `wmill app dev` inside `uor_foundry.raw_app/` to generate native `./wmill.ts` bindings (never commit a handwritten `wmill.ts`).
4. Bind `backend/prism_stage_dispatch.ts` and `backend/workflow_dispatch.ts` ONLY to `generated_command_registry.ts` (`prism_intake_validate`, `prism_specify_validate`, `uorust_project`, `prism_lock_check`, `lexlean_check`, `prismpm_check`, `lexlean_build`, `prismpm_build_locked`, `lexlean_verify`, `prismpm_verify`, `hologram_inspect`, `hologram_verify`, `hologram_plan`, `hologram_run`, `prism_review_qualify`, `prismpm_export_browser`). Arbitrary shell strings, chat prompts, `..` path traversals, or non-`uor-offline-foundry` workspaces are rejected fail-closed.

---

## 4. Ordered 8-Step Mac Studio Qualification Procedure (`PrismPM/examples/Calculator`)

Execute the following 8 steps in strict order against `UOR-Foundation/PrismPM@6c876017bffa0e770cffc2225cb2d2422c35a69a` (`examples/Calculator`) through the self-hosted `uor-offline-foundry` Windmill workspace:

1. **Step 1 — Verify Toolchain & Repository Pins Offline**: Confirm local clones/binaries match `PrismPM@6c876017bffa0e770cffc2225cb2d2422c35a69a`, `LexLean@71defb4c663aaec5b9a3aab04cbc6a03e7106227`, `hologram-live@cbbf97b5b8199f5701c621cd3ba0b26187417ffa`, `leanprover/lean4:v4.32.1`, and offline Cargo vendor closure; run `npm run windmill:prepare && npm run windmill:validate`.
2. **Step 2 — Intake & Specification Check (`SPECIFY` / `LOCK`)**: Run `prism_intake_validate`, `prism_specify_validate` (`lexlean --project examples/Calculator/lexlean.toml fmt --check --all`), and `prism_lock_check` (`prismpm --project examples/Calculator lock --check`).
3. **Step 3 — Closed-Language & Model Static Check (`CHECK`)**: Execute `lexlean_check` (`lexlean --project examples/Calculator/lexlean.toml check --all`) and `prismpm_check` (`prismpm --project examples/Calculator check`). Confirm these record static checks only and never certify verification.
4. **Step 4 — Deterministic Build (`BUILD`)**: Execute `lexlean_build` (`lexlean --project examples/Calculator/lexlean.toml build --all`) and `prismpm_build_locked` (`prismpm --project examples/Calculator build --locked`) to emit `.lex.tex`, `model.prism.json`, Lean/LCNF outputs, generated Cargo package, import-free `hologram:guest/core-wasm@1`, `HOLOVIEW\0\x01`, `examples/Calculator/dist/app.holo` (`HOLO\x04\0`), and build SHA-256 manifests.
5. **Step 5 — Independent Verification (`VERIFY`)**: Execute `prismpm_verify` (`prismpm --project examples/Calculator verify`) and `lexlean_verify` (`lexlean --project examples/Calculator/lexlean.toml verify --all`) twice consecutively per `RELEASE-STATUS.md` `just vv` acceptance requirements; record authenticated non-simulated execution IDs and SHA-256 digest bindings.
6. **Step 6 — Physical Archive Inspection & Verification (`INSPECT`)**: Run `hologram_inspect` (`hologram --json inspect examples/Calculator/dist/app.holo`) and `hologram_verify` (`hologram --json verify --path examples/Calculator/dist/app.holo`) confirming `HOLO\x04\0`, `"MFST"` manifest, non-zero 32-byte trailer, and matching on-disk SHA-256.
7. **Step 7 — Payload-Free Plan & Sandboxed Execution (`PREVIEW`)**: Execute `hologram_plan` (`hologram --json holo plan examples/Calculator/dist/app.holo`) followed by `hologram_run` (`hologram --json run --output-format json examples/Calculator/dist/app.holo`) under fuel/memory/deadline bounds without host imports.
8. **Step 8 — Human Qualification & Fail-Closed Export (`REVIEW` / `EXPORT_RELEASE`)**: Record human sign-off (`prism_review_qualify`) after inspecting verification evidence, source compliance gaps (`PP2011` browser acceptance status, `DR-11`, `C1..C6`), and `APPROVED_FOR_RELEASE` (`PRODUCTION_RELEASE` scope) before permitting `prismpm_export_browser` (`prismpm --project examples/Calculator export-browser examples/Calculator/dist/app.holo --output examples/Calculator/dist/browser`).

---

## 5. Additional Input Modes & Negative Verification Checks

### A. Guided Product (`GUIDED_PRODUCT`)
1. Draft 7-facet specification (`arch..release`) from `afflom/prism-devrel` `uor/template-contract/1`.
2. Require explicit human sign-off on draft `.lex.tex` (`humanReviewStatus: APPROVED_FOR_TOOLCHAIN`).
3. Compile and verify through the identical 8-step `PrismPM` + `LexLean` pipeline above.

### B. Existing Rust Cargo Fixture (`EXISTING_RUST`)
1. Run `uorust_project` (`uorust project <ws> --out <ws>/.prism/projection`) against `Cargo.toml`, `Cargo.lock`, `model/routes.toml`.
2. Confirm any unsupported syntax or `unsafe extern` FFI spans produce typed non-defaulting `UorustError` refusals.
3. Confirm `cargo build --locked --offline` evidence is recorded separately and **never** satisfies `PrismPM` verification or `APPROVED_FOR_RELEASE`.

### C. Negative & Invalidation Verification Checks
- **JSON masquerading as `.holo`:** Feeding `{"fake":"holo"}` into `.holo` inspector returns `PP3001` (`REJECTED_JSON_AS_HOLO_PP3001`).
- **Unsupported HOLO version / corrupt trailer / manifest / digest:** Feeding `HOLO\x03\0` returns `UNSUPPORTED_ARCHIVE_VERSION`; zeroed trailer returns `PP3001`; corrupt manifest JSON returns `INVALID_MANIFEST`; digest mismatch returns `PP5401`.
- **Browser preflight vs verified release:** In-browser `.holo` checks return at most `'STRUCTURAL PREFLIGHT PASS'` (`artifactState: 'PREFLIGHT_CHECKED'`), never certifying `'VERIFIED'` or production release.
- **Source edit invalidation (`INV-003`):** Editing `sourceRevision` after `PASS` forces prior suites to `NOT VERIFIED` (`STALE`) and blocks `APPROVED_FOR_RELEASE`.
- **Direct binary download gate:** UI buttons for `.holo Archive Binary`, `Generated Source Archive`, `Core-Wasm + HOLOVIEW Bundle`, and `Verified Evidence Bundle` remain disabled whenever `!fileExistsOnDisk || !sha256Verified || artifactState !== 'VERIFIED'`.

---

## 6. Authoring-to-Production Handoff (`uor.foundry.source-package.v1`)

Google AI Studio operates exclusively as an authoring, preliminary review, and simulated workflow studio. Before transferring a project to Mac Studio (`uor-offline-foundry`):

1. **Review & Export Source Package**: In **Build -> Source Editor & Package**, inspect all authored `.lex.tex`, `prismpm.toml`, `lexlean.toml`, `routes.toml`, `frontier.toml`, lockfiles (`prismpm.lock`, `lexlean.lock`, `standards.lock`, `Cargo.lock`), facets, views, and acceptance vectors.
2. **Explicit Classification & Filename Safety**: Confirm operator review of files, classification (`UNVERIFIED_AUTHORED_SOURCE_PACKAGE`, `isHoloArchive: false`), and destination (`MAC_STUDIO_UOR_OFFLINE_FOUNDRY` or `AIR_GAPPED_PHYSICAL_MEDIA`). The exported bundle is saved strictly as `<slug>-source-package.uor-src.json` (never `.holo`).
3. **Boundary Scrubbing & Integrity Hashing**: Every exported file is path-validated (no traversal, no `/Users/` paths, no Bearer/API secrets, no `.holo`/`.wasm` binaries) and sealed with per-file SHA-256 `inputHashes` plus top-level `packageDigestSha256`.
4. **Local Mac Studio Verification**: On Mac Studio, verify `packageDigestSha256` and per-file SHA-256 digests, unpack into an isolated project workspace, verify lockfile closure, and run the ordered 8-step qualification procedure in Section 4.

### Capabilities Requiring Real Mac Studio Qualification

| Capability | Google AI Studio (Browser) | Mac Studio (`uor-offline-foundry`) |
| --- | --- | --- |
| `.lex.tex`, `.toml`, lockfile, facet & view authoring | **Supported** (preliminary browser checks only) | Authoritative source storage & Git pinning |
| `lexlean fmt --check`, `lexlean check`, `lexlean build` | **Simulated only** (never substitutes for Lean) | **Required local qualification** (`LexLean 0.4.0`) |
| `lexlean verify --all` + `#print axioms` audit | **Unavailable (`NOT VERIFIED`)** | **Required local qualification** (`Lean 4.32.1` + `leanchecker`) |
| `prismpm check`, `prismpm build --locked`, `.holo` v4 emit | **Simulated only** | **Required local qualification** (`PrismPM v0.5.0`) |
| `prismpm verify` (`just vv` 15-gate suite) | **Unavailable (`NOT VERIFIED`)** | **Required local qualification** |
| `uorust project` + `cargo build --locked --offline` | **Disabled in browser** (route preview only) | **Required local qualification** (`afflom/UORust` + vendored crates) |
| `hologram inspect / verify / holo plan / run` | Structural header preflight only (`ArrayBuffer`) | **Required local qualification** (`Hologram Live v1.0.0`) |
| Independent Forge Kernel & Browser PP2011 suites | **Unavailable (`NOT VERIFIED`)** | **Required local qualification** & human sign-off |

