/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, Search, ShieldAlert, X } from 'lucide-react';
import { MockPreviewChatProvider } from './adapters/chatProviderAdapter';
import { IntakeModal } from './components/IntakeModal';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { BuildModePanel } from './components/studio/BuildModePanel';
import { ChatPanel } from './components/studio/ChatPanel';
import { LivePreviewPanel } from './components/studio/LivePreviewPanel';
import { SourceCompliancePanel } from './components/studio/SourceCompliancePanel';
import { VerifyReleasePanel, VerifySubTab } from './components/studio/VerifyReleasePanel';
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
  recoverWorkspaceSnapshot,
} from './services/durableLocalStore';
import {
  computeDeterministicPureStateHash,
  foundryService,
} from './services/foundryService';
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
  DraftHistoryEntry,
  DurableOperation,
  EngineeringIntakePayload,
  IntegrationMode,
  NavigationSectionId,
  OfflineQueueItem,
  PreviewConfigState,
  PreviewElementRef,
  ProjectCheckpoint,
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
  selectedProjectId?: string;
  activeThreadId?: string;
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  verifications: VerificationSuiteRecord[];
  artifacts: ArtifactProvenanceRecord[];
  approvals: ApprovalDecisionRecord[];
  advisories: AiAdvisoryEntry[];
  activity: ActivityEvent[];
  conversations: ConversationThread[];
  previews: Record<string, PreviewConfigState>;
  draftHistory: DraftHistoryEntry[];
  checkpoints: ProjectCheckpoint[];
  workflowRequests: WindmillExecutionRequest[];
  jobReferences: WindmillJobRecord[];
  operations: DurableOperation[];
  syncConflicts: SyncConflictRecord[];
  offlineQueue: OfflineQueueItem[];
}

interface OperatorNotice {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

const FIRST_RUN_DISMISSED_KEY = 'uor_foundry_first_run_dismissed_v1';

function createDefaultSnapshot(): DurableWorkspaceSnapshot {
  return {
    schemaVersion: 2,
    revision: 1,
    updatedAt: new Date().toISOString(),
    authoritativeDatabase: false,
    persistenceNotice:
      'Browser IndexedDB/localStorage cache only. Authoritative state lives in controlled Mac Studio repositories & Windmill.',
    integrationMode: 'DEMO',
    connectivityProfile: 'OFFLINE_ONLY',
    selectedProjectId: INITIAL_PROJECTS[0]?.id ?? 'proj-prism-calc',
    activeThreadId: INITIAL_CONVERSATIONS[0]?.id ?? 'thread-calc-main',
    projects: INITIAL_PROJECTS,
    runs: INITIAL_WORKFLOW_RUNS,
    verifications: INITIAL_VERIFICATION_SUITES,
    artifacts: INITIAL_ARTIFACTS,
    approvals: INITIAL_APPROVALS,
    advisories: INITIAL_AI_ADVISORIES,
    activity: INITIAL_ACTIVITY,
    conversations: INITIAL_CONVERSATIONS,
    previews: INITIAL_PREVIEW_STATES,
    draftHistory: [],
    checkpoints: [],
    workflowRequests: [],
    jobReferences: DEMO_WINDMILL_JOB_FIXTURES,
    operations: [],
    syncConflicts: [],
    offlineQueue: INITIAL_OFFLINE_QUEUE,
  };
}

function buildSeedState(partial?: Partial<DurableWorkspaceSnapshot> | null): AppWorkspaceState {
  const recovered = recoverWorkspaceSnapshot(partial, createDefaultSnapshot);
  const s = recovered.snapshot;
  return {
    revision: s.revision,
    integrationMode: 'DEMO',
    connectivityProfile: s.connectivityProfile,
    selectedProjectId: s.selectedProjectId,
    activeThreadId: s.activeThreadId,
    projects: s.projects,
    runs: s.runs,
    verifications: s.verifications,
    artifacts: s.artifacts,
    approvals: s.approvals,
    advisories: s.advisories,
    activity: s.activity,
    conversations: s.conversations,
    previews: s.previews,
    draftHistory: s.draftHistory ?? [],
    checkpoints: s.checkpoints ?? [],
    workflowRequests: s.workflowRequests,
    jobReferences: s.jobReferences,
    operations: s.operations,
    syncConflicts: s.syncConflicts,
    offlineQueue: s.offlineQueue,
  };
}

function loadInitialState(): AppWorkspaceState {
  const fallback = durableLocalStore.loadSyncFallback();
  return buildSeedState(fallback);
}

export default function App() {
  const initialLoaded = useMemo(() => loadInitialState(), []);
  const [state, setState] = useState<AppWorkspaceState>(initialLoaded);
  const [storageDiagnostics, setStorageDiagnostics] = useState<DurableStorageDiagnostics>({
    backend:
      typeof window !== 'undefined' && 'indexedDB' in window
        ? 'indexeddb+localstorage'
        : 'localstorage-fallback',
    indexedDbSupported: typeof window !== 'undefined' && 'indexedDB' in window,
    operationCount: 0,
    autoReplayPermitted: false,
    isAuthoritativeDatabase: false,
  });

  const [workspaceShell, setWorkspaceShell] = useState<'studio' | 'advanced'>('studio');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('chat');
  const [verifySubTab, setVerifySubTab] = useState<VerifySubTab>('evidence');
  const [activeSection, setActiveSection] = useState<NavigationSectionId>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () =>
      initialLoaded.selectedProjectId &&
      initialLoaded.projects.some((p) => p.id === initialLoaded.selectedProjectId)
        ? initialLoaded.selectedProjectId
        : initialLoaded.projects[0]?.id ?? 'proj-prism-calc'
  );
  const [activeThreadId, setActiveThreadId] = useState<string>(
    () =>
      initialLoaded.activeThreadId &&
      initialLoaded.conversations.some((t) => t.id === initialLoaded.activeThreadId)
        ? initialLoaded.activeThreadId
        : initialLoaded.conversations[0]?.id ?? 'thread-calc-main'
  );
  const [referencedElement, setReferencedElement] = useState<PreviewElementRef | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [quickSwitchQuery, setQuickSwitchQuery] = useState('');

