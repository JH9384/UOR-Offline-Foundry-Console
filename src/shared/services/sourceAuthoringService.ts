import { computeSha256Hex } from './holoArchiveValidator';
import { scrubSensitiveExportText } from './durableLocalStore';
import {
  AiSourceProposal,
  AuthoringFileKind,
  AuthoringSourceFile,
  AuthoringSyntaxLanguage,
  FoundrySourcePackageFileEntry,
  FoundrySourcePackageManifest,
  PreliminarySourceDiagnostic,
  PrismInputMode,
  PrismOutputClassId,
  ProductFamily,
  ProjectAuthoringWorkspace,
  ProjectRecord,
  SourceFileCheckpoint,
  SourcePackageDestination,
} from '../types/foundry';

export const SOURCE_PACKAGE_SCHEMA = 'uor.foundry.source-package.v1' as const;

const SAFE_SOURCE_PATH_REGEX = /^[a-zA-Z0-9._/-]{2,140}$/;

const RESTRICTED_SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._\-+/=]{8,}/i,
  /\b(sk-[A-Za-z0-9_\-]{12,}|ghp_[A-Za-z0-9]{12,}|gho_[A-Za-z0-9]{12,}|wm_[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z_\-]{16,})\b/,
  /\b(api[_-]?key|x-api-key|bearer[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*[^\s,;]+/i,
];

const LOCAL_HOST_PATH_REGEX =
  /(?:\/Users\/|\/home\/|\/Volumes\/|\/private\/|\/etc\/|\/var\/|[A-Za-z]:\\Users\\)[A-Za-z0-9._\-/\\]+/;

export interface SourceDiffRow {
  lineBefore: number | null;
  lineAfter: number | null;
  kind: 'equal' | 'add' | 'remove' | 'change';
  textBefore: string;
  textAfter: string;
}

export interface SyntaxToken {
  text: string;
  tone: 'plain' | 'keyword' | 'directive' | 'section' | 'string' | 'comment' | 'number' | 'key';
}

export function inferAuthoringFileMeta(filePath: string): {
  kind: AuthoringFileKind;
  language: AuthoringSyntaxLanguage;
  isAuthoritativeInput: boolean;
} {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.lex.tex') || lower.endsWith('.tex')) {
    return { kind: 'lex_tex', language: 'lextex', isAuthoritativeInput: true };
  }
  if (lower.endsWith('prismpm.toml')) {
    return { kind: 'prismpm_toml', language: 'toml', isAuthoritativeInput: true };
  }
  if (lower.endsWith('lexlean.toml')) {
    return { kind: 'lexlean_toml', language: 'toml', isAuthoritativeInput: true };
  }
  if (lower.endsWith('routes.toml')) {
    return { kind: 'routes_toml', language: 'toml', isAuthoritativeInput: true };
  }
  if (lower.endsWith('frontier.toml')) {
    return { kind: 'frontier_toml', language: 'toml', isAuthoritativeInput: true };
  }
  if (lower.endsWith('cargo.toml')) {
    return { kind: 'cargo_toml', language: 'toml', isAuthoritativeInput: true };
  }
  if (lower.endsWith('.lock')) {
    return { kind: 'lockfile', language: 'toml', isAuthoritativeInput: true };
  }
  if (lower.includes('facet')) {
    return { kind: 'facets_json', language: 'json', isAuthoritativeInput: false };
  }
  if (lower.includes('view')) {
    return { kind: 'views_json', language: 'json', isAuthoritativeInput: true };
  }
  if (lower.includes('accept') || lower.includes('vector') || lower.includes('claim')) {
    return { kind: 'acceptance_json', language: 'json', isAuthoritativeInput: false };
  }
  if (lower.endsWith('.rs')) {
    return { kind: 'cargo_toml', language: 'rust', isAuthoritativeInput: true };
  }
  return { kind: 'acceptance_json', language: 'json', isAuthoritativeInput: false };
}

export function validateDraftFilePath(filePath: string): { ok: true; cleanPath: string } | { ok: false; error: string } {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return { ok: false, error: 'File path cannot be empty.' };
  }
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    trimmed.includes('..') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    return {
      ok: false,
      error: `Refused unsafe path "${trimmed}": path traversal, absolute paths, and backslashes are forbidden.`,
    };
  }
  if (trimmed.toLowerCase().endsWith('.holo') || trimmed.toLowerCase().endsWith('.wasm')) {
    return {
      ok: false,
      error: `Refused "${trimmed}": authored draft workspaces cannot contain compiled .holo or .wasm binary artifacts.`,
    };
  }
  if (!SAFE_SOURCE_PATH_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: `Invalid path "${trimmed}": allowed characters are [a-zA-Z0-9._/-].`,
    };
  }
  return { ok: true, cleanPath: trimmed };
}

export function detectRestrictedSecretsInText(content: string): string[] {
  const hits: string[] = [];
  for (const pat of RESTRICTED_SECRET_PATTERNS) {
    if (pat.test(content)) {
      hits.push(`Matched restricted credential/secret pattern (${pat.source.slice(0, 28)}...)`);
    }
  }
  if (LOCAL_HOST_PATH_REGEX.test(content)) {
    hits.push('Matched host filesystem path (/Users/, /home/, /etc/, etc.) disallowed under PUBLICATION_BOUNDARY.md');
  }
  return hits;
}

export function scrubDraftContentForHandoff(content: string): string {
  let out = content;
  for (const pat of RESTRICTED_SECRET_PATTERNS) {
    out = out.replace(new RegExp(pat.source, 'gi'), '[STRIPPED_CREDENTIAL]');
  }
  out = out.replace(new RegExp(LOCAL_HOST_PATH_REGEX.source, 'g'), '[STRIPPED_PATH]');
  return out;
}

/**
 * Deterministic journey builder producing genuine, reviewable project input files
 * aligned to the 3 documented UOR journeys (no fabricated proofs or acceptance).
 */
