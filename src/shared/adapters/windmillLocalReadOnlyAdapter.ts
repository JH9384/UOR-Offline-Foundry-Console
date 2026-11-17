import {
  EngineeringIntakePayload,
  WindmillConnectionDiagnostic,
  WindmillJobRecord,
  WindmillJobState,
} from '../types/foundry';
import { WINDMILL_TARGET_CONFIG } from './windmillAdapter';
import { ALLOWED_WINDMILL_WORKSPACE } from './windmillCommandRegistry';
import {
  REQUIRED_READONLY_RUNNABLES,
  WindmillIntakeValidationInput,
  WindmillIntakeValidationResult,
  WindmillReadOnlyHealthProbeResult,
  WindmillReadOnlyJobFetchFailure,
  WindmillReadOnlyJobFetchSuccess,
  WindmillReadOnlyRuntimeTransport,
  WindmillSourcePackageSummaryInput,
} from './windmillExecutionService';

/**
 * Minimal Local Server-Side Read-Only Windmill Adapter & Client Proxy Transport
 *
 * Security & Operational Invariants:
 * 1. Keeps `WINDMILL_TOKEN` strictly server-side (`process.env.WINDMILL_TOKEN`);
 *    never exposes tokens to browser code, responses, or logs.
 * 2. Restricts server-side outbound requests strictly to loopback (`127.0.0.1` or `localhost`)
 *    and workspace `uor-offline-foundry`.
 * 3. Read-only operations only: runtime health probe, job listing, and job status/result lookup.
 * 4. Preserves rejection of unauthorized workspaces, duplicate responses, and stale out-of-order responses.
 * 5. Keeps compiler execution, workflow dispatch, release authority, triggers, and local AI disabled.
 */

export function redactServerWindmillToken(text: string, token?: string): string {
  const raw = String(text ?? '');
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return raw;
  }
  return raw.split(token.trim()).join('[REDACTED_WINDMILL_TOKEN]');
}

export function validateServerLoopbackOrigin(
  baseUrl: string = WINDMILL_TARGET_CONFIG.baseUrl
): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(
      `Invalid Windmill base URL "${baseUrl}". Expected "${WINDMILL_TARGET_CONFIG.baseUrl}".`
    );
  }
  if (
    parsed.protocol !== 'http:' ||
    (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')
  ) {
    throw new Error(
      `Refused non-loopback Windmill endpoint "${baseUrl}". Server adapter only permits http://127.0.0.1:8080 or http://localhost:8080.`
    );
  }
  return parsed.origin;
}

export interface NormalizedLiveWindmillJob {
  workspace: string;
  sequence: number;
  updatedAt: string;
  record: WindmillJobRecord;
}

export const FIXED_INTAKE_VALIDATE_SCRIPT_PATH = 'u/admin/intake_validate' as const;
export const MAX_INTAKE_VALIDATE_BODY_BYTES = 64 * 1024; // 64 KB strict limit

const ALLOWED_INTAKE_INPUT_KEYS = new Set<string>([
  'projectName',
  'productFamily',
  'componentId',
  'workflowId',
  'purpose',
  'declaredInputs',
  'environmentDeclaration',
  'sourceRevision',
  'acknowledgeBoundary',
  'sourcePackage',
]);

const ALLOWED_SOURCE_PACKAGE_KEYS = new Set<string>([
  'schema',
  'packageId',
  'packageClassification',
  'isHoloArchive',
  'reviewConfirmed',
  'targetWindmillWorkspace',
  'packageDigestSha256',
  'expectedPackageDigestSha256',
  'lockfileRefs',
  'files',
]);

const ALLOWED_SOURCE_PACKAGE_FILE_KEYS = new Set<string>([
  'path',
  'sha256',
  'expectedSha256',
]);

const FORBIDDEN_DISPATCH_OVERRIDE_KEYS = new Set<string>([
  'scriptPath',
  'script_path',
  'flowPath',
  'flow_path',
  'runnable',
  'commandId',
  'rawCommandString',
  'endpoint',
  'url',
  'token',
  'authorization',
]);

/**
 * Maps the existing `IntakeModal` form fields 1-to-1 to `WindmillIntakeValidationInput`
 * without inventing missing fields or claiming authoritative source evidence.
 */
export function mapEngineeringIntakeFormToValidationInput(
  form:
    | Pick<
        EngineeringIntakePayload,
        | 'projectName'
        | 'productFamily'
        | 'componentId'
        | 'workflowId'
        | 'purpose'
        | 'declaredInputs'
        | 'environmentDeclaration'
        | 'sourceRevision'
        | 'acknowledgeBoundary'
      >
    | WindmillIntakeValidationInput,
  sourcePackage?: WindmillSourcePackageSummaryInput
): WindmillIntakeValidationInput {
  return {
    projectName: String(form.projectName ?? ''),
    productFamily: String(form.productFamily ?? ''),
    componentId: String(form.componentId ?? ''),
    workflowId: String(form.workflowId ?? ''),
    purpose: String(form.purpose ?? ''),
    declaredInputs: String(form.declaredInputs ?? ''),
    environmentDeclaration: String(form.environmentDeclaration ?? ''),
    sourceRevision: String(form.sourceRevision ?? ''),
    acknowledgeBoundary: Boolean(form.acknowledgeBoundary),
    ...(sourcePackage !== undefined
      ? { sourcePackage }
      : 'sourcePackage' in form && form.sourcePackage !== undefined
        ? { sourcePackage: form.sourcePackage }
        : {}),
  };
}

export type SanitizedIntakeProxyRequestResult =
  | {
      ok: true;
      workspace: typeof ALLOWED_WINDMILL_WORKSPACE;
      input: WindmillIntakeValidationInput;
    }
  | {
      ok: false;
      httpStatus: 400 | 403 | 413;
      code:
        | 'MALFORMED_PAYLOAD'
        | 'PAYLOAD_TOO_LARGE'
        | 'UNAUTHORIZED_WORKSPACE'
        | 'FORBIDDEN_SCRIPT_OVERRIDE';
      message: string;
    };

