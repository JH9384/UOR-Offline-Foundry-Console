// [AUTO-SYNCED-REGISTRY-START]
export const ALLOWED_WINDMILL_WORKSPACE = "uor-offline-foundry" as const;

export const CANONICAL_COMMAND_IDS = [
  "prism_intake_validate",
  "prism_specify_validate",
  "uorust_project",
  "prism_lock_check",
  "lexlean_check",
  "prismpm_check",
  "lexlean_build",
  "prismpm_build_locked",
  "lexlean_verify",
  "prismpm_verify",
  "hologram_inspect",
  "hologram_verify",
  "hologram_plan",
  "hologram_run",
  "prism_review_qualify",
  "prismpm_export_browser"
] as const;
// [AUTO-SYNCED-REGISTRY-END]

export const ALLOWED_COMMAND_IDS = new Set<string>(CANONICAL_COMMAND_IDS);

/**
 * Windmill Backend Runnable 1: Runtime Health & Workspace Readiness
 *
 * Self-contained deployable Windmill runnable with zero relative file imports.
 * Evaluates declared workspace boundaries and read-only scaffold inventory
 * without trusting user-supplied authentication/registration claims, invoking
 * shell commands, leaking secrets, or enabling compiler/workflow execution.
 */
export interface RuntimeHealthOptions {
  /**
   * Untrusted caller fields retained only for backwards-compatible signature probing.
   * Never treated as proof of real authentication or runnable/flow registration.
   */
  authenticatedSession?: boolean;
  registeredFlows?: string[];
  registeredRunnables?: string[];
}

export type RuntimeVerificationStatus = 'VERIFIED' | 'UNVERIFIED';

export interface RuntimeHealthChecks {
  workspaceAllowed: boolean;
  workerEnvironment: RuntimeVerificationStatus;
  sessionAuthentication: RuntimeVerificationStatus;
  runnableRegistration: RuntimeVerificationStatus;
  flowRegistration: RuntimeVerificationStatus;
}

export interface RuntimeHealthResult {
  workspace: string;
  packagingStatus: 'PREPARED_NOT_VERIFIED' | 'REGISTERED_READ_ONLY_VERIFIED';
  liveExecutionEnabled: false;
  compilerDispatchEnabled: false;
  workflowExecutionEnabled: false;
  lmStudioResourceBound: false;
  releaseAuthorityDelegated: false;
  triggersEnabled: false;
  readOnlyHealthVerified: boolean;
  untrustedInputIgnored: boolean;
  canonicalRegistryCommandCount: number;
  preparedRunnables: string[];
  registeredRunnables: string[];
  registeredFlows: string[];
  checks: RuntimeHealthChecks;
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
  options: RuntimeHealthOptions = {}
): Promise<RuntimeHealthResult> {
  const normalizedWorkspace = (workspace ?? ALLOWED_WINDMILL_WORKSPACE).trim();
  if (normalizedWorkspace !== ALLOWED_WINDMILL_WORKSPACE) {
    throw new Error(
      `Unauthorized workspace target "${normalizedWorkspace}". Expected "${ALLOWED_WINDMILL_WORKSPACE}".`
    );
  }

  const workerEnv =
    typeof process !== 'undefined' && process?.env ? process.env : undefined;
  const workerWorkspace = workerEnv?.WM_WORKSPACE?.trim();
  if (workerWorkspace && workerWorkspace !== ALLOWED_WINDMILL_WORKSPACE) {
    throw new Error(
      `Unauthorized Windmill worker workspace "${workerWorkspace}". Expected "${ALLOWED_WINDMILL_WORKSPACE}".`
    );
  }

  // Never trust caller-supplied authenticatedSession, registeredRunnables, or registeredFlows
  const untrustedInputIgnored = Boolean(
    options &&
      typeof options === 'object' &&
      (('authenticatedSession' in options && options.authenticatedSession !== undefined) ||
        ('registeredRunnables' in options && options.registeredRunnables !== undefined) ||
        ('registeredFlows' in options && options.registeredFlows !== undefined))
  );

  const workerEnvironmentVerified =
    workerWorkspace === ALLOWED_WINDMILL_WORKSPACE &&
    Boolean(workerEnv?.WM_JOB_ID?.trim());

  const checks: RuntimeHealthChecks = {
    workspaceAllowed: true,
    workerEnvironment: workerEnvironmentVerified ? 'VERIFIED' : 'UNVERIFIED',
    sessionAuthentication: 'UNVERIFIED',
    runnableRegistration: 'UNVERIFIED',
    flowRegistration: 'UNVERIFIED',
  };

  // Unknown checks remain strictly unverified.
  const readOnlyHealthVerified =
    checks.workerEnvironment === 'VERIFIED' &&
    checks.sessionAuthentication === 'VERIFIED' &&
    checks.runnableRegistration === 'VERIFIED';

  return {
    workspace: normalizedWorkspace,
    packagingStatus: readOnlyHealthVerified
      ? 'REGISTERED_READ_ONLY_VERIFIED'
      : 'PREPARED_NOT_VERIFIED',
    liveExecutionEnabled: false,
    compilerDispatchEnabled: false,
    workflowExecutionEnabled: false,
    lmStudioResourceBound: false,
    releaseAuthorityDelegated: false,
    triggersEnabled: false,
    readOnlyHealthVerified,
    untrustedInputIgnored,
    canonicalRegistryCommandCount: ALLOWED_COMMAND_IDS.size,
    preparedRunnables: [...CANONICAL_RAW_APP_RUNNABLES],
    registeredRunnables: [],
    registeredFlows: [],
    checks,
    checkedAt: new Date().toISOString(),
    message: workerEnvironmentVerified
      ? `Read-only runtime_health executed in Windmill worker for workspace "${normalizedWorkspace}" (${ALLOWED_COMMAND_IDS.size} fixed commands). Session authentication, runnable registration, and flow registration remain UNVERIFIED; compiler dispatch, workflow execution, triggers, LM Studio, and release authority are disabled.`
      : `Windmill runnable scaffold ready for workspace "${normalizedWorkspace}" (${ALLOWED_COMMAND_IDS.size} fixed commands). Authentication and workspace runnable/flow registrations are UNVERIFIED; compiler dispatch, workflow execution, triggers, LM Studio, and release authority are disabled.`,
  };
}
