/**
 * Windmill Backend Runnable 6: Fixed-Registry Prism / Hologram Stage Dispatch
 *
 * Self-contained fail-closed runnable importing the auto-generated canonical command registry
 * (`./generated_command_registry.ts`, synced directly from `src/shared/adapters/windmillCommandRegistry.ts`).
 * Enforces allowlisted workspace (`uor-offline-foundry`), operator approval, idempotency,
 * fixed commandIds, upstream-verified CLI flags, and confined relative paths.
 */
import {
  ALLOWED_WINDMILL_WORKSPACE,
  validateRegistryDispatch,
} from './generated_command_registry.ts';

export interface PrismStageDispatchInput {
  workspace?: string;
  projectId?: string;
  stageId?: string;
  commandId?: string;
  rawCommandString?: string;
  projectRelativePath: string;
  sourceRevision: string;
  operatorApproved: boolean;
  idempotencyKey: string;
}

export interface PrismStageDispatchOutput {
  dispatched: false;
  status: 'FAIL_CLOSED_NOT_DISPATCHED' | 'REJECTED_INVALID_COMMAND';
  jobId: string | null;
  exitCode: number | null;
  logs: string[];
  artifactPaths: string[];
  sha256Digests: Record<string, string>;
  reason: string;
}

export async function main(input: PrismStageDispatchInput): Promise<PrismStageDispatchOutput> {
  const workspace = (input.workspace ?? ALLOWED_WINDMILL_WORKSPACE).trim();
  if (workspace !== ALLOWED_WINDMILL_WORKSPACE) {
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      jobId: null,
      exitCode: 1,
      logs: [`[FAIL-CLOSED] Unauthorized Windmill workspace "${workspace}".`],
      artifactPaths: [],
      sha256Digests: {},
      reason: `Unauthorized workspace "${workspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is allowed.`,
    };
  }

  if (!input.operatorApproved) {
    return {
      dispatched: false,
      status: 'FAIL_CLOSED_NOT_DISPATCHED',
      jobId: null,
      exitCode: null,
      logs: ['[FAIL-CLOSED] Explicit human operator approval required before dispatching CLI stage.'],
      artifactPaths: [],
      sha256Digests: {},
      reason: 'Execution denied: operatorApproved must be true.',
    };
  }

  if (!input.idempotencyKey?.trim()) {
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      jobId: null,
      exitCode: 1,
      logs: ['[FAIL-CLOSED] Missing idempotencyKey.'],
      artifactPaths: [],
      sha256Digests: {},
      reason: 'Execution denied: non-empty idempotencyKey is required.',
    };
  }

  const check = validateRegistryDispatch({
    workspace,
    commandId: input.commandId,
    rawCommandString: input.rawCommandString,
    projectRelativePath: input.projectRelativePath,
    sourceRevision: input.sourceRevision,
  });

  if (!check.allowed || !check.spec || !check.validatedArgv) {
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      jobId: null,
      exitCode: 1,
      logs: [`[REGISTRY REJECTION] ${check.reason}`],
      artifactPaths: [],
      sha256Digests: {},
      reason: check.reason,
    };
  }

  return {
    dispatched: false,
    status: 'FAIL_CLOSED_NOT_DISPATCHED',
    jobId: null,
    exitCode: null,
    logs: [
      `[VALIDATED FIXED REGISTRY] commandId=${check.spec.commandId} (${check.validatedArgv.join(' ')})`,
      `[STAGE] ${check.spec.stageContractName} · flow=${check.spec.windmillFlowPath}`,
      '[FAIL-CLOSED] Mac Studio worker runtime and generated wmill.ts bindings are not yet bound in this environment.',
    ],
    artifactPaths: [],
    sha256Digests: {},
    reason: `Fixed command "${check.spec.commandId}" validated, but live Mac Studio worker & generated wmill.ts bindings are not enabled.`,
  };
}
