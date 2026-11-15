import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCanonicalPrismFlowManifest,
  CANONICAL_COMMAND_BY_ID,
  CANONICAL_WORKFLOW_STAGES,
  FIXED_WINDMILL_COMMAND_REGISTRY,
  validateFixedRegistryCommand,
} from '../shared/adapters/windmillCommandRegistry';
import { REVIEWED_SOURCES_REGISTER } from '../shared/data/sourceComplianceRegister';
import {
  HISTORICAL_INVALID_PINS,
  PINNED_REPOSITORY_MANIFEST,
  validateLocalSourceManifestConsistency,
} from '../shared/data/toolchainPinManifest';
import {
  INITIAL_APPROVALS,
  INITIAL_ARTIFACTS,
  INITIAL_PROJECTS,
  INITIAL_VERIFICATION_SUITES,
} from '../shared/data/seedFoundryData';
import {
  canDownloadVerifiedArtifact,
  computeSha256Hex,
  getDirectDownloadBlockReason,
  inspectHoloArchiveBytes,
} from '../shared/services/holoArchiveValidator';
import {
  buildHologramV4Buffer,
  parseHologramV4Header,
} from '../shared/services/hologramService';
import { sourceComplianceService } from '../shared/services/sourceComplianceService';
import { VerificationSuiteRecord } from '../shared/types/foundry';

