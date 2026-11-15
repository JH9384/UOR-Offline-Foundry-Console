import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
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
} from '../types/foundry';
import { WINDMILL_ENDPOINTS, WINDMILL_TARGET_CONFIG } from './windmillAdapter';
import {
  ALLOWED_WINDMILL_WORKSPACE,
  CanonicalCommandId,
  FIXED_WINDMILL_COMMAND_REGISTRY,
  validateFixedRegistryCommand,
} from './windmillCommandRegistry';
import { evaluateProjectOfflineClosure } from '../services/holoArchiveValidator';
import { verificationAuthorityService } from '../services/verificationAuthorityService';

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

  checkRuntimeHealth(): Promise<WindmillHealthStatus>;
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

/**
 * Fail-closed structural adapter for Option A (authenticated local backend proxy)
 * and Option B (Windmill-native `wmill.ts` full-code app bindings).
 * Keeps zero credentials in frontend code or browser storage.
 */
export class FailClosedLocalWindmillService implements WindmillExecutionService {
  readonly mode: IntegrationMode = 'LOCAL';
  readonly deploymentOption: WindmillDeploymentOption;
  readonly workspace = WINDMILL_TARGET_CONFIG.workspace;
  private readonly submittedIdempotencyKeys = new Set<string>();

  constructor(deploymentOption: WindmillDeploymentOption = 'VITE_AUTHENTICATED_LOCAL_PROXY') {
    this.deploymentOption = deploymentOption;
  }

  async checkRuntimeHealth(): Promise<WindmillHealthStatus> {
    return {
      mode: 'LOCAL',
      deploymentOption: this.deploymentOption,
      workspace: this.workspace,
      endpoint:
        this.deploymentOption === 'WINDMILL_NATIVE_WMILL_TS'
          ? 'wmill.ts (Windmill Workspace Session)'
          : '/api/windmill/health -> http://127.0.0.1:8080',
      reachable: false,
      authenticated: false,
      permissionsValidated: false,
      checkedAt: new Date().toISOString(),
      diagnosticMessage:
        'LOCAL mode remains unavailable: endpoint authentication and workspace permissions for "uor-offline-foundry" have not been validated.',
    };
  }

  async submitAuthorizedWorkflow(
    request: WindmillExecutionRequest & {
      commandId?: string;
      rawCommandString?: string;
      projectRelativePath?: string;
    }
  ): Promise<{ ok: true; job: WindmillJobIdentity } | { ok: false; diagnostic: WindmillConnectionDiagnostic }> {
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

    return {
      ok: false,
      diagnostic: this.reportConnectionFailure(
        'AUTH_NOT_VALIDATED',
        `Cannot submit "${request.flowPath}": LOCAL Windmill backend authentication and flow registration are not validated.`
      ),
    };
  }

  async getJobStatusAndResult(jobId: string) {
    return {
      ok: false as const,
      diagnostic: this.reportConnectionFailure(
        'NOT_CONNECTED',
        `Cannot query Windmill job "${jobId}" because LOCAL runtime is unvalidated.`
      ),
    };
  }

  async listApprovedExecutionHistory() {
    return {
      ok: false,
      records: [],
      diagnostic: this.reportConnectionFailure(
        'NOT_CONNECTED',
        'No approved live Windmill execution history available while LOCAL runtime is disconnected.'
      ),
    };
  }

  async readVerifiedEvidenceRefs() {
    return {
      ok: false,
      evidence: [],
      diagnostic: this.reportConnectionFailure(
        'NOT_CONNECTED',
        'Authoritative Windmill evidence store is unreachable.'
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


