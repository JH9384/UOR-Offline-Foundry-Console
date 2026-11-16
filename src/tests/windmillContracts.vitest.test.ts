import { describe, expect, it } from 'vitest';
import {
  CanonicalCommandId,
  FIXED_WINDMILL_COMMAND_REGISTRY,
} from '../shared/adapters/windmillCommandRegistry';
import {
  classifyWindmillJobEvidenceStage,
  evaluateAuthoritativeEvidenceLifecycle,
  executeCalculatorIntakeHandoffFlow,
  executeGovernedWorkflowContract,
  FailClosedLocalWindmillService,
  MockWindmillBackendHealth,
  MockWindmillJobPollResponse,
  WindmillMockTransport,
} from '../shared/adapters/windmillExecutionService';
import {
  INITIAL_APPROVALS,
  INITIAL_ARTIFACTS,
  INITIAL_PROJECTS,
  INITIAL_VERIFICATION_SUITES,
} from '../shared/data/seedFoundryData';
import {
  buildCalculatorRuntimeHandoffPreview,
  buildSourcePackageManifest,
  validateSourcePackageForRuntimeHandoff,
} from '../shared/services/sourceAuthoringService';
import * as wmillContract from '../../uor_foundry.raw_app/wmill.contract';
import {
  CANONICAL_RAW_APP_RUNNABLES,
  main as runtimeHealthMain,
} from '../../uor_foundry.raw_app/backend/runtime_health';
import { main as jobStatusMain } from '../../uor_foundry.raw_app/backend/job_status';
import { main as intakeValidateMain } from '../../uor_foundry.raw_app/backend/intake_validate';
import { WINDMILL_TARGET_CONFIG } from '../shared/adapters/windmillAdapter';

function createMockTransport(options?: {
  health?: Partial<MockWindmillBackendHealth>;
  duplicateKeyToRefuse?: string;
  pollSequence?: MockWindmillJobPollResponse[];
  cancelOk?: boolean;
}): WindmillMockTransport {
  const seenKeys = new Set<string>();
  const polls = options?.pollSequence ?? [
    { status: 'QUEUED' },
    { status: 'RUNNING' },
    { status: 'COMPLETED', producedManifests: [] },
  ];
  let pollIdx = 0;

  return {
    async checkHealth() {
      return {
        reachable: true,
        workspace: 'uor-offline-foundry',
        authenticated: true,
        sdkAvailable: true,
        activeSourceRevision: INITIAL_PROJECTS[0].sourceRevision,
        ...options?.health,
      };
    },
    async submitJob(payload) {
      if (options?.duplicateKeyToRefuse === payload.idempotencyKey || seenKeys.has(payload.idempotencyKey)) {
        return {
          ok: false,
          code: 'DUPLICATE_COMMAND_REFUSED',
          reason: `Idempotency key "${payload.idempotencyKey}" already dispatched.`,
        };
      }
      seenKeys.add(payload.idempotencyKey);
      return { ok: true, jobId: `wm-mock-${seenKeys.size}`, status: 'QUEUED' };
    },
    async pollJob() {
      const next = polls[Math.min(pollIdx, polls.length - 1)];
      pollIdx += 1;
      return next;
    },
    async cancelJob(jobId) {
      return {
        ok: options?.cancelOk ?? true,
        status: 'CANCELLED',
        reason: `Cancelled job ${jobId} cleanly.`,
      };
    },
  };
}

