/**
 * Hologram v4 Header & Manifest Parsing Service entrypoint (`src/services/hologramService.ts`).
 *
 * Re-exports the canonical ArrayBuffer-based `parseHologramV4Header` parser and typed
 * artifact metadata/SHA-256 integrity contracts shared across the Vite app and Windmill bundle.
 */
export {
  buildHologramV4Buffer,
  computeArrayBufferSha256,
  HOLO_V4_FOOTER_BYTE_LENGTH,
  HOLO_V4_MANIFEST_TAG,
  HOLO_V4_STRUCTURED_HEADER_SIZE,
  hologramService,
  parseHologramV4Header,
} from '../shared/services/hologramService';

export type {
  HologramV4ArtifactMetadata,
  HologramV4ParsedArtifact,
  HologramV4ParseOptions,
  HoloV4HeaderMetadata,
  HoloV4ManifestContent,
  HoloV4SectionEntry,
} from '../shared/services/hologramService';
