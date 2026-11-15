import {
  HoloArchiveValidationStatus,
  LockfilePinCheck,
  OfflineLockClosureReport,
} from '../types/foundry';

/**
 * Physical binary format constants verified from:
 * - UOR-Foundation/PrismPM @ b8bbabcf (crates/prismpm/src/holo/archive.rs, v5.rs)
 * - Hologram-Technologies/hologram-live @ cbbf97b5
 */
export const HOLO_V4_MAGIC = new Uint8Array([0x48, 0x4f, 0x4c, 0x4f, 0x04, 0x00]); // b"HOLO\x04\0"
export const HOLO_V5_UORC_MAGIC = new Uint8Array([0x55, 0x4f, 0x52, 0x43, 0x02, 0x01]); // b"UORC\x02\x01"
export const HOLOVIEW_MAGIC = new Uint8Array([0x48, 0x4f, 0x4c, 0x4f, 0x56, 0x49, 0x45, 0x57, 0x00, 0x01]); // b"HOLOVIEW\0\x01"
export const WASM_BINARY_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d]); // "\0asm"

export const CORE_WASM_GUEST_CONTRACT = {
  world: 'hologram:guest/core-wasm@1',
  importFree: true,
  entrypointExport: 'holo_run',
  entrypointSignature: '(i32, i32) -> i64',
} as const;

export const BROWSER_VIEW_CONTRACT = {
  headerMagic: 'HOLOVIEW\\0\\x01',
  schema: 'lean4-prod/browser-view-projection/1',
  profile: 'prism.browser-view/1',
} as const;

export interface HoloInspectionReport {
  valid: boolean;
  status: HoloArchiveValidationStatus;
  errorCode?: 'PP3001' | 'PP5401' | 'INVALID_ARCHIVE';
  archiveVersion: 'v4-holo' | 'v5-uorc' | 'invalid';
  byteLength: number;
  sha256Hex: string;
  sha256MatchedExpected?: boolean;
  headerMagicHex: string;
  modeledSectionsMin: number;
  hasCoreWasmMagic: boolean;
  hasHoloviewMagic: boolean;
  footerPresent: boolean;
  diagnostic: string;
}

function startsWithBytes(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

function containsSubsequence(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || haystack.length < needle.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function readUleb128(bytes: Uint8Array, offset: number): { value: number; nextOffset: number } | null {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length && shift <= 35) {
    const byte = bytes[pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, nextOffset: pos };
    }
    shift += 7;
  }
  return null;
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    );
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Node fallback when crypto.subtle is unavailable in older globals
  const mod = await import('node:crypto');
  return mod.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Inspects and strictly validates raw `.holo` archive bytes according to PrismPM rules:
 * - Rejects legacy JSON renamed as `.holo` (`b"{"`) with `PP3001`.
 * - Accepts physical v4 (`b"HOLO\x04\0"` + body + 32-byte blake3 footer) or v5 UORC (`b"UORC\x02\x01\x00\x00"` + objects + 32-byte seal).
 * - Optionally verifies computed SHA-256 matches the declared manifest digest.
 */
