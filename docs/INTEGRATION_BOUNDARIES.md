# UOR Offline Foundry Console — Integration Boundaries & Architecture

## 1. Five-Layer Architecture

1. **Studio Presentation (`src/shared/components/*`, `src/shared/components/studio/*`, `src/shared/components/views/*`)**
   - Renders `Chat`, `Preview`, `Build`, `Verify & Release`, and `Advanced Workspace` views.
   - Displays explicit mode and boundary tags (`DEMO`, `LOCAL`, `ONLINE`, `NOT CONNECTED`, `NOT VERIFIED`, `RELEASE BLOCKED`).
   - Provides non-destructive change management: before/after proposal diffs, explicit `Approve & Apply Draft` / `Reject` actions, per-project Undo/Redo, named checkpoints, and safe preview reset. None of these alter verification suites or release eligibility.

2. **Project, Conversation & Durable Local Services (`src/shared/services/foundryService.ts`, `src/shared/services/durableLocalStore.ts`, `src/shared/services/syncService.ts`)**
   - Manages projects (including UOR synthetic templates, duplicate, rename, archive/restore), conversation threads, and revisioned `DurableOperation` records.
   - Persists browser-local workspace caches in IndexedDB (`uor_foundry_durable_v1`) with backward-compatible `localStorage` fallback (`uor_foundry_console_state_v2`), automatic v1 -> v2 schema migration, partial corruption recovery, and `QuotaExceededError` diagnostics.
   - Browser storage is strictly a local workspace cache—never an authoritative project database or proof store.
   - **Local Workspace Backup (`uor.foundry.workspace-backup.v1`)** restores browser conversations and checkpoints manually, while **Air-Gapped Transfer Exports (`uor.foundry.air-gapped-bundle.v2`)** use strict deny-by-default allowlisting, require preview + confirmation, strip credentials/chat bodies/drafts/raw artifacts/local paths/unknown properties, reject imports, and carry `UNENCRYPTED_UNSIGNED_METADATA_ONLY`.

3. **AI & Preview Adapters (`src/shared/adapters/chatProviderAdapter.ts`, `src/shared/adapters/artifactPreviewAdapter.ts`)**
   - `ChatProviderAdapter`: Async + chunked streaming interface with `AbortSignal` cancellation, retry tracking, preview element references, and approval-gated proposals (`MockPreviewChatProvider` in `DEMO`; `WindmillLmStudioChatProvider` fail-closed contract in `LOCAL`).
   - `ArtifactPreviewAdapter`: Supports `ui-build`, `document`, `json-artifact`, `workflow-output`, `image-diagram`, and `validation-report`, explicitly labeling `DEMO`, `DRAFT`, `BUILT`, `VERIFIED`, and `UNAVAILABLE` states inside a sandboxed container.

4. **Windmill Execution Services & `.raw_app` Packaging (`src/shared/adapters/windmillAdapter.ts`, `src/shared/adapters/windmillExecutionService.ts`, `uor_foundry.raw_app/`)**
   - Targets workspace `uor-offline-foundry` at `http://127.0.0.1:8080` across Option A (`VITE_AUTHENTICATED_LOCAL_PROXY`) and Option B (`uor_foundry.raw_app/` Windmill full-code app).
   - Both `src/main.tsx` (Vite) and `uor_foundry.raw_app/App.tsx` (Windmill) consume the shared library in `src/shared/`. `npm run windmill:prepare` & `npm run windmill:validate` stage `src/shared/` into `uor_foundry.raw_app/shared/` cleanly with zero `../` parent-directory escapes, enforce `public: false` & `guests: false` in `raw_app.yaml`, guard against handwritten `wmill.ts`, and verify standalone `tsc --noEmit`.
   - Packaging status outside a live Windmill workspace: **`PREPARED — LOCAL VALIDATION REQUIRED`**.

