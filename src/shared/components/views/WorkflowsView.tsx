import React from 'react';
import { Lock, Play, SkipForward } from 'lucide-react';
import { WORKFLOW_CATALOG } from '../../data/seedFoundryData';
import {
  NavigationSectionId,
  ProjectRecord,
  WorkflowRun,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface WorkflowsViewProps {
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onAdvanceSimulation: (runId: string) => void;
  onOpenIntake: () => void;
  onNavigate: (section: NavigationSectionId) => void;
}

export const WorkflowsView: React.FC<WorkflowsViewProps> = ({
  projects,
  runs,
  selectedProjectId,
  onSelectProject,
  onAdvanceSimulation,
  onOpenIntake,
  onNavigate,
}) => {
  const activeRun =
    runs.find((r) => r.projectId === selectedProjectId) ?? runs[0];
  const activeProject = activeRun
    ? projects.find((p) => p.id === activeRun.projectId)
    : undefined;

  const canStep =
    activeRun &&
    activeRun.stages.some((s) => s.status === 'RUNNING') &&
    activeRun.overallStatus !== 'FAILED';

  return (
    <div className="space-y-6">
      {/* Workflow Catalog */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-semibold text-sm text-slate-100">
              Engineering Workflow Catalog
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Grounded in JH9384/UOR-Workflow (REGISTER to REVIEW RELEASE) and UOR-Foundation/PrismPM
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Target Windmill Workspace: uor-offline-foundry
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
          {WORKFLOW_CATALOG.map((wf) => (
            <div key={wf.id} className="p-5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-slate-100">{wf.name}</h3>
                <StatusTag value={wf.epistemicCondition} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{wf.description}</p>
              <div className="pt-1 text-[11px] font-mono text-slate-500 space-y-1">
                <div>Source: {wf.sourceReference}</div>
                <div>Windmill Flow (Proposed): {wf.windmillFlowPath}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Active Simulated Workflow Run Inspector */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display font-semibold text-sm text-slate-100">
                Workflow Execution Pipeline
              </h2>
              <StatusTag value="SIMULATED" />
            </div>
            <p className="text-xs text-slate-400">
              Intake → Plan → Build → Test → Verify → Review → Package → Release
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Select workflow run by project"
              value={activeProject?.id ?? ''}
              onChange={(e) => onSelectProject(e.target.value)}
              className="px-3 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {runs.map((run) => {
                const proj = projects.find((p) => p.id === run.projectId);
                return (
                  <option key={run.id} value={run.projectId}>
                    {proj?.name ?? run.projectId} ({run.overallStatus})
                  </option>
                );
              })}
            </select>

            {activeRun && (
              <button
                type="button"
                disabled={!canStep}
                onClick={() => onAdvanceSimulation(activeRun.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap"
              >
                <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{canStep ? 'Step Simulated Stage' : 'Halted at Release Gate'}</span>
              </button>
            )}

            <button
              type="button"
              disabled
              title="Live Windmill execution disabled: http://127.0.0.1:8080 is NOT CONNECTED"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-900 border border-slate-800 rounded-md cursor-not-allowed whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Run on Live Windmill (Not Connected)</span>
            </button>
          </div>
        </div>

        {!activeRun ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-slate-400">No simulated workflow runs exist yet.</p>
            <button
              type="button"
              onClick={onOpenIntake}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md"
            >
              Create Synthetic Intake
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pb-4 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-3 font-mono">
                <span>Run: {activeRun.id}</span>
                <span aria-hidden="true">·</span>
                <span>Target Endpoint: {activeRun.windmillTargetPath}</span>
              </div>
              <StatusTag value={activeRun.overallStatus === 'BLOCKED' ? 'BLOCKED' : activeRun.overallStatus} />
            </div>

            {/* 8-Stage Stepper Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {activeRun.stages.map((stage, idx) => (
                <div
                  key={stage.stageId}
                  className={`p-4 rounded-md border flex flex-col justify-between gap-3 ${
                    stage.status === 'RUNNING'
                      ? 'bg-blue-950/20 border-blue-500/40'
                      : stage.status === 'BLOCKED'
                        ? 'bg-amber-950/15 border-amber-500/35'
                        : 'bg-[#0B0F17] border-slate-800'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-400 tabular-nums">
                        0{idx + 1}. {stage.label}
                      </span>
                      <StatusTag value={stage.status} />
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      UOR Gate: {stage.uorGate}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{stage.summary}</p>
                  </div>
                  <div className="pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 truncate">
                    {stage.commandOrContract ?? stage.executedBy}
                  </div>
                </div>
              ))}
            </div>

            {/* Release Blocker Explanation */}
            <div className="p-4 bg-[#0B0F17] border border-amber-500/30 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-medium text-amber-300">Fail-Closed Release Gate:</span>{' '}
                  Stage 08 (Release) remains blocked until independent verification suites pass on local Mac Studio hardware and a human release authority records approval.
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('verification')}
                  className="px-3 py-1.5 text-xs text-slate-200 border border-slate-700 hover:border-slate-600 rounded-md whitespace-nowrap"
                >
                  Check Evidence
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('approvals')}
                  className="px-3 py-1.5 text-xs text-slate-200 border border-slate-700 hover:border-slate-600 rounded-md whitespace-nowrap"
                >
                  View Approvals
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
