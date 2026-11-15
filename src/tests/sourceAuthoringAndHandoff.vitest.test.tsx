// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntakeModal } from '../shared/components/IntakeModal';
import { ArtifactsView, UNIFIED_ARTIFACT_CATEGORIES } from '../shared/components/views/ArtifactsView';
import { INITIAL_ARTIFACTS, INITIAL_PROJECTS } from '../shared/data/seedFoundryData';
import { foundryService } from '../shared/services/foundryService';
import {
  buildAuthoringWorkspaceForJourney,
  buildSourcePackageManifest,
  createAuthoringCheckpoint,
  createSimulatedAiSourceProposal,
  parseAndVerifySourcePackage,
  runPreliminaryBrowserDiagnostics,
  validateDraftFilePath,
} from '../shared/services/sourceAuthoringService';
import { verificationAuthorityService } from '../shared/services/verificationAuthorityService';
import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ProjectRecord,
  VerificationSuiteRecord,
} from '../shared/types/foundry';

afterEach(() => {
  cleanup();
});

describe('Prism Source Authoring, Guided Journeys & Handoff Package Acceptance', () => {
  it('scaffolds all 3 guided journeys cleanly without fabricating theorem proofs', () => {
    const appWs = buildAuthoringWorkspaceForJourney({
      journeyType: 'PRISM_APPLICATION',
      inputMode: 'GUIDED_PRODUCT',
      projectName: 'Subject Explorer',
      purpose: 'Inspect 7 Prism facets and portable views.',
      sourceRevision: 'prism-devrel/main@8af99e96',
    });
    expect(appWs.files.some((f) => f.path.endsWith('.lex.tex'))).toBe(true);
    expect(appWs.files.some((f) => f.path === 'prismpm.toml')).toBe(true);
    expect(appWs.files.some((f) => f.path === 'facets/model.facets.json')).toBe(true);
    expect(appWs.reviewStatus).toBe('DRAFT_UNREVIEWED');

    const rustWs = buildAuthoringWorkspaceForJourney({
      journeyType: 'RUST_WORKSPACE',
      inputMode: 'EXISTING_RUST',
      projectName: 'Cargo Ledger Probe',
      purpose: 'Translate certified workspace into Prism spans.',
      sourceRevision: 'UORust/main@5868afe3',
    });
    expect(rustWs.files.some((f) => f.path === 'Cargo.toml')).toBe(true);
    expect(rustWs.files.some((f) => f.path === 'Cargo.lock')).toBe(true);
    expect(rustWs.files.some((f) => f.path === 'model/routes.toml')).toBe(true);

    const researchWs = buildAuthoringWorkspaceForJourney({
      journeyType: 'FORMAL_RESEARCH',
      inputMode: 'NATIVE_PRISM',
      projectName: 'Rule30 Constructive Frontier',
      purpose: 'Track constructive Lean 4 theorems and open conjectures.',
      sourceRevision: 'rule30/main@e3be477f',
    });
    expect(researchWs.files.some((f) => f.path === 'frontier.toml')).toBe(true);
    expect(researchWs.files.some((f) => f.path === 'acceptance/claim-register.json')).toBe(true);
    expect(
      researchWs.files.find((f) => f.path === 'acceptance/claim-register.json')?.content
    ).toContain('"state": "untested"');
  });

  it('labels all browser source diagnostics explicitly as preliminary non-compiler checks', () => {
    const ws = buildAuthoringWorkspaceForJourney({
      journeyType: 'FORMAL_RESEARCH',
      inputMode: 'NATIVE_PRISM',
      projectName: 'Diag Probe',
      purpose: 'Verify constructive gate diagnostics.',
      sourceRevision: 'lexlean/main@71defb4c',
    });

    const brokenFiles = ws.files.map((f) =>
      f.path.endsWith('.lex.tex')
        ? { ...f, content: '\\theorem{cheat}{Prop := sorry}' }
        : f
    );
    const diags = runPreliminaryBrowserDiagnostics(brokenFiles, 'NATIVE_PRISM');
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.every((d) => d.isPreliminaryBrowserCheck === true)).toBe(true);
    expect(diags.some((d) => d.code === 'PRELIM_LEXTEX_ENVELOPE')).toBe(true);
    expect(diags.some((d) => d.code === 'PRELIM_NON_CONSTRUCTIVE')).toBe(true);
  });

  it('requires explicit operator approval before AI source drafts modify workspace files and invalidates stale PASS evidence (INV-003)', () => {
    const project: ProjectRecord = {
      ...INITIAL_PROJECTS[0],
      id: 'proj-auth-inv003',
      sourceRevision: 'prismpm/main@rev1',
    };
    const targetFile = project.authoringWorkspace!.files.find((f) => f.path.endsWith('.lex.tex'))!;
    const proposal = createSimulatedAiSourceProposal({
      targetFile,
      instruction: 'Add deterministic fuel requirement R-10',
    });

    // AI proposal starts pending review — source file remains unmodified
    expect(proposal.status).toBe('PENDING_REVIEW');
    expect(targetFile.content).not.toContain('R-10');

    // Simulate previously passing/authenticated suite bound to rev1
    const prevDigest = 'a'.repeat(64);
    const verifications: VerificationSuiteRecord[] = [
      {
        id: 'ver-pass-1',
        projectId: project.id,
        suiteId: 'lexlean-kernel-proof',
        suiteName: 'LexLean Kernel Proof',
        suiteVersion: '0.4.0',
        policyVersion: '2026.11.v1',
        authority: 'LexLean',
        status: 'PASS',
        epistemicCondition: 'DOCUMENTED',
        evidenceId: 'ev-1',
        sourceRevision: 'prismpm/main@rev1',
        artifactHash: prevDigest,
        toolchainIdentity: 'lexlean 0.4.0',
        executionRecord: 'verified at rev1',
        authenticationStatus: 'AUTHENTICATED_BY_VERIFIER',
        authenticExecutionRef: 'exec-real-1234',
        evidenceProvenance: 'mac-studio-leanchecker',
        lastCheckedAt: '2026-11-15T08:00:00Z',
        isSimulated: false,
        blockingForRelease: false,
        notes: 'Valid at rev1',
      },
    ];
    const approvals: ApprovalDecisionRecord[] = [
      {
        id: 'apr-rel-1',
        projectId: project.id,
        gate: 'RELEASE_AUTHORIZATION',
        authorizationScope: 'PRODUCTION_RELEASE',
        title: 'Release Auth',
        requiredRole: 'Human',
        authorizedReviewer: 'J. Reviewer',
        authenticatedApproverId: 'reviewer-j-01',
        disposition: 'APPROVED_FOR_RELEASE',
        aiPermitted: false,
        isSimulated: false,
        sourceRevision: 'prismpm/main@rev1',
        artifactDigest: prevDigest,
        policyVersion: '2026.11.v1',
        evidenceRefs: ['ev-1'],
        decidedAt: '2026-11-15T08:05:00Z',
        rationale: 'Approved at rev1',
        policyReference: 'policy',
      },
    ];
    const artifacts: ArtifactProvenanceRecord[] = [
      {
        ...INITIAL_ARTIFACTS[0],
        projectId: project.id,
        sha256Digest: prevDigest,
        digestMode: 'DOCUMENTED_REFERENCE_DIGEST',
        sourceRevision: 'prismpm/main@rev1',
      },
    ];

    // Applying an authoritative source edit triggers INV-003
    const inv = verificationAuthorityService.invalidateStaleEvidenceOnSourceChange({
      project,
      newSourceRevision: 'prismpm/main@rev1-draft.1',
      verifications,
      approvals,
    });
    expect(inv.updatedVerifications[0].status).toBe('NOT VERIFIED');
    expect(inv.updatedVerifications[0].authenticationStatus).toBe('STALE');
    expect(inv.updatedApprovals[0].disposition).toBe('BLOCKED');

    const postAuth = verificationAuthorityService.evaluateProjectAuthority(
      {
        project: inv.updatedProject,
        verifications: inv.updatedVerifications,
        artifacts,
        approvals: inv.updatedApprovals,
      },
      { authenticateVerifierRecord: () => true, authenticateHumanApprover: () => true }
    );
    expect(postAuth.overallVerificationState).toBe('NOT VERIFIED');
    expect(postAuth.releaseStatusLabel).toBe('RELEASE BLOCKED');
  });

  it('exports reviewed Foundry source package (.uor-src.json), scrubs secrets, creates checkpoints, and verifies round-trip without data loss', async () => {
    const project = INITIAL_PROJECTS[0];
    const ws = buildAuthoringWorkspaceForJourney({
      journeyType: 'PRISM_APPLICATION',
      inputMode: 'NATIVE_PRISM',
      projectName: project.name,
      purpose: project.purpose,
      sourceRevision: project.sourceRevision,
    });

    // Inject secret + host path in a draft note to prove sanitizer scrubs it on export
    ws.files[0] = {
      ...ws.files[0],
      content: `${ws.files[0].content}\n% bearer_token=sk-live-secret-token-99999 /Users/alice/private/key.pem`,
    };

    const cp = await createAuthoringCheckpoint({
      projectId: project.id,
      name: 'Pre-Export Snapshot',
      sourceRevision: project.sourceRevision,
      files: ws.files,
    });
    expect(cp.stateSha256).toMatch(/^[0-9a-f]{64}$/);

    // Unreviewed export must fail closed
    await expect(
      buildSourcePackageManifest({
        project,
        workspace: ws,
        reviewConfirmed: false,
        reviewSummary: '',
        targetDestination: 'MAC_STUDIO_UOR_OFFLINE_FOUNDRY',
      })
    ).rejects.toThrow(/explicit operator review/i);

    const manifest = await buildSourcePackageManifest({
      project,
      workspace: ws,
      reviewConfirmed: true,
      reviewSummary: 'Verified 9 files before local handoff',
      targetDestination: 'MAC_STUDIO_UOR_OFFLINE_FOUNDRY',
    });

    expect(manifest.schema).toBe('uor.foundry.source-package.v1');
    expect(manifest.isHoloArchive).toBe(false);
    expect(manifest.packageClassification).toBe('UNVERIFIED_AUTHORED_SOURCE_PACKAGE');
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain('sk-live-secret-token-99999');
    expect(serialized).not.toContain('/Users/alice/private');

    const roundTrip = await parseAndVerifySourcePackage(serialized);
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) {
      expect(roundTrip.verifiedFileCount).toBe(ws.files.length);
      expect(roundTrip.manifest.packageDigestSha256).toBe(manifest.packageDigestSha256);
    }
  });

  it('rejects path traversal, .holo/.wasm mislabeling, tampering, and unreviewed packages in security negative tests', async () => {
    expect(validateDraftFilePath('../../etc/passwd').ok).toBe(false);
    expect(validateDraftFilePath('/etc/shadow').ok).toBe(false);
    expect(validateDraftFilePath('dist/fake.holo').ok).toBe(false);
    expect(validateDraftFilePath('dist/module.wasm').ok).toBe(false);

    const project = INITIAL_PROJECTS[0];
    const manifest = await buildSourcePackageManifest({
      project,
      workspace: project.authoringWorkspace!,
      reviewConfirmed: true,
      reviewSummary: 'Clean export',
      targetDestination: 'AIR_GAPPED_PHYSICAL_MEDIA',
    });

    // Tampered file content
    const tamperedContent = structuredClone(manifest);
    tamperedContent.files[0].content += '\n% tampered line';
    const resTampered = await parseAndVerifySourcePackage(JSON.stringify(tamperedContent));
    expect(resTampered.ok).toBe(false);
    if (!resTampered.ok) expect(resTampered.errorCode).toBe('TAMPER_DETECTED');

    // Path traversal injected into manifest
    const traversalManifest = structuredClone(manifest);
    traversalManifest.files[0].path = '../escape/main.lex.tex';
    const resTraversal = await parseAndVerifySourcePackage(JSON.stringify(traversalManifest));
    expect(resTraversal.ok).toBe(false);
    if (!resTraversal.ok) expect(resTraversal.errorCode).toBe('PATH_TRAVERSAL_REFUSED');

    // Mislabeling as .holo archive
    const fakeHolo = structuredClone(manifest) as unknown as Record<string, unknown>;
    fakeHolo.isHoloArchive = true;
    const resHolo = await parseAndVerifySourcePackage(JSON.stringify(fakeHolo));
    expect(resHolo.ok).toBe(false);
    if (!resHolo.ok) expect(resHolo.errorCode).toBe('HOLO_MISLABEL_REFUSED');

    // Unreviewed package
    const unreviewed = structuredClone(manifest) as unknown as Record<string, unknown>;
    unreviewed.reviewConfirmed = false;
    const resUnreviewed = await parseAndVerifySourcePackage(JSON.stringify(unreviewed));
    expect(resUnreviewed.ok).toBe(false);
    if (!resUnreviewed.ok) expect(resUnreviewed.errorCode).toBe('UNREVIEWED_EXPORT');

    // Synthetic intake always attaches authoringWorkspace and never leaves release unblocked
    const created = await foundryService.createSyntheticProjectIntake({
      projectName: 'Security Intake Probe',
      inputMode: 'EXISTING_RUST',
      productFamily: 'formal-verification',
      componentId: 'uorust-translator',
      workflowId: 'wf-uorust-modeling',
      purpose: 'Validate fail-closed Rust modeling workspace boundary.',
      declaredInputs: 'Cargo.toml, Cargo.lock, model/routes.toml',
      environmentDeclaration: 'Sanitized sandbox',
      sourceRevision: 'UORust/demo@5868afe3',
      acknowledgeBoundary: true,
    });
    expect(created.project.authoringWorkspace?.journeyType).toBe('RUST_WORKSPACE');
    expect(created.approvals.find((a) => a.gate === 'RELEASE_AUTHORIZATION')?.disposition).toBe('BLOCKED');
  });

  it('renders live structured input manifest preview in IntakeModal and 10 categories in ArtifactsView', () => {
    render(<IntakeModal open onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByTestId('intake-manifest-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('template-rust-workspace-model'));
    expect(screen.getByTestId('intake-manifest-preview')).toHaveTextContent(/UORust/i);
    expect(screen.getByTestId('intake-manifest-preview')).toHaveTextContent(/Cargo\.lock/);

    render(
      <ArtifactsView
        projects={INITIAL_PROJECTS}
        artifacts={INITIAL_ARTIFACTS}
        selectedProjectId={INITIAL_PROJECTS[0].id}
      />
    );
    expect(UNIFIED_ARTIFACT_CATEGORIES.length).toBe(11); // 'all' + 10 artifact categories
    expect(screen.getByTestId('artifacts-source-package-summary')).toHaveTextContent(
      'UNVERIFIED_AUTHORED_SOURCE_PACKAGE'
    );
    fireEvent.change(screen.getByTestId('artifact-category-filter'), {
      target: { value: 'hologram_archive' },
    });
    expect(screen.getByTestId('artifact-category-filter')).toHaveValue('hologram_archive');
  });
});
