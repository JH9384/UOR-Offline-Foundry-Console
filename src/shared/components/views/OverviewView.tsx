import React, { useState } from 'react';
import { ArrowRight, Download, Lock, Plus, ShieldAlert } from 'lucide-react';
import { ENGINEERING_COMPONENTS } from '../../data/seedFoundryData';
import {
  ActivityEvent,
  ApprovalDecisionRecord,
  NavigationSectionId,
  ProjectRecord,
  SystemConnectionRecord,
  VerificationSuiteRecord,
  WorkflowRun,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';
import { WindmillExecutionService } from '../../adapters/windmillExecutionService';
import { JobRegistryPanel } from '../studio/JobRegistryPanel';

interface OverviewViewProps {
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  verifications: VerificationSuiteRecord[];
  approvals: ApprovalDecisionRecord[];
  connections: SystemConnectionRecord[];
  activity: ActivityEvent[];
  onNavigate: (section: NavigationSectionId) => void;
  onSelectProject: (projectId: string) => void;
  onOpenIntake: () => void;
  windmillService?: WindmillExecutionService;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  projects,
  runs,
  verifications,
  approvals,
  connections,
  activity,
  onNavigate,
  onSelectProject,
  onOpenIntake,
  windmillService,
}) => {
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const blockedProjects = projects.filter((p) => p.lifecycleStatus === 'RELEASE BLOCKED').length;
  const unverifiedSuites = verifications.filter((v) => v.status === 'NOT VERIFIED').length;
  const pendingApprovals = approvals.filter(
    (a) => a.disposition === 'PENDING' || a.disposition === 'DEFERRED' || a.disposition === 'BLOCKED'
  ).length;
  const connectedCount = connections.filter((c) => c.status !== 'NOT CONNECTED').length;

  const handleExportActivityLog = () => {
    const exportedAt = new Date().toISOString();
    const payload = {
      schema: 'uor.foundry.activity-audit-log.v1',
      exportKind: 'CONSOLE_ACTIVITY_AUDIT_EXPORT',
      workspace: 'uor-offline-foundry',
      targetRuntime: 'http://127.0.0.1:8080 (NOT CONNECTED)',
      exportedAt,
      eventCount: activity.length,
      notice:
        'Browser-local console activity audit export. Simulated or advisory entries do not constitute authoritative verification or release approval.',
      events: activity,
    };

    const dateSlug = exportedAt.slice(0, 10);
    const filename = `uor-foundry-activity-log-${dateSlug}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportNotice(`Exported ${activity.length} audit events to ${filename}`);
  };

  return (
    <div className="space-y-6">
      {/* Honest Operational Boundary Summary */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-200">UOR Foundry Sovereign Control Surface</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Target: http://127.0.0.1:8080</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Workspace: uor-offline-foundry</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            Operating in browser-local simulation mode. Independent engineering systems (LexLean, PrismPM, Forge Kernel, Hologram Forge Application Core) and Windmill/LM Studio integrations remain <span className="font-mono text-rose-300">NOT CONNECTED</span>.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenIntake}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Launch Synthetic Intake Demo</span>
          </button>
        </div>
      </section>

      {/* Primary KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Tracked Projects</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-display font-semibold tabular-nums text-slate-100">
              {projects.length}
            </span>
            <span className="text-xs font-mono text-amber-300 tabular-nums">
              {blockedProjects} Release Blocked
            </span>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Workflow Runs (Simulated)</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-display font-semibold tabular-nums text-slate-100">
              {runs.length}
            </span>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {runs.filter((r) => r.overallStatus === 'RUNNING').length} active
            </span>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Verification & Acceptance</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-display font-semibold tabular-nums text-slate-100">
              {verifications.length}
            </span>
            <span className="text-xs font-mono text-amber-300 tabular-nums">
              {unverifiedSuites} NOT VERIFIED
            </span>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">External Connections</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-display font-semibold tabular-nums text-slate-100">
              {connectedCount}/{connections.length}
            </span>
            <span className="text-xs font-mono text-rose-300">
              {pendingApprovals} Governance Holds
            </span>
          </div>
        </div>
      </section>

      {/* Main Split: Projects/Jobs Table + Verification & Approvals Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-semibold text-sm text-slate-100">
                Active Projects & Workflow Dispositions
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Fail-closed lifecycle state grounded in UOR-Workflow and PrismPM
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
            >
              <span>All Projects</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-[11px] font-medium text-slate-400">
                  <th className="py-2.5 px-5">Project</th>
                  <th className="py-2.5 px-4">Component</th>
                  <th className="py-2.5 px-4">Revision</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-5 text-right">Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {projects.map((project) => {
                  const component = ENGINEERING_COMPONENTS.find((c) => c.id === project.componentId);
                  const run = runs.find((r) => r.projectId === project.id);
                  return (
                    <tr key={project.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-3 px-5">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectProject(project.id);
                            onNavigate('projects');
                          }}
                          className="text-left font-medium text-slate-100 hover:text-blue-400 transition-colors"
                        >
                          {project.name}
                        </button>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {project.productFamily} · {project.isSyntheticDemo ? 'Synthetic Demo' : 'Reference Record'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-300">
                        {component?.repositoryName ?? project.componentId}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-400">
                        {project.sourceRevision}
                      </td>
                      <td className="py-3 px-4">
                        <StatusTag value={project.lifecycleStatus} />
                      </td>
                      <td className="py-3 px-5 text-right">
                        {run ? (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProject(project.id);
                              onNavigate('workflows');
                            }}
                            className="font-mono text-xs text-blue-400 hover:text-blue-300"
                          >
                            {run.currentStageId.toUpperCase()} ({run.overallStatus})
                          </button>
                        ) : (
                          <span className="font-mono text-xs text-slate-500">NO RUN</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Governance & Verification Posture */}
        <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
            <h2 className="font-display font-semibold text-sm text-slate-100">
              Release & Evidence Holds
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
            >
              Governance
            </button>
          </div>
          <div className="p-5 space-y-4 flex-1">
            {approvals.slice(0, 4).map((apr) => (
              <div key={apr.id} className="pb-3.5 border-b border-slate-800/70 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-slate-200">{apr.title}</span>
                  <StatusTag value={apr.disposition} />
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{apr.rationale}</p>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-slate-800 bg-[#0E131D] flex items-center gap-2 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
            <span>AI is prohibited from authorizing releases.</span>
          </div>
        </section>
      </div>

      {/* Recent Windmill Job Registry Panel */}
      <JobRegistryPanel windmillService={windmillService} />

      {/* Integration Snapshot & Recent Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-display font-semibold text-sm text-slate-100">
              System Integration Inventory
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('connections')}
              className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
            >
              Inspect Connections
            </button>
          </div>
          <div className="divide-y divide-slate-800/70">
            {connections.slice(0, 5).map((conn) => (
              <div key={conn.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">{conn.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                    {conn.targetEndpoint}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusTag value={conn.epistemicCondition} />
                  <StatusTag value={conn.status} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display font-semibold text-sm text-slate-100">
                Recent Console Activity
              </h2>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {activity.length} events
              </span>
            </div>
            <button
              type="button"
              onClick={handleExportActivityLog}
              disabled={activity.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0B0F17] hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              title="Download current console activity events as JSON for audit purposes"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              <span>Export Activity Log</span>
            </button>
          </div>
          {exportNotice && (
            <div className="px-5 py-2 bg-blue-950/25 border-b border-blue-500/25 text-[11px] font-mono text-blue-200">
              {exportNotice}
            </div>
          )}
          <div className="divide-y divide-slate-800/70">
            {activity.slice(0, 5).map((ev) => (
              <div key={ev.id} className="px-5 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                  <span>
                    {ev.category} · {ev.actor}
                  </span>
                  <span className="tabular-nums">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{ev.summary}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {unverifiedSuites > 0 && (
        <div className="flex items-center gap-2.5 text-xs text-slate-400 px-1">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span>
            {unverifiedSuites} independent verification suites (Forge Kernel, Hologram Forge Application Core, Browser & Identity) are marked <span className="font-mono text-amber-300">NOT VERIFIED</span> and cannot be overridden in browser preview.
          </span>
        </div>
      )}
    </div>
  );
};
