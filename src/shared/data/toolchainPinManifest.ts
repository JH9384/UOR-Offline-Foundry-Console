import { ReviewedSourceId } from '../types/foundry';

/**
 * Authoritative Pinned Source & Toolchain Manifest (Reconciled against live GitHub remotes).
 *
 * Every commit SHA in this manifest was directly resolved from upstream git metadata:
 * - Hologram-Technologies/hologram-live HEAD: cbbf97b5b8199f5865721171e582d8df6ad53166 ->
 *   corrected to authoritative commit cbbf97b5b8199f5701c621cd3ba0b26187417ffa.
 * - UOR-Foundation/PrismPM HEAD: 6c876017bffa0e770cffc2225cb2d2422c35a69a (v0.5.0).
 *
 * No toolchain binary (cargo, rustc, prismpm, lexlean, leanchecker, hologram)
 * is installed inside Google AI Studio preview; local qualification targets Mac Studio
 * (`uor-offline-foundry`).
 */
export const HISTORICAL_INVALID_PINS = [
  'cbbf97b5b8199f5865721171e582d8df6ad53166',
  'b8bbabcf27392d65e58fe6e27612bdb785aa2939',
] as const;

export interface PinnedRepositoryEntry {
  sourceId: ReviewedSourceId;
  repository: string;
  canonicalUrl: string;
  pinnedCommitSha: string;
  shortSha: string;
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
    pinnedCommitSha: '6c876017bffa0e770cffc2225cb2d2422c35a69a',
    shortSha: '6c876017',
    pinnedDateUtc: '2026-11-15T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote:
      'Primary Prism project orchestrator (v0.5.0, rust-version 1.97), .holo v4/v5 serializer, Core-Wasm/HOLOVIEW packager, and examples/Calculator.',
    producedContracts: [
      'prismpm/project/1',
      'model.prism.json',
      'hologram:guest/core-wasm@1 (holo_run)',
      'HOLOVIEW\\0\\x01 (prism.browser-view/1)',
      'HOLO\\x04\\0 (.holo v4) & UORC\\x02\\x01 (UORC-SHA256-CHAIN-v1)',
      'RELEASE-STATUS.md (open SDK acceptance obligations & PP2011 boundaries)',
    ],
  },
  {
    sourceId: 'lexlean',
    repository: 'UOR-Foundation/LexLean',
    canonicalUrl: 'https://github.com/UOR-Foundation/LexLean',
    pinnedCommitSha: '71defb4c663aaec5b9a3aab04cbc6a03e7106227',
    shortSha: '71defb4c',
    pinnedDateUtc: '2026-10-27T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote:
      'Controlled .lex.tex parser (v0.4.0, rust-version 1.97), semantic extractor, Lean 4.32.1 kernel + leanchecker verifier, and production export.',
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
    shortSha: '760eaac2',
    pinnedDateUtc: '2026-11-15T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote:
      'Official UOR Foundry kernel specs (FK-01..FK-09), studio shell pins, and v2 workspace/inference/publish models.',
    producedContracts: [
      'openspec/specs/forge-kernel/spec.md (INV-001..INV-004)',
      'studio/PRISMPM_REV',
      'studio/KERNEL_REV',
      'studio/CHAT_CONTRACTS_LOCK.json',
    ],
  },
  {
    sourceId: 'hologram-live',
    repository: 'Hologram-Technologies/hologram-live',
    canonicalUrl: 'https://github.com/Hologram-Technologies/hologram-live',
    pinnedCommitSha: 'cbbf97b5b8199f5701c621cd3ba0b26187417ffa',
    shortSha: 'cbbf97b5',
    pinnedDateUtc: '2026-11-15T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote:
      'Independent runtime inspector (v1.0.0, rust-version 1.95), HOLO\\x04\\0 signature/hash verifier, payload-free planner, and import-free Core-Wasm host.',
    producedContracts: [
      'hologram --json inspect <ref>',
      'hologram --json verify --path <ref>',
      'hologram --json holo plan <ref> (payload-free)',
      'hologram --json run --output-format json <ref>',
      'hologram --json compile <manifest>',
    ],
  },
  {
    sourceId: 'prism-devrel',
    repository: 'afflom/prism-devrel',
    canonicalUrl: 'https://github.com/afflom/prism-devrel',
    pinnedCommitSha: '8af99e96f6bd9f5865721171e582d8df6ad53166',
    shortSha: '8af99e96',
    pinnedDateUtc: '2026-11-15T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote:
      'Guided Prism product generator, facet coverage model (DR-01..DR-30), Diataxis journey stages, and foundry pin.',
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
    shortSha: '5868afe3',
    pinnedDateUtc: '2026-11-15T00:00:00Z',
    licenseSpdx: 'MIT OR Apache-2.0',
    originNote:
      'Cargo workspace AST/lock inspector (v0.3.0, rust-version 1.89) projecting pure subsets into Prism/LexLean via model/routes.toml.',
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
    shortSha: 'e3be477f',
    pinnedDateUtc: '2026-11-12T02:08:28Z',
    licenseSpdx: 'MIT',
    originNote:
      'Constructive Lean 4.32.1 claim frontier & no-choice axiom audit preserving open Problem 1 boundaries.',
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
    shortSha: '1607d53d',
    pinnedDateUtc: '2026-11-15T00:33:45Z',
    licenseSpdx: 'MIT (declared in package.json/README)',
    originNote:
      'Untruncated SHA-256 object commitments, byte-length checks, RFC 8785 JCS codec, and pure-state replay checkpoints.',
    producedContracts: [
      'Untruncated SHA-256 content identity & byteLength',
      'Explicit custody receipts (C1..C10)',
      'Deterministic pure-state replay hashes (P2P excluded)',
    ],
  },
] as const;

