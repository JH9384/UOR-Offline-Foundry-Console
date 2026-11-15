import { REVIEWED_SOURCES_REGISTER } from '../data/sourceComplianceRegister';
import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ProjectComplianceAssessment,
  ProjectComplianceRequirement,
  ProjectRecord,
  ProjectSourcePin,
  ReviewedSourceId,
  VerificationSuiteRecord,
} from '../types/foundry';
import { AuthorityTrustContext, verificationAuthorityService } from './verificationAuthorityService';

function inferProjectSourcePins(project: ProjectRecord): ProjectSourcePin[] {
  if (project.sourceRefs && project.sourceRefs.length > 0) {
    return project.sourceRefs;
  }

  const byId = new Map(REVIEWED_SOURCES_REGISTER.map((s) => [s.id, s]));
  const pin = (sourceId: ReviewedSourceId, role: string): ProjectSourcePin => ({
    sourceId,
    commitSha: byId.get(sourceId)!.reviewedCommitSha,
    role,
  });

  if (project.componentId === 'uorust-translator') {
    return [
      pin('uorust', 'Primary Cargo workspace -> Prism/LexLean translation contract'),
      pin('prism-devrel', 'Model projection catalog & R1-R6 conformance template rules'),
      pin('prismpm', 'Closed-model check/build/verify orchestrator & .holo packager'),
      pin('lexlean', 'Controlled-language Lean 4.32.1 kernel verification'),
      pin('stitch', 'Full SHA-256 artifact commitment & deterministic checkpoint checks'),
    ];
  }

  if (
    project.componentId === 'lexlean-compiler' ||
    project.componentId === 'lexlean-mcp-gateway' ||
    project.productFamily === 'formal-verification'
  ) {
    return [
      pin('rule30', 'Claim frontier, constructivity axiom audit & open-claim separation'),
      pin('lexlean', 'Lean 4.32.1 kernel replay & #print axioms verifier'),
      pin('foundry', 'Forge Kernel INV-001..INV-004 proof-invalidation invariants'),
      pin('stitch', 'SHA-256 artifact commitment & deterministic pure-state replay bounds'),
    ];
  }

  return [
    pin('prismpm', 'Closed .lex.tex -> Core-Wasm, HOLOVIEW & binary .holo archive pipeline'),
    pin('lexlean', 'Lean 4.32.1 leanchecker proof & production export verifier'),
    pin('hologram-live', 'Import-free Core-Wasm inspect/verify/plan/run acceptance host'),
    pin('prism-devrel', 'Facet coverage, Diataxis documentation & template contract rules'),
    pin('foundry', 'Forge Kernel state & capability gate specifications'),
    pin('stitch', 'Content-addressed SHA-256 commitments & deterministic recovery bounds'),
  ];
}

function findAuthenticatedVerifierSuite(params: {
  verifications: VerificationSuiteRecord[];
  project: ProjectRecord;
  matchAuthorities: string[];
  matchSuiteKeywords?: string[];
  expectedArtifactSha?: string;
}): VerificationSuiteRecord | undefined {
  return params.verifications.find((v) => {
    if (v.projectId !== params.project.id) return false;
    if (v.status !== 'PASS') return false;
    if (v.isSimulated || v.authenticationStatus !== 'AUTHENTICATED_BY_VERIFIER') return false;
    if (v.sourceRevision !== params.project.sourceRevision) return false;
    if (params.expectedArtifactSha && v.artifactHash && v.artifactHash !== params.expectedArtifactSha) {
      return false;
    }
    const authorityMatch = params.matchAuthorities.includes(v.authority);
    const keywordMatch =
      !params.matchSuiteKeywords ||
      params.matchSuiteKeywords.length === 0 ||
      params.matchSuiteKeywords.some(
        (kw) =>
          (v.suiteId ?? '').toLowerCase().includes(kw.toLowerCase()) ||
          v.suiteName.toLowerCase().includes(kw.toLowerCase())
      );
    return authorityMatch && keywordMatch;
  });
}

