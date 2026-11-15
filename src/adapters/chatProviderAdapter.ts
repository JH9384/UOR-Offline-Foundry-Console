import { ENGINEERING_COMPONENTS } from '../data/seedFoundryData';
import {
  ChatProviderKind,
  ConversationMessage,
  DraftChangeProposal,
  IntegrationMode,
  PreviewConfigState,
  PreviewElementRef,
  ProjectRecord,
  VerificationSuiteRecord,
} from '../types/foundry';

export interface ChatTurnRequest {
  prompt: string;
  project: ProjectRecord;
  preview: PreviewConfigState;
  verifications: VerificationSuiteRecord[];
  referencedElement?: PreviewElementRef;
  history: ConversationMessage[];
}

export interface ChatTurnResponse {
  providerKind: ChatProviderKind;
  assistantMessage: ConversationMessage;
  stagedOperationNote?: string;
}

export interface ChatProviderAdapter {
  readonly providerId: string;
  readonly providerKind: ChatProviderKind;
  readonly label: string;
  readonly isLiveModelConnected: boolean;

  generateReply(
    request: ChatTurnRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ChatTurnResponse>;

  streamReply?(
    request: ChatTurnRequest,
    onChunk: (partialContent: string) => void,
    options?: { signal?: AbortSignal }
  ): Promise<ChatTurnResponse>;
}

function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Generation cancelled by operator.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException('Generation cancelled by operator.', 'AbortError'));
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Browser-local mock provider used strictly in AI Studio preview.
 * Supports async generation, AbortSignal cancellation, element references,
 * and draft UI proposals requiring explicit operator approval.
 *
 * Does NOT call Google Gemini, external LLMs, or LM Studio directly.
 */
export class MockPreviewChatProvider implements ChatProviderAdapter {
  readonly providerId = 'mock-preview-chat-provider';
  readonly providerKind: ChatProviderKind = 'MOCK_PREVIEW_PROVIDER';
  readonly label = 'DEMO · Mock Chat Provider';
  readonly isLiveModelConnected = false;

  async streamReply(
    request: ChatTurnRequest,
    onChunk: (partialContent: string) => void,
    options?: { signal?: AbortSignal }
  ): Promise<ChatTurnResponse> {
    const response = await this.generateReply(request, options);
    const words = response.assistantMessage.content.split(' ');
    const step = Math.max(2, Math.ceil(words.length / 4));
    let built = '';
    for (let i = 0; i < words.length; i += step) {
      await waitWithAbort(55, options?.signal);
      built = words.slice(0, i + step).join(' ');
      onChunk(built);
    }
    return response;
  }

