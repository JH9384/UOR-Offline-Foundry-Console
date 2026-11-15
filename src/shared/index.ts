/**
 * Shared UOR Offline Foundry Studio library entrypoint.
 * Consumed independently by both the primary Vite web application (`/src/main.tsx`)
 * and the Windmill full-code packaging entrypoint (`/uor_foundry.raw_app/App.tsx`).
 */
export { default as ConsoleApp, default } from './App';
export * from './types/foundry';
export { foundryService, PROJECT_TEMPLATES, computeDeterministicPureStateHash } from './services/foundryService';
export { verificationAuthorityService } from './services/verificationAuthorityService';
export { sourceComplianceService } from './services/sourceComplianceService';
export { foundrySyncService, sanitizeExportBundle, AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA } from './services/syncService';
export { durableLocalStore, DURABLE_EXPORT_ALLOWLIST_SCHEMA } from './services/durableLocalStore';
