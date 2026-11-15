# Mac Studio Prism-to-Hologram Qualification Guide

**Target Windmill Workspace:** `uor-offline-foundry` (`http://127.0.0.1:8080`)  
**Scope:** End-to-end local qualification on controlled Mac Studio hardware connecting `PrismPM`, `LexLean`, `Foundry`, `Hologram Live`, `Prism-DevRel`, `UORust`, `Rule30`, and `Stitch`.

---

## 1. Pinned Upstream Repository & Toolchain Matrix

| Component / Repo | Canonical URL | Exact Pinned Commit SHA | Role in Pipeline |
| --- | --- | --- | --- |
| `PrismPM` | `https://github.com/UOR-Foundation/PrismPM` | `b8bbabcf27392d65e58fe6e27612bdb785aa2939` | `.lex.tex` closed-model compiler, `just vv` 15-gate suite, Core-Wasm, `HOLOVIEW`, `.holo` v4 (`HOLO\x04\0`) & v5 (`UORC\x02\x01`) |
| `LexLean` | `https://github.com/UOR-Foundation/LexLean` | `71defb4c663aaec5b9a3aab04cbc6a03e7106227` | Closed semantic language parser (`lexlean fmt --check`, `lexlean verify`), Lean `4.32.1` attestation records |
| `Foundry` | `https://github.com/UOR-Foundation/foundry` | `760eaac29687628c7c66e8d492e126afa194656e` | Forge Kernel / App Core boundaries (`INV-001`..`INV-004`), source-change proof invalidation, strict evidence gates |
| `Hologram Live` | `https://github.com/Hologram-Technologies/hologram-live` | `cbbf97b5b8199f5865721171e582d8df6ad53166` | `hologram inspect/verify/plan/run --json`, import-free `hologram:guest/core-wasm@1` (`holo_run: (i32, i32) -> i64`) |
| `Prism-DevRel` | `https://github.com/afflom/prism-devrel` | `8af99e96f6bd9f5865721171e582d8df6ad53166` | Guided Product 7-facet coverage model, `uor/template-contract/1`, Diataxis docs |
| `UORust` | `https://github.com/afflom/UORust` | `5868afe38012d647be00ad948949b1e384b87211` | Cargo workspace -> `model/routes.toml` projection with typed non-defaulting `UorustError` span refusals |
| `Rule30` | `https://github.com/afflom/rule30` | `e3be477fded263029479127363f7fb6a3597e7d4` | Claim frontier register, constructive axioms `{propext, Quot.sound}` audit |
| `Stitch` | `https://github.com/afflom/stitch` | `1607d53dfc5a34324f8102123d166d727cc66634` | Full 64-hex SHA-256 commitment & pure-state checkpoint rules |

Required local toolchain pins on Mac Studio:
- Lean toolchain: `leanprover/lean4:v4.32.1`
- LexLean binary: `lexlean 0.4.0` (`ghcr.io/uor-foundation/lexlean:0.4.0`)
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

1. Start local Windmill (`http://127.0.0.1:8080`) on Mac Studio and select workspace `uor-offline-foundry`.
2. Sync and validate the Windmill app bundle:
   ```bash
   npm run windmill:prepare
   npm run windmill:validate
   ```
3. Run `wmill app dev` inside `uor_foundry.raw_app/` to generate native `./wmill.ts` bindings (never commit a handwritten `wmill.ts`).
4. Bind the fixed command dispatcher (`backend/prism_stage_dispatch.ts`) ONLY to the allowlisted commands defined in `src/shared/adapters/windmillCommandRegistry.ts` (`prism_intake_validate`, `prism_specify_validate`, `prism_lock_check`, `lexlean_check`, `prismpm_check`, `lexlean_build`, `prismpm_build_locked`, `lexlean_verify`, `prismpm_verify`, `hologram_inspect`, `hologram_verify`, `hologram_plan`, `hologram_run`, `prismpm_export_browser`, `uorust_project`). Arbitrary shell strings from chat or HTTP bodies are rejected fail-closed.

---

## 4. Local Qualification Scenarios

### A. Authoritative Reference: `PrismPM/examples/Calculator` (`NATIVE_PRISM`)
Execute in sequence via `backend/prism_stage_dispatch.ts`:
1. `lexlean fmt --check` (SPECIFY)
2. `prismpm lock --check` (LOCK)
3. `prismpm check` (CHECK — static check only, never equates to verify)
4. `prismpm build --locked` (BUILD — emits `model.prism.json`, Lean/LCNF, Cargo crate, `hologram:guest/core-wasm@1` Wasm, `HOLOVIEW\0\x01`, and `Calculator.holo` v4 starting with `HOLO\x04\0`)
5. `prismpm verify` + `lexlean verify` (VERIFY — runs twice consecutively per `RELEASE-STATUS.md` `just vv` acceptance rule)
6. `hologram inspect --json` (INSPECT — confirms real `HOLO\x04\0` or `UORC\x02\x01`, never JSON-as-`.holo` `PP3001`, verifies SHA-256 on disk)
7. `hologram run --json` (PREVIEW — executes import-free `holo_run: (i32, i32) -> i64`)

### B. Guided Product (`GUIDED_PRODUCT`)
1. Draft 7-facet specification (`arch..release`) from `afflom/prism-devrel` `uor/template-contract/1`.
2. Require explicit human sign-off on draft `.lex.tex` (`humanReviewStatus: APPROVED_FOR_TOOLCHAIN`).
3. Compile and verify through the identical `PrismPM` + `LexLean` pipeline above.

### C. Existing Rust Cargo Fixture (`EXISTING_RUST`)
1. Run `uorust_project` (`uorust project`) against `Cargo.toml`, `Cargo.lock`, `model/routes.toml`.
2. Confirm any unsupported syntax or `unsafe extern` FFI spans produce typed non-defaulting `UorustError` refusals.
3. Confirm `cargo build --locked --offline` evidence is recorded separately and **never** satisfies `PrismPM` verification or `APPROVED_FOR_RELEASE`.

### D. Negative & Invalidation Verification Checks
- **JSON masquerading as `.holo`:** Feeding `{"fake":"holo"}` into `.holo` inspector returns `PP3001` (`REJECTED_JSON_AS_HOLO_PP3001`).
- **Source edit invalidation (`INV-003`):** Editing `sourceRevision` after `PASS` forces prior suites to `NOT VERIFIED` (`STALE`) and blocks `APPROVED_FOR_RELEASE`.
- **Direct binary download gate:** UI buttons for `.holo Archive Binary`, `Generated Source Archive`, `Core-Wasm + HOLOVIEW Bundle`, and `Verified Evidence Bundle` remain disabled whenever `!fileExistsOnDisk || !sha256Verified`.
