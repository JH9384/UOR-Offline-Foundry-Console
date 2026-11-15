import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FIXED_WINDMILL_COMMAND_REGISTRY,
  validateFixedRegistryCommand,
} from '../shared/adapters/windmillCommandRegistry';
import { ArtifactsView } from '../shared/components/views/ArtifactsView';
import { PINNED_REPOSITORY_MANIFEST } from '../shared/data/toolchainPinManifest';
import {
  INITIAL_APPROVALS,
  INITIAL_ARTIFACTS,
  INITIAL_PROJECTS,
  INITIAL_VERIFICATION_SUITES,
  INITIAL_WORKFLOW_RUNS,
} from '../shared/data/seedFoundryData';
import { foundryService } from '../shared/services/foundryService';
import {
  buildSyntheticHoloV4TestFixtureBytes,
  canDownloadVerifiedArtifact,
  computeSha256Hex,
  evaluateProjectOfflineClosure,
  HOLO_V5_UORC_MAGIC,
  inspectHoloArchiveBytes,
  validateOfflineDependencyClosure,
} from '../shared/services/holoArchiveValidator';
import { FailClosedLocalWindmillService } from '../shared/adapters/windmillExecutionService';
import { artifactsService } from '../shared/services/artifactsService';
import { verificationAuthorityService } from '../shared/services/verificationAuthorityService';
import {
  buildHologramV4Buffer,
  parseHologramV4Header as parseHologramV4HeaderFromRootService,
} from '../services/hologramService';

afterEach(() => {
  cleanup();
});