export function buildAuthoringWorkspaceForJourney(params: {
  journeyType?: ProjectAuthoringWorkspace['journeyType'];
  inputMode?: PrismInputMode;
  projectName: string;
  purpose: string;
  sourceRevision: string;
  guidedPrompt?: string;
}): ProjectAuthoringWorkspace {
  const now = '2026-11-15T09:00:00Z';
  const safeModName =
    params.projectName
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^[0-9]+/, '') || 'FoundryProduct';
  const slug =
    params.projectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'foundry-project';

  const journey: ProjectAuthoringWorkspace['journeyType'] =
    params.journeyType ??
    (params.inputMode === 'EXISTING_RUST'
      ? 'RUST_WORKSPACE'
      : params.inputMode === 'GUIDED_PRODUCT'
        ? 'PRISM_APPLICATION'
        : 'FORMAL_RESEARCH');

  if (journey === 'PRISM_APPLICATION') {
    const promptNote = (params.guidedPrompt || params.purpose).trim();
    const files: AuthoringSourceFile[] = [
      {
        path: 'src/Catalog.lex.tex',
        kind: 'lex_tex',
        language: 'lextex',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Authoring Studio Template (prism-devrel)',
        revisionNote: 'Initial DevRel 7-facet draft specification',
        content: `\\begin{lexlean}
\\begin{semanticmodule}{"spec":"lexlean/semantic-module/1","name":"${safeModName}"}
% Template Contract: afflom/prism-devrel @ 8af99e96 (uor/template-contract/1)
% Note: Requires explicit human review before Mac Studio PrismPM compilation.
\\purpose{${promptNote.replace(/[{}]/g, '')}}
\\facet{arch}{Deterministic capability boundary with explicit verification gates}
\\facet{features}{Seven-facet catalog inspection and typed portable views}
\\operation{evaluateSubject}{subjectId: String -> Result String}
\\theorem{constructivity_boundary}{Prop := True}
\\end{semanticmodule}
\\end{lexlean}
`,
      },
      {
        path: 'prismpm.toml',
        kind: 'prismpm_toml',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Authoring Studio Template',
        content: `[package]
schema = "prismpm/project/1"
name = "${slug}"
version = "0.1.0-draft"
template_contract = "uor/template-contract/1"
source_revision = "${params.sourceRevision}"

[build]
entry_lextex = "src/Catalog.lex.tex"
target_profile = "core-wasm+holoview+holo-v4"
locked = true

[lockfiles]
prismpm = "prismpm.lock"
lexlean = "lexlean.lock"
standards = "standards.lock"
`,
      },
      {
        path: 'lexlean.toml',
        kind: 'lexlean_toml',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Authoring Studio Template',
        content: `[project]
schema = "lexlean/project/1"
module = "${safeModName}"
lean_toolchain = "leanprover/lean4:v4.32.1"
lexlean_version = "0.4.0"

[verify]
allowed_axioms = ["propext", "Quot.sound"]
require_leanchecker = true
`,
      },
      {
        path: 'prismpm.lock',
        kind: 'lockfile',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Lock Pin Reference',
        content: `# Offline Lock Reference (uor-offline-foundry)
schema = "prismpm/sdk-lock/2"
prismpm_commit = "6c876017bffa0e770cffc2225cb2d2422c35a69a"
hologram_live_commit = "cbbf97b5b8199f5701c621cd3ba0b26187417ffa"
rust_msrv = "1.97"
`,
      },
      {
        path: 'lexlean.lock',
        kind: 'lockfile',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Lock Pin Reference',
        content: `schema = "lexlean/lock/2"
lexlean_commit = "71defb4c663aaec5b9a3aab04cbc6a03e7106227"
lean_toolchain = "leanprover/lean4:v4.32.1"
`,
      },
      {
        path: 'standards.lock',
        kind: 'lockfile',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Lock Pin Reference',
        content: `schema = "uor/standards-lock/1"
prism_devrel_commit = "8af99e96f6bd9f5865721171e582d8df6ad53166"
stitch_commit = "1607d53dfc5a34324f8102123d166d727cc66634"
`,
      },
      {
        path: 'facets/model.facets.json',
        kind: 'facets_json',
        language: 'json',
        isAuthoritativeInput: false,
        lastEditedAt: now,
        lastEditedBy: 'Authoring Studio Template',
        content: JSON.stringify(
          {
            schema: 'uor/template-contract/1',
            templateSource: 'afflom/prism-devrel@8af99e96f6bd9f5865721171e582d8df6ad53166',
            facets: [
              { id: 'arch', owner: `${safeModName}.Arch`, status: 'DRAFTED' },
              { id: 'features', owner: `${safeModName}.Features`, status: 'DRAFTED' },
              { id: 'behavior', owner: `${safeModName}.Behavior`, status: 'DRAFTED' },
              { id: 'design', owner: `${safeModName}.Design`, status: 'DRAFTED' },
              { id: 'sec', owner: `${safeModName}.Security`, status: 'DRAFTED' },
              { id: 'qual', owner: `${safeModName}.Qualification`, status: 'PENDING_MAC_STUDIO' },
              { id: 'release', owner: `${safeModName}.Release`, status: 'BLOCKED_HUMAN_SIGNOFF' },
            ],
          },
          null,
          2
        ),
      },
      {
        path: 'views/main.view.json',
        kind: 'views_json',
        language: 'json',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Authoring Studio Template',
        content: JSON.stringify(
          {
            schema: 'lean4-prod/browser-view-projection/1',
            viewId: `${slug}-main-view`,
            title: params.projectName,
            entrypoint: 'holo_run',
            inputs: [{ name: 'subjectId', type: 'String' }],
            outputs: [{ name: 'result', type: 'Result String' }],
          },
          null,
          2
        ),
      },
      {
        path: 'acceptance/vectors.json',
        kind: 'acceptance_json',
        language: 'json',
        isAuthoritativeInput: false,
        lastEditedAt: now,
        lastEditedBy: 'Authoring Studio Template',
        content: JSON.stringify(
          {
            schema: 'uor.acceptance-policy.example.v1',
            status: 'NOT_EXECUTED_IN_BROWSER',
            vectors: [
              {
                id: 'VEC-01',
                description: 'Verify import-free Core-Wasm guest holo_run determinism',
                expectedAuthority: 'PrismPM 15-gate VV + Hologram Live',
              },
              {
                id: 'VEC-02',
                description: 'Confirm Browser PP2011 profile obligations before release',
                expectedAuthority: 'Human Release Governance Authority',
              },
            ],
          },
          null,
          2
        ),
      },
    ];

    return {
      journeyType: 'PRISM_APPLICATION',
      files,
      revisionHistory: [
        {
          revisionId: 'rev-init-1',
          sourceRevision: params.sourceRevision,
          summary: 'Scaffolded Prism Application input package (prism-devrel contract)',
          timestamp: now,
          author: 'Authoring Studio',
          changedFiles: files.map((f) => f.path),
          invalidatedVerification: false,
        },
      ],
      checkpoints: [],
      pendingAiProposals: [],
      capabilitiesDeclared: ['pure-core-wasm-guest', 'holoview-browser-projection', 'offline-lock-closure'],
      acceptanceCriteria: [
        'Explicit human review of generated .lex.tex specification prior to PrismPM check',
        'Local Mac Studio execution of lexlean verify --all & prismpm verify (just vv twice)',
        'Hologram v4 HOLO\\x04\\0 container inspection & PP2011 governance sign-off',
      ],
      requiredToolchain: ['prismpm v0.5.0', 'lexlean 0.4.0', 'leanprover/lean4:v4.32.1', 'hologram-live v1.0.0'],
      expectedOutputClasses: [
        'authoritative_lex_tex',
        'model_prism_json',
        'generated_lean_proof_evidence',
        'core_wasm_module',
        'portable_view_assets',
        'physical_holo_archive',
        'build_manifests_and_digests',
      ],
      reviewStatus: 'DRAFT_UNREVIEWED',
    };
  }

  if (journey === 'RUST_WORKSPACE') {
    const files: AuthoringSourceFile[] = [
      {
        path: 'Cargo.toml',
        kind: 'cargo_toml',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'UORust Workspace Template',
        content: `[workspace]
members = ["crates/certified"]
resolver = "2"

[workspace.package]
edition = "2021"
rust-version = "1.89"
name = "${slug}"
# Browser Cargo / build.rs execution is permanently disabled.
`,
      },
      {
        path: 'Cargo.lock',
        kind: 'lockfile',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'UORust Lock Pin',
        content: `# Cargo.lock offline pin header (vendor/ required on Mac Studio)
version = 3
# Source Workspace Package: ${slug}
# Note: Cargo build evidence NEVER satisfies PrismPM verification.
`,
      },
      {
        path: 'model/routes.toml',
        kind: 'routes_toml',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'UORust Route Contract (afflom/UORust @ 5868afe3)',
        content: `# afflom/UORust Route Table (R1..R6 non-defaulting span rules)
schema = "uorust/routes/1"
strict_refusals = ["UE-03", "UE-06"]

[[route]]
rust_path = "crates/certified/src/lib.rs::compute"
prism_target = "${safeModName}.Core.compute"
allow_unsafe_extern = false
`,
      },
      {
        path: 'lexlean.toml',
        kind: 'lexlean_toml',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'UORust Projection Target',
        content: `[project]
schema = "lexlean/project/1"
module = "${safeModName}Projection"
lean_toolchain = "leanprover/lean4:v4.32.1"
`,
      },
      {
        path: 'prismpm.lock',
        kind: 'lockfile',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Lock Pin Reference',
        content: `schema = "prismpm/sdk-lock/2"
uorust_commit = "5868afe38012d647be00ad948949b1e384b87211"
prismpm_commit = "6c876017bffa0e770cffc2225cb2d2422c35a69a"
`,
      },
      {
        path: 'lexlean.lock',
        kind: 'lockfile',
        language: 'toml',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Lock Pin Reference',
        content: `schema = "lexlean/lock/2"
lexlean_commit = "71defb4c663aaec5b9a3aab04cbc6a03e7106227"
lean_toolchain = "leanprover/lean4:v4.32.1"
`,
      },
      {
        path: 'crates/certified/src/lib.rs',
        kind: 'cargo_toml',
        language: 'rust',
        isAuthoritativeInput: true,
        lastEditedAt: now,
        lastEditedBy: 'Rust Source Draft',
        content: `//! Certified Cargo projection candidate (Pure subset only).
//! Any \`unsafe extern\` block triggers non-defaulting UorustError (UE-03 / UE-06).

pub fn compute(a: i64, b: i64) -> i64 {
    a.saturating_add(b)
}
`,
      },
      {
        path: 'acceptance/refusals.json',
        kind: 'acceptance_json',
        language: 'json',
        isAuthoritativeInput: false,
        lastEditedAt: now,
        lastEditedBy: 'UORust Contract',
        content: JSON.stringify(
          {
            schema: 'uorust/refusal-policy/1',
            enforcedRefusalCodes: ['UNSUPPORTED_RUST_ITEM', 'AMBIGUOUS_ROUTE', 'UNKNOWN_FACT'],
            cargoEquatesToPrismVerification: false,
            targetWindmillFlow: 'f/uor_foundry/uorust_model_workspace',
          },
          null,
          2
        ),
      },
    ];

    return {
      journeyType: 'RUST_WORKSPACE',
      files,
      revisionHistory: [
        {
          revisionId: 'rev-init-rust-1',
          sourceRevision: params.sourceRevision,
          summary: 'Scaffolded Existing Rust Workspace projection inputs (afflom/UORust contract)',
          timestamp: now,
          author: 'Authoring Studio',
          changedFiles: files.map((f) => f.path),
          invalidatedVerification: false,
        },
      ],
      checkpoints: [],
      pendingAiProposals: [],
      capabilitiesDeclared: ['uorust-cargo-ast-projection', 'typed-span-refusals', 'separate-cargo-evidence'],
      acceptanceCriteria: [
        'Run `uorust project <ws> --out .prism/projection` on Mac Studio under Cargo.lock',
        'Verify zero open UNSUPPORTED_RUST_ITEM / UE-03 / UE-06 span refusals',
        'Run independent LexLean & PrismPM verification (Cargo build never substitutes)',
      ],
      requiredToolchain: ['uorust @ 5868afe3', 'cargo --locked --offline', 'prismpm v0.5.0', 'lexlean 0.4.0'],
      expectedOutputClasses: [
        'model_prism_json',
        'generated_cargo_package',
        'generated_lean_proof_evidence',
        'build_manifests_and_digests',
      ],
      reviewStatus: 'DRAFT_UNREVIEWED',
    };
  }

  // FORMAL_RESEARCH (LexLean + afflom/rule30 claim frontier)
  const files: AuthoringSourceFile[] = [
    {
      path: 'src/Main.lex.tex',
      kind: 'lex_tex',
      language: 'lextex',
      isAuthoritativeInput: true,
      lastEditedAt: now,
      lastEditedBy: 'Formal Research Template (LexLean + Rule30)',
      revisionNote: 'Constructive Lean 4.32.1 specification with explicit open claims preserved',
      content: `\\begin{lexlean}
\\begin{semanticmodule}{"spec":"lexlean/semantic-module/1","name":"${safeModName}Frontier"}
% Constructive Axiom Boundary (afflom/rule30 @ e3be477f): {propext, Quot.sound} only.
% Rule 30 Prize Problem 1 remains OPEN/UNTESTED — never claim solution without local leanchecker proof.
\\purpose{${params.purpose.replace(/[{}]/g, '')}}
\\theorem{finite_step_determinism}{Prop := True}
\\conjecture{prize_problem_1_aperiodic}{OPEN := True}
\\end{semanticmodule}
\\end{lexlean}
`,
    },
    {
      path: 'frontier.toml',
      kind: 'frontier_toml',
      language: 'toml',
      isAuthoritativeInput: true,
      lastEditedAt: now,
      lastEditedBy: 'Rule30 Claim Frontier Template',
      content: `[frontier]
schema = "rule30/claim-register/1"
project = "${slug}"
source_revision = "${params.sourceRevision}"
constructivity_gate = ["propext", "Quot.sound"]

[[claims]]
id = "problem1"
state = "untested"
note = "Open conjecture; never marked proved without independent leanchecker replay."

[[claims]]
id = "aperiodic-compensation"
state = "blocked"
note = "Requires local Lean 4.32.1 #print axioms audit."
`,
    },
    {
      path: 'lexlean.toml',
      kind: 'lexlean_toml',
      language: 'toml',
      isAuthoritativeInput: true,
      lastEditedAt: now,
      lastEditedBy: 'LexLean Config',
      content: `[project]
schema = "lexlean/project/1"
module = "${safeModName}Frontier"
lean_toolchain = "leanprover/lean4:v4.32.1"
lexlean_commit = "71defb4c663aaec5b9a3aab04cbc6a03e7106227"

[audit]
forbid_classical_choice = true
forbid_sorry_ax = true
`,
    },
    {
      path: 'prismpm.lock',
      kind: 'lockfile',
      language: 'toml',
      isAuthoritativeInput: true,
      lastEditedAt: now,
      lastEditedBy: 'Lock Pin Reference',
      content: `schema = "prismpm/sdk-lock/2"
prismpm_commit = "6c876017bffa0e770cffc2225cb2d2422c35a69a"
`,
    },
    {
      path: 'lexlean.lock',
      kind: 'lockfile',
      language: 'toml',
      isAuthoritativeInput: true,
      lastEditedAt: now,
      lastEditedBy: 'Lock Pin Reference',
      content: `schema = "lexlean/lock/2"
lexlean_commit = "71defb4c663aaec5b9a3aab04cbc6a03e7106227"
lean_toolchain = "leanprover/lean4:v4.32.1"
rule30_commit = "e3be477fded263029479127363f7fb6a3597e7d4"
`,
    },
    {
      path: 'standards.lock',
      kind: 'lockfile',
      language: 'toml',
      isAuthoritativeInput: true,
      lastEditedAt: now,
      lastEditedBy: 'Lock Pin Reference',
      content: `schema = "uor/standards-lock/1"
stitch_commit = "1607d53dfc5a34324f8102123d166d727cc66634"
foundry_commit = "760eaac29687628c7c66e8d492e126afa194656e"
`,
    },
    {
      path: 'acceptance/claim-register.json',
      kind: 'acceptance_json',
      language: 'json',
      isAuthoritativeInput: false,
      lastEditedAt: now,
      lastEditedBy: 'Rule30 Register Template',
      content: JSON.stringify(
        {
          schema: 'rule30/claim-register/1',
          epistemicNote: 'check and build never prove theorems; open conjectures must stay untested/blocked.',
          claims: [
            { id: 'finite_step_determinism', state: 'built', requiresAxiomAudit: true },
            { id: 'problem1', state: 'untested', blocker: 'Open mathematical problem' },
          ],
        },
        null,
        2
      ),
    },
  ];

  return {
    journeyType: 'FORMAL_RESEARCH',
    files,
    revisionHistory: [
      {
        revisionId: 'rev-init-research-1',
        sourceRevision: params.sourceRevision,
        summary: 'Scaffolded Formal Research claim register & LexLean source inputs',
        timestamp: now,
        author: 'Authoring Studio',
        changedFiles: files.map((f) => f.path),
        invalidatedVerification: false,
      },
    ],
    checkpoints: [],
    pendingAiProposals: [],
    capabilitiesDeclared: ['constructive-lean4-audit', 'claim-frontier-separation', 'deterministic-sha256-observations'],
    acceptanceCriteria: [
      'Execute `lexlean check --all` & `lexlean verify --all` via Mac Studio leanchecker container',
      'Audit #print axioms strictly within {propext, Quot.sound}',
      'Preserve non-conflation of proved lemmas vs open Prize Problem 1 claims',
    ],
    requiredToolchain: ['lexlean 0.4.0', 'leanprover/lean4:v4.32.1', 'rule30 @ e3be477f', 'stitch @ 1607d53d'],
    expectedOutputClasses: [
      'authoritative_lex_tex',
      'generated_lean_proof_evidence',
      'lcnf_outputs',
      'build_manifests_and_digests',
    ],
    reviewStatus: 'DRAFT_UNREVIEWED',
  };
}

