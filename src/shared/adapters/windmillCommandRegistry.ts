import { WorkflowStageContractName, WorkflowStageId } from '../types/foundry';

/**
 * Fixed Windmill Command & Argument Registry.
 *
 * SECURITY INVARIANT:
 * - Zero arbitrary shell strings or raw chat prompts may ever be executed.
 * - Every runnable stage maps strictly to an allowlisted toolchain executable + subcommand
 *   and confined relative path arguments validated prior to Windmill dispatch.
 */
export interface FixedRegistryEntry {
  commandId:
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
    | 'prismpm_export_browser'
    | 'uorust_project';
  stageId: WorkflowStageId;
  stageContractName: WorkflowStageContractName;
  executable: 'prismpm' | 'lexlean' | 'hologram' | 'uorust' | 'node';
  fixedArgs: readonly string[];
  windmillFlowPath: string;
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
    windmillFlowPath: 'f/uor_foundry/prism_intake_validate',
    description: 'Validate sanitized project intake, input mode, and declared dependencies.',
    establishesVerification: false,
  },
  {
    commandId: 'prism_specify_validate',
    stageId: 'specify',
    stageContractName: 'SPECIFY',
    executable: 'lexlean',
    fixedArgs: ['fmt', '--check'],
    windmillFlowPath: 'f/uor_foundry/prism_specify_validate',
    description: 'Validate authoritative .lex.tex / Cargo / Guided spec formatting and bounds.',
    establishesVerification: false,
  },
  {
    commandId: 'prism_lock_check',
    stageId: 'lock',
    stageContractName: 'LOCK',
    executable: 'prismpm',
    fixedArgs: ['lock', '--check'],
    windmillFlowPath: 'f/uor_foundry/prism_lock_check',
    description: 'Verify committed prismpm.lock / lexlean.lock / standards.lock / Cargo.lock pins.',
    establishesVerification: false,
  },
  {
    commandId: 'lexlean_check',
    stageId: 'check',
    stageContractName: 'CHECK',
    executable: 'lexlean',
    fixedArgs: ['check'],
    windmillFlowPath: 'f/uor_foundry/lexlean_check',
    description: 'Closed-language grammar, closure, and type check (never verification).',
    establishesVerification: false,
  },
  {
    commandId: 'prismpm_check',
    stageId: 'check',
    stageContractName: 'CHECK',
    executable: 'prismpm',
    fixedArgs: ['check'],
    windmillFlowPath: 'f/uor_foundry/prismpm_check',
    description: 'Static PrismPM model validation before build (never verification).',
    establishesVerification: false,
  },
  {
    commandId: 'lexlean_build',
    stageId: 'build',
    stageContractName: 'BUILD',
    executable: 'lexlean',
    fixedArgs: ['build'],
    windmillFlowPath: 'f/uor_foundry/lexlean_build',
    description: 'Emit Lean 4, LaTeX, source maps, and semantic-module IR (never verification).',
    establishesVerification: false,
  },
  {
    commandId: 'prismpm_build_locked',
    stageId: 'build',
    stageContractName: 'BUILD',
    executable: 'prismpm',
    fixedArgs: ['build', '--locked'],
    windmillFlowPath: 'f/uor_foundry/prismpm_build_locked',
    description: 'Compile Cargo crate, import-free Core-Wasm, HOLOVIEW, and .holo archive under locked inputs.',
    establishesVerification: false,
  },
  {
    commandId: 'lexlean_verify',
    stageId: 'verify',
    stageContractName: 'VERIFY',
    executable: 'lexlean',
    fixedArgs: ['verify'],
    windmillFlowPath: 'f/uor_foundry/lexlean_verify',
    description: 'Replay proofs in leanprover/lean4:v4.32.1 + leanchecker and audit #print axioms.',
    establishesVerification: true,
  },
  {
    commandId: 'prismpm_verify',
    stageId: 'verify',
    stageContractName: 'VERIFY',
    executable: 'prismpm',
    fixedArgs: ['verify'],
    windmillFlowPath: 'f/uor_foundry/prismpm_verify',
    description: 'Independent PrismPM verify gate across Lean, LCNF, Core-Wasm, and acceptance vectors.',
    establishesVerification: true,
  },
  {
    commandId: 'hologram_inspect',
    stageId: 'inspect',
    stageContractName: 'INSPECT',
    executable: 'hologram',
    fixedArgs: ['inspect', '--json'],
    windmillFlowPath: 'f/uor_foundry/hologram_inspect',
    description: 'Inspect physical HOLO v4 / UORC v5 archive structure and SHA-256/blake3 sections without executing.',
    establishesVerification: false,
  },
  {
    commandId: 'hologram_verify',
    stageId: 'inspect',
    stageContractName: 'INSPECT',
    executable: 'hologram',
    fixedArgs: ['verify', '--json'],
    windmillFlowPath: 'f/uor_foundry/hologram_verify',
    description: 'Validate archive directory hashes and extension contracts via Hologram Live.',
    establishesVerification: true,
  },
  {
    commandId: 'hologram_plan',
    stageId: 'preview',
    stageContractName: 'PREVIEW',
    executable: 'hologram',
    fixedArgs: ['plan', '--json'],
    windmillFlowPath: 'f/uor_foundry/hologram_plan',
    description: 'Payload-free execution planning prior to sandboxed Core-Wasm acceptance.',
    establishesVerification: false,
  },
  {
    commandId: 'hologram_run',
    stageId: 'preview',
    stageContractName: 'PREVIEW',
    executable: 'hologram',
    fixedArgs: ['run', '--json'],
    windmillFlowPath: 'f/uor_foundry/hologram_run',
    description: 'Execute import-free Core-Wasm guest inside fuel/memory/deadline sandbox.',
    establishesVerification: false,
  },
  {
    commandId: 'prismpm_export_browser',
    stageId: 'export_release',
    stageContractName: 'EXPORT_RELEASE',
    executable: 'prismpm',
    fixedArgs: ['export-browser'],
    windmillFlowPath: 'f/uor_foundry/prismpm_export_browser',
    description: 'Export verified immutable browser bundle & HOLOVIEW artifacts after human release approval.',
    establishesVerification: false,
  },
  {
    commandId: 'uorust_project',
    stageId: 'specify',
    stageContractName: 'SPECIFY',
    executable: 'uorust',
    fixedArgs: ['project'],
    windmillFlowPath: 'f/uor_foundry/uorust_model_workspace',
    description: 'Project pinned Cargo workspace AST & lockfile via model/routes.toml (non-defaulting refusals).',
    establishesVerification: false,
  },
] as const;

export interface FixedCommandDispatchRequest {
  commandId?: string;
  rawCommandString?: string;
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
 * Rejects arbitrary shell strings, chat-supplied commands, path traversal (`..`), or
 * unallowlisted flags.
 */
export function validateFixedRegistryCommand(
  params: FixedCommandDispatchRequest
): CommandValidationResult {
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

  const validatedArgv = [
    entry.executable,
    ...entry.fixedArgs,
    '--project',
    relPath,
  ];

  return {
    allowed: true,
    code: 'ALLOWED',
    entry,
    validatedArgv,
    reason: `Matched fixed registry entry "${entry.commandId}" (${entry.stageContractName}).`,
  };
}
