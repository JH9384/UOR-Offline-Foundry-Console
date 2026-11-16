# UOR Offline Foundry Console

**Repository:** `https://github.com/JH9384/UOR-Offline-Foundry-Console`  
**Target Windmill Workspace:** `uor-offline-foundry` (`http://127.0.0.1:8080`)  
**Workspace Modes:** `Chat | Preview | Build | Verify & Release`

An offline-first, AI Studio-style engineering workspace built over five explicitly separated layers, preserving all UOR verification policies, provenance bindings, Windmill execution adapters, and fail-closed human release governance.

---

## 1. Local Development & Quality Commands

```bash
npm install
npm run dev               # Start local Vite dev server (port 3000)
npm run windmill:prepare  # Sync shared library (src/shared/) into uor_foundry.raw_app/shared/
npm run typecheck         # Run TypeScript check across root workspace (independent of generated raw_app)
npm run windmill:validate # Validate Windmill raw_app dependency closure & standalone tsconfig
WINDMILL_TOKEN="<token>" npm run windmill:test # Run local read-only Windmill acceptance suite against http://127.0.0.1:8080 (uor-offline-foundry)
npm run test:security     # Run Vitest + tsx security predicates & release gate regression suite
npm run test:unit         # Run Vitest + React Testing Library project state transition & UI tests
npm run test              # Run security, unit, and offline reliability test suites
npm run build             # Build production Vite bundle (dist/)
npm run test:e2e          # Run headless Playwright Studio browser E2E suite
npm run check             # Execute typecheck + test + build
```

GitHub Actions CI (`.github/workflows/ci.yml`) runs root `typecheck` independently first (proving zero dependency on staged Windmill files), then executes `windmill:prepare`, `windmill:validate`, `test:security`, `test:unit`, `test`, `build`, installs Playwright Chromium + OS deps, and executes `test:e2e`. (`npm run windmill:test` connects to a local Windmill instance at `http://127.0.0.1:8080` and is invoked explicitly on the local host, not in cloud CI.)

---

## 1b. UOR Source Review & Compliance Register

The `Source Review & Compliance` panel (accessible in `Verify & Release` and the Advanced Console) tracks all **8 authoritative upstream repositories** at their exact pinned commits with explicit epistemic states (`proved | built | tested | observed | untested | blocked | refuted`), license notices, and project-specific applicability gates:

| Source | Inspected Commit SHA | License | Integration Status | Key Constraints Preserved |
| --- | --- | --- | --- | --- |
| `UOR-Foundation/PrismPM` | `6c876017bffa0e770cffc2225cb2d2422c35a69a` | `MIT OR Apache-2.0` | `CANDIDATE` | `HOLO\x04\0` v4 & `UORC\x02\x01` v5 binaries; `PP3001` rejects JSON-as-`.holo`; `PP2011` Browser closed upstream |
| `UOR-Foundation/LexLean` | `71defb4c663aaec5b9a3aab04cbc6a03e7106227` | `MIT OR Apache-2.0` | `CANDIDATE` | `leanprover/lean4:v4.32.1`, closed `.lex.tex`; `fmt/check/build` never prove `verify` |
| `UOR-Foundation/foundry` | `760eaac29687628c7c66e8d492e126afa194656e` | `MIT OR Apache-2.0` | `REFERENCE ONLY` | Enforces `INV-001`..`INV-004` proof invalidation on source edit and strict release refusal |
| `Hologram-Technologies/hologram-live` | `cbbf97b5b8199f5701c621cd3ba0b26187417ffa` | `MIT OR Apache-2.0` | `CANDIDATE` | Import-free `hologram:guest/core-wasm@1` (`holo_run: (i32, i32) -> i64`); runtime unavailable in browser preview |
| `afflom/prism-devrel` | `8af99e96f6bd9f5865721171e582d8df6ad53166` | `MIT OR Apache-2.0` | `CANDIDATE` | Guided Product 7-facet drafts (`uor/template-contract/1`) require explicit human review before PrismPM compilation |
| `afflom/UORust` | `5868afe38012d647be00ad948949b1e384b87211` | `MIT OR Apache-2.0` | `CANDIDATE` | Cargo projection (`model/routes.toml`), typed `UorustError` span refusals; Cargo build never equals Prism verification |
| `afflom/rule30` | `e3be477fded263029479127363f7fb6a3597e7d4` | `MIT` | `REFERENCE ONLY` | Prize Problem 1 (`problem1`) & `aperiodic-compensation` remain open (`untested` / `blocked`); `{propext, Quot.sound}` only |
| `afflom/stitch` | `1607d53dfc5a34324f8102123d166d727cc66634` | `MIT` (package.json/README; root LICENSE missing) | `REFERENCE ONLY` | Untruncated SHA-256 commitments & pure-state hashes adopted; `C1..C6` blockers preserved; P2P/relay excluded |

---

## 2. Five-Layer Architecture