/**
 * Strictly validates and sanitizes an incoming request body for
 * `POST /api/windmill/intake/validate`.
 *
 * Enforces:
 * - Maximum payload byte size (`MAX_INTAKE_VALIDATE_BODY_BYTES`, 64 KB)
 * - Valid JSON object (no arrays, primitives, or malformed JSON)
 * - No arbitrary script/flow/command overrides
 * - Workspace restricted strictly to `uor-offline-foundry`
 * - Strict field allowlist and scalar type checks for `IntakeValidationInput`
 */
export function validateAndSanitizeIntakeProxyRequest(
  rawBody: string | unknown,
  maxBytes: number = MAX_INTAKE_VALIDATE_BODY_BYTES
): SanitizedIntakeProxyRequestResult {
  const serialized =
    typeof rawBody === 'string'
      ? rawBody
      : rawBody !== undefined
        ? JSON.stringify(rawBody)
        : '';

  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > maxBytes) {
    return {
      ok: false,
      httpStatus: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: `Intake validation request body (${byteLength} bytes) exceeds maximum limit of ${maxBytes} bytes.`,
    };
  }

  let parsed: unknown = rawBody;
  if (typeof rawBody === 'string') {
    if (rawBody.trim().length === 0) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'MALFORMED_PAYLOAD',
        message: 'Intake validation request body cannot be empty.',
      };
    }
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return {
        ok: false,
        httpStatus: 400,
        code: 'MALFORMED_PAYLOAD',
        message: 'Intake validation request body is not valid JSON.',
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'MALFORMED_PAYLOAD',
      message: 'Intake validation request payload must be a JSON object.',
    };
  }

  const topObj = parsed as Record<string, unknown>;

  for (const key of Object.keys(topObj)) {
    if (FORBIDDEN_DISPATCH_OVERRIDE_KEYS.has(key)) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'FORBIDDEN_SCRIPT_OVERRIDE',
        message: `Forbidden property "${key}": arbitrary script or flow paths are not permitted on /api/windmill/intake/validate.`,
      };
    }
  }

  if (topObj.workspace !== undefined) {
    if (
      typeof topObj.workspace !== 'string' ||
      topObj.workspace.trim() !== ALLOWED_WINDMILL_WORKSPACE
    ) {
      return {
        ok: false,
        httpStatus: 403,
        code: 'UNAUTHORIZED_WORKSPACE',
        message: `Refused unauthorized Windmill workspace "${String(topObj.workspace)}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
      };
    }
  }

  const candidateObj: Record<string, unknown> =
    topObj.input && typeof topObj.input === 'object' && !Array.isArray(topObj.input)
      ? (topObj.input as Record<string, unknown>)
      : topObj;

  if (topObj.input !== undefined) {
    for (const key of Object.keys(topObj)) {
      if (key !== 'input' && key !== 'workspace' && !ALLOWED_INTAKE_INPUT_KEYS.has(key)) {
        return {
          ok: false,
          httpStatus: 400,
          code: 'MALFORMED_PAYLOAD',
          message: `Unknown top-level property "${key}" in intake validation request.`,
        };
      }
    }
  }

  for (const key of Object.keys(candidateObj)) {
    if (FORBIDDEN_DISPATCH_OVERRIDE_KEYS.has(key)) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'FORBIDDEN_SCRIPT_OVERRIDE',
        message: `Forbidden property "${key}": arbitrary script or flow paths are not permitted.`,
      };
    }
    if (key === 'workspace') {
      if (
        typeof candidateObj.workspace !== 'string' ||
        candidateObj.workspace.trim() !== ALLOWED_WINDMILL_WORKSPACE
      ) {
        return {
          ok: false,
          httpStatus: 403,
          code: 'UNAUTHORIZED_WORKSPACE',
          message: `Refused unauthorized Windmill workspace "${String(candidateObj.workspace)}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
        };
      }
      continue;
    }
    if (!ALLOWED_INTAKE_INPUT_KEYS.has(key)) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'MALFORMED_PAYLOAD',
        message: `Unknown intake property "${key}". Only canonical IntakeValidationInput fields are permitted.`,
      };
    }
  }

  const requiredStringFields = [
    'projectName',
    'productFamily',
    'componentId',
    'workflowId',
    'purpose',
    'declaredInputs',
    'environmentDeclaration',
    'sourceRevision',
  ] as const;

  for (const field of requiredStringFields) {
    if (typeof candidateObj[field] !== 'string') {
      return {
        ok: false,
        httpStatus: 400,
        code: 'MALFORMED_PAYLOAD',
        message: `Field "${field}" must be a string in IntakeValidationInput.`,
      };
    }
  }

  if (typeof candidateObj.acknowledgeBoundary !== 'boolean') {
    return {
      ok: false,
      httpStatus: 400,
      code: 'MALFORMED_PAYLOAD',
      message: 'Field "acknowledgeBoundary" must be a boolean in IntakeValidationInput.',
    };
  }

  let sanitizedSourcePackage: WindmillSourcePackageSummaryInput | undefined;
  if (candidateObj.sourcePackage !== undefined) {
    if (
      !candidateObj.sourcePackage ||
      typeof candidateObj.sourcePackage !== 'object' ||
      Array.isArray(candidateObj.sourcePackage)
    ) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'MALFORMED_PAYLOAD',
        message: 'Field "sourcePackage" must be a JSON object when provided.',
      };
    }
    const rawPkg = candidateObj.sourcePackage as Record<string, unknown>;
    for (const k of Object.keys(rawPkg)) {
      if (!ALLOWED_SOURCE_PACKAGE_KEYS.has(k)) {
        return {
          ok: false,
          httpStatus: 400,
          code: 'MALFORMED_PAYLOAD',
          message: `Unknown sourcePackage property "${k}".`,
        };
      }
    }
    if (
      typeof rawPkg.schema !== 'string' ||
      typeof rawPkg.packageId !== 'string' ||
      typeof rawPkg.packageClassification !== 'string' ||
      typeof rawPkg.isHoloArchive !== 'boolean' ||
      typeof rawPkg.reviewConfirmed !== 'boolean' ||
      typeof rawPkg.targetWindmillWorkspace !== 'string' ||
      typeof rawPkg.packageDigestSha256 !== 'string' ||
      !Array.isArray(rawPkg.lockfileRefs) ||
      !rawPkg.lockfileRefs.every((r) => typeof r === 'string') ||
      !Array.isArray(rawPkg.files)
    ) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'MALFORMED_PAYLOAD',
        message: 'Malformed "sourcePackage" structure in IntakeValidationInput.',
      };
    }
    const sanitizedFiles: WindmillSourcePackageSummaryInput['files'] = [];
    for (const f of rawPkg.files) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        return {
          ok: false,
          httpStatus: 400,
          code: 'MALFORMED_PAYLOAD',
          message: 'Each entry in "sourcePackage.files" must be an object.',
        };
      }
      const fObj = f as Record<string, unknown>;
      for (const fk of Object.keys(fObj)) {
        if (!ALLOWED_SOURCE_PACKAGE_FILE_KEYS.has(fk)) {
          return {
            ok: false,
            httpStatus: 400,
            code: 'MALFORMED_PAYLOAD',
            message: `Unknown property "${fk}" in sourcePackage.files entry.`,
          };
        }
      }
      if (typeof fObj.path !== 'string' || typeof fObj.sha256 !== 'string') {
        return {
          ok: false,
          httpStatus: 400,
          code: 'MALFORMED_PAYLOAD',
          message: 'Each file in "sourcePackage.files" requires string "path" and "sha256".',
        };
      }
      sanitizedFiles.push({
        path: fObj.path,
        sha256: fObj.sha256,
        ...(typeof fObj.expectedSha256 === 'string'
          ? { expectedSha256: fObj.expectedSha256 }
          : {}),
      });
    }

    sanitizedSourcePackage = {
      schema: rawPkg.schema,
      packageId: rawPkg.packageId,
      packageClassification: rawPkg.packageClassification,
      isHoloArchive: rawPkg.isHoloArchive,
      reviewConfirmed: rawPkg.reviewConfirmed,
      targetWindmillWorkspace: rawPkg.targetWindmillWorkspace,
      packageDigestSha256: rawPkg.packageDigestSha256,
      ...(typeof rawPkg.expectedPackageDigestSha256 === 'string'
        ? { expectedPackageDigestSha256: rawPkg.expectedPackageDigestSha256 }
        : {}),
      lockfileRefs: rawPkg.lockfileRefs as string[],
      files: sanitizedFiles,
    };
  }

  return {
    ok: true,
    workspace: ALLOWED_WINDMILL_WORKSPACE,
    input: {
      projectName: candidateObj.projectName as string,
      productFamily: candidateObj.productFamily as string,
      componentId: candidateObj.componentId as string,
      workflowId: candidateObj.workflowId as string,
      purpose: candidateObj.purpose as string,
      declaredInputs: candidateObj.declaredInputs as string,
      environmentDeclaration: candidateObj.environmentDeclaration as string,
      sourceRevision: candidateObj.sourceRevision as string,
      acknowledgeBoundary: candidateObj.acknowledgeBoundary as boolean,
      ...(sanitizedSourcePackage !== undefined
        ? { sourcePackage: sanitizedSourcePackage }
        : {}),
    },
  };
}