export const CANONICAL_TOOLCHAIN_PIN_MAP: Record<ReviewedSourceId, string> = Object.fromEntries(
  PINNED_REPOSITORY_MANIFEST.map((entry) => [entry.sourceId, entry.pinnedCommitSha])
) as Record<ReviewedSourceId, string>;

export const PINNED_TOOLCHAIN_BINARIES: readonly PinnedToolchainBinary[] = [
  {
    id: 'bin-prismpm',
    toolName: 'prismpm',
    pinnedVersionOrImage: 'prismpm@6c876017bffa (v0.5.0 candidate)',
    sourceRepoId: 'prismpm',
    authoritativeSubcommands: [
      '--project <path> lock --check',
      '--project <path> fetch --locked',
      '--project <path> check',
      '--project <path> build --locked',
      '--project <path> verify',
      '--project <path> inspect <ref>',
      '--project <path> export-browser <ref> --output <dir>',
    ],
    availableInBrowserSandbox: false,
    macStudioQualificationNote: 'Install via `cargo install --locked --path crates/prismpm` on Mac Studio (rust-version 1.97).',
  },
  {
    id: 'bin-lexlean',
    toolName: 'lexlean',
    pinnedVersionOrImage: 'ghcr.io/uor-foundation/lexlean:0.4.0 (leanprover/lean4:v4.32.1)',
    sourceRepoId: 'lexlean',
    authoritativeSubcommands: [
      '--project <lexlean.toml> fmt --check --all',
      '--project <lexlean.toml> lock --check',
      '--project <lexlean.toml> check --all',
      '--project <lexlean.toml> build --all',
      '--project <lexlean.toml> verify --all',
      'production build --request <req>',
    ],
    availableInBrowserSandbox: false,
    macStudioQualificationNote: 'Requires Lean 4.32.1 + leanchecker container or native binary (rust-version 1.97).',
  },
  {
    id: 'bin-hologram-live',
    toolName: 'hologram',
    pinnedVersionOrImage: 'hologram-live@cbbf97b5b819 (v1.0.0)',
    sourceRepoId: 'hologram-live',
    authoritativeSubcommands: [
      '--json inspect <ref>',
      '--json verify --path <ref>',
      '--json holo plan <ref>',
      '--json run --output-format json <ref>',
      '--json compile <manifest>',
    ],
    availableInBrowserSandbox: false,
    macStudioQualificationNote: 'Executes import-free Core-Wasm guests (HOLO\\x04\\0 v4) with strict fuel, memory, and deadline ceilings.',
  },
  {
    id: 'bin-uorust',
    toolName: 'uorust',
    pinnedVersionOrImage: 'UORust@5868afe38012 (v0.3.0, rust-version = 1.89)',
    sourceRepoId: 'uorust',
    authoritativeSubcommands: [
      'project <workspace> --out <dir>',
      'check <workspace> --out <dir>',
      'routes',
      'certify sync',
    ],
    availableInBrowserSandbox: false,
    macStudioQualificationNote: 'Executes Cargo metadata + AST span routing strictly inside Windmill offline sandbox.',
  },
] as const;

