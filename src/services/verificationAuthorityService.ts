import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ProjectRecord,
  VerificationSuiteAuthority,
  VerificationSuiteRecord,
} from '../types/foundry';

export interface AuthorityEvaluationSummary {
  projectId: string;
  overallVerificationState: 'VERIFIED' | 'NOT VERIFIED';
  releaseEligible: boolean;
  releaseStatusLabel: 'ELIGIBLE_FOR_HUMAN_SIGNOFF' | 'RELEASE BLOCKED';
  authoritativePassCount: number;
  simulatedOnlyCount: number;
  unverifiedOrMissingCount: number;
  missingAuthorities: VerificationSuiteAuthority[];
  blockingReasons: string[];
  digestMatched: boolean;
  targetArtifactDigest?: string;
}

const INDEPENDENT_AUTHORITIES: VerificationSuiteAuthority[] = [
  'LexLean',
  'PrismPM',
  'Forge Kernel',
  'Hologram Forge Application Core',
  'Browser & Identity Acceptance Suites',
];

/**
 * Layer 5: Independent Engineering Verification & Release Authority.
 *
 * Enforces fail-closed UOR governance:
 * - AI recommendations can never establish verification or authorize releases.
 * - Verification PASS requires authoritative, non-simulated evidence.
 * - Release requires a separate human decision tied to an exact artifact digest
 *   and verified evidence across required independent authorities.
 * - Missing evidence forces `NOT VERIFIED` and keeps release `BLOCKED`.
 */
export class VerificationAuthorityService {
  evaluateProjectAuthority(params: {
    project: ProjectRecord;
    verifications: VerificationSuiteRecord[];
    artifacts: ArtifactProvenanceRecord[];
    approvals: ApprovalDecisionRecord[];
  }): AuthorityEvaluationSummary {
    const projectSuites = params.verifications.filter((v) => v.projectId === params.project.id);
    const projectArtifacts = params.artifacts.filter((a) => a.projectId === params.project.id);
    const projectApprovals = params.approvals.filter((a) => a.projectId === params.project.id);

    const authoritativePasses = projectSuites.filter(
      (s) => !s.isSimulated && s.status === 'PASS' && s.epistemicCondition === 'DOCUMENTED'
    );
    const simulatedOnly = projectSuites.filter((s) => s.isSimulated && s.status === 'PASS');
    const nonPassing = projectSuites.filter((s) => s.isSimulated || s.status !== 'PASS');

    const primaryArtifact = projectArtifacts[0];
    const targetDigest = primaryArtifact?.sha256Digest;

    // Check digest binding across authoritative passes
    const digestMatched =
      Boolean(targetDigest) &&
      primaryArtifact?.digestMode === 'DOCUMENTED_REFERENCE_DIGEST' &&
      authoritativePasses.length > 0 &&
      authoritativePasses.every((s) => s.artifactHash === targetDigest);

    const coveredAuthorities = new Set(authoritativePasses.map((s) => s.authority));
    const missingAuthorities = INDEPENDENT_AUTHORITIES.filter((auth) => !coveredAuthorities.has(auth));

    const releaseDecision = projectApprovals.find((a) => a.gate === 'RELEASE_AUTHORIZATION');
    const humanReleaseApproved =
      releaseDecision !== undefined &&
      releaseDecision.aiPermitted === false &&
      releaseDecision.disposition !== 'BLOCKED' &&
      releaseDecision.disposition !== 'DEFERRED' &&
      releaseDecision.disposition !== 'PENDING' &&
      releaseDecision.disposition !== 'REJECTED';

    const blockingReasons: string[] = [];
    if (projectSuites.length === 0) {
      blockingReasons.push('No verification suites registered for this project.');
    }
    if (nonPassing.length > 0) {
      blockingReasons.push(
        `${nonPassing.length} verification suites are NOT VERIFIED, NOT RUN, FAIL, or simulated-only.`
      );
    }
    if (!digestMatched) {
      blockingReasons.push(
        'Artifact SHA-256 digest is either synthetic or lacks matching authoritative verification evidence.'
      );
    }
    if (!humanReleaseApproved) {
      blockingReasons.push(
        `Human Release Authorization gate is ${releaseDecision?.disposition ?? 'MISSING'} (AI prohibited).`
      );
    }

    const overallVerified =
      projectSuites.length > 0 && nonPassing.length === 0 && digestMatched;
    const releaseEligible = overallVerified && humanReleaseApproved;

    return {
      projectId: params.project.id,
      overallVerificationState: overallVerified ? 'VERIFIED' : 'NOT VERIFIED',
      releaseEligible,
      releaseStatusLabel: releaseEligible ? 'ELIGIBLE_FOR_HUMAN_SIGNOFF' : 'RELEASE BLOCKED',
      authoritativePassCount: authoritativePasses.length,
      simulatedOnlyCount: simulatedOnly.length,
      unverifiedOrMissingCount: nonPassing.length,
      missingAuthorities,
      blockingReasons,
      digestMatched,
      targetArtifactDigest: targetDigest,
    };
  }
}

export const verificationAuthorityService = new VerificationAuthorityService();
