import { CANONICAL_TOOLCHAIN_PIN_MAP } from '../data/toolchainPinManifest';
import { WorkflowStageContractName, WorkflowStageId } from '../types/foundry';

/**
 * Canonical Windmill Command, Stage, Permission & Argument Registry.
 *
 * SINGLE SOURCE OF TRUTH:
 * - Used by `scripts/prepare-windmill-app.mjs` to generate:
 *   1) `uor_foundry.raw_app/backend/generated_command_registry.ts`
 *   2) `uor_foundry.raw_app/flows/prism_hologram_delivery.flow.json`
 * - Enforces real upstream CLI syntax pinned in `toolchainPinManifest.ts`.
 * - Rejects arbitrary shell strings, chat prompts, path traversal, or non-`uor-offline-foundry` workspaces.
 */
export const ALLOWED_WINDMILL_WORKSPACE = 'uor-offline-foundry' as const;

export type CanonicalCommandId =
  | 'prism_intake_validate'
  | 'prism_specify_validate'
  | 'prism_lock_check'
  | 'lexlean_check'
  | 'prismpm_check'
  | 'lexlean_build'
  | 'prismpm_build_locked'
  | 'lexlean_verify'
  | 'prismpm_verify'
  | 'hologram_inspect'
  | 'hologram_verify'
  | 'hologram_plan'
  | 'hologram_run'
  | 'prism_review_qualify'
  | 'prismpm_export_browser'
  | 'uorust_project';

export interface FixedRegistryEntry {
  commandId: CanonicalCommandId;
  stageId: WorkflowStageId;
  stageContractName: WorkflowStageContractName;
  executable: 'prismpm' | 'lexlean' | 'hologram' | 'uorust' | 'node';
  fixedArgs: readonly string[];
  windmillRunnable: string;
  windmillFlowPath: string;
  allowedWorkspaces: readonly [typeof ALLOWED_WINDMILL_WORKSPACE];
  requiresOperatorApproval: boolean;
  description: string;
  establishesVerification: boolean;
}