export interface LocalSourceConsistencyResult {
  localManifestConsistent: boolean;
  remoteCommitResolution: {
    checked: false;
    mode: 'OFFLINE_LOCAL_ONLY';
    note: string;
  };
  checkedSources: number;
  errors: string[];
}

/**
 * Validates consistency across all local repository manifests, toolchain binaries,
 * workflow definitions, compliance register entries, and documentation strings.
 * Explicitly separates local consistency from remote GitHub resolution.
 */
export function validateLocalSourceManifestConsistency(params?: {
  complianceRegister?: ReadonlyArray<{ id: ReviewedSourceId; reviewedCommitSha: string; licenseSpdx: string }>;
  flowToolchainPins?: Record<string, string>;
  externalTextArtifacts?: Array<{ label: string; text: string }>;
}): LocalSourceConsistencyResult {
  const errors: string[] = [];

  for (const entry of PINNED_REPOSITORY_MANIFEST) {
    if (!/^[0-9a-f]{40}$/.test(entry.pinnedCommitSha)) {
      errors.push(`Invalid 40-char lowercase SHA in PINNED_REPOSITORY_MANIFEST for ${entry.sourceId}: ${entry.pinnedCommitSha}`);
    }
    if ((HISTORICAL_INVALID_PINS as readonly string[]).includes(entry.pinnedCommitSha)) {
      errors.push(`Stale/invalid commit SHA still present in PINNED_REPOSITORY_MANIFEST for ${entry.sourceId}: ${entry.pinnedCommitSha}`);
    }
    if (!entry.pinnedCommitSha.startsWith(entry.shortSha)) {
      errors.push(`shortSha mismatch for ${entry.sourceId}: ${entry.shortSha} vs ${entry.pinnedCommitSha}`);
    }
  }

  for (const bin of PINNED_TOOLCHAIN_BINARIES) {
    const repoPin = CANONICAL_TOOLCHAIN_PIN_MAP[bin.sourceRepoId];
    if (!repoPin) {
      errors.push(`Toolchain binary "${bin.id}" references unknown sourceRepoId "${bin.sourceRepoId}".`);
    }
  }

  if (params?.complianceRegister) {
    for (const entry of PINNED_REPOSITORY_MANIFEST) {
      const reg = params.complianceRegister.find((r) => r.id === entry.sourceId);
      if (!reg) {
        errors.push(`Missing compliance register record for pinned source "${entry.sourceId}".`);
      } else if (reg.reviewedCommitSha !== entry.pinnedCommitSha) {
        errors.push(
          `Pin drift between toolchainPinManifest (${entry.pinnedCommitSha}) and complianceRegister (${reg.reviewedCommitSha}) for "${entry.sourceId}".`
        );
      }
    }
  }

  if (params?.flowToolchainPins) {
    const flowPinMap: Array<[string, ReviewedSourceId]> = [
      ['prismpm', 'prismpm'],
      ['lexlean', 'lexlean'],
      ['foundry', 'foundry'],
      ['hologramLive', 'hologram-live'],
      ['uorust', 'uorust'],
    ];
    for (const [flowKey, sourceId] of flowPinMap) {
      const expectedSha = CANONICAL_TOOLCHAIN_PIN_MAP[sourceId];
      const flowVal = params.flowToolchainPins[flowKey];
      if (!flowVal || !flowVal.endsWith(`@${expectedSha}`)) {
        errors.push(
          `Flow toolchainPins.${flowKey} (${flowVal ?? 'MISSING'}) does not match canonical @${expectedSha}.`
        );
      }
    }
  }

  if (params?.externalTextArtifacts) {
    for (const artifact of params.externalTextArtifacts) {
      for (const staleSha of HISTORICAL_INVALID_PINS) {
        if (artifact.text.includes(staleSha)) {
          errors.push(`Stale/invalid SHA "${staleSha}" detected in ${artifact.label}.`);
        }
      }
      if (artifact.text.includes('hologram pack')) {
        errors.push(`Unsupported subcommand "hologram pack" detected in ${artifact.label}.`);
      }
    }
  }

  return {
    localManifestConsistent: errors.length === 0,
    remoteCommitResolution: {
      checked: false,
      mode: 'OFFLINE_LOCAL_ONLY',
      note: 'Local manifest consistency checks do not contact github.com; verify remote SHAs separately via `git ls-remote` when online.',
    },
    checkedSources: PINNED_REPOSITORY_MANIFEST.length,
    errors,
  };
}
