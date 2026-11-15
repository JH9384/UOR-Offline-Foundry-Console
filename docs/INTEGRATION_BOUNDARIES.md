# UOR Offline Foundry Console — Integration Boundaries & Architecture

## 1. Five-Layer Architecture

1. **Studio Presentation (`src/components/*`, `src/components/studio/*`, `src/components/views/*`)**
   - Renders `Chat`, `Preview`, `Build`, `Verify & Release`, and `Advanced Workspace` views.
   - Displays explicit mode and boundary tags (`DEMO`, `LOCAL`, `ONLINE`, `NOT CONNECTED`, `NOT VERIFIED`, `RELEASE BLOCKED`).
   - Provides non-destructive change management: before/after proposal diffs, explicit `Approve & Apply Draft` / `Reject` actions, per-project Undo/Redo, named checkpoints, and safe preview reset. None of these alter verification suites or release eligibility.

2. **Project, Conversation & Durable Local Services (`src/services/foundryService.ts`, `src/services/durableLocalStore.ts`, `src/services/syncService.ts`)**
   - Manages projects (including UOR synthetic templates, duplicate, rename, archive/restore), conversation threads, and revisioned `DurableOperation` records.
   - Persists browser-local workspace caches in IndexedDB (`uor_foundry_durable_v1`) with backward-compatible `localStorage` fallback (`uor_foundry_console_state_v2`), automatic v1 -> v2 schema migration, partial corruption recovery, and `QuotaExceededError` diagnostics.
   - Browser storage is strictly a local workspace cache—never an authoritative project database or proof store.
   - **Local Workspace Backup (`uor.foundry.workspace-backup.v1`)** restores browser conversations and checkpoints manually, while **Air-Gapped Transfer Exports (`uor.foundry.air-gapped-bundle.v2`)** use strict deny-by-default allowlisting, require preview + confirmation, strip credentials/chat bodies/drafts/raw artifacts/local paths/unknown properties, reject imports, and carry `UNENCRYPTED_UNSIGNED_METADATA_ONLY`.

3. **AI & Preview Adapters (`src/adapters/chatProviderAdapter.ts`, `src/adapters/artifactPreviewAdapter.ts`)**
   - `ChatProviderAdapter`: Async + chunked streaming interface with `AbortSignal` cancellation, retry tracking, preview element references, and approval-gated proposals (`MockPreviewChatProvider` in `DEMO`; `WindmillLmStudioChatProvider` fail-closed contract in `LOCAL`).
   - `ArtifactPreviewAdapter`: Supports `ui-build`, `document`, `json-artifact`, `workflow-output`, `image-diagram`, and `validation-report`, explicitly labeling `DEMO`, `DRAFT`, `BUILT`, `VERIFIED`, and `UNAVAILABLE` states inside a sandboxed container.

4. **Windmill Execution Services & `.raw_app` Packaging (`src/adapters/windmillAdapter.ts`, `src/adapters/windmillExecutionService.ts`, `uor_foundry.raw_app/`)**
   - Targets workspace `uor-offline-foundry` at `http://127.0.0.1:8080` across Option A (`VITE_AUTHENTICATED_LOCAL_PROXY`) and Option B (`uor_foundry.raw_app/` Windmill full-code app).
   - `npm run windmill:prepare` & `npm run windmill:validate` stage `src/` (excluding tests) into `uor_foundry.raw_app/` cleanly with zero `../` parent-directory escapes, enforce `public: false` & `guests: false` in `raw_app.yaml`, guard against handwritten `wmill.ts`, and verify standalone `tsc --noEmit`.
   - Packaging status outside a live Windmill workspace: **`PREPARED — LOCAL VALIDATION REQUIRED`**.

5. **Independent Engineering Verification & Release Authority (`src/services/verificationAuthorityService.ts`, `VerificationView.tsx`, `ApprovalsView.tsx`)**
   - Uses versioned policies (`VERIFICATION_POLICIES`) defining mandatory authorities and minimum suite versions per `productFamily`, defaulting to `NOT VERIFIED` when no policy is established.
   - Rejects simulated `PASS` results, duplicate authority claims, stale suite versions, mismatched SHA-256 digests/revisions, and unauthenticated browser records.
   - Requires explicit `APPROVED_FOR_RELEASE` (`PRODUCTION_RELEASE` scope) bound to exact project ID, artifact SHA-256 digest, source revision, policy version, required evidence references, timestamp, and independently authenticated human approver identity. `APPROVED_FOR_TEST_SIMULATION` never satisfies production release.

## 2. Mode & Connectivity Rules

- **`DEMO`**: Browser-local sandbox only. Never dispatches real Windmill jobs or live LM Studio inference.
- **`LOCAL`**: Requires validated local proxy (Option A) or generated Windmill `wmill.ts` session (Option B). Remains locked until verified.
- **`ONLINE`**: Requires explicit authorized synchronization policy & validated endpoint; disabled in preview.
- **`navigator.onLine` Isolation**: Browser online status never unlocks `LOCAL` Windmill or `ONLINE` sync, and auto-replay of queued items is permanently disabled (`idempotencyKey` + manual confirmation required).
