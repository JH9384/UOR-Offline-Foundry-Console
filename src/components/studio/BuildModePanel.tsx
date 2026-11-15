import React, { useState } from 'react';
import { Clock, ExternalLink, Lock, Play, SkipForward } from 'lucide-react';
import {
  ArtifactProvenanceRecord,
  NavigationSectionId,
  ProjectRecord,
  WorkflowRun,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';
import { ArtifactsView } from '../views/ArtifactsView';

interface BuildModePanelProps {
  project: ProjectRecord;
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  artifacts: ArtifactProvenanceRecord[];
  onAdvanceSimulation: (runId: string) => void;
  onQueueWindmillRun: (project: ProjectRecord, run?: WorkflowRun) => void;
  onOpenIntake: () => void;
  onOpenAdvancedSection: (section: NavigationSectionId) => void;
}

export const BuildModePanel: React.FC<BuildModePanelProps> = ({
  project,
  projects,
  runs,
  artifacts,
  onAdvanceSimulation,
  onQueueWindmillRun,
  onOpenIntake,
  onOpenAdvancedSection,
}) => {
  const [subTab, setSubTab] = useState<'pipeline' | 'artifacts'>('pipeline');
  const [queueFeedback, setQueueFeedback] = useState<string | null>(null);

  const activeRun = runs.find((r) => r.projectId === project.id);
  const projectArtifacts = artifacts.filter((a) => a.projectId === project.id);
  const canStep =
    activeRun &&
    activeRun.stages.some((s) => s.status === 'RUNNING') &&
    activeRun.overallStatus !== 'FAILED';

  const handleQueue = () => {
    onQueueWindmillRun(project, activeRun);
    setQueueFeedback(
      `Queued local workflow dispatch for "${project.name}" -> http://127.0.0.1:8080 (uor-offline-foundry).`
    );
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827] border border-slate-800/90 rounded-lg px-5 py-3">
        <div className="flex items-center gap-1 p-1 bg-[#090D14] border border-slate-800 rounded-md">
          <button
            type="button"
            onClick={() => setSubTab('pipeline')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              subTab === 'pipeline'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Workflow Pipeline
          </button>
          <button
            type="button"
            onClick={() => setSubTab('artifacts')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              subTab === 'artifacts'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Artifacts &amp; Provenance ({projectArtifacts.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenAdvancedSection('workflows')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
        >
          <span>Full Workflow Catalog</span>
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {subTab === 'pipeline' ? (
        <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-semibold text-sm text-slate-100">
                  {activeRun?.workflowName ?? 'Workflow Execution'}
                </h2>
                <StatusTag value="SIMULATED" />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {project.name} · {project.sourceRevision}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {activeRun && (
                <button
                  type="button"
                  disabled={!canStep}
                  onClick={() => onAdvanceSimulation(activeRun.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap"
                >
                  <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{canStep ? 'Step Simulated Stage' : 'Halted at Release Gate'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleQueue}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Queue for Local Windmill</span>
              </button>

              <button
                type="button"
                disabled
                title="Live Windmill at http://127.0.0.1:8080 is NOT CONNECTED"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-md cursor-not-allowed whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Live Windmill (Not Connected)</span>
              </button>
            </div>
          </div>

          {queueFeedback && (
            <div className="px-3.5 py-2.5 bg-blue-950/25 border border-blue-500/30 rounded text-xs text-blue-200 font-mono">
              {queueFeedback}
            </div>
          )}

          {!activeRun ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-400">
                No simulated workflow run initialized for this project yet.
              </p>
              <button
                type="button"
                onClick={onOpenIntake}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md"
              >
                Initialize via Engineering Intake
              </button>
            </div>
          ) : (
            <>
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
                        Gate: {stage.uorGate}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{stage.summary}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 truncate">
                      {stage.commandOrContract ?? stage.executedBy}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3.5 bg-[#0B0F17] border border-amber-500/30 rounded-md flex items-start gap-2.5 text-xs text-slate-300">
                <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Target Windmill endpoint: <span className="font-mono text-slate-200">{activeRun.windmillTargetPath}</span> (NOT CONNECTED). Simulated stages never establish real verification or release approval.
                </span>
              </div>
            </>
          )}
        </section>
      ) : (
        <ArtifactsView
          projects={projects}
          artifacts={projectArtifacts.length > 0 ? projectArtifacts : artifacts}
          selectedProjectId={project.id}
        />
      )}
    </div>
  );
};