export function mapRawWindmillJobToRecord(
  raw: Record<string, unknown>,
  fallbackProjectId: string = 'proj-prism-calc'
): NormalizedLiveWindmillJob {
  const jobId = String(raw.id ?? raw.jobId ?? '').trim();
  const workspace = String(
    raw.workspace_id ?? raw.workspace ?? ALLOWED_WINDMILL_WORKSPACE
  ).trim();

  const args =
    raw.args && typeof raw.args === 'object' && !Array.isArray(raw.args)
      ? (raw.args as Record<string, unknown>)
      : {};

  const scriptPath = String(
    raw.script_path ??
      raw.flow_path ??
      (raw.raw_flow as Record<string, unknown> | undefined)?.summary ??
      'u/admin/runtime_health'
  ).trim();

  const workflowName = String(
    raw.workflowName ??
      (raw.raw_flow as Record<string, unknown> | undefined)?.summary ??
      scriptPath
  ).trim();

  const isQueued = raw.type === 'QueuedJob' && raw.running !== true;
  const isRunning = raw.running === true || isQueued;
  const isCancelled = raw.canceled === true || raw.cancelled === true;
  const isCompleted = !isRunning && !isCancelled && raw.success === true;

  let state: WindmillJobState = 'FAILED';
  if (isQueued) state = 'QUEUED';
  else if (isRunning) state = 'RUNNING';
  else if (isCancelled) state = 'CANCELLED';
  else if (isCompleted) state = 'COMPLETED';
  else if (typeof raw.state === 'string') {
    const upper = raw.state.toUpperCase();
    if (
      upper === 'QUEUED' ||
      upper === 'RUNNING' ||
      upper === 'COMPLETED' ||
      upper === 'FAILED' ||
      upper === 'CANCELLED'
    ) {
      state = upper;
    }
  }

  const createdAt =
    typeof raw.created_at === 'string'
      ? raw.created_at
      : typeof raw.startedAt === 'string'
        ? raw.startedAt
        : new Date(0).toISOString();
  const startedAt =
    typeof raw.started_at === 'string'
      ? raw.started_at
      : typeof raw.startedAt === 'string'
        ? raw.startedAt
        : createdAt;

  const durationMs =
    typeof raw.duration_ms === 'number' && Number.isFinite(raw.duration_ms)
      ? raw.duration_ms
      : typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs)
        ? raw.durationMs
        : undefined;

  let completedAt: string | undefined;
  if (typeof raw.completed_at === 'string') {
    completedAt = raw.completed_at;
  } else if (typeof raw.completedAt === 'string') {
    completedAt = raw.completedAt;
  } else if (typeof raw.finishedAt === 'string') {
    completedAt = raw.finishedAt;
  } else if (!isRunning && durationMs !== undefined) {
    const startMs = Date.parse(startedAt);
    if (!Number.isNaN(startMs)) {
      completedAt = new Date(startMs + durationMs).toISOString();
    }
  }

  const updatedAt =
    typeof raw.updatedAt === 'string'
      ? raw.updatedAt
      : completedAt ?? startedAt ?? createdAt;

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
  if (
    raw.structuredResult &&
    typeof raw.structuredResult === 'object' &&
    !Array.isArray(raw.structuredResult)
  ) {
    structuredResult = raw.structuredResult as Record<string, unknown>;
  } else if (raw.result !== undefined && raw.result !== null) {
    if (typeof raw.result === 'object' && !Array.isArray(raw.result)) {
      structuredResult = raw.result as Record<string, unknown>;
    } else {
      structuredResult = { value: raw.result };
    }
  }

  const artifactRefs = Array.isArray(raw.artifactRefs)
    ? raw.artifactRefs.map((r) => String(r))
    : Array.isArray(structuredResult?.artifactRefs)
      ? (structuredResult.artifactRefs as unknown[]).map((r) => String(r))
      : [];

  const evidenceRefs = Array.isArray(raw.evidenceRefs)
    ? raw.evidenceRefs.map((r) => String(r))
    : Array.isArray(structuredResult?.evidenceRefs)
      ? (structuredResult.evidenceRefs as unknown[]).map((r) => String(r))
      : [];

  if (logs.length === 0 && structuredResult !== undefined) {
    logs = [`Result: ${JSON.stringify(structuredResult)}`];
  }

  return {
    workspace,
    sequence,
    updatedAt,
    record: {
      jobId,
      projectId: String(
        raw.projectId ?? args.projectId ?? fallbackProjectId
      ),
      workflowId: String(
        raw.workflowId ?? args.workflowId ?? 'wf-windmill-readonly'
      ),
      workflowName,
      flowPath: scriptPath,
      flowVersion: String(raw.script_hash ?? raw.flowVersion ?? 'live'),
      sourceRevision: String(
        raw.sourceRevision ?? args.sourceRevision ?? 'uor-offline-foundry@live'
      ),
      idempotencyKey: String(
        raw.idempotencyKey ?? args.idempotencyKey ?? `wm-live-${jobId}`
      ),
      state,
      startedAt,
      completedAt,
      durationMs,
      logs,
      structuredResult,
      artifactRefs,
      evidenceRefs,
      retryAvailable: false,
      isSyntheticFixture: false,
      flowRegisteredInWorkspace: true,
    },
  };
}

