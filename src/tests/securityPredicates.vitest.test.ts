import { describe, expect, it } from 'vitest';
import {
  DemoWindmillExecutionService,
  prepareRustWorkspaceModelContract,
} from '../shared/adapters/windmillExecutionService';
import {
  DEMO_WINDMILL_JOB_FIXTURES,
  INITIAL_APPROVALS,
  INITIAL_ARTIFACTS,
  INITIAL_PROJECTS,
  INITIAL_VERIFICATION_SUITES,
} from '../shared/data/seedFoundryData';
import { REVIEWED_SOURCES_REGISTER } from '../shared/data/sourceComplianceRegister';
import { sourceComplianceService } from '../shared/services/sourceComplianceService';
import {
  foundrySyncService,
  sanitizeExportBundle,
} from '../shared/services/syncService';
import { verificationAuthorityService } from '../shared/services/verificationAuthorityService';
import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ProjectRecord,
  VerificationSuiteRecord,
} from '../shared/types/foundry';

describe('UOR Foundry Security & Compliance Predicates (Vitest)', () => {
  it('enforces explicit APPROVED_FOR_RELEASE and rejects APPROVED_FOR_TEST_SIMULATION even when all verifier suites pass', () => {
    const project = INITIAL_PROJECTS[0];
    const digest = INITIAL_ARTIFACTS[0].sha256Digest;
    const policy = verificationAuthorityService.getPolicyForProductFamily(project.productFamily)!;

    const fullPassingSuites: VerificationSuiteRecord[] = policy.requiredSuites.map((req, idx) => ({
      id: `pass-${idx}`,
      projectId: project.id,
      suiteId: req.suiteId,
      suiteVersion: req.minSuiteVersion,
      suiteName: req.suiteLabel,
      authority: req.authority,
      status: 'PASS',
      epistemicCondition: 'DOCUMENTED',
      evidenceId: `ev-auth-${idx}`,
      sourceRevision: project.sourceRevision,
      toolchainIdentity: 'local-signed-verifier@1.0',
      executionRecord: 'Signed local replay passed',
      authenticExecutionRef: `urn:uor:replay:auth-${idx}`,
      evidenceProvenance: 'mac-studio-hardware-key-v1',
      authenticationStatus: 'AUTHENTICATED_BY_VERIFIER',
      policyVersion: policy.policyVersion,
      artifactHash: digest,
      lastCheckedAt: '2026-11-15T10:00:00Z',
      isSimulated: false,
      blockingForRelease: true,
      notes: 'Synthetic test fixture',
    }));

    const testOnlyApproval: ApprovalDecisionRecord = {
      id: 'apr-test-only',
      projectId: project.id,
      gate: 'EXECUTION_AUTHORIZATION',
      authorizationScope: 'TEST_EXECUTION',
      title: 'Test run auth',
      requiredRole: 'Operator',
      authorizedReviewer: 'Jane Operator',
      authenticatedApproverId: 'op-jane-01',
      disposition: 'APPROVED_FOR_TEST_SIMULATION',
      aiPermitted: false,
      isSimulated: false,
      artifactDigest: digest,
      sourceRevision: project.sourceRevision,
      evidenceRefs: fullPassingSuites.map((s) => s.evidenceId),
      policyVersion: policy.policyVersion,
      rationale: 'Test execution only',
      decidedAt: '2026-11-15T10:05:00Z',
      policyReference: policy.policyId,
    };

    const blockedResult = verificationAuthorityService.evaluateProjectAuthority(
      {
        project,
        verifications: fullPassingSuites,
        artifacts: INITIAL_ARTIFACTS,
        approvals: [testOnlyApproval],
      },
      {
        authenticateVerifierRecord: () => true,
        authenticateHumanApprover: () => true,
      }
    );

    expect(blockedResult.overallVerificationState).toBe('VERIFIED');
    expect(blockedResult.releaseEligible).toBe(false);
    expect(blockedResult.releaseStatusLabel).toBe('RELEASE BLOCKED');
    expect(blockedResult.blockingReasons.join(' ')).toContain('APPROVED_FOR_TEST_SIMULATION');

    const explicitReleaseApproval: ApprovalDecisionRecord = {
      id: 'apr-prod-release',
      projectId: project.id,
      gate: 'RELEASE_AUTHORIZATION',
      authorizationScope: 'PRODUCTION_RELEASE',
      title: 'Production Release',
      requiredRole: 'UOR Release Governance Board',
      authorizedReviewer: 'Alice Governance',
      authenticatedApproverId: 'gov-alice-01',
      disposition: 'APPROVED_FOR_RELEASE',
      aiPermitted: false,
      isSimulated: false,
      artifactDigest: digest,
      sourceRevision: project.sourceRevision,
      evidenceRefs: fullPassingSuites.map((s) => s.evidenceId),
      policyVersion: policy.policyVersion,
      rationale: 'All 5 independent suites verified and bound.',
      decidedAt: '2026-11-15T10:10:00Z',
      policyReference: policy.policyId,
    };

    const eligibleResult = verificationAuthorityService.evaluateProjectAuthority(
      {
        project,
        verifications: fullPassingSuites,
        artifacts: INITIAL_ARTIFACTS,
        approvals: [explicitReleaseApproval],
      },
      {
        authenticateVerifierRecord: () => true,
        authenticateHumanApprover: () => true,
      }
    );

    expect(eligibleResult.releaseEligible).toBe(true);
    expect(eligibleResult.releaseStatusLabel).toBe('ELIGIBLE_FOR_PRODUCTION_RELEASE');
  });

  it('rejects approvals with AI approver identity, digest mismatch, or unauthenticated verifier records', () => {
    const project = INITIAL_PROJECTS[0];
    const artifact: ArtifactProvenanceRecord = INITIAL_ARTIFACTS[0];
    const policy = verificationAuthorityService.getPolicyForProductFamily(project.productFamily)!;

    const suites: VerificationSuiteRecord[] = policy.requiredSuites.map((req, idx) => ({
      id: `s-${idx}`,
      projectId: project.id,
      suiteId: req.suiteId,
      suiteVersion: req.minSuiteVersion,
      suiteName: req.suiteLabel,
      authority: req.authority,
      status: 'PASS',
      epistemicCondition: 'DOCUMENTED',
      evidenceId: `ev-${idx}`,
      sourceRevision: project.sourceRevision,
      toolchainIdentity: 'lean4.32.1',
      executionRecord: 'Passed',
      authenticExecutionRef: `urn:uor:run:${idx}`,
      evidenceProvenance: 'signed-local',
      authenticationStatus: 'AUTHENTICATED_BY_VERIFIER',
      policyVersion: policy.policyVersion,
      artifactHash: artifact.sha256Digest,
      lastCheckedAt: '2026-11-15T10:00:00Z',
      isSimulated: false,
      blockingForRelease: true,
      notes: '',
    }));

    // Default fail-closed trust context rejects even PASS records without live oracle
    const defaultUntrusted = verificationAuthorityService.evaluateProjectAuthority({
      project,
      verifications: suites,
      artifacts: [artifact],
      approvals: INITIAL_APPROVALS,
    });
    expect(defaultUntrusted.overallVerificationState).toBe('NOT VERIFIED');
    expect(defaultUntrusted.releaseEligible).toBe(false);

    // Mismatched artifact digest & AI reviewer identity must fail
    const forgedRelease: ApprovalDecisionRecord = {
      id: 'apr-forged',
      projectId: project.id,
      gate: 'RELEASE_AUTHORIZATION',
      authorizationScope: 'PRODUCTION_RELEASE',
      title: 'Forged Release',
      requiredRole: 'Board',
      authorizedReviewer: 'AI Assistant',
      authenticatedApproverId: 'ai-assistant-bot',
      disposition: 'APPROVED_FOR_RELEASE',
      aiPermitted: false,
      isSimulated: false,
      artifactDigest: '0'.repeat(64),
      sourceRevision: project.sourceRevision,
      evidenceRefs: suites.map((s) => s.evidenceId),
      policyVersion: policy.policyVersion,
      rationale: 'Forged',
      decidedAt: '2026-11-15T10:10:00Z',
      policyReference: policy.policyId,
    };

    const rejected = verificationAuthorityService.evaluateProjectAuthority(
      {
        project,
        verifications: suites,
        artifacts: [artifact],
        approvals: [forgedRelease],
      },
      {
        authenticateVerifierRecord: () => true,
        authenticateHumanApprover: () => true,
      }
    );
    expect(rejected.releaseEligible).toBe(false);
    expect(rejected.blockingReasons.join(' ')).toContain('human approver identity');
    expect(rejected.blockingReasons.join(' ')).toContain('artifact digest does not match');
  });

  it('keeps Source Review & Compliance fail-closed and distinguishes docs/historical runs from qualification', () => {
    expect(REVIEWED_SOURCES_REGISTER.map((s) => s.id)).toEqual([
      'rule30',
      'prism-devrel',
      'stitch',
      'uorust',
    ]);
    for (const src of REVIEWED_SOURCES_REGISTER) {
      expect(src.reviewedCommitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(['REFERENCE ONLY', 'CANDIDATE']).toContain(src.integrationStatus);
    }

    // Rule 30 must preserve open Prize Problem 1 & aperiodic-compensation
    const rule30 = REVIEWED_SOURCES_REGISTER.find((s) => s.id === 'rule30')!;
    const p1 = rule30.claims.find((c) => c.id === 'problem1');
    const aperiodic = rule30.claims.find((c) => c.id === 'aperiodic-compensation');
    expect(p1?.state).toBe('untested');
    expect(aperiodic?.state).toBe('blocked');

    // Stitch must preserve C1..C6 non-verified/refuted states
    const stitch = REVIEWED_SOURCES_REGISTER.find((s) => s.id === 'stitch')!;
    expect(stitch.claims.some((c) => c.state === 'refuted')).toBe(true);
    expect(stitch.claims.some((c) => c.state === 'blocked')).toBe(true);

    // Non-UORust project assesses UORust requirement as NOT APPLICABLE before evaluation
    const calcProject = INITIAL_PROJECTS[0];
    const calcAssessment = sourceComplianceService.assessProjectCompliance({
      project: calcProject,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    const rustReq = calcAssessment.requirements.find((r) => r.id === 'REQ-UORUST-SPAN-REFUSALS');
    expect(rustReq?.applicable).toBe(false);
    expect(rustReq?.statusLabel).toBe('NOT APPLICABLE');
    expect(rustReq?.satisfied).toBe(false);
    expect(calcAssessment.currentQualificationState).toBe('NOT VERIFIED');
    expect(calcAssessment.releaseBlockers.length).toBeGreaterThan(0);
  });

  it('sanitizes air-gapped export bundles strictly and rejects hostile/credential fields', () => {
    const projectWithSecrets: ProjectRecord & Record<string, unknown> = {
      ...INITIAL_PROJECTS[0],
      apiToken: 'Bearer secret-token-12345',
      conversations: [{ body: 'private chat' }],
      nested: { credential: 'top-secret' },
    };

    const bundle = foundrySyncService.buildAirGappedBundle({
      integrationMode: 'DEMO',
      operatorConfirmed: true,
      projects: [projectWithSecrets],
      artifacts: INITIAL_ARTIFACTS,
      operations: [],
    });

    const sanitized = sanitizeExportBundle({
      ...bundle,
      secretPassword: 'drop-me',
      chatMessages: ['must-strip'],
    });

    const json = JSON.stringify(sanitized);
    expect(json).not.toContain('secret-token-12345');
    expect(json).not.toContain('drop-me');
    expect(json).not.toContain('private chat');
    expect(json).not.toContain('must-strip');
    expect(json).not.toContain('top-secret');
    expect(sanitized.importDisabled).toBe(true);
    expect(sanitized.autoReplayPermitted).toBe(false);
  });

  it('blocks live Windmill dispatch in DEMO mode and prepares fail-closed UORust contract', async () => {
    const demoWindmill = new DemoWindmillExecutionService({
      fixtures: DEMO_WINDMILL_JOB_FIXTURES,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
    });

    const uorustContract = prepareRustWorkspaceModelContract({
      projectId: 'proj-rust-demo',
      sourceRevision: 'UORust/main@2a2b674f',
      declaredInputs: 'Cargo.toml, Cargo.lock',
    });

    expect(uorustContract.flowPath).toBe('f/uor_foundry/uorust_model_workspace');
    expect(uorustContract.flowRegisteredInWorkspace).toBe(false);
    expect(uorustContract.browserCargoExecutionAllowed).toBe(false);

    const dispatchResult = await demoWindmill.submitAuthorizedWorkflow(uorustContract.request);
    expect(dispatchResult.ok).toBe(false);
    if (!dispatchResult.ok) {
      expect(dispatchResult.diagnostic.code).toBe('SANDBOX_ISOLATED');
    }
  });
});
