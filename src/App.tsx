/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MockPreviewChatProvider } from './adapters/chatProviderAdapter';
import { IntakeModal } from './components/IntakeModal';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { BuildModePanel } from './components/studio/BuildModePanel';
import { ChatPanel } from './components/studio/ChatPanel';
import { LivePreviewPanel } from './components/studio/LivePreviewPanel';
import { VerifyReleasePanel } from './components/studio/VerifyReleasePanel';
import { WorkspaceSidebar } from './components/studio/WorkspaceSidebar';
import { WorkspaceTopBar } from './components/studio/WorkspaceTopBar';
import { AiAssistanceView } from './components/views/AiAssistanceView';
import { ApprovalsView } from './components/views/ApprovalsView';
import { ArtifactsView } from './components/views/ArtifactsView';
import { ConnectionsView } from './components/views/ConnectionsView';
import { OverviewView } from './components/views/OverviewView';
import { ProjectsView } from './components/views/ProjectsView';
import { RepositoriesView } from './components/views/RepositoriesView';
import { VerificationView } from './components/views/VerificationView';
import { WorkflowsView } from './components/views/WorkflowsView';
import {
  DEMO_WINDMILL_JOB_FIXTURES,
  INITIAL_ACTIVITY,
  INITIAL_AI_ADVISORIES,
  INITIAL_APPROVALS,
  INITIAL_ARTIFACTS,
  INITIAL_CONNECTIONS,
  INITIAL_CONVERSATIONS,
  INITIAL_OFFLINE_QUEUE,
  INITIAL_PREVIEW_STATES,
  INITIAL_PROJECTS,
  INITIAL_VERIFICATION_SUITES,
  INITIAL_WORKFLOW_RUNS,
} from './data/seedFoundryData';
import {
  durableLocalStore,
  DurableStorageDiagnostics,
  DurableWorkspaceSnapshot,
} from './services/durableLocalStore';
import { foundryService } from './services/foundryService';
import { foundrySyncService } from './services/syncService';
import {
  ActivityEvent,
  AiAdvisoryEntry,
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ChatGenerationState,
  ConnectivityProfile,
  ConversationMessage,
  ConversationThread,
  DurableOperation,
  EngineeringIntakePayload,
  IntegrationMode,
  NavigationSectionId,
  OfflineQueueItem,
  PreviewConfigState,
  PreviewElementRef,
  ProjectRecord,
  SyncConflictRecord,
  VerificationSuiteRecord,
  WindmillExecutionRequest,
  WindmillJobRecord,
  WorkflowRun,
  WorkspaceMode,
} from './types/foundry';

interface AppWorkspaceState {
  revision: number;
  integrationMode: IntegrationMode;
  connectivityProfile: ConnectivityProfile;
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  verifications: VerificationSuiteRecord[];
  artifacts: ArtifactProvenanceRecord[];
  approvals: ApprovalDecisionRecord[];
  advisories: AiAdvisoryEntry[];
  activity: ActivityEvent[];
  conversations: ConversationThread[];
  previews: Record<string, PreviewConfigState>;
  workflowRequests: WindmillExecutionRequest[];
  jobReferences: WindmillJobRecord[];
  operations: DurableOperation[];
  syncConflicts: SyncConflictRecord[];
  offlineQueue: OfflineQueueItem[];
}