export interface ServerSideWindmillAdapterConfig {
  baseUrl?: string;
  workspace?: string;
  perPage?: number;
  getToken?: () => string | undefined;
  fetchImpl?: typeof fetch;
}

/**
 * Creates a server-side `WindmillReadOnlyRuntimeTransport` that talks to
 * `http://127.0.0.1:8080` (`uor-offline-foundry`) using a server-side `WINDMILL_TOKEN`.
 *
 * Strictly read-only: `dispatchFlow` is intentionally omitted so workflow dispatch,
 * compiler execution, triggers, and release remain disabled.
 */
export function createServerSideWindmillReadOnlyTransport(
  config: ServerSideWindmillAdapterConfig = {}
): WindmillReadOnlyRuntimeTransport {
  const targetWorkspace = (
    config.workspace ?? ALLOWED_WINDMILL_WORKSPACE
  ).trim();
  const perPage = config.perPage ?? 50;
  const fetchFn = config.fetchImpl ?? globalThis.fetch;
  const resolveToken =
    config.getToken ??
    (() =>
      typeof process !== 'undefined' && process?.env
        ? process.env.WINDMILL_TOKEN
        : undefined);

  const watermarks = new Map<
    string,
    { sequence: number; updatedAt: string; state: WindmillJobState; seenKeys: Set<string> }
  >();

  return {
    async probeHealth(): Promise<WindmillReadOnlyHealthProbeResult> {
      if (targetWorkspace !== ALLOWED_WINDMILL_WORKSPACE) {
        return {
          reachable: true,
          workspace: targetWorkspace,
          authenticated: false,
          permissionsValidated: false,
          registeredRunnables: [],
          registeredFlows: [],
          diagnosticMessage: `Refused unauthorized Windmill workspace "${targetWorkspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
        };
      }

      let origin: string;
      try {
        origin = validateServerLoopbackOrigin(
          config.baseUrl ?? WINDMILL_TARGET_CONFIG.baseUrl
        );
      } catch (err) {
        return {
          reachable: false,
          workspace: targetWorkspace,
          authenticated: false,
          permissionsValidated: false,
          registeredRunnables: [],
          registeredFlows: [],
          diagnosticMessage: err instanceof Error ? err.message : String(err),
        };
      }

      const token = resolveToken()?.trim();
      if (!token) {
        return {
          reachable: false,
          workspace: targetWorkspace,
          authenticated: false,
          permissionsValidated: false,
          registeredRunnables: [],
          registeredFlows: [],
          diagnosticMessage:
            'Server-side WINDMILL_TOKEN is not configured. Live Windmill connection is UNAVAILABLE.',
        };
      }

      try {
        const res = await fetchFn(
          `${origin}/api/w/${encodeURIComponent(targetWorkspace)}/jobs/run_wait_result/p/u/admin/runtime_health`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              workspace: ALLOWED_WINDMILL_WORKSPACE,
              options: {},
            }),
          }
        );

        if (res.status === 401 || res.status === 403) {
          return {
            reachable: true,
            workspace: targetWorkspace,
            authenticated: false,
            permissionsValidated: false,
            registeredRunnables: [],
            registeredFlows: [],
            diagnosticMessage: `Windmill rejected server credentials (HTTP ${res.status}) for workspace "${targetWorkspace}".`,
          };
        }

        if (!res.ok) {
          const safeErr = redactServerWindmillToken(await res.text(), token);
          return {
            reachable: true,
            workspace: targetWorkspace,
            authenticated: false,
            permissionsValidated: false,
            registeredRunnables: [],
            registeredFlows: [],
            diagnosticMessage: `Windmill runtime_health failed closed (HTTP ${res.status}): ${safeErr}`,
          };
        }

        const payload = (await res.json()) as Record<string, unknown>;
        if (
          payload.workspace !== ALLOWED_WINDMILL_WORKSPACE ||
          payload.canonicalRegistryCommandCount !== 16
        ) {
          return {
            reachable: true,
            workspace: String(payload.workspace ?? targetWorkspace),
            authenticated: false,
            permissionsValidated: false,
            registeredRunnables: [],
            registeredFlows: [],
            diagnosticMessage:
              'Windmill runtime_health response did not match canonical workspace or 16-command registry contract.',
          };
        }

        return {
          reachable: true,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          authenticated: true,
          permissionsValidated: true,
          registeredRunnables: [...REQUIRED_READONLY_RUNNABLES],
          registeredFlows: [],
          wmillContractStatus: 'LOCAL_PROXY_VALIDATED',
          diagnosticMessage:
            'Authenticated read-only LOCAL Windmill connection active (uor-offline-foundry @ http://127.0.0.1:8080). Compiler execution, workflow dispatch, triggers, and release remain disabled.',
        };
      } catch (err) {
        const safeErr = redactServerWindmillToken(
          err instanceof Error ? err.message : String(err),
          token
        );
        return {
          reachable: false,
          workspace: targetWorkspace,
          authenticated: false,
          permissionsValidated: false,
          registeredRunnables: [],
          registeredFlows: [],
          diagnosticMessage: `Live Windmill runtime at ${origin} is unreachable: ${safeErr}`,
        };
      }
    },

    async listJobs(projectId?: string) {
      if (targetWorkspace !== ALLOWED_WINDMILL_WORKSPACE) {
        return {
          ok: false as const,
          code: 'AUTH_NOT_VALIDATED' as const,
          message: `Refused job listing for unauthorized workspace "${targetWorkspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
        };
      }

      let origin: string;
      try {
        origin = validateServerLoopbackOrigin(
          config.baseUrl ?? WINDMILL_TARGET_CONFIG.baseUrl
        );
      } catch (err) {
        return {
          ok: false as const,
          code: 'NOT_CONNECTED' as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }

      const token = resolveToken()?.trim();
      if (!token) {
        return {
          ok: false as const,
          code: 'AUTH_NOT_VALIDATED' as const,
          message:
            'Server-side WINDMILL_TOKEN is not configured. Live Windmill job listing is UNAVAILABLE.',
        };
      }

      try {
        const listUrl = `${origin}/api/w/${encodeURIComponent(targetWorkspace)}/jobs/list?per_page=${perPage}`;
        const res = await fetchFn(listUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (res.status === 401 || res.status === 403) {
          return {
            ok: false as const,
            code: 'AUTH_NOT_VALIDATED' as const,
            message: `Windmill rejected job listing credentials (HTTP ${res.status}).`,
          };
        }

        if (!res.ok) {
          const safeErr = redactServerWindmillToken(await res.text(), token);
          return {
            ok: false as const,
            code: 'NOT_CONNECTED' as const,
            message: `Windmill job listing HTTP ${res.status}: ${safeErr}`,
          };
        }

        const rawList = (await res.json()) as unknown;
        if (!Array.isArray(rawList)) {
          return {
            ok: false as const,
            code: 'NOT_CONNECTED' as const,
            message: 'Windmill jobs/list returned a non-array payload.',
          };
        }

        const records: WindmillJobRecord[] = [];
        const seenIds = new Set<string>();

        for (const item of rawList) {
          if (!item || typeof item !== 'object') continue;
          const normalized = mapRawWindmillJobToRecord(
            item as Record<string, unknown>,
            projectId ?? 'proj-prism-calc'
          );
          if (!normalized.record.jobId) continue;

          if (normalized.workspace !== ALLOWED_WINDMILL_WORKSPACE) {
            return {
              ok: false as const,
              code: 'AUTH_NOT_VALIDATED' as const,
              message: `Refused job "${normalized.record.jobId}" from unauthorized workspace "${normalized.workspace}".`,
            };
          }

          if (seenIds.has(normalized.record.jobId)) {
            continue;
          }
          seenIds.add(normalized.record.jobId);

          if (
            projectId &&
            (item as Record<string, unknown>).projectId &&
            normalized.record.projectId !== projectId
          ) {
            continue;
          }

          records.push({
            ...normalized.record,
            logs: normalized.record.logs.map((l) =>
              redactServerWindmillToken(l, token)
            ),
            isSyntheticFixture: false,
          });
        }

        return {
          ok: true as const,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          records,
        };
      } catch (err) {
        const safeErr = redactServerWindmillToken(
          err instanceof Error ? err.message : String(err),
          token
        );
        return {
          ok: false as const,
          code: 'NOT_CONNECTED' as const,
          message: `Failed to retrieve Windmill job list from ${origin}: ${safeErr}`,
        };
      }
    },

    async fetchJobById(
      jobId: string
    ): Promise<WindmillReadOnlyJobFetchSuccess | WindmillReadOnlyJobFetchFailure> {
      const trimmedId = (jobId ?? '').trim();
      if (!trimmedId) {
        return {
          ok: false,
          code: 'NOT_CONNECTED',
          message: 'Job ID is required for read-only Windmill lookup.',
        };
      }

      if (targetWorkspace !== ALLOWED_WINDMILL_WORKSPACE) {
        return {
          ok: false,
          code: 'AUTH_NOT_VALIDATED',
          message: `Refused job lookup in unauthorized workspace "${targetWorkspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
        };
      }

      let origin: string;
      try {
        origin = validateServerLoopbackOrigin(
          config.baseUrl ?? WINDMILL_TARGET_CONFIG.baseUrl
        );
      } catch (err) {
        return {
          ok: false,
          code: 'NOT_CONNECTED',
          message: err instanceof Error ? err.message : String(err),
        };
      }

      const token = resolveToken()?.trim();
      if (!token) {
        return {
          ok: false,
          code: 'AUTH_NOT_VALIDATED',
          message:
            'Server-side WINDMILL_TOKEN is not configured. Live Windmill job lookup is UNAVAILABLE.',
        };
      }

      try {
        const encodedWs = encodeURIComponent(targetWorkspace);
        const encodedId = encodeURIComponent(trimmedId);
        const jobRes = await fetchFn(
          `${origin}/api/w/${encodedWs}/jobs_u/get/${encodedId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        );

        if (jobRes.status === 401 || jobRes.status === 403) {
          return {
            ok: false,
            code: 'AUTH_NOT_VALIDATED',
            message: `Windmill rejected job status credentials (HTTP ${jobRes.status}).`,
          };
        }

        if (jobRes.status === 404) {
          return {
            ok: false,
            code: 'NOT_CONNECTED',
            message: `Job "${trimmedId}" was not found in workspace "${ALLOWED_WINDMILL_WORKSPACE}".`,
          };
        }

        if (!jobRes.ok) {
          const safeErr = redactServerWindmillToken(await jobRes.text(), token);
          return {
            ok: false,
            code: 'NOT_CONNECTED',
            message: `Windmill job lookup HTTP ${jobRes.status}: ${safeErr}`,
          };
        }

        const rawJob = (await jobRes.json()) as Record<string, unknown>;

        // If job is completed and result is not embedded, try get_result_maybe
        if (
          rawJob.running !== true &&
          rawJob.type !== 'QueuedJob' &&
          rawJob.result === undefined
        ) {
          try {
            const resMaybe = await fetchFn(
              `${origin}/api/w/${encodedWs}/jobs_u/completed/get_result_maybe/${encodedId}`,
              {
                method: 'GET',
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/json',
                },
              }
            );
            if (resMaybe.ok) {
              const maybePayload = await resMaybe.json();
              if (maybePayload !== undefined && maybePayload !== null) {
                rawJob.result = maybePayload;
              }
            }
          } catch {
            // Optional result enrichment; ignore if endpoint not applicable
          }
        }

        const normalized = mapRawWindmillJobToRecord(rawJob);
        if (normalized.workspace !== ALLOWED_WINDMILL_WORKSPACE) {
          return {
            ok: false,
            code: 'AUTH_NOT_VALIDATED',
            message: `Refused job "${trimmedId}" belonging to unauthorized workspace "${normalized.workspace}".`,
          };
        }

        const sig = `${normalized.record.jobId}:${normalized.sequence}:${normalized.updatedAt}:${normalized.record.state}`;
        const prev = watermarks.get(trimmedId);
        if (prev) {
          if (prev.seenKeys.has(sig)) {
            return {
              ok: false,
              code: 'DUPLICATE_JOB_RESPONSE',
              message: `Rejected duplicate job response (${sig}) for job "${trimmedId}".`,
            };
          }
          const prevTs = Date.parse(prev.updatedAt);
          const nextTs = Date.parse(normalized.updatedAt);
          const isTerminal =
            prev.state === 'COMPLETED' ||
            prev.state === 'FAILED' ||
            prev.state === 'CANCELLED';
          const regressedState =
            isTerminal &&
            (normalized.record.state === 'QUEUED' ||
              normalized.record.state === 'RUNNING');

          if (
            normalized.sequence < prev.sequence ||
            (!Number.isNaN(prevTs) && !Number.isNaN(nextTs) && nextTs < prevTs) ||
            regressedState
          ) {
            return {
              ok: false,
              code: 'STALE_JOB_RESPONSE',
              message: `Rejected stale out-of-order job response for "${trimmedId}" (seq ${normalized.sequence} @ ${normalized.updatedAt}).`,
            };
          }
          prev.sequence = normalized.sequence;
          prev.updatedAt = normalized.updatedAt;
          prev.state = normalized.record.state;
          prev.seenKeys.add(sig);
        } else {
          watermarks.set(trimmedId, {
            sequence: normalized.sequence,
            updatedAt: normalized.updatedAt,
            state: normalized.record.state,
            seenKeys: new Set([sig]),
          });
        }

        return {
          ok: true,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          sequence: normalized.sequence,
          updatedAt: normalized.updatedAt,
          record: {
            ...normalized.record,
            logs: normalized.record.logs.map((l) =>
              redactServerWindmillToken(l, token)
            ),
            isSyntheticFixture: false,
          },
        };
      } catch (err) {
        const safeErr = redactServerWindmillToken(
          err instanceof Error ? err.message : String(err),
          token
        );
        return {
          ok: false,
          code: 'NOT_CONNECTED',
          message: `Failed to retrieve Windmill job "${trimmedId}": ${safeErr}`,
        };
      }
    },

    async validateIntake(
      rawInput: WindmillIntakeValidationInput
    ): Promise<WindmillIntakeValidationResult> {
      const makeDiag = (
        code: WindmillConnectionDiagnostic['code'],
        message: string
      ): WindmillConnectionDiagnostic => ({
        timestamp: new Date().toISOString(),
        endpoint: config.baseUrl ?? WINDMILL_TARGET_CONFIG.baseUrl,
        workspace: targetWorkspace,
        code,
        message,
        browserNavigatorOnline:
          typeof navigator !== 'undefined' ? navigator.onLine : false,
      });

      if (targetWorkspace !== ALLOWED_WINDMILL_WORKSPACE) {
        return {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: targetWorkspace,
          diagnostic: makeDiag(
            'AUTH_NOT_VALIDATED',
            `Refused intake validation for unauthorized workspace "${targetWorkspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`
          ),
        };
      }

      let origin: string;
      try {
        origin = validateServerLoopbackOrigin(
          config.baseUrl ?? WINDMILL_TARGET_CONFIG.baseUrl
        );
      } catch (err) {
        return {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: targetWorkspace,
          diagnostic: makeDiag(
            'NOT_CONNECTED',
            err instanceof Error ? err.message : String(err)
          ),
        };
      }

      const sanitized = validateAndSanitizeIntakeProxyRequest(rawInput);
      if (!sanitized.ok) {
        return {
          ok: false,
          outcome:
            sanitized.code === 'UNAUTHORIZED_WORKSPACE' ? 'UNAVAILABLE' : 'REJECTED',
          valid: false,
          errors: { _payload: sanitized.message },
          validatedAt: new Date().toISOString(),
          sideEffectsExecuted: false,
          workspace: targetWorkspace,
          diagnostic: makeDiag(
            sanitized.code === 'UNAUTHORIZED_WORKSPACE'
              ? 'AUTH_NOT_VALIDATED'
              : 'SANDBOX_ISOLATED',
            sanitized.message
          ),
        };
      }

      const token = resolveToken()?.trim();
      if (!token) {
        return {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: targetWorkspace,
          diagnostic: makeDiag(
            'AUTH_NOT_VALIDATED',
            'Server-side WINDMILL_TOKEN is not configured. Live Windmill intake validation is UNAVAILABLE.'
          ),
        };
      }

      const endpoint = `${origin}/api/w/${encodeURIComponent(
        ALLOWED_WINDMILL_WORKSPACE
      )}/jobs/run_wait_result/p/${FIXED_INTAKE_VALIDATE_SCRIPT_PATH}`;

      try {
        const res = await fetchFn(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            input: sanitized.input,
            ...sanitized.input,
          }),
        });

        if (res.status >= 300 && res.status < 400) {
          return {
            ok: false,
            outcome: 'UNAVAILABLE',
            valid: false,
            errors: {},
            validatedAt: null,
            sideEffectsExecuted: false,
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            diagnostic: makeDiag(
              'NOT_CONNECTED',
              `Refused HTTP ${res.status} redirect from Windmill intake validation endpoint.`
            ),
          };
        }

        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            outcome: 'UNAVAILABLE',
            valid: false,
            errors: {},
            validatedAt: null,
            sideEffectsExecuted: false,
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            diagnostic: makeDiag(
              'AUTH_NOT_VALIDATED',
              `Windmill rejected intake validation credentials or permissions (HTTP ${res.status}) for workspace "${ALLOWED_WINDMILL_WORKSPACE}".`
            ),
          };
        }

        if (!res.ok) {
          const safeErr = redactServerWindmillToken(await res.text(), token);
          return {
            ok: false,
            outcome: 'UNAVAILABLE',
            valid: false,
            errors: {},
            validatedAt: null,
            sideEffectsExecuted: false,
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            diagnostic: makeDiag(
              'NOT_CONNECTED',
              `Windmill u/admin/intake_validate failed closed (HTTP ${res.status}): ${safeErr}`
            ),
          };
        }

        const payload = (await res.json()) as Record<string, unknown>;
        if (
          !payload ||
          typeof payload !== 'object' ||
          typeof payload.valid !== 'boolean' ||
          payload.sideEffectsExecuted !== false
        ) {
          return {
            ok: false,
            outcome: 'UNAVAILABLE',
            valid: false,
            errors: {},
            validatedAt: null,
            sideEffectsExecuted: false,
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            diagnostic: makeDiag(
              'NOT_CONNECTED',
              'Windmill u/admin/intake_validate returned an invalid contract payload or failed sideEffectsExecuted:false guarantee.'
            ),
          };
        }

        const rawErrors =
          payload.errors &&
          typeof payload.errors === 'object' &&
          !Array.isArray(payload.errors)
            ? (payload.errors as Record<string, unknown>)
            : {};
        const cleanErrors: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawErrors)) {
          cleanErrors[k] = redactServerWindmillToken(String(v ?? ''), token);
        }

        const valid = payload.valid === true && Object.keys(cleanErrors).length === 0;
        const validatedAt =
          typeof payload.validatedAt === 'string' && payload.validatedAt.trim().length > 0
            ? payload.validatedAt
            : new Date().toISOString();

        return {
          ok: true,
          outcome: valid ? 'LIVE VALIDATION' : 'REJECTED',
          valid,
          errors: cleanErrors,
          validatedAt,
          sideEffectsExecuted: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          ...(typeof payload.sourcePackageValidated === 'boolean'
            ? { sourcePackageValidated: payload.sourcePackageValidated }
            : {}),
          ...(typeof payload.verifiedFileCount === 'number'
            ? { verifiedFileCount: payload.verifiedFileCount }
            : {}),
        };
      } catch (err) {
        const safeErr = redactServerWindmillToken(
          err instanceof Error ? err.message : String(err),
          token
        );
        return {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          diagnostic: makeDiag(
            'NOT_CONNECTED',
            `Live Windmill intake validation at ${origin} failed: ${safeErr}`
          ),
        };
      }
    },
  };
}

