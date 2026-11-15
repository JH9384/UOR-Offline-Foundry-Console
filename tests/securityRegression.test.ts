import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DemoWindmillExecutionService,
  FailClosedLocalWindmillService,
} from '../src/shared/adapters/windmillExecutionService.ts';
import { durableLocalStore } from '../src/shared/services/durableLocalStore.ts';
import { foundrySyncService } from '../src/shared/services/syncService.ts';
import {
  AuthorityTrustContext,
  verificationAuthorityService,
} from '../src/shared/services/verificationAuthorityService.ts';
import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  DurableOperation,
  ProjectRecord,
  VerificationSuiteAuthority,
  VerificationSuiteRecord,
} from '../src/shared/types/foundry.ts';
import { main as jobStatusMain } from '../uor_foundry.raw_app/backend/job_status.ts';
import { main as aiAdvisoryMain } from '../uor_foundry.raw_app/backend/local_ai_advisory.ts';
import { main as intakeValidateMain } from '../uor_foundry.raw_app/backend/intake_validate.ts';
import { main as workflowDispatchMain } from '../uor_foundry.raw_app/backend/workflow_dispatch.ts';

const VALID_DIGEST =
  '31795eac06fbf1d64c77ffe66b5492964c069e1f2fea41efbf6a17054cf369d7';
const OTHER_DIGEST =
  'fcc30c57c1c30e8024afb6d73a6d72caa7de7f4b909670c6a484304560a962b1';
const SOURCE_REV = 'prismpm/main@ee207ff1';
const POLICY_VERSION = '2026.11.v1';

function buildSyntheticFormalProject(): ProjectRecord {
  return {
    id: 'proj-test-formal',
    name: 'Synthetic Formal Test Target',
    productFamily: 'formal-verification',
    componentId: 'lexlean-compiler',
    workflowId: 'wf-lexlean-formal',
    purpose: 'Synthetic test target for authority policy regression suite.',
    declaredInputs: 'src/Test.lex.tex',
    environmentDeclaration: 'Synthetic test container',
    sourceRevision: SOURCE_REV,
    lifecycleStatus: 'VERIFICATION PENDING',
    createdAt: '2026-11-15T00:00:00Z',
    updatedAt: '2026-11-15T00:00:00Z',
    isSyntheticDemo: true,
    acceptancePolicySchema: 'uor.acceptance-policy.example.v1',
    releaseBlockedReasons: [],
  };
}

function buildValidArtifact(projectId: string): ArtifactProvenanceRecord {
  return {
    id: 'art-test-1',
    projectId,
    artifactName: 'test-target.holo',
    artifactFormat: 'lexlean/production-result/1',
    sha256Digest: VALID_DIGEST,
    digestMode: 'DOCUMENTED_REFERENCE_DIGEST',
    sourceRevision: SOURCE_REV,
    inputDependencies: ['src/Test.lex.tex'],
    toolchainIdentity: 'lexlean 0.4.0',
    evidenceRefs: ['ev-lex-1', 'ev-prism-1', 'ev-forge-1'],
    releaseReadiness: 'NOT_ASSESSED',
    blockingReasons: [],
    createdAt: '2026-11-15T00:00:00Z',
  };
}

function makeSuite(params: {
  id: string;
  projectId: string;
  authority: VerificationSuiteAuthority;
  suiteId: string;
  evidenceId: string;
  suiteVersion?: string;
  status?: VerificationSuiteRecord['status'];
  isSimulated?: boolean;
  artifactHash?: string;
  sourceRevision?: string;
  policyVersion?: string;
  authenticationStatus?: VerificationSuiteRecord['authenticationStatus'];
}): VerificationSuiteRecord {
  return {
    id: params.id,
    projectId: params.projectId,
    suiteId: params.suiteId,
    suiteVersion: params.suiteVersion ?? '1.0.0',
    suiteName: `${params.authority} Suite`,
    authority: params.authority,
    status: params.status ?? 'PASS',
    epistemicCondition: 'DOCUMENTED',
    evidenceId: params.evidenceId,
    sourceRevision: params.sourceRevision ?? SOURCE_REV,
    toolchainIdentity: 'synthetic-test-harness',
    executionRecord: 'Executed in synthetic test harness.',
    authenticExecutionRef: `exec-ref-${params.id}`,
    evidenceProvenance: `provenance-${params.id}`,
    authenticationStatus: params.authenticationStatus ?? 'AUTHENTICATED_BY_VERIFIER',
    policyVersion: params.policyVersion ?? POLICY_VERSION,
    artifactHash: params.artifactHash ?? VALID_DIGEST,
    lastCheckedAt: '2026-11-15T01:00:00Z',
    isSimulated: params.isSimulated ?? false,
    blockingForRelease: true,
    notes: 'Synthetic test fixture',
  };
}

