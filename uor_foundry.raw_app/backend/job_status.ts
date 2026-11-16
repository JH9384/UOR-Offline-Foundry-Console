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

/**
 * Windmill Backend Runnable 5: Read-Only Job Status & Result Retrieval
 *
 * Self-contained deployable Windmill runnable with zero relative file imports.
 *
 * Fail-closed contract:
 * - Returns `found: false` with `UNAVAILABLE_UNCONFIGURED` when no authenticated
 *   Windmill workspace reader is bound (never synthesizes fake job IDs or results).
 * - Performs genuine authenticated read-only HTTP retrieval against local Windmill
 *   (`127.0.0.1:8080`, workspace `uor-offline-foundry`) when bound via
 *   `createAuthenticatedWindmillHttpLookup` or `useAuthenticatedHttpLookup: true`.
 * - Rejects unauthorized workspaces, duplicate responses, and stale out-of-order responses.
 * - Never exposes or logs bearer tokens.
 */
export interface ReadOnlyWindmillJobSnapshot {
  jobId: string;
  workspace: string;
  flowPath: string;
  stageId?: string;
  commandId?: string;
  state: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  sequence: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  durationMs?: number;
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
  /**
   * When true, uses server/worker environment credentials (`WINDMILL_TOKEN` or `WM_TOKEN`)
   * to perform a live read-only lookup against the local Windmill HTTP API.
   */
  useAuthenticatedHttpLookup?: boolean;
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

export function redactTokenInJobStatus(text: string, token?: string): string {
  const raw = String(text ?? '');
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return raw;
  }
  return raw.split(token.trim()).join('[REDACTED_WINDMILL_TOKEN]');
}

export function mapRawWindmillPayloadToSnapshot(
  raw: Record<string, unknown>,
  fallbackWorkspace: string = ALLOWED_WINDMILL_WORKSPACE
): ReadOnlyWindmillJobSnapshot {
  const jobId = String(raw.id ?? raw.jobId ?? '').trim();
  const workspace = String(raw.workspace_id ?? raw.workspace ?? fallbackWorkspace).trim();
  const flowPath = String(
    raw.script_path ?? raw.flow_path ?? (raw.raw_flow as Record<string, unknown> | undefined)?.summary ?? 'u/admin/runtime_health'
  );

  const isRunning = raw.running === true || raw.type === 'QueuedJob';
  const isQueued = raw.type === 'QueuedJob' && raw.running !== true;
  const isCancelled = raw.canceled === true || raw.cancelled === true;
  const isCompleted = !isRunning && !isCancelled && raw.success === true;

  let state: ReadOnlyWindmillJobSnapshot['state'] = 'FAILED';
  if (isQueued) state = 'QUEUED';
  else if (isRunning) state = 'RUNNING';
  else if (isCancelled) state = 'CANCELLED';
  else if (isCompleted) state = 'COMPLETED';
  else if (raw.state && typeof raw.state === 'string') {
    const upper = raw.state.toUpperCase();
    if (
      upper === 'QUEUED' ||
      upper === 'RUNNING' ||
      upper === 'COMPLETED' ||
      upper === 'FAILED' ||
      upper === 'CANCELLED' ||
      upper === 'INTERRUPTED'
    ) {
      state = upper;
    }
  }

  const createdIso =
    typeof raw.created_at === 'string'
      ? raw.created_at
      : typeof raw.startedAt === 'string'
        ? raw.startedAt
        : new Date(0).toISOString();
  const startedIso =
    typeof raw.started_at === 'string'
      ? raw.started_at
      : typeof raw.startedAt === 'string'
        ? raw.startedAt
        : createdIso;
  const durationMs =
    typeof raw.duration_ms === 'number' && Number.isFinite(raw.duration_ms)
      ? raw.duration_ms
      : undefined;

  let completedIso: string | undefined;
  if (typeof raw.completed_at === 'string') {
    completedIso = raw.completed_at;
  } else if (typeof raw.completedAt === 'string') {
    completedIso = raw.completedAt;
  } else if (!isRunning && durationMs !== undefined) {
    const startMs = Date.parse(startedIso);
    if (!Number.isNaN(startMs)) {
      completedIso = new Date(startMs + durationMs).toISOString();
    }
  }

  const updatedAt =
    typeof raw.updatedAt === 'string'
      ? raw.updatedAt
      : completedIso ?? startedIso ?? createdIso;

  const sequence =
    typeof raw.sequence === 'number' && Number.isFinite(raw.sequence)
      ? raw.sequence
      : state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED'
        ? 2
        : 1;

  let logs: string[] = [];
  if (Array.isArray(raw.logs)) {
    logs = raw.logs.map((line) => String(line));
  } else if (typeof raw.logs === 'string' && raw.logs.trim().length > 0) {
    logs = raw.logs.split(/\r?\n/).filter((line) => line.length > 0);
  }

  let structuredResult: Record<string, unknown> | undefined;
  if (raw.structuredResult && typeof raw.structuredResult === 'object' && !Array.isArray(raw.structuredResult)) {
    structuredResult = raw.structuredResult as Record<string, unknown>;
  } else if (raw.result !== undefined && raw.result !== null) {
    if (typeof raw.result === 'object' && !Array.isArray(raw.result)) {
      structuredResult = raw.result as Record<string, unknown>;
    } else {
      structuredResult = { value: raw.result };
    }
  }

  return {
    jobId,
    workspace,
    flowPath,
    stageId: typeof raw.stageId === 'string' ? raw.stageId : undefined,
    commandId: typeof raw.commandId === 'string' ? raw.commandId : undefined,
    state,
    sequence,
    startedAt: startedIso,
    completedAt: completedIso,
    updatedAt,
    durationMs,
    logs,
    artifactDigests:
      raw.artifactDigests && typeof raw.artifactDigests === 'object'
        ? (raw.artifactDigests as Record<string, string>)
        : undefined,
    evidenceRefs: Array.isArray(raw.evidenceRefs)
      ? raw.evidenceRefs.map((e) => String(e))
      : undefined,
    structuredResult,
  };
}

