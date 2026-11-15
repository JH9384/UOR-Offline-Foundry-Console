/**
 * Windmill Backend Runnable 6: Fixed-Registry Prism / Hologram Stage Dispatch
 *
 * Self-contained fail-closed runnable strictly enforcing allowlisted CLI IDs
 * (`prismpm`, `lexlean`, `hologram`, `uorust`, `node`) mapped across the 10 stages:
 *   INTAKE -> SPECIFY -> LOCK -> CHECK -> BUILD -> VERIFY -> INSPECT -> PREVIEW -> REVIEW -> EXPORT_RELEASE
 *
 * Rejects arbitrary shell strings, command chaining, or path traversal fail-closed.
 */
export interface FixedCommandSpec {
  executable: string;
  fixedArgs: readonly string[];
  stageContractName: string;
  windmillFlowPath: string;
}

const FIXED_STAGE_COMMANDS: Record<string, FixedCommandSpec> = {
  prism_intake_validate: {
    executable: 'node',
    fixedArgs: ['backend/intake_validate.ts'],
    stageContractName: 'INTAKE',
    windmillFlowPath: 'f/uor_foundry/prism_intake_validate',
  },
  prism_specify_validate: {
    executable: 'lexlean',
    fixedArgs: ['fmt', '--check'],
    stageContractName: 'SPECIFY',
    windmillFlowPath: 'f/uor_foundry/prism_specify_validate',
  },
  prism_lock_check: {
    executable: 'prismpm',
    fixedArgs: ['lock', '--check'],
    stageContractName: 'LOCK',
    windmillFlowPath: 'f/uor_foundry/prism_lock_check',
  },
  lexlean_check: {
    executable: 'lexlean',
    fixedArgs: ['check'],
    stageContractName: 'CHECK',
    windmillFlowPath: 'f/uor_foundry/lexlean_check',
  },
  prismpm_check: {
    executable: 'prismpm',
    fixedArgs: ['check'],
    stageContractName: 'CHECK',
    windmillFlowPath: 'f/uor_foundry/prismpm_check',
  },
  lexlean_build: {
    executable: 'lexlean',
    fixedArgs: ['build'],
    stageContractName: 'BUILD',
    windmillFlowPath: 'f/uor_foundry/lexlean_build',
  },
  prismpm_build_locked: {
    executable: 'prismpm',
    fixedArgs: ['build', '--locked'],
    stageContractName: 'BUILD',
    windmillFlowPath: 'f/uor_foundry/prismpm_build_locked',
  },
  lexlean_verify: {
    executable: 'lexlean',
    fixedArgs: ['verify'],
    stageContractName: 'VERIFY',
    windmillFlowPath: 'f/uor_foundry/lexlean_verify',
  },
  prismpm_verify: {
    executable: 'prismpm',
    fixedArgs: ['verify'],
    stageContractName: 'VERIFY',
    windmillFlowPath: 'f/uor_foundry/prismpm_verify',
  },
  hologram_inspect: {
    executable: 'hologram',
    fixedArgs: ['inspect', '--json'],
    stageContractName: 'INSPECT',
    windmillFlowPath: 'f/uor_foundry/hologram_inspect',
  },
  hologram_verify: {
    executable: 'hologram',
    fixedArgs: ['verify', '--json'],
    stageContractName: 'INSPECT',
    windmillFlowPath: 'f/uor_foundry/hologram_verify',
  },
  hologram_plan: {
    executable: 'hologram',
    fixedArgs: ['plan', '--json'],
    stageContractName: 'PREVIEW',
    windmillFlowPath: 'f/uor_foundry/hologram_plan',
  },
  hologram_run: {
    executable: 'hologram',
    fixedArgs: ['run', '--json'],
    stageContractName: 'PREVIEW',
    windmillFlowPath: 'f/uor_foundry/hologram_run',
  },
  prismpm_export_browser: {
    executable: 'prismpm',
    fixedArgs: ['export-browser'],
    stageContractName: 'EXPORT_RELEASE',
    windmillFlowPath: 'f/uor_foundry/prismpm_export_browser',
  },
  uorust_project: {
    executable: 'uorust',
    fixedArgs: ['project'],
    stageContractName: 'SPECIFY',
    windmillFlowPath: 'f/uor_foundry/uorust_model_workspace',
  },
};

export interface PrismStageDispatchInput {
  workspace?: string;
  projectId?: string;
  stageId?: string;
  commandId?: string;
  rawCommandString?: string;
  projectRelativePath: string;
  sourceRevision: string;
  operatorApproved: boolean;
  idempotencyKey: string;
}

