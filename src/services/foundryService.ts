import {
  SimulatedLocalAdapter,
  UnconnectedWindmillAdapter,
  WindmillClientAdapter,
} from '../adapters/windmillAdapter';
import {
  ENGINEERING_COMPONENTS,
  WORKFLOW_CATALOG,
} from '../data/seedFoundryData';
import {
  ActivityEvent,
  AiAdvisoryEntry,
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ConversationMessage,
  DraftChangeProposal,
  EngineeringIntakePayload,
  OfflineQueueItem,
  PreviewConfigState,
  PreviewElementRef,
  ProjectRecord,
  VerificationSuiteRecord,
  WorkflowRun,
  WorkflowStageId,
} from '../types/foundry';

export interface IntakeValidationErrors {
  projectName?: string;
  purpose?: string;
  declaredInputs?: string;
  environmentDeclaration?: string;
  sourceRevision?: string;
  acknowledgeBoundary?: string;
}

/**
 * Computes deterministic-looking synthetic SHA-256 style digest in-browser for demo artifacts.
 * Explicitly tagged SYNTHETIC_DEMO_DIGEST so it is never mistaken for real build output.
 */
async function computeSyntheticSha256(seedText: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(seedText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(64, '0');
}

export class FoundryService {
  private readonly simAdapter: WindmillClientAdapter = new SimulatedLocalAdapter();
  private readonly liveAdapter: WindmillClientAdapter = new UnconnectedWindmillAdapter();

  validateIntake(payload: EngineeringIntakePayload): IntakeValidationErrors {
    const errors: IntakeValidationErrors = {};
    if (!payload.projectName.trim() || payload.projectName.trim().length < 4) {
      errors.projectName = 'Project name must be at least 4 characters.';
    }
    if (!payload.purpose.trim() || payload.purpose.trim().length < 12) {
      errors.purpose = 'Declare the observable capability/purpose (at least 12 characters).';
    }
    if (!payload.declaredInputs.trim()) {
      errors.declaredInputs = 'Declared inputs and version identities are required per UOR-Workflow intake template.';
    }
    if (!payload.environmentDeclaration.trim()) {
      errors.environmentDeclaration = 'Sanitized environment declaration is required.';
    }
    if (!payload.sourceRevision.trim() || !/^[a-zA-Z0-9._/@-]{4,}$/.test(payload.sourceRevision.trim())) {
      errors.sourceRevision = 'Provide a valid revision tag or commit reference (e.g. demo/rev@0.4.0).';
    }
    if (!payload.acknowledgeBoundary) {
      errors.acknowledgeBoundary = 'Confirm that no restricted local evidence or secrets are included in this synthetic intake.';
    }
    return errors;
  }

  async createSyntheticProjectIntake(payload: EngineeringIntakePayload): Promise<{
    project: ProjectRecord;
    run: WorkflowRun;
    verifications: VerificationSuiteRecord[];
    artifact: ArtifactProvenanceRecord;
    approvals: ApprovalDecisionRecord[];
    advisory: AiAdvisoryEntry;
    activity: ActivityEvent;
  }> {
    const now = new Date().toISOString();
    const projectId = `proj-demo-${Math.random().toString(36).slice(2, 7)}`;
    const component =
      ENGINEERING_COMPONENTS.find((c) => c.id === payload.componentId) ?? ENGINEERING_COMPONENTS[0];
    const workflow =
      WORKFLOW_CATALOG.find((w) => w.id === payload.workflowId) ?? WORKFLOW_CATALOG[0];

    const isUnverifiedComponent = component.epistemicCondition === 'UNVERIFIED';

    const releaseBlockedReasons = [
      'Simulated browser intake only — live Windmill runtime (http://127.0.0.1:8080) is NOT CONNECTED.',
      ...(isUnverifiedComponent
        ? [`Selected component "${component.name}" has UNVERIFIED integration status.`]
        : []),
      'Forge Kernel ABI & Browser/Identity Acceptance Suites remain NOT VERIFIED.',
      'Human Release Authorization disposition is DEFERRED (AI cannot authorize release).',
    ];

    const project: ProjectRecord = {
      id: projectId,
      name: payload.projectName.trim(),
      productFamily: payload.productFamily,
      componentId: component.id,
      workflowId: workflow.id,
      purpose: payload.purpose.trim(),
      declaredInputs: payload.declaredInputs.trim(),
      environmentDeclaration: payload.environmentDeclaration.trim(),
      sourceRevision: payload.sourceRevision.trim(),
      lifecycleStatus: 'IN WORKFLOW',
      createdAt: now,
      updatedAt: now,
      isSyntheticDemo: true,
      acceptancePolicySchema: 'uor.acceptance-policy.example.v1',
      releaseBlockedReasons,
    };

    const dispatchResult = this.simAdapter.dispatchWorkflowSimulation(projectId, payload, workflow);
    if (!dispatchResult.ok || !dispatchResult.data) {
      throw new Error(dispatchResult.error ?? 'Failed to initialize simulated workflow');
    }

    const digest = await computeSyntheticSha256(
      `${project.id}|${project.componentId}|${project.sourceRevision}|${now}`
    );

    const verifications: VerificationSuiteRecord[] = [
      {
        id: `ver-comp-${projectId}`,
        projectId,
        suiteId:
          component.id === 'lexlean-compiler' || component.id === 'lexlean-mcp-gateway'
            ? 'lexlean-kernel-proof'
            : 'prismpm-15gate-vv',
        suiteVersion: '0.4.0',
        suiteName: `${component.name} — Simulated Check`,
        authority: component.id === 'lexlean-compiler' || component.id === 'lexlean-mcp-gateway' ? 'LexLean' : 'PrismPM',
        status: isUnverifiedComponent ? 'NOT VERIFIED' : 'NOT RUN',
        epistemicCondition: component.epistemicCondition,
        evidenceId: `sim-ev-${projectId.slice(-5)}`,
        sourceRevision: project.sourceRevision,
        toolchainIdentity: component.documentedCommand ?? 'Simulated browser harness',
        executionRecord: 'Awaiting simulated Verify stage execution in console.',
        authenticationStatus: 'SIMULATED_ONLY',
        artifactHash: digest,
        isSimulated: true,
        blockingForRelease: true,
        notes: 'Mock verification record created for synthetic intake. Does not establish real local verification.',
      },
      {
        id: `ver-kernel-${projectId}`,
        projectId,
        suiteId: 'forge-kernel-abi',
        suiteName: 'Forge Kernel ABI & Acceptance',
        authority: 'Forge Kernel',
        status: 'NOT VERIFIED',
        epistemicCondition: 'UNVERIFIED',
        evidenceId: `unv-kernel-${projectId.slice(-5)}`,
        sourceRevision: project.sourceRevision,
        toolchainIdentity: 'Local Mac Studio Forge Kernel (NOT CONNECTED)',
        executionRecord: 'Independent verification unavailable in Google AI Studio.',
        authenticationStatus: 'UNAUTHENTICATED',
        isSimulated: false,
        blockingForRelease: true,
        notes: 'Must remain NOT VERIFIED until executed on controlled local workstation.',
      },
      {
        id: `ver-browser-${projectId}`,
        projectId,
        suiteId: 'browser-identity-pp2011',
        suiteName: 'Browser & Identity Acceptance Suite',
        authority: 'Browser & Identity Acceptance Suites',
        status: 'NOT VERIFIED',
        epistemicCondition: 'UNVERIFIED',
        evidenceId: `unv-browser-${projectId.slice(-5)}`,
        sourceRevision: project.sourceRevision,
        toolchainIdentity: 'External Acceptance Harness (NOT CONNECTED)',
        executionRecord: 'Independent browser/identity suite not connected.',
        authenticationStatus: 'UNAUTHENTICATED',
        isSimulated: false,
        blockingForRelease: true,
        notes: 'Release stays blocked while independent acceptance suites are NOT VERIFIED.',
      },
    ];

    const artifact: ArtifactProvenanceRecord = {
      id: `art-${projectId}`,
      projectId,
      artifactName: `${payload.projectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.holo (Synthetic Demo)`,
      artifactFormat:
        component.id === 'lexlean-compiler'
          ? 'lexlean/production-result/1 (Simulated)'
          : 'Synthetic Hologram v4 / model.prism.json',
      sha256Digest: digest,
      digestMode: 'SYNTHETIC_DEMO_DIGEST',
      provenanceStatus: 'Pending',
      sourceRevision: project.sourceRevision,
      inputDependencies: project.declaredInputs.split(',').map((s) => s.trim()).filter(Boolean),
      toolchainIdentity: `${component.name} (Simulated Console Preview)`,
      evidenceRefs: verifications.map((v) => v.evidenceId),
      releaseReadiness: 'BLOCKED',
      blockingReasons: releaseBlockedReasons,
      createdAt: now,
    };

    const approvals: ApprovalDecisionRecord[] = [
      {
        id: `apr-exec-${projectId}`,
        projectId,
        gate: 'EXECUTION_AUTHORIZATION',
        authorizationScope: 'TEST_EXECUTION',
        title: 'Execution Authorization (Simulated Demo Scope)',
        requiredRole: 'Foundry Operator',
        authorizedReviewer: 'Browser Demo Operator',
        disposition: 'APPROVED_FOR_TEST_SIMULATION',
        aiPermitted: false,
        isSimulated: true,
        sourceRevision: project.sourceRevision,
        policyVersion: '2026.11.v1',
        rationale: 'Permitted for synthetic browser test simulation only; never authorizes production release.',
        decidedAt: now,
        policyReference: 'uor.acceptance-policy.example.v1',
      },
      {
        id: 'apr-rel-' + projectId,
        projectId,
        gate: 'RELEASE_AUTHORIZATION',
        authorizationScope: 'PRODUCTION_RELEASE',
        title: 'Production Release Authorization',
        requiredRole: 'Human Release Governance Authority',
        authorizedReviewer: 'Pending Human Sign-off',
        disposition: 'BLOCKED',
        aiPermitted: false,
        isSimulated: true,
        artifactDigest: digest,
        sourceRevision: project.sourceRevision,
        policyVersion: '2026.11.v1',
        rationale: 'Fail-closed: Independent Forge Kernel & Browser Acceptance suites are NOT VERIFIED and live Windmill is NOT CONNECTED.',
        policyReference: 'JH9384/UOR-Workflow/README.md',
      },
    ];

    const advisory: AiAdvisoryEntry = {
      id: `adv-${projectId}`,
      projectId,
      category: 'workflow-recommendation',
      promptSummary: `Intake guidance for "${project.name}" (${component.name}, family: ${project.productFamily}).`,
      responseSummary: isUnverifiedComponent
        ? `Advisory: "${component.name}" has UNVERIFIED public integration status. Keep the project in qualification-audit status and dispatch real checks only inside your local uor-offline-foundry workstation. Release authorization will stay strictly blocked.`
        : `Advisory: "${project.name}" aligns with "${workflow.name}". Step through Plan -> Build -> Test -> Verify -> Review -> Package in simulation mode to inspect artifact provenance and observe how missing Forge Kernel evidence and human governance sign-off keep Release fail-closed.`,
      recommendedWorkflowId: workflow.id,
      observations: [
        `Component boundary: ${component.ownershipBoundary}`,
        `Target Windmill flow (future): ${workflow.windmillFlowPath}`,
        'Remember: LexLean/PrismPM check & build outputs do not establish verification; independent Verify + Human Release Review are mandatory.',
      ],
      citedRepositories: [
        'JH9384/UOR-Workflow',
        component.repositoryName,
        'windmill-labs/windmill',
      ],
      generatedAt: now,
      isSimulated: true,
      targetRuntimeNote: 'Simulated AI response in Google AI Studio. Future runtime: LM Studio via Windmill (http://127.0.0.1:8080).',
    };

    const activity: ActivityEvent = {
      id: `act-${projectId}`,
      timestamp: now,
      actor: 'Operator (Browser Demo)',
      category: 'INTAKE',
      projectId,
      summary: `Submitted synthetic intake "${project.name}" assigned to ${component.name} and launched simulated workflow.`,
      isSimulated: true,
    };

    return { project, run: dispatchResult.data, verifications, artifact, approvals, advisory, activity };
  }

  advanceSimulationStep(
    run: WorkflowRun,
    project: ProjectRecord,
    verifications: VerificationSuiteRecord[]
  ): {
    updatedRun: WorkflowRun;
    updatedProject: ProjectRecord;
    updatedVerifications: VerificationSuiteRecord[];
    activity: ActivityEvent;
  } {
    const now = new Date().toISOString();
    const activeStage = run.stages.find((s) => s.status === 'RUNNING') ?? run.stages.find((s) => s.stageId === run.currentStageId);

    if (!activeStage) {
      return {
        updatedRun: run,
        updatedProject: project,
        updatedVerifications: verifications,
        activity: {
          id: `act-noop-${Date.now()}`,
          timestamp: now,
          actor: 'Workflow Simulator',
          category: 'WORKFLOW',
          projectId: project.id,
          summary: `Workflow "${run.workflowName}" is already halted at ${run.currentStageId.toUpperCase()} (${run.overallStatus}).`,
          isSimulated: true,
        },
      };
    }

    const stageId: WorkflowStageId = activeStage.stageId;
    const isReleaseStage = stageId === 'release';

    let outcome: 'COMPLETED' | 'BLOCKED' = 'COMPLETED';
    let summary = `Simulated stage "${activeStage.label}" completed in browser sandbox.`;

    if (stageId === 'plan') {
      summary = `Planned synthetic execution stages targeting ${run.windmillTargetPath}.`;
    } else if (stageId === 'build') {
      summary = 'Simulated closed-model build completed (remember: build does not establish verification).';
    } else if (stageId === 'test') {
      summary = 'Simulated fixture & unit conformance check completed (mock demo result).';
    } else if (stageId === 'verify') {
      summary = 'Simulated component check ran, while independent Forge Kernel & Browser suites remain NOT VERIFIED.';
    } else if (stageId === 'review') {
      summary = 'Simulated technical review inspected evidence gaps and flagged missing independent suites.';
    } else if (stageId === 'package') {
      summary = 'Simulated synthetic artifact manifest assembled; Release gate stays fail-closed.';
    } else if (isReleaseStage) {
      outcome = 'BLOCKED';
      summary = 'Fail-closed: Release cannot proceed without independent verification evidence and human governance approval.';
    }

    const res = this.simAdapter.advanceSimulatedStage(run, stageId, outcome, summary);
    const updatedRun = res.data ?? run;

    const updatedVerifications = verifications.map((v) => {
      if (v.projectId !== project.id) return v;
      if (stageId === 'verify' && v.isSimulated && v.epistemicCondition === 'DOCUMENTED') {
        return {
          ...v,
          status: 'PASS' as const,
          lastCheckedAt: now,
          executionRecord: 'Simulated console check passed (synthetic demo only — not real toolchain execution).',
        };
      }
      return v;
    });

    const nextStage = updatedRun.currentStageId;
    const updatedProject: ProjectRecord = {
      ...project,
      updatedAt: now,
      lifecycleStatus:
        nextStage === 'release' || updatedRun.overallStatus === 'BLOCKED'
          ? 'RELEASE BLOCKED'
          : nextStage === 'review'
            ? 'REVIEW REQUIRED'
            : 'IN WORKFLOW',
    };

    const activity: ActivityEvent = {
      id: `act-step-${Date.now()}`,
      timestamp: now,
      actor: 'Simulated Workflow Controller',
      category: 'WORKFLOW',
      projectId: project.id,
      summary: `${project.name}: ${activeStage.label} -> ${outcome}. Next gate: ${updatedRun.currentStageId.toUpperCase()}.`,
      isSimulated: true,
    };

    return { updatedRun, updatedProject, updatedVerifications, activity };
  }

  probeWindmillRuntime(): { ok: false; reason: string } {
    const res = this.liveAdapter.probeLiveConnection();
    return {
      ok: false,
      reason: res.data?.reason ?? res.error ?? 'NOT CONNECTED',
    };
  }

  generateSimulatedAdvisory(
    category: AiAdvisoryEntry['category'],
    promptText: string,
    project?: ProjectRecord
  ): AiAdvisoryEntry {
    const now = new Date().toISOString();
    const component = project
      ? ENGINEERING_COMPONENTS.find((c) => c.id === project.componentId)
      : undefined;

    let responseSummary = '';
    const observations: string[] = [];
    const citedRepositories: string[] = ['JH9384/UOR-Workflow'];

    if (category === 'research') {
      responseSummary =
        'Repository grounding shows UOR-Workflow defines the 7-gate fail-closed intake/governance lifecycle, LexLean provides Lean 4.32.1 kernel verification and production schemas, PrismPM coordinates .lex.tex -> .holo v4 builds, and lexlean-mcp defines E1..E10 host effects. Forge Kernel and Hologram Forge Application Core have no public authoritative source and must remain UNVERIFIED.';
      observations.push('Do not treat hologram-os as the Forge Application Core authority.');
      observations.push('Preserve separation between execution, technical qualification, and release authorization.');
      citedRepositories.push('UOR-Foundation/LexLean', 'UOR-Foundation/PrismPM', 'Hologram-Technologies/hologram-os');
    } else if (category === 'planning') {
      responseSummary = project
        ? `For "${project.name}", declare sanitized inputs under UOR-Workflow intake rules, lock dependencies with lexlean.lock, and separate simulated Windmill orchestration from local Mac Studio verification runners. Any unverified suite will automatically hold the Release gate at BLOCKED.`
        : 'Plan workflows around the 8-stage console pipeline (Intake -> Plan -> Build -> Test -> Verify -> Review -> Package -> Release), targeting Windmill workspace "uor-offline-foundry" at http://127.0.0.1:8080.';
      observations.push('Target Windmill flow path: /api/w/uor-offline-foundry/jobs/run/f/{flow_path}');
      observations.push('Keep raw logs, execution IDs, and credentials strictly in local controlled storage.');
      citedRepositories.push('windmill-labs/windmill', 'JH9384/UOR-Workflow');
    } else if (category === 'interpretation') {
      responseSummary = project
        ? `Interpretation for "${project.name}": "${project.releaseBlockedReasons[0] ?? 'Verification incomplete.'}" Under UOR-Workflow and LexLean rules, a passing check or build step does not establish verification; independent verification evidence and human governance disposition are both required.`
        : 'Verification interpretation follows lexlean-mcp honesty levels (some-true, build, open) and PrismPM RELEASE-STATUS.md boundaries: component passes never equal production SDK release acceptance.';
      observations.push('FAIL, NOT RUN, and NOT VERIFIED states all block release readiness.');
      observations.push('Only human release authorities may record release disposition.');
      citedRepositories.push('UOR-Foundation/lexlean-mcp', 'UOR-Foundation/PrismPM');
    } else {
      const recWf = component?.defaultWorkflowId ?? 'wf-uor-intake-standard';
      responseSummary = project
        ? `Recommended workflow for "${project.name}" (${component?.name ?? 'Selected Component'}): "${WORKFLOW_CATALOG.find((w) => w.id === recWf)?.name}". Route verification execution to local Mac Studio runners once Windmill is connected, while keeping AI restricted to non-authoritative advisory.`
        : 'Select "PrismPM Closed-Model Build & Hologram Packaging" for .lex.tex application targets, or "LexLean Formal Proof & Production Export" for formal verification crates.';
      observations.push(`Recommended Workflow ID: ${recWf}`);
      observations.push('AI is permanently blocked from authorizing product releases.');
      citedRepositories.push('UOR-Foundation/PrismPM', 'UOR-Foundation/LexLean');
    }

    return {
      id: `adv-${Date.now()}`,
      projectId: project?.id,
      category,
      promptSummary: promptText.trim(),
      responseSummary,
      recommendedWorkflowId: component?.defaultWorkflowId,
      observations,
      citedRepositories,
      generatedAt: now,
      isSimulated: true,
      targetRuntimeNote: 'Simulated response in Google AI Studio. Future runtime: LM Studio via Windmill (uor-offline-foundry).',
    };
  }

  buildPreviewStateForProject(project: ProjectRecord): PreviewConfigState {
    const component = ENGINEERING_COMPONENTS.find((c) => c.id === project.componentId);
    return {
      projectId: project.id,
      appTitle: project.name,
      subtitle: `${component?.name ?? project.componentId} · ${project.sourceRevision}`,
      layoutDensity: 'comfortable',
      showProvenanceFooter: true,
      showMonospaceOutputs: true,
      primaryActionLabel: 'Run Simulated Action',
      draftBannerNote: `Synthetic preview for ${project.productFamily} family · Not executed against live Windmill.`,
      customWidgets: [
        {
          id: `cw-${project.id}-rev`,
          label: 'Source Revision',
          kind: 'note',
          value: project.sourceRevision,
        },
      ],
      lastUpdatedAt: project.updatedAt,
    };
  }

  applyDraftProposalToPreview(
    current: PreviewConfigState,
    proposal: DraftChangeProposal
  ): PreviewConfigState {
    const now = new Date().toISOString();
    const updatedWidgets = proposal.addWidget
      ? [...current.customWidgets.filter((w) => w.id !== proposal.addWidget?.id), proposal.addWidget]
      : current.customWidgets;

    return {
      ...current,
      ...proposal.patch,
      customWidgets: updatedWidgets,
      lastUpdatedAt: now,
    };
  }

  processConversationTurn(params: {
    prompt: string;
    project: ProjectRecord;
    preview: PreviewConfigState;
    verifications: VerificationSuiteRecord[];
    referencedElement?: PreviewElementRef;
  }): {
    userMessage: ConversationMessage;
    assistantMessage: ConversationMessage;
    queuedItem?: OfflineQueueItem;
  } {
    const now = new Date().toISOString();
    const trimmed = params.prompt.trim();
    const lower = trimmed.toLowerCase();
    const component = ENGINEERING_COMPONENTS.find((c) => c.id === params.project.componentId);
    const projectVerifications = params.verifications.filter(
      (v) => v.projectId === params.project.id
    );

    const userMessage: ConversationMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: now,
      referencedElement: params.referencedElement,
      isSimulated: false,
    };

    // 1. Guardrail: if user asks AI to approve/verify/pass/release
    if (
      /\b(approve|authorize release|sign off|mark pass|mark verified|bypass)\b/.test(lower)
    ) {
      return {
        userMessage,
        assistantMessage: {
          id: `msg-a-${Date.now() + 1}`,
          role: 'assistant',
          content:
            `Simulated LM Studio response (NOT CONNECTED): I cannot establish verification evidence, alter authoritative suite results, or authorize a release for "${params.project.name}". Currently ${projectVerifications.filter((v) => v.status !== 'PASS').length} verification gates remain non-passing/unverified and Release Governance requires human review.`,
          timestamp: now,
          suggestedWorkflowAction: {
            label: 'Open Verify & Release',
            targetMode: 'verify',
          },
          isSimulated: true,
        },
      };
    }

    // 2. If user references a preview element or asks for a UI/layout/preview change
    if (
      params.referencedElement ||
      /\b(change|update|add|rename|compact|comfortable|monospace|footer|button|title|header|widget|preview|simplify)\b/.test(
        lower
      )
    ) {
      const target = params.referencedElement;
      const patch: DraftChangeProposal['patch'] = {};
      let addWidget: DraftChangeProposal['addWidget'] | undefined;
      let summary = 'Propose draft preview update';

      if (lower.includes('compact')) {
        patch.layoutDensity = 'compact';
        summary = 'Switch preview layout density to compact';
      } else if (lower.includes('comfortable') || lower.includes('spacious')) {
        patch.layoutDensity = 'comfortable';
        summary = 'Switch preview layout density to comfortable';
      } else if (target?.elementId === 'preview-primary-action' || lower.includes('button')) {
        const quoted = trimmed.match(/["']([^"']{2,36})["']/)?.[1];
        patch.primaryActionLabel = quoted ?? 'Simulate Verified Step';
        summary = `Update primary action label to "${patch.primaryActionLabel}"`;
      } else if (target?.elementId === 'preview-header' || lower.includes('title') || lower.includes('header')) {
        const quoted = trimmed.match(/["']([^"']{3,48})["']/)?.[1];
        if (quoted) {
          patch.appTitle = quoted;
          summary = `Rename preview header title to "${quoted}"`;
        } else {
          patch.subtitle = `${params.project.productFamily} draft · ${params.project.sourceRevision}`;
          summary = 'Refine preview header subtitle with product family and revision';
        }
      } else if (target?.elementId === 'preview-footer' || lower.includes('footer')) {
        patch.showProvenanceFooter = !params.preview.showProvenanceFooter;
        summary = patch.showProvenanceFooter
          ? 'Show provenance summary strip in preview footer'
          : 'Hide provenance summary strip in preview footer';
      } else if (lower.includes('monospace') || target?.elementId === 'preview-output') {
        patch.showMonospaceOutputs = true;
        addWidget = {
          id: `cw-draft-${Date.now()}`,
          label: target ? `${target.label} Note` : 'Draft Output Note',
          kind: 'note',
          value: trimmed.slice(0, 64),
        };
        summary = `Annotate ${target?.label ?? 'output panel'} with monospace draft note`;
      } else {
        addWidget = {
          id: `cw-draft-${Date.now()}`,
          label: target ? `Draft (${target.label})` : 'Draft Extension',
          kind: 'metric',
          value: trimmed.slice(0, 56),
        };
        summary = `Add draft specification block${target ? ` for ${target.label}` : ''}`;
      }

      const proposal: DraftChangeProposal = {
        id: `draft-${Date.now()}`,
        summary,
        targetElement: target,
        patch,
        addWidget,
        applied: false,
        isSimulated: true,
        authorityNote:
          'Draft UI proposal only. Does not modify authoritative .lex.tex sources, verification records, or release state.',
      };

      const queuedItem: OfflineQueueItem = {
        id: `oq-${Date.now()}`,
        projectId: params.project.id,
        kind: 'DRAFT_SYNC',
        label: `Draft proposal: ${summary}`,
        targetEndpoint: `http://127.0.0.1:8080/api/w/uor-offline-foundry/resources/drafts/${params.project.id}`,
        createdAt: now,
        status: 'QUEUED_LOCAL',
      };

      return {
        userMessage,
        assistantMessage: {
          id: `msg-a-${Date.now() + 1}`,
          role: 'assistant',
          content: `Simulated draft proposal prepared${target ? ` for "${target.label}"` : ''}. Apply it to inspect the updated Live Preview, and note that this draft has been queued locally for optional future sync to Mac Studio.`,
          timestamp: now,
          draftProposal: proposal,
          suggestedWorkflowAction: {
            label: 'Inspect in Preview',
            targetMode: 'preview',
          },
          isSimulated: true,
        },
        queuedItem,
      };
    }

    // 3. If user asks to run/build/queue workflow
    if (/\b(build|run|workflow|execute|queue|windmill|compile)\b/.test(lower)) {
      const queuedItem: OfflineQueueItem = {
        id: `oq-${Date.now()}`,
        projectId: params.project.id,
        kind: 'WORKFLOW_DISPATCH',
        label: `Queue ${component?.name ?? params.project.componentId} workflow step`,
        targetEndpoint: `http://127.0.0.1:8080/api/w/uor-offline-foundry/jobs/run/f/${params.project.workflowId}`,
        createdAt: now,
        status: 'QUEUED_LOCAL',
      };

      return {
        userMessage,
        assistantMessage: {
          id: `msg-a-${Date.now() + 1}`,
          role: 'assistant',
          content: `Simulated response (Windmill 127.0.0.1:8080 NOT CONNECTED): I queued a local offline action for "${params.project.name}" targeting workspace "uor-offline-foundry". You can step through the simulated 8-stage pipeline in Build mode right now without any live server connection.`,
          timestamp: now,
          suggestedWorkflowAction: {
            label: 'Open Build & Workflows',
            targetMode: 'build',
          },
          isSimulated: true,
        },
        queuedItem,
      };
    }

    // 4. Default contextual engineering interpretation
    const blockedCount = projectVerifications.filter((v) => v.status !== 'PASS').length;
    return {
      userMessage,
      assistantMessage: {
        id: `msg-a-${Date.now() + 1}`,
        role: 'assistant',
        content: `Simulated advisory for "${params.project.name}" (${component?.name ?? params.project.componentId}): Current lifecycle is ${params.project.lifecycleStatus} with ${blockedCount} verification gates unverified/incomplete. Click "Select Element" in the Live Preview panel to target a specific UI region for a draft change, or switch to Build / Verify & Release to inspect artifacts and governance holds.`,
        timestamp: now,
        suggestedWorkflowAction: {
          label: 'Review Verify & Release',
          targetMode: 'verify',
        },
        isSimulated: true,
      },
    };
  }
}

export const foundryService = new FoundryService();

