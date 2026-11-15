/**
 * Windmill Backend Runnable 4: Authorized Workflow Dispatch
 *
 * Fail-closed runnable importing canonical allowlists & CLI validation from
 * `./generated_command_registry.ts` (synced from `src/shared/adapters/windmillCommandRegistry.ts`).
 */
import {
  ALLOWED_WINDMILL_WORKSPACE,
  validateRegistryDispatch,
} from './generated_command_registry.ts';

export interface FixedCommandDispatchRequest {
  commandId?: string;
  rawCommandString?: string;
  workspace?: string;
  projectRelativePath: string;
  sourceRevision: string;
}

export interface WorkflowDispatchInput {
  projectId: string;
  workspace?: string;
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

export async function main(input: WorkflowDispatchInput): Promise<WorkflowDispatchOutput> {
  const workspace = (input.workspace ?? ALLOWED_WINDMILL_WORKSPACE).trim();
  if (workspace !== ALLOWED_WINDMILL_WORKSPACE) {
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      reason: `Execution denied: unauthorized workspace "${workspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is allowed.`,
    };
  }

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
    const check = validateRegistryDispatch({
      workspace: input.fixedCommand.workspace ?? workspace,
      commandId: input.fixedCommand.commandId,
      rawCommandString: input.fixedCommand.rawCommandString,
      projectRelativePath: input.fixedCommand.projectRelativePath,
      sourceRevision: input.fixedCommand.sourceRevision,
    });
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
    reason: `Flow "${input.flowPath}" is not verified as registered in workspace "${ALLOWED_WINDMILL_WORKSPACE}" and live Windmill SDK dispatch is not enabled in this scaffold.`,
  };
}