/**
 * Ensures any project always has a usable authoring workspace initialized cleanly on demand.
 */
export function ensureProjectAuthoringWorkspace(project: ProjectRecord): ProjectAuthoringWorkspace {
  if (project.authoringWorkspace && project.authoringWorkspace.files.length > 0) {
    return project.authoringWorkspace;
  }
  const journeyType: ProjectAuthoringWorkspace['journeyType'] =
    project.inputMode === 'EXISTING_RUST'
      ? 'RUST_WORKSPACE'
      : project.inputMode === 'GUIDED_PRODUCT'
        ? 'PRISM_APPLICATION'
        : 'FORMAL_RESEARCH';
  return buildAuthoringWorkspaceForJourney({
    journeyType,
    inputMode: project.inputMode,
    projectName: project.name,
    purpose: project.purpose,
    sourceRevision: project.sourceRevision,
    guidedPrompt: project.guidedProductDraft?.prompt,
  });
}

/**
 * Runs explicitly preliminary browser-only structural & syntax diagnostics.
 * Never replaces `lexlean check`, `lexlean verify`, or `prismpm check`.
 */
export function runPreliminaryBrowserDiagnostics(
  files: AuthoringSourceFile[],
  inputMode: PrismInputMode = 'NATIVE_PRISM'
): PreliminarySourceDiagnostic[] {
  const diags: PreliminarySourceDiagnostic[] = [];

  const filePaths = new Set(files.map((f) => f.path.toLowerCase()));
  const requiredLocks =
    inputMode === 'EXISTING_RUST'
      ? ['cargo.lock', 'prismpm.lock', 'lexlean.lock']
      : ['prismpm.lock', 'lexlean.lock', 'standards.lock'];

  for (const lockName of requiredLocks) {
    if (!Array.from(filePaths).some((p) => p.endsWith(lockName))) {
      diags.push({
        id: `diag-missing-lock-${lockName}`,
        filePath: lockName,
        line: 1,
        severity: 'warning',
        code: 'PRELIM_LOCK_MISSING',
        message: `Preliminary check: expected lockfile "${lockName}" not yet present in authored package (Mac Studio LOCK stage requires pinned lockfiles).`,
        isPreliminaryBrowserCheck: true,
      });
    }
  }

  for (const file of files) {
    const pathCheck = validateDraftFilePath(file.path);
    if (!pathCheck.ok) {
      diags.push({
        id: `diag-path-${file.path}`,
        filePath: file.path,
        line: 1,
        severity: 'error',
        code: 'PRELIM_UNSAFE_PATH',
        message: pathCheck.error,
        isPreliminaryBrowserCheck: true,
      });
    }

    const secretHits = detectRestrictedSecretsInText(file.content);
    secretHits.forEach((hit, idx) => {
      diags.push({
        id: `diag-sec-${file.path}-${idx}`,
        filePath: file.path,
        line: 1,
        severity: 'error',
        code: 'PRELIM_RESTRICTED_CONTENT',
        message: `PUBLICATION_BOUNDARY.md violation: ${hit}. Strip restricted values before handoff.`,
        isPreliminaryBrowserCheck: true,
      });
    });

    if (file.language === 'lextex') {
      if (!file.content.includes('\\begin{lexlean}') || !file.content.includes('\\end{lexlean}')) {
        diags.push({
          id: `diag-lextex-env-${file.path}`,
          filePath: file.path,
          line: 1,
          severity: 'error',
          code: 'PRELIM_LEXTEX_ENVELOPE',
          message: 'Preliminary check: `.lex.tex` draft is missing paired `\\begin{lexlean}` / `\\end{lexlean}` tags.',
          isPreliminaryBrowserCheck: true,
        });
      }
      const lines = file.content.split('\n');
      lines.forEach((ln, i) => {
        if (/\bsorry\b|\badmit\b|Classical\.choice/.test(ln) && !ln.trim().startsWith('%')) {
          diags.push({
            id: `diag-lextex-axiom-${file.path}-${i}`,
            filePath: file.path,
            line: i + 1,
            severity: 'error',
            code: 'PRELIM_NON_CONSTRUCTIVE',
            message: 'Preliminary check: `sorry`, `admit`, or `Classical.choice` violates constructive {propext, Quot.sound} gate.',
            isPreliminaryBrowserCheck: true,
          });
        }
      });
    } else if (file.language === 'json') {
      try {
        JSON.parse(file.content);
      } catch (err) {
        diags.push({
          id: `diag-json-${file.path}`,
          filePath: file.path,
          line: 1,
          severity: 'error',
          code: 'PRELIM_JSON_SYNTAX',
          message: `Preliminary JSON parse error: ${err instanceof Error ? err.message : 'invalid JSON'}.`,
          isPreliminaryBrowserCheck: true,
        });
      }
    } else if (file.language === 'toml') {
      if (!file.content.trim()) {
        diags.push({
          id: `diag-toml-empty-${file.path}`,
          filePath: file.path,
          line: 1,
          severity: 'warning',
          code: 'PRELIM_EMPTY_FILE',
          message: 'Preliminary check: TOML configuration file is empty.',
          isPreliminaryBrowserCheck: true,
        });
      }
    } else if (file.language === 'rust') {
      const lines = file.content.split('\n');
      lines.forEach((ln, i) => {
        if (/unsafe\s+extern\b/.test(ln) && !ln.trim().startsWith('//')) {
          diags.push({
            id: `diag-rust-ffi-${file.path}-${i}`,
            filePath: file.path,
            line: i + 1,
            severity: 'warning',
            code: 'PRELIM_UORUST_UE03',
            message: 'Preliminary warning: `unsafe extern` FFI item will trigger non-defaulting UorustError refusal (UE-03/UE-06) unless mapped.',
            isPreliminaryBrowserCheck: true,
          });
        }
      });
    }
  }

  return diags;
}

