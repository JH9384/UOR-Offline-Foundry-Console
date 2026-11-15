/**
 * Windmill Backend Runnable 4: Authorized Workflow Dispatch
 *
 * Self-contained fail-closed runnable (zero external staged imports required prior
 * to `npm run windmill:prepare`). Refuses dispatch unless explicit operator approval,
 * unique idempotencyKey, fixed command registry conformance, and a verified
 * registered flow path in `uor-offline-foundry` are present.
 */
export interface FixedCommandDispatchRequest {
  commandId?: string;
  rawCommandString?: string;
  projectRelativePath: string;
  sourceRevision: string;
}

export interface WorkflowDispatchInput {
  projectId: string;
  flowPath: string;
  sourceRevision: string;
  idempotencyKey: string;
  operatorApproved: boolean;
  fixedCommand?: FixedCommandDispatchRequest;
}

export interface WorkflowDispatchOutput {
  dispatched: false;
  status: 'FAIL_CLOSED_NOT_DISPATCHED' | 'REJECTED_INVALID_COMMAND';
  reason: string;
}

const ALLOWED_COMMAND_IDS = new Set([
  'prism_intake_validate',
  'prism_specify_validate',
  'prism_lock_check',
  'lexlean_check',
  'prismpm_check',
  'lexlean_build',
  'prismpm_build_locked',
  'lexlean_verify',
  'prismpm_verify',
  'hologram_inspect',
  'hologram_verify',
  'hologram_plan',
  'hologram_run',
  'prismpm_export_browser',
  'uorust_project',
]);

const SHELL_METACHAR_REGEX = /[;&|`$<>()\n\r\\*?~]/;
const SAFE_RELATIVE_PATH_REGEX = /^[a-zA-Z0-9._/-]+$/;
const SAFE_REVISION_REGEX = /^[a-zA-Z0-9._/@:-]{4,128}$/;

function validateDispatchCommand(cmd: FixedCommandDispatchRequest): { allowed: boolean; reason: string } {
  if (cmd.rawCommandString !== undefined) {
    return {
      allowed: false,
      reason: 'Refused arbitrary raw shell/chat command string. Only fixed commandId identifiers are allowed.',
    };
  }
  if (!cmd.commandId || !ALLOWED_COMMAND_IDS.has(cmd.commandId)) {
    return {
      allowed: false,
      reason: `Refused unknown commandId "${cmd.commandId ?? 'MISSING'}": not in fixed Windmill command registry.`,
    };
  }
  const rel = cmd.projectRelativePath.trim();
  if (
    !rel ||
    rel.startsWith('/') ||
    rel.includes('..') ||
    SHELL_METACHAR_REGEX.test(rel) ||
    !SAFE_RELATIVE_PATH_REGEX.test(rel)
  ) {
    return {
      allowed: false,
      reason: `Refused unsafe or non-confined projectRelativePath "${cmd.projectRelativePath}".`,
    };
  }
  const rev = cmd.sourceRevision.trim();
  if (!SAFE_REVISION_REGEX.test(rev) || SHELL_METACHAR_REGEX.test(rev)) {
    return {
      allowed: false,
      reason: `Refused malformed sourceRevision "${cmd.sourceRevision}".`,
    };
  }
  return { allowed: true, reason: `Validated fixed commandId "${cmd.commandId}".` };
}

export async function main(input: WorkflowDispatchInput): Promise<WorkflowDispatchOutput> {
  if (!input.operatorApproved) {
    return {
      dispatched: false,
      status: 'FAIL_CLOSED_NOT_DISPATCHED',
      reason: 'Execution denied: explicit human operator approval is required.',
    };
  }

  if (!input.idempotencyKey?.trim() || !input.flowPath?.trim() || !input.sourceRevision?.trim()) {
    return {
      dispatched: false,
      status: 'FAIL_CLOSED_NOT_DISPATCHED',
      reason: 'Execution denied: flowPath, sourceRevision, and idempotencyKey are required.',
    };
  }

  if (input.fixedCommand) {
    const check = validateDispatchCommand(input.fixedCommand);
    if (!check.allowed) {
      return {
        dispatched: false,
        status: 'REJECTED_INVALID_COMMAND',
        reason: `Fixed command registry refusal: ${check.reason}`,
      };
    }
  }

  return {
    dispatched: false,
    status: 'FAIL_CLOSED_NOT_DISPATCHED',
    reason: `Flow "${input.flowPath}" is not verified as registered in workspace "uor-offline-foundry" and live Windmill SDK dispatch is not enabled in this scaffold.`,
  };
}
