import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

    // 2. Truthful runtime_health runnable verification: user-supplied authenticatedSession and registeredRunnables are ignored
    const healthReport = await runtimeHealthMain('uor-offline-foundry', {
      authenticatedSession: true,
      registeredRunnables: [...CANONICAL_RAW_APP_RUNNABLES],
      registeredFlows: ['u/foundry/calculator_verify_flow'],
    });
    expect(healthReport.workspace).toBe('uor-offline-foundry');
    expect(healthReport.untrustedInputIgnored).toBe(true);
    expect(healthReport.packagingStatus).toBe('PREPARED_NOT_VERIFIED');
    expect(healthReport.readOnlyHealthVerified).toBe(false);
    expect(healthReport.liveExecutionEnabled).toBe(false);
    expect(healthReport.compilerDispatchEnabled).toBe(false);
    expect(healthReport.workflowExecutionEnabled).toBe(false);
    expect(healthReport.lmStudioResourceBound).toBe(false);
    expect(healthReport.releaseAuthorityDelegated).toBe(false);
    expect(healthReport.triggersEnabled).toBe(false);
    expect(healthReport.canonicalRegistryCommandCount).toBe(16);
    expect(healthReport.preparedRunnables).toHaveLength(6);
    expect(healthReport.registeredRunnables).toEqual([]);
    expect(healthReport.registeredFlows).toEqual([]);
    expect(healthReport.checks.sessionAuthentication).toBe('UNVERIFIED');
    expect(healthReport.checks.runnableRegistration).toBe('UNVERIFIED');
    expect(healthReport.checks.flowRegistration).toBe('UNVERIFIED');

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

  it('9. verifies standalone Windmill runnable bundling with zero relative imports and truthful worker environment vs unknown registration status', async () => {
    const repoRoot = process.cwd();
    const relativeImportRegex =
      /(?:from|import)\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/;

    // 1. Canonical backend/runtime_health.ts has zero relative imports (no ./generated_command_registry.ts 404)
    const canonicalRuntimeHealthSrc = fs.readFileSync(
      path.join(repoRoot, 'uor_foundry.raw_app/backend/runtime_health.ts'),
      'utf8'
    );
    expect(relativeImportRegex.test(canonicalRuntimeHealthSrc)).toBe(false);
    expect(canonicalRuntimeHealthSrc).not.toContain('./generated_command_registry.ts');

    // 2. All 6 standalone bundled runnables in uor_foundry.raw_app/dist/windmill/ exist and have zero relative imports
    const bundledRunnables = [
      'runtime_health.ts',
      'intake_validate.ts',
      'job_status.ts',
      'local_ai_advisory.ts',
      'workflow_dispatch.ts',
      'prism_stage_dispatch.ts',
    ];
    for (const filename of bundledRunnables) {
      const bundledPath = path.join(
        repoRoot,
        'uor_foundry.raw_app/dist/windmill',
        filename
      );
      expect(fs.existsSync(bundledPath)).toBe(true);
      const bundledContent = fs.readFileSync(bundledPath, 'utf8');
      expect(relativeImportRegex.test(bundledContent)).toBe(false);
    }

    // 3. Execute bundled standalone runtime_health.ts and verify worker env detection & unknown check preservation
    const prevWs = process.env.WM_WORKSPACE;
    const prevJobId = process.env.WM_JOB_ID;
    try {
      process.env.WM_WORKSPACE = 'uor-offline-foundry';
      process.env.WM_JOB_ID = 'wm-bun-worker-smoke-001';

      const bundledRuntimeHealthUrl = pathToFileURL(
        path.join(repoRoot, 'uor_foundry.raw_app/dist/windmill/runtime_health.ts')
      ).href;
      const bundledHealthMod = (await import(
        /* @vite-ignore */ bundledRuntimeHealthUrl
      )) as { main: typeof runtimeHealthMain };
      const workerResult = await bundledHealthMod.main('uor-offline-foundry', {
        authenticatedSession: true,
        registeredRunnables: ['backend/runtime_health.ts'],
      });

      expect(workerResult.checks.workspaceAllowed).toBe(true);
      expect(workerResult.checks.workerEnvironment).toBe('VERIFIED');
      // Even inside a worker, unknown session/runnable/flow checks remain UNVERIFIED and caller claims are ignored
      expect(workerResult.untrustedInputIgnored).toBe(true);
      expect(workerResult.checks.sessionAuthentication).toBe('UNVERIFIED');
      expect(workerResult.checks.runnableRegistration).toBe('UNVERIFIED');
      expect(workerResult.checks.flowRegistration).toBe('UNVERIFIED');
      expect(workerResult.readOnlyHealthVerified).toBe(false);
      expect(workerResult.packagingStatus).toBe('PREPARED_NOT_VERIFIED');
      expect(workerResult.registeredRunnables).toEqual([]);
      expect(workerResult.liveExecutionEnabled).toBe(false);
      expect(workerResult.compilerDispatchEnabled).toBe(false);
      expect(workerResult.workflowExecutionEnabled).toBe(false);
      expect(workerResult.triggersEnabled).toBe(false);

      // Unauthorized worker WM_WORKSPACE fails closed even when caller passes 'uor-offline-foundry'
      process.env.WM_WORKSPACE = 'unauthorized-worker-ws';
      await expect(bundledHealthMod.main('uor-offline-foundry')).rejects.toThrow(
        /Unauthorized Windmill worker workspace/
      );
    } finally {
      if (prevWs === undefined) delete process.env.WM_WORKSPACE;
      else process.env.WM_WORKSPACE = prevWs;
      if (prevJobId === undefined) delete process.env.WM_JOB_ID;
      else process.env.WM_JOB_ID = prevJobId;
    }
  });

  it('10. exercises the local Windmill acceptance test runner (windmill:test) offline with credential redaction, loopback enforcement, and all 7 positive/negative read-only checks', async () => {
    const repoRoot = process.cwd();
    const runnerUrl = pathToFileURL(
      path.join(repoRoot, 'scripts/windmill-local-test.mjs')
    ).href;
    const runnerMod = (await import(/* @vite-ignore */ runnerUrl)) as {
      DEFAULT_WINDMILL_BASE_URL: string;
      TARGET_WINDMILL_WORKSPACE: string;
      redactToken: (text: string, token: string) => string;
      validateLocalBaseUrl: (baseUrl: string) => string;
      runLocalWindmillAcceptanceSuite: (opts: {
        baseUrl?: string;
        workspace?: string;
        token?: string;
        fetchImpl?: (url: string, init?: RequestInit) => Promise<{
          ok: boolean;
          status: number;
          text: () => Promise<string>;
        }>;
        logger?: { log: (msg: string) => void; error: (msg: string) => void };
      }) => Promise<{
        ok: boolean;
        passed: number;
        failed: number;
        total: number;
        results: Array<{ name: string; passed: boolean; detail?: string }>;
      }>;
    };

    const secretToken = 'wm_super_secret_local_token_999';
    const loggedLines: string[] = [];
    const silentLogger = {
      log: (msg: string) => loggedLines.push(msg),
      error: (msg: string) => loggedLines.push(msg),
    };

    // 1. Token redaction and loopback URL enforcement
    expect(
      runnerMod.redactToken(`Bearer ${secretToken} failed`, secretToken)
    ).toBe('Bearer [REDACTED_WINDMILL_TOKEN] failed');
    expect(() =>
      runnerMod.validateLocalBaseUrl('https://remote-windmill.example.com')
    ).toThrow(/Refusing non-loopback Windmill base URL/);
    expect(runnerMod.validateLocalBaseUrl('http://127.0.0.1:8080')).toBe(
      'http://127.0.0.1:8080'
    );

    // 2. Missing WINDMILL_TOKEN fails closed immediately
    const noTokenSummary = await runnerMod.runLocalWindmillAcceptanceSuite({
      token: '',
      logger: silentLogger,
    });
    expect(noTokenSummary.ok).toBe(false);
    expect(noTokenSummary.passed).toBe(0);
    expect(noTokenSummary.failed).toBe(1);

    // 3. Full 7-check suite against simulated Windmill loopback API backed by the real backend runnables
    const prevWs = process.env.WM_WORKSPACE;
    const prevJobId = process.env.WM_JOB_ID;
    try {
      process.env.WM_WORKSPACE = 'uor-offline-foundry';
      process.env.WM_JOB_ID = 'wm-local-runner-job-42';

      const mockFetch = async (url: string, init?: RequestInit) => {
        const authHeader = (init?.headers as Record<string, string>)?.Authorization;
        if (authHeader !== `Bearer ${secretToken}`) {
          return {
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ error: 'Unauthorized token' }),
          };
        }
        const parsedArgs = init?.body ? JSON.parse(String(init.body)) : {};

        if (url.endsWith('/jobs/run_wait_result/p/u/admin/worker_smoke_test')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ status: 'RUNTIME_SMOKE_TEST_PASS', worker: 'bun' }),
          };
        }

        if (url.endsWith('/jobs/run_wait_result/p/u/admin/runtime_health')) {
          try {
            const res = await runtimeHealthMain(
              parsedArgs.workspace,
              parsedArgs.options
            );
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify(res),
            };
          } catch (err) {
            return {
              ok: false,
              status: 400,
              text: async () =>
                JSON.stringify({
                  error: {
                    name: 'Error',
                    message: err instanceof Error ? err.message : String(err),
                  },
                }),
            };
          }
        }

        if (url.endsWith('/jobs/run_wait_result/p/u/admin/intake_validate')) {
          const res = await intakeValidateMain(parsedArgs.input ?? parsedArgs);
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(res),
          };
        }

        if (url.endsWith('/jobs/run_wait_result/p/u/admin/job_status')) {
          const res = await jobStatusMain(parsedArgs.input ?? parsedArgs);
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(res),
          };
        }

        if (url.includes('/api/w/uor-offline-foundry/jobs/list')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify([
                {
                  id: 'wm-live-job-smoke-001',
                  workspace_id: 'uor-offline-foundry',
                  script_path: 'u/admin/worker_smoke_test',
                  created_at: '2026-03-29T12:00:00.000Z',
                  started_at: '2026-03-29T12:00:01.000Z',
                  duration_ms: 45,
                  running: false,
                  success: true,
                  result: { status: 'RUNTIME_SMOKE_TEST_PASS' },
                },
              ]),
          };
        }

        if (url.endsWith('/api/w/uor-offline-foundry/jobs_u/get/wm-live-job-smoke-001')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                id: 'wm-live-job-smoke-001',
                workspace_id: 'uor-offline-foundry',
                script_path: 'u/admin/worker_smoke_test',
                created_at: '2026-03-29T12:00:00.000Z',
                started_at: '2026-03-29T12:00:01.000Z',
                duration_ms: 45,
                running: false,
                success: true,
                result: { status: 'RUNTIME_SMOKE_TEST_PASS' },
                logs: 'Smoke test executed cleanly',
              }),
          };
        }

        return {
          ok: false,
          status: 404,
          text: async () => 'Not found',
        };
      };

      loggedLines.length = 0;
      const passSummary = await runnerMod.runLocalWindmillAcceptanceSuite({
        baseUrl: 'http://127.0.0.1:8080',
        workspace: 'uor-offline-foundry',
        token: secretToken,
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      expect(passSummary.ok).toBe(true);
      expect(passSummary.passed).toBe(8);
      expect(passSummary.failed).toBe(0);
      expect(passSummary.total).toBe(8);
      // Verify token is never printed in any log line
      expect(loggedLines.some((line) => line.includes(secretToken))).toBe(false);
      expect(
        loggedLines.some((line) =>
          line.includes('[windmill:test] Summary: 8 passed, 0 failed, 8 total')
        )
      ).toBe(true);

      // 4. Verify failure detection and exact PASS/FAIL count when a script fails or leaks token in error
      const failingFetch = async (url: string, init?: RequestInit) => {
        if (url.endsWith('/jobs/run_wait_result/p/u/admin/worker_smoke_test')) {
          throw new Error(`Connection reset with header Bearer ${secretToken}`);
        }
        return mockFetch(url, init);
      };

      loggedLines.length = 0;
      const failSummary = await runnerMod.runLocalWindmillAcceptanceSuite({
        baseUrl: 'http://127.0.0.1:8080',
        workspace: 'uor-offline-foundry',
        token: secretToken,
        fetchImpl: failingFetch,
        logger: silentLogger,
      });

      expect(failSummary.ok).toBe(false);
      expect(failSummary.passed).toBe(7);
      expect(failSummary.failed).toBe(1);
      expect(failSummary.total).toBe(8);
      expect(failSummary.results[0].passed).toBe(false);
      expect(failSummary.results[0].detail).toContain('[REDACTED_WINDMILL_TOKEN]');
      expect(failSummary.results[0].detail).not.toContain(secretToken);
      expect(loggedLines.some((line) => line.includes(secretToken))).toBe(false);
    } finally {
      if (prevWs === undefined) delete process.env.WM_WORKSPACE;
      else process.env.WM_WORKSPACE = prevWs;
      if (prevJobId === undefined) delete process.env.WM_JOB_ID;
      else process.env.WM_JOB_ID = prevJobId;
    }
  });

  it('11. verifies the local server-side read-only Windmill adapter and job_status authenticated HTTP lookup while keeping credentials server-side and dispatch disabled', async () => {
    const {
      createServerSideWindmillReadOnlyTransport,
      createBrowserProxyWindmillTransport,
    } = await import('../shared/adapters/windmillLocalReadOnlyAdapter');
    const { createAuthenticatedWindmillHttpLookup } = await import(
      '../../uor_foundry.raw_app/backend/job_status'
    );

    const serverSecret = 'wm_server_only_secret_token_777';

    // 1. Missing server-side token fails closed without leaking credentials or synthesizing fake jobs
    const unconfiguredTransport = createServerSideWindmillReadOnlyTransport({
      getToken: () => undefined,
    });
    const unconfiguredHealth = await unconfiguredTransport.probeHealth();
    expect(unconfiguredHealth.reachable).toBe(false);
    expect(unconfiguredHealth.authenticated).toBe(false);

    const unconfiguredList = await unconfiguredTransport.listJobs!();
    expect(unconfiguredList.ok).toBe(false);
    if (!unconfiguredList.ok) {
      expect(unconfiguredList.code).toBe('AUTH_NOT_VALIDATED');
    }

    // 2. Authenticated server-side read-only transport against mocked Windmill 127.0.0.1:8080
    let callCount = 0;
    const mockWindmillFetch = async (inputUrl: RequestInfo | URL, init?: RequestInit) => {
      const url = String(inputUrl);
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth !== `Bearer ${serverSecret}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (url.endsWith('/jobs/run_wait_result/p/u/admin/runtime_health')) {
        const healthBody = await runtimeHealthMain('uor-offline-foundry', {});
        return new Response(JSON.stringify(healthBody), { status: 200 });
      }

      if (url.includes('/api/w/uor-offline-foundry/jobs/list')) {
        return new Response(
          JSON.stringify([
            {
              id: '0195f000-aaaa-7000-8000-000000000001',
              workspace_id: 'uor-offline-foundry',
              script_path: 'u/admin/runtime_health',
              created_at: '2026-03-29T14:00:00.000Z',
              started_at: '2026-03-29T14:00:01.000Z',
              duration_ms: 120,
              running: false,
              success: true,
              result: {
                workspace: 'uor-offline-foundry',
                canonicalRegistryCommandCount: 16,
              },
              logs: `Executed runtime_health with token ${serverSecret}`,
            },
          ]),
          { status: 200 }
        );
      }

      if (url.endsWith('/api/w/uor-offline-foundry/jobs_u/get/0195f000-aaaa-7000-8000-000000000001')) {
        callCount += 1;
        // First two calls return sequence 2 (to test duplicate rejection on 2nd call), third call returns regressed sequence 1
        const seq = callCount <= 2 ? 2 : 1;
        const updatedAt =
          callCount <= 2 ? '2026-03-29T14:00:02.000Z' : '2026-03-29T13:59:00.000Z';
        return new Response(
          JSON.stringify({
            id: '0195f000-aaaa-7000-8000-000000000001',
            workspace_id: 'uor-offline-foundry',
            script_path: 'u/admin/runtime_health',
            created_at: '2026-03-29T14:00:00.000Z',
            started_at: '2026-03-29T14:00:01.000Z',
            duration_ms: 120,
            running: false,
            success: true,
            sequence: seq,
            updatedAt,
            result: {
              workspace: 'uor-offline-foundry',
              canonicalRegistryCommandCount: 16,
            },
            logs: `Completed with ${serverSecret}`,
          }),
          { status: 200 }
        );
      }

      return new Response('Not Found', { status: 404 });
    };

    const serverTransport = createServerSideWindmillReadOnlyTransport({
      baseUrl: 'http://127.0.0.1:8080',
      workspace: 'uor-offline-foundry',
      getToken: () => serverSecret,
      fetchImpl: mockWindmillFetch as typeof fetch,
    });

    const service = new FailClosedLocalWindmillService(
      'VITE_AUTHENTICATED_LOCAL_PROXY',
      serverTransport
    );

    const health = await service.checkRuntimeHealth();
    expect(health.reachable).toBe(true);
    expect(health.authenticated).toBe(true);
    expect(health.readOnlyHealthVerified).toBe(true);
    // Workflow dispatch remains disabled because registeredFlows is empty and dispatchFlow is undefined
    expect(health.dispatchEnabled).toBe(false);

    const historyRes = await service.listApprovedExecutionHistory();
    expect(historyRes.ok).toBe(true);
    expect(historyRes.records).toHaveLength(1);
    expect(historyRes.records[0].jobId).toBe('0195f000-aaaa-7000-8000-000000000001');
    expect(historyRes.records[0].isSyntheticFixture).toBe(false);
    expect(historyRes.records[0].structuredResult).toEqual({
      workspace: 'uor-offline-foundry',
      canonicalRegistryCommandCount: 16,
    });
    // Server secret is redacted from job logs before reaching client
    expect(JSON.stringify(historyRes)).not.toContain(serverSecret);
    expect(historyRes.records[0].logs[0]).toContain('[REDACTED_WINDMILL_TOKEN]');

    // First job status lookup succeeds
    const job1 = await service.getJobStatusAndResult(
      '0195f000-aaaa-7000-8000-000000000001'
    );
    expect(job1.ok).toBe(true);
    if (job1.ok) {
      expect(job1.record.state).toBe('COMPLETED');
      expect(JSON.stringify(job1.record)).not.toContain(serverSecret);
    }

    // Second identical job status lookup is rejected as DUPLICATE_JOB_RESPONSE
    const job2Dup = await service.getJobStatusAndResult(
      '0195f000-aaaa-7000-8000-000000000001'
    );
    expect(job2Dup.ok).toBe(false);
    if (!job2Dup.ok) {
      expect(job2Dup.diagnostic.code).toBe('DUPLICATE_JOB_RESPONSE');
    }

    // Third regressed job status lookup is rejected as STALE_JOB_RESPONSE
    const job3Stale = await service.getJobStatusAndResult(
      '0195f000-aaaa-7000-8000-000000000001'
    );
    expect(job3Stale.ok).toBe(false);
    if (!job3Stale.ok) {
      expect(job3Stale.diagnostic.code).toBe('STALE_JOB_RESPONSE');
    }

    // Direct jobStatusMain with createAuthenticatedWindmillHttpLookup also retrieves read-only snapshot & enforces watermarks
    callCount = 0;
    const directJobStatus = await jobStatusMain({
      jobId: '0195f000-aaaa-7000-8000-000000000001',
      workspace: 'uor-offline-foundry',
      readOnlyLookup: createAuthenticatedWindmillHttpLookup({
        baseUrl: 'http://127.0.0.1:8080',
        token: serverSecret,
        fetchImpl: mockWindmillFetch as typeof fetch,
      }),
    });
    expect(directJobStatus.found).toBe(true);
    expect(directJobStatus.status).toBe('RETRIEVED_READ_ONLY');
    expect(directJobStatus.snapshot?.jobId).toBe('0195f000-aaaa-7000-8000-000000000001');

    // Browser proxy transport fails closed cleanly when local server proxy is unreachable
    const unreachableProxy = createBrowserProxyWindmillTransport({
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as typeof fetch,
    });
    const proxyList = await unreachableProxy.listJobs!();
    expect(proxyList.ok).toBe(false);
  });
});



