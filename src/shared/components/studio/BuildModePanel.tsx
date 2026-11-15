import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  SkipForward,
} from 'lucide-react';
import {
  ArtifactProvenanceRecord,
  DurableOperation,
  IntegrationMode,
  NavigationSectionId,
  ProjectRecord,
  WindmillJobRecord,
  WorkflowRun,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';
import { ArtifactsView } from '../views/ArtifactsView';

interface BuildModePanelProps {
  project: ProjectRecord;
  projects: ProjectRecord[];
  integrationMode: IntegrationMode;
  runs: WorkflowRun[];
  jobRecords: WindmillJobRecord[];
  artifacts: ArtifactProvenanceRecord[];
  operations: DurableOperation[];
  onAdvanceSimulation: (runId: string) => void;
  onStageWorkflowIntent: (project: ProjectRecord, idempotencyKey: string, run?: WorkflowRun) => boolean;
  onOpenIntake: () => void;
  onOpenAdvancedSection: (section: NavigationSectionId) => void;
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return 'Unavailable';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const BuildModePanel: React.FC<BuildModePanelProps> = ({
  project,
  projects,
  integrationMode,
  runs,
  jobRecords,
  artifacts,
  onAdvanceSimulation,
  onStageWorkflowIntent,
  onOpenIntake,
  onOpenAdvancedSection,
}) => {
  const [subTab, setSubTab] = useState<'pipeline' | 'execution' | 'artifacts'>('pipeline');
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);
  const [lastIdempotencyKey] = useState<string>(
    () => `idem-${project.id}-${project.sourceRevision.replace(/[^a-zA-Z0-9]/g, '')}`
  );

  const activeRun = runs.find((r) => r.projectId === project.id);
  const projectArtifacts = artifacts.filter((a) => a.projectId === project.id);
  const projectJobs = jobRecords.filter((j) => j.projectId === project.id);

  const canStep =
    activeRun &&
    activeRun.stages.some((s) => s.status === 'RUNNING') &&
    activeRun.overallStatus !== 'FAILED';

  const handleStageIntent = () => {
    const key = `${lastIdempotencyKey}-${activeRun?.currentStageId ?? 'intake'}`;
    const accepted = onStageWorkflowIntent(project, key, activeRun);
    if (accepted) {
      setDispatchNotice(
        `Staged local workflow intent (${key}). Auto-replay is disabled; live Windmill submission requires validated LOCAL mode.`
      );
    } else {
      setDispatchNotice(
        `Duplicate dispatch prevented: idempotency key "${key}" is already recorded in local durable state.`
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827] border border-slate-800/90 rounded-lg px-5 py-3">
        <div className="flex items-center gap-1 p-1 bg-[#090D14] border border-slate-800 rounded-md overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('pipeline')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              subTab === 'pipeline'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Simulated Pipeline
          </button>
          <button
            type="button"
            onClick={() => setSubTab('execution')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              subTab === 'execution'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Windmill Execution ({projectJobs.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('artifacts')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
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
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap"
        >
          <span>Full Workflow Catalog</span>
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {subTab === 'pipeline' && (
        <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-semibold text-sm text-slate-100">
                  {activeRun?.workflowName ?? 'Workflow Execution'}
                </h2>
                <StatusTag value={integrationMode} />
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
                onClick={handleStageIntent}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stage Local Intent</span>
              </button>

              <button
                type="button"
                disabled
                title="Live Windmill at http://127.0.0.1:8080 is NOT CONNECTED and flow registration is unvalidated."
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-md cursor-not-allowed whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Submit to Windmill (LOCAL Locked)</span>
              </button>
            </div>
          </div>

          {dispatchNotice && (
            <div className="px-3.5 py-2.5 bg-blue-950/25 border border-blue-500/30 rounded text-xs text-blue-200 font-mono">
              {dispatchNotice}
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
                  Proposed Windmill flow: <span className="font-mono text-slate-200">{activeRun.windmillTargetPath}</span> (UNREGISTERED PROPOSAL · NOT CONNECTED). Simulated stages never execute real Windmill jobs or establish verification evidence.
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {subTab === 'execution' && (
        <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-semibold text-sm text-slate-100">
                  Windmill Execution Records
                </h2>
                <StatusTag value="NOT CONNECTED" />
                <StatusTag value={integrationMode} />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Live Windmill workspace <span className="font-mono">uor-offline-foundry</span> is disconnected. Below records are strictly synthetic <span className="font-mono">DEMO</span> fixtures separated from genuine Mac Studio jobs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenAdvancedSection('connections')}
              className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
            >
              Inspect Windmill Adapter &rarr;
            </button>
          </div>

          {projectJobs.length === 0 ? (
            <div className="p-6 bg-[#0B0F17] border border-slate-800 rounded text-xs text-slate-400 text-center space-y-1.5">
              <p className="text-slate-200 font-medium">
                No Windmill execution records for {project.name}
              </p>
              <p>
                Genuine Windmill jobs appear only after Option A (authenticated local proxy) or Option B (`wmill.ts`) runtime authentication is validated.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {projectJobs.map((job) => (
                <article
                  key={job.jobId}
                  className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-100">
                          {job.jobId}
                        </span>
                        <StatusTag value={job.state} />
                        {job.isSyntheticFixture && <StatusTag value="DEMO" />}
                      </div>
                      <div className="text-xs text-slate-400">
                        {job.workflowName} · <span className="font-mono">{job.flowPath}</span> (v{job.flowVersion})
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!job.retryAvailable}
                        title={
                          job.retryAvailable
                            ? 'Retry job'
                            : 'Retry disabled: DEMO fixture / Windmill NOT CONNECTED'
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono border border-slate-800 bg-slate-900 text-slate-500 rounded cursor-not-allowed"
                      >
                        <RefreshCw className="w-3 h-3" aria-hidden="true" />
                        <span>Retry ({job.retryAvailable ? 'Ready' : 'Unavailable'})</span>
                      </button>
                    </div>
                  </div>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div>
                      <dt className="text-slate-500">Source Revision</dt>
                      <dd className="font-mono text-slate-200 mt-0.5">{job.sourceRevision}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Execution Duration</dt>
                      <dd className="font-mono text-slate-200 mt-0.5 tabular-nums">
                        {formatDuration(job.durationMs)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Flow Registration</dt>
                      <dd className="font-mono text-amber-300 mt-0.5">
                        {job.flowRegisteredInWorkspace ? 'Registered' : 'Unregistered Proposal'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Idempotency Key</dt>
                      <dd className="font-mono text-slate-300 mt-0.5 truncate">
                        {job.idempotencyKey}
                      </dd>
                    </div>
                  </dl>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-400">Execution Logs</div>
                      <pre className="p-3 bg-[#090D14] border border-slate-800/90 rounded text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                        {job.logs.join('\n')}
                      </pre>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-400">
                        Structured Result &amp; References
                      </div>
                      <pre className="p-3 bg-[#090D14] border border-slate-800/90 rounded text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                        {JSON.stringify(
                          {
                            structuredResult: job.structuredResult ?? {},
                            artifactRefs: job.artifactRefs,
                            evidenceRefs: job.evidenceRefs,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    {job.isSyntheticFixture ? (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5 text-indigo-300 shrink-0" aria-hidden="true" />
                        <span>
                          Synthetic fixture record (<span className="font-mono">isSyntheticFixture: true</span>). Supported Windmill states: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED, INTERRUPTED.
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                        <span>Genuine Windmill job record.</span>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {subTab === 'artifacts' && (
        <ArtifactsView
          projects={projects}
          artifacts={projectArtifacts.length > 0 ? projectArtifacts : artifacts}
          selectedProjectId={project.id}
        />
      )}
    </div>
  );
};
