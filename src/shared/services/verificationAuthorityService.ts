import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ProjectRecord,
  VerificationPolicy,
  VerificationSuiteAuthority,
  VerificationSuiteRecord,
} from '../types/foundry';

export interface AuthorityEvaluationSummary {
  projectId: string;
  policyId: string | null;
  policyVersion: string | null;
  overallVerificationState: 'VERIFIED' | 'NOT VERIFIED';
  releaseEligible: boolean;
  releaseStatusLabel: 'ELIGIBLE_FOR_PRODUCTION_RELEASE' | 'RELEASE BLOCKED';
  requiredSuiteCount: number;
  authenticatedPassCount: number;
  simulatedOnlyCount: number;
  unverifiedOrMissingCount: number;
  missingRequirements: Array<{
    authority: VerificationSuiteAuthority;
    suiteId: string;
    reason: string;
  }>;
  missingAuthorities: VerificationSuiteAuthority[];
  blockingReasons: string[];
  digestMatched: boolean;
  targetArtifactDigest?: string;
}

export interface AuthorityTrustContext {
  /**
   * Independent verifier authenticity oracle.
   * Defaults to fail-closed (`false`) in browser runtime where no live verifier root exists.
   * Only synthetic unit-test harnesses may inject a trusted verifier oracle.
   */
  authenticateVerifierRecord?: (suite: VerificationSuiteRecord) => boolean;
  /**
   * Independent human approver identity oracle.
   * Defaults to fail-closed (`false`) in browser runtime where no authenticated release session exists.
   */
  authenticateHumanApprover?: (approval: ApprovalDecisionRecord) => boolean;
}

export const VERIFICATION_POLICIES: VerificationPolicy[] = [
  {
    policyId: 'uor.release-policy.application',
    policyVersion: '2026.11.v1',
    productFamily: 'application',
    description: 'Full 5-authority policy for PrismPM / UOR user-facing applications.',
    requiredSuites: [
      {
        authority: 'LexLean',
        suiteId: 'lexlean-kernel-proof',
        suiteLabel: 'LexLean Kernel Proof & Axiom Audit',
        minSuiteVersion: '0.4.0',
      },
      {
        authority: 'PrismPM',
        suiteId: 'prismpm-15gate-vv',
        suiteLabel: 'PrismPM 15-Gate VV & Reproducibility',
        minSuiteVersion: '0.4.0',
      },
      {
        authority: 'Forge Kernel',
        suiteId: 'forge-kernel-abi',
        suiteLabel: 'Forge Kernel Acceptance & ABI Suite',
        minSuiteVersion: '1.0.0',
      },
      {
        authority: 'Hologram Forge Application Core',
        suiteId: 'hologram-app-core',
        suiteLabel: 'Hologram Forge Application Core Suite',
        minSuiteVersion: '1.0.0',
      },
      {
        authority: 'Browser & Identity Acceptance Suites',
        suiteId: 'browser-identity-pp2011',
        suiteLabel: 'Browser & Identity Acceptance Suite',
        minSuiteVersion: '1.0.0',
      },
    ],
  },
  {
    policyId: 'uor.release-policy.formal',
    policyVersion: '2026.11.v1',
    productFamily: 'formal-verification',
    description: 'Formal verification policy requiring LexLean, PrismPM, and Forge Kernel coverage.',
    requiredSuites: [
      {
        authority: 'LexLean',
        suiteId: 'lexlean-kernel-proof',
        suiteLabel: 'LexLean Kernel Proof & Axiom Audit',
        minSuiteVersion: '0.4.0',
      },
      {
        authority: 'PrismPM',
        suiteId: 'prismpm-15gate-vv',
        suiteLabel: 'PrismPM 15-Gate VV & Reproducibility',
        minSuiteVersion: '0.4.0',
      },
      {
        authority: 'Forge Kernel',
        suiteId: 'forge-kernel-abi',
        suiteLabel: 'Forge Kernel Acceptance & ABI Suite',
        minSuiteVersion: '1.0.0',
      },
    ],
  },
  {
    policyId: 'uor.release-policy.scientific',
    policyVersion: '2026.11.v1',
    productFamily: 'scientific-computation',
    description: 'Scientific computation policy requiring LexLean and PrismPM reproducibility.',
    requiredSuites: [
      {
        authority: 'LexLean',
        suiteId: 'lexlean-kernel-proof',
        suiteLabel: 'LexLean Kernel Proof & Axiom Audit',
        minSuiteVersion: '0.4.0',
      },
      {
        authority: 'PrismPM',
        suiteId: 'prismpm-15gate-vv',
        suiteLabel: 'PrismPM 15-Gate VV & Reproducibility',
        minSuiteVersion: '0.4.0',
      },
    ],
  },
];

