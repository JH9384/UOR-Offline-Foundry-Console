import {
  ArtifactProvenanceRecord,
  IntegrationMode,
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
    request: WindmillExecutionRequest
  ): Promise<{ ok: true; job: WindmillJobIdentity } | { ok: false; diagnostic: WindmillConnectionDiagnostic }> {
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
      flowVersion: '2a2b674f-candidate',
      sourceRevision: safeRevision,
      operatorApproved: false,
      requestedAt,
    },
    preconditions: [
      'Validated LOCAL Windmill endpoint (uor-offline-foundry) with offline Cargo.lock isolation.',
      'Pinned afflom/UORust route table (model/routes.toml) and non-defaulting span admission (UE-03, UE-06).',
      'Separate LexLean & PrismPM independent verification suites required after projection.',
    ],
    failClosedNotice:
      `Browser preview refuses executing Cargo/build.rs directly (${params.declaredInputs || 'no Cargo path'}). Dispatch remains blocked until LOCAL Windmill is validated.`,
  };
}

