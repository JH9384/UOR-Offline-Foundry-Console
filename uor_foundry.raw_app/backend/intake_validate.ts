/**
 * Windmill Backend Runnable 3: Engineering Intake Validation
 *
 * Pure deterministic validation aligned with `JH9384/UOR-Workflow` product intake
 * templates. Performs no filesystem writes, git mutations, or workflow execution.
 */
export interface IntakeValidationInput {
  projectName: string;
  productFamily: string;
  componentId: string;
  workflowId: string;
  purpose: string;
  declaredInputs: string;
  environmentDeclaration: string;
  sourceRevision: string;
  acknowledgeBoundary: boolean;
}

export interface IntakeValidationOutput {
  valid: boolean;
  errors: Record<string, string>;
  validatedAt: string;
  sideEffectsExecuted: false;
}

export async function main(input: IntakeValidationInput): Promise<IntakeValidationOutput> {
  const errors: Record<string, string> = {};

  if (!input.projectName || input.projectName.trim().length < 4) {
    errors.projectName = 'Project name must be at least 4 characters.';
  }
  if (!input.purpose || input.purpose.trim().length < 12) {
    errors.purpose = 'Declare observable capability/purpose (minimum 12 characters).';
  }
  if (!input.declaredInputs || !input.declaredInputs.trim()) {
    errors.declaredInputs = 'Declared inputs and version identities are required.';
  }
  if (!input.environmentDeclaration || !input.environmentDeclaration.trim()) {
    errors.environmentDeclaration = 'Sanitized environment declaration is required.';
  }
  if (!input.sourceRevision || !/^[a-zA-Z0-9._/@-]{4,}$/.test(input.sourceRevision.trim())) {
    errors.sourceRevision = 'Provide a valid source revision tag or commit reference.';
  }
  if (!input.acknowledgeBoundary) {
    errors.acknowledgeBoundary = 'Boundary acknowledgement is required.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    validatedAt: new Date().toISOString(),
    sideEffectsExecuted: false,
  };
}