/**
 * Computes line-by-line side-by-side diff rows for inspection in the editor & review panels.
 */
export function computeSideBySideDiff(beforeText: string, afterText: string): SourceDiffRow[] {
  const beforeLines = beforeText.split('\n');
  const afterLines = afterText.split('\n');
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const rows: SourceDiffRow[] = [];

  for (let i = 0; i < maxLen; i++) {
    const b = i < beforeLines.length ? beforeLines[i] : undefined;
    const a = i < afterLines.length ? afterLines[i] : undefined;
    if (b !== undefined && a !== undefined && b === a) {
      rows.push({
        lineBefore: i + 1,
        lineAfter: i + 1,
        kind: 'equal',
        textBefore: b,
        textAfter: a,
      });
    } else if (b === undefined && a !== undefined) {
      rows.push({
        lineBefore: null,
        lineAfter: i + 1,
        kind: 'add',
        textBefore: '',
        textAfter: a,
      });
    } else if (b !== undefined && a === undefined) {
      rows.push({
        lineBefore: i + 1,
        lineAfter: null,
        kind: 'remove',
        textBefore: b,
        textAfter: '',
      });
    } else {
      rows.push({
        lineBefore: i + 1,
        lineAfter: i + 1,
        kind: 'change',
        textBefore: b ?? '',
        textAfter: a ?? '',
      });
    }
  }

  return rows;
}

