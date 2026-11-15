import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DURABLE_EXPORT_ALLOWLIST_SCHEMA,
  DurableWorkspaceSnapshot,
  durableLocalStore,
} from '../services/durableLocalStore.ts';
import {
  AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA,
  foundrySyncService,
  sanitizeExportBundle,
} from '../services/syncService.ts';
import {
  AuthorityTrustContext,
  verificationAuthorityService,
} from '../services/verificationAuthorityService.ts';
import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ProjectRecord,
  VerificationSuiteRecord,
} from '../types/foundry.ts';

const ARTIFACT_DIGEST =
  '31795eac06fbf1d64c77ffe66b5492964c069e1f2fea41efbf6a17054cf369d7';
const SOURCE_REVISION = 'prismpm/main@ee207ff1';
const POLICY_VERSION = '2026.11.v1';

function createFormalProject(): ProjectRecord {
  return {
    id: 'proj-sec-unit',
    name: 'Release Authorization Security Fixture',
    productFamily: 'formal-verification',
    componentId: 'lexlean-compiler',
    workflowId: 'wf-lexlean-formal',
    purpose: 'Unit test fixture for release authorization predicates.',
    declaredInputs: 'src/Main.lex.tex',
    environmentDeclaration: 'Synthetic offline test environment',
    sourceRevision: SOURCE_REVISION,
    lifecycleStatus: 'REVIEW REQUIRED',
    createdAt: '2026-11-15T00:00:00Z',
    updatedAt: '2026-11-15T00:00:00Z',
    isSyntheticDemo: true,
    acceptancePolicySchema: 'uor.acceptance-policy.example.v1',
    releaseBlockedReasons: [],
  };
}

function createArtifact(projectId: string): ArtifactProvenanceRecord {
  return {
    id: 'art-sec-unit',
    projectId,
    artifactName: 'sec-unit-artifact.holo',
    artifactFormat: 'lexlean/production-result/1',
    sha256Digest: ARTIFACT_DIGEST,
    digestMode: 'DOCUMENTED_REFERENCE_DIGEST',
    sourceRevision: SOURCE_REVISION,
    inputDependencies: ['src/Main.lex.tex'],
    toolchainIdentity: 'lexlean 0.4.0',
    evidenceRefs: ['ev-lexlean', 'ev-prismpm', 'ev-forge'],
    releaseReadiness: 'NOT_ASSESSED',
    blockingReasons: [],
    createdAt: '2026-11-15T00:00:00Z',
  };
}

function createVerifiedSuites(projectId: string): VerificationSuiteRecord[] {
  return [
    {
      id: 'suite-lexlean',
      projectId,
      suiteId: 'lexlean-kernel-proof',
      suiteVersion: '0.4.0',
      suiteName: 'LexLean Kernel Proof & Axiom Audit',
      authority: 'LexLean',
      status: 'PASS',
      epistemicCondition: 'DOCUMENTED',
      evidenceId: 'ev-lexlean',
      sourceRevision: SOURCE_REVISION,
      toolchainIdentity: 'leanprover/lean4:v4.32.1',
      executionRecord: 'Synthetic test run',
      authenticExecutionRef: 'ref-lexlean-01',
      evidenceProvenance: 'trusted-test-harness',
      authenticationStatus: 'AUTHENTICATED_BY_VERIFIER',
      policyVersion: POLICY_VERSION,
      artifactHash: ARTIFACT_DIGEST,
      lastCheckedAt: '2026-11-15T01:00:00Z',
      isSimulated: false,
      blockingForRelease: true,
      notes: 'Synthetic test fixture',
    },
    {
      id: 'suite-prismpm',
      projectId,
      suiteId: 'prismpm-15gate-vv',
      suiteVersion: '0.4.0',
      suiteName: 'PrismPM 15-Gate VV & Reproducibility',
      authority: 'PrismPM',
      status: 'PASS',
      epistemicCondition: 'DOCUMENTED',
      evidenceId: 'ev-prismpm',
      sourceRevision: SOURCE_REVISION,
      toolchainIdentity: 'cargo --locked --offline',
      executionRecord: 'Synthetic test run',
      authenticExecutionRef: 'ref-prismpm-01',
      evidenceProvenance: 'trusted-test-harness',
      authenticationStatus: 'AUTHENTICATED_BY_VERIFIER',
      policyVersion: POLICY_VERSION,
      artifactHash: ARTIFACT_DIGEST,
      lastCheckedAt: '2026-11-15T01:05:00Z',
      isSimulated: false,
      blockingForRelease: true,
      notes: 'Synthetic test fixture',
    },
    {
      id: 'suite-forge',
      projectId,
      suiteId: 'forge-kernel-abi',
      suiteVersion: '1.0.0',
      suiteName: 'Forge Kernel Acceptance & ABI Suite',
      authority: 'Forge Kernel',
      status: 'PASS',
      epistemicCondition: 'DOCUMENTED',
      evidenceId: 'ev-forge',
      sourceRevision: SOURCE_REVISION,
      toolchainIdentity: 'forge-kernel-verifier',
      executionRecord: 'Synthetic test run',
      authenticExecutionRef: 'ref-forge-01',
      evidenceProvenance: 'trusted-test-harness',
      authenticationStatus: 'AUTHENTICATED_BY_VERIFIER',
      policyVersion: POLICY_VERSION,
      artifactHash: ARTIFACT_DIGEST,
      lastCheckedAt: '2026-11-15T01:10:00Z',
      isSimulated: false,
      blockingForRelease: true,
      notes: 'Synthetic test fixture',
    },
  ];
}