function buildFullFormalSuites(projectId: string): VerificationSuiteRecord[] {
  return [
    makeSuite({
      id: 's1',
      projectId,
      authority: 'LexLean',
      suiteId: 'lexlean-kernel-proof',
      suiteVersion: '0.4.0',
      evidenceId: 'ev-lex-1',
    }),
    makeSuite({
      id: 's2',
      projectId,
      authority: 'PrismPM',
      suiteId: 'prismpm-15gate-vv',
      suiteVersion: '0.4.0',
      evidenceId: 'ev-prism-1',
    }),
    makeSuite({
      id: 's3',
      projectId,
      authority: 'Forge Kernel',
      suiteId: 'forge-kernel-abi',
      suiteVersion: '1.0.0',
      evidenceId: 'ev-forge-1',
    }),
  ];
}

function buildValidReleaseApproval(projectId: string): ApprovalDecisionRecord {
  return {
    id: 'apr-rel-valid',
    projectId,
    gate: 'RELEASE_AUTHORIZATION',
    authorizationScope: 'PRODUCTION_RELEASE',
    title: 'Production Release Authorization',
    requiredRole: 'UOR Release Governance Board',
    authorizedReviewer: 'Alice Governance',
    authenticatedApproverId: 'uid-alice-gov-001',
    disposition: 'APPROVED_FOR_RELEASE',
    aiPermitted: false,
    isSimulated: false,
    artifactDigest: VALID_DIGEST,
    sourceRevision: SOURCE_REV,
    evidenceRefs: ['ev-lex-1', 'ev-prism-1', 'ev-forge-1'],
    policyVersion: POLICY_VERSION,
    rationale: 'Synthetic release test fixture',
    decidedAt: '2026-11-15T02:00:00Z',
    policyReference: 'uor.release-policy.formal',
  };
}

const SYNTHETIC_TRUSTED_TEST_HARNESS: AuthorityTrustContext = {
  authenticateVerifierRecord: (s) =>
    s.authenticationStatus === 'AUTHENTICATED_BY_VERIFIER' && !s.isSimulated,
  authenticateHumanApprover: (a) => Boolean(a.authenticatedApproverId?.startsWith('uid-')),
};

test('1. Release Authorization Predicates', () => {
  const project = buildSyntheticFormalProject();
  const artifacts = [buildValidArtifact(project.id)];
  const suites = buildFullFormalSuites(project.id);

  // 1a. APPROVED_FOR_TEST_SIMULATION cannot authorize release
  const testOnlyApproval: ApprovalDecisionRecord = {
    ...buildValidReleaseApproval(project.id),
    authorizationScope: 'TEST_EXECUTION',
    disposition: 'APPROVED_FOR_TEST_SIMULATION',
  };
  const rTestOnly = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications: suites, artifacts, approvals: [testOnlyApproval] },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rTestOnly.overallVerificationState, 'VERIFIED');
  assert.equal(rTestOnly.releaseEligible, false);

  // 1b. Missing production-release approval blocks release
  const rMissing = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications: suites, artifacts, approvals: [] },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rMissing.releaseEligible, false);

  // 1c. AI / simulated approval blocks release
  const rSimulatedApproval = verificationAuthorityService.evaluateProjectAuthority(
    {
      project,
      verifications: suites,
      artifacts,
      approvals: [{ ...buildValidReleaseApproval(project.id), isSimulated: true }],
    },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rSimulatedApproval.releaseEligible, false);

  // 1d. Mismatched artifact digest blocks release
  const rBadDigest = verificationAuthorityService.evaluateProjectAuthority(
    {
      project,
      verifications: suites,
      artifacts,
      approvals: [{ ...buildValidReleaseApproval(project.id), artifactDigest: OTHER_DIGEST }],
    },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rBadDigest.releaseEligible, false);

  // 1e. Mismatched source revision blocks release
  const rBadRev = verificationAuthorityService.evaluateProjectAuthority(
    {
      project,
      verifications: suites,
      artifacts,
      approvals: [{ ...buildValidReleaseApproval(project.id), sourceRevision: 'prismpm/main@deadbeef' }],
    },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rBadRev.releaseEligible, false);

  // 1f. Missing authenticated human identity blocks release
  const rNoHumanId = verificationAuthorityService.evaluateProjectAuthority(
    {
      project,
      verifications: suites,
      artifacts,
      approvals: [{ ...buildValidReleaseApproval(project.id), authenticatedApproverId: undefined }],
    },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rNoHumanId.releaseEligible, false);

  // 1g. Default untrusted browser context rejects even fully populated fixtures
  const rDefaultUntrusted = verificationAuthorityService.evaluateProjectAuthority({
    project,
    verifications: suites,
    artifacts,
    approvals: [buildValidReleaseApproval(project.id)],
  });
  assert.equal(rDefaultUntrusted.overallVerificationState, 'NOT VERIFIED');
  assert.equal(rDefaultUntrusted.releaseEligible, false);

  // 1h. Valid, independently authenticated APPROVED_FOR_RELEASE passes in synthetic trusted harness
  const rValid = verificationAuthorityService.evaluateProjectAuthority(
    {
      project,
      verifications: suites,
      artifacts,
      approvals: [buildValidReleaseApproval(project.id)],
    },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rValid.overallVerificationState, 'VERIFIED');
  assert.equal(rValid.releaseEligible, true);
  assert.equal(rValid.releaseStatusLabel, 'ELIGIBLE_FOR_PRODUCTION_RELEASE');
});

