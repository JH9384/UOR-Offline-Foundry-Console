import { ReviewedSourceId } from '../types/foundry';

/**
 * Authoritative Pinned Source & Toolchain Manifest (Reconciled 2026-11-15).
 *
 * Every commit SHA in this manifest was directly verified from upstream git metadata.
 * No toolchain binary (cargo, rustc, prismpm, lexlean, leanchecker, hologram-live)
 * is installed inside Google AI Studio preview; local qualification targets Mac Studio
 * (`uor-offline-foundry`).
 */
export interface PinnedRepositoryEntry {
  sourceId: ReviewedSourceId;
  repository: string;
  canonicalUrl: string;
  pinnedCommitSha: string;
  pinnedDateUtc: string;
  licenseSpdx: string;
  originNote: string;
  producedContracts: string[];
}

export interface PinnedToolchainBinary {
  id: string;
  toolName: string;
  pinnedVersionOrImage: string;
  sourceRepoId: ReviewedSourceId;
  authoritativeSubcommands: string[];
  availableInBrowserSandbox: false;
  macStudioQualificationNote: string;
}

export const PINNED_REPOSITORY_MANIFEST: readonly PinnedRepositoryEntry[] = [
  {
    sourceId: 'prismpm',
    repository: 'UOR-Foundation/PrismPM',
    canonicalUrl: 'https://github.com/UOR-Foundation/PrismPM',
    pinnedCommitSha: 'b8bbabcf27392d65e58fe6e27612bdb785aa2939',
    pinnedDateUtc: '2026-11-15T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote: 'Primary Prism project orchestrator, .holo v4/v5 serializer, Core-Wasm/HOLOVIEW packager, and examples/Calculator.',
    producedContracts: [
      'prismpm/project/1',
      'model.prism.json',
      'hologram:guest/core-wasm@1 (holo_run)',
      'HOLOVIEW\\0\\x01 (prism.browser-view/1)',
      'HOLO\\x04\\0 (.holo v4) & UORC\\x02\\x01 (v5)',
      'RELEASE-STATUS.md (v0.4.0 open obligations & PP2011 closed)',
    ],
  },
  {
    sourceId: 'lexlean',
    repository: 'UOR-Foundation/LexLean',
    canonicalUrl: 'https://github.com/UOR-Foundation/LexLean',
    pinnedCommitSha: '71defb4c663aaec5b9a3aab04cbc6a03e7106227',
    pinnedDateUtc: '2026-10-27T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote: 'Controlled .lex.tex parser, semantic extractor, Lean 4.32.1 kernel + leanchecker verifier, and production export.',
    producedContracts: [
      'lexlean/project/1',
      'lexlean/lock/2',
      'lexlean/semantic-module/1',
      'lexlean/production-result/1',
      'leanprover/lean4:v4.32.1 + #print axioms audit',
    ],
  },
  {
    sourceId: 'foundry',
    repository: 'UOR-Foundation/foundry',
    canonicalUrl: 'https://github.com/UOR-Foundation/foundry',
    pinnedCommitSha: '760eaac29687628c7c66e8d492e126afa194656e',
    pinnedDateUtc: '2026-11-15T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote: 'Official UOR Foundry kernel specs (FK-01..FK-09), studio shell pins, and v2 workspace/inference/publish models.',
    producedContracts: [
      'openspec/specs/forge-kernel/spec.md (INV-001..INV-004)',
      'studio/PRISMPM_REV (f57a697e8d19e93c43ef69a22199ff351751070a)',
      'studio/KERNEL_REV',
      'studio/CHAT_CONTRACTS_LOCK.json',
    ],
  },
  {
    sourceId: 'hologram-live',
    repository: 'Hologram-Technologies/hologram-live',
    canonicalUrl: 'https://github.com/Hologram-Technologies/hologram-live',
    pinnedCommitSha: 'cbbf97b5b8199f5865721171e582d8df6ad53166',
    pinnedDateUtc: '2026-10-01T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote: 'Independent runtime inspector, signature/hash verifier, payload-free planner, and import-free Core-Wasm host.',
    producedContracts: [
      'hologram inspect --json',
      'hologram verify --json',
      'hologram plan --json (payload-free)',
      'hologram run --json (import-free fuel/memory/deadline sandbox)',
      'hologram pack --json',
    ],
  },
  {
    sourceId: 'prism-devrel',
    repository: 'afflom/prism-devrel',
    canonicalUrl: 'https://github.com/afflom/prism-devrel',
    pinnedCommitSha: '8af99e96f6bd9f5865721171e582d8df6ad53166',
    pinnedDateUtc: '2026-11-15T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote: 'Guided Prism product generator, facet coverage model (DR-01..DR-30), Diataxis journey stages, and foundry pin.',
    producedContracts: [
      'uor/template-contract/1',
      'Foundation.DevRel.V1 (Catalog.lex.tex)',
      'DR-01..DR-30 & R1..R6 conformance suite',
    ],
  },
  {
    sourceId: 'uorust',
    repository: 'afflom/UORust',
    canonicalUrl: 'https://github.com/afflom/UORust',
    pinnedCommitSha: '5868afe38012d647be00ad948949b1e384b87211',
    pinnedDateUtc: '2026-11-15T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote: 'Cargo workspace AST/lock inspector projecting pure subsets into Prism/LexLean via model/routes.toml.',
    producedContracts: [
      'uorust/routes/1 (model/routes.toml)',
      'uorust/certified/1',
      'Typed UorustError non-defaulting source-span refusals (UE-01..UE-16)',
    ],
  },
  {
    sourceId: 'rule30',
    repository: 'afflom/rule30',
    canonicalUrl: 'https://github.com/afflom/rule30',
    pinnedCommitSha: 'e3be477fded263029479127363f7fb6a3597e7d4',
    pinnedDateUtc: '2026-11-12T02:08:28Z',
    licenseSpdx: 'MIT',
    originNote: 'Constructive Lean 4.32.1 claim frontier & no-choice axiom audit preserving open Problem 1 boundaries.',
    producedContracts: [
      'frontier.toml (open vs proved separation)',
      '{propext, Quot.sound} axiom allowlist (check_no_choice.py)',
      'rule30-api/CONFORMANCE.md honesty levels',
    ],
  },
  {
    sourceId: 'stitch',
    repository: 'afflom/stitch',
    canonicalUrl: 'https://github.com/afflom/stitch',
    pinnedCommitSha: '1607d53dfc5a34324f8102123d166d727cc66634',
    pinnedDateUtc: '2026-11-15T00:33:45Z',
    licenseSpdx: 'MIT (declared in package.json/README)',
    originNote: 'Untruncated SHA-256 object commitments, byte-length checks, RFC 8785 JCS codec, and pure-state replay checkpoints.',
    producedContracts: [
      'Untruncated SHA-256 content identity & byteLength',
      'Explicit custody receipts (C1..C10)',
      'Deterministic pure-state replay hashes (P2P excluded)',
    ],
  },
] as const;