function createReleaseApproval(
  projectId: string,
  overrides: Partial<ApprovalDecisionRecord> = {}
): ApprovalDecisionRecord {
  return {
    id: 'apr-release-unit',
    projectId,
    gate: 'RELEASE_AUTHORIZATION',
    authorizationScope: 'PRODUCTION_RELEASE',
    title: 'Production Release Authorization',
    requiredRole: 'UOR Release Governance Board',
    authorizedReviewer: 'Human Release Authority',
    authenticatedApproverId: 'human-approver-01',
    disposition: 'APPROVED_FOR_RELEASE',
    aiPermitted: false,
    isSimulated: false,
    artifactDigest: ARTIFACT_DIGEST,
    sourceRevision: SOURCE_REVISION,
    evidenceRefs: ['ev-lexlean', 'ev-prismpm', 'ev-forge'],
    policyVersion: POLICY_VERSION,
    rationale: 'All required policy evidence verified.',
    decidedAt: '2026-11-15T02:00:00Z',
    policyReference: 'uor.release-policy.formal',
    ...overrides,
  };
}

const TRUSTED_HARNESS: AuthorityTrustContext = {
  authenticateVerifierRecord: (s) =>
    !s.isSimulated && s.authenticationStatus === 'AUTHENTICATED_BY_VERIFIER',
  authenticateHumanApprover: (a) => Boolean(a.authenticatedApproverId?.startsWith('human-')),
};

test('rejects APPROVED_FOR_TEST_SIMULATION even when all verification suites pass', () => {
  const project = createFormalProject();
  const artifacts = [createArtifact(project.id)];
  const verifications = createVerifiedSuites(project.id);

  const testExecutionApproval = createReleaseApproval(project.id, {
    gate: 'EXECUTION_AUTHORIZATION',
    authorizationScope: 'TEST_EXECUTION',
    disposition: 'APPROVED_FOR_TEST_SIMULATION',
  });

  // Also test if a record wrongly puts APPROVED_FOR_TEST_SIMULATION on the RELEASE_AUTHORIZATION gate
  const misScopedTestApproval = createReleaseApproval(project.id, {
    gate: 'RELEASE_AUTHORIZATION',
    authorizationScope: 'PRODUCTION_RELEASE',
    disposition: 'APPROVED_FOR_TEST_SIMULATION',
  });

  for (const approval of [testExecutionApproval, misScopedTestApproval]) {
    const result = verificationAuthorityService.evaluateProjectAuthority(
      { project, verifications, artifacts, approvals: [approval] },
      TRUSTED_HARNESS
    );
    assert.equal(result.overallVerificationState, 'VERIFIED');
    assert.equal(result.releaseEligible, false);
    assert.equal(result.releaseStatusLabel, 'RELEASE BLOCKED');
  }
});

