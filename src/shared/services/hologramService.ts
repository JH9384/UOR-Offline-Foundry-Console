import { HoloArchiveValidationStatus } from '../types/foundry';
import {
  computeSha256Hex,
  HOLO_V4_MAGIC,
  HOLOVIEW_MAGIC,
  WASM_BINARY_MAGIC,
} from './holoArchiveValidator';

/**
 * 4-byte structured manifest header tag placed immediately after `HOLO\x04\0`
 * in Hologram v4 build containers (`0x4d 0x46 0x53 0x54` = "MFST").
 */
export const HOLO_V4_MANIFEST_TAG = new Uint8Array([0x4d, 0x46, 0x53, 0x54]); // "MFST"
export const HOLO_V4_FOOTER_BYTE_LENGTH = 32;
export const HOLO_V4_STRUCTURED_HEADER_SIZE = 16; // 6 magic + 4 "MFST" + 1 flags + 1 sectionCount + 4 uint32 manifestLen

export interface HoloV4HeaderMetadata {
  magic: string;
  magicBytesHex: string;
  majorVersion: number;
  minorVersion: number;
  structuredManifestHeader: boolean;
  flags: number;
  sectionCount: number;
  manifestOffset: number;
  manifestByteLength: number;
  footerByteLength: number;
  footerNonZero: boolean;
  footerHexPreview: string;
}

export interface HoloV4SectionEntry {
  name: string;
  offset: number;
  byteLength: number;
  withinBounds: boolean;
}

export interface HoloV4ManifestContent {
  schema: string;
  projectId: string;
  projectName: string;
  sourceRevision: string;
  entrypoint: string;
  coreWasmContract?: string;
  viewProfile?: string;
  sections: string[];
  createdAt?: string;
}

export interface HologramV4ArtifactMetadata {
  magic: string;
  magicBytesHex: string;
  formatVersion: string;
  majorVersion: number;
  minorVersion: number;
  flags: number;
  sectionCount: number;
  byteLength: number;
  manifestByteLength: number;
  footerNonZero: boolean;
  hasCoreWasmMagic: boolean;
  hasHoloviewMagic: boolean;
  schema?: string;
  projectId?: string;
  projectName?: string;
  sourceRevision?: string;
  entrypoint?: string;
  coreWasmContract?: string;
  viewProfile?: string;
  sections: string[];
  createdAt?: string;
}

export interface HologramV4ParseOptions {
  expectedSha256?: string;
  expectedProjectId?: string;
  expectedSourceRevision?: string;
  requireManifest?: boolean;
}

export interface HologramV4ParsedArtifact {
  valid: boolean;
  structuralIntegrityValid: boolean;
  manifestValid: boolean;
  status: HoloArchiveValidationStatus;
  errorCode?: 'PP3001' | 'PP5401' | 'INVALID_MANIFEST' | 'INVALID_ARCHIVE';
  byteLength: number;
  sha256Hash: string;
  sha256Hex: string;
  sha256MatchedExpected?: boolean;
  metadata: HologramV4ArtifactMetadata;
  header?: HoloV4HeaderMetadata;
  sections: HoloV4SectionEntry[];
  manifest?: HoloV4ManifestContent;
  hasCoreWasmMagic: boolean;
  hasHoloviewMagic: boolean;
  errors: string[];
  diagnostic: string;
}

function bytesMatchAt(bytes: Uint8Array, prefix: Uint8Array, offset = 0): boolean {
  if (offset < 0 || bytes.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[offset + i] !== prefix[i]) return false;
  }
  return true;
}