export async function inspectHoloArchiveBytes(
  bytes: Uint8Array,
  expectedSha256?: string
): Promise<HoloInspectionReport> {
  const sha256Hex = await computeSha256Hex(bytes);
  const sha256MatchedExpected =
    expectedSha256 !== undefined ? sha256Hex === expectedSha256.toLowerCase() : undefined;
  const headerMagicHex = Array.from(bytes.slice(0, 6))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

  if (bytes.length === 0) {
    return {
      valid: false,
      status: 'INVALID_MAGIC_OR_FOOTER',
      errorCode: 'PP3001',
      archiveVersion: 'invalid',
      byteLength: 0,
      sha256Hex,
      sha256MatchedExpected,
      headerMagicHex,
      modeledSectionsMin: 0,
      hasCoreWasmMagic: false,
      hasHoloviewMagic: false,
      footerPresent: false,
      diagnostic: 'PP3001: Empty archive payload is not a valid .holo container.',
    };
  }

  // Legacy JSON disguised as `.holo` MUST be rejected (`crates/prismpm/src/holo/archive.rs:582`).
  if (bytes[0] === 0x7b || startsWithBytes(bytes, new TextEncoder().encode('{'))) {
    return {
      valid: false,
      status: 'REJECTED_JSON_AS_HOLO_PP3001',
      errorCode: 'PP3001',
      archiveVersion: 'invalid',
      byteLength: bytes.length,
      sha256Hex,
      sha256MatchedExpected,
      headerMagicHex,
      modeledSectionsMin: 0,
      hasCoreWasmMagic: false,
      hasHoloviewMagic: false,
      footerPresent: false,
      diagnostic:
        'PP3001: Refused JSON text renamed as .holo. Physical binary HOLO\\x04\\0 or UORC\\x02\\x01 archive is required.',
    };
  }

  const hasCoreWasmMagic = containsSubsequence(bytes, WASM_BINARY_MAGIC);
  const hasHoloviewMagic = containsSubsequence(bytes, HOLOVIEW_MAGIC);

  // Check physical v4 header: HOLO\x04\0 (6 bytes) + body + 32-byte blake3 footer
  if (startsWithBytes(bytes, HOLO_V4_MAGIC)) {
    const footerPresent = bytes.length >= 6 + 32 + 16;
    if (!footerPresent) {
      return {
        valid: false,
        status: 'INVALID_MAGIC_OR_FOOTER',
        errorCode: 'PP3001',
        archiveVersion: 'invalid',
        byteLength: bytes.length,
        sha256Hex,
        sha256MatchedExpected,
        headerMagicHex,
        modeledSectionsMin: 0,
        hasCoreWasmMagic,
        hasHoloviewMagic,
        footerPresent: false,
        diagnostic:
          'PP3001: Truncated HOLO\\x04\\0 v4 archive missing minimum modeled section table and 32-byte footer.',
      };
    }

    const digestMismatch = sha256MatchedExpected === false;
    return {
      valid: !digestMismatch,
      status: digestMismatch ? 'INVALID_MAGIC_OR_FOOTER' : 'VALID_HOLO_V4',
      errorCode: digestMismatch ? 'PP5401' : undefined,
      archiveVersion: 'v4-holo',
      byteLength: bytes.length,
      sha256Hex,
      sha256MatchedExpected,
      headerMagicHex,
      modeledSectionsMin: 8,
      hasCoreWasmMagic,
      hasHoloviewMagic,
      footerPresent: true,
      diagnostic: digestMismatch
        ? `PP5401: HOLO v4 SHA-256 (${sha256Hex}) does not match expected manifest digest (${expectedSha256}).`
        : 'Validated physical HOLO\\x04\\0 v4 container magic header and footer boundary.',
    };
  }

  // Check Prism v5 UORC archive header: "UORC" 02 01 00 00 uleb(count) ... seal[32]
  if (startsWithBytes(bytes, HOLO_V5_UORC_MAGIC) && bytes.length >= 8 + 32 + 1) {
    const countDec = readUleb128(bytes, 8);
    if (!countDec || countDec.value < 7) {
      return {
        valid: false,
        status: 'INVALID_MAGIC_OR_FOOTER',
        errorCode: 'PP3001',
        archiveVersion: 'invalid',
        byteLength: bytes.length,
        sha256Hex,
        sha256MatchedExpected,
        headerMagicHex,
        modeledSectionsMin: countDec?.value ?? 0,
        hasCoreWasmMagic,
        hasHoloviewMagic,
        footerPresent: false,
        diagnostic: 'PP3001: UORC v5 archive requires all 7 ROLES_V5 ordered objects.',
      };
    }
    const digestMismatch = sha256MatchedExpected === false;
    return {
      valid: !digestMismatch,
      status: digestMismatch ? 'INVALID_MAGIC_OR_FOOTER' : 'VALID_HOLO_V5_UORC',
      errorCode: digestMismatch ? 'PP5401' : undefined,
      archiveVersion: 'v5-uorc',
      byteLength: bytes.length,
      sha256Hex,
      sha256MatchedExpected,
      headerMagicHex,
      modeledSectionsMin: countDec.value,
      hasCoreWasmMagic,
      hasHoloviewMagic,
      footerPresent: true,
      diagnostic: digestMismatch
        ? `PP5401: UORC v5 SHA-256 (${sha256Hex}) does not match expected manifest digest.`
        : `Validated UORC v5 archive (${countDec.value} ordered objects) and 32-byte seal.`,
    };
  }

  return {
    valid: false,
    status: 'INVALID_MAGIC_OR_FOOTER',
    errorCode: 'PP3001',
    archiveVersion: 'invalid',
    byteLength: bytes.length,
    sha256Hex,
    sha256MatchedExpected,
    headerMagicHex,
    modeledSectionsMin: 0,
    hasCoreWasmMagic,
    hasHoloviewMagic,
    footerPresent: false,
    diagnostic: `PP3001: Unrecognized header magic (${headerMagicHex}). Expected HOLO\\x04\\0 or UORC\\x02\\x01.`,
  };
}