describe('CI Manifest Consistency, Windmill Registry Convergence, .holo Negative Suite & Independent Source Compliance', () => {
  it('validates local manifest consistency across pin manifest, compliance register, flow JSON, seed data, and docs without claiming live GitHub verification', () => {
    const repoRoot = process.cwd();
    const flowJsonPath = path.join(repoRoot, 'uor_foundry.raw_app/flows/prism_hologram_delivery.flow.json');
    const flowJson = JSON.parse(fs.readFileSync(flowJsonPath, 'utf8'));

    const externalTextArtifacts = [
      {
        label: 'uor_foundry.raw_app/flows/prism_hologram_delivery.flow.json',
        text: fs.readFileSync(flowJsonPath, 'utf8'),
      },
      {
        label: 'docs/MAC_STUDIO_QUALIFICATION.md',
        text: fs.readFileSync(path.join(repoRoot, 'docs/MAC_STUDIO_QUALIFICATION.md'), 'utf8'),
      },
      {
        label: 'docs/INTEGRATION_BOUNDARIES.md',
        text: fs.readFileSync(path.join(repoRoot, 'docs/INTEGRATION_BOUNDARIES.md'), 'utf8'),
      },
      {
        label: 'README.md',
        text: fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8'),
      },
      {
        label: 'src/shared/data/seedFoundryData.ts',
        text: fs.readFileSync(path.join(repoRoot, 'src/shared/data/seedFoundryData.ts'), 'utf8'),
      },
    ];

    const report = validateLocalSourceManifestConsistency({
      complianceRegister: REVIEWED_SOURCES_REGISTER,
      flowToolchainPins: flowJson.toolchainPins,
      externalTextArtifacts,
    });

    expect(report.errors).toEqual([]);
    expect(report.localManifestConsistent).toBe(true);
    expect(report.checkedSources).toBe(PINNED_REPOSITORY_MANIFEST.length);
    // Explicitly separates offline local consistency from live GitHub existence verification
    expect(report.remoteCommitResolution.checked).toBe(false);
    expect(report.remoteCommitResolution.mode).toBe('OFFLINE_LOCAL_ONLY');

    // Ensure no stale invalid commit SHAs survive in docs/seed/flow files
    for (const staleSha of HISTORICAL_INVALID_PINS) {
      for (const art of externalTextArtifacts) {
        expect(art.text).not.toContain(staleSha);
      }
    }
  });

  it('guarantees every workflow stage resolves 1-to-1 to a canonical Windmill registry command and rejects injected commands/traversal', async () => {
    const repoRoot = process.cwd();
    const flowJsonPath = path.join(repoRoot, 'uor_foundry.raw_app/flows/prism_hologram_delivery.flow.json');
    const flowJson = JSON.parse(fs.readFileSync(flowJsonPath, 'utf8'));
    const generatedRegistry = await import(
      '../../uor_foundry.raw_app/backend/generated_command_registry'
    );
    const { main: dispatchStage } = await import(
      '../../uor_foundry.raw_app/backend/prism_stage_dispatch'
    );

    const expectedManifest = buildCanonicalPrismFlowManifest();
    expect(flowJson.stages).toEqual(expectedManifest.stages);
    expect(flowJson.stages.length).toBe(CANONICAL_WORKFLOW_STAGES.length);

    for (const stage of flowJson.stages as Array<{
      stageId: string;
      fixedCommandId: keyof typeof CANONICAL_COMMAND_BY_ID;
      runnable: string;
    }>) {
      const matches = FIXED_WINDMILL_COMMAND_REGISTRY.filter(
        (c) => c.commandId === stage.fixedCommandId
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].stageId).toBe(stage.stageId);
      expect(matches[0].windmillRunnable).toBe(stage.runnable);
      expect(generatedRegistry.FIXED_STAGE_COMMANDS[stage.fixedCommandId]).toBeTruthy();
      expect(generatedRegistry.FIXED_STAGE_COMMANDS[stage.fixedCommandId].fixedArgs).toEqual([
        ...matches[0].fixedArgs,
      ]);
    }

    // Never allow unsupported CLI syntax
    expect(JSON.stringify(FIXED_WINDMILL_COMMAND_REGISTRY)).not.toContain('hologram pack');

    // Reject shell injection, unknown command, path traversal, and wrong workspace in backend runnable
    const injectRes = await dispatchStage({
      workspace: 'uor-offline-foundry',
      commandId: 'prismpm_check',
      rawCommandString: 'prismpm check && curl evil.example',
      projectRelativePath: 'examples/Calculator',
      sourceRevision: 'prismpm/main@6c876017',
      operatorApproved: true,
      idempotencyKey: 'k-1',
    });
    expect(injectRes.dispatched).toBe(false);
    expect(injectRes.status).toBe('REJECTED_INVALID_COMMAND');

    const traversalRes = await dispatchStage({
      workspace: 'uor-offline-foundry',
      commandId: 'prismpm_verify',
      projectRelativePath: '../secrets',
      sourceRevision: 'prismpm/main@6c876017',
      operatorApproved: true,
      idempotencyKey: 'k-2',
    });
    expect(traversalRes.dispatched).toBe(false);
    expect(traversalRes.status).toBe('REJECTED_INVALID_COMMAND');

    const wrongWs = validateFixedRegistryCommand({
      workspace: 'other-workspace',
      commandId: 'prismpm_check',
      projectRelativePath: 'examples/Calculator',
      sourceRevision: 'prismpm/main@6c876017',
    });
    expect(wrongWs.allowed).toBe(false);
  });

  it('rejects malformed, unsupported version, overlapping section tables, zero trailer, corrupt manifest, JSON-as-.holo, and digest mismatches', async () => {
    // 1. Empty / too short
    const emptyRes = await parseHologramV4Header(new ArrayBuffer(4));
    expect(emptyRes.valid).toBe(false);
    expect(emptyRes.errorCode).toBe('PP3001');

    // 2. JSON masquerading as .holo
    const jsonBuf = new TextEncoder().encode('{"fake":true,"holo":4}').buffer;
    const jsonRes = await parseHologramV4Header(jsonBuf);
    expect(jsonRes.valid).toBe(false);
    expect(jsonRes.status).toBe('REJECTED_JSON_AS_HOLO_PP3001');
    expect(jsonRes.errorCode).toBe('PP3001');

    // 3. Unsupported HOLO version (e.g. HOLO\x03\0)
    const validBuf = buildHologramV4Buffer({
      projectId: 'proj-prism-calc',
      projectName: 'Calculator',
      sourceRevision: 'prismpm/main@6c876017',
      isSyntheticFixture: true,
    });
    const v3Bytes = new Uint8Array(validBuf.slice(0));
    v3Bytes[4] = 0x03; // unsupported major version 3
    const v3Inspect = await inspectHoloArchiveBytes(v3Bytes);
    expect(v3Inspect.valid).toBe(false);
    expect(v3Inspect.status).toBe('UNSUPPORTED_ARCHIVE_VERSION');
    const v3Parsed = await parseHologramV4Header(v3Bytes.buffer);
    expect(v3Parsed.valid).toBe(false);
    expect(v3Parsed.status).toBe('UNSUPPORTED_ARCHIVE_VERSION');

    // 4. Out-of-bounds / overlapping section table (manifestLength overlapping 32-byte footer)
    const overlapBytes = new Uint8Array(validBuf.slice(0));
    // Set uint32 BE manifestByteLength at offset 12..15 to overlap the trailing 32-byte seal
    const hugeLen = overlapBytes.length - 10;
    overlapBytes[12] = (hugeLen >>> 24) & 0xff;
    overlapBytes[13] = (hugeLen >>> 16) & 0xff;
    overlapBytes[14] = (hugeLen >>> 8) & 0xff;
    overlapBytes[15] = hugeLen & 0xff;
    const overlapRes = await parseHologramV4Header(overlapBytes.buffer);
    expect(overlapRes.valid).toBe(false);
    expect(overlapRes.errors.some((e) => e.includes('overlaps 32-byte footer'))).toBe(true);

    // 5. Header section count mismatch
    const countMismatchBytes = new Uint8Array(validBuf.slice(0));
    countMismatchBytes[11] = 9; // manifest only lists 3 sections
    const countRes = await parseHologramV4Header(countMismatchBytes.buffer);
    expect(countRes.valid).toBe(false);
    expect(countRes.errors.some((e) => e.includes('section(s)'))).toBe(true);

    // 6. All-zero 32-byte footer rejected
    const zeroTrailerBytes = new Uint8Array(validBuf.slice(0));
    zeroTrailerBytes.fill(0, zeroTrailerBytes.length - 32);
    const zeroRes = await parseHologramV4Header(zeroTrailerBytes.buffer);
    expect(zeroRes.valid).toBe(false);
    expect(zeroRes.errorCode).toBe('PP3001');

    // 7. Corrupt manifest JSON -> INVALID_MANIFEST
    const corruptBuf = buildHologramV4Buffer({
      projectId: 'proj-prism-calc',
      projectName: 'Calculator',
      sourceRevision: 'prismpm/main@6c876017',
      corruptManifest: true,
      isSyntheticFixture: true,
    });
    const corruptRes = await parseHologramV4Header(corruptBuf);
    expect(corruptRes.valid).toBe(false);
    expect(corruptRes.status).toBe('INVALID_MANIFEST');
    expect(corruptRes.errorCode).toBe('INVALID_MANIFEST');

    // 8. Altered SHA-256 -> PP5401
    const actualSha = await computeSha256Hex(new Uint8Array(validBuf));
    expect(actualSha).toMatch(/^[0-9a-f]{64}$/);
    const mismatchRes = await parseHologramV4Header(validBuf, {
      expectedSha256: 'f'.repeat(64),
      isSyntheticFixture: true,
    });
    expect(mismatchRes.valid).toBe(false);
    expect(mismatchRes.errorCode).toBe('PP5401');

    // 9. Valid synthetic fixture returns STRUCTURAL PREFLIGHT PASS (never verification) and gates download
    const passRes = await parseHologramV4Header(validBuf, {
      expectedSha256: actualSha,
      isSyntheticFixture: true,
    });
    expect(passRes.valid).toBe(true);
    expect(passRes.status).toBe('STRUCTURAL PREFLIGHT PASS');
    expect(passRes.isSyntheticFixture).toBe(true);
    expect(passRes.trustLayers.independentHologramVerification).toBe('NOT_RUN_IN_BROWSER');
    expect(passRes.trustLayers.productionReleaseAuthorization).toBe('BLOCKED');

    expect(
      canDownloadVerifiedArtifact({
        fileExistsOnDisk: true,
        sha256Verified: true,
        artifactState: 'PREFLIGHT_CHECKED',
      })
    ).toBe(false);
    expect(
      getDirectDownloadBlockReason({
        fileExistsOnDisk: true,
        sha256Verified: true,
        artifactState: 'PREFLIGHT_CHECKED',
      })
    ).toContain('PREFLIGHT_CHECKED');
  });

  it('evaluates source compliance per-requirement independently without a global hasVerifiedAll shortcut', () => {
    const calc = INITIAL_PROJECTS.find((p) => p.id === 'proj-prism-calc')!;
    const calcArtifact = INITIAL_ARTIFACTS.find(
      (a) => a.projectId === calc.id && a.outputClass === 'physical_holo_archive'
    )!;
    const calcSuites: VerificationSuiteRecord[] = INITIAL_VERIFICATION_SUITES.filter(
      (v) => v.projectId === calc.id
    ).map((v) => ({
      ...v,
      status: 'PASS',
      isSimulated: false,
      authenticationStatus: 'AUTHENTICATED_BY_VERIFIER',
      epistemicCondition: 'DOCUMENTED',
      artifactHash: calcArtifact.sha256Digest,
      authenticExecutionRef: 'exec-auth-suite-001',
      evidenceProvenance: 'mac-studio-signed-receipt',
      lastCheckedAt: '2026-11-15T08:00:00Z',
    }));

    const verifiedOnDiskArt = {
      ...calcArtifact,
      fileExistsOnDisk: true,
      sha256Verified: true,
      artifactState: 'VERIFIED' as const,
    };

    const assessment = sourceComplianceService.assessProjectCompliance(
      {
        project: calc,
        verifications: calcSuites,
        artifacts: [verifiedOnDiskArt],
        approvals: INITIAL_APPROVALS,
      },
      {
        authenticateVerifierRecord: () => true,
        authenticateHumanApprover: () => false,
      }
    );

    const reqById = Object.fromEntries(assessment.requirements.map((r) => [r.id, r]));

    // Passing build/verify gates + SHA-256 on disk satisfies REQ-PRISMPM-VERIFICATION-GATE and C8/C10
    expect(reqById['REQ-PRISMPM-VERIFICATION-GATE'].satisfied).toBe(true);
    expect(reqById['REQ-STITCH-COMMITMENT-RECOVERY'].satisfied).toBe(true);

    // Passing verify gates NEVER bypasses unresolved upstream claims (DR-11, Stitch C1..C6, Governance)
    expect(reqById['REQ-STITCH-UNRESOLVED-CLAIMS'].satisfied).toBe(false);
    expect(reqById['REQ-STITCH-UNRESOLVED-CLAIMS'].evaluationResult).toBe('REFUTED');
    expect(reqById['REQ-PRISM-DEVREL-FACETS'].satisfied).toBe(false);
    expect(reqById['REQ-PRISM-DEVREL-FACETS'].statusLabel).toBe('GAP');
    expect(reqById['REQ-GOV-SEPARATION-OF-DUTIES'].satisfied).toBe(false);
  });
});
