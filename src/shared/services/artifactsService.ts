import {
  ArtifactProvenanceRecord,
  HoloArchiveValidationStatus,
  ProjectRecord,
} from '../types/foundry';
import {
  buildHologramV4Buffer,
  HOLO_V4_FOOTER_BYTE_LENGTH,
  HOLO_V4_MANIFEST_TAG,
  HOLO_V4_STRUCTURED_HEADER_SIZE,
  HologramV4ArtifactMetadata,
  HologramV4ParsedArtifact,
  HologramV4ParseOptions,
  HoloV4HeaderMetadata,
  HoloV4ManifestContent,
  HoloV4SectionEntry,
  parseHologramV4Header as parseHologramV4Buffer,
} from './hologramService';

export {
  HOLO_V4_FOOTER_BYTE_LENGTH,
  HOLO_V4_MANIFEST_TAG,
  HOLO_V4_STRUCTURED_HEADER_SIZE,
};

export type {
  HologramV4ArtifactMetadata,
  HologramV4ParsedArtifact,
  HologramV4ParseOptions,
  HoloV4HeaderMetadata,
  HoloV4ManifestContent,
  HoloV4SectionEntry,
};

export type HoloV4ParseOptions = HologramV4ParseOptions;
export type HoloV4HeaderParseResult = HologramV4ParsedArtifact;

export interface BuildVerificationHoloStageResult {
  stage: 'BUILD_VERIFICATION';
  passed: boolean;
  artifactId: string;
  validationStatus: HoloArchiveValidationStatus;
  headerParseResult?: HoloV4HeaderParseResult;
  updatedArtifactFields?: Partial<ArtifactProvenanceRecord>;
  blockingReasons: string[];
  verifiedAt: string;
  diagnostic: string;
}

/**
 * Artifacts Service
 *
 * Delegates Hologram v4 binary header & manifest parsing to `hologramService`,
 * enforces build-verification `.holo` stage rules, and provides binary test fixtures.
 */
export class ArtifactsService {
  /**
   * Parses the Hologram v4 binary header, section table boundaries, 32-byte trailer seal,
   * embedded Core-Wasm / HOLOVIEW binary markers, and structured JSON manifest contents.
   */
  async parseHologramV4Header(
    input: ArrayBuffer | Uint8Array,
    options: HoloV4ParseOptions = {}
  ): Promise<HoloV4HeaderParseResult> {
    const buffer =
      input instanceof ArrayBuffer
        ? input
        : (input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer);
    return parseHologramV4Buffer(buffer, options);
  }

  /**
   * Validates the structural integrity and manifest contents of a generated `.holo` archive
   * during the build verification stage (`BUILD` -> `VERIFY` / `INSPECT`).
   */
  async verifyBuildStageHoloArchive(params: {
    artifact: ArtifactProvenanceRecord;
    project: ProjectRecord;
    archiveBytes?: ArrayBuffer | Uint8Array;
  }): Promise<BuildVerificationHoloStageResult> {
    const verifiedAt = new Date().toISOString();

    if (
      !params.archiveBytes ||
      (params.archiveBytes instanceof ArrayBuffer
        ? params.archiveBytes.byteLength === 0
        : params.archiveBytes.length === 0)
    ) {
      const blockingReasons = [
        `Build verification cannot certify "${params.artifact.artifactName}": no physical HOLO\\x04\\0 binary bytes are present on disk in browser sandbox.`,
      ];
      return {
        stage: 'BUILD_VERIFICATION',
        passed: false,
        artifactId: params.artifact.id,
        validationStatus: params.artifact.archiveValidationStatus ?? 'UNINSPECTED',
        blockingReasons,
        verifiedAt,
        diagnostic: blockingReasons[0],
      };
    }

    const expectedSha =
      params.artifact.digestMode === 'DOCUMENTED_REFERENCE_DIGEST' &&
      /^[0-9a-f]{64}$/i.test(params.artifact.sha256Digest)
        ? params.artifact.sha256Digest
        : undefined;

    const parseResult = await this.parseHologramV4Header(params.archiveBytes, {
      expectedSha256: expectedSha,
      expectedProjectId: params.project.id,
      expectedSourceRevision: params.project.sourceRevision,
      requireManifest: true,
      isSyntheticFixture: params.artifact.isSyntheticFixture,
    });

    const blockingReasons = [...parseResult.errors];
    const passed =
      parseResult.valid && parseResult.structuralIntegrityValid && parseResult.manifestValid;

    return {
      stage: 'BUILD_VERIFICATION',
      passed,
      artifactId: params.artifact.id,
      validationStatus: parseResult.status,
      headerParseResult: parseResult,
      updatedArtifactFields: {
        archiveValidationStatus: parseResult.status,
        artifactState: passed ? 'PREFLIGHT_CHECKED' : 'FAILED',
        byteLength: parseResult.byteLength,
        sha256Verified:
          passed && expectedSha !== undefined
            ? Boolean(parseResult.sha256MatchedExpected)
            : false,
        coreWasmContract: parseResult.manifest?.coreWasmContract ?? params.artifact.coreWasmContract,
        viewProfile: parseResult.manifest?.viewProfile ?? params.artifact.viewProfile,
        blockingReasons: passed
          ? params.artifact.blockingReasons
          : [
              ...blockingReasons,
              ...params.artifact.blockingReasons.filter((r) => !blockingReasons.includes(r)),
            ],
      },
      blockingReasons,
      verifiedAt,
      diagnostic: parseResult.diagnostic,
    };
  }

  /**
   * Constructs a deterministic, spec-compliant binary Hologram v4 archive containing
   * `HOLO\x04\0`, `"MFST"` directory header, embedded JSON manifest, `HOLOVIEW\0\x01`,
   * `\0asm` Core-Wasm header, and a non-zero 32-byte trailer seal.
   */
  buildHologramV4ArchiveFixture(params: {
    projectId: string;
    projectName: string;
    sourceRevision: string;
    entrypoint?: string;
    coreWasmContract?: string;
    viewProfile?: string;
    sections?: string[];
    includeWasm?: boolean;
    includeHoloview?: boolean;
    corruptManifest?: boolean;
    omitFooter?: boolean;
  }): Uint8Array {
    return new Uint8Array(buildHologramV4Buffer(params));
  }
}

export const artifactsService = new ArtifactsService();