  // Undo / Redo stacks per project
  const [undoStacks, setUndoStacks] = useState<Record<string, DraftHistoryEntry[]>>({});
  const [redoStacks, setRedoStacks] = useState<Record<string, DraftHistoryEntry[]>>({});

  // Operator feedback & first-run guide
  const [operatorNotice, setOperatorNotice] = useState<OperatorNotice | null>(null);
  const [showFirstRunGuide, setShowFirstRunGuide] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(FIRST_RUN_DISMISSED_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Async Chat provider state & cancellation controller
  const chatProvider = useMemo(() => new MockPreviewChatProvider(), []);
  const [chatGenState, setChatGenState] = useState<ChatGenerationState>('IDLE');
  const [chatError, setChatError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  const [lastRetryPrompt, setLastRetryPrompt] = useState<{
    prompt: string;
    referencedElement?: PreviewElementRef;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const notify = useCallback((tone: OperatorNotice['tone'], message: string) => {
    setOperatorNotice({
      id: `notice-${Date.now()}`,
      tone,
      message,
    });
  }, []);

  // Track browser online/offline changes explicitly without equating them with Windmill
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOffline = () => {
      setBrowserOnline(false);
      notify(
        'warning',
        'Browser network offline. Local workspace cache and simulated previews continue operating normally.'
      );
    };
    const handleOnline = () => {
      setBrowserOnline(true);
      notify(
        'info',
        'Browser network online (non-authoritative). Windmill runtime remains NOT CONNECTED until locally validated.'
      );
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [notify]);

  // Hydrate from IndexedDB if newer revision exists
  useEffect(() => {
    let active = true;
    durableLocalStore.loadFromIndexedDb().then((idbSnap) => {
      if (!active || !idbSnap) return;
      setState((prev) => {
        if ((idbSnap.revision ?? 0) > prev.revision) {
          const next = buildSeedState(idbSnap);
          if (
            next.selectedProjectId &&
            next.projects.some((p) => p.id === next.selectedProjectId)
          ) {
            setSelectedProjectId(next.selectedProjectId);
          }
          if (
            next.activeThreadId &&
            next.conversations.some((t) => t.id === next.activeThreadId)
          ) {
            setActiveThreadId(next.activeThreadId);
          }
          return next;
        }
        return prev;
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const buildSnapshotFromState = useCallback(
    (s: AppWorkspaceState, projId: string, threadId: string): DurableWorkspaceSnapshot => ({
      schemaVersion: 2,
      revision: s.revision,
      updatedAt: new Date().toISOString(),
      authoritativeDatabase: false,
      persistenceNotice:
        'Browser IndexedDB/localStorage cache only. Authoritative state lives in controlled Mac Studio repositories & Windmill.',
      integrationMode: s.integrationMode,
      connectivityProfile: s.connectivityProfile,
      selectedProjectId: projId,
      activeThreadId: threadId,
      projects: s.projects,
      runs: s.runs,
      verifications: s.verifications,
      artifacts: s.artifacts,
      approvals: s.approvals,
      advisories: s.advisories,
      activity: s.activity,
      conversations: s.conversations,
      previews: s.previews,
      draftHistory: s.draftHistory,
      checkpoints: s.checkpoints,
      workflowRequests: s.workflowRequests,
      jobReferences: s.jobReferences,
      operations: s.operations,
      syncConflicts: s.syncConflicts,
      offlineQueue: s.offlineQueue,
    }),
    []
  );

  // Persist workspace snapshot to IndexedDB + localStorage (non-authoritative local cache)
  useEffect(() => {
    let cancelled = false;
    const snapshot = buildSnapshotFromState(state, selectedProjectId, activeThreadId);
    durableLocalStore.saveSnapshot(snapshot).then((diag) => {
      if (!cancelled) {
        setStorageDiagnostics(diag);
        if (diag.quotaExceeded && diag.storageWarning) {
          notify('warning', diag.storageWarning);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [state, selectedProjectId, activeThreadId, buildSnapshotFromState, notify]);

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

  const projectCheckpoints = state.checkpoints.filter(
    (c) => c.projectId === activeProject?.id
  );
  const projectUndoStack = activeProject ? undoStacks[activeProject.id] ?? [] : [];
  const projectRedoStack = activeProject ? redoStacks[activeProject.id] ?? [] : [];

  const handleSelectProject = useCallback(
    (projectId: string) => {
      const now = new Date().toISOString();
      setSelectedProjectId(projectId);
      setReferencedElement(null);
      setState((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, lastOpenedAt: now } : p
        ),
      }));
      const firstThread = state.conversations.find((t) => t.projectId === projectId);
      if (firstThread) {
        setActiveThreadId(firstThread.id);
      }
    },
    [state.conversations]
  );

  const handleUndoDraft = useCallback(() => {
    if (!activeProject) return;
    const stack = undoStacks[activeProject.id] ?? [];
    if (stack.length === 0) return;
    const latest = stack[stack.length - 1];

    setUndoStacks((prev) => ({
      ...prev,
      [activeProject.id]: stack.slice(0, -1),
    }));
    setRedoStacks((prev) => ({
      ...prev,
      [activeProject.id]: [...(prev[activeProject.id] ?? []), latest],
    }));

    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      previews: {
        ...prev.previews,
        [activeProject.id]: latest.before,
      },
      draftHistory: [
        ...prev.draftHistory,
        {
          id: `hist-undo-${Date.now()}`,
          projectId: activeProject.id,
          summary: `Undo: ${latest.summary}`,
          timestamp: new Date().toISOString(),
          source: 'undo',
          before: latest.after,
          after: latest.before,
        },
      ],
    }));
    notify('info', `Reverted preview draft change: "${latest.summary}"`);
  }, [activeProject, undoStacks, notify]);

  const handleRedoDraft = useCallback(() => {
    if (!activeProject) return;
    const stack = redoStacks[activeProject.id] ?? [];
    if (stack.length === 0) return;
    const latest = stack[stack.length - 1];

    setRedoStacks((prev) => ({
      ...prev,
      [activeProject.id]: stack.slice(0, -1),
    }));
    setUndoStacks((prev) => ({
      ...prev,
      [activeProject.id]: [...(prev[activeProject.id] ?? []), latest],
    }));

    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      previews: {
        ...prev.previews,
        [activeProject.id]: latest.after,
      },
      draftHistory: [
        ...prev.draftHistory,
        {
          id: `hist-redo-${Date.now()}`,
          projectId: activeProject.id,
          summary: `Redo: ${latest.summary}`,
          timestamp: new Date().toISOString(),
          source: 'redo',
          before: latest.before,
          after: latest.after,
        },
      ],
    }));
    notify('info', `Re-applied preview draft change: "${latest.summary}"`);
  }, [activeProject, redoStacks, notify]);

  // Global keyboard shortcuts (Ctrl/Cmd+K quick switcher, Alt+1..4 modes, Ctrl/Cmd+Z undo, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSwitcherOpen((prev) => !prev);
        setQuickSwitchQuery('');
        return;
      }
      if (e.key === 'Escape') {
        setQuickSwitcherOpen(false);
        return;
      }
      if (e.altKey && workspaceShell === 'studio') {
        if (e.key === '1') {
          e.preventDefault();
          setWorkspaceMode('chat');
        } else if (e.key === '2') {
          e.preventDefault();
          setWorkspaceMode('preview');
        } else if (e.key === '3') {
          e.preventDefault();
          setWorkspaceMode('build');
        } else if (e.key === '4') {
          e.preventDefault();
          setWorkspaceMode('verify');
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (!isTextInput && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (projectUndoStack.length > 0) {
          e.preventDefault();
          handleUndoDraft();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workspaceShell, projectUndoStack.length, handleUndoDraft]);

  const handleRenameProject = (projectId: string, newName: string) => {
    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      projects: prev.projects.map((p) =>
        p.id === projectId ? { ...p, name: newName, updatedAt: now } : p
      ),
    }));
    notify('success', `Renamed project to "${newName}".`);
  };

  const handleDuplicateProject = (projectId: string) => {
    const source = state.projects.find((p) => p.id === projectId);
    if (!source) return;
    const copy = foundryService.duplicateProject(source);
    const copyPreview = foundryService.buildPreviewStateForProject(copy);
    const copyThread: ConversationThread = {
      id: `thread-${copy.id}`,
      projectId: copy.id,
      title: `${copy.name} · Session 1`,
      createdAt: copy.createdAt,
      updatedAt: copy.createdAt,
      messages: [
        {
          id: `msg-dup-${Date.now()}`,
          role: 'assistant',
          providerKind: chatProvider.providerKind,
          content: `Duplicated local demo project from "${source.name}". Independent verification and release governance remain separated and unverified.`,
          timestamp: copy.createdAt,
          isSimulated: true,
        },
      ],
    };

    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      projects: [copy, ...prev.projects],
      previews: {
        ...prev.previews,
        [copy.id]: copyPreview,
      },
      conversations: [copyThread, ...prev.conversations],
    }));
    setSelectedProjectId(copy.id);
    setActiveThreadId(copyThread.id);
    notify('success', `Duplicated project as "${copy.name}".`);
  };