function buildSeedState(partial?: Partial<DurableWorkspaceSnapshot> | null): AppWorkspaceState {
  return {
    revision: partial?.revision ?? 1,
    integrationMode: 'DEMO', // LOCAL/ONLINE stay locked until backend auth & permissions are validated
    connectivityProfile: partial?.connectivityProfile ?? 'OFFLINE_ONLY',
    projects:
      Array.isArray(partial?.projects) && partial.projects.length > 0
        ? partial.projects
        : INITIAL_PROJECTS,
    runs: partial?.runs ?? INITIAL_WORKFLOW_RUNS,
    verifications: partial?.verifications ?? INITIAL_VERIFICATION_SUITES,
    artifacts: partial?.artifacts ?? INITIAL_ARTIFACTS,
    approvals: partial?.approvals ?? INITIAL_APPROVALS,
    advisories: partial?.advisories ?? INITIAL_AI_ADVISORIES,
    activity: partial?.activity ?? INITIAL_ACTIVITY,
    conversations: partial?.conversations ?? INITIAL_CONVERSATIONS,
    previews: partial?.previews ?? INITIAL_PREVIEW_STATES,
    workflowRequests: partial?.workflowRequests ?? [],
    jobReferences: partial?.jobReferences ?? DEMO_WINDMILL_JOB_FIXTURES,
    operations: partial?.operations ?? [],
    syncConflicts: partial?.syncConflicts ?? [],
    offlineQueue: partial?.offlineQueue ?? INITIAL_OFFLINE_QUEUE,
  };
}

function loadInitialState(): AppWorkspaceState {
  const fallback = durableLocalStore.loadSyncFallback();
  return buildSeedState(fallback);
}

