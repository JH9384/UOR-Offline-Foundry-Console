import { describe, expect, it } from 'vitest';
import {
  CanonicalCommandId,
  FIXED_WINDMILL_COMMAND_REGISTRY,
} from '../shared/adapters/windmillCommandRegistry';
import {
  executeGovernedWorkflowContract,
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