describe('Prism Source-to-Hologram Production Integration & Failure Paths', () => {
  it('pins all 8 authoritative repositories at exact full 40-char commit SHAs', () => {
    const map = Object.fromEntries(PINNED_REPOSITORY_MANIFEST.map((m) => [m.sourceId, m.pinnedCommitSha]));
    expect(map['prismpm']).toBe('6c876017bffa0e770cffc2225cb2d2422c35a69a');
    expect(map['lexlean']).toBe('71defb4c663aaec5b9a3aab04cbc6a03e7106227');
    expect(map['foundry']).toBe('760eaac29687628c7c66e8d492e126afa194656e');
    expect(map['hologram-live']).toBe('cbbf97b5b8199f5701c621cd3ba0b26187417ffa');
    expect(map['prism-devrel']).toBe('8af99e96f6bd9f5865721171e582d8df6ad53166');
    expect(map['uorust']).toBe('5868afe38012d647be00ad948949b1e384b87211');
    expect(map['rule30']).toBe('e3be477fded263029479127363f7fb6a3597e7d4');
    expect(map['stitch']).toBe('1607d53dfc5a34324f8102123d166d727cc66634');
  });

  it('models PrismPM/examples/Calculator across all 10 workflow stages and all 11 typed artifact output classes', () => {
    const calc = INITIAL_PROJECTS.find((p) => p.id === 'proj-prism-calc')!;
    const calcRun = INITIAL_WORKFLOW_RUNS.find((r) => r.projectId === 'proj-prism-calc')!;
    const calcArts = INITIAL_ARTIFACTS.filter((a) => a.projectId === 'proj-prism-calc');
    expect(calc.inputMode).toBe('NATIVE_PRISM');
    expect(calcRun.stages.map((s) => s.stageContractName)).toEqual([
      'INTAKE',
      'SPECIFY',
      'LOCK',
      'CHECK',
      'BUILD',
      'VERIFY',
      'INSPECT',
      'PREVIEW',
      'REVIEW',
      'EXPORT_RELEASE',
    ]);
    for (const stage of calcRun.stages) {
      expect(stage.executionId).toBeTruthy();
      expect(stage.toolchainIdentity).toBeTruthy();
      expect(stage.sourceRevision).toBe('prismpm/main@6c876017');
      expect(stage.finalState).toBeTruthy();
      expect(stage.fixedCommandId).toBeTruthy();
    }
    // Complete 11-class typed output contract
    const outputClasses = new Set(calcArts.map((a) => a.outputClass));
    expect(outputClasses.size).toBe(11);
    expect(calcArts.every((a) => a.artifactState !== 'VERIFIED')).toBe(true);

    const evalSummary = verificationAuthorityService.evaluateProjectAuthority({
      project: calc,
      verifications: INITIAL_VERIFICATION_SUITES,
      artifacts: INITIAL_ARTIFACTS,
      approvals: INITIAL_APPROVALS,
    });
    expect(evalSummary.releaseEligible).toBe(false);
    expect(evalSummary.overallVerificationState).toBe('NOT VERIFIED');
  });

  it('returns STRUCTURAL PREFLIGHT PASS (never verification) for valid HOLO\\x04\\0 v4 and UORC\\x02\\x01 v5 binaries and rejects JSON as PP3001', async () => {
    // 1. Valid HOLO v4 fixture + non-zero trailer + matching SHA-256 -> STRUCTURAL PREFLIGHT PASS
    const v4Bytes = buildSyntheticHoloV4TestFixtureBytes('calc-ref-v4');
    const v4Digest = await computeSha256Hex(v4Bytes);
    const v4Pass = await inspectHoloArchiveBytes(v4Bytes, v4Digest, { isSyntheticFixture: true });
    expect(v4Pass.valid).toBe(true);
    expect(v4Pass.status).toBe('STRUCTURAL PREFLIGHT PASS');
    expect(v4Pass.isSyntheticFixture).toBe(true);
    expect(v4Pass.hasCoreWasmMagic).toBe(true);
    expect(v4Pass.hasHoloviewMagic).toBe(true);
    expect(v4Pass.footerPresent).toBe(true);
    expect(v4Pass.sha256MatchedExpected).toBe(true);
    expect(v4Pass.trustLayers.independentHologramVerification).toBe('NOT_RUN_IN_BROWSER');
    expect(v4Pass.trustLayers.productionReleaseAuthorization).toBe('BLOCKED');

    // 2. SHA-256 manifest mismatch triggers PP5401
    const v4Mismatch = await inspectHoloArchiveBytes(v4Bytes, '0'.repeat(64));
    expect(v4Mismatch.valid).toBe(false);
    expect(v4Mismatch.errorCode).toBe('PP5401');

    // 3. Valid UORC v5 container header + uleb role count >= 7 + non-zero 32-byte seal
    const v5Bytes = new Uint8Array(HOLO_V5_UORC_MAGIC.length + 2 + 1 + 16 + 32);
    v5Bytes.set(HOLO_V5_UORC_MAGIC, 0);
    v5Bytes[6] = 0x00;
    v5Bytes[7] = 0x00;
    v5Bytes[8] = 0x07; // 7 roles uleb
    for (let i = v5Bytes.length - 32; i < v5Bytes.length; i++) {
      v5Bytes[i] = ((i * 19) ^ 0x3c) & 0xff || 0x11;
    }
    const v5Pass = await inspectHoloArchiveBytes(v5Bytes);
    expect(v5Pass.valid).toBe(true);
    expect(v5Pass.status).toBe('STRUCTURAL PREFLIGHT PASS');
    expect(v5Pass.archiveVersion).toBe('v5-uorc');

    // 4. Legacy JSON disguised as .holo rejected with PP3001
    const jsonBytes = new TextEncoder().encode('{"fake":"calculator.holo","version":4}');
    const jsonReject = await inspectHoloArchiveBytes(jsonBytes);
    expect(jsonReject.valid).toBe(false);
    expect(jsonReject.status).toBe('REJECTED_JSON_AS_HOLO_PP3001');
    expect(jsonReject.errorCode).toBe('PP3001');
  });

  it('gates direct binary/source/wasm/evidence downloads strictly on on-disk existence + SHA-256 + VERIFIED state', async () => {
    expect(canDownloadVerifiedArtifact(undefined)).toBe(false);
    expect(
      canDownloadVerifiedArtifact({ fileExistsOnDisk: false, sha256Verified: true, artifactState: 'VERIFIED' })
    ).toBe(false);
    expect(
      canDownloadVerifiedArtifact({ fileExistsOnDisk: true, sha256Verified: false, artifactState: 'VERIFIED' })
    ).toBe(false);
    expect(
      canDownloadVerifiedArtifact({ fileExistsOnDisk: true, sha256Verified: true, artifactState: 'PREFLIGHT_CHECKED' })
    ).toBe(false);
    expect(
      canDownloadVerifiedArtifact({ fileExistsOnDisk: true, sha256Verified: true, artifactState: 'VERIFIED' })
    ).toBe(true);

    const calc = INITIAL_PROJECTS.find((p) => p.id === 'proj-prism-calc')!;
    const calcArts = INITIAL_ARTIFACTS.filter((a) => a.projectId === calc.id);
    const holoArt = calcArts.find((a) => a.outputClass === 'physical_holo_archive')!;
    const orderedArts = [holoArt, ...calcArts.filter((a) => a.id !== holoArt.id)];
    render(<ArtifactsView projects={[calc]} artifacts={orderedArts} selectedProjectId={calc.id} />);

    // All 4 verified direct download buttons must be disabled in browser sandbox
    const gate = within(screen.getByTestId('direct-download-gate'));
    const holoBtn = gate.getByRole('button', { name: /\.holo Archive Binary/i }) as HTMLButtonElement;
    const wasmBtn = gate.getByRole('button', { name: /Core-Wasm \+ HOLOVIEW Bundle/i }) as HTMLButtonElement;
    expect(holoBtn.disabled).toBe(true);
    expect(wasmBtn.disabled).toBe(true);

    // Interactive inspector self-tests validate both PP3001 rejection and HOLO\x04\0 structural preflight
    fireEvent.click(screen.getByRole('button', { name: /Test `PP3001` JSON Rejection/i }));
    await waitFor(() => {
      expect(screen.getByTestId('holo-inspection-result').textContent).toContain('REJECTED_JSON_AS_HOLO_PP3001');
    });

    fireEvent.click(screen.getByRole('button', { name: /Run Structural Preflight \(Synthetic/i }));
    await waitFor(() => {
      expect(screen.getByTestId('holo-inspection-result').textContent).toContain('STRUCTURAL PREFLIGHT PASS');
      expect(screen.getByTestId('holo-inspection-result').textContent).toContain('SYNTHETIC FIXTURE');
      expect(screen.getByTestId('holo-trust-layers').textContent).toContain('NOT_RUN_IN_BROWSER');
      expect(screen.getByTestId('holo-manifest-summary').textContent).toContain('prismpm/holo-v4-manifest/1');
    });

    fireEvent.click(screen.getByRole('button', { name: /Test Corrupt Manifest Rejection/i }));
    await waitFor(() => {
      expect(screen.getByTestId('holo-inspection-result').textContent).toContain('INVALID_MANIFEST');
    });
  });

  it('supports all 3 Prism input modes (NATIVE_PRISM, GUIDED_PRODUCT, EXISTING_RUST) with distinct gates', async () => {
    // Guided Product requires human spec review
    const guided = await foundryService.createSyntheticProjectIntake({
      projectName: 'Guided Inventory App',
      inputMode: 'GUIDED_PRODUCT',
      productFamily: 'application',
      componentId: 'prismpm-calculator',
      workflowId: 'wf-prismpm-delivery',
      purpose: 'Generate a closed Prism product for inventory reconciliation across 7 facets.',
      declaredInputs: 'devrel/subjects.json, app/src/Catalog.lex.tex, prismpm.lock, lexlean.lock, standards.lock',
      environmentDeclaration: 'Sanitized Guided Product draft',
      sourceRevision: 'prism-devrel/main@8af99e96',
      acknowledgeBoundary: true,
      guidedPrompt: 'Build deterministic subject inventory with full facet coverage.',
    });
    expect(guided.project.inputMode).toBe('GUIDED_PRODUCT');
    expect(guided.project.guidedProductDraft?.humanReviewStatus).toBe('PENDING_HUMAN_REVIEW');
    expect(guided.project.guidedProductDraft?.facetCoverage).toHaveLength(7);

    // Existing Rust records typed refusal & keeps Cargo separate from Prism verify
    const rust = await foundryService.createSyntheticProjectIntake({
      projectName: 'Rust Crate Projection',
      inputMode: 'EXISTING_RUST',
      productFamily: 'formal-verification',
      componentId: 'uorust-translator',
      workflowId: 'wf-uorust-modeling',
      purpose: 'Project pinned Cargo workspace routes without executing Cargo in browser.',
      declaredInputs: 'Cargo.toml, Cargo.lock, model/routes.toml, prismpm.lock, lexlean.lock',
      environmentDeclaration: 'Mac Studio Windmill UORust runner',
      sourceRevision: 'UORust/main@5868afe3',
      acknowledgeBoundary: true,
    });
    expect(rust.project.inputMode).toBe('EXISTING_RUST');
    expect(rust.project.uorustRefusals?.[0].code).toBe('BROWSER_CARGO_FORBIDDEN');
    expect(rust.project.releaseBlockedReasons.some((r) => r.includes('Cargo compilation'))).toBe(true);
  });

  it('enforces fixed Windmill command registry & rejects arbitrary shell strings or path traversal', async () => {
    expect(FIXED_WINDMILL_COMMAND_REGISTRY.length).toBe(16);

    // Valid fixed command succeeds registry check with verified `prismpm --project <path> build --locked` syntax
    const valid = validateFixedRegistryCommand({
      commandId: 'prismpm_build_locked',
      sourceRevision: 'prismpm/main@6c876017',
      projectRelativePath: 'examples/Calculator',
    });
    expect(valid.allowed).toBe(true);
    expect(valid.validatedArgv).toEqual(['prismpm', '--project', 'examples/Calculator', 'build', '--locked']);

    const localService = new FailClosedLocalWindmillService('WINDMILL_NATIVE_WMILL_TS');
    const dispatchRes = await localService.submitAuthorizedWorkflow({
      requestId: 'req-calc-build-1',
      idempotencyKey: 'idem-calc-build-1',
      projectId: 'proj-prism-calc',
      workflowId: 'wf-prismpm-delivery',
      flowPath: 'f/uor_foundry/prismpm_build_locked',
      flowVersion: '6c876017',
      sourceRevision: 'prismpm/main@6c876017',
      operatorApproved: true,
      requestedAt: '2026-11-15T08:00:00Z',
      commandId: 'prismpm_build_locked',
      projectRelativePath: 'examples/Calculator',
    });
    expect(dispatchRes.ok).toBe(false);
    if (!dispatchRes.ok) {
      expect(dispatchRes.diagnostic.code).toBe('AUTH_NOT_VALIDATED');
    }

    // Negative: raw shell string rejected immediately by fixed command registry
    const shellInjectCheck = validateFixedRegistryCommand({
      commandId: 'prismpm_check',
      sourceRevision: 'prismpm/main@6c876017',
      projectRelativePath: 'examples/Calculator',
      rawCommandString: 'prismpm check; rm -rf /',
    });
    expect(shellInjectCheck.allowed).toBe(false);
    expect(shellInjectCheck.code).toBe('COMMAND_REGISTRY_REFUSAL');

    const shellInjectDispatch = await localService.submitAuthorizedWorkflow({
      requestId: 'req-bad-1',
      idempotencyKey: 'idem-bad-1',
      projectId: 'proj-prism-calc',
      workflowId: 'wf-prismpm-delivery',
      flowPath: 'f/uor_foundry/prismpm_check',
      flowVersion: '6c876017',
      sourceRevision: 'prismpm/main@6c876017',
      operatorApproved: true,
      requestedAt: '2026-11-15T08:01:00Z',
      commandId: 'prismpm_check',
      projectRelativePath: 'examples/Calculator',
      rawCommandString: 'prismpm check; rm -rf /',
    });
    expect(shellInjectDispatch.ok).toBe(false);
    if (!shellInjectDispatch.ok) {
      expect(shellInjectDispatch.diagnostic.code).toBe('SANDBOX_ISOLATED');
      expect(shellInjectDispatch.diagnostic.message).toContain('Refused arbitrary');
    }

    // Negative: path traversal rejected
    const traversal = validateFixedRegistryCommand({
      commandId: 'prismpm_verify',
      sourceRevision: 'prismpm/main@6c876017',
      projectRelativePath: '../../etc',
    });
    expect(traversal.allowed).toBe(false);
  });

  it('invalidates prior PASS evidence & release approvals immediately when source revision changes (INV-003)', () => {
    const calc = { ...INITIAL_PROJECTS.find((p) => p.id === 'proj-prism-calc')! };
    const prevSuites = INITIAL_VERIFICATION_SUITES.filter((s) => s.projectId === calc.id).map((s) => ({
      ...s,
      status: 'PASS' as const,
      authenticationStatus: 'AUTHENTICATED_BY_VERIFIER' as const,
    }));
    const prevApprovals = [
      {
        ...INITIAL_APPROVALS.find((a) => a.projectId === calc.id && a.gate === 'RELEASE_AUTHORIZATION')!,
        disposition: 'APPROVED_FOR_RELEASE' as const,
        authorizedReviewer: 'Release Board',
        decidedAt: '2026-11-15T08:00:00Z',
        sourceRevision: 'prismpm/main@6c876017',
        evidenceRefs: prevSuites.map((s) => s.evidenceId),
      },
    ];

    const invalidated = verificationAuthorityService.invalidateStaleEvidenceOnSourceChange({
      project: calc,
      newSourceRevision: 'prismpm/main@deadbeef',
      verifications: prevSuites,
      approvals: prevApprovals,
    });

    expect(invalidated.updatedVerifications.every((v) => v.status === 'NOT VERIFIED')).toBe(true);
    expect(invalidated.updatedVerifications.every((v) => v.authenticationStatus === 'STALE')).toBe(true);
    expect(invalidated.updatedApprovals[0].disposition).toBe('BLOCKED');

    const evalAfterEdit = verificationAuthorityService.evaluateProjectAuthority({
      project: { ...calc, sourceRevision: 'prismpm/main@deadbeef' },
      verifications: invalidated.updatedVerifications,
      artifacts: INITIAL_ARTIFACTS,
      approvals: invalidated.updatedApprovals,
    });
    expect(evalAfterEdit.releaseEligible).toBe(false);
  });

  it('validates offline lockfile closure across NATIVE_PRISM and EXISTING_RUST modes', () => {
    const passNative = evaluateProjectOfflineClosure('NATIVE_PRISM', [
      'prismpm.lock',
      'lexlean.lock',
      'standards.lock',
    ]);
    expect(passNative.readyForOfflineRun).toBe(true);

    const missingLock = validateOfflineDependencyClosure({
      inputMode: 'EXISTING_RUST',
      declaredLockfiles: [
        { filename: 'Cargo.lock', present: false },
        { filename: 'prismpm.lock', present: true, pinValue: 'prismpm/sdk-lock/2' },
        { filename: 'lexlean.lock', present: true, pinValue: 'lexlean/lock/2' },
      ],
    });
    expect(missingLock.readyForOfflineRun).toBe(false);
    expect(missingLock.blockingReasons[0]).toContain('Cargo.lock');
  });

  it('parses Hologram v4 binary header & manifest contents and validates build verification stage integrity', async () => {
    const calc = INITIAL_PROJECTS.find((p) => p.id === 'proj-prism-calc')!;
    const calcArtifact = INITIAL_ARTIFACTS.find((a) => a.projectId === calc.id)!;

    // 1. Valid structured Hologram v4 binary container
    const validBytes = artifactsService.buildHologramV4ArchiveFixture({
      projectId: calc.id,
      projectName: calc.name,
      sourceRevision: calc.sourceRevision,
    });
    const expectedSha = await computeSha256Hex(validBytes);
    const parsed = await artifactsService.parseHologramV4Header(validBytes, {
      expectedSha256: expectedSha,
      expectedProjectId: calc.id,
      expectedSourceRevision: calc.sourceRevision,
      requireManifest: true,
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.structuralIntegrityValid).toBe(true);
    expect(parsed.manifestValid).toBe(true);
    expect(parsed.header?.majorVersion).toBe(4);
    expect(parsed.header?.minorVersion).toBe(0);
    expect(parsed.header?.sectionCount).toBe(3);
    expect(parsed.header?.footerNonZero).toBe(true);
    expect(parsed.manifest?.schema).toBe('prismpm/holo-v4-manifest/1');
    expect(parsed.manifest?.entrypoint).toBe('holo_run');
    expect(parsed.manifest?.sections).toEqual(['model.prism.json', 'core-wasm', 'holoview']);

    // Build preflight check passes when synthetic fixture matches digest + revision + manifest
    // Browser preflight must yield PREFLIGHT_CHECKED + STRUCTURAL PREFLIGHT PASS (never VERIFIED)
    const stagePass = await foundryService.verifyBuildHoloArtifact({
      project: calc,
      artifact: {
        ...calcArtifact,
        sha256Digest: expectedSha,
        digestMode: 'DOCUMENTED_REFERENCE_DIGEST',
      },
      archiveBytes: validBytes,
    });
    expect(stagePass.passed).toBe(true);
    expect(stagePass.validationStatus).toBe('STRUCTURAL PREFLIGHT PASS');
    expect(stagePass.updatedArtifactFields?.artifactState).toBe('PREFLIGHT_CHECKED');
    expect(stagePass.updatedArtifactFields?.sha256Verified).toBe(true);

    // 2. Corrupt embedded manifest JSON fails manifest validation cleanly
    const corruptManifestBytes = artifactsService.buildHologramV4ArchiveFixture({
      projectId: calc.id,
      projectName: calc.name,
      sourceRevision: calc.sourceRevision,
      corruptManifest: true,
    });
    const corruptRes = await foundryService.verifyBuildHoloArtifact({
      project: calc,
      artifact: calcArtifact,
      archiveBytes: corruptManifestBytes,
    });
    expect(corruptRes.passed).toBe(false);
    expect(corruptRes.headerParseResult?.errorCode).toBe('INVALID_MANIFEST');
    expect(corruptRes.headerParseResult?.manifestValid).toBe(false);

    // 3. Zeroed 32-byte trailer seal fails structural integrity
    const zeroTrailerBytes = validBytes.slice();
    zeroTrailerBytes.fill(0, zeroTrailerBytes.length - 32);
    const zeroTrailerParse = await artifactsService.parseHologramV4Header(zeroTrailerBytes);
    expect(zeroTrailerParse.valid).toBe(false);
    expect(zeroTrailerParse.structuralIntegrityValid).toBe(false);
    expect(zeroTrailerParse.errorCode).toBe('PP3001');

    // 4. Source revision mismatch inside manifest blocks build verification
    const wrongRevBytes = artifactsService.buildHologramV4ArchiveFixture({
      projectId: calc.id,
      projectName: calc.name,
      sourceRevision: 'prismpm/main@deadbeef',
    });
    const wrongRevStage = await artifactsService.verifyBuildStageHoloArchive({
      project: calc,
      artifact: calcArtifact,
      archiveBytes: wrongRevBytes,
    });
    expect(wrongRevStage.passed).toBe(false);
    expect(wrongRevStage.blockingReasons.some((r) => r.includes('sourceRevision mismatch'))).toBe(true);

    // 5. Valid header & manifest but mismatched SHA-256 digest fails with PP5401
    const digestMismatchStage = await artifactsService.verifyBuildStageHoloArchive({
      project: calc,
      artifact: {
        ...calcArtifact,
        sha256Digest: '0'.repeat(64),
        digestMode: 'DOCUMENTED_REFERENCE_DIGEST',
      },
      archiveBytes: validBytes,
    });
    expect(digestMismatchStage.passed).toBe(false);
    expect(digestMismatchStage.headerParseResult?.errorCode).toBe('PP5401');

    // 6. Absent on-disk bytes fail closed in browser sandbox
    const noDiskStage = await artifactsService.verifyBuildStageHoloArchive({
      project: calc,
      artifact: calcArtifact,
    });
    expect(noDiskStage.passed).toBe(false);
    expect(noDiskStage.validationStatus).toBe('UNINSPECTED');
  });

  it('implements src/services/hologramService parseHologramV4Header(ArrayBuffer) & triggers automatic preflight scan in ArtifactsView on .holo selection', async () => {
    const calc = INITIAL_PROJECTS.find((p) => p.id === 'proj-prism-calc')!;
    const calcArts = INITIAL_ARTIFACTS.filter((a) => a.projectId === calc.id);
    const holoArt = calcArts.find((a) => a.outputClass === 'physical_holo_archive')!;
    const orderedArts = [holoArt, ...calcArts.filter((a) => a.id !== holoArt.id)];

    const arrayBuf = buildHologramV4Buffer({
      projectId: calc.id,
      projectName: calc.name,
      sourceRevision: calc.sourceRevision,
      isSyntheticFixture: true,
    });
    expect(arrayBuf).toBeInstanceOf(ArrayBuffer);

    const parsed = await parseHologramV4HeaderFromRootService(arrayBuf, {
      expectedProjectId: calc.id,
      expectedSourceRevision: calc.sourceRevision,
      isSyntheticFixture: true,
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.status).toBe('STRUCTURAL PREFLIGHT PASS');
    expect(parsed.isSyntheticFixture).toBe(true);
    expect(parsed.trustLayers.independentHologramVerification).toBe('NOT_RUN_IN_BROWSER');
    expect(parsed.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.metadata.magic).toBe('HOLO\\x04\\0');
    expect(parsed.metadata.formatVersion).toBe('v4.0');
    expect(parsed.metadata.sectionCount).toBe(3);
    expect(parsed.metadata.projectId).toBe(calc.id);
    expect(parsed.metadata.sourceRevision).toBe(calc.sourceRevision);
    expect(parsed.metadata.entrypoint).toBe('holo_run');

    // Automatic validation scan triggers when a .holo artifact with ArrayBuffer is selected
    render(
      <ArtifactsView
        projects={[calc]}
        artifacts={orderedArts}
        selectedProjectId={calc.id}
        artifactBuffers={{ [holoArt.id]: arrayBuf }}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('holo-auto-scan-status').textContent).toContain('Structural Preflight');
      expect(screen.getByTestId('holo-auto-scan-status').textContent).toContain('STRUCTURAL PREFLIGHT PASS');
      expect(screen.getByTestId('holo-inspection-result').textContent).toContain(parsed.sha256Hash);
      expect(screen.getByTestId('holo-manifest-summary').textContent).toContain('prismpm/holo-v4-manifest/1');
    });

    // Selecting a local JSON-as-.holo file triggers automatic PP3001 rejection scan
    const fileInput = screen.getByTestId('holo-file-input') as HTMLInputElement;
    const rogueHoloFile = {
      name: 'rogue.holo',
      arrayBuffer: async () => new TextEncoder().encode('{"fake":"json-holo"}').buffer,
    } as unknown as File;
    fireEvent.change(fileInput, { target: { files: [rogueHoloFile] } });
    await waitFor(() => {
      const resultText = screen.getByTestId('holo-inspection-result').textContent ?? '';
      expect(resultText).toContain('REJECTED_JSON_AS_HOLO_PP3001');
      expect(resultText).not.toContain(parsed.sha256Hash);
    });
  });

  it('inspects sequential uploads independently of seeded fixture state across valid/invalid transitions and async races', async () => {
    const calc = INITIAL_PROJECTS.find((p) => p.id === 'proj-prism-calc')!;
    const calcArts = INITIAL_ARTIFACTS.filter((a) => a.projectId === calc.id);
    const holoArt = {
      ...calcArts.find((a) => a.outputClass === 'physical_holo_archive')!,
      isSyntheticFixture: true,
    };
    const orderedArts = [holoArt, ...calcArts.filter((a) => a.id !== holoArt.id)];

    const seededFixtureBuf = buildHologramV4Buffer({
      projectId: calc.id,
      projectName: calc.name,
      sourceRevision: calc.sourceRevision,
      isSyntheticFixture: true,
    });
    const seededSha = await computeSha256Hex(new Uint8Array(seededFixtureBuf));

    // Independent valid .holo upload belonging to a completely different project/revision & non-synthetic origin
    const independentValidBuf = buildHologramV4Buffer({
      projectId: 'proj-external-local',
      projectName: 'External Local App',
      sourceRevision: 'local/main@deadcafe',
      isSyntheticFixture: false,
    });
    const independentValidSha = await computeSha256Hex(new Uint8Array(independentValidBuf));

    const corruptManifestBuf = buildHologramV4Buffer({
      projectId: 'proj-external-local',
      projectName: 'External Local App',
      sourceRevision: 'local/main@deadcafe',
      corruptManifest: true,
      isSyntheticFixture: false,
    });

    const secondValidBuf = buildHologramV4Buffer({
      projectId: 'proj-second-local',
      projectName: 'Recovered Local App',
      sourceRevision: 'local/main@cafebabe',
      isSyntheticFixture: false,
    });
    const secondValidSha = await computeSha256Hex(new Uint8Array(secondValidBuf));

    render(
      <ArtifactsView
        projects={[calc]}
        artifacts={orderedArts}
        selectedProjectId={calc.id}
        artifactBuffers={{ [holoArt.id]: seededFixtureBuf }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('holo-inspection-result').textContent).toContain(seededSha);
      expect(screen.getByTestId('holo-inspection-result').textContent).toContain('SYNTHETIC FIXTURE');
    });

    const fileInput = screen.getByTestId('holo-file-input') as HTMLInputElement;

    // 1. Valid seeded fixture -> invalid JSON rogue.holo (PP3001)
    fireEvent.change(fileInput, {
      target: {
        files: [
          {
            name: 'rogue.holo',
            arrayBuffer: async () => new TextEncoder().encode('{"fake":"json-masquerade"}').buffer,
          } as unknown as File,
        ],
      },
    });
    await waitFor(() => {
      const text = screen.getByTestId('holo-inspection-result').textContent ?? '';
      expect(text).toContain('REJECTED_JSON_AS_HOLO_PP3001');
      expect(text).not.toContain(seededSha);
    });

    // 2. Invalid -> Valid sequential upload (must NOT inherit seeded projectId/sourceRevision/isSyntheticFixture)
    fireEvent.change(fileInput, {
      target: {
        files: [
          {
            name: 'external-app.holo',
            arrayBuffer: async () => independentValidBuf,
          } as unknown as File,
        ],
      },
    });
    await waitFor(() => {
      const text = screen.getByTestId('holo-inspection-result').textContent ?? '';
      expect(text).toContain('STRUCTURAL PREFLIGHT PASS');
      expect(text).toContain(independentValidSha);
      expect(text).toContain('proj-external-local');
      expect(text).not.toContain('SYNTHETIC FIXTURE');
      expect(screen.getByTestId('holo-auto-scan-status').textContent).toContain('external-app.holo');
    });

    // 3. Valid -> Invalid (corrupt manifest)
    fireEvent.change(fileInput, {
      target: {
        files: [
          {
            name: 'corrupt.holo',
            arrayBuffer: async () => corruptManifestBuf,
          } as unknown as File,
        ],
      },
    });
    await waitFor(() => {
      const text = screen.getByTestId('holo-inspection-result').textContent ?? '';
      expect(text).toContain('INVALID_MANIFEST');
      expect(text).not.toContain(independentValidSha);
    });

    // 4. Async race protection: slow stale invalid upload must NEVER overwrite newer valid upload
    let resolveSlowRead!: (buf: ArrayBuffer) => void;
    const slowReadPromise = new Promise<ArrayBuffer>((resolve) => {
      resolveSlowRead = resolve;
    });

    fireEvent.change(fileInput, {
      target: {
        files: [
          {
            name: 'slow-rogue.holo',
            arrayBuffer: () => slowReadPromise,
          } as unknown as File,
        ],
      },
    });

    // Prior stale result must be cleared immediately while slow upload is pending
    expect(screen.queryByTestId('holo-inspection-result')).toBeNull();

    // Faster newer valid upload arrives before slow-rogue finishes reading
    fireEvent.change(fileInput, {
      target: {
        files: [
          {
            name: 'fast-valid.holo',
            arrayBuffer: async () => secondValidBuf,
          } as unknown as File,
        ],
      },
    });

    await waitFor(() => {
      const text = screen.getByTestId('holo-inspection-result').textContent ?? '';
      expect(text).toContain('STRUCTURAL PREFLIGHT PASS');
      expect(text).toContain(secondValidSha);
      expect(text).toContain('proj-second-local');
    });

    // Resolve the older slow upload now and flush promises
    resolveSlowRead(new TextEncoder().encode('{"stale":"rogue"}').buffer);
    await Promise.resolve();
    await Promise.resolve();

    // Newer valid upload remains displayed cleanly
    await waitFor(() => {
      const text = screen.getByTestId('holo-inspection-result').textContent ?? '';
      expect(text).toContain('STRUCTURAL PREFLIGHT PASS');
      expect(text).toContain(secondValidSha);
      expect(text).not.toContain('REJECTED_JSON_AS_HOLO_PP3001');
    });
  });

  it('clears stale inspection output and protects against races during rapid artifact selection changes', async () => {
    const calc = INITIAL_PROJECTS.find((p) => p.id === 'proj-prism-calc')!;
    const calcArts = INITIAL_ARTIFACTS.filter((a) => a.projectId === calc.id);
    const holoArt1 = calcArts.find((a) => a.outputClass === 'physical_holo_archive')!;
    const nonHoloArt = calcArts.find((a) => a.outputClass === 'model_prism_json')!;
    const holoArt2 = {
      ...holoArt1,
      id: 'art-prism-calc-holo-alt',
      artifactName: 'calculator-alt.holo',
      isSyntheticFixture: false,
    };
    const holoArtUnbuffered = {
      ...holoArt1,
      id: 'art-prism-calc-holo-unbuffered',
      artifactName: 'calculator-missing-bytes.holo',
    };

    const buf1 = buildHologramV4Buffer({
      projectId: calc.id,
      projectName: calc.name,
      sourceRevision: calc.sourceRevision,
      entrypoint: 'holo_run_v1',
      isSyntheticFixture: true,
    });
    const sha1 = await computeSha256Hex(new Uint8Array(buf1));

    const buf2 = buildHologramV4Buffer({
      projectId: calc.id,
      projectName: calc.name,
      sourceRevision: calc.sourceRevision,
      entrypoint: 'holo_run_v2_alt',
      isSyntheticFixture: false,
    });
    const sha2 = await computeSha256Hex(new Uint8Array(buf2));

    render(
      <ArtifactsView
        projects={[calc]}
        artifacts={[holoArt1, nonHoloArt, holoArt2, holoArtUnbuffered]}
        selectedProjectId={calc.id}
        artifactBuffers={{
          [holoArt1.id]: buf1,
          [holoArt2.id]: buf2,
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('holo-inspection-result').textContent).toContain(sha1);
    });

    // Upload a rogue file while holoArt1 is selected
    const fileInput = screen.getByTestId('holo-file-input') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [
          {
            name: 'rogue.holo',
            arrayBuffer: async () => new TextEncoder().encode('{"fake":"json"}').buffer,
          } as unknown as File,
        ],
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('holo-inspection-result').textContent).toContain('REJECTED_JSON_AS_HOLO_PP3001');
    });

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Selecting a non-.holo artifact clears stale inspection output immediately
    fireEvent.click(screen.getByRole('button', { name: new RegExp(escapeRegex(nonHoloArt.artifactName)) }));
    await waitFor(() => {
      expect(screen.queryByTestId('holo-inspection-result')).toBeNull();
      expect(screen.queryByTestId('holo-auto-scan-status')).toBeNull();
    });

    // Rapid selection changes across buffered .holo -> unbuffered .holo -> buffered .holo #2
    fireEvent.click(screen.getByRole('button', { name: new RegExp(escapeRegex(holoArt1.artifactName)) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(escapeRegex(holoArtUnbuffered.artifactName)) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(escapeRegex(holoArt2.artifactName)) }));

    await waitFor(() => {
      const resultText = screen.getByTestId('holo-inspection-result').textContent ?? '';
      expect(resultText).toContain('STRUCTURAL PREFLIGHT PASS');
      expect(resultText).toContain(sha2);
      expect(resultText).toContain('holo_run_v2_alt');
      expect(resultText).not.toContain(sha1);
      expect(resultText).not.toContain('REJECTED_JSON_AS_HOLO_PP3001');
    });

    // Switching to unbuffered .holo artifact clears prior result instead of keeping stale inspection
    fireEvent.click(screen.getByRole('button', { name: new RegExp(escapeRegex(holoArtUnbuffered.artifactName)) }));
    await waitFor(() => {
      expect(screen.queryByTestId('holo-inspection-result')).toBeNull();
      expect(screen.getByTestId('holo-auto-scan-status').textContent).toContain('awaiting local .holo file selection');
    });
  });
});