describe('Windmill Governed Workflow Contracts (13 Mocked-Backend Scenarios)', () => {
  const baseProject = INITIAL_PROJECTS[0];
  const validDigest = INITIAL_ARTIFACTS.find((a) => a.projectId === baseProject.id)!.sha256Digest;

  it('1. accepts governed workflow submission with canonical registry command and operator approval', async () => {
    const transport = createMockTransport();
    const res = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_build_locked',
      idempotencyKey: 'key-submit-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.ok).toBe(true);
    expect(res.finalJobStatus).toBe('COMPLETED');
    expect(res.jobId).toBe('wm-mock-1');
  });

  it('2. refuses duplicate idempotency key submissions', async () => {
    const transport = createMockTransport();
    await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_check',
      idempotencyKey: 'dup-key-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    const second = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_check',
      idempotencyKey: 'dup-key-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(second.ok).toBe(false);
    expect(second.failureCode).toBe('DUPLICATE_COMMAND_REFUSED');
  });

  it('3. tracks job state progression QUEUED -> RUNNING -> COMPLETED', async () => {
    const transport = createMockTransport({
      pollSequence: [
        { status: 'QUEUED' },
        { status: 'RUNNING' },
        { status: 'COMPLETED', producedManifests: [] },
      ],
    });
    const res = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'lexlean_check',
      idempotencyKey: 'key-prog-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.pollHistory).toEqual(['QUEUED', 'QUEUED', 'RUNNING', 'COMPLETED']);
  });

  it('4. supports operator cancellation mid-run cleanly', async () => {
    const transport = createMockTransport({
      pollSequence: [{ status: 'RUNNING' }, { status: 'COMPLETED' }],
    });
    const res = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_build_locked',
      idempotencyKey: 'key-cancel-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      cancelAfterFirstPoll: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.ok).toBe(false);
    expect(res.finalJobStatus).toBe('CANCELLED');
    expect(res.failureCode).toBe('JOB_CANCELLED');
  });

  it('5. reports stage execution failure and timeout accurately', async () => {
    const failedTransport = createMockTransport({
      pollSequence: [{ status: 'RUNNING' }, { status: 'FAILED', errorReason: 'leanchecker exit 1' }],
    });
    const failed = await executeGovernedWorkflowContract({
      transport: failedTransport,
      project: baseProject,
      commandId: 'lexlean_verify',
      idempotencyKey: 'key-fail-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(failed.finalJobStatus).toBe('FAILED');
    expect(failed.failureCode).toBe('JOB_FAILED');

    const timeoutTransport = createMockTransport({
      pollSequence: [{ status: 'RUNNING' }],
    });
    const timedOut = await executeGovernedWorkflowContract({
      transport: timeoutTransport,
      project: baseProject,
      commandId: 'hologram_run',
      idempotencyKey: 'key-timeout-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      maxPolls: 2,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(timedOut.finalJobStatus).toBe('TIMED_OUT');
    expect(timedOut.failureCode).toBe('JOB_TIMED_OUT');
  });

  it('6. refuses execution when Windmill worker is unavailable or unauthenticated', async () => {
    const transport = createMockTransport({
      health: { reachable: false, authenticated: false },
    });
    const res = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_check',
      idempotencyKey: 'key-down-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.ok).toBe(false);
    expect(res.failureCode).toBe('WORKER_UNAVAILABLE');
  });

  it('7. refuses execution when required SDK binary is missing', async () => {
    const transport = createMockTransport({
      health: { sdkAvailable: false, missingSdkBinaries: ['lexlean 0.4.0'] },
    });
    const res = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'lexlean_verify',
      idempotencyKey: 'key-nosdk-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.ok).toBe(false);
    expect(res.failureCode).toBe('MISSING_SDK_BINARY');
    expect(res.reason).toContain('lexlean 0.4.0');
  });

  it('8. refuses execution on sourceRevision mismatch', async () => {
    const transport = createMockTransport({
      health: { activeSourceRevision: 'prismpm/main@stale0000' },
    });
    const res = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_build_locked',
      idempotencyKey: 'key-rev-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.ok).toBe(false);
    expect(res.failureCode).toBe('SOURCE_REVISION_MISMATCH');
  });

  it('9. blocks build/lock/verify when required lockfiles are missing (PP5401)', async () => {
    const transport = createMockTransport();
    const projectMissingLocks = {
      ...baseProject,
      declaredInputs: 'examples/Calculator/prismpm.toml',
      lockfilesDeclared: [],
      authoringWorkspace: {
        ...baseProject.authoringWorkspace!,
        files: baseProject.authoringWorkspace!.files.filter((f) => f.kind !== 'lockfile'),
      },
    };
    const res = await executeGovernedWorkflowContract({
      transport,
      project: projectMissingLocks,
      commandId: 'prismpm_build_locked',
      idempotencyKey: 'key-nolock-1',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.ok).toBe(false);
    expect(res.failureCode).toBe('MISSING_DEPENDENCY_LOCKS');
    expect(res.reason).toContain('PP5401');
  });

  it('10. reconciles matching output manifests accurately', async () => {
    const transport = createMockTransport({
      pollSequence: [
        {
          status: 'COMPLETED',
          producedManifests: [
            {
              path: '.prism/Calculator/Calculator.holo',
              expectedSha256: validDigest,
              actualSha256: validDigest,
              outputClass: 'physical_holo_archive',
            },
          ],
        },
      ],
    });
    const res = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_build_locked',
      idempotencyKey: 'key-manifest-ok',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.ok).toBe(true);
    expect(res.reconciledArtifactCount).toBe(1);
  });

  it('11. fails closed on artifact digest mismatch during output reconciliation', async () => {
    const transport = createMockTransport({
      pollSequence: [
        {
          status: 'COMPLETED',
          producedManifests: [
            {
              path: '.prism/Calculator/Calculator.holo',
              expectedSha256: validDigest,
              actualSha256: 'deadbeef'.repeat(8),
              outputClass: 'physical_holo_archive',
            },
          ],
        },
      ],
    });
    const res = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_build_locked',
      idempotencyKey: 'key-digest-mismatch',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.ok).toBe(false);
    expect(res.failureCode).toBe('ARTIFACT_DIGEST_MISMATCH');
    expect(res.releaseStatus).toBe('RELEASE BLOCKED');
  });

  it('12 & 13. refuses release export when verification or human release approval is missing, even if build job completes', async () => {
    const transport = createMockTransport({
      pollSequence: [{ status: 'COMPLETED', producedManifests: [] }],
    });
    const res = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_export_browser',
      idempotencyKey: 'key-release-block',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(res.ok).toBe(false);
    expect(res.failureCode).toBe('VERIFICATION_NOT_ESTABLISHED');
    expect(res.verificationState).toBe('NOT VERIFIED');
    expect(res.releaseStatus).toBe('RELEASE BLOCKED');
  });

  it('rejects unregistered command IDs and wrong Windmill workspaces against canonical registry', async () => {
    const transport = createMockTransport();
    expect(FIXED_WINDMILL_COMMAND_REGISTRY.every((c) => c.allowedWorkspaces.includes('uor-offline-foundry'))).toBe(
      true
    );

    const wrongWorkspace = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'prismpm_check',
      idempotencyKey: 'key-bad-ws',
      projectRelativePath: 'examples/Calculator',
      workspace: 'unauthorized-cloud-ws',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(wrongWorkspace.failureCode).toBe('WORKSPACE_MISMATCH');

    const badCommand = await executeGovernedWorkflowContract({
      transport,
      project: baseProject,
      commandId: 'rm_rf_shell' as CanonicalCommandId,
      idempotencyKey: 'key-bad-cmd',
      projectRelativePath: 'examples/Calculator',
      operatorApproved: true,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(badCommand.failureCode).toBe('INVALID_COMMAND');
  });
});

describe('Phase A/B/C: Local Windmill Execution Client, Source-Package Handoff & Authoritative Evidence Lifecycle', () => {
  const calcProject = INITIAL_PROJECTS[0];

  it('1. fails closed when Windmill runtime is unreachable before enabling dispatch or job lookup', async () => {
    const service = new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY', {
      async probeHealth() {
        return {
          reachable: false,
          workspace: 'uor-offline-foundry',
          authenticated: false,
          permissionsValidated: false,
          registeredRunnables: [],
          registeredFlows: [],
          wmillContractStatus: 'WMILL_TS_NOT_GENERATED',
        };
      },
      async fetchJobById() {
        throw new Error('Should not be called when runtime health is unverified');
      },
    });

    const health = await service.checkRuntimeHealth();
    expect(health.reachable).toBe(false);
    expect(health.readOnlyHealthVerified).toBe(false);
    expect(health.dispatchEnabled).toBe(false);

    const jobRes = await service.getJobStatusAndResult('wm-job-100');
    expect(jobRes.ok).toBe(false);
    if (!jobRes.ok) {
      expect(jobRes.diagnostic.code).toBe('NOT_CONNECTED');
    }

    const submitRes = await service.submitAuthorizedWorkflow({
      requestId: 'req-unreachable-1',
      idempotencyKey: 'idem-unreachable-1',
      projectId: calcProject.id,
      workflowId: calcProject.workflowId,
      flowPath: 'u/foundry/calculator_verify_flow',
      flowVersion: '1.0.0',
      sourceRevision: calcProject.sourceRevision,
      operatorApproved: true,
      requestedAt: '2026-03-29T10:00:00.000Z',
      commandId: 'prismpm_check',
      projectRelativePath: 'examples/Calculator',
    });
    expect(submitRes.ok).toBe(false);
    if (!submitRes.ok) {
      expect(submitRes.diagnostic.code).toBe('NOT_CONNECTED');
    }
  });

  it('2. rejects unauthorized workspaces and unauthenticated credentials across runtime health, job lookup, and dispatch', async () => {
    await expect(runtimeHealthMain('unauthorized-external-workspace')).rejects.toThrow(
      /Unauthorized workspace target/
    );

    const badJobLookup = await jobStatusMain({
      jobId: 'wm-job-200',
      workspace: 'unauthorized-external-workspace',
    });
    expect(badJobLookup.found).toBe(false);
    expect(badJobLookup.status).toBe('UNAUTHORIZED_WORKSPACE');

    const service = new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY', {
      async probeHealth() {
        return {
          reachable: true,
          workspace: 'uor-offline-foundry',
          authenticated: false,
          permissionsValidated: false,
          registeredRunnables: [
            'backend/runtime_health.ts',
            'backend/intake_validate.ts',
            'backend/job_status.ts',
          ],
          registeredFlows: [],
          wmillContractStatus: 'LOCAL_PROXY_VALIDATED',
        };
      },
      async fetchJobById() {
        return { ok: false, code: 'NOT_CONNECTED', message: 'not found' };
      },
    });

    const health = await service.checkRuntimeHealth();
    expect(health.authenticated).toBe(false);
    expect(health.readOnlyHealthVerified).toBe(false);

    const submitRes = await service.submitAuthorizedWorkflow({
      requestId: 'req-unauth-1',
      idempotencyKey: 'idem-unauth-1',
      projectId: calcProject.id,
      workflowId: calcProject.workflowId,
      flowPath: 'u/foundry/calculator_verify_flow',
      flowVersion: '1.0.0',
      sourceRevision: calcProject.sourceRevision,
      operatorApproved: true,
      requestedAt: '2026-03-29T10:00:00.000Z',
      commandId: 'prismpm_check',
      projectRelativePath: 'examples/Calculator',
    });
    expect(submitRes.ok).toBe(false);
    if (!submitRes.ok) {
      expect(submitRes.diagnostic.code).toBe('AUTH_NOT_VALIDATED');
    }
  });

  it('3. verifies wmill.contract.ts and refuses dispatch when target flow registration is missing', async () => {
    const nullCheck = wmillContract.verifyGeneratedWmillContract(null);
    expect(nullCheck.valid).toBe(false);
    expect(nullCheck.status).toBe('WMILL_TS_NOT_GENERATED');

    const incompleteCheck = wmillContract.verifyGeneratedWmillContract(wmillContract);
    expect(incompleteCheck.valid).toBe(false);
    expect(incompleteCheck.status).toBe('WMILL_CONTRACT_INCOMPLETE');

    const service = new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY', {
      async probeHealth() {
        return {
          reachable: true,
          workspace: 'uor-offline-foundry',
          authenticated: true,
          permissionsValidated: true,
          registeredRunnables: [
            'backend/runtime_health.ts',
            'backend/intake_validate.ts',
            'backend/job_status.ts',
          ],
          registeredFlows: ['u/foundry/other_flow'],
          wmillContractStatus: 'LOCAL_PROXY_VALIDATED',
        };
      },
      async fetchJobById() {
        return { ok: false, code: 'NOT_CONNECTED', message: 'not found' };
      },
    });

    const health = await service.checkRuntimeHealth();
    expect(health.readOnlyHealthVerified).toBe(true);
    expect(health.dispatchEnabled).toBe(true); // A flow exists, but not calculator_verify_flow

    const submitRes = await service.submitAuthorizedWorkflow({
      requestId: 'req-missing-flow-1',
      idempotencyKey: 'idem-missing-flow-1',
      projectId: calcProject.id,
      workflowId: calcProject.workflowId,
      flowPath: 'u/foundry/calculator_verify_flow',
      flowVersion: '1.0.0',
      sourceRevision: calcProject.sourceRevision,
      operatorApproved: true,
      requestedAt: '2026-03-29T10:00:00.000Z',
      commandId: 'prismpm_check',
      projectRelativePath: 'examples/Calculator',
    });
    expect(submitRes.ok).toBe(false);
    if (!submitRes.ok) {
      expect(submitRes.diagnostic.code).toBe('FLOW_UNREGISTERED');
    }
  });

  it('4. detects invalid or tampered source-package SHA-256 hashes during runtime handoff and intake validation', async () => {
    const validManifest = await buildSourcePackageManifest({
      project: calcProject,
      workspace: calcProject.authoringWorkspace!,
      reviewConfirmed: true,
      reviewSummary: 'Reviewed Calculator source package',
      targetDestination: 'MAC_STUDIO_UOR_OFFLINE_FOUNDRY',
    });

    const validHandoff = await validateSourcePackageForRuntimeHandoff({
      rawOrManifest: validManifest,
      expectedProject: calcProject,
      expectedWorkspace: 'uor-offline-foundry',
    });
    expect(validHandoff.valid).toBe(true);

    const tamperedManifest = {
      ...validManifest,
      files: validManifest.files.map((f, idx) =>
        idx === 0 ? { ...f, content: `${f.content}\n// tampered` } : f
      ),
    };

    const tamperedHandoff = await validateSourcePackageForRuntimeHandoff({
      rawOrManifest: tamperedManifest,
      expectedProject: calcProject,
      expectedWorkspace: 'uor-offline-foundry',
    });
    expect(tamperedHandoff.valid).toBe(false);
    expect(tamperedHandoff.failureCode).toBe('INVALID_SOURCE_PACKAGE_HASH');

    const intakeRes = await intakeValidateMain({
      projectName: calcProject.name,
      productFamily: calcProject.productFamily,
      componentId: 'comp-prism',
      workflowId: calcProject.workflowId,
      purpose: calcProject.purpose,
      declaredInputs: calcProject.declaredInputs,
      environmentDeclaration: calcProject.environmentDeclaration,
      sourceRevision: calcProject.sourceRevision,
      acknowledgeBoundary: true,
      sourcePackage: {
        schema: validManifest.schema,
        packageId: validManifest.packageId,
        packageClassification: validManifest.packageClassification,
        isHoloArchive: validManifest.isHoloArchive,
        reviewConfirmed: validManifest.reviewConfirmed,
        targetWindmillWorkspace: validManifest.targetWindmillWorkspace,
        packageDigestSha256: validManifest.packageDigestSha256,
        expectedPackageDigestSha256: 'deadbeef'.repeat(8),
        lockfileRefs: validManifest.lockfileRefs,
        files: validManifest.files.map((f) => ({
          path: f.path,
          sha256: f.sha256,
        })),
      },
    });
    expect(intakeRes.valid).toBe(false);
    expect(intakeRes.errors.sourcePackageHash).toBeDefined();

    const service = new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY');
    const dispatchRes = await service.submitAuthorizedWorkflow({
      requestId: 'req-bad-pkg-hash',
      idempotencyKey: 'idem-bad-pkg-hash',
      projectId: calcProject.id,
      workflowId: calcProject.workflowId,
      flowPath: 'u/foundry/calculator_verify_flow',
      flowVersion: '1.0.0',
      sourceRevision: calcProject.sourceRevision,
      operatorApproved: true,
      requestedAt: '2026-03-29T10:00:00.000Z',
      commandId: 'prismpm_check',
      projectRelativePath: 'examples/Calculator',
      sourcePackage: tamperedManifest,
    });
    expect(dispatchRes.ok).toBe(false);
    if (!dispatchRes.ok) {
      expect(dispatchRes.diagnostic.code).toBe('INVALID_SOURCE_PACKAGE_HASH');
    }
  });

  it('5. rejects duplicate and stale out-of-order job status responses in both client watermark tracker and job_status runnable', async () => {
    const dupSnapshot = {
      jobId: 'wm-job-300',
      workspace: 'uor-offline-foundry',
      flowPath: 'u/foundry/calculator_verify_flow',
      state: 'RUNNING' as const,
      sequence: 5,
      updatedAt: '2026-03-29T10:01:00.000Z',
      logs: ['Stage RUNNING'],
    };
    const dupKey = `${dupSnapshot.jobId}:${dupSnapshot.sequence}:${dupSnapshot.updatedAt}:${dupSnapshot.state}`;

    const runnableDup = await jobStatusMain({
      jobId: 'wm-job-300',
      workspace: 'uor-offline-foundry',
      seenResponseKeys: [dupKey],
      readOnlyLookup: async () => dupSnapshot,
    });
    expect(runnableDup.found).toBe(false);
    expect(runnableDup.status).toBe('DUPLICATE_JOB_RESPONSE');

    const runnableStale = await jobStatusMain({
      jobId: 'wm-job-300',
      workspace: 'uor-offline-foundry',
      lastKnownSequence: 5,
      readOnlyLookup: async () => ({
        ...dupSnapshot,
        state: 'QUEUED',
        sequence: 3,
      }),
    });
    expect(runnableStale.found).toBe(false);
    expect(runnableStale.status).toBe('STALE_JOB_RESPONSE');

    let callIndex = 0;
    const baseRecord = {
      jobId: 'wm-job-301',
      projectId: calcProject.id,
      workflowId: calcProject.workflowId,
      workflowName: 'Calculator Verification',
      flowPath: 'u/foundry/calculator_verify_flow',
      flowVersion: '1.0.0',
      sourceRevision: calcProject.sourceRevision,
      idempotencyKey: 'idem-301',
      state: 'RUNNING' as const,
      startedAt: '2026-03-29T10:00:00.000Z',
      logs: ['Stage RUNNING'],
      artifactRefs: [],
      evidenceRefs: [],
      retryAvailable: false,
      isSyntheticFixture: false,
      flowRegisteredInWorkspace: true,
    };

    const responses = [
      {
        ok: true as const,
        workspace: 'uor-offline-foundry',
        sequence: 10,
        updatedAt: '2026-03-29T10:01:00.000Z',
        record: { ...baseRecord, state: 'COMPLETED' as const },
      },
      // Exact duplicate response
      {
        ok: true as const,
        workspace: 'uor-offline-foundry',
        sequence: 10,
        updatedAt: '2026-03-29T10:01:00.000Z',
        record: { ...baseRecord, state: 'COMPLETED' as const },
      },
      // Regressed sequence and terminal->non-terminal state regression
      {
        ok: true as const,
        workspace: 'uor-offline-foundry',
        sequence: 8,
        updatedAt: '2026-03-29T10:00:30.000Z',
        record: { ...baseRecord, state: 'RUNNING' as const },
      },
    ];

    const service = new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY', {
      async probeHealth() {
        return {
          reachable: true,
          workspace: 'uor-offline-foundry',
          authenticated: true,
          permissionsValidated: true,
          registeredRunnables: [
            'backend/runtime_health.ts',
            'backend/intake_validate.ts',
            'backend/job_status.ts',
          ],
          registeredFlows: ['u/foundry/calculator_verify_flow'],
          wmillContractStatus: 'LOCAL_PROXY_VALIDATED',
        };
      },
      async fetchJobById() {
        const res = responses[Math.min(callIndex, responses.length - 1)];
        callIndex += 1;
        return res;
      },
    });

    await service.checkRuntimeHealth();

    const first = await service.getJobStatusAndResult('wm-job-301');
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.record.state).toBe('COMPLETED');
    }

    const secondDup = await service.getJobStatusAndResult('wm-job-301');
    expect(secondDup.ok).toBe(false);
    if (!secondDup.ok) {
      expect(secondDup.diagnostic.code).toBe('DUPLICATE_JOB_RESPONSE');
    }

    const thirdStale = await service.getJobStatusAndResult('wm-job-301');
    expect(thirdStale.ok).toBe(false);
    if (!thirdStale.ok) {
      expect(thirdStale.diagnostic.code).toBe('STALE_JOB_RESPONSE');
    }
  });

  it('6. performs authenticated read-only job retrieval when runtime health and workspace are verified', async () => {
    const service = new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY', {
      async probeHealth() {
        return {
          reachable: true,
          workspace: 'uor-offline-foundry',
          authenticated: true,
          permissionsValidated: true,
          registeredRunnables: [
            'backend/runtime_health.ts',
            'backend/intake_validate.ts',
            'backend/job_status.ts',
          ],
          registeredFlows: ['u/foundry/calculator_verify_flow'],
          wmillContractStatus: 'LOCAL_PROXY_VALIDATED',
        };
      },
      async fetchJobById(jobId) {
        return {
          ok: true,
          workspace: 'uor-offline-foundry',
          sequence: 1,
          updatedAt: '2026-03-29T12:00:00.000Z',
          record: {
            jobId,
            projectId: calcProject.id,
            workflowId: calcProject.workflowId,
            workflowName: 'Calculator Intake & Check',
            flowPath: 'u/foundry/calculator_verify_flow',
            flowVersion: '1.0.0',
            sourceRevision: calcProject.sourceRevision,
            idempotencyKey: 'idem-readonly-ok',
            state: 'COMPLETED',
            startedAt: '2026-03-29T11:59:50.000Z',
            finishedAt: '2026-03-29T12:00:00.000Z',
            durationMs: 10000,
            logs: ['prismpm check examples/Calculator -> 0 errors'],
            structuredResult: { stage: 'CHECK', exitCode: 0 },
            artifactRefs: [],
            evidenceRefs: [],
            retryAvailable: false,
            isSyntheticFixture: false,
            flowRegisteredInWorkspace: true,
          },
        };
      },
      async listJobs() {
        return {
          ok: true,
          workspace: 'uor-offline-foundry',
          records: [
            {
              jobId: 'wm-real-job-running-1',
              projectId: calcProject.id,
              workflowId: calcProject.workflowId,
              workflowName: 'Calculator Build',
              flowPath: 'f/uor_foundry/prismpm_build_locked',
              flowVersion: '1.0.0',
              sourceRevision: calcProject.sourceRevision,
              idempotencyKey: 'idem-run-1',
              state: 'RUNNING',
              startedAt: '2026-03-29T12:01:00.000Z',
              logs: ['Compiling Core-Wasm guest'],
              artifactRefs: [],
              evidenceRefs: [],
              retryAvailable: false,
              isSyntheticFixture: false,
              flowRegisteredInWorkspace: true,
            },
            {
              jobId: 'wm-real-job-built-1',
              projectId: calcProject.id,
              workflowId: calcProject.workflowId,
              workflowName: 'Calculator Build',
              flowPath: 'f/uor_foundry/prismpm_build_locked',
              flowVersion: '1.0.0',
              sourceRevision: calcProject.sourceRevision,
              idempotencyKey: 'idem-built-1',
              state: 'COMPLETED',
              startedAt: '2026-03-29T12:00:00.000Z',
              finishedAt: '2026-03-29T12:00:40.000Z',
              logs: ['Produced Calculator.holo'],
              structuredResult: { stage: 'BUILD', exitCode: 0 },
              artifactRefs: ['art-prism-calc-holo'],
              evidenceRefs: [],
              retryAvailable: false,
              isSyntheticFixture: false,
              flowRegisteredInWorkspace: true,
            },
            {
              jobId: 'wm-real-job-verified-1',
              projectId: calcProject.id,
              workflowId: calcProject.workflowId,
              workflowName: 'Calculator Independent Verification',
              flowPath: 'f/uor_foundry/prismpm_verify',
              flowVersion: '1.0.0',
              sourceRevision: calcProject.sourceRevision,
              idempotencyKey: 'idem-ver-1',
              state: 'COMPLETED',
              startedAt: '2026-03-29T12:02:00.000Z',
              finishedAt: '2026-03-29T12:02:30.000Z',
              logs: ['15-gate VV passed twice'],
              structuredResult: { stage: 'VERIFY', exitCode: 0 },
              artifactRefs: ['art-prism-calc-holo'],
              evidenceRefs: ['ev-prismpm-vv-1'],
              retryAvailable: false,
              isSyntheticFixture: false,
              flowRegisteredInWorkspace: true,
            },
          ],
        };
      },
    });

    const health = await service.checkRuntimeHealth();
    expect(health.readOnlyHealthVerified).toBe(true);
    expect(health.dispatchEnabled).toBe(true);

    const lookup = await service.getJobStatusAndResult('wm-real-job-calc-42');
    expect(lookup.ok).toBe(true);
    if (lookup.ok) {
      expect(lookup.record.jobId).toBe('wm-real-job-calc-42');
      expect(lookup.record.isSyntheticFixture).toBe(false);
      expect(lookup.record.flowPath).toBe('u/foundry/calculator_verify_flow');
    }

    const recentRegistry = await service.listApprovedExecutionHistory(calcProject.id);
    expect(recentRegistry.ok).toBe(true);
    expect(recentRegistry.records.map((r) => classifyWindmillJobEvidenceStage(r))).toEqual([
      'RUNNING',
      'BUILT',
      'VERIFIED',
    ]);
  });

  it('7. refuses production release without independent verification evidence and human release approval across Calculator handoff and 7-state lifecycle', async () => {
    const manifest = await buildSourcePackageManifest({
      project: calcProject,
      workspace: calcProject.authoringWorkspace!,
      reviewConfirmed: true,
      reviewSummary: 'Reviewed Calculator source package',
      targetDestination: 'MAC_STUDIO_UOR_OFFLINE_FOUNDRY',
    });

    const validation = await validateSourcePackageForRuntimeHandoff({
      rawOrManifest: manifest,
      expectedProject: calcProject,
      expectedWorkspace: 'uor-offline-foundry',
    });
    expect(validation.valid).toBe(true);

    const preview = buildCalculatorRuntimeHandoffPreview({
      project: calcProject,
      manifest,
    });
    expect(preview.readOnlyValidationStages.map((s) => s.stageContractName)).toEqual([
      'INTAKE',
      'SPECIFY',
      'LOCK',
      'CHECK',
    ]);

    const localService = new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY');
    const handoffFlow = await executeCalculatorIntakeHandoffFlow({
      project: calcProject,
      rawOrManifest: manifest,
      operatorConfirmed: true,
      windmillService: localService,
      artifacts: INITIAL_ARTIFACTS.filter((a) => a.projectId === calcProject.id),
      verifications: INITIAL_VERIFICATION_SUITES.filter((v) => v.projectId === calcProject.id),
      approvals: INITIAL_APPROVALS.filter((a) => a.projectId === calcProject.id),
    });
    expect(handoffFlow.ok).toBe(true);
    expect(handoffFlow.intakeStageResult.sideEffectsExecuted).toBe(false);
    // Even with a valid source package and completed intake validation, release remains BLOCKED/PREPARED without independent verifier evidence
    expect(handoffFlow.evidenceLifecycle.currentState).not.toBe('VERIFIED');
    expect(handoffFlow.evidenceLifecycle.currentState).not.toBe('RELEASE APPROVED');
    expect(handoffFlow.evidenceLifecycle.releaseEligible).toBe(false);

    // Simulate a genuine BUILT artifact on disk with verified SHA-256, but no independent Lean4/UOR verification
    const builtOnlyLifecycle = evaluateAuthoritativeEvidenceLifecycle({
      project: calcProject,
      health: {
        mode: 'LOCAL',
        deploymentOption: 'VITE_AUTHENTICATED_LOCAL_PROXY',
        workspace: 'uor-offline-foundry',
        endpoint: '/api/windmill/health -> http://127.0.0.1:8080',
        reachable: true,
        authenticated: true,
        permissionsValidated: true,
        checkedAt: '2026-03-29T12:00:00.000Z',
        registeredRunnables: [
          'backend/runtime_health.ts',
          'backend/intake_validate.ts',
          'backend/job_status.ts',
        ],
        registeredFlows: ['u/foundry/calculator_verify_flow'],
        wmillContractStatus: 'LOCAL_PROXY_VALIDATED',
        readOnlyHealthVerified: true,
        dispatchEnabled: true,
        diagnosticMessage: 'Connected',
      },
      sourcePackageValidated: true,
      activeJobRecords: [
        {
          jobId: 'wm-real-build-1',
          projectId: calcProject.id,
          workflowId: calcProject.workflowId,
          workflowName: 'Calculator Build',
          flowPath: 'u/foundry/calculator_verify_flow',
          flowVersion: '1.0.0',
          sourceRevision: calcProject.sourceRevision,
          idempotencyKey: 'idem-build-1',
          state: 'COMPLETED',
          startedAt: '2026-03-29T12:00:00.000Z',
          logs: [],
          artifactRefs: ['art-prism-calc-holo'],
          evidenceRefs: [],
          retryAvailable: false,
          isSyntheticFixture: false,
          flowRegisteredInWorkspace: true,
        },
      ],
      artifacts: INITIAL_ARTIFACTS.filter((a) => a.projectId === calcProject.id).map((a) => ({
        ...a,
        isSyntheticFixture: false,
        fileExistsOnDisk: true,
        sha256Verified: true,
        artifactState: 'BUILT' as const,
        originClassification: 'PRODUCTION_ARTIFACT' as const,
        verificationState: 'PREFLIGHT_CHECKED' as const,
      })),
      verifications: INITIAL_VERIFICATION_SUITES.filter((v) => v.projectId === calcProject.id),
      approvals: INITIAL_APPROVALS.filter((a) => a.projectId === calcProject.id),
    });

    expect(builtOnlyLifecycle.currentState).toBe('BUILT');
    expect(builtOnlyLifecycle.releaseEligible).toBe(false);
    expect(
      builtOnlyLifecycle.states.find((s) => s.state === 'BUILT')?.satisfied
    ).toBe(true);
    expect(
      builtOnlyLifecycle.states.find((s) => s.state === 'VERIFIED')?.satisfied
    ).toBe(false);
    expect(
      builtOnlyLifecycle.states.find((s) => s.state === 'BLOCKED')?.satisfied
    ).toBe(true);
    expect(
      builtOnlyLifecycle.states.find((s) => s.state === 'RELEASE APPROVED')?.satisfied
    ).toBe(false);
  });

  it('8. executes read-only acceptance verification for runtime health, registered runnables, and genuine job-status retrieval with compiler execution and release disabled', async () => {
    // 1. Canonical port, workspace, and runnable inventory reconciliation
    expect(WINDMILL_TARGET_CONFIG.baseUrl).toBe('http://127.0.0.1:8080');
    expect(WINDMILL_TARGET_CONFIG.workspace).toBe('uor-offline-foundry');
    expect(CANONICAL_RAW_APP_RUNNABLES).toEqual([
      'backend/runtime_health.ts',
      'backend/intake_validate.ts',
      'backend/job_status.ts',
      'backend/local_ai_advisory.ts',
      'backend/workflow_dispatch.ts',
      'backend/prism_stage_dispatch.ts',
    ]);
    expect(FIXED_WINDMILL_COMMAND_REGISTRY).toHaveLength(16);

    // 2. Read-only runtime_health runnable verification (compiler & release disabled)
    const healthReport = await runtimeHealthMain('uor-offline-foundry', {
      authenticatedSession: true,
      registeredRunnables: [...CANONICAL_RAW_APP_RUNNABLES],
      registeredFlows: [],
    });
    expect(healthReport.workspace).toBe('uor-offline-foundry');
    expect(healthReport.packagingStatus).toBe('REGISTERED_READ_ONLY_VERIFIED');
    expect(healthReport.readOnlyHealthVerified).toBe(true);
    expect(healthReport.liveExecutionEnabled).toBe(false);
    expect(healthReport.releaseAuthorityDelegated).toBe(false);
    expect(healthReport.canonicalRegistryCommandCount).toBe(16);
    expect(healthReport.registeredRunnables).toHaveLength(6);

    // 3. Generated wmill.ts contract acceptance check
    const mockGeneratedWmill = {
      backend: {
        runtime_health: async () => healthReport,
        intake_validate: async () => ({ valid: true }),
      },
      backendAsync: {
        local_ai_advisory: async () => 'job-1',
        workflow_dispatch: async () => 'job-2',
        prism_stage_dispatch: async () => 'job-3',
        job_status: async () => 'job-4',
      },
      getJob: async (id: string) => ({ id, running: false, success: true }),
      waitJob: async () => ({}),
      streamJob: async () => undefined,
    };
    const contractCheck = wmillContract.verifyGeneratedWmillContract(mockGeneratedWmill);
    expect(contractCheck.valid).toBe(true);
    expect(contractCheck.status).toBe('WMILL_CONTRACT_VALIDATED');
    expect(contractCheck.missingBindings).toEqual([]);

    // 4. Genuine read-only job_status retrieval without side effects
    const readOnlyJobResult = await jobStatusMain({
      jobId: 'wm-readonly-accept-01',
      workspace: 'uor-offline-foundry',
      readOnlyLookup: async (jobId, workspace) => ({
        jobId,
        workspace,
        flowPath: 'f/uor_foundry/prismpm_verify',
        stageId: 'verify',
        commandId: 'prismpm_verify',
        state: 'COMPLETED',
        sequence: 1,
        updatedAt: '2026-03-29T12:15:00.000Z',
        logs: ['Read-only job snapshot retrieved from Windmill'],
        evidenceRefs: ['ev-accept-01'],
      }),
    });
    expect(readOnlyJobResult.found).toBe(true);
    expect(readOnlyJobResult.status).toBe('RETRIEVED_READ_ONLY');
    expect(readOnlyJobResult.snapshot?.jobId).toBe('wm-readonly-accept-01');
  });
});