function compareSemver(actual?: string, minimum?: string): number {
  if (!actual || !minimum) return -1;
  const aParts = actual.split('.').map((n) => Number.parseInt(n, 10));
  const bParts = minimum.split('.').map((n) => Number.parseInt(n, 10));
  if (aParts.length < 3 || bParts.length < 3 || aParts.some(Number.isNaN) || bParts.some(Number.isNaN)) {
    return -1;
  }
  for (let i = 0; i < 3; i++) {
    if (aParts[i] > bParts[i]) return 1;
    if (aParts[i] < bParts[i]) return -1;
  }
  return 0;
}

function isValidSha256Hex(digest?: string): boolean {
  return Boolean(digest && /^[0-9a-f]{64}$/.test(digest));
}

function isValidApproverIdentity(id?: string): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  if (trimmed.length < 4) return false;
  if (/pending|unassigned|ai|assistant|simulated|mock/i.test(trimmed)) return false;
  return true;
}

/**
 * Layer 5: Independent Engineering Verification & Release Authority.
 *
 * Fail-closed security invariants:
 * - No policy for product family => NOT VERIFIED, RELEASE BLOCKED.
 * - `isSimulated: false`, `DOCUMENTED`, or a matching hash alone never prove authenticity.
 *   In browser preview, no verifier or human release identity authority is trusted.
 * - Every mandatory suite in the applicable policy must have an independently
 *   authenticated PASS bound to exact artifact digest, source revision, policy version,
 *   compatible suite version, toolchain identity, timestamp, and provenance.
 * - Duplicate evidence from one authority cannot cover other missing requirements.
 * - `APPROVED_FOR_TEST_SIMULATION` or `APPROVED_FOR_QUALIFICATION` never satisfies
 *   production release authorization; `APPROVED_FOR_RELEASE` with `PRODUCTION_RELEASE`
 *   scope and exact bindings is strictly required.
 */
export class VerificationAuthorityService {
  getPolicyForProductFamily(productFamily: ProjectRecord['productFamily']): VerificationPolicy | null {
    return VERIFICATION_POLICIES.find((p) => p.productFamily === productFamily) ?? null;
  }