test('rejects non-release dispositions (PENDING, DEFERRED, BLOCKED, REJECTED, APPROVED_FOR_QUALIFICATION)', () => {
  const project = createFormalProject();
  const artifacts = [createArtifact(project.id)];
  const verifications = createVerifiedSuites(project.id);

  const nonReleaseDispositions: ApprovalDecisionRecord['disposition'][] = [
    'PENDING',
    'DEFERRED',
    'BLOCKED',
    'REJECTED',
    'APPROVED_FOR_QUALIFICATION',
  ];

  for (const disposition of nonReleaseDispositions) {
    const approval = createReleaseApproval(project.id, { disposition });
    const result = verificationAuthorityService.evaluateProjectAuthority(
      { project, verifications, artifacts, approvals: [approval] },
      TRUSTED_HARNESS
    );
    assert.equal(result.releaseEligible, false, `${disposition} must not authorize release`);
    assert.equal(result.releaseStatusLabel, 'RELEASE BLOCKED');
  }
});

test('requires explicit APPROVED_FOR_RELEASE with PRODUCTION_RELEASE scope and exact bindings', () => {
  const project = createFormalProject();
  const artifacts = [createArtifact(project.id)];
  const verifications = createVerifiedSuites(project.id);

  // Wrong scope
  const wrongScope = createReleaseApproval(project.id, {
    authorizationScope: 'TECHNICAL_QUALIFICATION',
  });
  assert.equal(
    verificationAuthorityService.evaluateProjectAuthority(
      { project, verifications, artifacts, approvals: [wrongScope] },
      TRUSTED_HARNESS
    ).releaseEligible,
    false
  );

  // Missing evidence reference coverage
  const incompleteEvidence = createReleaseApproval(project.id, {
    evidenceRefs: ['ev-lexlean'],
  });
  assert.equal(
    verificationAuthorityService.evaluateProjectAuthority(
      { project, verifications, artifacts, approvals: [incompleteEvidence] },
      TRUSTED_HARNESS
    ).releaseEligible,
    false
  );

  // Default untrusted browser context rejects even APPROVED_FOR_RELEASE
  const validApproval = createReleaseApproval(project.id);
  assert.equal(
    verificationAuthorityService.evaluateProjectAuthority({
      project,
      verifications,
      artifacts,
      approvals: [validApproval],
    }).releaseEligible,
    false
  );

  // Valid APPROVED_FOR_RELEASE with full bindings succeeds in trusted test harness
  const validResult = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications, artifacts, approvals: [validApproval] },
    TRUSTED_HARNESS
  );
  assert.equal(validResult.overallVerificationState, 'VERIFIED');
  assert.equal(validResult.releaseEligible, true);
  assert.equal(validResult.releaseStatusLabel, 'ELIGIBLE_FOR_PRODUCTION_RELEASE');
});

test('rejects unauthorized, simulated, AI-generated, wrong-gate, or unbound APPROVED_FOR_RELEASE records', () => {
  const project = createFormalProject();
  const artifacts = [createArtifact(project.id)];
  const verifications = createVerifiedSuites(project.id);

  // 1. No approval records
  const missingResult = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications, artifacts, approvals: [] },
    TRUSTED_HARNESS
  );
  assert.equal(missingResult.releaseEligible, false);
  assert.equal(missingResult.releaseStatusLabel, 'RELEASE BLOCKED');

  // 2. Unauthorized / rejected approval edge cases
  const unauthorizedCases: Array<{ label: string; approval: ApprovalDecisionRecord }> = [
    {
      label: 'simulated approval record',
      approval: createReleaseApproval(project.id, { isSimulated: true }),
    },
    {
      label: 'AI-permitted approval record',
      approval: createReleaseApproval(project.id, {
        aiPermitted: true as unknown as false,
      }),
    },
    {
      label: 'AI-named approver identity',
      approval: createReleaseApproval(project.id, {
        authenticatedApproverId: 'ai-assistant-01',
      }),
    },
    {
      label: 'missing authenticatedApproverId',
      approval: createReleaseApproval(project.id, {
        authenticatedApproverId: undefined,
      }),
    },
    {
      label: 'unauthenticated human identity rejected by oracle',
      approval: createReleaseApproval(project.id, {
        authenticatedApproverId: 'untrusted-external-01',
      }),
    },
    {
      label: 'wrong gate (EXECUTION_AUTHORIZATION instead of RELEASE_AUTHORIZATION)',
      approval: createReleaseApproval(project.id, {
        gate: 'EXECUTION_AUTHORIZATION',
      }),
    },
    {
      label: 'mismatched artifactDigest',
      approval: createReleaseApproval(project.id, {
        artifactDigest: '0'.repeat(64),
      }),
    },
    {
      label: 'mismatched sourceRevision',
      approval: createReleaseApproval(project.id, {
        sourceRevision: 'prismpm/main@00000000',
      }),
    },
    {
      label: 'mismatched policyVersion',
      approval: createReleaseApproval(project.id, {
        policyVersion: '2025.01.v0',
      }),
    },
    {
      label: 'missing decision timestamp',
      approval: createReleaseApproval(project.id, {
        decidedAt: undefined,
      }),
    },
  ];

  for (const { label, approval } of unauthorizedCases) {
    const res = verificationAuthorityService.evaluateProjectAuthority(
      { project, verifications, artifacts, approvals: [approval] },
      TRUSTED_HARNESS
    );
    assert.equal(res.releaseEligible, false, `Expected rejection for ${label}`);
    assert.equal(res.releaseStatusLabel, 'RELEASE BLOCKED', `Expected RELEASE BLOCKED for ${label}`);
  }
});

