# UOR Offline Foundry — Windmill Full-Code App Package (`uor_foundry.raw_app`)

**Packaging Status:** `PREPARED / NOT VERIFIED` (Windmill CLI build has not been executed inside Google AI Studio).

## Reference Documentation
- https://www.windmill.dev/docs/full_code_apps
- https://www.windmill.dev/docs/full_code_apps/frontend
- https://www.windmill.dev/docs/full_code_apps/deployment

## Directory Contents
- `raw_app.yaml` — Private app configuration (`public: false`, `guests: false`, `custom_path: uor-foundry-console`).
- `package.json` — Pinned React/Tailwind dependencies aligned with the root Vite workspace lockfile (`package-lock.json` / `package.json` at repository root).
- `index.tsx` & `App.tsx` — Frontend entrypoint reusing `../src/App.tsx` Studio components.
- `wmill.contract.ts` — Typed interface mirroring Windmill's generated `wmill.ts` methods (`backend`, `backendAsync`, `getJob`, `waitJob`, `streamJob`). **Do not manually replace `wmill.ts`.**
- `backend/*.ts` — Five fail-closed Windmill runnable scaffolds (`runtime_health`, `local_ai_advisory`, `intake_validate`, `workflow_dispatch`, `job_status`).

## Local Mac Studio Packaging & Deployment Steps (Manual Operator Execution)

1. Verify `wmill` CLI points to your self-hosted workspace (do **not** commit workspace secrets):
   ```bash
   wmill workspace add uor-offline-foundry uor-offline-foundry http://127.0.0.1:8080
   ```
2. Install pinned dependencies inside `uor_foundry.raw_app/` using the project lockfile policy and start Windmill's full-code dev server to generate the real `./wmill.ts`:
   ```bash
   cd uor_foundry.raw_app
   npm ci || npm install
   wmill app dev
   ```
3. Verify generated `wmill.ts` bindings against the runnables in `backend/`, configure Windmill resources for any approved flows/LM Studio advisory bridge without embedding tokens in frontend source, and push when ready:
   ```bash
   wmill sync push
   ```
4. **Authority Boundary**: Windmill orchestration never overrides independent UOR verification (`LexLean`, `PrismPM`, `Forge Kernel`, `Hologram Forge Application Core`, `Browser & Identity Acceptance Suites`) or human `APPROVED_FOR_RELEASE` governance.