/**
 * Deterministic safe tokenizer rendering plain React spans (never dangerouslySetInnerHTML).
 */
export function tokenizeSourceLine(line: string, language: AuthoringSyntaxLanguage): SyntaxToken[] {
  if (!line) return [{ text: ' ', tone: 'plain' }];
  const trimmed = line.trimStart();

  if (language === 'lextex') {
    if (trimmed.startsWith('%')) return [{ text: line, tone: 'comment' }];
    const tokens: SyntaxToken[] = [];
    const regex = /(\\[a-zA-Z]+|\{[^}]*\}|"[^"]*")/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ text: line.slice(lastIndex, match.index), tone: 'plain' });
      }
      const val = match[0];
      if (val.startsWith('\\begin') || val.startsWith('\\end')) {
        tokens.push({ text: val, tone: 'keyword' });
      } else if (val.startsWith('\\')) {
        tokens.push({ text: val, tone: 'directive' });
      } else if (val.startsWith('"')) {
        tokens.push({ text: val, tone: 'string' });
      } else {
        tokens.push({ text: val, tone: 'section' });
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      tokens.push({ text: line.slice(lastIndex), tone: 'plain' });
    }
    return tokens;
  }

  if (language === 'toml') {
    if (trimmed.startsWith('#')) return [{ text: line, tone: 'comment' }];
    if (/^\s*\[/.test(line)) return [{ text: line, tone: 'section' }];
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const keyPart = line.slice(0, eqIdx + 1);
      const valPart = line.slice(eqIdx + 1);
      return [
        { text: keyPart, tone: 'key' },
        {
          text: valPart,
          tone: /"/.test(valPart) ? 'string' : /\b(true|false|\d+)\b/.test(valPart) ? 'number' : 'plain',
        },
      ];
    }
    return [{ text: line, tone: 'plain' }];
  }

  if (language === 'json') {
    const tokens: SyntaxToken[] = [];
    const regex = /("(?:\\.|[^"])*"\s*:|"(?:\\.|[^"])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ text: line.slice(lastIndex, match.index), tone: 'plain' });
      }
      const val = match[0];
      if (val.endsWith(':')) {
        tokens.push({ text: val, tone: 'key' });
      } else if (val.startsWith('"')) {
        tokens.push({ text: val, tone: 'string' });
      } else {
        tokens.push({ text: val, tone: 'number' });
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      tokens.push({ text: line.slice(lastIndex), tone: 'plain' });
    }
    return tokens;
  }

  // Rust
  if (trimmed.startsWith('//')) return [{ text: line, tone: 'comment' }];
  return [{ text: line, tone: /\b(pub|fn|struct|enum|impl|unsafe|extern|let|mut)\b/.test(line) ? 'keyword' : 'plain' }];
}