test('durableLocalStore and syncService enforce strict allowlist export schema stripping credentials, chat bodies, and internal metadata', () => {
  const project = {
    ...createFormalProject(),
    name: 'Fixture Bearer sk-test-secret-token-999999 /Users/alice/private',
    purpose: 'INTERNAL_PURPOSE_BODY',
    apiCredentials: {
      windmillToken: 'wm_live_secret_token_abc123',
      lmStudioApiKey: 'sk-ant-secret-key-9876543210',
    },
  } as unknown as ProjectRecord;

  const taintedSnapshot: Partial<DurableWorkspaceSnapshot> & Record<string, unknown> = {
    schemaVersion: 2,
    revision: 42,
    updatedAt: '2026-11-15T05:00:00Z',
    authoritativeDatabase: false,
    persistenceNotice: 'INTERNAL_PERSISTENCE_BANNER',
    integrationMode: 'DEMO',
    connectivityProfile: 'AIR_GAPPED_TRANSFER',
    apiCredentials: 'SECRET_TOP_LEVEL_TOKEN',
    internalMetadata: { hostPath: '/Volumes/PrivateVault/keys' },
    projects: [project],
    artifacts: [
      createArtifact(project.id),
      {
        ...createArtifact(project.id),
        id: 'art-synth-unapproved',
        digestMode: 'SYNTHETIC_DEMO_DIGEST',
      },
    ],
    operations: [
      durableLocalStore.createOperation({
        projectId: project.id,
        kind: 'CONVERSATION_TURN',
        label: 'Prompt body: api_key=hunter2',
        revision: 42,
        note: 'Internal chat note /Users/admin/.ssh/id_ed25519',
      }),
    ],
    conversations: [
      {
        id: 'thread-1',
        projectId: project.id,
        title: 'Private Design Chat',
        createdAt: '2026-11-15T00:00:00Z',
        updatedAt: '2026-11-15T01:00:00Z',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'PRIVATE_CHAT_HISTORY_BODY_DO_NOT_EXPORT',
            timestamp: '2026-11-15T00:01:00Z',
            isSimulated: true,
          },
        ],
      },
    ],
    advisories: [
      {
        id: 'adv-1',
        projectId: project.id,
        category: 'research',
        promptSummary: 'SECRET_PROMPT_SUMMARY',
        responseSummary: 'SECRET_RESPONSE_SUMMARY',
        observations: ['INTERNAL_OBSERVATION'],
        citedRepositories: [],
        generatedAt: '2026-11-15T00:00:00Z',
        isSimulated: true,
        targetRuntimeNote: 'INTERNAL_RUNTIME_NOTE',
      },
    ],
    activity: [
      {
        id: 'act-1',
        timestamp: '2026-11-15T00:00:00Z',
        actor: 'Internal Actor',
        category: 'GOVERNANCE',
        summary: 'INTERNAL_ACTIVITY_SUMMARY',
        isSimulated: true,
      },
    ],
    offlineQueue: [
      {
        id: 'q-1',
        projectId: project.id,
        kind: 'WORKFLOW_DISPATCH',
        label: 'INTERNAL_QUEUE_ITEM',
        targetEndpoint: 'http://127.0.0.1:8080/secret',
        createdAt: '2026-11-15T00:00:00Z',
        status: 'QUEUED_LOCAL',
      },
    ],
  };

  const extracted = durableLocalStore.extractAllowlistedExportInput(taintedSnapshot);
  assert.equal(extracted.allowlistSchemaVersion, DURABLE_EXPORT_ALLOWLIST_SCHEMA.schemaVersion);
  assert.equal(extracted.projects.length, 1);
  assert.equal(extracted.artifacts.length, 1);
  assert.equal(extracted.operations.length, 1);
  assert.equal(extracted.strippedSummary.chatThreadsStripped, 1);
  assert.equal(extracted.strippedSummary.advisoriesStripped, 1);
  assert.equal(extracted.strippedSummary.activityEventsStripped, 1);
  assert.equal(extracted.strippedSummary.nonReferenceArtifactsStripped, 1);

  const bundle = foundrySyncService.buildAirGappedBundleFromSnapshot({
    integrationMode: 'DEMO',
    operatorConfirmed: true,
    snapshot: taintedSnapshot,
  });

  // Also test sanitizeExportBundle & serializeAllowlistedBundle directly on tainted bundle objects
  const dirtyBundle = {
    ...bundle,
    leakedConversations: taintedSnapshot.conversations,
    leakedApiKey: 'wm_extra_leak_12345',
    manifest: {
      ...bundle.manifest,
      secretManifestNote: 'INTERNAL_MANIFEST_LEAK',
    },
  } as unknown as typeof bundle;

  const directlySanitized = sanitizeExportBundle(dirtyBundle);
  assert.deepEqual(
    Object.keys(directlySanitized).sort(),
    [...AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.allowedTopLevelFields].sort()
  );
  assert.deepEqual(
    Object.keys(directlySanitized.manifest).sort(),
    [...AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.allowedManifestFields].sort()
  );

  const serializedJson = foundrySyncService.serializeAllowlistedBundle(dirtyBundle);
  const parsed = JSON.parse(serializedJson) as Record<string, unknown>;

  assert.deepEqual(
    Object.keys(parsed).sort(),
    [...AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.allowedTopLevelFields].sort()
  );
  assert.deepEqual(
    Object.keys(bundle.projects[0]).sort(),
    [...DURABLE_EXPORT_ALLOWLIST_SCHEMA.projectFields].sort()
  );
  assert.deepEqual(
    Object.keys(bundle.artifactDigests[0]).sort(),
    [...DURABLE_EXPORT_ALLOWLIST_SCHEMA.artifactFields].sort()
  );
  assert.deepEqual(
    Object.keys(bundle.operationRefs[0]).sort(),
    [...DURABLE_EXPORT_ALLOWLIST_SCHEMA.operationFields].sort()
  );

  for (const forbidden of [
    'PRIVATE_CHAT_HISTORY_BODY_DO_NOT_EXPORT',
    'SECRET_TOP_LEVEL_TOKEN',
    'wm_live_secret_token_abc123',
    'sk-ant-secret-key-9876543210',
    'sk-test-secret-token-999999',
    'wm_extra_leak_12345',
    '/Users/alice/private',
    '/Users/admin/.ssh',
    '/Volumes/PrivateVault',
    'INTERNAL_PURPOSE_BODY',
    'INTERNAL_PERSISTENCE_BANNER',
    'SECRET_PROMPT_SUMMARY',
    'SECRET_RESPONSE_SUMMARY',
    'INTERNAL_ACTIVITY_SUMMARY',
    'INTERNAL_QUEUE_ITEM',
    'hunter2',
    'art-synth-unapproved',
    'leakedConversations',
    'leakedApiKey',
    'secretManifestNote',
    'INTERNAL_MANIFEST_LEAK',
    'apiCredentials',
    'conversations',
    'persistenceNotice',
  ]) {
    assert.equal(
      serializedJson.includes(forbidden),
      false,
      `Forbidden sensitive string "${forbidden}" leaked into serialized bundle`
    );
  }
});

