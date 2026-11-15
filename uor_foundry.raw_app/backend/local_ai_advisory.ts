/**
 * Windmill Backend Runnable 2: Local AI Advisory Invocation
 *
 * Fail-closed contract: requires an explicit Windmill-managed LM Studio resource
 * (`u/uor_foundry/lm_studio_local`) configured inside Windmill. Never stores or
 * accepts API credentials from frontend payloads, and never grants shell/repo/release
 * privileges to the model.
 */
export interface LocalAiAdvisoryInput {
  projectId: string;
  prompt: string;
  referencedElementLabel?: string;
}

export interface LocalAiAdvisoryOutput {
  ok: false;
  status: 'UNAVAILABLE_UNCONFIGURED';
  privileges: {
    shell: false;
    repositoryWrite: false;
    verificationCertification: false;
    releaseAuthorization: false;
  };
  error: string;
}

export async function main(input: LocalAiAdvisoryInput): Promise<LocalAiAdvisoryOutput> {
  if (!input.projectId?.trim() || !input.prompt?.trim()) {
    return {
      ok: false,
      status: 'UNAVAILABLE_UNCONFIGURED',
      privileges: {
        shell: false,
        repositoryWrite: false,
        verificationCertification: false,
        releaseAuthorization: false,
      },
      error: 'Invalid advisory request: projectId and prompt are required.',
    };
  }

  // Fail closed: no LM Studio resource binding or Windmill secret lookup is active in this scaffold.
  return {
    ok: false,
    status: 'UNAVAILABLE_UNCONFIGURED',
    privileges: {
      shell: false,
      repositoryWrite: false,
      verificationCertification: false,
      releaseAuthorization: false,
    },
    error:
      'LM Studio advisory bridge is not configured in this scaffold. Bind the local Windmill resource in `uor-offline-foundry` without modifying LM Studio settings.',
  };
}
