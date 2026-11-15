/**
 * Windmill Backend Runnable 4: Authorized Workflow Dispatch
 *
 * Fail-closed contract: refuses dispatch unless explicit operator approval,
 * unique idempotencyKey, and a verified registered flow path in `uor-offline-foundry`
 * are present. Never assumes unregistered flows exist and never authorizes release.
 */
export interface WorkflowDispatchInput {
  projectId: string;
  flowPath: string;
  sourceRevision: string;
  idempotencyKey: string;
  operatorApproved: boolean;
}

export interface WorkflowDispatchOutput {
  dispatched: false;
  status: 'FAIL_CLOSED_NOT_DISPATCHED';
  reason: string;
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

  return {
    dispatched: false,
    status: 'FAIL_CLOSED_NOT_DISPATCHED',
    reason: `Flow "${input.flowPath}" is not verified as registered in workspace "uor-offline-foundry" and live Windmill SDK dispatch is not enabled in this scaffold.`,
  };
}
