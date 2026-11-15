# UOR Offline Foundry Console — Integration Boundaries & Architecture

## 1. Five-Layer Architecture

1. **Studio Presentation (`src/components/*`, `src/components/studio/*`, `src/components/views/*`)**
   - Renders the Chat, Preview, Build, Verify & Release, and Advanced Workspace views.
   - Displays explicit mode and status tags (`DEMO`, `LOCAL`, `ONLINE`, `NOT CONNECTED`, `NOT VERIFIED`, `RELEASE BLOCKED`).
2. **Project, Conversation & Durable Local Services (`src/services/foundryService.ts`, `src/services/durableLocalStore.ts`, `src/services/syncService.ts`)**
   - Manages projects, conversation sessions, approval-gated draft changes, and revisioned `DurableOperation` records.
   - Persists browser-local workspace caches in IndexedDB (`uor_foundry_durable_v1`) with backward-compatible `localStorage` fallback (`uor_foundry_console_state_v2`).
   - Browser storage is strictly a local workspace cache—never an authoritative project database or proof store.
3. **AI & Preview Adapters (`src/adapters/chatProviderAdapter.ts`, `src/adapters/artifactPreviewAdapter.ts`, `src/adapters/windmillAdapter.ts`)**
   - `ChatProviderAdapter`: Async interface with `AbortSignal` cancellation, contextual preview element references, and approval-gated proposals (`MockPreviewChatProvider` in preview; `WindmillLmStudioChatProvider` fail-closed contract for future LM Studio inference).
   - `ArtifactPreviewAdapter`: Supports `ui-build`, `document`, `json-artifact`, `workflow-output`, `image-diagram`, and `validation-report`, each carrying explicit origin and status (`DEMO`, `DRAFT`, `BUILT`, `VERIFIED`, `UNAVAILABLE`).
4. **Windmill Execution Services (`src/adapters/windmillExecutionService.ts`)**
   - Targets workspace `uor-offline-foundry` at `http://127.0.0.1:8080`.
   - Supports two deployment models grounded in `https://www.windmill.dev/docs/full_code_apps`:
     - **Option A (`VITE_AUTHENTICATED_LOCAL_PROXY`)**: Existing Vite/React app communicating with a same-origin authenticated local backend proxy (keeping Windmill tokens strictly out of browser code and storage).
     - **Option B (`WINDMILL_NATIVE_WMILL_TS`)**: Windmill-native full-code React app compiled with generated `wmill.ts` backend bindings.
   - Never assumes unregistered Windmill flows exist; separates synthetic `DEMO_WINDMILL_JOB_FIXTURES` from genuine Windmill job records.
5. **Independent Engineering Verification & Release Authority (`src/services/verificationAuthorityService.ts`, `VerificationView.tsx`, `ApprovalsView.tsx`)**
   - Preserves independent authority for `LexLean`, `PrismPM`, `Forge Kernel`, `Hologram Forge Application Core`, and `Browser & Identity Acceptance Suites`.
   - Verification `PASS` requires authoritative, non-simulated evidence bound to the target artifact SHA-256 digest.
   - Missing or simulated evidence forces `NOT VERIFIED` and keeps release authorization `BLOCKED`.

## 2. Integration & Connectivity Boundaries

- **Integration Modes**: `DEMO` (browser-local simulated), `LOCAL` (authorized connection to self-hosted Windmill), `ONLINE` (optional authorized external sync). `LOCAL` and `ONLINE` remain locked until endpoints, authentication, and permissions are validated.
- **Browser Network Decoupling**: `navigator.onLine` never implies local Windmill availability and never triggers automatic artifact publication, git pushes, or replay of queued execution/release commands (`autoReplayPermitted: false`, `autoPublishPermitted: false`).
- **AI Privilege Boundary**: AI providers have zero shell, repository write, verification certification, or release approval privileges.