5. **Independent Engineering Verification & Release Authority (`src/shared/services/verificationAuthorityService.ts`, `src/shared/services/sourceComplianceService.ts`, `VerificationView.tsx`, `ApprovalsView.tsx`, `SourceCompliancePanel.tsx`)**
   - Uses versioned policies (`VERIFICATION_POLICIES`) defining mandatory authorities and minimum suite versions per `productFamily`, defaulting to `NOT VERIFIED` when no policy is established.
   - Rejects simulated `PASS` results, duplicate authority claims, stale suite versions, mismatched SHA-256 digests/revisions, and unauthenticated browser records.
   - Requires explicit `APPROVED_FOR_RELEASE` (`PRODUCTION_RELEASE` scope) bound to exact project ID, artifact SHA-256 digest, source revision, policy version, required evidence references, timestamp, and independently authenticated human approver identity. `APPROVED_FOR_TEST_SIMULATION` never satisfies production release.
   - `SourceComplianceService` evaluates project-specific requirement applicability before compliance checking and strictly separates source documentation, tests, independent verifier evidence, and release authorization.

## 2. Mode & Connectivity Rules

- **`DEMO`**: Browser-local sandbox only. Never dispatches real Windmill jobs, live LM Studio inference, Lean 4 verification, or Cargo workspace builds.
- **`LOCAL`**: Requires validated local proxy (Option A) or generated Windmill `wmill.ts` session (Option B). Remains locked until verified.
- **`ONLINE`**: Requires explicit authorized synchronization policy & validated endpoint; disabled in preview.
- **`navigator.onLine` Isolation**: Browser online status never unlocks `LOCAL` Windmill or `ONLINE` sync, and auto-replay of queued items is permanently disabled (`idempotencyKey` + manual confirmation required).

## 3. Reviewed Upstream Sources & Hard Exclusions

- **`UOR-Foundation/PrismPM` (`b8bbabcf27392d65e58fe6e27612bdb785aa2939`, `MIT OR Apache-2.0`, `CANDIDATE`)**: Authoritative closed `.lex.tex` -> Core-Wasm -> `HOLOVIEW\0\x01` -> `.holo` v4 (`HOLO\x04\0`) / v5 (`UORC\x02\x01`) compiler & `PP3001` JSON rejection boundary.
- **`UOR-Foundation/LexLean` (`71defb4c663aaec5b9a3aab04cbc6a03e7106227`, `MIT OR Apache-2.0`, `CANDIDATE`)**: Controlled semantic language kernel (`leanprover/lean4:v4.32.1`); `fmt`, `check`, and `build` never certify `verify`.
- **`UOR-Foundation/foundry` (`760eaac29687628c7c66e8d492e126afa194656e`, `MIT OR Apache-2.0`, `REFERENCE ONLY`)**: Kernel invariants (`INV-001`..`INV-004`) invalidating stale evidence on source edits and separating execution from qualification/release.
- **`Hologram-Technologies/hologram-live` (`cbbf97b5b8199f5865721171e582d8df6ad53166`, `Apache-2.0`, `CANDIDATE`)**: Import-free Core-Wasm (`hologram:guest/core-wasm@1`, `holo_run: (i32, i32) -> i64`) inspect/verify/plan/run CLI contract.
- **`afflom/prism-devrel` (`8af99e96f6bd9f5865721171e582d8df6ad53166`, `MIT OR Apache-2.0`, `CANDIDATE`)**: Guides `GUIDED_PRODUCT` 7-facet drafts and `uor/template-contract/1` requiring explicit human review before PrismPM compilation.
- **`afflom/UORust` (`5868afe38012d647be00ad948949b1e384b87211`, `MIT OR Apache-2.0`, `CANDIDATE`)**: Guides `EXISTING_RUST` Cargo projection (`model/routes.toml`), typed `UorustError` span refusals, and fail-closed fixed-registry Windmill contracts; arbitrary Cargo execution in-browser is disabled and Cargo builds never equate to Prism verification.
- **`afflom/rule30` (`e3be477fded263029479127363f7fb6a3597e7d4`, `MIT`, `REFERENCE ONLY`)**: Guides the `Formal Research Project` template frontier register and `{propext, Quot.sound}` constructivity framing; Prize Problem 1 (`problem1`) and `aperiodic-compensation` remain explicitly open.
- **`afflom/stitch` (`1607d53dfc5a34324f8102123d166d727cc66634`, `MIT`, `REFERENCE ONLY`)**: Contributes full SHA-256 commitments, byte lengths, and `DETERMINISTIC_PURE_STATE_ONLY` checkpoint hashes; P2P transport, public relays, WebRTC ICE, DNS, and BGP features are explicitly excluded.

See [`MAC_STUDIO_QUALIFICATION.md`](./MAC_STUDIO_QUALIFICATION.md) for local toolchain setup, offline lock closure, and Mac Studio qualification workflows.