/**
 * Browser-safe proxy transport that queries same-origin `/api/windmill/*` routes
 * exposed by the local server adapter. Zero credentials in browser code.
 */
export function createBrowserProxyWindmillTransport(
  options: { fetchImpl?: typeof fetch; proxyBasePath?: string } = {}
): WindmillReadOnlyRuntimeTransport {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const basePath = (options.proxyBasePath ?? '/api/windmill').replace(/\/+$/, '');

  return {
    async probeHealth(): Promise<WindmillReadOnlyHealthProbeResult> {
      if (typeof fetchFn !== 'function') {
        return {
          reachable: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          authenticated: false,
          permissionsValidated: false,
          diagnosticMessage: 'Browser fetch API is unavailable.',
        };
      }
      try {
        const res = await fetchFn(`${basePath}/health`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          return {
            reachable: false,
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            authenticated: false,
            permissionsValidated: false,
            diagnosticMessage: `Local Windmill proxy returned HTTP ${res.status}.`,
          };
        }
        return (await res.json()) as WindmillReadOnlyHealthProbeResult;
      } catch {
        return {
          reachable: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          authenticated: false,
          permissionsValidated: false,
          diagnosticMessage:
            'Local Windmill proxy (/api/windmill/health) is unreachable. Live Windmill is UNAVAILABLE.',
        };
      }
    },

    async listJobs(projectId?: string) {
      if (typeof fetchFn !== 'function') {
        return {
          ok: false as const,
          code: 'NOT_CONNECTED' as const,
          message: 'Browser fetch API is unavailable.',
        };
      }
      try {
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
        const res = await fetchFn(`${basePath}/jobs${query}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const payload = (await res.json()) as
          | { ok: true; workspace: string; records: WindmillJobRecord[] }
          | { ok: false; code: WindmillConnectionDiagnostic['code']; message: string };
        return payload;
      } catch {
        return {
          ok: false as const,
          code: 'NOT_CONNECTED' as const,
          message:
            'Local Windmill proxy (/api/windmill/jobs) is unreachable. Live job history is UNAVAILABLE.',
        };
      }
    },

    async fetchJobById(
      jobId: string
    ): Promise<WindmillReadOnlyJobFetchSuccess | WindmillReadOnlyJobFetchFailure> {
      if (typeof fetchFn !== 'function') {
        return {
          ok: false,
          code: 'NOT_CONNECTED',
          message: 'Browser fetch API is unavailable.',
        };
      }
      try {
        const res = await fetchFn(
          `${basePath}/jobs/${encodeURIComponent(jobId.trim())}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
          }
        );
        return (await res.json()) as
          | WindmillReadOnlyJobFetchSuccess
          | WindmillReadOnlyJobFetchFailure;
      } catch {
        return {
          ok: false,
          code: 'NOT_CONNECTED',
          message: `Local Windmill proxy (/api/windmill/jobs/${jobId}) is unreachable. Live job status is UNAVAILABLE.`,
        };
      }
    },

    async validateIntake(
      input: WindmillIntakeValidationInput
    ): Promise<WindmillIntakeValidationResult> {
      if (typeof fetchFn !== 'function') {
        return {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          diagnostic: {
            timestamp: new Date().toISOString(),
            endpoint: `${basePath}/intake/validate`,
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            code: 'NOT_CONNECTED',
            message: 'Browser fetch API is unavailable.',
            browserNavigatorOnline: false,
          },
        };
      }
      try {
        const res = await fetchFn(`${basePath}/intake/validate`, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(input),
        });
        const payload = (await res.json()) as WindmillIntakeValidationResult;
        if (
          payload &&
          typeof payload === 'object' &&
          payload.sideEffectsExecuted === false &&
          typeof payload.outcome === 'string'
        ) {
          return payload;
        }
        return {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          diagnostic: {
            timestamp: new Date().toISOString(),
            endpoint: `${basePath}/intake/validate`,
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            code: 'NOT_CONNECTED',
            message: `Local Windmill intake proxy returned unexpected status HTTP ${res.status}.`,
            browserNavigatorOnline:
              typeof navigator !== 'undefined' ? navigator.onLine : false,
          },
        };
      } catch {
        return {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          diagnostic: {
            timestamp: new Date().toISOString(),
            endpoint: `${basePath}/intake/validate`,
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            code: 'NOT_CONNECTED',
            message:
              'Local Windmill proxy (/api/windmill/intake/validate) is unreachable. Live intake validation is UNAVAILABLE.',
            browserNavigatorOnline:
              typeof navigator !== 'undefined' ? navigator.onLine : false,
          },
        };
      }
    },
  };
}