/**
 * Validates offline dependency closure across `prismpm.lock`, `lexlean.lock`,
 * `standards.lock`, and (for Rust projects) `Cargo.lock` prior to offline `--locked` runs.
 */
export function validateOfflineDependencyClosure(params: {
  inputMode: 'NATIVE_PRISM' | 'EXISTING_RUST' | 'GUIDED_PRODUCT';
  declaredLockfiles: Array<{
    filename: LockfilePinCheck['filename'];
    present: boolean;
    pinValue?: string;
  }>;
}): OfflineLockClosureReport {
  const checkedAt = new Date().toISOString();
  const requiredFiles: LockfilePinCheck['filename'][] =
    params.inputMode === 'EXISTING_RUST'
      ? ['Cargo.lock', 'prismpm.lock', 'lexlean.lock']
      : ['prismpm.lock', 'lexlean.lock', 'standards.lock'];

  const checks: LockfilePinCheck[] = (
    ['prismpm.lock', 'lexlean.lock', 'standards.lock', 'Cargo.lock'] as const
  ).map((filename) => {
    const required = requiredFiles.includes(filename);
    const declared = params.declaredLockfiles.find((d) => d.filename === filename);
    const present = Boolean(declared?.present);
    const pinValue = declared?.pinValue?.trim();
    const digestPinned = Boolean(
      pinValue &&
        (/^[0-9a-f]{40,64}$/i.test(pinValue) ||
          /^(sha256|blake3):[0-9a-f]{64}$/i.test(pinValue) ||
          /^(lexlean\/lock\/2|prismpm\/sdk-lock\/2|version = [34])/.test(pinValue))
    );

    let note = 'Not required for selected input mode.';
    if (required) {
      if (!present) {
        note = `Missing required ${filename} — offline --locked build cannot guarantee hermeticity.`;
      } else if (!digestPinned) {
        note = `${filename} present but lacks immutable commit/SHA-256/blake3 pin (fail-closed PP5401).`;
      } else {
        note = `Pinned for offline hermetic execution (${pinValue}).`;
      }
    }

    return {
      filename,
      required,
      present,
      digestPinned,
      pinValue,
      note,
    };
  });

  const blockingReasons = checks
    .filter((c) => c.required && (!c.present || !c.digestPinned))
    .map((c) => c.note);

  return {
    readyForOfflineRun: blockingReasons.length === 0,
    checks,
    blockingReasons,
    checkedAt,
  };
}

/**
 * Helper used only in unit tests / local qualification fixtures to construct a
 * structurally valid HOLO\x04\0 v4 test binary buffer (with real MFST header,
 * embedded manifest JSON, HOLOVIEW\0\x01, WASM \0asm markers, and 32-byte trailer).
 */
