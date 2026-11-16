import { ALLOWED_WINDMILL_WORKSPACE } from './generated_command_registry.ts';

/**
 * Windmill Backend Runnable 5: Read-Only Job Status & Result Retrieval
 *
 * Fail-closed contract:
 * - Returns `found: false` with `UNAVAILABLE_UNCONFIGURED` when no authenticated
 *   Windmill workspace reader is bound (never synthesizes fake job IDs or results).
 * - Rejects unauthorized workspaces, duplicate responses, and stale out-of-order responses.
 */
export interface ReadOnlyWindmillJobSnapshot {
  jobId: string;
  workspace: string;
  flowPath: string;
  stageId?: string;
  commandId?: string;
  state: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  sequence: number;
  updatedAt: string;
  logs: string[];
  artifactDigests?: Record<string, string>;
  evidenceRefs?: string[];
  structuredResult?: Record<string, unknown>;
}

export interface JobStatusInput {
  jobId: string;
  workspace?: string;
  lastKnownSequence?: number;
  lastKnownUpdatedAt?: string;
  seenResponseKeys?: string[];
  readOnlyLookup?: (jobId: string, workspace: string) => Promise<ReadOnlyWindmillJobSnapshot | null>;
}

export interface JobStatusOutput {
  found: boolean;
  jobId: string;
  workspace: string;
  status:
    | 'UNAVAILABLE_UNCONFIGURED'
    | 'UNAUTHORIZED_WORKSPACE'
    | 'NOT_FOUND'
    | 'DUPLICATE_JOB_RESPONSE'
    | 'STALE_JOB_RESPONSE'
    | 'RETRIEVED_READ_ONLY';
  snapshot?: ReadOnlyWindmillJobSnapshot;
  reason: string;
}

export async function main(input: JobStatusInput): Promise<JobStatusOutput> {
  const workspace = (input.workspace ?? ALLOWED_WINDMILL_WORKSPACE).trim();
  const jobId = (input.jobId ?? '').trim();

  if (workspace !== ALLOWED_WINDMILL_WORKSPACE) {
    return {
      found: false,
      jobId,
      workspace,
      status: 'UNAUTHORIZED_WORKSPACE',
      reason: `Refused job lookup in unauthorized workspace "${workspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
    };
  }

  if (!jobId || typeof input.readOnlyLookup !== 'function') {
    return {
      found: false,
      jobId,
      workspace,
      status: 'UNAVAILABLE_UNCONFIGURED',
      reason:
        'Live Windmill job lookup is not connected in this scaffold. Bind authenticated Windmill `wmill` client calls inside `uor-offline-foundry`.',
    };
  }

  const snapshot = await input.readOnlyLookup(jobId, workspace);
  if (!snapshot) {
    return {
      found: false,
      jobId,
      workspace,
      status: 'NOT_FOUND',
      reason: `Job "${jobId}" was not found in workspace "${ALLOWED_WINDMILL_WORKSPACE}".`,
    };
  }

  if (snapshot.workspace !== ALLOWED_WINDMILL_WORKSPACE) {
    return {
      found: false,
      jobId,
      workspace: snapshot.workspace,
      status: 'UNAUTHORIZED_WORKSPACE',
      reason: `Job "${jobId}" belongs to unauthorized workspace "${snapshot.workspace}".`,
    };
  }

  const responseKey = `${snapshot.jobId}:${snapshot.sequence}:${snapshot.updatedAt}:${snapshot.state}`;
  if (input.seenResponseKeys?.includes(responseKey)) {
    return {
      found: false,
      jobId,
      workspace,
      status: 'DUPLICATE_JOB_RESPONSE',
      reason: `Rejected duplicate job response (${responseKey}) for job "${jobId}".`,
    };
  }

  if (
    (input.lastKnownSequence !== undefined && snapshot.sequence < input.lastKnownSequence) ||
    (input.lastKnownUpdatedAt !== undefined &&
      Date.parse(snapshot.updatedAt) < Date.parse(input.lastKnownUpdatedAt))
  ) {
    return {
      found: false,
      jobId,
      workspace,
      status: 'STALE_JOB_RESPONSE',
      reason: `Rejected stale out-of-order job response (seq ${snapshot.sequence} @ ${snapshot.updatedAt}) for job "${jobId}".`,
    };
  }

  return {
    found: true,
    jobId: snapshot.jobId,
    workspace: snapshot.workspace,
    status: 'RETRIEVED_READ_ONLY',
    snapshot,
    reason: `Retrieved read-only Windmill job "${snapshot.jobId}" (${snapshot.state}, seq ${snapshot.sequence}).`,
  };
}