export const PINNED_TOOLCHAIN_BINARIES: readonly PinnedToolchainBinary[] = [
  {
    id: 'bin-prismpm',
    toolName: 'prismpm',
    pinnedVersionOrImage: 'prismpm@b8bbabcf2739 (v0.4.0 candidate)',
    sourceRepoId: 'prismpm',
    authoritativeSubcommands: ['lock --check', 'fetch --locked', 'check', 'build --locked', 'verify', 'inspect', 'export-browser'],
    availableInBrowserSandbox: false,
    macStudioQualificationNote: 'Install via `cargo install --locked --path crates/prismpm` on Mac Studio.',
  },
  {
    id: 'bin-lexlean',
    toolName: 'lexlean',
    pinnedVersionOrImage: 'ghcr.io/uor-foundation/lexlean:0.4.0 (leanprover/lean4:v4.32.1)',
    sourceRepoId: 'lexlean',
    authoritativeSubcommands: ['lock', 'fmt --check', 'check', 'build', 'verify', 'production build'],
    availableInBrowserSandbox: false,
    macStudioQualificationNote: 'Requires Lean 4.32.1 + leanchecker container or native binary.',
  },
  {
    id: 'bin-hologram-live',
    toolName: 'hologram',
    pinnedVersionOrImage: 'hologram-live@cbbf97b5b819',
    sourceRepoId: 'hologram-live',
    authoritativeSubcommands: ['inspect --json', 'verify --json', 'plan --json', 'run --json', 'pack --json'],
    availableInBrowserSandbox: false,
    macStudioQualificationNote: 'Executes import-free Core-Wasm guests with strict fuel, memory, and deadline ceilings.',
  },
  {
    id: 'bin-uorust',
    toolName: 'uorust',
    pinnedVersionOrImage: 'UORust@5868afe38012 (rust-version = 1.89)',
    sourceRepoId: 'uorust',
    authoritativeSubcommands: ['project', 'certify sync'],
    availableInBrowserSandbox: false,
    macStudioQualificationNote: 'Executes Cargo metadata + AST span routing strictly inside Windmill offline sandbox.',
  },
] as const;