1. **Studio Presentation** (`src/shared/components/`, `src/shared/components/studio/`, `src/shared/components/views/`): Conversational workspace, element-referenced live sandbox preview, simulated build stage inspector, independent verify/release panels, and Advanced Console views.
2. **Project, Conversation & Durable Local Services** (`src/shared/services/foundryService.ts`, `src/shared/services/durableLocalStore.ts`, `src/shared/services/syncService.ts`): Project creation/templates, conversation threads, approval-gated diffs, undo/redo + named checkpoints, IndexedDB (`uor_foundry_durable_v1`) + `localStorage` (`uor_foundry_console_state_v2`) caching, and allowlisted exports.
3. **AI & Preview Adapters** (`src/shared/adapters/chatProviderAdapter.ts`, `src/shared/adapters/artifactPreviewAdapter.ts`): Abortable chunked streaming (`MockPreviewChatProvider` in `DEMO`; `WindmillLmStudioChatProvider` fail-closed contract for `LOCAL`), plus sandboxed previews (`DEMO | DRAFT | BUILT | VERIFIED | UNAVAILABLE`).
4. **Windmill Execution Services & Packaging** (`src/shared/adapters/windmillAdapter.ts`, `src/shared/adapters/windmillExecutionService.ts`, `uor_foundry.raw_app/`): Targets workspace `uor-offline-foundry` without hardcoded tokens or direct browser Windmill calls.
5. **Independent Verification & Release Authority** (`src/shared/services/verificationAuthorityService.ts`): Versioned policy enforcement (`VERIFICATION_POLICIES`), evidence authenticity checks, digest/revision binding, and strict human `APPROVED_FOR_RELEASE` (`PRODUCTION_RELEASE`) governance.

---

## 3. Offline Persistence, Backups & Air-Gapped Exports

- **Local Workspace State vs Asset Caching**:
  - Workspace state (projects, conversations, previews, checkpoints, durable operations, offline queue, active selection) persists locally in IndexedDB (`uor_foundry_durable_v1`) with `localStorage` (`uor_foundry_console_state_v2`) fallback.
  - Legacy v1/unversioned `localStorage` snapshots migrate automatically to schema v2; malformed or partial JSON snapshots recover safely while retaining valid records.
  - `QuotaExceededError` conditions are detected and surfaced in both Chat autosave status and the Runtime boundary panel without crashing.
  - Note: Static application bundles (`index.html`, JS/CSS assets) are cached only by normal HTTP/Vite build delivery; no experimental Service Worker cache is installed in `DEMO`.
- **Manual Local Backup vs Air-Gapped Transfer Export vs Recovery**:
  - **Local Workspace Backup (`uor.foundry.workspace-backup.v1`)**: Full manual browser recovery JSON (projects, conversations, previews, checkpoints). Kept strictly separate from air-gapped exports.
  - **Sanitized Air-Gapped Export (`uor.foundry.air-gapped-bundle.v2`)**: Deny-by-default allowlisted plaintext metadata only. Automatically strips API credentials, chat bodies, drafts, checkpoints, raw artifacts, local paths, and unknown properties, and normalizes hostile control characters/prototype keys. Explicitly rejected by the local backup restore loader (`UNENCRYPTED_UNSIGNED_METADATA_ONLY`; imports remain disabled).
  - **Queued Local Intents**: Tagged with `idempotencyKey` and `retryRequiresConfirmation: true`. Automatic replay on reconnect is disabled; operators must confirm manual retry checks.

---

## 4. Security & Verification Policies

- **Fail-Closed Verification**: Simulated `PASS` suites, untrusted issuers, duplicate authorities, stale suite versions, missing mandatory policy suites, and SHA-256 digest or source revision mismatches force `NOT VERIFIED` and block release.
- **Unambiguous Release Authorization**: `APPROVED_FOR_TEST_SIMULATION`, `PENDING`, `DEFERRED`, `BLOCKED`, `REJECTED`, and `APPROVED_FOR_QUALIFICATION` never satisfy production release. Production release requires an explicit `APPROVED_FOR_RELEASE` record with `PRODUCTION_RELEASE` scope bound to exact project ID, artifact SHA-256 digest, source revision, policy version, mandatory evidence IDs, timestamp, and authenticated human approver identity.
- **Browser Offline vs Runtime Status**: `navigator.onLine` indicates only browser network status and never equates to Windmill (`http://127.0.0.1:8080`) or LM Studio availability.

---

## 5. Windmill Packaging & Integration Boundaries

- **Option A (Vite/React + Authenticated Local Adapter)**: Uses `VITE_AUTHENTICATED_LOCAL_PROXY`; locked until endpoint and auth validation succeed.
- **Option B (Windmill Full-Code App — `uor_foundry.raw_app/`)**: Private (`public: false`, `guests: false`), self-contained via `npm run windmill:prepare` (syncing `src/shared/` into `uor_foundry.raw_app/shared/`, independent of Vite's `src/main.tsx`) and `wmill.contract.ts`. Packaging status inside AI Studio is **`PREPARED — LOCAL VALIDATION REQUIRED`** until `wmill app dev` generates `./wmill.ts` inside your Mac Studio `uor-offline-foundry` workspace.
- **LM Studio Advisory Boundary**: Routed exclusively through Windmill runnable `backend/local_ai_advisory.ts`; direct browser inference and privileged repository/shell actions remain disabled.

---

## 6. Known Limitations in Browser Preview

- **Direct Download & `.holo` Binary Safety**: Direct `.holo` binary, source archive, `Core-Wasm`, `HOLOVIEW`, and evidence bundle downloads remain strictly disabled unless `fileExistsOnDisk && sha256Verified && artifactState === 'VERIFIED'`. The built-in archive preflight inspector checks `HOLO\x04\0` (v4) and `UORC\x02\x01` (v5) headers (`STRUCTURAL PREFLIGHT PASS` only — never independent verification) and rejects unsupported HOLO versions and legacy JSON disguised as `.holo` (`PP3001`).
- Full-detail engineering and Mac Studio setup documentation lives in [`docs/INTEGRATION_BOUNDARIES.md`](docs/INTEGRATION_BOUNDARIES.md) and [`docs/MAC_STUDIO_QUALIFICATION.md`](docs/MAC_STUDIO_QUALIFICATION.md).