test('missing verification suites and forged or untrusted evidence strictly block release', () => {
  const project = createFormalProject();
  const artifacts = [createArtifact(project.id)];
  const approvals = [createReleaseApproval(project.id)];

  // 1. Missing required verification suites
  const emptySuitesResult = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications: [], artifacts, approvals },
    TRUSTED_HARNESS
  );
  assert.equal(emptySuitesResult.overallVerificationState, 'NOT VERIFIED');
  assert.equal(emptySuitesResult.releaseEligible, false);
  assert.equal(emptySuitesResult.missingAuthorities.length, 3);

  // 2. Forged evidence: suite claims AUTHENTICATED_BY_VERIFIER & PASS, but oracle detects untrusted provenance
  const forgedSuites = createVerifiedSuites(project.id).map((suite, idx) =>
    idx === 2
      ? {
          ...suite,
          evidenceProvenance: 'forged-client-claim',
          authenticExecutionRef: 'forged-ref-999',
        }
      : suite
  );
  const strictOracle: AuthorityTrustContext = {
    authenticateVerifierRecord: (s) =>
      !s.isSimulated &&
      s.authenticationStatus === 'AUTHENTICATED_BY_VERIFIER' &&
      s.evidenceProvenance === 'trusted-test-harness',
    authenticateHumanApprover: (a) => Boolean(a.authenticatedApproverId?.startsWith('human-')),
  };
  const forgedResult = verificationAuthorityService.evaluateProjectAuthority(
    { project, verifications: forgedSuites, artifacts, approvals },
    strictOracle
  );
  assert.equal(forgedResult.overallVerificationState, 'NOT VERIFIED');
  assert.equal(forgedResult.releaseEligible, false);
  assert.equal(forgedResult.releaseStatusLabel, 'RELEASE BLOCKED');
});

