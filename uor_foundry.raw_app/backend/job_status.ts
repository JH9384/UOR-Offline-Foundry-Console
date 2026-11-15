/**
 * Windmill Backend Runnable 5: Job Status & Result Retrieval
 *
 * Fail-closed contract: does not synthesize fake job execution results when
 * Windmill workspace job lookup is unconfigured.
 */
export interface JobStatusInput {
  jobId: string;
}

export interface JobStatusOutput {
  found: false;
  jobId: string;
  status: 'UNAVAILABLE_UNCONFIGURED';
  reason: string;
}

export async function main(input: JobStatusInput): Promise<JobStatusOutput> {
  return {
    found: false,
    jobId: input.jobId ?? '',
    status: 'UNAVAILABLE_UNCONFIGURED',
    reason:
      'Live Windmill job lookup is not connected in this scaffold. Bind authenticated Windmill `wmill` client calls inside `uor-offline-foundry`.',
  };
}