/**
 * Generates an explicit non-authoritative AI draft edit proposal on an authored source file.
 * Proposals always start at `PENDING_REVIEW` and require explicit operator approval.
 */
export function createSimulatedAiSourceProposal(params: {
  targetFile: AuthoringSourceFile;
  instruction: string;
}): AiSourceProposal {
  const now = new Date().toISOString();
  const cleanNote = params.instruction.trim().replace(/[\r\n]/g, ' ').slice(0, 120);
  let nextContent = params.targetFile.content;

  if (params.targetFile.language === 'lextex') {
    const marker = '\\end{semanticmodule}';
    const addition = `% AI Draft Proposal: ${cleanNote}\n\\requirement{draft_req}{${cleanNote.replace(/[{}]/g, '')}}`;
    nextContent = params.targetFile.content.includes(marker)
      ? params.targetFile.content.replace(marker, `${addition}\n${marker}`)
      : `${params.targetFile.content}\n${addition}\n`;
  } else if (params.targetFile.language === 'toml') {
    nextContent = `${params.targetFile.content.trimEnd()}\n# AI Draft Proposal: ${cleanNote}\n`;
  } else if (params.targetFile.language === 'json') {
    try {
      const parsed = JSON.parse(params.targetFile.content) as Record<string, unknown>;
      parsed.draftOperatorNote = cleanNote;
      nextContent = JSON.stringify(parsed, null, 2);
    } catch {
      nextContent = `${params.targetFile.content}\n// AI Draft Proposal: ${cleanNote}`;
    }
  } else {
    nextContent = `// AI Draft Proposal: ${cleanNote}\n${params.targetFile.content}`;
  }

  return {
    id: `ai-src-prop-${Date.now()}`,
    targetFilePath: params.targetFile.path,
    summary: `Propose draft edit to ${params.targetFile.path}`,
    rationale: `Simulated AI source proposal triggered from instruction: "${cleanNote}".`,
    proposedContent: nextContent,
    status: 'PENDING_REVIEW',
    createdAt: now,
    isSimulated: true,
    authorityNote:
      'Simulated AI source draft only. Does not modify files until explicitly approved, invalidates any prior PASS evidence (INV-003), and does not run Lean/PrismPM compilation.',
  };
}

/**
 * Deterministic checkpoint hash for source file snapshots.
 */
export async function createAuthoringCheckpoint(params: {
  projectId: string;
  name: string;
  sourceRevision: string;
  files: AuthoringSourceFile[];
}): Promise<SourceFileCheckpoint> {
  const canonicalPayload = JSON.stringify(
    params.files
      .map((f) => ({ path: f.path, content: f.content }))
      .sort((a, b) => a.path.localeCompare(b.path))
  );
  const stateSha256 = await computeSha256Hex(new TextEncoder().encode(canonicalPayload));
  return {
    id: `src-cp-${Date.now()}`,
    projectId: params.projectId,
    name: params.name.trim() || 'Source Checkpoint',
    createdAt: new Date().toISOString(),
    sourceRevision: params.sourceRevision,
    filesSnapshot: params.files.map((f) => ({ ...f })),
    stateSha256,
  };
}

function canonicalPackageManifestBody(
  manifest: Omit<FoundrySourcePackageManifest, 'packageDigestSha256'>
): string {
  return JSON.stringify({
    schema: manifest.schema,
    packageId: manifest.packageId,
    packageClassification: manifest.packageClassification,
    isHoloArchive: manifest.isHoloArchive,
    isCompilerGeneratedOutput: manifest.isCompilerGeneratedOutput,
    projectId: manifest.projectId,
    projectName: manifest.projectName,
    productFamily: manifest.productFamily,
    inputMode: manifest.inputMode,
    journeyType: manifest.journeyType,
    sourceRevision: manifest.sourceRevision,
    createdAt: manifest.createdAt,
    exportedBy: manifest.exportedBy,
    targetDestination: manifest.targetDestination,
    targetWindmillWorkspace: manifest.targetWindmillWorkspace,
    reviewConfirmed: manifest.reviewConfirmed,
    reviewSummary: manifest.reviewSummary,
    reviewStatus: manifest.reviewStatus,
    lockfileRefs: manifest.lockfileRefs,
    requiredToolchain: manifest.requiredToolchain,
    inputHashes: manifest.inputHashes,
    capabilitiesAndPermissions: manifest.capabilitiesAndPermissions,
    acceptanceCriteria: manifest.acceptanceCriteria,
    expectedOutputClasses: manifest.expectedOutputClasses,
    files: manifest.files,
  });
}

/**
 * Builds a complete, versioned Foundry source-package manifest (`uor.foundry.source-package.v1`)
 * containing real authored draft source files, lockfile references, SHA-256 input hashes,
 * capabilities, acceptance criteria, and review metadata — explicitly distinct from `.holo`.
 */
