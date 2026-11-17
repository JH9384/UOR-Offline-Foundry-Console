import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  AuthoritativeEvidenceLifecycleState,
  FoundrySourcePackageManifest,
  IntegrationMode,
  ProjectRecord,
  VerifiedEvidenceRef,
  VerificationSuiteRecord,
  WindmillConnectionDiagnostic,
  WindmillDeploymentOption,
  WindmillExecutionRequest,
  WindmillHealthStatus,
  WindmillJobIdentity,
  WindmillJobRecord,
  WindmillJobState,
} from '../types/foundry';
import { WINDMILL_ENDPOINTS, WINDMILL_TARGET_CONFIG } from './windmillAdapter';
import {
  ALLOWED_WINDMILL_WORKSPACE,
  buildValidatedCommandArgv,
  CANONICAL_COMMAND_BY_ID,
  CanonicalCommandId,
  FIXED_WINDMILL_COMMAND_REGISTRY,
  validateFixedRegistryCommand,
} from './windmillCommandRegistry';
import { evaluateProjectOfflineClosure } from '../services/holoArchiveValidator';
import {
  buildCalculatorRuntimeHandoffPreview,
  CalculatorRuntimeHandoffPreview,
  SourcePackageRuntimeHandoffValidationResult,
  validateSourcePackageForRuntimeHandoff,
} from '../services/sourceAuthoringService';
import {
  AuthorityTrustContext,
  verificationAuthorityService,
} from '../services/verificationAuthorityService';

/**
 * Layer 4: Windmill Execution Services Interface.
 *
 * Designed for both deployment targets:
 *   A) Vite/React + authenticated local backend proxy (no tokens in browser)
 *   B) Windmill-native full-code app using generated `wmill.ts` backend bindings
 *
 * Real LOCAL mode remains unavailable until endpoints, authentication, and workspace
 * permissions for `uor-offline-foundry` are validated by a trusted local runtime.
 */
export interface WindmillExecutionService {
  readonly mode: IntegrationMode;
  readonly deploymentOption: WindmillDeploymentOption;
  readonly workspace: string;

  getLastVerifiedHealth?(): WindmillHealthStatus | null;
  checkRuntimeHealth(): Promise<WindmillHealthStatus>;
  validateIntakeLocally?(
    input: WindmillIntakeValidationInput
  ): Promise<WindmillIntakeValidationResult>;
  submitAuthorizedWorkflow(
    request: WindmillExecutionRequest
  ): Promise<{ ok: true; job: WindmillJobIdentity } | { ok: false; diagnostic: WindmillConnectionDiagnostic }>;
  getJobStatusAndResult(
    jobId: string
  ): Promise<{ ok: true; record: WindmillJobRecord } | { ok: false; diagnostic: WindmillConnectionDiagnostic }>;
  listApprovedExecutionHistory(
    projectId?: string
  ): Promise<{ ok: boolean; records: WindmillJobRecord[]; diagnostic?: WindmillConnectionDiagnostic }>;
  readVerifiedEvidenceRefs(
    projectId: string
  ): Promise<{ ok: boolean; evidence: VerifiedEvidenceRef[]; diagnostic?: WindmillConnectionDiagnostic }>;
  reportConnectionFailure(
    code: WindmillConnectionDiagnostic['code'],
    reason: string
  ): WindmillConnectionDiagnostic;
}

export interface WindmillSourcePackageSummaryInput {
  schema: string;
  packageId: string;
  packageClassification: string;
  isHoloArchive: boolean;
  reviewConfirmed: boolean;
  targetWindmillWorkspace: string;
  packageDigestSha256: string;
  expectedPackageDigestSha256?: string;
  lockfileRefs: string[];
  files: Array<{
    path: string;
    sha256: string;
    expectedSha256?: string;
  }>;
}

export interface WindmillIntakeValidationInput {
  projectName: string;
  productFamily: string;
  componentId: string;
  workflowId: string;
  purpose: string;
  declaredInputs: string;
  environmentDeclaration: string;
  sourceRevision: string;
  acknowledgeBoundary: boolean;
  sourcePackage?: WindmillSourcePackageSummaryInput;
}

export type WindmillIntakeValidationOutcome =
  | 'LIVE VALIDATION'
  | 'DEMO'
  | 'UNAVAILABLE'
  | 'REJECTED';

export interface WindmillIntakeValidationResult {
  ok: boolean;
  outcome: WindmillIntakeValidationOutcome;
  valid: boolean;
  errors: Record<string, string>;
  validatedAt: string | null;
  sideEffectsExecuted: false;
  workspace: string;
  sourcePackageValidated?: boolean;
  verifiedFileCount?: number;
  diagnostic?: WindmillConnectionDiagnostic;
}

/**
 * Browser-local DEMO execution service.
 * Strictly separates synthetic fixtures from real Mac Studio Windmill job records.
 * Never invents live Windmill job IDs or claims unregistered flows exist on disk.
 */
export class DemoWindmillExecutionService implements WindmillExecutionService {
  readonly mode: IntegrationMode = 'DEMO';
  readonly deploymentOption: WindmillDeploymentOption = 'VITE_AUTHENTICATED_LOCAL_PROXY';
  readonly workspace = WINDMILL_TARGET_CONFIG.workspace;

  private readonly fixtures: WindmillJobRecord[];
  private readonly verifications: VerificationSuiteRecord[];
  private readonly artifacts: ArtifactProvenanceRecord[];

  constructor(params: {
    fixtures: WindmillJobRecord[];
    verifications: VerificationSuiteRecord[];
    artifacts: ArtifactProvenanceRecord[];
  }) {
    this.fixtures = params.fixtures;
    this.verifications = params.verifications;
    this.artifacts = params.artifacts;
  }

  async checkRuntimeHealth(): Promise<WindmillHealthStatus> {
    return {
      mode: 'DEMO',
      deploymentOption: this.deploymentOption,
      workspace: this.workspace,
      endpoint: WINDMILL_TARGET_CONFIG.baseUrl,
      reachable: false,
      authenticated: false,
      permissionsValidated: false,
      checkedAt: new Date().toISOString(),
      diagnosticMessage:
        'Running in browser-local DEMO mode. Self-hosted Windmill (http://127.0.0.1:8080) is NOT CONNECTED and browser internet connectivity does not imply local runtime availability.',
    };
  }

  async validateIntakeLocally(
    _input: WindmillIntakeValidationInput
  ): Promise<WindmillIntakeValidationResult> {
    return {
      ok: false,
      outcome: 'UNAVAILABLE',
      valid: false,
      errors: {},
      validatedAt: null,
      sideEffectsExecuted: false,
      workspace: this.workspace,
      diagnostic: this.reportConnectionFailure(
        'NOT_CONNECTED',
        'Local Windmill intake validation (u/admin/intake_validate) is UNAVAILABLE in DEMO mode. Simulated browser validation is never silently substituted for live Windmill validation.'
      ),
    };
  }

  async submitAuthorizedWorkflow(
    request: WindmillExecutionRequest
  ): Promise<{ ok: true; job: WindmillJobIdentity } | { ok: false; diagnostic: WindmillConnectionDiagnostic }> {
    const endpoint = `${WINDMILL_TARGET_CONFIG.baseUrl}${WINDMILL_ENDPOINTS.runFlowByPath(
      this.workspace,
      request.flowPath
    )}`;
    return {
      ok: false,
      diagnostic: {
        timestamp: new Date().toISOString(),
        endpoint,
        workspace: this.workspace,
        code: 'SANDBOX_ISOLATED',
        message:
          `Refused live Windmill dispatch (idempotencyKey: ${request.idempotencyKey}): ` +
          `DEMO mode cannot submit workflows to unregistered flow "${request.flowPath}". Use simulated stage stepping in Build mode instead.`,
        browserNavigatorOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,
      },
    };
  }