  async generateReply(
    request: ChatTurnRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ChatTurnResponse> {
    // Realistic short async turn delay so generating state & cancellation are testable
    await waitWithAbort(220, options?.signal);

    const now = new Date().toISOString();
    const trimmed = request.prompt.trim();
    const lower = trimmed.toLowerCase();
    const component = ENGINEERING_COMPONENTS.find((c) => c.id === request.project.componentId);
    const projectVerifications = request.verifications.filter(
      (v) => v.projectId === request.project.id
    );

    // Guardrail 1: AI cannot run shell, alter repos, verify suites, or authorize releases
    if (
      /\b(approve|authorize release|sign off|mark pass|mark verified|bypass|push to github|run shell|rm -rf|git push)\b/.test(
        lower
      )
    ) {
      return {
        providerKind: this.providerKind,
        assistantMessage: {
          id: `msg-a-${Date.now()}`,
          role: 'assistant',
          providerKind: this.providerKind,
          content:
            `[${this.label}] Refused privileged request: This assistant has zero shell, repository write, verification certification, or release approval privileges. "${request.project.name}" currently has ${
              projectVerifications.filter((v) => v.status !== 'PASS').length
            } non-passing/unverified suites and requires independent authority + human governance review.`,
          timestamp: now,
          suggestedWorkflowAction: {
            label: 'Inspect Verify & Release',
            targetMode: 'verify',
          },
          isSimulated: true,
        },
      };
    }

    // Guardrail 2: Simulate error testing if operator types "simulate error"
    if (lower === 'simulate error') {
      throw new Error('Simulated provider error: Windmill LM Studio runnable bridge is not reachable.');
    }

    // Proposal path: UI / preview change (requires explicit operator approval)
    if (
      request.referencedElement ||
      /\b(change|update|add|rename|compact|comfortable|monospace|footer|button|title|header|widget|preview|simplify)\b/.test(
        lower
      )
    ) {
      const target = request.referencedElement;
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
        patch.primaryActionLabel = quoted ?? 'Run Simulated Check';
        summary = `Update primary action label to "${patch.primaryActionLabel}"`;
      } else if (target?.elementId === 'preview-header' || lower.includes('title') || lower.includes('header')) {
        const quoted = trimmed.match(/["']([^"']{3,48})["']/)?.[1];
        if (quoted) {
          patch.appTitle = quoted;
          summary = `Rename preview header title to "${quoted}"`;
        } else {
          patch.subtitle = `${request.project.productFamily} draft · ${request.project.sourceRevision}`;
          summary = 'Refine preview header subtitle with family & revision';
        }
      } else if (target?.elementId === 'preview-footer' || lower.includes('footer')) {
        patch.showProvenanceFooter = !request.preview.showProvenanceFooter;
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
        status: 'PENDING_REVIEW',
        applied: false,
        isSimulated: true,
        authorityNote:
          'Requires explicit operator approval before updating the sandboxed preview. Does not modify .lex.tex sources, verification evidence, or release status.',
      };

      return {
        providerKind: this.providerKind,
        assistantMessage: {
          id: `msg-a-${Date.now()}`,
          role: 'assistant',
          providerKind: this.providerKind,
          content: `[${this.label}] Prepared draft proposal${
            target ? ` targeting "${target.label}"` : ''
          }. Review and approve or reject it below before applying to the sandboxed preview.`,
          timestamp: now,
          draftProposal: proposal,
          suggestedWorkflowAction: {
            label: 'Open Preview Panel',
            targetMode: 'preview',
          },
          isSimulated: true,
        },
        stagedOperationNote: `Staged draft proposal "${summary}" in local durable cache.`,
      };
    }

    // Build / workflow guidance (never creates fake queued Windmill jobs)
    if (/\b(build|run|workflow|execute|queue|windmill|compile)\b/.test(lower)) {
      return {
        providerKind: this.providerKind,
        assistantMessage: {
          id: `msg-a-${Date.now()}`,
          role: 'assistant',
          providerKind: this.providerKind,
          content: `[${this.label}] Live Windmill (http://127.0.0.1:8080, workspace uor-offline-foundry) is NOT CONNECTED, and flow "${request.project.workflowId}" is not validated as registered on a live server. Switch to Build mode to inspect the simulated workflow fixture or view the Windmill execution contract.`,
          timestamp: now,
          suggestedWorkflowAction: {
            label: 'Inspect Build & Execution',
            targetMode: 'build',
          },
          isSimulated: true,
        },
      };
    }

    // Default advisory grounded in project verification state
    const unverifiedCount = projectVerifications.filter((v) => v.status !== 'PASS').length;
    return {
      providerKind: this.providerKind,
      assistantMessage: {
        id: `msg-a-${Date.now()}`,
        role: 'assistant',
        providerKind: this.providerKind,
        content: `[${this.label}] Context for "${request.project.name}" (${component?.repositoryName ?? request.project.componentId}): Lifecycle is ${request.project.lifecycleStatus} with ${unverifiedCount} verification suites non-passing/unverified. Select any element in Live Preview to propose a draft UI change, or open Verify & Release to inspect independent evidence holds.`,
        timestamp: now,
        suggestedWorkflowAction: {
          label: 'Inspect Verify & Release',
          targetMode: 'verify',
        },
        isSimulated: true,
      },
    };
  }
}

/**
 * Contract for future real LM Studio advisory inference routed through a
 * validated Windmill backend runnable (`uor-offline-foundry/ai_advisory`).
 * Remains fail-closed until LOCAL Windmill connectivity & auth are validated.
 */
export class WindmillLmStudioChatProvider implements ChatProviderAdapter {
  readonly providerId = 'windmill-lm-studio-runnable';
  readonly providerKind: ChatProviderKind = 'WINDMILL_LM_STUDIO_RUNNABLE';
  readonly label = 'LOCAL · LM Studio via Windmill';
  readonly isLiveModelConnected = false;

  constructor(private readonly integrationMode: IntegrationMode) {}

  async generateReply(): Promise<ChatTurnResponse> {
    throw new Error(
      `LM Studio via Windmill backend runnable is unavailable (mode: ${this.integrationMode}, runtime NOT CONNECTED).`
    );
  }
}
