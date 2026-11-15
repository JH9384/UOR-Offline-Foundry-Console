/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
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
import { foundryService } from './services/foundryService';
import {
  ActivityEvent,
  AiAdvisoryEntry,
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ConversationThread,
  EngineeringIntakePayload,
  NavigationSectionId,
  OfflineQueueItem,
  PreviewConfigState,
  PreviewElementRef,
  ProjectRecord,
  VerificationSuiteRecord,
  WorkflowRun,
  WorkspaceMode,
} from './types/foundry';

const STORAGE_KEY = 'uor_foundry_console_state_v2';

interface PersistedFoundryState {
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  verifications: VerificationSuiteRecord[];
  artifacts: ArtifactProvenanceRecord[];
  approvals: ApprovalDecisionRecord[];
  advisories: AiAdvisoryEntry[];
  activity: ActivityEvent[];
  conversations: ConversationThread[];
  previews: Record<string, PreviewConfigState>;
  offlineQueue: OfflineQueueItem[];
  onlineSyncPreference: 'OFFLINE_ONLY' | 'SYNC_STANDBY';
}

function loadInitialState(): PersistedFoundryState {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedFoundryState>;
        if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
          return {
            projects: parsed.projects,
            runs: parsed.runs ?? INITIAL_WORKFLOW_RUNS,
            verifications: parsed.verifications ?? INITIAL_VERIFICATION_SUITES,
            artifacts: parsed.artifacts ?? INITIAL_ARTIFACTS,
            approvals: parsed.approvals ?? INITIAL_APPROVALS,
            advisories: parsed.advisories ?? INITIAL_AI_ADVISORIES,
            activity: parsed.activity ?? INITIAL_ACTIVITY,
            conversations: parsed.conversations ?? INITIAL_CONVERSATIONS,
            previews: parsed.previews ?? INITIAL_PREVIEW_STATES,
            offlineQueue: parsed.offlineQueue ?? INITIAL_OFFLINE_QUEUE,
            onlineSyncPreference: parsed.onlineSyncPreference ?? 'OFFLINE_ONLY',
          };
        }
      }
    } catch {
      // Fallback safely to seed data if localStorage is malformed
    }
  }

  return {
    projects: INITIAL_PROJECTS,
    runs: INITIAL_WORKFLOW_RUNS,
    verifications: INITIAL_VERIFICATION_SUITES,
    artifacts: INITIAL_ARTIFACTS,
    approvals: INITIAL_APPROVALS,
    advisories: INITIAL_AI_ADVISORIES,
    activity: INITIAL_ACTIVITY,
    conversations: INITIAL_CONVERSATIONS,
    previews: INITIAL_PREVIEW_STATES,
    offlineQueue: INITIAL_OFFLINE_QUEUE,
    onlineSyncPreference: 'OFFLINE_ONLY',
  };
}