  async getJobStatusAndResult(
    jobId: string
  ): Promise<{ ok: true; record: WindmillJobRecord } | { ok: false; diagnostic: WindmillConnectionDiagnostic }> {
    const fixture = this.fixtures.find((f) => f.jobId === jobId);
    if (fixture) {
      return { ok: true, record: fixture };
    }
    return {
      ok: false,
      diagnostic: this.reportConnectionFailure(
        'NOT_CONNECTED',
        `Job "${jobId}" unavailable: live Windmill API is NOT CONNECTED.`
      ),
    };
  }

  async listApprovedExecutionHistory(
    projectId?: string
  ): Promise<{ ok: boolean; records: WindmillJobRecord[]; diagnostic?: WindmillConnectionDiagnostic }> {
    const records = projectId
      ? this.fixtures.filter((f) => f.projectId === projectId)
      : this.fixtures;
    return {
      ok: true,
      records,
      diagnostic: this.reportConnectionFailure(
        'NOT_CONNECTED',
        'Showing synthetic DEMO execution fixtures only. Live Windmill job history is NOT CONNECTED.'
      ),
    };
  }

  async readVerifiedEvidenceRefs(
    projectId: string
  ): Promise<{ ok: boolean; evidence: VerifiedEvidenceRef[]; diagnostic?: WindmillConnectionDiagnostic }> {
    const projectArtifacts = this.artifacts.filter((a) => a.projectId === projectId);
    const defaultDigest = projectArtifacts[0]?.sha256Digest ?? 'UNAVAILABLE';
    const evidence: VerifiedEvidenceRef[] = this.verifications
      .filter((v) => v.projectId === projectId)
      .map((v) => ({
        evidenceId: v.evidenceId,
        authority: v.authority,
        artifactDigest: v.artifactHash ?? defaultDigest,
        sourceRevision: v.sourceRevision,
        status: v.status,
        verifiedAt: v.lastCheckedAt,
        isAuthoritative: !v.isSimulated && v.status === 'PASS' && v.epistemicCondition === 'DOCUMENTED',
      }));

    return {
      ok: false,
      evidence,
      diagnostic: this.reportConnectionFailure(
        'NOT_CONNECTED',
        'Authoritative Windmill evidence store is NOT CONNECTED. Displaying local reference & simulated status only.'
      ),
    };
  }

  reportConnectionFailure(
    code: WindmillConnectionDiagnostic['code'],
    reason: string
  ): WindmillConnectionDiagnostic {
    return {
      timestamp: new Date().toISOString(),
      endpoint: WINDMILL_TARGET_CONFIG.baseUrl,
      workspace: this.workspace,
      code,
      message: reason,
      browserNavigatorOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,
    };
  }
}

export const REQUIRED_READONLY_RUNNABLES = [
  'backend/runtime_health.ts',
  'backend/intake_validate.ts',
  'backend/job_status.ts',
] as const;

export interface WindmillReadOnlyHealthProbeResult {
  reachable: boolean;
  workspace: string;
  authenticated: boolean;
  permissionsValidated: boolean;
  registeredRunnables?: string[];
  registeredFlows?: string[];
  wmillContractStatus?: WindmillHealthStatus['wmillContractStatus'];
  diagnosticMessage?: string;
}

export interface WindmillReadOnlyJobFetchSuccess {
  ok: true;
  workspace: string;
  sequence: number;
  updatedAt: string;
  record: WindmillJobRecord;
}

export interface WindmillReadOnlyJobFetchFailure {
  ok: false;
  code: WindmillConnectionDiagnostic['code'];
  message: string;
}

export interface WindmillReadOnlyRuntimeTransport {
  probeHealth(): Promise<WindmillReadOnlyHealthProbeResult>;
  validateIntake?(
    input: WindmillIntakeValidationInput
  ): Promise<WindmillIntakeValidationResult>;
  fetchJobById(
    jobId: string
  ): Promise<WindmillReadOnlyJobFetchSuccess | WindmillReadOnlyJobFetchFailure>;
  listJobs?(
    projectId?: string
  ): Promise<
    | { ok: true; workspace: string; records: WindmillJobRecord[] }
    | { ok: false; code: WindmillConnectionDiagnostic['code']; message: string }
  >;
  fetchVerifiedEvidence?(
    projectId: string
  ): Promise<
    | { ok: true; workspace: string; evidence: VerifiedEvidenceRef[] }
    | { ok: false; code: WindmillConnectionDiagnostic['code']; message: string }
  >;
  dispatchFlow?(
    request: WindmillExecutionRequest & {
      commandId?: CanonicalCommandId;
      validatedArgv?: string[];
      sourcePackageDigest?: string;
    }
  ): Promise<
    | { ok: true; job: WindmillJobIdentity }
    | { ok: false; code: WindmillConnectionDiagnostic['code']; message: string }
  >;
}

/**
 * Fail-closed structural adapter for Option A (authenticated local backend proxy)
 * and Option B (Windmill-native `wmill.ts` full-code app bindings).
 * Keeps zero credentials in frontend code or browser storage.
 *
 * Enforces Phase A rules:
 * 1) Real read-only runtime health and runnable/flow registration check must succeed before dispatch.
 * 2) Rejects unreachable runtime, unauthorized workspace/credentials, missing flow registrations,
 *    invalid source-package hashes, and duplicate or stale out-of-order job responses.
 */
export class FailClosedLocalWindmillService implements WindmillExecutionService {
  readonly mode: IntegrationMode = 'LOCAL';
  readonly deploymentOption: WindmillDeploymentOption;
  readonly workspace = WINDMILL_TARGET_CONFIG.workspace;
  private readonly submittedIdempotencyKeys = new Set<string>();
  private readonly jobResponseWatermarks = new Map<
    string,
    { sequence: number; updatedAt: string; state: WindmillJobState; responseSignatures: Set<string> }
  >();
  private lastHealthStatus: WindmillHealthStatus | null = null;
  private transport?: WindmillReadOnlyRuntimeTransport;

  constructor(
    deploymentOption: WindmillDeploymentOption = 'VITE_AUTHENTICATED_LOCAL_PROXY',
    transport?: WindmillReadOnlyRuntimeTransport
  ) {
    this.deploymentOption = deploymentOption;
    this.transport = transport;
  }

  bindTransport(transport?: WindmillReadOnlyRuntimeTransport): void {
    this.transport = transport;
    this.lastHealthStatus = null;
  }

  getLastVerifiedHealth(): WindmillHealthStatus | null {
    return this.lastHealthStatus;
  }