export async function buildSourcePackageManifest(params: {
  project: ProjectRecord;
  workspace: ProjectAuthoringWorkspace;
  reviewConfirmed: boolean;
  reviewSummary: string;
  targetDestination: SourcePackageDestination;
  exportedBy?: string;
}): Promise<FoundrySourcePackageManifest> {
  if (!params.reviewConfirmed) {
    throw new Error(
      'Fail-closed export refusal: explicit operator review of files, classification, and destination is required before exporting a Foundry source package.'
    );
  }

  if (
    params.targetDestination !== 'MAC_STUDIO_UOR_OFFLINE_FOUNDRY' &&
    params.targetDestination !== 'AIR_GAPPED_PHYSICAL_MEDIA'
  ) {
    throw new Error(`Unsupported source-package export destination: ${params.targetDestination}`);
  }

  const encoder = new TextEncoder();
  const entries: FoundrySourcePackageFileEntry[] = [];
  const inputHashes: Record<string, string> = {};

  for (const file of params.workspace.files) {
    const pathCheck = validateDraftFilePath(file.path);
    if (!pathCheck.ok) {
      throw new Error(pathCheck.error);
    }
    const sanitizedContent = scrubDraftContentForHandoff(file.content);
    const bytes = encoder.encode(sanitizedContent);
    const sha256 = await computeSha256Hex(bytes);
    inputHashes[pathCheck.cleanPath] = sha256;
    entries.push({
      path: pathCheck.cleanPath,
      kind: file.kind,
      language: file.language,
      content: sanitizedContent,
      sha256,
      byteLength: bytes.byteLength,
      isAuthoritativeInput: file.isAuthoritativeInput,
    });
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));

  const createdAt = new Date().toISOString();
  const baseBody: Omit<FoundrySourcePackageManifest, 'packageDigestSha256'> = {
    schema: SOURCE_PACKAGE_SCHEMA,
    packageId: `srcpkg-${params.project.id}-${createdAt.slice(0, 10)}`,
    packageClassification: 'UNVERIFIED_AUTHORED_SOURCE_PACKAGE',
    isHoloArchive: false,
    isCompilerGeneratedOutput: false,
    projectId: scrubSensitiveExportText(params.project.id, 64),
    projectName: scrubSensitiveExportText(params.project.name, 96),
    productFamily: params.project.productFamily,
    inputMode: params.project.inputMode ?? 'NATIVE_PRISM',
    journeyType: params.workspace.journeyType,
    sourceRevision: scrubSensitiveExportText(params.project.sourceRevision, 96),
    createdAt,
    exportedBy: scrubSensitiveExportText(params.exportedBy ?? 'Foundry Operator', 64),
    targetDestination: params.targetDestination,
    targetWindmillWorkspace: 'uor-offline-foundry',
    reviewConfirmed: true,
    reviewSummary:
      scrubSensitiveExportText(params.reviewSummary, 200) ||
      `Operator reviewed ${entries.length} authored input files for handoff to ${params.targetDestination}.`,
    reviewStatus: 'OPERATOR_REVIEWED_FOR_HANDOFF',
    lockfileRefs: entries.filter((f) => f.kind === 'lockfile').map((f) => f.path),
    requiredToolchain: [...params.workspace.requiredToolchain],
    inputHashes,
    capabilitiesAndPermissions: [...params.workspace.capabilitiesDeclared],
    acceptanceCriteria: [...params.workspace.acceptanceCriteria],
    expectedOutputClasses: [...params.workspace.expectedOutputClasses],
    files: entries,
    securityDisclaimer:
      'Authored source package only (NOT a compiled .holo archive, NOT formally verified, and zero local credentials/chat logs included). Must be verified locally in uor-offline-foundry.',
  };

  const packageDigestSha256 = await computeSha256Hex(
    encoder.encode(canonicalPackageManifestBody(baseBody))
  );

  return {
    ...baseBody,
    packageDigestSha256,
  };
}

/**
 * Round-trip parser and tamper detector for `uor.foundry.source-package.v1` handoff packages.
 */
export async function parseAndVerifySourcePackage(rawJson: string): Promise<
  | {
      ok: true;
      manifest: FoundrySourcePackageManifest;
      verifiedFileCount: number;
      authoringWorkspace: ProjectAuthoringWorkspace;
    }
  | {
      ok: false;
      errorCode: 'INVALID_JSON' | 'INVALID_SCHEMA' | 'PATH_TRAVERSAL_REFUSED' | 'TAMPER_DETECTED' | 'UNREVIEWED_EXPORT' | 'HOLO_MISLABEL_REFUSED';
      error: string;
    }
> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, errorCode: 'INVALID_JSON', error: 'Source package payload is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errorCode: 'INVALID_SCHEMA', error: 'Source package must be a JSON object.' };
  }

  const obj = parsed as Partial<FoundrySourcePackageManifest> & Record<string, unknown>;
  if (obj.schema !== SOURCE_PACKAGE_SCHEMA) {
    return {
      ok: false,
      errorCode: 'INVALID_SCHEMA',
      error: `Unsupported source package schema "${String(obj.schema ?? 'MISSING')}". Expected "${SOURCE_PACKAGE_SCHEMA}".`,
    };
  }

  if (obj.isHoloArchive !== false || obj.packageClassification !== 'UNVERIFIED_AUTHORED_SOURCE_PACKAGE') {
    return {
      ok: false,
      errorCode: 'HOLO_MISLABEL_REFUSED',
      error: 'Refused: source package cannot declare itself as a compiled .holo archive or verified binary output.',
    };
  }

  if (obj.reviewConfirmed !== true) {
    return {
      ok: false,
      errorCode: 'UNREVIEWED_EXPORT',
      error: 'Refused unreviewed source package (reviewConfirmed must be true).',
    };
  }

  if (!Array.isArray(obj.files) || obj.files.length === 0) {
    return { ok: false, errorCode: 'INVALID_SCHEMA', error: 'Source package contains zero files.' };
  }

  const encoder = new TextEncoder();
  const rebuiltFiles: FoundrySourcePackageFileEntry[] = [];
  for (const rawFile of obj.files) {
    if (!rawFile || typeof rawFile !== 'object') {
      return { ok: false, errorCode: 'INVALID_SCHEMA', error: 'Malformed file entry in source package.' };
    }
    const pathCheck = validateDraftFilePath(String(rawFile.path ?? ''));
    if (!pathCheck.ok) {
      return { ok: false, errorCode: 'PATH_TRAVERSAL_REFUSED', error: pathCheck.error };
    }
    const content = typeof rawFile.content === 'string' ? rawFile.content : '';
    const actualSha = await computeSha256Hex(encoder.encode(content));
    const manifestHash = obj.inputHashes?.[pathCheck.cleanPath];
    if (actualSha !== rawFile.sha256 || (manifestHash && manifestHash !== actualSha)) {
      return {
        ok: false,
        errorCode: 'TAMPER_DETECTED',
        error: `Digest mismatch (tampering or corruption detected) for file "${pathCheck.cleanPath}".`,
      };
    }
    rebuiltFiles.push(rawFile as FoundrySourcePackageFileEntry);
  }

  const manifestNoDigest: Omit<FoundrySourcePackageManifest, 'packageDigestSha256'> = {
    schema: obj.schema,
    packageId: String(obj.packageId ?? ''),
    packageClassification: obj.packageClassification,
    isHoloArchive: false,
    isCompilerGeneratedOutput: false,
    projectId: String(obj.projectId ?? ''),
    projectName: String(obj.projectName ?? ''),
    productFamily: (obj.productFamily as ProductFamily) ?? 'application',
    inputMode: (obj.inputMode as PrismInputMode) ?? 'NATIVE_PRISM',
    journeyType: obj.journeyType ?? 'PRISM_APPLICATION',
    sourceRevision: String(obj.sourceRevision ?? ''),
    createdAt: String(obj.createdAt ?? ''),
    exportedBy: String(obj.exportedBy ?? ''),
    targetDestination: (obj.targetDestination as SourcePackageDestination) ?? 'MAC_STUDIO_UOR_OFFLINE_FOUNDRY',
    targetWindmillWorkspace: 'uor-offline-foundry',
    reviewConfirmed: true,
    reviewSummary: String(obj.reviewSummary ?? ''),
    reviewStatus: obj.reviewStatus ?? 'OPERATOR_REVIEWED_FOR_HANDOFF',
    lockfileRefs: Array.isArray(obj.lockfileRefs) ? obj.lockfileRefs : [],
    requiredToolchain: Array.isArray(obj.requiredToolchain) ? obj.requiredToolchain : [],
    inputHashes: obj.inputHashes ?? {},
    capabilitiesAndPermissions: Array.isArray(obj.capabilitiesAndPermissions)
      ? obj.capabilitiesAndPermissions
      : [],
    acceptanceCriteria: Array.isArray(obj.acceptanceCriteria) ? obj.acceptanceCriteria : [],
    expectedOutputClasses: Array.isArray(obj.expectedOutputClasses) ? obj.expectedOutputClasses : [],
    files: rebuiltFiles,
    securityDisclaimer: String(obj.securityDisclaimer ?? ''),
  };

  const expectedPkgSha = await computeSha256Hex(
    encoder.encode(canonicalPackageManifestBody(manifestNoDigest))
  );
  if (expectedPkgSha !== obj.packageDigestSha256) {
    return {
      ok: false,
      errorCode: 'TAMPER_DETECTED',
      error: `Source package top-level digest mismatch: expected ${expectedPkgSha.slice(0, 12)}, got ${String(obj.packageDigestSha256 ?? '').slice(0, 12)}.`,
    };
  }

  const authoringWorkspace: ProjectAuthoringWorkspace = {
    journeyType: manifestNoDigest.journeyType,
    files: rebuiltFiles.map((f) => ({
      path: f.path,
      kind: f.kind,
      language: f.language,
      content: f.content,
      sha256: f.sha256,
      lastEditedAt: manifestNoDigest.createdAt,
      lastEditedBy: manifestNoDigest.exportedBy,
      isAuthoritativeInput: f.isAuthoritativeInput,
    })),
    revisionHistory: [
      {
        revisionId: `rev-import-${Date.now()}`,
        sourceRevision: manifestNoDigest.sourceRevision,
        summary: `Verified round-trip readback of ${manifestNoDigest.packageId}`,
        timestamp: new Date().toISOString(),
        author: manifestNoDigest.exportedBy,
        changedFiles: rebuiltFiles.map((f) => f.path),
        invalidatedVerification: false,
      },
    ],
    checkpoints: [],
    pendingAiProposals: [],
    capabilitiesDeclared: manifestNoDigest.capabilitiesAndPermissions,
    acceptanceCriteria: manifestNoDigest.acceptanceCriteria,
    requiredToolchain: manifestNoDigest.requiredToolchain,
    expectedOutputClasses: manifestNoDigest.expectedOutputClasses,
    reviewStatus: 'OPERATOR_REVIEWED_FOR_HANDOFF',
    lastReviewedAt: manifestNoDigest.createdAt,
  };

  return {
    ok: true,
    manifest: {
      ...manifestNoDigest,
      packageDigestSha256: expectedPkgSha,
    },
    verifiedFileCount: rebuiltFiles.length,
    authoringWorkspace,
  };
}

export function downloadSourcePackage(manifest: FoundrySourcePackageManifest): string {
  const safeSlug =
    manifest.projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'foundry-source';
  // Enforce extension that can NEVER be confused with compiled .holo archives
  const filename = `${safeSlug}-source-package.uor-src.json`;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  return filename;
}

export function buildStructuredInputManifestPreview(params: {
  projectName: string;
  inputMode: PrismInputMode;
  productFamily: ProductFamily;
  sourceRevision: string;
  purpose: string;
  guidedPrompt?: string;
}): {
  journeyLabel: string;
  contractSource: string;
  initialFiles: string[];
  lockfileRefs: string[];
  expectedOutputClasses: PrismOutputClassId[];
  fabricatedProofWarning: string;
} {
  const ws = buildAuthoringWorkspaceForJourney({
    inputMode: params.inputMode,
    projectName: params.projectName || 'DraftProject',
    purpose: params.purpose || 'Draft purpose',
    sourceRevision: params.sourceRevision || 'draft/rev@0.1.0',
    guidedPrompt: params.guidedPrompt,
  });

  const journeyLabel =
    ws.journeyType === 'PRISM_APPLICATION'
      ? 'Journey A · New Prism Application (Prism-DevRel Contract)'
      : ws.journeyType === 'RUST_WORKSPACE'
        ? 'Journey B · Existing Rust Workspace (UORust Projection)'
        : 'Journey C · Formal Research Project (LexLean + Rule30 Frontier)';

  const contractSource =
    ws.journeyType === 'PRISM_APPLICATION'
      ? 'afflom/prism-devrel @ 8af99e96 (uor/template-contract/1)'
      : ws.journeyType === 'RUST_WORKSPACE'
        ? 'afflom/UORust @ 5868afe3 (uorust/routes/1)'
        : 'UOR-Foundation/LexLean @ 71defb4c + afflom/rule30 @ e3be477f';

  return {
    journeyLabel,
    contractSource,
    initialFiles: ws.files.map((f) => f.path),
    lockfileRefs: ws.files.filter((f) => f.kind === 'lockfile').map((f) => f.path),
    expectedOutputClasses: ws.expectedOutputClasses,
    fabricatedProofWarning:
      'Produces editable draft inputs only. Zero formal theorem proofs, binary .holo builds, or release approvals are fabricated.',
  };
}