export default function App() {
  const [state, setState] = useState<PersistedFoundryState>(loadInitialState);
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

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota issues in restricted browser modes
    }
  }, [state]);

  const activeProject =
    state.projects.find((p) => p.id === selectedProjectId) ?? state.projects[0];

  const projectThreads = state.conversations.filter(
    (t) => t.projectId === activeProject?.id
  );
  const activeThread =
    projectThreads.find((t) => t.id === activeThreadId) ?? projectThreads[0];

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
          content: `Started a fresh local conversation thread for "${activeProject.name}". Select any element in the Live Preview panel or describe a draft change below.`,
          timestamp: now,
          isSimulated: true,
        },
      ],
    };
    setState((prev) => ({
      ...prev,
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
          content: `Created synthetic project "${created.project.name}" and initialized a simulated workflow. You can inspect the interactive preview on the right, select elements to propose draft changes, or switch to Build / Verify & Release.`,
          timestamp: now,
          suggestedWorkflowAction: {
            label: 'Inspect Build Pipeline',
            targetMode: 'build',
          },
          isSimulated: true,
        },
      ],
    };

    const queuedIntake: OfflineQueueItem = {
      id: `oq-intake-${Date.now()}`,
      projectId: created.project.id,
      kind: 'WORKFLOW_DISPATCH',
      label: `Queued intake workflow for ${created.project.name}`,
      targetEndpoint: `http://127.0.0.1:8080/api/w/uor-offline-foundry/jobs/run/f/${created.run.workflowId}`,
      createdAt: now,
      status: 'QUEUED_LOCAL',
    };

    setState((prev) => ({
      ...prev,
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
      offlineQueue: [queuedIntake, ...prev.offlineQueue],
    }));
    setSelectedProjectId(created.project.id);
    setActiveThreadId(newThread.id);
    setReferencedElement(null);
    if (workspaceShell === 'studio') {
      setWorkspaceMode('chat');
    } else {
      setActiveSection('workflows');
    }
  };

  const handleSendChatMessage = (prompt: string) => {
    if (!activeProject) return;
    const result = foundryService.processConversationTurn({
      prompt,
      project: activeProject,
      preview: activePreview,
      verifications: state.verifications,
      referencedElement: referencedElement ?? undefined,
    });

    const targetThreadId = activeThread?.id;
    const now = new Date().toISOString();

    setState((prev) => {
      let updatedConversations: ConversationThread[];
      if (targetThreadId && prev.conversations.some((t) => t.id === targetThreadId)) {
        updatedConversations = prev.conversations.map((t) =>
          t.id === targetThreadId
            ? {
                ...t,
                updatedAt: now,
                messages: [...t.messages, result.userMessage, result.assistantMessage],
              }
            : t
        );
      } else {
        const createdThread: ConversationThread = {
          id: `thread-${Date.now()}`,
          projectId: activeProject.id,
          title: prompt.slice(0, 36),
          createdAt: now,
          updatedAt: now,
          messages: [result.userMessage, result.assistantMessage],
        };
        updatedConversations = [createdThread, ...prev.conversations];
        setActiveThreadId(createdThread.id);
      }

      return {
        ...prev,
        conversations: updatedConversations,
        offlineQueue: result.queuedItem
          ? [result.queuedItem, ...prev.offlineQueue]
          : prev.offlineQueue,
      };
    });

    setReferencedElement(null);
  };

  const handleApplyDraftProposal = (messageId: string, proposalId: string) => {
    if (!activeProject) return;
    setState((prev) => {
      const currentPreview =
        prev.previews[activeProject.id] ??
        foundryService.buildPreviewStateForProject(activeProject);

      let nextPreview = currentPreview;
      const updatedConversations = prev.conversations.map((thread) => ({
        ...thread,
        messages: thread.messages.map((msg) => {
          if (msg.id === messageId && msg.draftProposal?.id === proposalId) {
            nextPreview = foundryService.applyDraftProposalToPreview(
              currentPreview,
              msg.draftProposal
            );
            return {
              ...msg,
              draftProposal: { ...msg.draftProposal, applied: true },
            };
          }
          return msg;
        }),
      }));

      return {
        ...prev,
        conversations: updatedConversations,
        previews: {
          ...prev.previews,
          [activeProject.id]: nextPreview,
        },
      };
    });
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
        runs: prev.runs.map((r) => (r.id === updatedRun.id ? updatedRun : r)),
        projects: prev.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
        verifications: updatedVerifications,
        activity: [activity, ...prev.activity],
      };
    });
  };

  const handleQueueWindmillRun = (project: ProjectRecord, run?: WorkflowRun) => {
    const now = new Date().toISOString();
    const item: OfflineQueueItem = {
      id: `oq-wf-${Date.now()}`,
      projectId: project.id,
      kind: 'WORKFLOW_DISPATCH',
      label: `Windmill run queued: ${project.name} (${run?.currentStageId.toUpperCase() ?? 'INTAKE'})`,
      targetEndpoint:
        run?.windmillTargetPath ??
        `http://127.0.0.1:8080/api/w/uor-offline-foundry/jobs/run/f/${project.workflowId}`,
      createdAt: now,
      status: 'QUEUED_LOCAL',
    };
    setState((prev) => ({
      ...prev,
      offlineQueue: [item, ...prev.offlineQueue],
    }));
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
              offlineQueue={state.offlineQueue}
              onlineSyncPreference={state.onlineSyncPreference}
              onToggleOnlineSync={() =>
                setState((prev) => ({
                  ...prev,
                  onlineSyncPreference:
                    prev.onlineSyncPreference === 'OFFLINE_ONLY'
                      ? 'SYNC_STANDBY'
                      : 'OFFLINE_ONLY',
                }))
              }
              onClearQueue={() =>
                setState((prev) => ({
                  ...prev,
                  offlineQueue: [],
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
                      referencedElement={referencedElement}
                      onClearReferencedElement={() => setReferencedElement(null)}
                      onSendMessage={handleSendChatMessage}
                      onApplyDraftProposal={handleApplyDraftProposal}
                      onSwitchMode={setWorkspaceMode}
                    />
                  </div>
                  <div className="xl:col-span-5 h-full min-h-0">
                    <LivePreviewPanel
                      project={activeProject}
                      preview={activePreview}
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
                  runs={state.runs}
                  artifacts={state.artifacts}
                  onAdvanceSimulation={handleAdvanceSimulation}
                  onQueueWindmillRun={handleQueueWindmillRun}
                  onOpenIntake={() => setIntakeModalOpen(true)}
                  onOpenAdvancedSection={openAdvancedSection}
                />
              )}

              {workspaceMode === 'verify' && (
                <VerifyReleasePanel
                  project={activeProject}
                  projects={state.projects}
                  verifications={state.verifications}
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
