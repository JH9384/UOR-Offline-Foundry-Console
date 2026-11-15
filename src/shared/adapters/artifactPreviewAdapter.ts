import { ENGINEERING_COMPONENTS } from '../data/seedFoundryData';
import {
  ArtifactPreviewKind,
  ArtifactPreviewPayload,
  ArtifactPreviewStatus,
  ArtifactProvenanceRecord,
  IntegrationMode,
  PreviewConfigState,
  ProjectRecord,
  VerificationSuiteRecord,
  WorkflowRun,
} from '../types/foundry';

/**
 * Layer 3: Typed Artifact Preview Adapter.
 *
 * Supports 6 preview artifact classes:
 *   1. ui-build (Generated UI builds)
 *   2. document (Read-only documents)
 *   3. json-artifact (Structured JSON artifacts)
 *   4. workflow-output (Workflow execution output)
 *   5. image-diagram (Architectural / pipeline SVG diagram)
 *   6. validation-report (Suite & gate validation summary)
 *
 * Every preview carries an explicit origin and status (`DEMO`, `DRAFT`, `BUILT`, `VERIFIED`, `UNAVAILABLE`).
 * Executable previews remain sandboxed and never constitute authoritative verification evidence.
 */
export interface ArtifactPreviewAdapter {
  buildPreview(params: {
    kind: ArtifactPreviewKind;
    mode: IntegrationMode;
    project: ProjectRecord;
    previewConfig: PreviewConfigState;
    run?: WorkflowRun;
    artifacts: ArtifactProvenanceRecord[];
    verifications: VerificationSuiteRecord[];
    selectedArtifactId?: string;
  }): ArtifactPreviewPayload;
}