test('2. Independent Verification Coverage & Authenticity', () => {
  const project = buildSyntheticFormalProject();
  const artifacts = [buildValidArtifact(project.id)];
  const approvals = [buildValidReleaseApproval(project.id)];

  // 2a. Missing authority (drop Forge Kernel) fails
  const missingForge = buildFullFormalSuites(project.id).slice(0, 2);
  const rMissingAuth = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications: missingForge, artifacts, approvals },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rMissingAuth.overallVerificationState, 'NOT VERIFIED');
  assert.ok(rMissingAuth.missingAuthorities.includes('Forge Kernel'));

  // 2b. Duplicate records from one authority cannot cover missing Forge Kernel
  const duplicateLexLean = [
    ...missingForge,
    makeSuite({
      id: 's-dup',
      projectId: project.id,
      authority: 'LexLean',
      suiteId: 'lexlean-kernel-proof',
      suiteVersion: '0.4.0',
      evidenceId: 'ev-lex-dup',
    }),
  ];
  const rDup = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications: duplicateLexLean, artifacts, approvals },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rDup.overallVerificationState, 'NOT VERIFIED');
  assert.equal(rDup.authenticatedPassCount, 2);

  // 2c. Mismatched digest in a suite fails
  const badHashSuites = buildFullFormalSuites(project.id).map((s, idx) =>
    idx === 0 ? { ...s, artifactHash: OTHER_DIGEST } : s
  );
  const rBadSuiteHash = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications: badHashSuites, artifacts, approvals },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rBadSuiteHash.overallVerificationState, 'NOT VERIFIED');

  // 2d. Missing policy (`productFamily: 'other'`) defaults to NOT VERIFIED
  const noPolicyProj: ProjectRecord = { ...project, productFamily: 'other' };
  const rNoPolicy = verificationAuthorityService.evaluateProjectAuthority(
    { project: noPolicyProj, verifications: buildFullFormalSuites(project.id), artifacts, approvals },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rNoPolicy.overallVerificationState, 'NOT VERIFIED');
  assert.equal(rNoPolicy.policyId, null);

  // 2e. Simulated PASS result rejected even with matching hash
  const simPassSuites = buildFullFormalSuites(project.id).map((s, idx) =>
    idx === 1 ? { ...s, isSimulated: true } : s
  );
  const rSimPass = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications: simPassSuites, artifacts, approvals },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rSimPass.overallVerificationState, 'NOT VERIFIED');

  // 2f. Stale / incompatible suite version rejected (0.3.9 < 0.4.0)
  const staleSuites = buildFullFormalSuites(project.id).map((s, idx) =>
    idx === 0 ? { ...s, suiteVersion: '0.3.9' } : s
  );
  const rStale = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications: staleSuites, artifacts, approvals },
    SYNTHETIC_TRUSTED_TEST_HARNESS
  );
  assert.equal(rStale.overallVerificationState, 'NOT VERIFIED');
});

