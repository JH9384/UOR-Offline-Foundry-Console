# UOR Offline Foundry — Windmill Full-Code App Package (`uor_foundry.raw_app`)

**Packaging Status:** `PREPARED — LOCAL VALIDATION REQUIRED` (`wmill` CLI / live `uor-offline-foundry` server not connected inside AI Studio).

## Reference Documentation
- https://www.windmill.dev/docs/full_code_apps
- https://www.windmill.dev/docs/full_code_apps/frontend
- https://www.windmill.dev/docs/full_code_apps/deployment

## Self-Contained Packaging Architecture
Both the primary Vite web app (`src/main.tsx`) and this Windmill full-code packaging entrypoint (`uor_foundry.raw_app/App.tsx`, `index.tsx`) consume the shared UI/domain library in `src/shared/` without depending directly on each other's entrypoint paths.

To avoid unsupported `../src/` parent-directory imports in `wmill app dev` builds without duplicating source-of-truth business logic:
- From repository root, run `npm run windmill:prepare` to stage `src/shared/` cleanly into `./shared/` (never copying Vite's `src/main.tsx` or test files).
- Run `npm run windmill:validate` to verify zero `../` imports, confirm `raw_app.yaml` enforces `public: false` & `guests: false`, confirm dependency closure, ensure `./wmill.ts` has not been counterfeited, and pass standalone `tsc --noEmit -p uor_foundry.raw_app/tsconfig.json`.

## Directory Contents
- `raw_app.yaml` — Private app configuration (`public: false`, `guests: false`, `custom_path: uor-foundry-console`).
- `package.json` & `tsconfig.json` — Standalone React/Tailwind/Vite/TypeScript configuration aligned with the root lockfile.
- `index.tsx` & `App.tsx` — Frontend entrypoint consuming staged `./shared/App` and `./shared/index.css`.
- `wmill.contract.ts` — Typed interface mirroring Windmill's generated `wmill.ts` methods (`backend`, `backendAsync`, `getJob`, `waitJob`, `streamJob`). **Do not manually replace `wmill.ts`.**
- `backend/*.ts` — Six fail-closed Windmill runnable scaffolds (`runtime_health.ts`, `intake_validate.ts`, `job_status.ts`, `local_ai_advisory.ts`, `workflow_dispatch.ts`, `prism_stage_dispatch.ts`) plus auto-generated `backend/generated_command_registry.ts`.
- `flows/prism_hologram_delivery.flow.json` — Canonical 10-stage workflow manifest mapped 1-to-1 to the 16 fixed commands.

## Canonical Minimal Procedure for Connecting to an Already-Running Windmill Installation (Mac Studio)

Do not download or reinstall Windmill automatically. Verify that an existing Windmill instance is already listening on `http://127.0.0.1:8080` and that `wmill` CLI is present on `PATH` before proceeding:

1. From repository root, validate self-contained packaging and standalone TypeScript compilation (no network or live server required):
   ```bash
   npm run windmill:prepare
   npm run windmill:validate
   ```
2. Verify the existing local Windmill server responds on `http://127.0.0.1:8080` and bind `wmill` to workspace `uor-offline-foundry`:
   ```bash
   curl -fsS http://127.0.0.1:8080/api/version
   wmill workspace add uor-offline-foundry uor-offline-foundry http://127.0.0.1:8080
   wmill workspace switch uor-offline-foundry
   ```
3. Inside `uor_foundry.raw_app/`, run Windmill's full-code app dev harness to generate `./wmill.ts` from `./backend/*.ts` and verify read-only health (`runtime_health`) and job retrieval (`job_status`) while keeping compiler execution and production release disabled:
   ```bash
   cd uor_foundry.raw_app
   wmill app dev
   ```
4. **Authority Boundary**: Windmill orchestration never overrides independent UOR verification (`LexLean`, `PrismPM`, `Forge Kernel`, `Hologram Forge Application Core`, `Browser & Identity Acceptance Suites`) or human `APPROVED_FOR_RELEASE` governance.
