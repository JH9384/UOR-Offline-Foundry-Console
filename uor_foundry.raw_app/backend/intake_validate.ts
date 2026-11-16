import { ALLOWED_WINDMILL_WORKSPACE } from './generated_command_registry.ts';

/**
 * Windmill Backend Runnable 3: Engineering Intake & Source-Package Validation
 *
 * Pure deterministic read-only validation aligned with `JH9384/UOR-Workflow` product intake
 * templates and `uor.foundry.source-package.v1`. Performs no filesystem writes,
 * git mutations, compiler invocations, or workflow execution.
 */
export interface SourcePackageSummaryInput {
  schema: string;
  packageId: string;
  packageClassification: string;
  isHoloArchive: boolean;
  reviewConfirmed: boolean;
  targetWindmillWorkspace: string;
  packageDigestSha256: string;
  expectedPackageDigestSha256?: string;
  lockfileRefs: string[];
  files: Array<{
    path: string;
    sha256: string;
    expectedSha256?: string;
  }>;
}

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
  sourcePackage?: SourcePackageSummaryInput;
}

export interface IntakeValidationOutput {
  valid: boolean;
  errors: Record<string, string>;
  validatedAt: string;
  sideEffectsExecuted: false;
  sourcePackageValidated?: boolean;
  verifiedFileCount?: number;
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

  let sourcePackageValidated: boolean | undefined;
  let verifiedFileCount: number | undefined;

  if (input.sourcePackage) {
    const pkg = input.sourcePackage;
    if (pkg.schema !== 'uor.foundry.source-package.v1') {
      errors.sourcePackageSchema = `Unsupported source package schema "${pkg.schema}". Expected "uor.foundry.source-package.v1".`;
    }
    if (pkg.isHoloArchive !== false || pkg.packageClassification !== 'UNVERIFIED_AUTHORED_SOURCE_PACKAGE') {
      errors.sourcePackageClassification = 'Source package cannot masquerade as a compiled .holo archive.';
    }
    if (!pkg.reviewConfirmed) {
      errors.sourcePackageReview = 'Explicit operator review confirmation is required on source package.';
    }
    if (pkg.targetWindmillWorkspace !== ALLOWED_WINDMILL_WORKSPACE) {
      errors.sourcePackageWorkspace = `Target workspace "${pkg.targetWindmillWorkspace}" must be "${ALLOWED_WINDMILL_WORKSPACE}".`;
    }
    if (
      !/^[0-9a-f]{64}$/.test(pkg.packageDigestSha256) ||
      (pkg.expectedPackageDigestSha256 &&
        pkg.packageDigestSha256 !== pkg.expectedPackageDigestSha256)
    ) {
      errors.sourcePackageHash = 'Invalid or mismatched top-level source-package SHA-256 digest.';
    }
    if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
      errors.sourcePackageFiles = 'Source package must contain at least one authored input file.';
    } else {
      for (const file of pkg.files) {
        if (!file.path || file.path.startsWith('/') || file.path.includes('..') || /\.(holo|wasm)$/i.test(file.path)) {
          errors.sourcePackagePath = `Unsafe or forbidden file path in source package: "${file.path}".`;
          break;
        }
        if (
          !/^[0-9a-f]{64}$/.test(file.sha256) ||
          (file.expectedSha256 && file.sha256 !== file.expectedSha256)
        ) {
          errors.sourcePackageFileHash = `Invalid or mismatched SHA-256 digest for file "${file.path}".`;
          break;
        }
      }
      verifiedFileCount = pkg.files.length;
    }
    sourcePackageValidated = Object.keys(errors).length === 0;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    validatedAt: new Date().toISOString(),
    sideEffectsExecuted: false,
    ...(sourcePackageValidated !== undefined ? { sourcePackageValidated } : {}),
    ...(verifiedFileCount !== undefined ? { verifiedFileCount } : {}),
  };
}