export interface WindmillProxyHttpDispatchResult {
  statusCode: number;
  body: Record<string, unknown>;
}

/**
 * Narrowly scoped server-side HTTP route dispatcher for `/api/windmill/*`.
 *
 * - `POST` is permitted ONLY for `/api/windmill/intake/validate` (non-executing intake validation).
 * - `GET` is permitted ONLY for `/api/windmill/health`, `/api/windmill/jobs`, and `/api/windmill/jobs/:jobId`.
 * - All other HTTP methods or arbitrary dispatch paths fail closed with HTTP 405 or 404.
 */
export async function dispatchWindmillProxyRoute(params: {
  method: string;
  url: string;
  rawBody?: string;
  transport: WindmillReadOnlyRuntimeTransport;
  maxBodyBytes?: number;
}): Promise<WindmillProxyHttpDispatchResult> {
  const method = (params.method ?? 'GET').toUpperCase();
  const parsed = new URL(params.url || '/', 'http://127.0.0.1:3000');
  const pathname = parsed.pathname.replace(/\/+$/, '');

  // Narrowly scoped POST route: ONLY /api/windmill/intake/validate
  if (pathname === '/api/windmill/intake/validate') {
    if (method !== 'POST') {
      return {
        statusCode: 405,
        body: {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          code: 'SANDBOX_ISOLATED',
          message:
            'Only POST is permitted on /api/windmill/intake/validate.',
        },
      };
    }

    const sanitized = validateAndSanitizeIntakeProxyRequest(
      params.rawBody ?? '',
      params.maxBodyBytes ?? MAX_INTAKE_VALIDATE_BODY_BYTES
    );

    if (!sanitized.ok) {
      return {
        statusCode: sanitized.httpStatus,
        body: {
          ok: false,
          outcome:
            sanitized.code === 'UNAUTHORIZED_WORKSPACE'
              ? 'UNAVAILABLE'
              : 'REJECTED',
          valid: false,
          errors: { _payload: sanitized.message },
          validatedAt: new Date().toISOString(),
          sideEffectsExecuted: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          diagnostic: {
            timestamp: new Date().toISOString(),
            endpoint: '/api/windmill/intake/validate',
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            code:
              sanitized.code === 'UNAUTHORIZED_WORKSPACE'
                ? 'AUTH_NOT_VALIDATED'
                : 'SANDBOX_ISOLATED',
            message: sanitized.message,
            browserNavigatorOnline: false,
          },
        },
      };
    }

    if (typeof params.transport.validateIntake !== 'function') {
      return {
        statusCode: 503,
        body: {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: ALLOWED_WINDMILL_WORKSPACE,
          diagnostic: {
            timestamp: new Date().toISOString(),
            endpoint: '/api/windmill/intake/validate',
            workspace: ALLOWED_WINDMILL_WORKSPACE,
            code: 'NOT_CONNECTED',
            message: 'Server-side intake validation transport is unavailable.',
            browserNavigatorOnline: false,
          },
        },
      };
    }

    const result = await params.transport.validateIntake(sanitized.input);
    const statusCode = result.ok
      ? 200
      : result.diagnostic?.code === 'AUTH_NOT_VALIDATED'
        ? 403
        : 503;

    return {
      statusCode,
      body: result as unknown as Record<string, unknown>,
    };
  }

  // All other /api/windmill/* endpoints are strictly GET-only
  if (method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        ok: false,
        code: 'SANDBOX_ISOLATED',
        message:
          'Only read-only GET requests are permitted on /api/windmill/* (except POST /api/windmill/intake/validate). Compiler execution, workflow dispatch, triggers, and release remain disabled.',
      },
    };
  }

  if (pathname === '/api/windmill/health') {
    const health = await params.transport.probeHealth();
    return {
      statusCode: 200,
      body: health as unknown as Record<string, unknown>,
    };
  }

  if (pathname === '/api/windmill/jobs') {
    const projectId = parsed.searchParams.get('projectId') ?? undefined;
    const listResult = await params.transport.listJobs!(projectId);
    return {
      statusCode: 200,
      body: listResult as unknown as Record<string, unknown>,
    };
  }

  const jobMatch = pathname.match(/^\/api\/windmill\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    const jobResult = await params.transport.fetchJobById(jobId);
    return {
      statusCode: 200,
      body: jobResult as unknown as Record<string, unknown>,
    };
  }

  return {
    statusCode: 404,
    body: {
      ok: false,
      code: 'NOT_CONNECTED',
      message: `Unknown read-only Windmill adapter endpoint: ${pathname}`,
    },
  };
}