test('sanitizeExportBundle neutralizes hostile strings, prototype keys, and deeply nested payloads', () => {
  const projectWithHostileFields = {
    ...createFormalProject(),
    id: 'proj-hostile\u0000\u0007-01',
    name: '<script>alert("xss")</script> Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.signature_part_here',
    sourceRevision: 'main@12345\npassword=top_secret_pw',
    deepNested: {
      level1: {
        level2: {
          level3: {
            privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
            secretToken: 'ghp_1234567890abcdef123456',
          },
        },
      },
    },
    ['__proto__']: { polluted: true },
  } as unknown as ProjectRecord;

  const maliciousJsonPayload = JSON.parse(
    JSON.stringify({
      schema: 'uor.foundry.air-gapped-bundle.v2',
      integrationMode: 'DEMO',
      operatorConfirmed: true,
      projects: [projectWithHostileFields],
      artifactDigests: [createArtifact('proj-hostile-01')],
      operationRefs: [],
      nestedLeak: {
        deep: {
          authorizationSecret: 'NESTED_HOSTILE_SECRET',
        },
      },
    })
  ) as Record<string, unknown>;

  const sanitized = sanitizeExportBundle(maliciousJsonPayload);
  const json = JSON.stringify(sanitized);

  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.projects[0], '__proto__'), false);
  assert.equal((sanitized.projects[0] as unknown as Record<string, unknown>).deepNested, undefined);
  assert.equal(json.includes('\u0000'), false);
  assert.equal(json.includes('NESTED_HOSTILE_SECRET'), false);
  assert.equal(json.includes('BEGIN RSA PRIVATE KEY'), false);
  assert.equal(json.includes('ghp_1234567890abcdef123456'), false);
  assert.equal(json.includes('top_secret_pw'), false);
  assert.equal(json.includes('signature_part_here'), false);
  assert.ok(sanitized.projects[0].approvedTitle.includes('[STRIPPED_CREDENTIAL]'));
});

test('DEMO mode never dispatches a real Windmill job', async () => {
  const { DemoWindmillExecutionService } = await import('../adapters/windmillExecutionService.ts');
  const demoService = new DemoWindmillExecutionService({
    fixtures: [],
    verifications: [],
    artifacts: [],
  });

  const health = await demoService.checkRuntimeHealth();
  assert.equal(health.mode, 'DEMO');
  assert.equal(health.reachable, false);
  assert.equal(health.authenticated, false);
  assert.equal(health.permissionsValidated, false);

  const dispatch = await demoService.submitAuthorizedWorkflow({
    requestId: 'req-demo-guard',
    idempotencyKey: 'idem-demo-guard',
    projectId: 'proj-sec-unit',
    workflowId: 'wf-lexlean-formal',
    flowPath: 'f/uor_foundry/lexlean_formal',
    flowVersion: '0.4.0',
    sourceRevision: SOURCE_REVISION,
    operatorApproved: true,
    requestedAt: '2026-11-15T00:00:00Z',
  });
  assert.equal(dispatch.ok, false);
  assert.equal(dispatch.diagnostic?.code, 'SANDBOX_ISOLATED');
});