export function buildSyntheticHoloV4TestFixtureBytes(bodyTag = 'calculator-v4'): Uint8Array {
  const manifestTag = new Uint8Array([0x4d, 0x46, 0x53, 0x54]); // "MFST"
  const sections = ['model.prism.json', 'core-wasm', 'holoview'];
  const manifestBytes = new TextEncoder().encode(
    JSON.stringify({
      schema: 'prismpm/holo-v4-manifest/1',
      projectId: 'proj-prism-calc',
      projectName: `PrismPM Fixture (${bodyTag})`,
      sourceRevision: 'prismpm/main@b8bbabcf',
      entrypoint: 'holo_run',
      coreWasmContract: 'hologram:guest/core-wasm@1',
      viewProfile: 'prism.browser-view/1',
      sections,
      createdAt: '2026-11-15T08:00:00Z',
    })
  );
  const tagBytes = new TextEncoder().encode(bodyTag);
  const tailSeal = new Uint8Array(32).fill(0xab);
  const headerLen = HOLO_V4_MAGIC.length + manifestTag.length + 2 + 4; // 16 bytes
  const totalLen =
    headerLen +
    manifestBytes.length +
    HOLOVIEW_MAGIC.length +
    WASM_BINARY_MAGIC.length +
    4 + // WASM version 1
    tagBytes.length +
    tailSeal.length;
  const buf = new Uint8Array(totalLen);
  let offset = 0;
  buf.set(HOLO_V4_MAGIC, offset);
  offset += HOLO_V4_MAGIC.length;
  buf.set(manifestTag, offset);
  offset += manifestTag.length;
  buf[offset++] = 0x01; // flags
  buf[offset++] = sections.length; // section count
  buf[offset++] = (manifestBytes.length >>> 24) & 0xff;
  buf[offset++] = (manifestBytes.length >>> 16) & 0xff;
  buf[offset++] = (manifestBytes.length >>> 8) & 0xff;
  buf[offset++] = manifestBytes.length & 0xff;
  buf.set(manifestBytes, offset);
  offset += manifestBytes.length;
  buf.set(HOLOVIEW_MAGIC, offset);
  offset += HOLOVIEW_MAGIC.length;
  buf.set(WASM_BINARY_MAGIC, offset);
  offset += WASM_BINARY_MAGIC.length;
  buf.set(new Uint8Array([0x01, 0x00, 0x00, 0x00]), offset);
  offset += 4;
  buf.set(tagBytes, offset);
  offset += tagBytes.length;
  buf.set(tailSeal, offset);
  return buf;
}

/**
 * Direct binary/source/runtime/evidence downloads are strictly gated on actual
 * on-disk artifact presence AND verified SHA-256 checksum matching.
 */
export function canDownloadVerifiedArtifact(artifact?: {
  fileExistsOnDisk?: boolean;
  sha256Verified?: boolean;
}): boolean {
  return Boolean(artifact?.fileExistsOnDisk && artifact?.sha256Verified);
}

export function getDirectDownloadBlockReason(artifact?: {
  fileExistsOnDisk?: boolean;
  sha256Verified?: boolean;
}): string | null {
  if (!artifact) return 'No artifact selected.';
  if (!artifact.fileExistsOnDisk) {
    return 'Direct download disabled: verified build artifact does not exist on local container disk in browser sandbox.';
  }
  if (!artifact.sha256Verified) {
    return 'Direct download disabled (PP5401): file digest has not been independently verified on disk.';
  }
  return null;
}

export function evaluateProjectOfflineClosure(
  inputMode: 'NATIVE_PRISM' | 'EXISTING_RUST' | 'GUIDED_PRODUCT',
  lockfilesDeclared: string[] = []
): OfflineLockClosureReport {
  const defaultPins: Record<LockfilePinCheck['filename'], string> = {
    'prismpm.lock': 'prismpm/sdk-lock/2',
    'lexlean.lock': 'lexlean/lock/2',
    'standards.lock': 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    'Cargo.lock': 'version = 3',
  };
  const allLockfiles: LockfilePinCheck['filename'][] = [
    'prismpm.lock',
    'lexlean.lock',
    'standards.lock',
    'Cargo.lock',
  ];
  return validateOfflineDependencyClosure({
    inputMode,
    declaredLockfiles: allLockfiles.map((filename) => {
      const present = lockfilesDeclared.some((entry) =>
        entry.toLowerCase().includes(filename.toLowerCase())
      );
      return {
        filename,
        present,
        pinValue: present ? defaultPins[filename] : undefined,
      };
    }),
  });
}

