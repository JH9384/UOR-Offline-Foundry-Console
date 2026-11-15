# UOR Offline Foundry — Windmill Full-Code App Package (`uor_foundry.raw_app`)

**Packaging Status:** `PREPARED — LOCAL VALIDATION REQUIRED` (`wmill` CLI / live `uor-offline-foundry` server not connected inside AI Studio).

## Reference Documentation
- https://www.windmill.dev/docs/full_code_apps
- https://www.windmill.dev/docs/full_code_apps/frontend
- https://www.windmill.dev/docs/full_code_apps/deployment

## Self-Contained Packaging Architecture
To avoid unsupported `../src/` parent-directory imports in `wmill app dev` builds without duplicating source-of-truth business logic:
- From repository root, run `npm run windmill:prepare` to stage `src/` (excluding test suites) into `./src/` and `src/index.css` into `./index.css`.
- Run `npm run windmill:validate` to verify zero `../` imports, confirm `raw_app.yaml` enforces `public: false` & `guests: false`, confirm dependency closure, ensure `./wmill.ts` has not been counterfeited, and pass standalone `tsc --noEmit -p uor_foundry.raw_app/tsconfig.json`.

## Directory Contents
- `raw_app.yaml` — Private app configuration (`public: false`, `guests: false`, `custom_path: uor-foundry-console`).
- `package.json` & `tsconfig.json` — Standalone React/Tailwind/Vite/TypeScript configuration aligned with the root lockfile.
- `index.tsx` & `App.tsx` — Frontend entrypoint consuming staged `./src/App.tsx` and `./index.css`.
- `wmill.contract.ts` — Typed interface mirroring Windmill's generated `wmill.ts` methods (`backend`, `backendAsync`, `getJob`, `waitJob`, `streamJob`). **Do not manually replace `wmill.ts`.**
- `backend/*.ts` — Five fail-closed Windmill runnable scaffolds (`runtime_health`, `local_ai_advisory`, `intake_validate`, `workflow_dispatch`, `job_status`).

## Local Mac Studio Packaging & Deployment Steps (Manual Operator Execution)

1. Stage self-contained sources and verify package integrity from repository root:
   ```bash
   npm run windmill:validate
   ```
2. Verify `wmill` CLI points to your self-hosted workspace (do **not** commit workspace secrets):
   ```bash
   wmill workspace add uor-offline-foundry uor-offline-foundry http://127.0.0.1:8080
   ```
3. Install dependencies inside `uor_foundry.raw_app/` and launch Windmill's full-code dev server to generate the real `./wmill.ts`:
   ```bash
   cd uor_foundry.raw_app
   npm install
   wmill app dev
   ```
4. Verify generated `wmill.ts` bindings against the runnables in `backend/`, configure Windmill resources for approved flows/LM Studio advisory bridges without embedding credentials in frontend code, and push when ready:
   ```bash
   wmill sync push
   ```
5. **Authority Boundary**: Windmill orchestration never overrides independent UOR verification (`LexLean`, `PrismPM`, `Forge Kernel`, `Hologram Forge Application Core`, `Browser & Identity Acceptance Suites`) or human `APPROVED_FOR_RELEASE` governance.