/**
 * Layer 5: Project-specific Source Review & Compliance Assessment.
 *
 * Enforces:
 * - Independent per-requirement evaluation (NO global `hasVerifiedAll` shortcut).
 * - Explicit binding to acceptanceId, sourceUrl, pinnedRevision, applicableVerifier,
 *   executionIdentity, evidenceRecord, and evaluationResult.
 * - Preserves unresolved / untested / refuted upstream source claims explicitly.
 * - Never auto-promotes source integration statuses above REFERENCE ONLY / CANDIDATE without live verification.
 */
export class SourceComplianceService {
  getAllReviewedSources() {
    return REVIEWED_SOURCES_REGISTER;
  }

  assessProjectCompliance(
    params: {
      project: ProjectRecord;
      verifications: VerificationSuiteRecord[];
      artifacts: ArtifactProvenanceRecord[];
      approvals: ApprovalDecisionRecord[];
    },
    trustContext: AuthorityTrustContext = {}
  ): ProjectComplianceAssessment {
    const { project, verifications, artifacts, approvals } = params;
    const authoritySummary = verificationAuthorityService.evaluateProjectAuthority(
      { project, verifications, artifacts, approvals },
      trustContext
    );

    const byId = new Map(REVIEWED_SOURCES_REGISTER.map((s) => [s.id, s]));
    const pins = inferProjectSourcePins(project);
    const sourceIds = Array.from(new Set(pins.map((p) => p.sourceId)));
    const pinnedRevisions = pins.map((p) => {
      const record = byId.get(p.sourceId)!;
      return {
        sourceId: record.id,
        name: record.name,
        repositoryUrl: record.canonicalUrl,
        commitSha: p.commitSha,
        licenseSpdx: record.licenseSpdx,
        status: record.integrationStatus,
      };
    });

    const projectArtifacts = artifacts.filter((a) => a.projectId === project.id);
    const primaryArtifact =
      projectArtifacts.find((a) => a.outputClass === 'physical_holo_archive') ?? projectArtifacts[0];
    const hasDocumentedSha256 = Boolean(
      primaryArtifact &&
        primaryArtifact.digestMode === 'DOCUMENTED_REFERENCE_DIGEST' &&
        /^[0-9a-f]{64}$/.test(primaryArtifact.sha256Digest)
    );
    const expectedArtifactSha = hasDocumentedSha256 ? primaryArtifact?.sha256Digest : undefined;

    const usesRule30 = sourceIds.includes('rule30');
    const usesPrismDevrel = sourceIds.includes('prism-devrel');
    const usesStitch = sourceIds.includes('stitch');
    const usesUorust = sourceIds.includes('uorust');

    const lexleanSuite = findAuthenticatedVerifierSuite({
      verifications,
      project,
      matchAuthorities: ['LexLean'],
      expectedArtifactSha,
    });
    const prismpmSuite = findAuthenticatedVerifierSuite({
      verifications,
      project,
      matchAuthorities: ['PrismPM'],
      expectedArtifactSha,
    });
    const hologramCoreSuite = findAuthenticatedVerifierSuite({
      verifications,
      project,
      matchAuthorities: ['Hologram Forge Application Core', 'Forge Kernel'],
      expectedArtifactSha,
    });
    const stitchCommitPass = Boolean(
      hasDocumentedSha256 &&
        primaryArtifact?.sha256Verified &&
        primaryArtifact?.fileExistsOnDisk &&
        (prismpmSuite || hologramCoreSuite)
    );

    const rule30Src = byId.get('rule30')!;
    const prismDevrelSrc = byId.get('prism-devrel')!;
    const stitchSrc = byId.get('stitch')!;
    const uorustSrc = byId.get('uorust')!;
    const prismpmSrc = byId.get('prismpm')!;

    const requirements: ProjectComplianceRequirement[] = [
      {
        id: 'REQ-PRISMPM-VERIFICATION-GATE',
        sourceId: 'prismpm',
        acceptanceId: 'PrismPM-verify / RELEASE-STATUS',
        sourceUrl: prismpmSrc.canonicalUrl,
        pinnedRevision: prismpmSrc.reviewedCommitSha,
        title: 'Independent PrismPM & Lean 4.32.1 Verification (Not Check/Build)',
        applicable: sourceIds.includes('prismpm') || sourceIds.includes('lexlean'),
        applicabilityRationale:
          'Applicable: project produces or verifies PrismPM / LexLean outputs.',
        applicableVerifier: 'prismpm verify + lexlean verify --all (leanchecker)',
        executionIdentity:
          prismpmSuite?.authenticExecutionRef ??
          lexleanSuite?.authenticExecutionRef ??
          'NO_AUTHENTICATED_EXECUTION_REF',
        evidenceRecord:
          prismpmSuite?.evidenceId ??
          lexleanSuite?.evidenceId ??
          'NO_VERIFIER_EVIDENCE_RECORDED',
        evaluationResult: prismpmSuite && lexleanSuite ? 'PASS' : 'BLOCKED',
        satisfied: Boolean(prismpmSuite && lexleanSuite),
        statusLabel: prismpmSuite && lexleanSuite ? 'SATISFIED' : 'BLOCKED',
        gapReason:
          prismpmSuite && lexleanSuite
            ? undefined
            : 'Requires independent authenticated PrismPM verify AND LexLean leanchecker evidence bound to current revision.',
      },
      {
        id: 'REQ-RULE30-AXIOM-FRONTIER',
        sourceId: 'rule30',
        acceptanceId: 'rule30:frontier.toml / problem1',
        sourceUrl: rule30Src.canonicalUrl,
        pinnedRevision: rule30Src.reviewedCommitSha,
        title: 'Constructive Axiom Audit & Open-Claim Frontier Separation (problem1 / aperiodic-compensation)',
        applicable: usesRule30,
        applicabilityRationale: usesRule30
          ? `Applicable: project "${project.name}" references formal research / LexLean verification models.`
          : 'Not applicable: project does not declare formal cellular/proof frontier inputs.',
        applicableVerifier: 'leanchecker + check_no_choice.py ({propext, Quot.sound} only)',
        executionIdentity: lexleanSuite?.authenticExecutionRef ?? 'OPEN_FRONTIER_UNPROVED',
        evidenceRecord: 'rule30:frontier.toml (problem1 UNTESTED, aperiodic-compensation BLOCKED)',
        evaluationResult: usesRule30 ? 'UNTESTED' : 'NOT APPLICABLE',
        satisfied: false,
        statusLabel: !usesRule30 ? 'NOT APPLICABLE' : 'BLOCKED',
        gapReason: usesRule30
          ? 'Rule 30 Prize Problem 1 remains UNTESTED and aperiodic-compensation remains BLOCKED in frontier.toml; constructive axiom audit cannot mark open conjectures proved.'
          : undefined,
      },
      {
        id: 'REQ-PRISM-DEVREL-FACETS',
        sourceId: 'prism-devrel',
        acceptanceId: 'DR-11 / Foundation.DevRel.V1',
        sourceUrl: prismDevrelSrc.canonicalUrl,
        pinnedRevision: prismDevrelSrc.reviewedCommitSha,
        title: 'Source-Pinned Facet Coverage & Catalog Verification (DR-01..DR-18 / Catalog)',
        applicable: usesPrismDevrel,
        applicabilityRationale: usesPrismDevrel
          ? `Applicable: project "${project.name}" uses Prism product / template synthesis metadata.`
          : 'Not applicable: project is not a Prism template product target.',
        applicableVerifier: 'prismpm check + Catalog::catalogCovered',
        executionIdentity: 'CATALOG_INCOMPLETE_UPSTREAM',
        evidenceRecord: 'prism-devrel Catalog.lex.tex (DR-11 & Catalog gaps remain unresolved)',
        evaluationResult: usesPrismDevrel ? 'BLOCKED' : 'NOT APPLICABLE',
        satisfied: false,
        statusLabel: !usesPrismDevrel ? 'NOT APPLICABLE' : 'GAP',
        gapReason: usesPrismDevrel
          ? 'DR-11 / Catalog conformance obligations remain open in upstream prism-devrel; browser preview metadata never satisfies template verification.'
          : undefined,
      },
      {
        id: 'REQ-STITCH-COMMITMENT-RECOVERY',
        sourceId: 'stitch',
        acceptanceId: 'stitch:C8/C10 (SHA-256 Commitment)',
        sourceUrl: stitchSrc.canonicalUrl,
        pinnedRevision: stitchSrc.reviewedCommitSha,
        title: 'Full SHA-256 Object Commitment & Deterministic State Replay Boundary (C8/C10)',
        applicable: usesStitch,
        applicabilityRationale: usesStitch
          ? `Applicable to "${project.name}" artifact digests and local workspace checkpoints (P2P/relay excluded).`
          : 'Not applicable.',
        applicableVerifier: 'node --test + on-disk SHA-256 recomputation',
        executionIdentity:
          stitchCommitPass
            ? hologramCoreSuite?.authenticExecutionRef ?? prismpmSuite?.authenticExecutionRef ?? 'VERIFIED_SHA256'
            : 'DIGEST_OR_DISK_UNVERIFIED',
        evidenceRecord: primaryArtifact
          ? `${primaryArtifact.id} (${primaryArtifact.digestMode})`
          : 'NO_ARTIFACT_RECORDED',
        evaluationResult: !usesStitch
          ? 'NOT APPLICABLE'
          : stitchCommitPass
            ? 'PASS'
            : 'BLOCKED',
        satisfied: Boolean(usesStitch && stitchCommitPass),
        statusLabel: !usesStitch
          ? 'NOT APPLICABLE'
          : stitchCommitPass
            ? 'SATISFIED'
            : hasDocumentedSha256
              ? 'GAP'
              : 'BLOCKED',
        gapReason: usesStitch
          ? stitchCommitPass
            ? undefined
            : !hasDocumentedSha256
              ? 'Artifact uses SYNTHETIC_DEMO_DIGEST or UNAVAILABLE rather than verified on-disk SHA-256 commitment.'
              : 'On-disk artifact file presence and independent verifier authentication have not completed.'
          : undefined,
      },
      {
        id: 'REQ-STITCH-UNRESOLVED-CLAIMS',
        sourceId: 'stitch',
        acceptanceId: 'stitch:C1..C6 Unresolved/Refuted Claims',
        sourceUrl: stitchSrc.canonicalUrl,
        pinnedRevision: stitchSrc.reviewedCommitSha,
        title: 'Preserved Stitch C1 (Untested), C2/C5 (Blocked), and C3/C4/C6 (Refuted) Source Boundaries',
        applicable: usesStitch,
        applicabilityRationale: usesStitch
          ? 'Always tracked as explicit non-promoted boundary whenever stitch commitments are cited.'
          : 'Not applicable.',
        applicableVerifier: 'afflom/stitch upstream custody & formal proofs (not present)',
        executionIdentity: 'UPSTREAM_CLAIMS_UNRESOLVED_OR_REFUTED',
        evidenceRecord: 'stitch audit: C1 untested; C2/C5 blocked; C3/C4/C6 refuted',
        evaluationResult: usesStitch ? 'REFUTED' : 'NOT APPLICABLE',
        satisfied: false,
        statusLabel: usesStitch ? 'BLOCKED' : 'NOT APPLICABLE',
        gapReason: usesStitch
          ? 'Stitch claims C1 (untested), C2/C5 (blocked), and C3/C4/C6 (refuted) remain explicitly non-satisfied and cannot be overridden by passing build checks.'
          : undefined,
      },
      {
        id: 'REQ-UORUST-SPAN-REFUSALS',
        sourceId: 'uorust',
        acceptanceId: 'UORust:UE-03/UE-06 (Route Admission)',
        sourceUrl: uorustSrc.canonicalUrl,
        pinnedRevision: uorustSrc.reviewedCommitSha,
        title: 'Non-Defaulting Cargo Route Admission & Typed Source-Span Refusals (UE-01..UE-07, UE-03/UE-06)',
        applicable: usesUorust,
        applicabilityRationale: usesUorust
          ? `Applicable: project "${project.name}" models an existing Rust Cargo workspace.`
          : 'Not applicable: project does not target Cargo workspace translation.',
        applicableVerifier: 'uorust project + cargo metadata (Mac Studio Windmill worker only)',
        executionIdentity: 'WINDMILL_UORUST_NOT_CONNECTED',
        evidenceRecord: 'uorust: UE-03/UE-06 blocked until Mac Studio Cargo workspace check executes',
        evaluationResult: usesUorust ? 'BLOCKED' : 'NOT APPLICABLE',
        satisfied: false,
        statusLabel: !usesUorust ? 'NOT APPLICABLE' : 'BLOCKED',
        gapReason: usesUorust
          ? 'Live `cargo metadata` / `uorust` Windmill runnable (`f/uor_foundry/uorust_model_workspace`) is NOT CONNECTED and UE-03/UE-06 refusals remain blocked in browser preview.'
          : undefined,
      },
      {
        id: 'REQ-GOV-SEPARATION-OF-DUTIES',
        sourceId: usesUorust ? 'uorust' : usesPrismDevrel ? 'prism-devrel' : 'prismpm',
        acceptanceId: 'UOR-GOV-RELEASE-01',
        sourceUrl: prismpmSrc.canonicalUrl,
        pinnedRevision: prismpmSrc.reviewedCommitSha,
        title: 'Fail-Closed Human Production Release Authorization (APPROVED_FOR_RELEASE)',
        applicable: true,
        applicabilityRationale:
          'Always applicable under UOR governance: documentation, tests, AI replies, and test approvals never certify production release.',
        applicableVerifier: 'Signed human APPROVED_FOR_RELEASE + policy binding',
        executionIdentity: authoritySummary.releaseEligible
          ? 'AUTHORIZED_HUMAN_RELEASE'
          : 'RELEASE_AUTHORIZATION_ABSENT',
        evidenceRecord: authoritySummary.releaseEligible
          ? 'APPROVED_FOR_RELEASE verified'
          : authoritySummary.blockingReasons[0] ?? 'NO_APPROVED_FOR_RELEASE_RECORD',
        evaluationResult: authoritySummary.releaseEligible ? 'PASS' : 'BLOCKED',
        satisfied: authoritySummary.releaseEligible,
        statusLabel: authoritySummary.releaseEligible ? 'SATISFIED' : 'BLOCKED',
        gapReason: authoritySummary.releaseEligible
          ? undefined
          : authoritySummary.blockingReasons[0] ??
            'Explicit human APPROVED_FOR_RELEASE bound to verified artifact SHA-256 and policy version is absent.',
      },
    ];

    const sanitizedRequirements = requirements.map((r) =>
      !r.applicable
        ? {
            ...r,
            satisfied: false,
            statusLabel: 'NOT APPLICABLE' as const,
            evaluationResult: 'NOT APPLICABLE' as const,
          }
        : r
    );

    const coverageGaps = sanitizedRequirements
      .filter((r) => r.applicable && !r.satisfied && r.gapReason)
      .map((r) => `${r.id} [${r.acceptanceId}]: ${r.gapReason}`);

    const releaseBlockers = Array.from(
      new Set([
        ...authoritySummary.blockingReasons,
        ...pinnedRevisions
          .filter((p) => p.status !== 'QUALIFIED' && p.status !== 'CONNECTED')
          .map(
            (p) =>
              `Source "${p.name}" (@ ${p.commitSha.slice(0, 8)}) has integration status ${p.status}.`
          ),
      ])
    );

    return {
      projectId: project.id,
      sourceIds,
      pinnedRevisions,
      requirements: sanitizedRequirements,
      verificationEvidenceSummary: `${authoritySummary.authenticatedPassCount}/${authoritySummary.requiredSuiteCount} mandatory independent policy suites authenticated (simulated passes: ${authoritySummary.simulatedOnlyCount}; overall state: ${authoritySummary.overallVerificationState}).`,
      coverageGaps,
      currentQualificationState: authoritySummary.overallVerificationState,
      releaseBlockers,
      assessedAt: new Date().toISOString(),
    };
  }
}

export const sourceComplianceService = new SourceComplianceService();