export class FoundryArtifactPreviewAdapter implements ArtifactPreviewAdapter {
  buildPreview(params: {
    kind: ArtifactPreviewKind;
    mode: IntegrationMode;
    project: ProjectRecord;
    previewConfig: PreviewConfigState;
    run?: WorkflowRun;
    artifacts: ArtifactProvenanceRecord[];
    verifications: VerificationSuiteRecord[];
    selectedArtifactId?: string;
  }): ArtifactPreviewPayload {
    const {
      kind,
      mode,
      project,
      previewConfig,
      run,
      artifacts,
      verifications,
      selectedArtifactId,
    } = params;
    const component = ENGINEERING_COMPONENTS.find((c) => c.id === project.componentId);
    const projectArtifacts = artifacts.filter((a) => a.projectId === project.id);
    const primaryArtifact =
      (selectedArtifactId
        ? projectArtifacts.find((a) => a.id === selectedArtifactId)
        : undefined) ??
      projectArtifacts.find((a) => a.outputClass === 'physical_holo_archive') ??
      projectArtifacts[0];
    const projectSuites = verifications.filter((v) => v.projectId === project.id);
    const isUnverified = component?.epistemicCondition === 'UNVERIFIED';

    const deriveStatus = (): ArtifactPreviewStatus => {
      if (isUnverified) return 'UNAVAILABLE';
      if (mode === 'DEMO') {
        const hasDraftCustomization =
          previewConfig.customWidgets.length > 1 || previewConfig.lastUpdatedAt !== project.updatedAt;
        return hasDraftCustomization ? 'DRAFT' : 'DEMO';
      }
      const allNonSimPass =
        projectSuites.length > 0 && projectSuites.every((s) => !s.isSimulated && s.status === 'PASS');
      if (allNonSimPass) return 'VERIFIED';
      if (run?.overallStatus === 'COMPLETED') return 'BUILT';
      return 'DRAFT';
    };

    const status = deriveStatus();
    const originLabel =
      mode === 'DEMO'
        ? 'Browser Sandbox · Simulated Demo Fixture'
        : 'Local Windmill Artifact Store (NOT CONNECTED)';

    if (kind === 'ui-build') {
      return {
        id: `prev-ui-${project.id}`,
        projectId: project.id,
        kind,
        title: previewConfig.appTitle,
        subtitle: previewConfig.subtitle,
        status: isUnverified ? 'UNAVAILABLE' : status,
        originLabel,
        isSandboxed: true,
        isAuthoritativeEvidence: false,
        unavailableReason: isUnverified
          ? 'Restricted local boundary: no UI build preview synthesized for UNVERIFIED components.'
          : undefined,
        sourceRevision: project.sourceRevision,
      };
    }

    if (kind === 'document') {
      return {
        id: `prev-doc-${project.id}-${primaryArtifact?.id ?? 'spec'}`,
        projectId: project.id,
        kind,
        title: primaryArtifact
          ? `${primaryArtifact.artifactName} · Typed Artifact & Specification`
          : `${project.name} · Read-Only Specification`,
        subtitle: primaryArtifact
          ? `[${primaryArtifact.outputClass}] ${primaryArtifact.artifactState} · ${
              primaryArtifact.isSyntheticFixture ? 'SYNTHETIC FIXTURE' : primaryArtifact.artifactFormat
            }`
          : `Sanitized intake & boundary summary (${project.acceptancePolicySchema})`,
        status,
        originLabel,
        isSandboxed: true,
        isAuthoritativeEvidence: false,
        sourceRevision: project.sourceRevision,
        contentText: [
          `# ${project.name}`,
          `Input Mode     : ${project.inputMode ?? 'NATIVE_PRISM'}`,
          `Product Family : ${project.productFamily}`,
          `Component      : ${component?.name ?? project.componentId}`,
          `Repository     : ${component?.repositoryName ?? 'Unverified'}`,
          `Source Revision: ${project.sourceRevision}`,
          `Lifecycle      : ${project.lifecycleStatus}`,
          ...(primaryArtifact
            ? [
                ``,
                `## Selected Artifact (${primaryArtifact.outputClass})`,
                `Artifact Name  : ${primaryArtifact.artifactName}`,
                `Lifecycle State: ${primaryArtifact.artifactState}`,
                `Digest Mode    : ${primaryArtifact.digestMode}`,
                `SHA-256 Digest : ${primaryArtifact.sha256Digest}`,
                `Synthetic Flag : ${primaryArtifact.isSyntheticFixture ? 'SYNTHETIC FIXTURE (NON-AUTHORITATIVE)' : 'FALSE'}`,
                ...(primaryArtifact.previewContent
                  ? [``, `--- Artifact Preview Content ---`, primaryArtifact.previewContent]
                  : []),
              ]
            : []),
          ...(project.lockfilesDeclared?.length
            ? [`Declared Locks : ${project.lockfilesDeclared.join(', ')}`]
            : []),
          ...(project.guidedProductDraft
            ? [
                `Draft Review   : ${project.guidedProductDraft.humanReviewStatus}`,
                `Facet Coverage : ${project.guidedProductDraft.facetCoverage.filter((f) => f.covered).length}/7`,
              ]
            : []),
          ...(project.uorustRefusals?.length
            ? [
                `UORust Refusals: ${project.uorustRefusals.map((r) => `${r.code} (${r.span ?? 'global'})`).join('; ')}`,
              ]
            : []),
          ``,
          `## Declared Purpose`,
          project.purpose,
          ``,
          `## Declared Inputs`,
          project.declaredInputs,
          ``,
          `## Environment Declaration`,
          project.environmentDeclaration,
          ``,
          `## Release Blockers`,
          ...project.releaseBlockedReasons.map((r, i) => `${i + 1}. ${r}`),
        ].join('\n'),
      };
    }

    if (kind === 'json-artifact') {
      return {
        id: `prev-json-${project.id}-${primaryArtifact?.id ?? 'none'}`,
        projectId: project.id,
        kind,
        title: primaryArtifact?.artifactName ?? `${project.id}.manifest.json`,
        subtitle: primaryArtifact
          ? `[${primaryArtifact.outputClass}] ${primaryArtifact.artifactState} · ${primaryArtifact.artifactFormat}`
          : 'Content-addressed provenance JSON',
        status: primaryArtifact ? status : 'UNAVAILABLE',
        originLabel,
        isSandboxed: true,
        isAuthoritativeEvidence: false,
        sourceRevision: project.sourceRevision,
        unavailableReason: primaryArtifact
          ? undefined
          : 'No artifact provenance record available for this project.',
        jsonPayload: primaryArtifact
          ? {
              schema: 'uor.foundry.artifact-preview.v1',
              inputMode: project.inputMode ?? 'NATIVE_PRISM',
              artifactId: primaryArtifact.id,
              artifactName: primaryArtifact.artifactName,
              artifactFormat: primaryArtifact.artifactFormat,
              outputClass: primaryArtifact.outputClass,
              artifactState: primaryArtifact.artifactState,
              isSyntheticFixture: Boolean(primaryArtifact.isSyntheticFixture),
              digestMode: primaryArtifact.digestMode,
              sha256Digest: primaryArtifact.sha256Digest,
              fileExistsOnDisk: Boolean(primaryArtifact.fileExistsOnDisk),
              sha256Verified: Boolean(primaryArtifact.sha256Verified),
              archiveValidationStatus: primaryArtifact.archiveValidationStatus ?? 'UNINSPECTED',
              coreWasmContract: primaryArtifact.coreWasmContract,
              viewProfile: primaryArtifact.viewProfile,
              sourceRevision: primaryArtifact.sourceRevision,
              toolchainIdentity: primaryArtifact.toolchainIdentity,
              inputDependencies: primaryArtifact.inputDependencies,
              releaseReadiness: primaryArtifact.releaseReadiness,
              previewContent: primaryArtifact.previewContent,
              isAuthoritativeEvidence: false,
            }
          : undefined,
      };
    }

    if (kind === 'workflow-output') {
      return {
        id: `prev-wf-${project.id}`,
        projectId: project.id,
        kind,
        title: run?.workflowName ?? 'Workflow Stage Output',
        subtitle: run
          ? `Stage: ${run.currentStageId.toUpperCase()} · Status: ${run.overallStatus}`
          : 'No active workflow run',
        status: run ? status : 'UNAVAILABLE',
        originLabel,
        isSandboxed: true,
        isAuthoritativeEvidence: false,
        sourceRevision: project.sourceRevision,
        unavailableReason: run ? undefined : 'No workflow run initialized for this project.',
        contentText: run
          ? run.stages
              .map(
                (s, idx) =>
                  `[${String(idx + 1).padStart(2, '0')} ${s.label.padEnd(16)} | Gate: ${s.uorGate.padEnd(14)} | ${s.status}]\n  ${s.summary}`
              )
              .join('\n\n')
          : undefined,
      };
    }

    if (kind === 'image-diagram') {
      return {
        id: `prev-diag-${project.id}`,
        projectId: project.id,
        kind,
        title: `${project.name} · Stage & Authority Diagram`,
        subtitle: 'Non-authoritative structural schematic (SVG)',
        status,
        originLabel,
        isSandboxed: true,
        isAuthoritativeEvidence: false,
        sourceRevision: project.sourceRevision,
        diagramNodes: (run?.stages ?? []).map((s) => ({
          id: s.stageId,
          label: s.label,
          gate: s.uorGate,
          status: s.status,
        })),
      };
    }

    // validation-report
    return {
      id: `prev-val-${project.id}`,
      projectId: project.id,
      kind,
      title: `${project.name} · Validation Report Snapshot`,
      subtitle: `${projectSuites.length} tracked verification gates (read-only snapshot)`,
      status,
      originLabel,
      isSandboxed: true,
      isAuthoritativeEvidence: false,
      sourceRevision: project.sourceRevision,
      reportItems: projectSuites.map((s) => ({
        label: s.suiteName,
        authority: s.authority,
        status: s.status,
        detail: s.executionRecord,
      })),
    };
  }
}

export const artifactPreviewAdapter = new FoundryArtifactPreviewAdapter();