export default function App() {
  const [state, setState] = useState<AppWorkspaceState>(loadInitialState);
  const [storageDiagnostics, setStorageDiagnostics] = useState<DurableStorageDiagnostics>({
    backend: typeof window !== 'undefined' && 'indexedDB' in window ? 'indexeddb+localstorage' : 'localstorage-fallback',
    indexedDbSupported: typeof window !== 'undefined' && 'indexedDB' in window,
    operationCount: 0,
    autoReplayPermitted: false,
    isAuthoritativeDatabase: false,
  });

  const [workspaceShell, setWorkspaceShell] = useState<'studio' | 'advanced'>('studio');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('chat');
  const [activeSection, setActiveSection] = useState<NavigationSectionId>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => loadInitialState().projects[0]?.id ?? 'proj-prism-calc'
  );
  const [activeThreadId, setActiveThreadId] = useState<string>(
    () => loadInitialState().conversations[0]?.id ?? 'thread-calc-main'
  );
  const [referencedElement, setReferencedElement] = useState<PreviewElementRef | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);

  // Async Chat provider state & cancellation controller
  const chatProvider = useMemo(() => new MockPreviewChatProvider(), []);
  const [chatGenState, setChatGenState] = useState<ChatGenerationState>('IDLE');
  const [chatError, setChatError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Hydrate from IndexedDB if newer revision exists
  useEffect(() => {
    let active = true;
    durableLocalStore.loadFromIndexedDb().then((idbSnap) => {
      if (!active || !idbSnap) return;
      setState((prev) => {
        if ((idbSnap.revision ?? 0) > prev.revision) {
          return buildSeedState(idbSnap);
        }
        return prev;
      });
    });
    return () => {
      active = false;
    };
  }, []);

  // Persist workspace snapshot to IndexedDB + localStorage (non-authoritative local cache)
  useEffect(() => {
    let cancelled = false;
    const snapshot: DurableWorkspaceSnapshot = {
      schemaVersion: 2,
      revision: state.revision,
      updatedAt: new Date().toISOString(),
      authoritativeDatabase: false,
      persistenceNotice:
        'Browser IndexedDB/localStorage cache only. Authoritative state lives in controlled Mac Studio repositories & Windmill.',
      integrationMode: state.integrationMode,
      connectivityProfile: state.connectivityProfile,
      projects: state.projects,
      runs: state.runs,
      verifications: state.verifications,
      artifacts: state.artifacts,
      approvals: state.approvals,
      advisories: state.advisories,
      activity: state.activity,
      conversations: state.conversations,
      previews: state.previews,
      workflowRequests: state.workflowRequests,
      jobReferences: state.jobReferences,
      operations: state.operations,
      syncConflicts: state.syncConflicts,
      offlineQueue: state.offlineQueue,
    };

    durableLocalStore.saveSnapshot(snapshot).then((diag) => {
      if (!cancelled) setStorageDiagnostics(diag);
    });

    return () => {
      cancelled = true;
    };
  }, [state]);

  const activeProject =
    state.projects.find((p) => p.id === selectedProjectId) ?? state.projects[0];

  const projectThreads = state.conversations.filter(
    (t) => t.projectId === activeProject?.id
  );
  const activeThread =
    projectThreads.find((t) => t.id === activeThreadId) ?? projectThreads[0];
  const activeRun = state.runs.find((r) => r.projectId === activeProject?.id);

  const activePreview: PreviewConfigState =
    (activeProject && state.previews[activeProject.id]) ||
    foundryService.buildPreviewStateForProject(activeProject);

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setReferencedElement(null);
    const firstThread = state.conversations.find((t) => t.projectId === projectId);
    if (firstThread) {
      setActiveThreadId(firstThread.id);
    }
  };

  const handleNewThread = () => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const count = projectThreads.length + 1;
    const newThread: ConversationThread = {
      id: `thread-${Date.now()}`,
      projectId: activeProject.id,
      title: `Session ${count} · ${activeProject.name}`,
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: `msg-init-${Date.now()}`,
          role: 'assistant',
          providerKind: chatProvider.providerKind,
          content: `Started a fresh local conversation thread for "${activeProject.name}" (${chatProvider.label}). Select any element in the Preview panel or describe a draft change below.`,
          timestamp: now,
          isSimulated: true,
        },
      ],
    };
    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      conversations: [newThread, ...prev.conversations],
    }));
    setActiveThreadId(newThread.id);
    setWorkspaceMode('chat');
  };

  const handleIntakeSubmit = async (payload: EngineeringIntakePayload) => {
    const created = await foundryService.createSyntheticProjectIntake(payload);
    const now = new Date().toISOString();
    const newPreview = foundryService.buildPreviewStateForProject(created.project);
    const newThread: ConversationThread = {
      id: `thread-${created.project.id}`,
      projectId: created.project.id,
      title: `${created.project.name} · Build Session`,
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: `msg-intake-${Date.now()}`,
          role: 'assistant',
          providerKind: chatProvider.providerKind,
          content: `Created synthetic DEMO project "${created.project.name}" and initialized a simulated workflow fixture. Inspect the sandboxed preview on the right or switch to Build / Verify & Release.`,
          timestamp: now,
          suggestedWorkflowAction: {
            label: 'Inspect Build Pipeline',
            targetMode: 'build',
          },
          isSimulated: true,
        },
      ],
    };

    setState((prev) => {
      const nextRev = prev.revision + 1;
      const op = durableLocalStore.createOperation({
        projectId: created.project.id,
        kind: 'PROJECT_DRAFT_SAVE',
        label: `Created synthetic intake draft "${created.project.name}"`,
        revision: nextRev,
        note: 'Browser-local demo intake saved; live Windmill untouched.',
      });

      return {
        ...prev,
        revision: nextRev,
        projects: [created.project, ...prev.projects],
        runs: [created.run, ...prev.runs],
        verifications: [...created.verifications, ...prev.verifications],
        artifacts: [created.artifact, ...prev.artifacts],
        approvals: [...created.approvals, ...prev.approvals],
        advisories: [created.advisory, ...prev.advisories],
        activity: [created.activity, ...prev.activity],
        conversations: [newThread, ...prev.conversations],
        previews: {
          ...prev.previews,
          [created.project.id]: newPreview,
        },
        operations: [op, ...prev.operations],
      };
    });
    setSelectedProjectId(created.project.id);
    setActiveThreadId(newThread.id);
    setReferencedElement(null);
    if (workspaceShell === 'studio') {
      setWorkspaceMode('chat');
    } else {
      setActiveSection('workflows');
    }
  };

  const handleSendChatMessage = async (prompt: string) => {
    if (!activeProject) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    const userMessage: ConversationMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: now,
      referencedElement: referencedElement ?? undefined,
      isSimulated: false,
    };

    const targetThreadId = activeThread?.id;
    let resolvedThreadId = targetThreadId;

    // Immediately append user message to conversation
    setState((prev) => {
      let updatedConversations: ConversationThread[];
      if (targetThreadId && prev.conversations.some((t) => t.id === targetThreadId)) {
        updatedConversations = prev.conversations.map((t) =>
          t.id === targetThreadId
            ? { ...t, updatedAt: now, messages: [...t.messages, userMessage] }
            : t
        );
      } else {
        const createdThread: ConversationThread = {
          id: `thread-${Date.now()}`,
          projectId: activeProject.id,
          title: trimmed.slice(0, 36),
          createdAt: now,
          updatedAt: now,
          messages: [userMessage],
        };
        resolvedThreadId = createdThread.id;
        updatedConversations = [createdThread, ...prev.conversations];
        setActiveThreadId(createdThread.id);
      }
      return {
        ...prev,
        revision: prev.revision + 1,
        conversations: updatedConversations,
      };
    });

    const selectedRef = referencedElement ?? undefined;
    setReferencedElement(null);
    setChatError(null);
    setChatGenState('GENERATING');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await chatProvider.generateReply(
        {
          prompt: trimmed,
          project: activeProject,
          preview: activePreview,
          verifications: state.verifications,
          referencedElement: selectedRef,
          history: activeThread?.messages ?? [],
        },
        { signal: controller.signal }
      );

      setChatGenState('IDLE');
      setState((prev) => {
        const nextRev = prev.revision + 1;
        const op = durableLocalStore.createOperation({
          projectId: activeProject.id,
          kind: 'CONVERSATION_TURN',
          label: response.stagedOperationNote ?? `Chat turn recorded (${response.providerKind})`,
          revision: nextRev,
          note: 'Local conversation turn cached; no external sync.',
        });

        return {
          ...prev,
          revision: nextRev,
          conversations: prev.conversations.map((t) =>
            t.id === resolvedThreadId
              ? {
                  ...t,
                  updatedAt: response.assistantMessage.timestamp,
                  messages: [...t.messages, response.assistantMessage],
                }
              : t
          ),
          operations: [op, ...prev.operations],
        };
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setChatGenState('CANCELLED');
      } else {
        setChatGenState('ERROR');
        setChatError(
          err instanceof Error ? err.message : 'Chat provider failed to generate response.'
        );
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelGeneration = () => {
    abortControllerRef.current?.abort();
  };

  const handleApproveDraftProposal = (messageId: string, proposalId: string) => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    setState((prev) => {
      const currentPreview =
        prev.previews[activeProject.id] ??
        foundryService.buildPreviewStateForProject(activeProject);

      let nextPreview = currentPreview;
      let approvedSummary = 'Draft proposal';

      const updatedConversations = prev.conversations.map((thread) => ({
        ...thread,
        messages: thread.messages.map((msg) => {
          if (msg.id === messageId && msg.draftProposal?.id === proposalId) {
            approvedSummary = msg.draftProposal.summary;
            nextPreview = foundryService.applyDraftProposalToPreview(
              currentPreview,
              msg.draftProposal
            );
            return {
              ...msg,
              draftProposal: {
                ...msg.draftProposal,
                status: 'APPROVED' as const,
                applied: true,
                decidedAt: now,
              },
            };
          }
          return msg;
        }),
      }));

      const nextRev = prev.revision + 1;
      const op = durableLocalStore.createOperation({
        projectId: activeProject.id,
        kind: 'DRAFT_APPROVAL',
        label: `Operator approved draft: ${approvedSummary}`,
        revision: nextRev,
        note: 'Applied to sandboxed preview only; authoritative sources & verification unchanged.',
      });

      return {
        ...prev,
        revision: nextRev,
        conversations: updatedConversations,
        previews: {
          ...prev.previews,
          [activeProject.id]: nextPreview,
        },
        operations: [op, ...prev.operations],
      };
    });
  };

  const handleRejectDraftProposal = (messageId: string, proposalId: string) => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      conversations: prev.conversations.map((thread) => ({
        ...thread,
        messages: thread.messages.map((msg) => {
          if (msg.id === messageId && msg.draftProposal?.id === proposalId) {
            return {
              ...msg,
              draftProposal: {
                ...msg.draftProposal,
                status: 'REJECTED' as const,
                applied: false,
                decidedAt: now,
              },
            };
          }
          return msg;
        }),
      })),
    }));
  };

  const handleAdvanceSimulation = (runId: string) => {
    setState((prev) => {
      const targetRun = prev.runs.find((r) => r.id === runId);
      if (!targetRun) return prev;
      const targetProject = prev.projects.find((p) => p.id === targetRun.projectId);
      if (!targetProject) return prev;

      const { updatedRun, updatedProject, updatedVerifications, activity } =
        foundryService.advanceSimulationStep(targetRun, targetProject, prev.verifications);

      return {
        ...prev,
        revision: prev.revision + 1,
        runs: prev.runs.map((r) => (r.id === updatedRun.id ? updatedRun : r)),
        projects: prev.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
        verifications: updatedVerifications,
        activity: [activity, ...prev.activity],
      };
    });
  };

  const handleStageWorkflowIntent = (
    project: ProjectRecord,
    idempotencyKey: string,
    run?: WorkflowRun
  ): boolean => {
    if (state.workflowRequests.some((req) => req.idempotencyKey === idempotencyKey)) {
      return false;
    }
    const now = new Date().toISOString();
    const request: WindmillExecutionRequest = {
      requestId: `req-${Date.now()}`,
      idempotencyKey,
      projectId: project.id,
      workflowId: project.workflowId,
      flowPath: run?.windmillTargetPath ?? project.workflowId,
      flowVersion: '0.4.0-proposed',
      sourceRevision: project.sourceRevision,
      operatorApproved: false,
      requestedAt: now,
    };

    setState((prev) => {
      const nextRev = prev.revision + 1;
      const op = durableLocalStore.createOperation({
        projectId: project.id,
        kind: 'WORKFLOW_INTENT_STAGED',
        label: `Staged local workflow intent (${project.name})`,
        revision: nextRev,
        note: `Idempotency key ${idempotencyKey}. Auto-replay disabled; requires validated LOCAL runtime.`,
      });
      return {
        ...prev,
        revision: nextRev,
        workflowRequests: [request, ...prev.workflowRequests],
        operations: [op, ...prev.operations],
      };
    });
    return true;
  };

  const handlePreviewAirGappedExport = () =>
    foundrySyncService.previewAirGappedExport({
      projects: state.projects,
      artifacts: state.artifacts,
      operations: state.operations,
    });

  const handleExportAirGappedBundle = (operatorConfirmed: boolean): string => {
    const bundle = foundrySyncService.buildAirGappedBundle({
      integrationMode: state.integrationMode,
      operatorConfirmed,
      projects: state.projects,
      operations: state.operations,
      artifacts: state.artifacts,
    });
    const filename = foundrySyncService.downloadAirGappedBundle(bundle);
    setState((prev) => {
      const nextRev = prev.revision + 1;
      const op = durableLocalStore.createOperation({
        projectId: activeProject?.id ?? 'workspace',
        kind: 'AIR_GAPPED_BUNDLE_EXPORT',
        label: `Exported sanitized metadata bundle (${filename})`,
        revision: nextRev,
        syncState: 'AIR_GAPPED_EXPORTED',
        note: 'Allowlisted plaintext JSON metadata downloaded.',
      });
      return {
        ...prev,
        revision: nextRev,
        operations: [op, ...prev.operations],
      };
    });
    return filename;
  };

  const handleGenerateAdvisory = (
    category: AiAdvisoryEntry['category'],
    promptText: string,
    projectId?: string
  ) => {
    const targetProject = projectId
      ? state.projects.find((p) => p.id === projectId)
      : undefined;
    const entry = foundryService.generateSimulatedAdvisory(category, promptText, targetProject);
    const activityEvent: ActivityEvent = {
      id: `act-ai-${Date.now()}`,
      timestamp: entry.generatedAt,
      actor: 'Simulated Advisory Engine',
      category: 'ADVISORY',
      projectId,
      summary: `Generated simulated ${category} advisory${targetProject ? ` for "${targetProject.name}"` : ''}.`,
      isSimulated: true,
    };
    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      advisories: [entry, ...prev.advisories],
      activity: [activityEvent, ...prev.activity],
    }));
  };

  const openAdvancedSection = (section: NavigationSectionId) => {
    setActiveSection(section);
    setWorkspaceShell('advanced');
  };

  const blockedReleaseCount = state.approvals.filter(
    (a) => a.disposition === 'BLOCKED' || a.disposition === 'DEFERRED'
  ).length;

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#E6EDF5] flex">
      {workspaceShell === 'studio' ? (
        <>
          <WorkspaceSidebar
            projects={state.projects}
            activeProjectId={activeProject.id}
            threads={state.conversations}
            activeThreadId={activeThread?.id ?? ''}
            onSelectProject={handleSelectProject}
            onSelectThread={(threadId) => {
              setActiveThreadId(threadId);
              setWorkspaceMode('chat');
            }}
            onNewThread={handleNewThread}
            onOpenNewProject={() => setIntakeModalOpen(true)}
            onOpenAdvancedConsole={() => openAdvancedSection('overview')}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />

          <div className="flex-1 flex flex-col min-w-0 min-h-screen">
            <WorkspaceTopBar
              activeProject={activeProject}
              mode={workspaceMode}
              onSelectMode={setWorkspaceMode}
              integrationMode={state.integrationMode}
              connectivityProfile={state.connectivityProfile}
              onSelectConnectivityProfile={(profile) =>
                setState((prev) => ({
                  ...prev,
                  revision: prev.revision + 1,
                  connectivityProfile: profile,
                }))
              }
              operations={state.operations}
              storageDiagnostics={storageDiagnostics}
              onPreviewAirGappedExport={handlePreviewAirGappedExport}
              onExportAirGappedBundle={handleExportAirGappedBundle}
              onClearOperations={() =>
                setState((prev) => ({
                  ...prev,
                  revision: prev.revision + 1,
                  operations: [],
                }))
              }
              onOpenMobileMenu={() => setMobileMenuOpen(true)}
              onOpenAdvancedSection={openAdvancedSection}
            />

            <main className="flex-1 p-4 lg:p-5 max-w-[1600px] w-full mx-auto">
              {workspaceMode === 'chat' && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 h-[calc(100vh-6rem)] min-h-[560px]">
                  <div className="xl:col-span-7 h-full min-h-0">
                    <ChatPanel
                      project={activeProject}
                      thread={activeThread}
                      integrationMode={state.integrationMode}
                      providerKind={chatProvider.providerKind}
                      generationState={chatGenState}
                      generationError={chatError}
                      referencedElement={referencedElement}
                      onClearReferencedElement={() => setReferencedElement(null)}
                      onDismissError={() => {
                        setChatGenState('IDLE');
                        setChatError(null);
                      }}
                      onSendMessage={handleSendChatMessage}
                      onCancelGeneration={handleCancelGeneration}
                      onApproveDraftProposal={handleApproveDraftProposal}
                      onRejectDraftProposal={handleRejectDraftProposal}
                      onSwitchMode={setWorkspaceMode}
                    />
                  </div>
                  <div className="xl:col-span-5 h-full min-h-0">
                    <LivePreviewPanel
                      project={activeProject}
                      preview={activePreview}
                      integrationMode={state.integrationMode}
                      run={activeRun}
                      artifacts={state.artifacts}
                      verifications={state.verifications}
                      selectedElement={referencedElement}
                      onSelectElement={(el) => setReferencedElement(el)}
                      onSwitchMode={setWorkspaceMode}
                    />
                  </div>
                </div>
              )}

              {workspaceMode === 'preview' && (
                <div className="h-[calc(100vh-6rem)] min-h-[560px]">
                  <LivePreviewPanel
                    project={activeProject}
                    preview={activePreview}
                    integrationMode={state.integrationMode}
                    run={activeRun}
                    artifacts={state.artifacts}
                    verifications={state.verifications}
                    selectedElement={referencedElement}
                    onSelectElement={(el) => {
                      setReferencedElement(el);
                      if (el) setWorkspaceMode('chat');
                    }}
                    onSwitchMode={setWorkspaceMode}
                  />
                </div>
              )}

              {workspaceMode === 'build' && (
                <BuildModePanel
                  project={activeProject}
                  projects={state.projects}
                  integrationMode={state.integrationMode}
                  runs={state.runs}
                  jobRecords={state.jobReferences}
                  artifacts={state.artifacts}
                  operations={state.operations}
                  onAdvanceSimulation={handleAdvanceSimulation}
                  onStageWorkflowIntent={handleStageWorkflowIntent}
                  onOpenIntake={() => setIntakeModalOpen(true)}
                  onOpenAdvancedSection={openAdvancedSection}
                />
              )}

              {workspaceMode === 'verify' && (
                <VerifyReleasePanel
                  project={activeProject}
                  projects={state.projects}
                  verifications={state.verifications}
                  artifacts={state.artifacts}
                  approvals={state.approvals}
                  onSelectProject={handleSelectProject}
                  onOpenAdvancedSection={openAdvancedSection}
                />
              )}
            </main>
          </div>
        </>
      ) : (
        <>
          <Sidebar
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
            blockedReleaseCount={blockedReleaseCount}
            onReturnToStudio={() => setWorkspaceShell('studio')}
          />

          <div className="flex-1 flex flex-col min-w-0 min-h-screen">
            <TopBar
              activeSection={activeSection}
              onOpenMobileMenu={() => setMobileMenuOpen(true)}
              onOpenIntake={() => setIntakeModalOpen(true)}
            />

            <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
              {activeSection === 'overview' && (
                <OverviewView
                  projects={state.projects}
                  runs={state.runs}
                  verifications={state.verifications}
                  approvals={state.approvals}
                  connections={INITIAL_CONNECTIONS}
                  activity={state.activity}
                  onNavigate={setActiveSection}
                  onSelectProject={handleSelectProject}
                  onOpenIntake={() => setIntakeModalOpen(true)}
                />
              )}

              {activeSection === 'projects' && (
                <ProjectsView
                  projects={state.projects}
                  runs={state.runs}
                  selectedProjectId={selectedProjectId}
                  onSelectProject={handleSelectProject}
                  onOpenIntake={() => setIntakeModalOpen(true)}
                  onNavigate={setActiveSection}
                />
              )}

              {activeSection === 'workflows' && (
                <WorkflowsView
                  projects={state.projects}
                  runs={state.runs}
                  selectedProjectId={selectedProjectId}
                  onSelectProject={handleSelectProject}
                  onAdvanceSimulation={handleAdvanceSimulation}
                  onOpenIntake={() => setIntakeModalOpen(true)}
                  onNavigate={setActiveSection}
                />
              )}

              {activeSection === 'verification' && (
                <VerificationView
                  projects={state.projects}
                  verifications={state.verifications}
                  selectedProjectId={selectedProjectId}
                  onSelectProject={handleSelectProject}
                />
              )}

              {activeSection === 'ai-assistance' && (
                <AiAssistanceView
                  projects={state.projects}
                  advisories={state.advisories}
                  selectedProjectId={selectedProjectId}
                  onGenerateAdvisory={handleGenerateAdvisory}
                />
              )}

              {activeSection === 'artifacts' && (
                <ArtifactsView
                  projects={state.projects}
                  artifacts={state.artifacts}
                  selectedProjectId={selectedProjectId}
                />
              )}

              {activeSection === 'approvals' && (
                <ApprovalsView
                  projects={state.projects}
                  approvals={state.approvals}
                />
              )}

              {activeSection === 'connections' && (
                <ConnectionsView connections={INITIAL_CONNECTIONS} />
              )}

              {activeSection === 'repositories' && <RepositoriesView />}
            </main>
          </div>
        </>
      )}

      <IntakeModal
        open={intakeModalOpen}
        onClose={() => setIntakeModalOpen(false)}
        onSubmit={handleIntakeSubmit}
      />
    </div>
  );
}