test('3. Sanitized Allowlisted Air-Gapped Export', () => {
  // Inject forbidden secret-like and nested fields into synthetic records
  const taintedProject = {
    ...buildSyntheticFormalProject(),
    purpose: 'CONFIDENTIAL_RESEARCH_NOTES',
    declaredInputs: '/Users/operator/private-keys/id_ed25519',
    apiKey: 'SECRET_API_KEY_12345',
    nestedSecrets: {
      bearerToken: 'wm_secret_bearer_999',
      localPath: '/Volumes/Secure/MacStudio',
    },
  } as unknown as ProjectRecord;

  const taintedArtifact = {
    ...buildValidArtifact(taintedProject.id),
    rawContent: 'BINARY_SECRET_PAYLOAD',
    authorizationSecret: 'TOP_SECRET',
  } as unknown as ArtifactProvenanceRecord;

  const syntheticDemoArtifact: ArtifactProvenanceRecord = {
    ...buildValidArtifact(taintedProject.id),
    id: 'art-synth',
    digestMode: 'SYNTHETIC_DEMO_DIGEST',
  };

  const taintedOperation: DurableOperation & { secretNote?: string } = {
    operationId: 'op-1',
    projectId: taintedProject.id,
    kind: 'CONVERSATION_TURN',
    label: 'User prompt containing secret password=hunter2',
    revision: 4,
    timestamp: '2026-11-15T03:00:00Z',
    syncState: 'LOCAL_ONLY',
    autoReplayPermitted: false,
    note: 'Private note /Users/admin/.ssh',
    secretNote: 'NESTED_LEAK',
  };

  // Must fail without operator confirmation
  assert.throws(() =>
    foundrySyncService.buildAirGappedBundle({
      integrationMode: 'DEMO',
      operatorConfirmed: false,
      projects: [taintedProject],
      operations: [taintedOperation],
      artifacts: [taintedArtifact, syntheticDemoArtifact],
    })
  );

  const bundle = foundrySyncService.buildAirGappedBundle({
    integrationMode: 'DEMO',
    operatorConfirmed: true,
    projects: [taintedProject],
    operations: [taintedOperation],
    artifacts: [taintedArtifact, syntheticDemoArtifact],
  });

  const serialized = JSON.stringify(bundle);
  assert.equal(bundle.schema, 'uor.foundry.air-gapped-bundle.v2');
  assert.equal(bundle.importDisabled, true);
  assert.equal(bundle.autoReplayPermitted, false);
  assert.equal(bundle.transferClassification, 'UNENCRYPTED_UNSIGNED_METADATA_ONLY');

  // Verify synthetic demo artifacts are excluded and only documented ref digest remains
  assert.equal(bundle.artifactDigests.length, 1);

  // Verify every prohibited value & key is absent from exported JSON
  for (const forbidden of [
    'SECRET_API_KEY_12345',
    'wm_secret_bearer_999',
    '/Volumes/Secure/MacStudio',
    'CONFIDENTIAL_RESEARCH_NOTES',
    '/Users/operator/private-keys',
    'BINARY_SECRET_PAYLOAD',
    'TOP_SECRET',
    'hunter2',
    'NESTED_LEAK',
    'nestedSecrets',
    'apiKey',
    'rawContent',
    'secretNote',
    'art-synth',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `Forbidden value "${forbidden}" leaked into sanitized air-gapped export`
    );
  }
});

test('4. DEMO Isolation, Durable Store, and Fail-Closed Windmill Runnables', async () => {
  const demoSvc = new DemoWindmillExecutionService({
    fixtures: [],
    verifications: [],
    artifacts: [],
  });
  const demoSubmit = await demoSvc.submitAuthorizedWorkflow({
    requestId: 'r1',
    idempotencyKey: 'idem-1',
    projectId: 'p1',
    workflowId: 'wf1',
    flowPath: 'f/uor_foundry/unregistered',
    flowVersion: '0.4.0',
    sourceRevision: SOURCE_REV,
    operatorApproved: true,
    requestedAt: '2026-11-15T00:00:00Z',
  });
  assert.equal(demoSubmit.ok, false);

  const localSvc = new FailClosedLocalWindmillService('WINDMILL_NATIVE_WMILL_TS');
  const localHealth = await localSvc.checkRuntimeHealth();
  assert.equal(localHealth.reachable, false);
  assert.equal(localHealth.authenticated, false);

  const op = durableLocalStore.createOperation({
    projectId: 'p1',
    kind: 'DRAFT_APPROVAL',
    label: 'Test op',
    revision: 2,
    note: 'Local test',
  });
  assert.equal(op.autoReplayPermitted, false);
  assert.equal(op.syncState, 'LOCAL_ONLY');

  // Verify backend runnables fail closed safely
  const aiRes = await aiAdvisoryMain({ projectId: 'p1', prompt: 'Inspect' });
  assert.equal(aiRes.ok, false);
  assert.equal(aiRes.privileges.releaseAuthorization, false);

  const wfRes = await workflowDispatchMain({
    projectId: 'p1',
    flowPath: 'f/uor_foundry/test',
    sourceRevision: SOURCE_REV,
    idempotencyKey: 'idem-1',
    operatorApproved: true,
  });
  assert.equal(wfRes.dispatched, false);

  const jobRes = await jobStatusMain({ jobId: 'job-123' });
  assert.equal(jobRes.found, false);

  const intakeValid = await intakeValidateMain({
    projectName: 'PrismPM Sample',
    productFamily: 'application',
    componentId: 'prismpm-calculator',
    workflowId: 'wf-prismpm-delivery',
    purpose: 'Validate deterministic intake checks safely',
    declaredInputs: 'Calculator.lex.tex',
    environmentDeclaration: 'Offline sandbox',
    sourceRevision: 'prismpm/main@ee207ff1',
    acknowledgeBoundary: true,
  });
  assert.equal(intakeValid.valid, true);
  assert.equal(intakeValid.sideEffectsExecuted, false);
});