export interface PrismStageDispatchOutput {
  dispatched: false;
  status: 'FAIL_CLOSED_NOT_DISPATCHED' | 'REJECTED_INVALID_COMMAND';
  jobId: string | null;
  exitCode: number | null;
  logs: string[];
  artifactPaths: string[];
  sha256Digests: Record<string, string>;
  reason: string;
}

const SHELL_METACHAR_REGEX = /[;&|`$<>()\n\r\\*?~]/;
const SAFE_RELATIVE_PATH_REGEX = /^[a-zA-Z0-9._/-]+$/;
const SAFE_REVISION_REGEX = /^[a-zA-Z0-9._/@:-]{4,128}$/;

export async function main(input: PrismStageDispatchInput): Promise<PrismStageDispatchOutput> {
  const workspace = input.workspace ?? 'uor-offline-foundry';
  if (workspace !== 'uor-offline-foundry') {
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      jobId: null,
      exitCode: 1,
      logs: [`[FAIL-CLOSED] Unauthorized Windmill workspace "${workspace}".`],
      artifactPaths: [],
      sha256Digests: {},
      reason: `Unauthorized workspace "${workspace}". Only "uor-offline-foundry" is allowed.`,
    };
  }

  if (!input.operatorApproved) {
    return {
      dispatched: false,
      status: 'FAIL_CLOSED_NOT_DISPATCHED',
      jobId: null,
      exitCode: null,
      logs: ['[FAIL-CLOSED] Explicit human operator approval required before dispatching CLI stage.'],
      artifactPaths: [],
      sha256Digests: {},
      reason: 'Execution denied: operatorApproved must be true.',
    };
  }

  if (!input.idempotencyKey?.trim()) {
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      jobId: null,
      exitCode: 1,
      logs: ['[FAIL-CLOSED] Missing idempotencyKey.'],
      artifactPaths: [],
      sha256Digests: {},
      reason: 'Execution denied: non-empty idempotencyKey is required.',
    };
  }

  if (input.rawCommandString !== undefined) {
    const reason =
      'Refused arbitrary raw shell/chat command string. Only fixed commandId identifiers may be scheduled.';
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      jobId: null,
      exitCode: 1,
      logs: [`[REGISTRY REJECTION] ${reason}`],
      artifactPaths: [],
      sha256Digests: {},
      reason,
    };
  }

  const spec = input.commandId ? FIXED_STAGE_COMMANDS[input.commandId] : undefined;
  if (!spec) {
    const reason = `Refused unknown commandId "${input.commandId ?? 'MISSING'}": not in fixed Windmill command registry.`;
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      jobId: null,
      exitCode: 1,
      logs: [`[REGISTRY REJECTION] ${reason}`],
      artifactPaths: [],
      sha256Digests: {},
      reason,
    };
  }

  const relPath = input.projectRelativePath.trim();
  if (
    !relPath ||
    relPath.startsWith('/') ||
    relPath.includes('..') ||
    SHELL_METACHAR_REGEX.test(relPath) ||
    !SAFE_RELATIVE_PATH_REGEX.test(relPath)
  ) {
    const reason = `Refused unsafe or non-confined projectRelativePath "${input.projectRelativePath}".`;
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      jobId: null,
      exitCode: 1,
      logs: [`[REGISTRY REJECTION] ${reason}`],
      artifactPaths: [],
      sha256Digests: {},
      reason,
    };
  }

  const rev = input.sourceRevision.trim();
  if (!SAFE_REVISION_REGEX.test(rev) || SHELL_METACHAR_REGEX.test(rev)) {
    const reason = `Refused malformed sourceRevision "${input.sourceRevision}".`;
    return {
      dispatched: false,
      status: 'REJECTED_INVALID_COMMAND',
      jobId: null,
      exitCode: 1,
      logs: [`[REGISTRY REJECTION] ${reason}`],
      artifactPaths: [],
      sha256Digests: {},
      reason,
    };
  }

  const validatedArgv = [spec.executable, ...spec.fixedArgs, '--project', relPath];

  return {
    dispatched: false,
    status: 'FAIL_CLOSED_NOT_DISPATCHED',
    jobId: null,
    exitCode: null,
    logs: [
      `[VALIDATED FIXED REGISTRY] commandId=${input.commandId} (${validatedArgv.join(' ')})`,
      `[STAGE] ${spec.stageContractName} · flow=${spec.windmillFlowPath}`,
      '[FAIL-CLOSED] Mac Studio worker runtime and generated wmill.ts bindings are not yet bound in this environment.',
    ],
    artifactPaths: [],
    sha256Digests: {},
    reason: `Fixed command "${input.commandId}" validated, but live Mac Studio worker & generated wmill.ts bindings are not enabled.`,
  };
}
