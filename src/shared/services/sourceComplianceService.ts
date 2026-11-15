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

/**
 * Layer 5: Project-specific Source Review & Compliance Assessment.
 *
 * Enforces:
 * - Project-specific applicability assessment before any requirement is evaluated.
 * - Strict separation between source docs, test evidence, independent verifier evidence,
 *   compliance status, and human production release authorization.
 * - Source documentation or AI claims NEVER mark a requirement or release satisfied.
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

    const pins = inferProjectSourcePins(project);
    const sourceIds = Array.from(new Set(pins.map((p) => p.sourceId)));
    const pinnedRevisions = pins.map((p) => {
      const record = REVIEWED_SOURCES_REGISTER.find((r) => r.id === p.sourceId)!;
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
    const primaryArtifact = projectArtifacts[0];
    const hasDocumentedSha256 = Boolean(
      primaryArtifact &&
        primaryArtifact.digestMode === 'DOCUMENTED_REFERENCE_DIGEST' &&
        /^[0-9a-f]{64}$/.test(primaryArtifact.sha256Digest)
    );

    const hasVerifiedAll = authoritySummary.overallVerificationState === 'VERIFIED';

    const usesRule30 = sourceIds.includes('rule30');
    const usesPrismDevrel = sourceIds.includes('prism-devrel');
    const usesStitch = sourceIds.includes('stitch');
    const usesUorust = sourceIds.includes('uorust');

    const requirements: ProjectComplianceRequirement[] = [
      {
        id: 'REQ-RULE30-AXIOM-FRONTIER',
        sourceId: 'rule30',
        title: 'Constructive Axiom Audit & Open-Claim Frontier Separation',
        applicable: usesRule30,
        applicabilityRationale: usesRule30
          ? `Applicable: project "${project.name}" references formal research / LexLean verification models.`
          : 'Not applicable: project does not declare formal cellular/proof frontier inputs.',
        satisfied: false,
        statusLabel: !usesRule30 ? 'NOT APPLICABLE' : hasVerifiedAll ? 'SATISFIED' : 'BLOCKED',
        gapReason: usesRule30
          ? hasVerifiedAll
            ? undefined
            : 'Local Lean 4.32.1 `leanchecker` & `check_no_choice.py` execution not present in browser preview; Prize Problem 1 / open conjectures cannot be marked proved.'
          : undefined,
      },
      {
        id: 'REQ-PRISM-DEVREL-FACETS',
        sourceId: 'prism-devrel',
        title: 'Source-Pinned Facet Coverage & uor/template-contract/1 SDK Gate (DR-01..DR-18)',
        applicable: usesPrismDevrel,
        applicabilityRationale: usesPrismDevrel
          ? `Applicable: project "${project.name}" uses Prism product / template synthesis metadata.`
          : 'Not applicable: project is not a Prism template product target.',
        satisfied: false,
        statusLabel: !usesPrismDevrel ? 'NOT APPLICABLE' : hasVerifiedAll ? 'SATISFIED' : 'GAP',
        gapReason: usesPrismDevrel
          ? hasVerifiedAll
            ? undefined
            : 'Simulated browser preview metadata cannot replace `prismpm template check` or Lean `Catalog::catalogCovered` verification.'
          : undefined,
      },
      {
        id: 'REQ-STITCH-COMMITMENT-RECOVERY',
        sourceId: 'stitch',
        title: 'Full SHA-256 Object Commitment & Deterministic State Replay Boundary (C8/C10)',
        applicable: usesStitch,
        applicabilityRationale: usesStitch
          ? `Applicable universally to "${project.name}" artifact digests and local workspace checkpoints (P2P/relay features excluded).`
          : 'Not applicable.',
        satisfied: usesStitch && hasDocumentedSha256 && hasVerifiedAll,
        statusLabel: !usesStitch
          ? 'NOT APPLICABLE'
          : hasDocumentedSha256 && hasVerifiedAll
            ? 'SATISFIED'
            : hasDocumentedSha256
              ? 'GAP'
              : 'BLOCKED',
        gapReason: usesStitch
          ? !hasDocumentedSha256
            ? 'Artifact digest uses SYNTHETIC_DEMO_DIGEST or UNAVAILABLE rather than verified content-addressed SHA-256.'
            : hasVerifiedAll
              ? undefined
              : 'Authoritative custody & independent verification suites remain unverified locally.'
          : undefined,
      },
      {
        id: 'REQ-UORUST-SPAN-REFUSALS',
        sourceId: 'uorust',
        title: 'Non-Defaulting Cargo Route Admission & Typed Source-Span Refusals (UE-01..UE-07)',
        applicable: usesUorust,
        applicabilityRationale: usesUorust
          ? `Applicable: project "${project.name}" models an existing Rust Cargo workspace.`
          : 'Not applicable: project does not target Cargo workspace translation.',
        satisfied: false,
        statusLabel: !usesUorust ? 'NOT APPLICABLE' : hasVerifiedAll ? 'SATISFIED' : 'BLOCKED',
        gapReason: usesUorust
          ? hasVerifiedAll
            ? undefined
            : 'Live `cargo metadata` / `uorust` Windmill runnable (`f/uor_foundry/uorust_model_workspace`) is NOT CONNECTED and arbitrary Cargo builds are prohibited in browser preview.'
          : undefined,
      },
      {
        id: 'REQ-GOV-SEPARATION-OF-DUTIES',
        sourceId: usesUorust ? 'uorust' : usesPrismDevrel ? 'prism-devrel' : 'rule30',
        title: 'Fail-Closed Human Production Release Authorization (APPROVED_FOR_RELEASE)',
        applicable: true,
        applicabilityRationale:
          'Always applicable under UOR governance: documentation, tests, AI replies, and test approvals never certify production release.',
        satisfied: authoritySummary.releaseEligible,
        statusLabel: authoritySummary.releaseEligible ? 'SATISFIED' : 'BLOCKED',
        gapReason: authoritySummary.releaseEligible
          ? undefined
          : authoritySummary.blockingReasons[0] ??
            'Explicit human APPROVED_FOR_RELEASE bound to verified artifact SHA-256 and policy version is absent.',
      },
    ];

    // Keep strict invariant: documentation / non-verified state cannot self-satisfy
    const sanitizedRequirements = requirements.map((r) =>
      !r.applicable
        ? { ...r, satisfied: false, statusLabel: 'NOT APPLICABLE' as const }
        : hasVerifiedAll
          ? r
          : { ...r, satisfied: false, statusLabel: r.statusLabel === 'SATISFIED' ? ('GAP' as const) : r.statusLabel }
    );

    const coverageGaps = sanitizedRequirements
      .filter((r) => r.applicable && !r.satisfied && r.gapReason)
      .map((r) => `${r.id}: ${r.gapReason}`);

    const releaseBlockers = Array.from(
      new Set([
        ...authoritySummary.blockingReasons,
        ...pinnedRevisions
          .filter((p) => p.status !== 'QUALIFIED' && p.status !== 'CONNECTED')
          .map((p) => `Source "${p.name}" (@ ${p.commitSha.slice(0, 8)}) has integration status ${p.status}.`),
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