  const handleToggleArchiveProject = (projectId: string) => {
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return;
    const nextArchived = !target.archived;
    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      projects: prev.projects.map((p) =>
        p.id === projectId ? { ...p, archived: nextArchived } : p
      ),
    }));
    if (nextArchived && selectedProjectId === projectId) {
      const nextActive = state.projects.find((p) => p.id !== projectId && !p.archived);
      if (nextActive) {
        setSelectedProjectId(nextActive.id);
      }
    }
    notify(
      'info',
      nextArchived
        ? `Archived project "${target.name}". Switch to Archived tab in sidebar to restore.`
        : `Restored project "${target.name}".`
    );
  };

  const handleRenameThread = (threadId: string, newTitle: string) => {
    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      conversations: prev.conversations.map((t) =>
        t.id === threadId ? { ...t, title: newTitle, updatedAt: now } : t
      ),
    }));
    notify('success', `Renamed conversation to "${newTitle}".`);
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
    notify('success', `Created synthetic project "${created.project.name}" and saved locally.`);
  };

  const executeChatPrompt = async (prompt: string, selectedRef?: PreviewElementRef) => {
    if (!activeProject) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    const userMessage: ConversationMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: now,
      referencedElement: selectedRef,
      retryPrompt: trimmed,
      isSimulated: false,
    };

    const targetThreadId = activeThread?.id;
    let resolvedThreadId = targetThreadId;

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

    setLastRetryPrompt({ prompt: trimmed, referencedElement: selectedRef });
    setChatError(null);
    setStreamingText('');
    setChatGenState('GENERATING');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const turnRequest = {
        prompt: trimmed,
        project: activeProject,
        preview: activePreview,
        verifications: state.verifications,
        referencedElement: selectedRef,
        history: activeThread?.messages ?? [],
      };
      const response = chatProvider.streamReply
        ? await chatProvider.streamReply(
            turnRequest,
            (partial) => setStreamingText(partial),
            { signal: controller.signal }
          )
        : await chatProvider.generateReply(turnRequest, { signal: controller.signal });

      setChatGenState('IDLE');
      setStreamingText('');
      setLastRetryPrompt(null);

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
      setStreamingText('');
      if (err instanceof DOMException && err.name === 'AbortError') {
        setChatGenState('CANCELLED');
        notify('warning', 'Generation cancelled by operator.');
      } else {
        const message =
          err instanceof Error ? err.message : 'Chat provider failed to generate response.';
        setChatGenState('ERROR');
        setChatError(message);
        notify('error', message);
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleSendChatMessage = (prompt: string) => {
    const selectedRef = referencedElement ?? undefined;
    setReferencedElement(null);
    void executeChatPrompt(prompt, selectedRef);
  };

  const handleRetryLastPrompt = () => {
    if (!lastRetryPrompt || chatGenState === 'GENERATING') return;
    void executeChatPrompt(lastRetryPrompt.prompt, lastRetryPrompt.referencedElement);
  };

  const handleCancelGeneration = () => {
    abortControllerRef.current?.abort();
  };

  const recordPreviewChange = (
    projectId: string,
    summary: string,
    before: PreviewConfigState,
    after: PreviewConfigState,
    source: DraftHistoryEntry['source']
  ): DraftHistoryEntry => {
    const entry: DraftHistoryEntry = {
      id: `hist-${Date.now()}`,
      projectId,
      summary,
      timestamp: new Date().toISOString(),
      source,
      before,
      after,
    };
    setUndoStacks((prev) => ({
      ...prev,
      [projectId]: [...(prev[projectId] ?? []), entry],
    }));
    setRedoStacks((prev) => ({
      ...prev,
      [projectId]: [],
    }));
    return entry;
  };

  const handleApproveDraftProposal = (messageId: string, proposalId: string) => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const currentPreview =
      state.previews[activeProject.id] ??
      foundryService.buildPreviewStateForProject(activeProject);

    let nextPreview = currentPreview;
    let approvedSummary = 'Draft proposal';

    for (const thread of state.conversations) {
      for (const msg of thread.messages) {
        if (msg.id === messageId && msg.draftProposal?.id === proposalId) {
          approvedSummary = msg.draftProposal.summary;
          nextPreview = foundryService.applyDraftProposalToPreview(
            currentPreview,
            msg.draftProposal
          );
        }
      }
    }

    const histEntry = recordPreviewChange(
      activeProject.id,
      approvedSummary,
      currentPreview,
      nextPreview,
      'proposal'
    );

    setState((prev) => {
      const updatedConversations = prev.conversations.map((thread) => ({
        ...thread,
        messages: thread.messages.map((msg) => {
          if (msg.id === messageId && msg.draftProposal?.id === proposalId) {
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
        draftHistory: [...prev.draftHistory, histEntry],
        operations: [op, ...prev.operations],
      };
    });
    notify('success', `Applied draft change to sandboxed Preview: "${approvedSummary}".`);
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
    notify('info', 'Draft change proposal rejected.');
  };

  const handleCreateCheckpoint = (name: string) => {
    if (!activeProject) return;
    const stateSha256 = computeDeterministicPureStateHash({
      projectId: activeProject.id,
      sourceRevision: activeProject.sourceRevision,
      preview: {
        appTitle: activePreview.appTitle,
        subtitle: activePreview.subtitle,
        layoutDensity: activePreview.layoutDensity,
        primaryActionLabel: activePreview.primaryActionLabel,
        showProvenanceFooter: activePreview.showProvenanceFooter,
        showMonospaceOutputs: activePreview.showMonospaceOutputs,
        customWidgets: activePreview.customWidgets,
      },
    });
    const cp: ProjectCheckpoint = {
      id: `cp-${Date.now()}`,
      projectId: activeProject.id,
      name,
      createdAt: new Date().toISOString(),
      stateSha256,
      semanticReplayScope: 'DETERMINISTIC_PURE_STATE_ONLY',
      preview: activePreview,
    };
    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      checkpoints: [cp, ...prev.checkpoints],
    }));
    notify('success', `Saved checkpoint "${name}" locally (sha:${stateSha256.slice(0, 12)}).`);
  };

  const handleRestoreCheckpoint = (checkpointId: string) => {
    if (!activeProject) return;
    const cp = state.checkpoints.find((c) => c.id === checkpointId);
    if (!cp) return;
    const histEntry = recordPreviewChange(
      activeProject.id,
      `Restore checkpoint "${cp.name}"`,
      activePreview,
      cp.preview,
      'checkpoint-restore'
    );
    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      previews: {
        ...prev.previews,
        [activeProject.id]: cp.preview,
      },
      draftHistory: [...prev.draftHistory, histEntry],
    }));
    notify('success', `Restored preview checkpoint "${cp.name}".`);
  };

  const handleResetPreview = () => {
    if (!activeProject) return;
    const baseline = foundryService.buildPreviewStateForProject(activeProject);
    const histEntry = recordPreviewChange(
      activeProject.id,
      'Reset preview to project baseline',
      activePreview,
      baseline,
      'reset'
    );
    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      previews: {
        ...prev.previews,
        [activeProject.id]: baseline,
      },
      draftHistory: [...prev.draftHistory, histEntry],
    }));
    notify('info', 'Reset sandboxed preview to baseline (reversible with Undo).');
  };

  const handleAdvanceSimulation = (runId: string) => {
    const targetRun = state.runs.find((r) => r.id === runId);
    if (!targetRun) return;
    const targetProject = state.projects.find((p) => p.id === targetRun.projectId);
    if (!targetProject) return;

    const { updatedRun, updatedProject, updatedVerifications, activity } =
      foundryService.advanceSimulationStep(targetRun, targetProject, state.verifications);

    setState((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      runs: prev.runs.map((r) => (r.id === updatedRun.id ? updatedRun : r)),
      projects: prev.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
      verifications: updatedVerifications,
      activity: [activity, ...prev.activity],
    }));
    notify('info', activity.summary);
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

    const queueItem: OfflineQueueItem = {
      id: `oq-wf-${Date.now()}`,
      projectId: project.id,
      kind: 'WORKFLOW_DISPATCH',
      label: `Staged intent: ${project.name} (${run?.currentStageId ?? 'intake'})`,
      targetEndpoint: `http://127.0.0.1:8080/api/w/uor-offline-foundry/jobs/run/f/${project.workflowId}`,
      createdAt: now,
      status: 'STAGED_LOCAL',
      revision: state.revision + 1,
      idempotencyKey,
      retryRequiresConfirmation: true,
      autoReplayPermitted: false,
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
        offlineQueue: [queueItem, ...prev.offlineQueue],
        operations: [op, ...prev.operations],
      };
    });
    notify('info', `Staged local workflow intent (${idempotencyKey}). Auto-replay disabled.`);
    return true;
  };

  const handleRetryQueuedItem = (_queueItemId: string, confirmed: boolean) => {
    if (!confirmed) return;
    notify(
      'error',
      'Retry blocked (fail-closed): Windmill runtime (http://127.0.0.1:8080) is NOT CONNECTED in DEMO mode.'
    );
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
    notify('success', `Downloaded allowlisted air-gapped metadata bundle: ${filename}`);
    return filename;
  };

  const handleExportLocalBackup = (): string => {
    const snapshot = buildSnapshotFromState(state, selectedProjectId, activeThreadId);
    const filename = durableLocalStore.downloadWorkspaceBackup(snapshot);
    notify('success', `Saved full local workspace backup: ${filename}`);
    return filename;
  };

  const handleRestoreLocalBackup = (rawJson: string): { ok: boolean; message: string } => {
    const result = durableLocalStore.parseWorkspaceBackup(rawJson, createDefaultSnapshot);
    if (!result.ok) {
      notify('error', result.error);
      return { ok: false, message: result.error };
    }
    const restoredState = buildSeedState(result.snapshot);
    setState(restoredState);
    if (
      restoredState.selectedProjectId &&
      restoredState.projects.some((p) => p.id === restoredState.selectedProjectId)
    ) {
      setSelectedProjectId(restoredState.selectedProjectId);
    }
    if (
      restoredState.activeThreadId &&
      restoredState.conversations.some((t) => t.id === restoredState.activeThreadId)
    ) {
      setActiveThreadId(restoredState.activeThreadId);
    }
    const msg = `Restored local workspace backup (${restoredState.projects.length} projects).`;
    notify('success', msg);
    return { ok: true, message: msg };
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

  const openSourceComplianceContext = () => {
    setVerifySubTab('compliance');
    setWorkspaceMode('verify');
  };

  const dismissFirstRunGuide = () => {
    setShowFirstRunGuide(false);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(FIRST_RUN_DISMISSED_KEY, '1');
      } catch {
        // Ignore restricted storage
      }
    }
  };

  const blockedReleaseCount = state.approvals.filter(
    (a) => a.disposition === 'BLOCKED' || a.disposition === 'DEFERRED'
  ).length;

  const quickSwitchProjects = state.projects.filter(
    (p) =>
      !p.archived &&
      (!quickSwitchQuery.trim() ||
        p.name.toLowerCase().includes(quickSwitchQuery.trim().toLowerCase()))
  );

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
            onRenameProject={handleRenameProject}
            onDuplicateProject={handleDuplicateProject}
            onToggleArchiveProject={handleToggleArchiveProject}
            onSelectThread={(threadId) => {
              setActiveThreadId(threadId);
              setWorkspaceMode('chat');
            }}
            onRenameThread={handleRenameThread}
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
              browserOnline={browserOnline}
              onSelectConnectivityProfile={(profile) =>
                setState((prev) => ({
                  ...prev,
                  revision: prev.revision + 1,
                  connectivityProfile: profile,
                }))
              }
              operations={state.operations}
              offlineQueue={state.offlineQueue}
              storageDiagnostics={storageDiagnostics}
              onPreviewAirGappedExport={handlePreviewAirGappedExport}
              onExportAirGappedBundle={handleExportAirGappedBundle}
              onExportLocalBackup={handleExportLocalBackup}
              onRestoreLocalBackup={handleRestoreLocalBackup}
              onRetryQueuedItem={handleRetryQueuedItem}
              onClearOperations={() =>
                setState((prev) => ({
                  ...prev,
                  revision: prev.revision + 1,
                  operations: [],
                }))
              }
              onOpenQuickSwitcher={() => {
                setQuickSwitcherOpen(true);
                setQuickSwitchQuery('');
              }}
              onOpenMobileMenu={() => setMobileMenuOpen(true)}
              onOpenAdvancedSection={openAdvancedSection}
            />

            {operatorNotice && (
              <div
                role="status"
                aria-live="polite"
                className={`px-4 lg:px-6 py-2 border-b text-xs flex items-center justify-between gap-3 ${
                  operatorNotice.tone === 'error'
                    ? 'bg-rose-950/35 border-rose-500/35 text-rose-200'
                    : operatorNotice.tone === 'warning'
                      ? 'bg-amber-950/30 border-amber-500/35 text-amber-200'
                      : operatorNotice.tone === 'success'
                        ? 'bg-emerald-950/30 border-emerald-500/35 text-emerald-200'
                        : 'bg-[#0F1726] border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {operatorNotice.tone === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                  ) : operatorNotice.tone === 'warning' || operatorNotice.tone === 'error' ? (
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">{operatorNotice.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOperatorNotice(null)}
                  className="text-slate-400 hover:text-white p-0.5 shrink-0"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <main className="flex-1 p-4 lg:p-5 max-w-[1600px] w-full mx-auto">
              {workspaceMode === 'chat' && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 h-[calc(100vh-7rem)] min-h-[560px]">
                  <div className="xl:col-span-7 h-full min-h-0">
                    <ChatPanel
                      project={activeProject}
                      preview={activePreview}
                      thread={activeThread}
                      integrationMode={state.integrationMode}
                      providerKind={chatProvider.providerKind}
                      generationState={chatGenState}
                      generationError={chatError}
                      streamingText={streamingText}
                      lastRetryPrompt={lastRetryPrompt?.prompt ?? null}
                      autosavedAt={storageDiagnostics.lastSavedAt}
                      storageWarning={storageDiagnostics.storageWarning}
                      showFirstRunGuide={showFirstRunGuide}
                      onDismissFirstRunGuide={dismissFirstRunGuide}
                      referencedElement={referencedElement}
                      onClearReferencedElement={() => setReferencedElement(null)}
                      onDismissError={() => {
                        setChatGenState('IDLE');
                        setChatError(null);
                      }}
                      onSendMessage={handleSendChatMessage}
                      onRetryLastPrompt={handleRetryLastPrompt}
                      onCancelGeneration={handleCancelGeneration}
                      onApproveDraftProposal={handleApproveDraftProposal}
                      onRejectDraftProposal={handleRejectDraftProposal}
                      onSwitchMode={setWorkspaceMode}
                      onOpenNewProject={() => setIntakeModalOpen(true)}
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
                      canUndo={projectUndoStack.length > 0}
                      canRedo={projectRedoStack.length > 0}
                      checkpoints={projectCheckpoints}
                      onUndoDraft={handleUndoDraft}
                      onRedoDraft={handleRedoDraft}
                      onCreateCheckpoint={handleCreateCheckpoint}
                      onRestoreCheckpoint={handleRestoreCheckpoint}
                      onResetPreview={handleResetPreview}
                      onSelectElement={(el) => setReferencedElement(el)}
                      onSwitchMode={setWorkspaceMode}
                      onOpenSourceCompliance={openSourceComplianceContext}
                    />
                  </div>
                </div>
              )}

              {workspaceMode === 'preview' && (
                <div className="h-[calc(100vh-7rem)] min-h-[560px]">
                  <LivePreviewPanel
                    project={activeProject}
                    preview={activePreview}
                    integrationMode={state.integrationMode}
                    run={activeRun}
                    artifacts={state.artifacts}
                    verifications={state.verifications}
                    selectedElement={referencedElement}
                    canUndo={projectUndoStack.length > 0}
                    canRedo={projectRedoStack.length > 0}
                    checkpoints={projectCheckpoints}
                    onUndoDraft={handleUndoDraft}
                    onRedoDraft={handleRedoDraft}
                    onCreateCheckpoint={handleCreateCheckpoint}
                    onRestoreCheckpoint={handleRestoreCheckpoint}
                    onResetPreview={handleResetPreview}
                    onSelectElement={(el) => {
                      setReferencedElement(el);
                      if (el) setWorkspaceMode('chat');
                    }}
                    onSwitchMode={setWorkspaceMode}
                    onOpenSourceCompliance={openSourceComplianceContext}
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
                  activeSubTab={verifySubTab}
                  onChangeSubTab={setVerifySubTab}
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

              {activeSection === 'compliance' && (
                <SourceCompliancePanel
                  project={activeProject}
                  projects={state.projects}
                  onSelectProject={handleSelectProject}
                  verifications={state.verifications}
                  artifacts={state.artifacts}
                  approvals={state.approvals}
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

      {/* Quick Project Switcher Modal (Ctrl/Cmd + K) */}
      {quickSwitcherOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/75"
          role="dialog"
          aria-modal="true"
          aria-label="Quick project switcher"
        >
          <div className="w-full max-w-md bg-[#111827] border border-slate-700 rounded-lg overflow-hidden shadow-2xl">
            <div className="p-3 border-b border-slate-800 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              <input
                type="text"
                value={quickSwitchQuery}
                onChange={(e) => setQuickSwitchQuery(e.target.value)}
                placeholder="Jump to project..."
                aria-label="Filter projects in quick switcher"
                autoFocus
                className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setQuickSwitcherOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
                aria-label="Close quick switcher"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-800/70">
              {quickSwitchProjects.length === 0 ? (
                <li className="p-4 text-xs text-slate-500 text-center">No matching projects.</li>
              ) : (
                quickSwitchProjects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectProject(p.id);
                        setQuickSwitcherOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-800/70 flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-100 font-medium truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {p.productFamily}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}

      <IntakeModal
        open={intakeModalOpen}
        onClose={() => setIntakeModalOpen(false)}
        onSubmit={handleIntakeSubmit}
      />
    </div>
  );
}
