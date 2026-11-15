/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { IntakeModal } from './components/IntakeModal';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
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
  EngineeringIntakePayload,
  NavigationSectionId,
  ProjectRecord,
  VerificationSuiteRecord,
  WorkflowRun,
} from './types/foundry';

const STORAGE_KEY = 'uor_foundry_console_state_v1';

interface PersistedFoundryState {
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  verifications: VerificationSuiteRecord[];
  artifacts: ArtifactProvenanceRecord[];
  approvals: ApprovalDecisionRecord[];
  advisories: AiAdvisoryEntry[];
  activity: ActivityEvent[];
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
  };
}

export default function App() {
  const [state, setState] = useState<PersistedFoundryState>(loadInitialState);
  const [activeSection, setActiveSection] = useState<NavigationSectionId>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => loadInitialState().projects[0]?.id ?? 'proj-prism-calc'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota issues in restricted browser modes
    }
  }, [state]);

  const handleIntakeSubmit = async (payload: EngineeringIntakePayload) => {
    const created = await foundryService.createSyntheticProjectIntake(payload);
    setState((prev) => ({
      projects: [created.project, ...prev.projects],
      runs: [created.run, ...prev.runs],
      verifications: [...created.verifications, ...prev.verifications],
      artifacts: [created.artifact, ...prev.artifacts],
      approvals: [...created.approvals, ...prev.approvals],
      advisories: [created.advisory, ...prev.advisories],
      activity: [created.activity, ...prev.activity],
    }));
    setSelectedProjectId(created.project.id);
    setActiveSection('workflows');
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

  const blockedReleaseCount = state.approvals.filter(
    (a) => a.disposition === 'BLOCKED' || a.disposition === 'DEFERRED'
  ).length;

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#E6EDF5] flex">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        blockedReleaseCount={blockedReleaseCount}
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
              onSelectProject={setSelectedProjectId}
              onOpenIntake={() => setIntakeModalOpen(true)}
            />
          )}

          {activeSection === 'projects' && (
            <ProjectsView
              projects={state.projects}
              runs={state.runs}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              onOpenIntake={() => setIntakeModalOpen(true)}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'workflows' && (
            <WorkflowsView
              projects={state.projects}
              runs={state.runs}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
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
              onSelectProject={setSelectedProjectId}
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

      <IntakeModal
        open={intakeModalOpen}
        onClose={() => setIntakeModalOpen(false)}
        onSubmit={handleIntakeSubmit}
      />
    </div>
  );
}