export function createAuthenticatedWindmillHttpLookup(options: {
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
} = {}): (jobId: string, workspace: string) => Promise<ReadOnlyWindmillJobSnapshot | null> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  return async (jobId: string, workspace: string): Promise<ReadOnlyWindmillJobSnapshot | null> => {
    const env = typeof process !== 'undefined' && process?.env ? process.env : undefined;
    const rawToken = (options.token ?? env?.WINDMILL_TOKEN ?? env?.WM_TOKEN ?? '').trim();
    if (!rawToken || typeof fetchFn !== 'function') {
      throw new Error('UNAVAILABLE_UNCONFIGURED: Missing server-side Windmill bearer token.');
    }

    const baseUrl = (
      options.baseUrl ??
      env?.WINDMILL_BASE_URL ??
      env?.BASE_INTERNAL_URL ??
      'http://127.0.0.1:8080'
    ).trim();

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      throw new Error(`Invalid Windmill base URL "${baseUrl}".`);
    }
    if (
      parsedUrl.protocol !== 'http:' ||
      (parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost')
    ) {
      throw new Error(
        `Refused non-loopback Windmill endpoint "${parsedUrl.origin}". Only 127.0.0.1 or localhost is permitted.`
      );
    }

    const encodedWs = encodeURIComponent(workspace);
    const encodedId = encodeURIComponent(jobId);
    const jobUrl = `${parsedUrl.origin}/api/w/${encodedWs}/jobs_u/get/${encodedId}`;

    const res = await fetchFn(jobUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: 'application/json',
      },
    });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const errText = redactTokenInJobStatus(await res.text(), rawToken);
      throw new Error(`Windmill job lookup HTTP ${res.status}: ${errText}`);
    }

    const rawJob = (await res.json()) as Record<string, unknown>;
    return mapRawWindmillPayloadToSnapshot(rawJob, workspace);
  };
}

export async function main(input: JobStatusInput): Promise<JobStatusOutput> {
  const workspace = (input?.workspace ?? ALLOWED_WINDMILL_WORKSPACE).trim();
  const jobId = (input?.jobId ?? '').trim();

  if (workspace !== ALLOWED_WINDMILL_WORKSPACE) {
    return {
      found: false,
      jobId,
      workspace,
      status: 'UNAUTHORIZED_WORKSPACE',
      reason: `Refused job lookup in unauthorized workspace "${workspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
    };
  }

  const workerEnv =
    typeof process !== 'undefined' && process?.env ? process.env : undefined;
  const workerWorkspace = workerEnv?.WM_WORKSPACE?.trim();
  if (workerWorkspace && workerWorkspace !== ALLOWED_WINDMILL_WORKSPACE) {
    return {
      found: false,
      jobId,
      workspace: workerWorkspace,
      status: 'UNAUTHORIZED_WORKSPACE',
      reason: `Refused job lookup inside unauthorized Windmill worker workspace "${workerWorkspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
    };
  }

  const lookupFn =
    typeof input?.readOnlyLookup === 'function'
      ? input.readOnlyLookup
      : input?.useAuthenticatedHttpLookup === true
        ? createAuthenticatedWindmillHttpLookup()
        : undefined;

  if (!jobId || typeof lookupFn !== 'function') {
    return {
      found: false,
      jobId,
      workspace,
      status: 'UNAVAILABLE_UNCONFIGURED',
      reason:
        'Live Windmill job lookup is not connected in this scaffold. Bind authenticated Windmill `wmill` client calls inside `uor-offline-foundry`.',
    };
  }

  let snapshot: ReadOnlyWindmillJobSnapshot | null;
  try {
    snapshot = await lookupFn(jobId, workspace);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const token = workerEnv?.WINDMILL_TOKEN ?? workerEnv?.WM_TOKEN;
    const safeMsg = redactTokenInJobStatus(rawMsg, token);
    return {
      found: false,
      jobId,
      workspace,
      status: 'UNAVAILABLE_UNCONFIGURED',
      reason: `Authenticated Windmill job lookup failed closed: ${safeMsg}`,
    };
  }

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
