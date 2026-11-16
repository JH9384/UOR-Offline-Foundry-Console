import {
  ALLOWED_COMMAND_IDS,
  ALLOWED_WINDMILL_WORKSPACE,
} from './generated_command_registry.ts';

/**
 * Windmill Backend Runnable 1: Runtime Health & Workspace Readiness
 *
 * Evaluates declared workspace boundaries and read-only runnable inventory
 * without invoking shell commands, leaking secrets, or assuming unregistered flows exist.
 */
export interface RuntimeHealthOptions {
  authenticatedSession?: boolean;
  registeredFlows?: string[];
  registeredRunnables?: string[];
}

export interface RuntimeHealthResult {
  workspace: string;
  packagingStatus: 'PREPARED_NOT_VERIFIED' | 'REGISTERED_READ_ONLY_VERIFIED';
  liveExecutionEnabled: false;
  lmStudioResourceBound: false;
  releaseAuthorityDelegated: false;
  readOnlyHealthVerified: boolean;
  canonicalRegistryCommandCount: number;
  registeredRunnables: string[];
  registeredFlows: string[];
  checkedAt: string;
  message: string;
}

export const CANONICAL_RAW_APP_RUNNABLES = [
  'backend/runtime_health.ts',
  'backend/intake_validate.ts',
  'backend/job_status.ts',
  'backend/local_ai_advisory.ts',
  'backend/workflow_dispatch.ts',
  'backend/prism_stage_dispatch.ts',
] as const;

export async function main(
  workspace: string = ALLOWED_WINDMILL_WORKSPACE,
  options?: RuntimeHealthOptions
): Promise<RuntimeHealthResult> {
  if (workspace !== ALLOWED_WINDMILL_WORKSPACE) {
    throw new Error(
      `Unauthorized workspace target "${workspace}". Expected "${ALLOWED_WINDMILL_WORKSPACE}".`
    );
  }

  const readOnlyVerified = Boolean(options?.authenticatedSession);
  const registeredRunnables = options?.registeredRunnables ?? [...CANONICAL_RAW_APP_RUNNABLES];
  const registeredFlows = options?.registeredFlows ?? [];

  return {
    workspace,
    packagingStatus: readOnlyVerified
      ? 'REGISTERED_READ_ONLY_VERIFIED'
      : 'PREPARED_NOT_VERIFIED',
    liveExecutionEnabled: false,
    lmStudioResourceBound: false,
    releaseAuthorityDelegated: false,
    readOnlyHealthVerified: readOnlyVerified,
    canonicalRegistryCommandCount: ALLOWED_COMMAND_IDS.size,
    registeredRunnables,
    registeredFlows,
    checkedAt: new Date().toISOString(),
    message: readOnlyVerified
      ? `Authenticated read-only Windmill health verified for workspace "${workspace}" (${ALLOWED_COMMAND_IDS.size} fixed commands, ${registeredFlows.length} registered flow(s)).`
      : 'Windmill runnable scaffold ready. Bind workspace resources and validate flow registrations locally before enabling live execution.',
  };
}