  evaluateProjectAuthority(
    params: {
      project: ProjectRecord;
      verifications: VerificationSuiteRecord[];
      artifacts: ArtifactProvenanceRecord[];
      approvals: ApprovalDecisionRecord[];
    },
    trustContext: AuthorityTrustContext = {}
  ): AuthorityEvaluationSummary {
    const { project, verifications, artifacts, approvals } = params;

    // Default fail-closed in browser / untrusted contexts
    const authenticateVerifier = trustContext.authenticateVerifierRecord ?? (() => false);
    const authenticateApprover = trustContext.authenticateHumanApprover ?? (() => false);

    const policy = this.getPolicyForProductFamily(project.productFamily);
    const projectSuites = verifications.filter((v) => v.projectId === project.id);
    const projectArtifacts = artifacts.filter((a) => a.projectId === project.id);
    const projectApprovals = approvals.filter((a) => a.projectId === project.id);

    const primaryArtifact = projectArtifacts[0];
    const targetDigest = primaryArtifact?.sha256Digest;
    const artifactDigestValid =
      Boolean(primaryArtifact) &&
      primaryArtifact.digestMode === 'DOCUMENTED_REFERENCE_DIGEST' &&
      isValidSha256Hex(targetDigest);

    const simulatedOnlyCount = projectSuites.filter(
      (s) => s.isSimulated && s.status === 'PASS'
    ).length;

    const blockingReasons: string[] = [];

    if (!policy) {
      blockingReasons.push(
        `No established verification policy exists for product family "${project.productFamily}".`
      );
      return {
        projectId: project.id,
        policyId: null,
        policyVersion: null,
        overallVerificationState: 'NOT VERIFIED',
        releaseEligible: false,
        releaseStatusLabel: 'RELEASE BLOCKED',
        requiredSuiteCount: 0,
        authenticatedPassCount: 0,
        simulatedOnlyCount,
        unverifiedOrMissingCount: projectSuites.length,
        missingRequirements: [],
        missingAuthorities: [],
        blockingReasons,
        digestMatched: false,
        targetArtifactDigest: targetDigest,
      };
    }

    if (!artifactDigestValid) {
      blockingReasons.push(
        'Target artifact lacks an authoritative DOCUMENTED_REFERENCE_DIGEST SHA-256.'
      );
    }

    const matchedEvidenceIds: string[] = [];
    const missingRequirements: AuthorityEvaluationSummary['missingRequirements'] = [];
    const missingAuthoritySet = new Set<VerificationSuiteAuthority>();
    const consumedSuiteRecordIds = new Set<string>();

    for (const req of policy.requiredSuites) {
      // Find a unique, non-duplicate, independently authenticated PASS for this specific suite requirement
      const candidates = projectSuites.filter(
        (s) =>
          !consumedSuiteRecordIds.has(s.id) &&
          s.authority === req.authority &&
          s.suiteId === req.suiteId
      );

      if (candidates.length === 0) {
        missingAuthoritySet.add(req.authority);
        missingRequirements.push({
          authority: req.authority,
          suiteId: req.suiteId,
          reason: `Missing required suite "${req.suiteId}" from ${req.authority}.`,
        });
        continue;
      }

      const validSuite = candidates.find((s) => {
        if (s.status !== 'PASS') return false;
        if (s.isSimulated) return false;
        if (s.epistemicCondition !== 'DOCUMENTED') return false;
        if (s.authenticationStatus !== 'AUTHENTICATED_BY_VERIFIER') return false;
        if (compareSemver(s.suiteVersion, req.minSuiteVersion) < 0) return false;
        if (s.policyVersion !== policy.policyVersion) return false;
        if (!s.authenticExecutionRef || s.authenticExecutionRef.trim().length < 8) return false;
        if (!s.evidenceProvenance || s.evidenceProvenance.trim().length < 8) return false;
        if (!s.toolchainIdentity || !s.toolchainIdentity.trim()) return false;
        if (!s.lastCheckedAt || Number.isNaN(Date.parse(s.lastCheckedAt))) return false;
        if (s.sourceRevision !== project.sourceRevision) return false;
        if (!artifactDigestValid || s.artifactHash !== targetDigest) return false;
        if (!authenticateVerifier(s)) return false;
        return true;
      });

      if (!validSuite) {
        missingAuthoritySet.add(req.authority);
        missingRequirements.push({
          authority: req.authority,
          suiteId: req.suiteId,
          reason: `Suite "${req.suiteId}" (${req.authority}) is failing, simulated, stale, mismatched, or unauthenticated.`,
        });
      } else {
        consumedSuiteRecordIds.add(validSuite.id);
        matchedEvidenceIds.push(validSuite.evidenceId);
      }
    }

    if (missingRequirements.length > 0) {
      blockingReasons.push(
        `${missingRequirements.length}/${policy.requiredSuites.length} mandatory policy suites lack authenticated PASS evidence.`
      );
    }

    const overallVerified =
      artifactDigestValid &&
      missingRequirements.length === 0 &&
      matchedEvidenceIds.length === policy.requiredSuites.length;

    // Evaluate explicit production release approval predicate (never infer from non-blocked test auth)
    const releaseDecision = projectApprovals.find(
      (a) =>
        a.projectId === project.id &&
        a.gate === 'RELEASE_AUTHORIZATION' &&
        a.authorizationScope === 'PRODUCTION_RELEASE' &&
        a.disposition === 'APPROVED_FOR_RELEASE'
    );

    let humanReleaseApproved = false;
    if (!releaseDecision) {
      const testOnly = projectApprovals.find(
        (a) => a.disposition === 'APPROVED_FOR_TEST_SIMULATION'
      );
      if (testOnly) {
        blockingReasons.push(
          'Only APPROVED_FOR_TEST_SIMULATION exists; explicit APPROVED_FOR_RELEASE (PRODUCTION_RELEASE scope) is required.'
        );
      } else {
        blockingReasons.push(
          'Missing explicit APPROVED_FOR_RELEASE decision bound to PRODUCTION_RELEASE scope.'
        );
      }
    } else {
      const hasValidApprover =
        isValidApproverIdentity(releaseDecision.authenticatedApproverId) &&
        authenticateApprover(releaseDecision);
      const hasValidTimestamp = Boolean(
        releaseDecision.decidedAt && !Number.isNaN(Date.parse(releaseDecision.decidedAt))
      );
      const digestMatches = Boolean(
        artifactDigestValid && releaseDecision.artifactDigest === targetDigest
      );
      const revisionMatches = releaseDecision.sourceRevision === project.sourceRevision;
      const policyMatches = releaseDecision.policyVersion === policy.policyVersion;
      const aiForbidden = releaseDecision.aiPermitted === false && releaseDecision.isSimulated !== true;
      const coversRequiredEvidence =
        Array.isArray(releaseDecision.evidenceRefs) &&
        matchedEvidenceIds.length > 0 &&
        matchedEvidenceIds.every((evId) => releaseDecision.evidenceRefs!.includes(evId));

      if (!aiForbidden) {
        blockingReasons.push('Release approval cannot be AI-generated or simulated.');
      }
      if (!hasValidApprover) {
        blockingReasons.push('Release approval lacks an independently authenticated human approver identity.');
      }
      if (!digestMatches) {
        blockingReasons.push('Release approval artifact digest does not match target artifact SHA-256.');
      }
      if (!revisionMatches) {
        blockingReasons.push('Release approval source revision does not match project source revision.');
      }
      if (!policyMatches) {
        blockingReasons.push('Release approval policy version does not match active verification policy.');
      }
      if (!coversRequiredEvidence) {
        blockingReasons.push('Release approval does not bind all required passing evidence references.');
      }
      if (!hasValidTimestamp) {
        blockingReasons.push('Release approval lacks a valid decision timestamp.');
      }

      humanReleaseApproved =
        aiForbidden &&
        hasValidApprover &&
        hasValidTimestamp &&
        digestMatches &&
        revisionMatches &&
        policyMatches &&
        coversRequiredEvidence;
    }

    const releaseEligible = overallVerified && humanReleaseApproved;

    return {
      projectId: project.id,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      overallVerificationState: overallVerified ? 'VERIFIED' : 'NOT VERIFIED',
      releaseEligible,
      releaseStatusLabel: releaseEligible
        ? 'ELIGIBLE_FOR_PRODUCTION_RELEASE'
        : 'RELEASE BLOCKED',
      requiredSuiteCount: policy.requiredSuites.length,
      authenticatedPassCount: matchedEvidenceIds.length,
      simulatedOnlyCount,
      unverifiedOrMissingCount: missingRequirements.length,
      missingRequirements,
      missingAuthorities: Array.from(missingAuthoritySet),
      blockingReasons,
      digestMatched: artifactDigestValid && missingRequirements.length === 0,
      targetArtifactDigest: targetDigest,
    };
  }
}

export const verificationAuthorityService = new VerificationAuthorityService();