function findSubsequenceIndex(haystack: Uint8Array, needle: Uint8Array, fromIndex = 0): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1;
  outer: for (let i = Math.max(0, fromIndex); i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function writeUint32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function validateHoloV4ManifestObject(raw: unknown): {
  valid: boolean;
  manifest?: HoloV4ManifestContent;
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Embedded manifest payload must be a plain JSON object.'] };
  }

  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.schema)) {
    errors.push('Manifest missing required non-empty "schema" string.');
  }
  if (!isNonEmptyString(obj.projectId)) {
    errors.push('Manifest missing required non-empty "projectId" string.');
  }
  if (!isNonEmptyString(obj.projectName)) {
    errors.push('Manifest missing required non-empty "projectName" string.');
  }
  if (!isNonEmptyString(obj.sourceRevision)) {
    errors.push('Manifest missing required non-empty "sourceRevision" string.');
  }
  if (!isNonEmptyString(obj.entrypoint)) {
    errors.push('Manifest missing required non-empty "entrypoint" string.');
  }
  if (
    !Array.isArray(obj.sections) ||
    obj.sections.length === 0 ||
    obj.sections.some((s) => !isNonEmptyString(s))
  ) {
    errors.push('Manifest "sections" must be a non-empty array of section identifier strings.');
  }
  if (
    obj.createdAt !== undefined &&
    (!isNonEmptyString(obj.createdAt) || Number.isNaN(Date.parse(obj.createdAt)))
  ) {
    errors.push('Manifest "createdAt" must be a valid ISO-8601 timestamp when present.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    manifest: {
      schema: (obj.schema as string).trim(),
      projectId: (obj.projectId as string).trim(),
      projectName: (obj.projectName as string).trim(),
      sourceRevision: (obj.sourceRevision as string).trim(),
      entrypoint: (obj.entrypoint as string).trim(),
      coreWasmContract: isNonEmptyString(obj.coreWasmContract)
        ? obj.coreWasmContract.trim()
        : undefined,
      viewProfile: isNonEmptyString(obj.viewProfile) ? obj.viewProfile.trim() : undefined,
      sections: (obj.sections as string[]).map((s) => s.trim()),
      createdAt: isNonEmptyString(obj.createdAt) ? obj.createdAt.trim() : undefined,
    },
    errors: [],
  };
}

/**
 * Computes the hex-encoded SHA-256 integrity hash of an ArrayBuffer.
 */
export async function computeArrayBufferSha256(buffer: ArrayBuffer): Promise<string> {
  return computeSha256Hex(new Uint8Array(buffer));
}

/**
 * Parses a Hologram v4 binary `.holo` ArrayBuffer, validates the `HOLO\x04\0` magic bytes,
 * section table bounds, 32-byte non-zero trailer seal, and embedded `"MFST"` JSON manifest,
 * and returns a typed object containing the artifact metadata and SHA-256 integrity hash.
 */