export const FIXED_WINDMILL_COMMAND_REGISTRY: readonly FixedRegistryEntry[] = [
  {
    commandId: 'prism_intake_validate',
    stageId: 'intake',
    stageContractName: 'INTAKE',
    executable: 'node',
    fixedArgs: ['backend/intake_validate.ts'],
    windmillRunnable: 'backend/intake_validate.ts',
    windmillFlowPath: 'f/uor_foundry/prism_intake_validate',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: false,
    description: 'Validate sanitized project intake, input mode, and declared dependencies.',
    establishesVerification: false,
  },
  {
    commandId: 'prism_specify_validate',
    stageId: 'specify',
    stageContractName: 'SPECIFY',
    executable: 'lexlean',
    fixedArgs: ['fmt', '--check', '--all'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/prism_specify_validate',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Validate authoritative .lex.tex formatting and closed-language bounds (`lexlean fmt --check --all`).',
    establishesVerification: false,
  },
  {
    commandId: 'uorust_project',
    stageId: 'specify',
    stageContractName: 'SPECIFY',
    executable: 'uorust',
    fixedArgs: ['project'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/uorust_model_workspace',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Project pinned Cargo workspace AST & lockfile via model/routes.toml (`uorust project <ws> --out <dir>`).',
    establishesVerification: false,
  },
  {
    commandId: 'prism_lock_check',
    stageId: 'lock',
    stageContractName: 'LOCK',
    executable: 'prismpm',
    fixedArgs: ['lock', '--check'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/prism_lock_check',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Verify committed prismpm.lock / lexlean.lock / standards.lock pins (`prismpm --project <path> lock --check`).',
    establishesVerification: false,
  },
  {
    commandId: 'lexlean_check',
    stageId: 'check',
    stageContractName: 'CHECK',
    executable: 'lexlean',
    fixedArgs: ['check', '--all'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/lexlean_check',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Closed-language grammar, closure, and type check (`lexlean check --all`; never verification).',
    establishesVerification: false,
  },
  {
    commandId: 'prismpm_check',
    stageId: 'check',
    stageContractName: 'CHECK',
    executable: 'prismpm',
    fixedArgs: ['check'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/prismpm_check',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Static PrismPM model validation before build (`prismpm --project <path> check`; never verification).',
    establishesVerification: false,
  },
  {
    commandId: 'lexlean_build',
    stageId: 'build',
    stageContractName: 'BUILD',
    executable: 'lexlean',
    fixedArgs: ['build', '--all'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/lexlean_build',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Emit Lean 4, LaTeX, source maps, and semantic-module IR (`lexlean build --all`; never verification).',
    establishesVerification: false,
  },
  {
    commandId: 'prismpm_build_locked',
    stageId: 'build',
    stageContractName: 'BUILD',
    executable: 'prismpm',
    fixedArgs: ['build', '--locked'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/prismpm_build_locked',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Compile Cargo crate, import-free Core-Wasm, HOLOVIEW, and .holo archive under locked inputs.',
    establishesVerification: false,
  },
  {
    commandId: 'lexlean_verify',
    stageId: 'verify',
    stageContractName: 'VERIFY',
    executable: 'lexlean',
    fixedArgs: ['verify', '--all'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/lexlean_verify',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Replay proofs in leanprover/lean4:v4.32.1 + leanchecker and audit #print axioms.',
    establishesVerification: true,
  },
  {
    commandId: 'prismpm_verify',
    stageId: 'verify',
    stageContractName: 'VERIFY',
    executable: 'prismpm',
    fixedArgs: ['verify'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/prismpm_verify',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Independent PrismPM verify gate across Lean, LCNF, Core-Wasm, and acceptance vectors.',
    establishesVerification: true,
  },
  {
    commandId: 'hologram_inspect',
    stageId: 'inspect',
    stageContractName: 'INSPECT',
    executable: 'hologram',
    fixedArgs: ['--json', 'inspect'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/hologram_inspect',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Inspect physical HOLO v4 / UORC v5 archive structure via `hologram --json inspect <ref>`.',
    establishesVerification: false,
  },
  {
    commandId: 'hologram_verify',
    stageId: 'inspect',
    stageContractName: 'INSPECT',
    executable: 'hologram',
    fixedArgs: ['--json', 'verify', '--path'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/hologram_verify',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Validate archive directory hashes and extension contracts via `hologram --json verify --path <ref>`.',
    establishesVerification: true,
  },
  {
    commandId: 'hologram_plan',
    stageId: 'preview',
    stageContractName: 'PREVIEW',
    executable: 'hologram',
    fixedArgs: ['--json', 'holo', 'plan'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/hologram_plan',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Payload-free execution planning via `hologram --json holo plan <ref>` prior to sandboxed run.',
    establishesVerification: false,
  },
  {
    commandId: 'hologram_run',
    stageId: 'preview',
    stageContractName: 'PREVIEW',
    executable: 'hologram',
    fixedArgs: ['--json', 'run', '--output-format', 'json'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/hologram_run',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Execute import-free Core-Wasm guest inside fuel/memory/deadline sandbox (`hologram --json run --output-format json <ref>`).',
    establishesVerification: false,
  },
  {
    commandId: 'prism_review_qualify',
    stageId: 'review',
    stageContractName: 'REVIEW',
    executable: 'node',
    fixedArgs: ['backend/workflow_dispatch.ts'],
    windmillRunnable: 'backend/workflow_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/prism_review_qualify',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Fail-closed human qualification & acceptance gate validation prior to browser export.',
    establishesVerification: false,
  },
  {
    commandId: 'prismpm_export_browser',
    stageId: 'export_release',
    stageContractName: 'EXPORT_RELEASE',
    executable: 'prismpm',
    fixedArgs: ['export-browser'],
    windmillRunnable: 'backend/prism_stage_dispatch.ts',
    windmillFlowPath: 'f/uor_foundry/prismpm_export_browser',
    allowedWorkspaces: [ALLOWED_WINDMILL_WORKSPACE],
    requiresOperatorApproval: true,
    description: 'Export verified immutable browser bundle & HOLOVIEW artifacts after human release approval.',
    establishesVerification: false,
  },
] as const;

export const CANONICAL_COMMAND_BY_ID: Record<CanonicalCommandId, FixedRegistryEntry> =
  Object.fromEntries(
    FIXED_WINDMILL_COMMAND_REGISTRY.map((entry) => [entry.commandId, entry])
  ) as Record<CanonicalCommandId, FixedRegistryEntry>;

export interface CanonicalWorkflowStageSpec {
  index: number;
  stageContractName: WorkflowStageContractName;
  stageId: WorkflowStageId;
  uorGate: string;
  runnable: string;
  fixedCommandId: CanonicalCommandId;
  note?: string;
  failClosed?: boolean;
}

export const CANONICAL_WORKFLOW_STAGES: readonly CanonicalWorkflowStageSpec[] = [
  {
    index: 1,
    stageContractName: 'INTAKE',
    stageId: 'intake',
    uorGate: 'REGISTER',
    runnable: 'backend/intake_validate.ts',
    fixedCommandId: 'prism_intake_validate',
  },
  {
    index: 2,
    stageContractName: 'SPECIFY',
    stageId: 'specify',
    uorGate: 'REVIEW',
    runnable: 'backend/prism_stage_dispatch.ts',
    fixedCommandId: 'prism_specify_validate',
  },
  {
    index: 3,
    stageContractName: 'LOCK',
    stageId: 'lock',
    uorGate: 'REVIEW',
    runnable: 'backend/prism_stage_dispatch.ts',
    fixedCommandId: 'prism_lock_check',
  },
  {
    index: 4,
    stageContractName: 'CHECK',
    stageId: 'check',
    uorGate: 'AUTHORIZE TEST',
    runnable: 'backend/prism_stage_dispatch.ts',
    fixedCommandId: 'prismpm_check',
    note: 'Check never certifies verification.',
  },
  {
    index: 5,
    stageContractName: 'BUILD',
    stageId: 'build',
    uorGate: 'EXECUTE',
    runnable: 'backend/prism_stage_dispatch.ts',
    fixedCommandId: 'prismpm_build_locked',
    note: 'Build never equates to verification.',
  },
  {
    index: 6,
    stageContractName: 'VERIFY',
    stageId: 'verify',
    uorGate: 'VERIFY EVIDENCE',
    runnable: 'backend/prism_stage_dispatch.ts',
    fixedCommandId: 'prismpm_verify',
  },
  {
    index: 7,
    stageContractName: 'INSPECT',
    stageId: 'inspect',
    uorGate: 'VERIFY EVIDENCE',
    runnable: 'backend/prism_stage_dispatch.ts',
    fixedCommandId: 'hologram_inspect',
  },
  {
    index: 8,
    stageContractName: 'PREVIEW',
    stageId: 'preview',
    uorGate: 'EXECUTE',
    runnable: 'backend/prism_stage_dispatch.ts',
    fixedCommandId: 'hologram_run',
  },
  {
    index: 9,
    stageContractName: 'REVIEW',
    stageId: 'review',
    uorGate: 'QUALIFY',
    runnable: 'backend/workflow_dispatch.ts',
    fixedCommandId: 'prism_review_qualify',
  },
  {
    index: 10,
    stageContractName: 'EXPORT_RELEASE',
    stageId: 'export_release',
    uorGate: 'REVIEW RELEASE',
    runnable: 'backend/prism_stage_dispatch.ts',
    fixedCommandId: 'prismpm_export_browser',
    failClosed: true,
  },
] as const;

/**
 * Generates the canonical Windmill flow proposal JSON from the single registry
 * and pinned repository manifest so zero drift can occur between code and flow JSON.
 */
export function buildCanonicalPrismFlowManifest() {
  return {
    schema: 'uor.foundry.windmill-flow-proposal.v1',
    generatedBy: 'src/shared/adapters/windmillCommandRegistry.ts via scripts/prepare-windmill-app.mjs',
    epistemicCondition: 'PROPOSED',
    registrationStatus: 'PREPARED_NOT_REGISTERED',
    workspace: ALLOWED_WINDMILL_WORKSPACE,
    flowPath: 'f/uor_foundry/prism_hologram_delivery',
    summary: '10-stage fail-closed Prism source-to-Hologram DAG using fixed allowlisted CLI subcommands.',
    toolchainPins: {
      prismpm: `UOR-Foundation/PrismPM@${CANONICAL_TOOLCHAIN_PIN_MAP.prismpm}`,
      lexlean: `UOR-Foundation/LexLean@${CANONICAL_TOOLCHAIN_PIN_MAP.lexlean}`,
      foundry: `UOR-Foundation/foundry@${CANONICAL_TOOLCHAIN_PIN_MAP.foundry}`,
      hologramLive: `Hologram-Technologies/hologram-live@${CANONICAL_TOOLCHAIN_PIN_MAP['hologram-live']}`,
      uorust: `afflom/UORust@${CANONICAL_TOOLCHAIN_PIN_MAP.uorust}`,
      lean: 'leanprover/lean4:v4.32.1',
    },
    stages: CANONICAL_WORKFLOW_STAGES.map((stage) => ({
      index: stage.index,
      stageContractName: stage.stageContractName,
      stageId: stage.stageId,
      uorGate: stage.uorGate,
      runnable: stage.runnable,
      fixedCommandId: stage.fixedCommandId,
      ...(stage.note ? { note: stage.note } : {}),
      ...(stage.failClosed !== undefined ? { failClosed: stage.failClosed } : {}),
    })),
  };
}

/**
 * Builds the exact argv array using upstream-verified CLI syntax for each pinned tool.
 */
export function buildValidatedCommandArgv(
  entry: FixedRegistryEntry,
  relPath: string
): string[] {
  const holoRef = `${relPath}/dist/app.holo`;
  switch (entry.executable) {
    case 'prismpm':
      if (entry.commandId === 'prismpm_export_browser') {
        return [
          'prismpm',
          '--project',
          relPath,
          'export-browser',
          holoRef,
          '--output',
          `${relPath}/dist/browser`,
        ];
      }
      return ['prismpm', '--project', relPath, ...entry.fixedArgs];
    case 'lexlean':
      return ['lexlean', '--project', `${relPath}/lexlean.toml`, ...entry.fixedArgs];
    case 'hologram':
      return ['hologram', ...entry.fixedArgs, holoRef];
    case 'uorust':
      return ['uorust', 'project', relPath, '--out', `${relPath}/.prism/projection`];
    case 'node':
      return ['node', ...entry.fixedArgs, '--project', relPath];
  }
}

export interface FixedCommandDispatchRequest {
  commandId?: string;
  rawCommandString?: string;
  workspace?: string;
  projectRelativePath: string;
  sourceRevision: string;
}

export interface CommandValidationResult {
  allowed: boolean;
  code: 'ALLOWED' | 'COMMAND_REGISTRY_REFUSAL';
  entry?: FixedRegistryEntry;
  validatedArgv?: string[];
  reason: string;
}

const SHELL_METACHAR_REGEX = /[;&|`$<>()\n\r\\*?~]/;
const SAFE_RELATIVE_PATH_REGEX = /^[a-zA-Z0-9._/-]+$/;
const SAFE_REVISION_REGEX = /^[a-zA-Z0-9._/@:-]{4,128}$/;

/**
 * Validates any execution request strictly against the fixed Windmill command registry.
 * Rejects arbitrary shell strings, chat-supplied commands, path traversal (`..`),
 * wrong Windmill workspace targets, or unallowlisted flags.
 */
export function validateFixedRegistryCommand(
  params: FixedCommandDispatchRequest
): CommandValidationResult {
  const workspace = (params.workspace ?? ALLOWED_WINDMILL_WORKSPACE).trim();
  if (workspace !== ALLOWED_WINDMILL_WORKSPACE) {
    return {
      allowed: false,
      code: 'COMMAND_REGISTRY_REFUSAL',
      reason: `Refused unauthorized Windmill workspace "${workspace}". Only "${ALLOWED_WINDMILL_WORKSPACE}" is permitted.`,
    };
  }

  if (params.rawCommandString !== undefined) {
    return {
      allowed: false,
      code: 'COMMAND_REGISTRY_REFUSAL',
      reason:
        'Refused arbitrary raw shell/chat command string. Only fixed commandId identifiers from FIXED_WINDMILL_COMMAND_REGISTRY may be scheduled.',
    };
  }

  const entry = FIXED_WINDMILL_COMMAND_REGISTRY.find((c) => c.commandId === params.commandId);
  if (!entry) {
    return {
      allowed: false,
      code: 'COMMAND_REGISTRY_REFUSAL',
      reason: `Refused unknown commandId "${params.commandId ?? 'MISSING'}": not in fixed Windmill command registry.`,
    };
  }

  const relPath = params.projectRelativePath.trim();
  if (
    !relPath ||
    relPath.startsWith('/') ||
    relPath.includes('..') ||
    SHELL_METACHAR_REGEX.test(relPath) ||
    !SAFE_RELATIVE_PATH_REGEX.test(relPath)
  ) {
    return {
      allowed: false,
      code: 'COMMAND_REGISTRY_REFUSAL',
      reason: `Refused unsafe or non-confined projectRelativePath "${params.projectRelativePath}".`,
    };
  }

  const rev = params.sourceRevision.trim();
  if (!SAFE_REVISION_REGEX.test(rev) || SHELL_METACHAR_REGEX.test(rev)) {
    return {
      allowed: false,
      code: 'COMMAND_REGISTRY_REFUSAL',
      reason: `Refused malformed sourceRevision "${params.sourceRevision}".`,
    };
  }

  const validatedArgv = buildValidatedCommandArgv(entry, relPath);

  return {
    allowed: true,
    code: 'ALLOWED',
    entry,
    validatedArgv,
    reason: `Matched fixed registry entry "${entry.commandId}" (${entry.stageContractName}).`,
  };
}