  async checkRuntimeHealth(): Promise<WindmillHealthStatus> {
    const endpointLabel =
      this.deploymentOption === 'WINDMILL_NATIVE_WMILL_TS'
        ? 'wmill.ts (Windmill Workspace Session)'
        : '/api/windmill/health -> http://127.0.0.1:8080';

    if (!this.transport) {
      const status: WindmillHealthStatus = {
        mode: 'LOCAL',
        deploymentOption: this.deploymentOption,
        workspace: this.workspace,
        endpoint: endpointLabel,
        reachable: false,
        authenticated: false,
        permissionsValidated: false,
        checkedAt: new Date().toISOString(),
        registeredRunnables: [],
        registeredFlows: [],
        wmillContractStatus: 'WMILL_TS_NOT_GENERATED',
        readOnlyHealthVerified: false,
        dispatchEnabled: false,
        diagnosticMessage:
          'LOCAL mode remains unavailable: endpoint authentication and workspace permissions for "uor-offline-foundry" have not been validated.',
      };
      this.lastHealthStatus = status;
      return status;
    }

    try {
      const probe = await this.transport.probeHealth();
      if (!probe.reachable) {
        const status: WindmillHealthStatus = {
          mode: 'LOCAL',
          deploymentOption: this.deploymentOption,
          workspace: this.workspace,
          endpoint: endpointLabel,
          reachable: false,
          authenticated: false,
          permissionsValidated: false,
          checkedAt: new Date().toISOString(),
          registeredRunnables: [],
          registeredFlows: [],
          wmillContractStatus: probe.wmillContractStatus ?? 'WMILL_TS_NOT_GENERATED',
          readOnlyHealthVerified: false,
          dispatchEnabled: false,
          diagnosticMessage:
            probe.diagnosticMessage ??
            'LOCAL Windmill runtime at http://127.0.0.1:8080 is unreachable.',
        };
        this.lastHealthStatus = status;
        return status;
      }

      if (probe.workspace !== ALLOWED_WINDMILL_WORKSPACE) {
        const status: WindmillHealthStatus = {
          mode: 'LOCAL',
          deploymentOption: this.deploymentOption,
          workspace: probe.workspace,
          endpoint: endpointLabel,
          reachable: true,
          authenticated: false,
          permissionsValidated: false,
          checkedAt: new Date().toISOString(),
          registeredRunnables: probe.registeredRunnables ?? [],
          registeredFlows: probe.registeredFlows ?? [],
          wmillContractStatus: probe.wmillContractStatus,
          readOnlyHealthVerified: false,
          dispatchEnabled: false,
          diagnosticMessage: `Refused unauthorized Windmill workspace "${probe.workspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
        };
        this.lastHealthStatus = status;
        return status;
      }

      if (!probe.authenticated || !probe.permissionsValidated) {
        const status: WindmillHealthStatus = {
          mode: 'LOCAL',
          deploymentOption: this.deploymentOption,
          workspace: this.workspace,
          endpoint: endpointLabel,
          reachable: true,
          authenticated: Boolean(probe.authenticated),
          permissionsValidated: Boolean(probe.permissionsValidated),
          checkedAt: new Date().toISOString(),
          registeredRunnables: probe.registeredRunnables ?? [],
          registeredFlows: probe.registeredFlows ?? [],
          wmillContractStatus: probe.wmillContractStatus,
          readOnlyHealthVerified: false,
          dispatchEnabled: false,
          diagnosticMessage:
            probe.diagnosticMessage ??
            `Windmill credentials or workspace RBAC permissions for "${ALLOWED_WINDMILL_WORKSPACE}" failed validation.`,
        };
        this.lastHealthStatus = status;
        return status;
      }

      const registeredRunnables = probe.registeredRunnables ?? [];
      const registeredFlows = probe.registeredFlows ?? [];
      const hasReadOnlyRunnables = REQUIRED_READONLY_RUNNABLES.every((r) =>
        registeredRunnables.includes(r)
      );

      const status: WindmillHealthStatus = {
        mode: 'LOCAL',
        deploymentOption: this.deploymentOption,
        workspace: this.workspace,
        endpoint: endpointLabel,
        reachable: true,
        authenticated: true,
        permissionsValidated: true,
        checkedAt: new Date().toISOString(),
        registeredRunnables,
        registeredFlows,
        wmillContractStatus:
          probe.wmillContractStatus ??
          (this.deploymentOption === 'WINDMILL_NATIVE_WMILL_TS'
            ? 'WMILL_CONTRACT_VALIDATED'
            : 'LOCAL_PROXY_VALIDATED'),
        readOnlyHealthVerified: hasReadOnlyRunnables,
        dispatchEnabled: hasReadOnlyRunnables && registeredFlows.length > 0,
        diagnosticMessage:
          probe.diagnosticMessage ??
          `Authenticated LOCAL connection to "${this.workspace}" verified (${registeredRunnables.length} runnable(s), ${registeredFlows.length} flow(s) registered).`,
      };
      this.lastHealthStatus = status;
      return status;
    } catch (err) {
      const status: WindmillHealthStatus = {
        mode: 'LOCAL',
        deploymentOption: this.deploymentOption,
        workspace: this.workspace,
        endpoint: endpointLabel,
        reachable: false,
        authenticated: false,
        permissionsValidated: false,
        checkedAt: new Date().toISOString(),
        registeredRunnables: [],
        registeredFlows: [],
        readOnlyHealthVerified: false,
        dispatchEnabled: false,
        diagnosticMessage: `Windmill health probe error: ${err instanceof Error ? err.message : String(err)}`,
      };
      this.lastHealthStatus = status;
      return status;
    }
  }

  async submitAuthorizedWorkflow(
    request: WindmillExecutionRequest & {
      commandId?: string;
      rawCommandString?: string;
      projectRelativePath?: string;
      sourcePackage?: string | FoundrySourcePackageManifest;
    }
  ): Promise<{ ok: true; job: WindmillJobIdentity } | { ok: false; diagnostic: WindmillConnectionDiagnostic }> {
    let validatedArgv: string[] | undefined;

    if (request.rawCommandString || request.commandId) {
      const cmdCheck = validateFixedRegistryCommand({
        commandId: request.commandId,
        rawCommandString: request.rawCommandString,
        projectRelativePath: request.projectRelativePath ?? 'examples/Calculator',
        sourceRevision: request.sourceRevision,
      });
      if (!cmdCheck.allowed) {
        return {
          ok: false,
          diagnostic: this.reportConnectionFailure('SANDBOX_ISOLATED', cmdCheck.reason),
        };
      }
      validatedArgv = cmdCheck.validatedArgv;
    }

    if (request.sourcePackage !== undefined) {
      const pkgValidation = await validateSourcePackageForRuntimeHandoff({
        rawOrManifest: request.sourcePackage,
        expectedWorkspace: this.workspace,
      });
      if (!pkgValidation.valid) {
        return {
          ok: false,
          diagnostic: this.reportConnectionFailure(
            pkgValidation.failureCode === 'WORKSPACE_MISMATCH'
              ? 'AUTH_NOT_VALIDATED'
              : 'INVALID_SOURCE_PACKAGE_HASH',
            `Refused source-package handoff: ${pkgValidation.errors.join('; ')}`
          ),
        };
      }
    }

    if (this.submittedIdempotencyKeys.has(request.idempotencyKey)) {
      return {
        ok: false,
        diagnostic: this.reportConnectionFailure(
          'AUTH_NOT_VALIDATED',
          `Duplicate dispatch blocked by idempotency key "${request.idempotencyKey}".`
        ),
      };
    }

    if (!this.transport) {
      return {
        ok: false,
        diagnostic: this.reportConnectionFailure(
          'AUTH_NOT_VALIDATED',
          `Cannot submit "${request.flowPath}": LOCAL Windmill backend authentication and flow registration are not validated.`
        ),
      };
    }

    // Require read-only runtime health to be verified before enabling dispatch
    const health = this.lastHealthStatus ?? (await this.checkRuntimeHealth());
    if (!health.reachable) {
      return {
        ok: false,
        diagnostic: this.reportConnectionFailure(
          'NOT_CONNECTED',
          `Cannot submit "${request.flowPath}": Windmill runtime is unreachable.`
        ),
      };
    }
    if (
      health.workspace !== ALLOWED_WINDMILL_WORKSPACE ||
      !health.authenticated ||
      !health.permissionsValidated
    ) {
      return {
        ok: false,
        diagnostic: this.reportConnectionFailure(
          'AUTH_NOT_VALIDATED',
          health.diagnosticMessage ||
            `Cannot submit "${request.flowPath}": workspace or credentials not validated.`
        ),
      };
    }

    const registeredFlows = health.registeredFlows ?? [];
    if (!registeredFlows.includes(request.flowPath)) {
      return {
        ok: false,
        diagnostic: this.reportConnectionFailure(
          'FLOW_UNREGISTERED',
          `Refused dispatch: Windmill flow "${request.flowPath}" is not registered in workspace "${this.workspace}".`
        ),
      };
    }

    if (!request.operatorApproved) {
      return {
        ok: false,
        diagnostic: this.reportConnectionFailure(
          'AUTH_NOT_VALIDATED',
          `Refused dispatch for "${request.flowPath}": explicit human operator approval is required.`
        ),
      };
    }

    if (typeof this.transport.dispatchFlow !== 'function') {
      return {
        ok: false,
        diagnostic: this.reportConnectionFailure(
          'FLOW_UNREGISTERED',
          `Read-only connection verified for "${this.workspace}", but workflow dispatch binding is not enabled on this transport.`
        ),
      };
    }

    const dispatchRes = await this.transport.dispatchFlow({
      ...request,
      commandId: request.commandId as CanonicalCommandId | undefined,
      validatedArgv,
    });
    if (!dispatchRes.ok) {
      return {
        ok: false,
        diagnostic: this.reportConnectionFailure(dispatchRes.code, dispatchRes.message),
      };
    }

    this.submittedIdempotencyKeys.add(request.idempotencyKey);
    return {
      ok: true,
      job: dispatchRes.job,
    };
  }

  async getJobStatusAndResult(
    jobId: string
  ): Promise<{ ok: true; record: WindmillJobRecord } | { ok: false; diagnostic: WindmillConnectionDiagnostic }> {
    if (!this.transport) {
      return {
        ok: false as const,
        diagnostic: this.reportConnectionFailure(
          'NOT_CONNECTED',
          `Cannot query Windmill job "${jobId}" because LOCAL runtime is unvalidated.`
        ),
      };
    }

    const health = this.lastHealthStatus ?? (await this.checkRuntimeHealth());
    if (!health.reachable) {
      return {
        ok: false as const,
        diagnostic: this.reportConnectionFailure(
          'NOT_CONNECTED',
          `Cannot retrieve job "${jobId}": Windmill runtime is unreachable.`
        ),
      };
    }
    if (
      health.workspace !== ALLOWED_WINDMILL_WORKSPACE ||
      !health.authenticated ||
      !health.permissionsValidated
    ) {
      return {
        ok: false as const,
        diagnostic: this.reportConnectionFailure(
          'AUTH_NOT_VALIDATED',
          `Cannot retrieve job "${jobId}": unauthorized workspace or invalid credentials.`
        ),
      };
    }

    const res = await this.transport.fetchJobById(jobId);
    if (!res.ok) {
      return {
        ok: false as const,
        diagnostic: this.reportConnectionFailure(res.code, res.message),
      };
    }

    if (res.workspace !== ALLOWED_WINDMILL_WORKSPACE) {
      return {
        ok: false as const,
        diagnostic: this.reportConnectionFailure(
          'AUTH_NOT_VALIDATED',
          `Refused job response from unauthorized workspace "${res.workspace}".`
        ),
      };
    }

    const sig = `${res.record.jobId}:${res.sequence}:${res.updatedAt}:${res.record.state}`;
    const prev = this.jobResponseWatermarks.get(jobId);
    if (prev) {
      if (prev.responseSignatures.has(sig)) {
        return {
          ok: false as const,
          diagnostic: this.reportConnectionFailure(
            'DUPLICATE_JOB_RESPONSE',
            `Rejected duplicate job response (${sig}) for job "${jobId}".`
          ),
        };
      }
      const prevTs = Date.parse(prev.updatedAt);
      const nextTs = Date.parse(res.updatedAt);
      const isTerminalState =
        prev.state === 'COMPLETED' || prev.state === 'FAILED' || prev.state === 'CANCELLED';
      const regressedFromTerminal =
        isTerminalState && (res.record.state === 'QUEUED' || res.record.state === 'RUNNING');

      if (
        res.sequence < prev.sequence ||
        (!Number.isNaN(prevTs) && !Number.isNaN(nextTs) && nextTs < prevTs) ||
        regressedFromTerminal
      ) {
        return {
          ok: false as const,
          diagnostic: this.reportConnectionFailure(
            'STALE_JOB_RESPONSE',
            `Rejected stale or regressed job response for "${jobId}" (seq ${res.sequence} @ ${res.updatedAt} after seq ${prev.sequence} @ ${prev.updatedAt}).`
          ),
        };
      }
      prev.sequence = res.sequence;
      prev.updatedAt = res.updatedAt;
      prev.state = res.record.state;
      prev.responseSignatures.add(sig);
    } else {
      this.jobResponseWatermarks.set(jobId, {
        sequence: res.sequence,
        updatedAt: res.updatedAt,
        state: res.record.state,
        responseSignatures: new Set([sig]),
      });
    }

    return {
      ok: true,
      record: {
        ...res.record,
        isSyntheticFixture: false,
      },
    };
  }

  async listApprovedExecutionHistory(projectId?: string) {
    if (!this.transport || typeof this.transport.listJobs !== 'function') {
      return {
        ok: false,
        records: [] as WindmillJobRecord[],
        diagnostic: this.reportConnectionFailure(
          'NOT_CONNECTED',
          'No approved live Windmill execution history available while LOCAL runtime is disconnected.'
        ),
      };
    }

    const health = this.lastHealthStatus ?? (await this.checkRuntimeHealth());
    if (!health.reachable || !health.authenticated || !health.permissionsValidated) {
      return {
        ok: false,
        records: [] as WindmillJobRecord[],
        diagnostic: this.reportConnectionFailure(
          health.reachable ? 'AUTH_NOT_VALIDATED' : 'NOT_CONNECTED',
          health.diagnosticMessage
        ),
      };
    }

    const res = await this.transport.listJobs(projectId);
    if (!res.ok) {
      return {
        ok: false,
        records: [] as WindmillJobRecord[],
        diagnostic: this.reportConnectionFailure(res.code, res.message),
      };
    }
    return {
      ok: true,
      records: res.records.map((r) => ({ ...r, isSyntheticFixture: false })),
    };
  }

  async readVerifiedEvidenceRefs(projectId: string) {
    if (!this.transport || typeof this.transport.fetchVerifiedEvidence !== 'function') {
      return {
        ok: false,
        evidence: [] as VerifiedEvidenceRef[],
        diagnostic: this.reportConnectionFailure(
          'NOT_CONNECTED',
          'Authoritative Windmill evidence store is unreachable.'
        ),
      };
    }

    const health = this.lastHealthStatus ?? (await this.checkRuntimeHealth());
    if (!health.reachable || !health.authenticated || !health.permissionsValidated) {
      return {
        ok: false,
        evidence: [] as VerifiedEvidenceRef[],
        diagnostic: this.reportConnectionFailure(
          health.reachable ? 'AUTH_NOT_VALIDATED' : 'NOT_CONNECTED',
          health.diagnosticMessage
        ),
      };
    }

    const res = await this.transport.fetchVerifiedEvidence(projectId);
    if (!res.ok) {
      return {
        ok: false,
        evidence: [] as VerifiedEvidenceRef[],
        diagnostic: this.reportConnectionFailure(res.code, res.message),
      };
    }
    return {
      ok: true,
      evidence: res.evidence,
    };
  }

  async validateIntakeLocally(
    input: WindmillIntakeValidationInput
  ): Promise<WindmillIntakeValidationResult> {
    if (!this.transport || typeof this.transport.validateIntake !== 'function') {
      return {
        ok: false,
        outcome: 'UNAVAILABLE',
        valid: false,
        errors: {},
        validatedAt: null,
        sideEffectsExecuted: false,
        workspace: this.workspace,
        diagnostic: this.reportConnectionFailure(
          'NOT_CONNECTED',
          'Local Windmill intake validation transport is not configured.'
        ),
      };
    }

    if (this.workspace !== ALLOWED_WINDMILL_WORKSPACE) {
      return {
        ok: false,
        outcome: 'UNAVAILABLE',
        valid: false,
        errors: {},
        validatedAt: null,
        sideEffectsExecuted: false,
        workspace: this.workspace,
        diagnostic: this.reportConnectionFailure(
          'AUTH_NOT_VALIDATED',
          `Refused intake validation for unauthorized workspace "${this.workspace}".`
        ),
      };
    }

    return this.transport.validateIntake(input);
  }

  reportConnectionFailure(
    code: WindmillConnectionDiagnostic['code'],
    reason: string
  ): WindmillConnectionDiagnostic {
    return {
      timestamp: new Date().toISOString(),
      endpoint: WINDMILL_TARGET_CONFIG.baseUrl,
      workspace: this.workspace,
      code,
      message: reason,
      browserNavigatorOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,
    };
  }
}

export interface UorustWorkspaceModelContract {
  flowPath: 'f/uor_foundry/uorust_model_workspace';
  targetWorkspace: string;
  flowRegisteredInWorkspace: false;
  browserCargoExecutionAllowed: false;
  request: WindmillExecutionRequest;
  preconditions: string[];
  failClosedNotice: string;
}

/**
 * Prepares the future Windmill job contract for modeling an existing Rust workspace
 * with afflom/UORust without executing arbitrary Cargo build scripts in-browser.
 */
export function prepareRustWorkspaceModelContract(params: {
  projectId: string;
  sourceRevision: string;
  declaredInputs: string;
}): UorustWorkspaceModelContract {
  const safeRevision = params.sourceRevision.trim() || 'UNSPECIFIED';
  const requestedAt = new Date().toISOString();
  return {
    flowPath: 'f/uor_foundry/uorust_model_workspace',
    targetWorkspace: WINDMILL_TARGET_CONFIG.workspace,
    flowRegisteredInWorkspace: false,
    browserCargoExecutionAllowed: false,
    request: {
      requestId: `req-uorust-${params.projectId}`,
      idempotencyKey: `uorust-model:${params.projectId}:${safeRevision}`,
      projectId: params.projectId,
      workflowId: 'wf-uorust-modeling',
      flowPath: 'f/uor_foundry/uorust_model_workspace',
      flowVersion: '5868afe3-candidate',
      sourceRevision: safeRevision,
      operatorApproved: false,
      requestedAt,
    },
    preconditions: [
      'Validated LOCAL Windmill endpoint (uor-offline-foundry) with offline Cargo.lock isolation.',
      'Pinned afflom/UORust (5868afe3) route table (model/routes.toml) and non-defaulting span admission (UE-03, UE-06).',
      'Separate LexLean & PrismPM independent verification suites required after projection (Cargo build is never verification).',
    ],
    failClosedNotice:
      `Browser preview refuses executing Cargo/build.rs directly (${params.declaredInputs || 'no Cargo path'}). Dispatch remains blocked until LOCAL Windmill is validated.`,
  };
}

export interface MockWindmillBackendHealth {
  reachable: boolean;
  workspace: string;
  authenticated: boolean;
  sdkAvailable: boolean;
  missingSdkBinaries?: string[];
  activeSourceRevision?: string;
}

export interface MockWindmillJobPollResponse {
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED' | 'TIMED_OUT';
  stageResults?: Array<{ stage: string; commandId: CanonicalCommandId; exitCode: number }>;
  producedManifests?: Array<{
    path: string;
    expectedSha256: string;
    actualSha256: string;
    outputClass: ArtifactProvenanceRecord['outputClass'];
  }>;
  errorReason?: string;
}

export interface WindmillMockTransport {
  checkHealth(): Promise<MockWindmillBackendHealth>;
  submitJob(payload: {
    commandId: CanonicalCommandId;
    idempotencyKey: string;
    workspace: string;
    projectRelativePath: string;
    sourceRevision: string;
  }): Promise<
    | { ok: true; jobId: string; status: 'QUEUED' }
    | { ok: false; code: 'DUPLICATE_COMMAND_REFUSED' | 'WORKER_UNAVAILABLE' | 'SOURCE_REVISION_MISMATCH'; reason: string }
  >;
  pollJob(jobId: string): Promise<MockWindmillJobPollResponse>;
  cancelJob(jobId: string): Promise<{ ok: boolean; status: 'CANCELLED' | 'NOT_FOUND'; reason?: string }>;
}

export type WorkflowContractFailureCode =
  | 'WORKSPACE_MISMATCH'
  | 'INVALID_COMMAND'
  | 'OPERATOR_APPROVAL_REQUIRED'
  | 'WORKER_UNAVAILABLE'
  | 'MISSING_SDK_BINARY'
  | 'SOURCE_REVISION_MISMATCH'
  | 'MISSING_DEPENDENCY_LOCKS'
  | 'DUPLICATE_COMMAND_REFUSED'
  | 'JOB_FAILED'
  | 'JOB_TIMED_OUT'
  | 'JOB_CANCELLED'
  | 'ARTIFACT_DIGEST_MISMATCH'
  | 'VERIFICATION_NOT_ESTABLISHED'
  | 'RELEASE_BLOCKED';

export interface GovernedWorkflowContractResult {
  ok: boolean;
  finalJobStatus: 'COMPLETED' | 'CANCELLED' | 'FAILED' | 'TIMED_OUT' | 'REFUSED';
  jobId?: string;
  failureCode?: WorkflowContractFailureCode;
  reason: string;
  pollHistory: MockWindmillJobPollResponse['status'][];
  reconciledArtifactCount: number;
  verificationState: 'VERIFIED' | 'NOT VERIFIED';
  releaseStatus: 'ELIGIBLE_FOR_PRODUCTION_RELEASE' | 'RELEASE BLOCKED';
}

/**
 * Deterministic workflow integration contract evaluator used against a real or mocked
 * Windmill backend transport (never fakes local Mac Studio success in live browser UI).
 */
export async function executeGovernedWorkflowContract(params: {
  transport: WindmillMockTransport;
  project: ProjectRecord;
  commandId: CanonicalCommandId;
  idempotencyKey: string;
  projectRelativePath: string;
  workspace?: string;
  operatorApproved?: boolean;
  maxPolls?: number;
  cancelAfterFirstPoll?: boolean;
  verifications: VerificationSuiteRecord[];
  artifacts: ArtifactProvenanceRecord[];
  approvals: ApprovalDecisionRecord[];
}): Promise<GovernedWorkflowContractResult> {
  const workspace = params.workspace ?? ALLOWED_WINDMILL_WORKSPACE;
  const verStateFallback = verificationAuthorityService.evaluateProjectAuthority({
    project: params.project,
    verifications: params.verifications,
    artifacts: params.artifacts,
    approvals: params.approvals,
  });

  if (workspace !== ALLOWED_WINDMILL_WORKSPACE) {
    return {
      ok: false,
      finalJobStatus: 'REFUSED',
      failureCode: 'WORKSPACE_MISMATCH',
      reason: `Refused workspace "${workspace}": only "${ALLOWED_WINDMILL_WORKSPACE}" is allowed.`,
      pollHistory: [],
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  const registryEntry = FIXED_WINDMILL_COMMAND_REGISTRY.find((c) => c.commandId === params.commandId);
  const cmdCheck = validateFixedRegistryCommand({
    commandId: params.commandId,
    projectRelativePath: params.projectRelativePath,
    sourceRevision: params.project.sourceRevision,
  });
  if (!registryEntry || !cmdCheck.allowed) {
    return {
      ok: false,
      finalJobStatus: 'REFUSED',
      failureCode: 'INVALID_COMMAND',
      reason: cmdCheck.reason || `Command "${params.commandId}" failed fixed registry admission.`,
      pollHistory: [],
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  if (registryEntry.requiresOperatorApproval && !params.operatorApproved) {
    return {
      ok: false,
      finalJobStatus: 'REFUSED',
      failureCode: 'OPERATOR_APPROVAL_REQUIRED',
      reason: `Command "${params.commandId}" requires explicit operator approval before dispatch.`,
      pollHistory: [],
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  // Lockfile closure pre-flight for locked commands or build/verify stages
  const authoredLocks = params.project.authoringWorkspace?.files
    .filter((f) => f.kind === 'lockfile')
    .map((f) => f.path);
  const declaredLocks = Array.from(
    new Set([...(params.project.lockfilesDeclared ?? []), ...(authoredLocks ?? [])])
  );
  if (registryEntry.stageId === 'lock' || registryEntry.stageId === 'build' || registryEntry.stageId === 'verify') {
    const closure = evaluateProjectOfflineClosure(
      params.project.inputMode ?? 'NATIVE_PRISM',
      declaredLocks
    );
    if (!closure.readyForOfflineRun) {
      return {
        ok: false,
        finalJobStatus: 'REFUSED',
        failureCode: 'MISSING_DEPENDENCY_LOCKS',
        reason: `PP5401: ${closure.blockingReasons.join('; ') || 'Required lockfiles missing for offline closure.'}`,
        pollHistory: [],
        reconciledArtifactCount: 0,
        verificationState: verStateFallback.overallVerificationState,
        releaseStatus: verStateFallback.releaseStatusLabel,
      };
    }
  }

  const health = await params.transport.checkHealth();
  if (!health.reachable || !health.authenticated) {
    return {
      ok: false,
      finalJobStatus: 'REFUSED',
      failureCode: 'WORKER_UNAVAILABLE',
      reason: 'Windmill worker or Mac Studio session unavailable/unauthenticated.',
      pollHistory: [],
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  if (!health.sdkAvailable) {
    return {
      ok: false,
      finalJobStatus: 'REFUSED',
      failureCode: 'MISSING_SDK_BINARY',
      reason: `Required SDK binary missing on worker: ${(health.missingSdkBinaries ?? [registryEntry.executable]).join(', ')}.`,
      pollHistory: [],
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  if (health.activeSourceRevision && health.activeSourceRevision !== params.project.sourceRevision) {
    return {
      ok: false,
      finalJobStatus: 'REFUSED',
      failureCode: 'SOURCE_REVISION_MISMATCH',
      reason: `Worker checked out "${health.activeSourceRevision}" which does not match project sourceRevision "${params.project.sourceRevision}".`,
      pollHistory: [],
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  const submission = await params.transport.submitJob({
    commandId: params.commandId,
    idempotencyKey: params.idempotencyKey,
    workspace,
    projectRelativePath: params.projectRelativePath,
    sourceRevision: params.project.sourceRevision,
  });

  if (!submission.ok) {
    return {
      ok: false,
      finalJobStatus: 'REFUSED',
      failureCode: submission.code,
      reason: submission.reason,
      pollHistory: [],
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  const pollHistory: MockWindmillJobPollResponse['status'][] = [submission.status];
  const maxPolls = params.maxPolls ?? 5;
  let finalResponse: MockWindmillJobPollResponse | null = null;

  for (let i = 0; i < maxPolls; i++) {
    const polled = await params.transport.pollJob(submission.jobId);
    pollHistory.push(polled.status);
    finalResponse = polled;

    if (params.cancelAfterFirstPoll && (polled.status === 'QUEUED' || polled.status === 'RUNNING')) {
      const cancelRes = await params.transport.cancelJob(submission.jobId);
      pollHistory.push(cancelRes.status === 'CANCELLED' ? 'CANCELLED' : polled.status);
      return {
        ok: false,
        finalJobStatus: 'CANCELLED',
        jobId: submission.jobId,
        failureCode: 'JOB_CANCELLED',
        reason: cancelRes.reason ?? `Operator cancelled Windmill job "${submission.jobId}".`,
        pollHistory,
        reconciledArtifactCount: 0,
        verificationState: verStateFallback.overallVerificationState,
        releaseStatus: verStateFallback.releaseStatusLabel,
      };
    }

    if (polled.status === 'COMPLETED' || polled.status === 'FAILED' || polled.status === 'TIMED_OUT' || polled.status === 'CANCELLED') {
      break;
    }
  }

  if (!finalResponse || finalResponse.status === 'FAILED') {
    return {
      ok: false,
      finalJobStatus: 'FAILED',
      jobId: submission.jobId,
      failureCode: 'JOB_FAILED',
      reason: finalResponse?.errorReason ?? 'Windmill job failed during stage execution.',
      pollHistory,
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  if (finalResponse.status === 'TIMED_OUT' || finalResponse.status === 'QUEUED' || finalResponse.status === 'RUNNING') {
    return {
      ok: false,
      finalJobStatus: 'TIMED_OUT',
      jobId: submission.jobId,
      failureCode: 'JOB_TIMED_OUT',
      reason: finalResponse.errorReason ?? `Windmill job "${submission.jobId}" exceeded poll/deadline budget.`,
      pollHistory,
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  if (finalResponse.status === 'CANCELLED') {
    return {
      ok: false,
      finalJobStatus: 'CANCELLED',
      jobId: submission.jobId,
      failureCode: 'JOB_CANCELLED',
      reason: finalResponse.errorReason ?? `Job "${submission.jobId}" was cancelled.`,
      pollHistory,
      reconciledArtifactCount: 0,
      verificationState: verStateFallback.overallVerificationState,
      releaseStatus: verStateFallback.releaseStatusLabel,
    };
  }

  const manifests = finalResponse.producedManifests ?? [];
  for (const m of manifests) {
    if (!m.actualSha256 || m.actualSha256 !== m.expectedSha256) {
      return {
        ok: false,
        finalJobStatus: 'FAILED',
        jobId: submission.jobId,
        failureCode: 'ARTIFACT_DIGEST_MISMATCH',
        reason: `Artifact digest mismatch for "${m.path}": expected ${m.expectedSha256.slice(0, 12)}, got ${m.actualSha256.slice(0, 12)}.`,
        pollHistory,
        reconciledArtifactCount: 0,
        verificationState: 'NOT VERIFIED',
        releaseStatus: 'RELEASE BLOCKED',
      };
    }
  }

  // Independent verification & release authority ALWAYS re-evaluated fail-closed (no implicit release from job completion)
  const postAuth = verificationAuthorityService.evaluateProjectAuthority({
    project: params.project,
    verifications: params.verifications,
    artifacts: params.artifacts,
    approvals: params.approvals,
  });

  if (params.commandId === 'prismpm_export_browser' && !postAuth.releaseEligible) {
    return {
      ok: false,
      finalJobStatus: 'COMPLETED',
      jobId: submission.jobId,
      failureCode: postAuth.overallVerificationState === 'NOT VERIFIED' ? 'VERIFICATION_NOT_ESTABLISHED' : 'RELEASE_BLOCKED',
      reason: postAuth.blockingReasons[0] ?? 'Release remains blocked without authenticated verification & human approval.',
      pollHistory,
      reconciledArtifactCount: manifests.length,
      verificationState: postAuth.overallVerificationState,
      releaseStatus: postAuth.releaseStatusLabel,
    };
  }

  return {
    ok: true,
    finalJobStatus: 'COMPLETED',
    jobId: submission.jobId,
    reason: `Governed job "${submission.jobId}" completed and reconciled ${manifests.length} output manifest(s); independent release state remains ${postAuth.releaseStatusLabel}.`,
    pollHistory,
    reconciledArtifactCount: manifests.length,
    verificationState: postAuth.overallVerificationState,
    releaseStatus: postAuth.releaseStatusLabel,
  };
}

export interface AuthoritativeEvidenceStateSummary {
  currentState: AuthoritativeEvidenceLifecycleState;
  states: Array<{
    state: AuthoritativeEvidenceLifecycleState;
    satisfied: boolean;
    active: boolean;
    evidenceSummary: string;
  }>;
  releaseEligible: boolean;
  blockingReasons: string[];
}

/**
 * Phase C.3, C.4, C.5: Evaluates the 7 authoritative lifecycle states
 * (`PREPARED`, `REGISTERED`, `RUNNING`, `BUILT`, `VERIFIED`, `BLOCKED`, `RELEASE APPROVED`)
 * strictly from authoritative runtime, artifact, verifier, and human governance records.
 * Browser structural preflight, AI responses, and simulated runs never satisfy `VERIFIED` or `RELEASE APPROVED`.
 */
export function evaluateAuthoritativeEvidenceLifecycle(params: {
  project: ProjectRecord;
  health?: WindmillHealthStatus | null;
  sourcePackageValidated?: boolean;
  activeJobRecords?: WindmillJobRecord[];
  artifacts: ArtifactProvenanceRecord[];
  verifications: VerificationSuiteRecord[];
  approvals: ApprovalDecisionRecord[];
  trustContext?: AuthorityTrustContext;
}): AuthoritativeEvidenceStateSummary {
  const authEval = verificationAuthorityService.evaluateProjectAuthority(
    {
      project: params.project,
      verifications: params.verifications,
      artifacts: params.artifacts,
      approvals: params.approvals,
    },
    params.trustContext
  );

  const projectArtifacts = params.artifacts.filter((a) => a.projectId === params.project.id);
  const realJobs = (params.activeJobRecords ?? []).filter(
    (j) => j.projectId === params.project.id && !j.isSyntheticFixture
  );

  const isPrepared = Boolean(
    params.sourcePackageValidated ||
      params.project.authoringWorkspace?.reviewStatus === 'OPERATOR_REVIEWED_FOR_HANDOFF' ||
      params.project.authoringWorkspace?.files.length
  );

  const isRegistered = Boolean(
    params.health?.reachable &&
      params.health?.authenticated &&
      params.health?.permissionsValidated &&
      (params.health?.registeredFlows?.length ?? 0) > 0
  );

  const isRunning = realJobs.some((j) => j.state === 'RUNNING' || j.state === 'QUEUED');

  // Browser PREFLIGHT_CHECKED / synthetic fixtures never count as genuine Mac Studio BUILT outputs
  const isBuilt = projectArtifacts.some(
    (a) =>
      !a.isSyntheticFixture &&
      a.fileExistsOnDisk === true &&
      a.sha256Verified === true &&
      (a.artifactState === 'BUILT' || a.artifactState === 'VERIFIED')
  );

  const isVerified = authEval.overallVerificationState === 'VERIFIED';
  const isReleaseApproved = authEval.releaseEligible;
  const isBlocked = !isReleaseApproved;

  let currentState: AuthoritativeEvidenceLifecycleState = 'BLOCKED';
  if (isReleaseApproved) {
    currentState = 'RELEASE APPROVED';
  } else if (isVerified) {
    currentState = 'VERIFIED';
  } else if (isBuilt) {
    currentState = 'BUILT';
  } else if (isRunning) {
    currentState = 'RUNNING';
  } else if (isRegistered) {
    currentState = 'REGISTERED';
  } else if (isPrepared) {
    currentState = 'PREPARED';
  }

  return {
    currentState,
    states: [
      {
        state: 'PREPARED',
        satisfied: isPrepared,
        active: currentState === 'PREPARED',
        evidenceSummary: isPrepared
          ? 'Authored source package & canonical Windmill manifests prepared locally.'
          : 'Awaiting authored source package preparation.',
      },
      {
        state: 'REGISTERED',
        satisfied: isRegistered,
        active: currentState === 'REGISTERED',
        evidenceSummary: isRegistered
          ? `Authenticated workspace "${params.health?.workspace}" with ${params.health?.registeredFlows?.length ?? 0} registered flow(s).`
          : 'Windmill flows/runnables not yet verified as registered in live workspace.',
      },
      {
        state: 'RUNNING',
        satisfied: isRunning,
        active: currentState === 'RUNNING',
        evidenceSummary: isRunning
          ? `Genuine Windmill job executing (${realJobs.find((j) => j.state === 'RUNNING' || j.state === 'QUEUED')?.jobId}).`
          : 'No active live Windmill job running.',
      },
      {
        state: 'BUILT',
        satisfied: isBuilt,
        active: currentState === 'BUILT',
        evidenceSummary: isBuilt
          ? 'On-disk compiler artifact produced with verified SHA-256 (distinct from verification).'
          : 'No real on-disk compiler artifact produced yet (browser preflight is not a build).',
      },
      {
        state: 'VERIFIED',
        satisfied: isVerified,
        active: currentState === 'VERIFIED',
        evidenceSummary: isVerified
          ? `All ${authEval.requiredSuiteCount} independent verification authorities authenticated PASS.`
          : `NOT VERIFIED (${authEval.authenticatedPassCount}/${authEval.requiredSuiteCount} authenticated authorities; browser preflight never certifies verification).`,
      },
      {
        state: 'BLOCKED',
        satisfied: isBlocked,
        active: isBlocked && currentState !== 'RELEASE APPROVED',
        evidenceSummary: isBlocked
          ? authEval.blockingReasons[0] ?? 'Release blocked pending independent verification and human authorization.'
          : 'All release blockers cleared.',
      },
      {
        state: 'RELEASE APPROVED',
        satisfied: isReleaseApproved,
        active: currentState === 'RELEASE APPROVED',
        evidenceSummary: isReleaseApproved
          ? 'Authenticated human APPROVED_FOR_RELEASE bound to verified artifact SHA-256 and revision.'
          : 'Refused: requires authenticated independent verification evidence + human APPROVED_FOR_RELEASE.',
      },
    ],
    releaseEligible: isReleaseApproved,
    blockingReasons: authEval.blockingReasons,
  };
}

export interface CalculatorIntakeHandoffResult {
  ok: boolean;
  operatorConfirmed: boolean;
  packageValidation: SourcePackageRuntimeHandoffValidationResult;
  handoffPreview?: CalculatorRuntimeHandoffPreview;
  healthStatus: WindmillHealthStatus;
  intakeStageResult: {
    commandId: 'prism_intake_validate';
    flowPath: 'f/uor_foundry/prism_intake_validate';
    runnable: 'backend/intake_validate.ts';
    validatedArgv: string[];
    valid: boolean;
    sideEffectsExecuted: false;
    jobId: string | null;
    diagnostic: string;
  };
  evidenceLifecycle: AuthoritativeEvidenceStateSummary;
}

/**
 * Phase B.4: Executes the real Calculator (`proj-prism-calc` / `examples/Calculator`)
 * intake and read-only validation flow using `uor.foundry.source-package.v1` and the
 * canonical Windmill workflow structure without fabricating compiler output or release acceptance.
 */
export async function executeCalculatorIntakeHandoffFlow(params: {
  project: ProjectRecord;
  rawOrManifest: string | FoundrySourcePackageManifest;
  operatorConfirmed: boolean;
  windmillService: WindmillExecutionService;
  artifacts: ArtifactProvenanceRecord[];
  verifications: VerificationSuiteRecord[];
  approvals: ApprovalDecisionRecord[];
  activeJobRecords?: WindmillJobRecord[];
  trustContext?: AuthorityTrustContext;
}): Promise<CalculatorIntakeHandoffResult> {
  const healthStatus = await params.windmillService.checkRuntimeHealth();
  const intakeEntry = CANONICAL_COMMAND_BY_ID.prism_intake_validate;
  const relPath =
    params.project.id === 'proj-prism-calc' ? 'examples/Calculator' : `projects/${params.project.id}`;
  const validatedArgv = buildValidatedCommandArgv(intakeEntry, relPath);

  const packageValidation = await validateSourcePackageForRuntimeHandoff({
    rawOrManifest: params.rawOrManifest,
    expectedProject: params.project,
    expectedWorkspace: ALLOWED_WINDMILL_WORKSPACE,
  });

  const evidenceLifecycle = evaluateAuthoritativeEvidenceLifecycle({
    project: params.project,
    health: healthStatus,
    sourcePackageValidated: packageValidation.valid && params.operatorConfirmed,
    activeJobRecords: params.activeJobRecords,
    artifacts: params.artifacts,
    verifications: params.verifications,
    approvals: params.approvals,
    trustContext: params.trustContext,
  });

  if (!params.operatorConfirmed) {
    return {
      ok: false,
      operatorConfirmed: false,
      packageValidation,
      healthStatus,
      intakeStageResult: {
        commandId: 'prism_intake_validate',
        flowPath: 'f/uor_foundry/prism_intake_validate',
        runnable: 'backend/intake_validate.ts',
        validatedArgv,
        valid: false,
        sideEffectsExecuted: false,
        jobId: null,
        diagnostic: 'Handoff refused: explicit operator confirmation is required after reviewing the handoff preview.',
      },
      evidenceLifecycle,
    };
  }

  if (!packageValidation.valid || !packageValidation.manifest) {
    return {
      ok: false,
      operatorConfirmed: true,
      packageValidation,
      healthStatus,
      intakeStageResult: {
        commandId: 'prism_intake_validate',
        flowPath: 'f/uor_foundry/prism_intake_validate',
        runnable: 'backend/intake_validate.ts',
        validatedArgv,
        valid: false,
        sideEffectsExecuted: false,
        jobId: null,
        diagnostic: `Source package validation failed (${packageValidation.failureCode ?? 'INVALID'}): ${packageValidation.errors.join('; ')}`,
      },
      evidenceLifecycle,
    };
  }

  const handoffPreview = buildCalculatorRuntimeHandoffPreview({
    project: params.project,
    manifest: packageValidation.manifest,
    projectRelativePath: relPath,
  });

  // Attempt read-only intake submission through the Windmill service boundary
  const idempotencyKey = `calc-intake:${params.project.id}:${packageValidation.manifest.packageDigestSha256.slice(0, 16)}`;
  const dispatchAttempt = await params.windmillService.submitAuthorizedWorkflow({
    requestId: `req-intake-${params.project.id}`,
    idempotencyKey,
    projectId: params.project.id,
    workflowId: params.project.workflowId,
    flowPath: 'f/uor_foundry/prism_intake_validate',
    flowVersion: params.project.sourceRevision,
    sourceRevision: params.project.sourceRevision,
    operatorApproved: true,
    requestedAt: new Date().toISOString(),
  });

  const jobId = dispatchAttempt.ok ? dispatchAttempt.job.jobId : null;
  const diagnostic = dispatchAttempt.ok
    ? `Calculator source package (${packageValidation.verifiedFileCount} files, sha256:${packageValidation.manifest.packageDigestSha256.slice(0, 12)}...) validated and submitted to registered flow f/uor_foundry/prism_intake_validate (jobId: ${dispatchAttempt.job.jobId}). Release remains ${evidenceLifecycle.releaseEligible ? 'ELIGIBLE' : 'BLOCKED'}.`
    : `Calculator source package (${packageValidation.verifiedFileCount} files, sha256:${packageValidation.manifest.packageDigestSha256.slice(0, 12)}...) passed read-only schema, hash, path, review, and toolchain validation. Live Windmill dispatch status: [${dispatchAttempt.diagnostic.code}] ${dispatchAttempt.diagnostic.message}`;

  return {
    ok: true,
    operatorConfirmed: true,
    packageValidation,
    handoffPreview,
    healthStatus,
    intakeStageResult: {
      commandId: 'prism_intake_validate',
      flowPath: 'f/uor_foundry/prism_intake_validate',
      runnable: 'backend/intake_validate.ts',
      validatedArgv,
      valid: true,
      sideEffectsExecuted: false,
      jobId,
      diagnostic,
    },
    evidenceLifecycle,
  };
}

export type RecentJobRegistryState = 'RUNNING' | 'BUILT' | 'VERIFIED' | 'BLOCKED';

/**
 * Classifies a retrieved Windmill job record into its authoritative evidence stage
 * ('RUNNING', 'BUILT', 'VERIFIED', or 'BLOCKED') for the Advanced Console Recent Job Registry.
 * Synthetic fixtures or non-completed jobs never qualify as 'BUILT' or 'VERIFIED'.
 */
export function classifyWindmillJobEvidenceStage(
  job: WindmillJobRecord
): RecentJobRegistryState {
  if (job.state === 'RUNNING' || job.state === 'QUEUED') {
    return 'RUNNING';
  }
  if (job.isSyntheticFixture || job.state !== 'COMPLETED') {
    return 'BLOCKED';
  }
  const stageTag = String(job.structuredResult?.stage ?? '').toUpperCase();
  if (
    job.evidenceRefs.length > 0 &&
    (job.flowPath.toLowerCase().includes('verify') || stageTag === 'VERIFY')
  ) {
    return 'VERIFIED';
  }
  if (
    job.artifactRefs.length > 0 ||
    job.flowPath.toLowerCase().includes('build') ||
    stageTag === 'BUILD'
  ) {
    return 'BUILT';
  }
  return 'BLOCKED';
}

export interface WindmillConnectivityEvaluation {
  isReadOnlyConnected: boolean;
  primaryBadge: 'LOCAL READ-ONLY CONNECTED' | 'NOT CONNECTED';
  availabilityBadge: 'LOCAL READ-ONLY CONNECTED' | 'NOT CONNECTED' | 'UNAVAILABLE';
  failureKind:
    | 'NONE'
    | 'UNPROBED'
    | 'UNREACHABLE'
    | 'PERMISSION_DENIED_OR_UNAUTHENTICATED'
    | 'UNAUTHORIZED_WORKSPACE';
  readOnlyConnectivityStatus: 'LOCAL READ-ONLY CONNECTED' | 'NOT CONNECTED';
  workflowDispatchStatus: 'DISABLED';
  compilerExecutionStatus: 'DISABLED';
  lmStudioStatus: 'NOT CONNECTED';
  releaseAuthorityStatus: 'RELEASE BLOCKED';
  workspace: string;
  endpoint: string;
  diagnosticMessage: string;
}

/**
 * Evaluates Windmill connectivity strictly from the authenticated local read-only health check.
 * Shows `LOCAL READ-ONLY CONNECTED` ONLY when `reachable`, `authenticated`, `permissionsValidated`,
 * and `workspace === 'uor-offline-foundry'` are all confirmed. Otherwise fails closed to
 * `NOT CONNECTED` / `UNAVAILABLE`. Keeps separate statuses for read-only connectivity,
 * workflow dispatch, compiler execution, LM Studio, and release authority.
 */
export function evaluateWindmillReadOnlyConnectivity(
  health?: WindmillHealthStatus | null
): WindmillConnectivityEvaluation {
  const isReadOnlyConnected = Boolean(
    health &&
      health.reachable === true &&
      health.authenticated === true &&
      health.permissionsValidated === true &&
      health.workspace === ALLOWED_WINDMILL_WORKSPACE
  );

  if (isReadOnlyConnected && health) {
    return {
      isReadOnlyConnected: true,
      primaryBadge: 'LOCAL READ-ONLY CONNECTED',
      availabilityBadge: 'LOCAL READ-ONLY CONNECTED',
      failureKind: 'NONE',
      readOnlyConnectivityStatus: 'LOCAL READ-ONLY CONNECTED',
      workflowDispatchStatus: 'DISABLED',
      compilerExecutionStatus: 'DISABLED',
      lmStudioStatus: 'NOT CONNECTED',
      releaseAuthorityStatus: 'RELEASE BLOCKED',
      workspace: health.workspace,
      endpoint: health.endpoint,
      diagnosticMessage:
        health.diagnosticMessage ||
        `Authenticated local read-only connection verified for workspace "${ALLOWED_WINDMILL_WORKSPACE}". Workflow dispatch, compiler execution, LM Studio, and release authority remain disabled.`,
    };
  }

  let failureKind: WindmillConnectivityEvaluation['failureKind'] = 'UNPROBED';
  let availabilityBadge: WindmillConnectivityEvaluation['availabilityBadge'] = 'NOT CONNECTED';

  if (health) {
    availabilityBadge = 'UNAVAILABLE';
    if (!health.reachable) {
      failureKind = 'UNREACHABLE';
    } else if (health.workspace !== ALLOWED_WINDMILL_WORKSPACE) {
      failureKind = 'UNAUTHORIZED_WORKSPACE';
    } else {
      failureKind = 'PERMISSION_DENIED_OR_UNAUTHENTICATED';
    }
  }

  return {
    isReadOnlyConnected: false,
    primaryBadge: 'NOT CONNECTED',
    availabilityBadge,
    failureKind,
    readOnlyConnectivityStatus: 'NOT CONNECTED',
    workflowDispatchStatus: 'DISABLED',
    compilerExecutionStatus: 'DISABLED',
    lmStudioStatus: 'NOT CONNECTED',
    releaseAuthorityStatus: 'RELEASE BLOCKED',
    workspace: health?.workspace || ALLOWED_WINDMILL_WORKSPACE,
    endpoint: health?.endpoint || WINDMILL_TARGET_CONFIG.baseUrl,
    diagnosticMessage:
      health?.diagnosticMessage ||
      `Windmill local read-only connectivity is NOT CONNECTED / UNAVAILABLE. Requires reachable endpoint (${WINDMILL_TARGET_CONFIG.baseUrl}), authenticated token, validated permissions, and workspace "${ALLOWED_WINDMILL_WORKSPACE}".`,
  };
}