export async function parseHologramV4Header(
  buffer: ArrayBuffer,
  options: HologramV4ParseOptions = {}
): Promise<HologramV4ParsedArtifact> {
  const bytes = new Uint8Array(buffer);
  const sha256Hex = await computeSha256Hex(bytes);
  const sha256MatchedExpected =
    options.expectedSha256 !== undefined
      ? sha256Hex === options.expectedSha256.toLowerCase()
      : undefined;

  const magicBytesHex = Array.from(bytes.slice(0, 6))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

  if (bytes.length === 0) {
    return {
      valid: false,
      structuralIntegrityValid: false,
      manifestValid: false,
      status: 'INVALID_MAGIC_OR_FOOTER',
      errorCode: 'PP3001',
      byteLength: 0,
      sha256Hash: sha256Hex,
      sha256Hex,
      sha256MatchedExpected,
      metadata: {
        magic: '',
        magicBytesHex,
        formatVersion: 'invalid',
        majorVersion: 0,
        minorVersion: 0,
        flags: 0,
        sectionCount: 0,
        byteLength: 0,
        manifestByteLength: 0,
        footerNonZero: false,
        hasCoreWasmMagic: false,
        hasHoloviewMagic: false,
        sections: [],
      },
      sections: [],
      hasCoreWasmMagic: false,
      hasHoloviewMagic: false,
      errors: ['PP3001: Empty archive payload has no Hologram v4 header.'],
      diagnostic: 'PP3001: Empty archive payload is not a valid Hologram v4 container.',
    };
  }

  // Refuse plain JSON masquerading as .holo (`{`) immediately with PP3001.
  if (bytes[0] === 0x7b) {
    return {
      valid: false,
      structuralIntegrityValid: false,
      manifestValid: false,
      status: 'REJECTED_JSON_AS_HOLO_PP3001',
      errorCode: 'PP3001',
      byteLength: bytes.length,
      sha256Hash: sha256Hex,
      sha256Hex,
      sha256MatchedExpected,
      metadata: {
        magic: 'JSON_TEXT',
        magicBytesHex,
        formatVersion: 'invalid',
        majorVersion: 0,
        minorVersion: 0,
        flags: 0,
        sectionCount: 0,
        byteLength: bytes.length,
        manifestByteLength: 0,
        footerNonZero: false,
        hasCoreWasmMagic: false,
        hasHoloviewMagic: false,
        sections: [],
      },
      sections: [],
      hasCoreWasmMagic: false,
      hasHoloviewMagic: false,
      errors: [
        'PP3001: Plain JSON text starting with "{" cannot masquerade as binary HOLO\\x04\\0.',
      ],
      diagnostic:
        'PP3001: Refused JSON text renamed as .holo. Physical binary HOLO\\x04\\0 archive required.',
    };
  }

  const hasCoreWasmScan = findSubsequenceIndex(bytes, WASM_BINARY_MAGIC, 0) >= 0;
  const hasHoloviewScan = findSubsequenceIndex(bytes, HOLOVIEW_MAGIC, 0) >= 0;

  if (!bytesMatchAt(bytes, HOLO_V4_MAGIC, 0)) {
    return {
      valid: false,
      structuralIntegrityValid: false,
      manifestValid: false,
      status: 'INVALID_MAGIC_OR_FOOTER',
      errorCode: 'PP3001',
      byteLength: bytes.length,
      sha256Hash: sha256Hex,
      sha256Hex,
      sha256MatchedExpected,
      metadata: {
        magic: 'UNKNOWN',
        magicBytesHex,
        formatVersion: 'invalid',
        majorVersion: 0,
        minorVersion: 0,
        flags: 0,
        sectionCount: 0,
        byteLength: bytes.length,
        manifestByteLength: 0,
        footerNonZero: false,
        hasCoreWasmMagic: hasCoreWasmScan,
        hasHoloviewMagic: hasHoloviewScan,
        sections: [],
      },
      sections: [],
      hasCoreWasmMagic: hasCoreWasmScan,
      hasHoloviewMagic: hasHoloviewScan,
      errors: [
        `PP3001: Invalid Hologram v4 magic (${magicBytesHex}); expected 48 4f 4c 4f 04 00 (HOLO\\x04\\0).`,
      ],
      diagnostic: `PP3001: Unrecognized header magic (${magicBytesHex}). Expected HOLO\\x04\\0.`,
    };
  }

  const errors: string[] = [];
  const majorVersion = bytes[4];
  const minorVersion = bytes[5];
  const structuredManifestHeader = bytesMatchAt(bytes, HOLO_V4_MANIFEST_TAG, 6);

  const minLenRequired = structuredManifestHeader
    ? HOLO_V4_STRUCTURED_HEADER_SIZE + HOLO_V4_FOOTER_BYTE_LENGTH + 4
    : HOLO_V4_MAGIC.length + HOLO_V4_FOOTER_BYTE_LENGTH + 16;

  const footerStart = Math.max(0, bytes.length - HOLO_V4_FOOTER_BYTE_LENGTH);
  const footerBytes =
    bytes.length >= HOLO_V4_FOOTER_BYTE_LENGTH ? bytes.slice(footerStart) : new Uint8Array(0);
  const footerNonZero =
    footerBytes.length === HOLO_V4_FOOTER_BYTE_LENGTH && footerBytes.some((b) => b !== 0);
  const footerHexPreview = Array.from(footerBytes.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (bytes.length < minLenRequired) {
    errors.push(
      `PP3001: Truncated Hologram v4 archive (${bytes.length} bytes < minimum ${minLenRequired} bytes required for header + footer).`
    );
  }
  if (!footerNonZero) {
    errors.push('PP3001: Missing or all-zero 32-byte Hologram v4 trailer seal.');
  }

  let flags = 0;
  let sectionCount = 0;
  let manifestByteLength = 0;
  let manifest: HoloV4ManifestContent | undefined;
  let manifestValid = false;
  const sections: HoloV4SectionEntry[] = [];

  const holoviewOffset = findSubsequenceIndex(bytes, HOLOVIEW_MAGIC, 6);
  const wasmOffset = findSubsequenceIndex(bytes, WASM_BINARY_MAGIC, 6);
  const hasCoreWasmMagic = wasmOffset >= 0 && wasmOffset < footerStart;
  const hasHoloviewMagic = holoviewOffset >= 0 && holoviewOffset < footerStart;

  if (
    structuredManifestHeader &&
    bytes.length >= HOLO_V4_STRUCTURED_HEADER_SIZE + HOLO_V4_FOOTER_BYTE_LENGTH
  ) {
    flags = bytes[10];
    sectionCount = bytes[11];
    manifestByteLength = readUint32BE(bytes, 12);
    const manifestEnd = HOLO_V4_STRUCTURED_HEADER_SIZE + manifestByteLength;

    if (sectionCount === 0) {
      errors.push('Structural error: Hologram v4 header declares 0 sections.');
    }

    if (manifestByteLength === 0 || manifestEnd > footerStart) {
      errors.push(
        `Structural error: Declared manifest length (${manifestByteLength} bytes) is zero or overlaps 32-byte footer boundary.`
      );
    } else {
      sections.push({
        name: 'model.prism.json (manifest)',
        offset: HOLO_V4_STRUCTURED_HEADER_SIZE,
        byteLength: manifestByteLength,
        withinBounds: true,
      });

      try {
        const manifestJsonText = new TextDecoder('utf-8', { fatal: true }).decode(
          bytes.slice(HOLO_V4_STRUCTURED_HEADER_SIZE, manifestEnd)
        );
        const parsedRaw = JSON.parse(manifestJsonText);
        const validation = validateHoloV4ManifestObject(parsedRaw);
        if (!validation.valid || !validation.manifest) {
          errors.push(...validation.errors);
        } else {
          manifest = validation.manifest;
          manifestValid = true;

          if (sectionCount !== manifest.sections.length) {
            errors.push(
              `Structural mismatch: binary header declares ${sectionCount} section(s), while manifest lists ${manifest.sections.length}.`
            );
            manifestValid = false;
          }

          if (options.expectedProjectId && manifest.projectId !== options.expectedProjectId) {
            errors.push(
              `Manifest projectId mismatch: expected "${options.expectedProjectId}", got "${manifest.projectId}".`
            );
            manifestValid = false;
          }

          if (
            options.expectedSourceRevision &&
            manifest.sourceRevision !== options.expectedSourceRevision
          ) {
            errors.push(
              `Manifest sourceRevision mismatch: expected "${options.expectedSourceRevision}", got "${manifest.sourceRevision}".`
            );
            manifestValid = false;
          }

          if (manifest.sections.includes('holoview') && !hasHoloviewMagic) {
            errors.push(
              'Manifest declares "holoview" section, but HOLOVIEW\\0\\x01 payload header is missing.'
            );
            manifestValid = false;
          } else if (hasHoloviewMagic) {
            sections.push({
              name: 'holoview',
              offset: holoviewOffset,
              byteLength: HOLOVIEW_MAGIC.length,
              withinBounds: holoviewOffset >= manifestEnd && holoviewOffset < footerStart,
            });
          }

          if (manifest.sections.includes('core-wasm') && !hasCoreWasmMagic) {
            errors.push(
              'Manifest declares "core-wasm" section, but \\0asm Core-Wasm binary header is missing.'
            );
            manifestValid = false;
          } else if (hasCoreWasmMagic) {
            sections.push({
              name: 'core-wasm',
              offset: wasmOffset,
              byteLength: WASM_BINARY_MAGIC.length,
              withinBounds: wasmOffset >= manifestEnd && wasmOffset < footerStart,
            });
          }
        }
      } catch (err) {
        errors.push(
          `Manifest UTF-8/JSON decode failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } else {
    sectionCount = bytes.length > 6 ? bytes[6] : 0;
    if (hasHoloviewMagic) {
      sections.push({
        name: 'holoview',
        offset: holoviewOffset,
        byteLength: HOLOVIEW_MAGIC.length,
        withinBounds: holoviewOffset < footerStart,
      });
    }
    if (hasCoreWasmMagic) {
      sections.push({
        name: 'core-wasm',
        offset: wasmOffset,
        byteLength: WASM_BINARY_MAGIC.length,
        withinBounds: wasmOffset < footerStart,
      });
    }
    if (options.requireManifest) {
      errors.push(
        'Missing structured Hologram v4 manifest ("MFST") section required by build verification.'
      );
    }
  }

  if (sha256MatchedExpected === false) {
    errors.push(
      `PP5401: SHA-256 digest mismatch (computed ${sha256Hex}, expected ${options.expectedSha256}).`
    );
  }

  const structuralIntegrityValid =
    bytes.length >= minLenRequired &&
    footerNonZero &&
    errors.every((e) => !e.startsWith('PP3001') && !e.startsWith('Structural'));

  const requireManifest = options.requireManifest ?? structuredManifestHeader;
  const valid =
    structuralIntegrityValid &&
    sha256MatchedExpected !== false &&
    (!requireManifest || manifestValid) &&
    errors.length === 0;

  let errorCode: HologramV4ParsedArtifact['errorCode'];
  if (!valid) {
    if (!structuralIntegrityValid) {
      errorCode = 'PP3001';
    } else if (requireManifest && !manifestValid) {
      errorCode = 'INVALID_MANIFEST';
    } else if (sha256MatchedExpected === false) {
      errorCode = 'PP5401';
    } else {
      errorCode = 'INVALID_ARCHIVE';
    }
  }

  const header: HoloV4HeaderMetadata = {
    magic: 'HOLO\\x04\\0',
    magicBytesHex,
    majorVersion,
    minorVersion,
    structuredManifestHeader,
    flags,
    sectionCount,
    manifestOffset: structuredManifestHeader ? HOLO_V4_STRUCTURED_HEADER_SIZE : 0,
    manifestByteLength,
    footerByteLength: HOLO_V4_FOOTER_BYTE_LENGTH,
    footerNonZero,
    footerHexPreview,
  };

  const metadata: HologramV4ArtifactMetadata = {
    magic: header.magic,
    magicBytesHex,
    formatVersion: `v${majorVersion}.${minorVersion}`,
    majorVersion,
    minorVersion,
    flags,
    sectionCount,
    byteLength: bytes.length,
    manifestByteLength,
    footerNonZero,
    hasCoreWasmMagic,
    hasHoloviewMagic,
    schema: manifest?.schema,
    projectId: manifest?.projectId,
    projectName: manifest?.projectName,
    sourceRevision: manifest?.sourceRevision,
    entrypoint: manifest?.entrypoint,
    coreWasmContract: manifest?.coreWasmContract,
    viewProfile: manifest?.viewProfile,
    sections: manifest?.sections ?? sections.map((s) => s.name),
    createdAt: manifest?.createdAt,
  };

  const status: HoloArchiveValidationStatus = valid
    ? 'VALID_HOLO_V4'
    : 'INVALID_MAGIC_OR_FOOTER';

  const diagnostic = valid
    ? manifest
      ? `Validated Hologram v4 (${manifest.sections.length} sections, manifest "${manifest.schema}", rev ${manifest.sourceRevision}) & 32-byte trailer.`
      : 'Validated physical HOLO\\x04\\0 container magic header and 32-byte trailer.'
    : errors[0] ?? 'Hologram v4 structural or manifest validation failed.';

  return {
    valid,
    structuralIntegrityValid,
    manifestValid,
    status,
    errorCode,
    byteLength: bytes.length,
    sha256Hash: sha256Hex,
    sha256Hex,
    sha256MatchedExpected,
    metadata,
    header,
    sections,
    manifest,
    hasCoreWasmMagic,
    hasHoloviewMagic,
    errors,
    diagnostic,
  };
}

/**
 * Constructs a spec-compliant Hologram v4 binary ArrayBuffer containing `HOLO\x04\0`,
 * `"MFST"` directory header, embedded JSON manifest, `HOLOVIEW\0\x01`, `\0asm` Core-Wasm
 * binary header, and a non-zero 32-byte trailer seal.
 */
export function buildHologramV4Buffer(params: {
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
}): ArrayBuffer {
  const sections = params.sections ?? ['model.prism.json', 'core-wasm', 'holoview'];
  const manifestObj: HoloV4ManifestContent = {
    schema: 'prismpm/holo-v4-manifest/1',
    projectId: params.projectId,
    projectName: params.projectName,
    sourceRevision: params.sourceRevision,
    entrypoint: params.entrypoint ?? 'holo_run',
    coreWasmContract: params.coreWasmContract ?? 'hologram:guest/core-wasm@1',
    viewProfile: params.viewProfile ?? 'prism.browser-view/1',
    sections,
    createdAt: '2026-11-15T08:00:00Z',
  };

  const manifestText = params.corruptManifest
    ? '{"schema":"prismpm/holo-v4-manifest/1", "corrupted": '
    : JSON.stringify(manifestObj);
  const manifestBytes = new TextEncoder().encode(manifestText);
  const includeHoloview = params.includeHoloview ?? true;
  const includeWasm = params.includeWasm ?? true;
  const wasmVersion = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
  const footer = params.omitFooter ? new Uint8Array(0) : new Uint8Array(32).fill(0xab);

  const holoviewLen = includeHoloview ? HOLOVIEW_MAGIC.length : 0;
  const wasmLen = includeWasm ? WASM_BINARY_MAGIC.length + wasmVersion.length : 0;
  const totalLen =
    HOLO_V4_STRUCTURED_HEADER_SIZE +
    manifestBytes.length +
    holoviewLen +
    wasmLen +
    footer.length;

  const buf = new Uint8Array(totalLen);
  let offset = 0;

  buf.set(HOLO_V4_MAGIC, offset);
  offset += HOLO_V4_MAGIC.length;
  buf.set(HOLO_V4_MANIFEST_TAG, offset);
  offset += HOLO_V4_MANIFEST_TAG.length;
  buf[offset++] = 0x01; // flags
  buf[offset++] = sections.length & 0xff;
  writeUint32BE(buf, offset, manifestBytes.length);
  offset += 4;

  buf.set(manifestBytes, offset);
  offset += manifestBytes.length;

  if (includeHoloview) {
    buf.set(HOLOVIEW_MAGIC, offset);
    offset += HOLOVIEW_MAGIC.length;
  }
  if (includeWasm) {
    buf.set(WASM_BINARY_MAGIC, offset);
    offset += WASM_BINARY_MAGIC.length;
    buf.set(wasmVersion, offset);
    offset += wasmVersion.length;
  }
  if (footer.length > 0) {
    buf.set(footer, offset);
  }

  return buf.buffer;
}

export const hologramService = {
  parseHologramV4Header,
  buildHologramV4Buffer,
  computeArrayBufferSha256,
};
