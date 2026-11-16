import React, { useMemo, useState } from 'react';
import { RefreshCw, Search, Unplug } from 'lucide-react';
import {
  LEXLEAN_MCP_HOST_EFFECTS,
  WINDMILL_DEPLOYMENT_OPTIONS,
  WINDMILL_TARGET_CONFIG,
} from '../../adapters/windmillAdapter';
import {
  classifyWindmillJobEvidenceStage,
  FailClosedLocalWindmillService,
  WindmillExecutionService,
} from '../../adapters/windmillExecutionService';
import { foundryService } from '../../services/foundryService';
import {
  SystemConnectionRecord,
  WindmillConnectionDiagnostic,
  WindmillHealthStatus,
  WindmillJobRecord,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface ConnectionsViewProps {
  connections: SystemConnectionRecord[];
  windmillService?: WindmillExecutionService;
}

const PREPARED_WINDMILL_BACKEND_RUNNABLES = [
  { id: 'runtime_health', file: 'uor_foundry.raw_app/backend/runtime_health.ts', role: 'Read-only runtime & runnable health verification' },
  { id: 'intake_validate', file: 'uor_foundry.raw_app/backend/intake_validate.ts', role: 'Read-only source-package & canonical command registry validator' },
  { id: 'job_status', file: 'uor_foundry.raw_app/backend/job_status.ts', role: 'Authenticated read-only job status & watermark lookup' },
  { id: 'local_ai_advisory', file: 'uor_foundry.raw_app/backend/local_ai_advisory.ts', role: 'Advisory-only local LM Studio bridge (non-authoritative)' },
  { id: 'workflow_dispatch', file: 'uor_foundry.raw_app/backend/workflow_dispatch.ts', role: 'Governed Windmill flow submission gate' },
  { id: 'prism_stage_dispatch', file: 'uor_foundry.raw_app/backend/prism_stage_dispatch.ts', role: 'Fixed 10-stage Prism/LexLean/Hologram command dispatcher' },
] as const;

export const ConnectionsView: React.FC<ConnectionsViewProps> = ({
  connections,
  windmillService,
}) => {
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const defaultLocalService = useMemo(
    () => new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY'),
    []
  );
  const localService = windmillService ?? defaultLocalService;
  const [healthSnapshot, setHealthSnapshot] = useState<WindmillHealthStatus | null>(null);
  const [lookupJobId, setLookupJobId] = useState('wm-job-calc-001');
  const [jobLookupResult, setJobLookupResult] = useState<
    | { ok: true; record: WindmillJobRecord }
    | { ok: false; diagnostic: WindmillConnectionDiagnostic }
    | null
  >(null);
  const [recentJobsResult, setRecentJobsResult] = useState<{
    ok: boolean;
    records: WindmillJobRecord[];
    diagnostic?: WindmillConnectionDiagnostic;
  } | null>(null);

  const handleCheckConnection = async (name: string) => {
    const res = foundryService.probeWindmillRuntime();
    const health = await localService.checkRuntimeHealth();
    setHealthSnapshot(health);
    setProbeMessage(`${name}: ${res.reason}`);
  };

  const handleReadOnlyJobLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupJobId.trim()) return;
    const res = await localService.getJobStatusAndResult(lookupJobId.trim());
    setJobLookupResult(res);
  };

  const handleFetchRecentJobRegistry = async () => {
    const history = await localService.listApprovedExecutionHistory();
    setRecentJobsResult(history);
  };

  const recentJobCounts = useMemo(() => {
    const records = recentJobsResult?.records ?? [];
    let running = 0;
    let built = 0;
    let verified = 0;
    for (const job of records) {
      const stage = classifyWindmillJobEvidenceStage(job);
      if (stage === 'RUNNING') running += 1;
      else if (stage === 'BUILT') built += 1;
      else if (stage === 'VERIFIED') verified += 1;
    }
    return { running, built, verified, total: records.length };
  }, [recentJobsResult]);

  return (
    <div className="space-y-6">
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display font-semibold text-sm text-slate-100">
              System Connections & Integration Adapters
            </h2>
            <StatusTag value="NOT CONNECTED" />
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
            All unconnected services explicitly display <span className="font-mono text-rose-300">NOT CONNECTED</span>. Future orchestration connects via adapter contracts to self-hosted Windmill (<span className="font-mono">{WINDMILL_TARGET_CONFIG.baseUrl}</span>, workspace <span className="font-mono">{WINDMILL_TARGET_CONFIG.workspace}</span>).
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleCheckConnection('Windmill Target Probe')}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Check Adapter Status</span>
        </button>
      </section>

      {probeMessage && (
        <div className="p-3.5 bg-[#111827] border border-rose-500/35 rounded-md text-xs text-rose-200 flex items-center gap-2">
          <Unplug className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
          <span>{probeMessage}</span>
        </div>
      )}

      {/* Phase A & C: Windmill Runtime Health, Runnable Registration Inventory & Read-Only Job Lookup */}
      <section
        className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4"
        data-testid="windmill-readonly-job-inspector"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-display font-semibold text-sm text-slate-100">
              Windmill Local Execution Client — Read-Only Health, Runnables &amp; Job Inspector
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Verifies read-only runtime health, runnable registrations, and generated <span className="font-mono">wmill.ts</span> contract in workspace <span className="font-mono">uor-offline-foundry</span> before enabling job dispatch.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusTag value="PREPARED" />
            <StatusTag value={healthSnapshot?.reachable ? 'ONLINE' : 'NOT CONNECTED'} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded space-y-2.5">
            <div className="font-medium text-slate-200">
              Prepared Backend Runnables (`uor_foundry.raw_app/backend/`)
            </div>
            <ul className="space-y-1.5 font-mono text-[11px] text-slate-300">
              {PREPARED_WINDMILL_BACKEND_RUNNABLES.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 border-b border-slate-800/70 pb-1">
                  <span className="text-sky-300">{r.id}</span>
                  <span className="text-slate-400 truncate">{r.role}</span>
                </li>
              ))}
            </ul>
            <div className="pt-1 text-[11px] font-mono text-amber-300">
              wmill.contract.ts: {healthSnapshot?.wmillContractStatus ?? 'PREPARED_NOT_REGISTERED'} · dispatchEnabled: {String(healthSnapshot?.dispatchEnabled ?? false)}
            </div>
          </div>

          <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded space-y-3">
            <div className="font-medium text-slate-200">
              Read-Only Job Status Retrieval (`uor-offline-foundry`)
            </div>
            <form onSubmit={handleReadOnlyJobLookup} className="flex items-center gap-2">
              <input
                type="text"
                value={lookupJobId}
                onChange={(e) => setLookupJobId(e.target.value)}
                placeholder="Enter Windmill jobId..."
                data-testid="readonly-job-lookup-input"
                className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-[#111827] border border-slate-700 rounded text-slate-100"
              />
              <button
                type="submit"
                data-testid="readonly-job-lookup-btn"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Query Job Status</span>
              </button>
            </form>

            {jobLookupResult && (
              <div
                data-testid="readonly-job-lookup-result"
                className="p-2.5 bg-[#111827] border border-slate-800 rounded text-[11px] font-mono space-y-1 text-slate-300"
              >
                {!jobLookupResult.ok ? (
                  <div>
                    Diagnostic: [{jobLookupResult.diagnostic.code}] {jobLookupResult.diagnostic.message}
                  </div>
                ) : (
                  <div className="text-emerald-300">
                    Job {jobLookupResult.record.jobId}: state={jobLookupResult.record.state} · rev=
                    {jobLookupResult.record.sourceRevision}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recent Job Registry Panel (Authenticated Windmill Backend History) */}
        <div
          className="p-4 bg-[#0B0F17] border border-slate-800 rounded space-y-3 text-xs"
          data-testid="recent-job-registry-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div>
              <div className="font-medium text-slate-100">
                Recent Job Registry (`uor-offline-foundry`)
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Retrieves real job execution history from the authenticated Windmill backend, explicitly distinguishing <span className="font-mono text-blue-300">RUNNING</span>, <span className="font-mono text-amber-300">BUILT</span>, and <span className="font-mono text-emerald-300">VERIFIED</span> job states.
              </p>
            </div>
            <button
              type="button"
              onClick={handleFetchRecentJobRegistry}
              data-testid="fetch-recent-jobs-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Fetch Recent Jobs</span>
            </button>
          </div>

          <div
            className="grid grid-cols-3 gap-2.5 text-[11px] font-mono"
            data-testid="recent-job-registry-counts"
          >
            <div className="p-2.5 bg-[#111827] border border-slate-800 rounded flex items-center justify-between">
              <span className="text-slate-400">Running</span>
              <span className="text-blue-300 font-semibold" data-testid="recent-jobs-running-count">
                {recentJobCounts.running}
              </span>
            </div>
            <div className="p-2.5 bg-[#111827] border border-slate-800 rounded flex items-center justify-between">
              <span className="text-slate-400">Built</span>
              <span className="text-amber-300 font-semibold" data-testid="recent-jobs-built-count">
                {recentJobCounts.built}
              </span>
            </div>
            <div className="p-2.5 bg-[#111827] border border-slate-800 rounded flex items-center justify-between">
              <span className="text-slate-400">Verified</span>
              <span className="text-emerald-300 font-semibold" data-testid="recent-jobs-verified-count">
                {recentJobCounts.verified}
              </span>
            </div>
          </div>

          {recentJobsResult && (
            <div className="space-y-2" data-testid="recent-job-registry-results">
              {recentJobsResult.diagnostic && (
                <div
                  data-testid="recent-job-registry-diagnostic"
                  className="p-2.5 bg-[#111827] border border-slate-800 rounded text-[11px] font-mono text-slate-300"
                >
                  Diagnostic: [{recentJobsResult.diagnostic.code}] {recentJobsResult.diagnostic.message}
                </div>
              )}

              {recentJobsResult.records.length > 0 && (
                <div className="overflow-x-auto border border-slate-800 rounded">
                  <table className="w-full text-left border-collapse text-[11px] font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 bg-[#111827] text-slate-400">
                        <th className="py-2 px-3">Job ID</th>
                        <th className="py-2 px-3">Flow Path</th>
                        <th className="py-2 px-3">Revision</th>
                        <th className="py-2 px-3">Execution State</th>
                        <th className="py-2 px-3">Evidence Stage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {recentJobsResult.records.map((job) => {
                        const evidenceStage = classifyWindmillJobEvidenceStage(job);
                        return (
                          <tr
                            key={job.jobId}
                            data-testid={`recent-job-row-${job.jobId}`}
                            className="hover:bg-slate-900/40"
                          >
                            <td className="py-2 px-3 text-slate-100">{job.jobId}</td>
                            <td className="py-2 px-3 text-sky-300">{job.flowPath}</td>
                            <td className="py-2 px-3 text-slate-400">{job.sourceRevision}</td>
                            <td className="py-2 px-3">
                              <StatusTag value={job.state} />
                            </td>
                            <td className="py-2 px-3">
                              <StatusTag value={evidenceStage} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connections.map((conn) => (
          <article
            key={conn.id}
            className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-mono text-slate-500">{conn.category}</div>
                  <h3 className="font-display font-semibold text-sm text-slate-100 mt-0.5">
                    {conn.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusTag value={conn.epistemicCondition} />
                  <StatusTag value={conn.status} />
                </div>
              </div>

              <dl className="space-y-1.5 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-500">Target:</dt>
                  <dd className="font-mono text-slate-300 text-right truncate">{conn.targetEndpoint}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-500">Scope:</dt>
                  <dd className="font-mono text-slate-300 text-right truncate">{conn.workspaceOrScope}</dd>
                </div>
              </dl>

              <ul className="space-y-1 font-mono text-[11px] text-slate-400 bg-[#0B0F17] border border-slate-800 rounded p-2.5">
                {conn.capabilities.map((cap, idx) => (
                  <li key={idx} className="truncate">{cap}</li>
                ))}
              </ul>
            </div>

            <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 leading-relaxed">
              {conn.diagnosticNote}
            </div>
          </article>
        ))}
      </section>

      {/* Windmill Full-Code App Deployment Options */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-semibold text-sm text-slate-100">
              Supported Windmill Deployment Architecture Options
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Grounded in Windmill Full-Code App documentation (workspace: uor-offline-foundry)
            </p>
          </div>
          <StatusTag value="DOCUMENTED" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {WINDMILL_DEPLOYMENT_OPTIONS.map((opt) => (
            <div key={opt.id} className="p-4 bg-[#0B0F17] border border-slate-800 rounded-md space-y-2 text-xs">
              <div className="font-medium text-slate-100">{opt.label}</div>
              <p className="text-slate-400 leading-relaxed">
                <strong className="text-slate-300 font-medium">Auth Boundary:</strong> {opt.authBoundary}
              </p>
              <p className="text-slate-400 leading-relaxed">
                <strong className="text-slate-300 font-medium">Transport:</strong> {opt.frontendTransport}
              </p>
              <div className="pt-1 font-mono text-[11px] text-blue-400 truncate">
                {opt.documentationRefs.join(' · ')}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Documented lexlean-mcp Host Effects Contract */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold text-sm text-slate-100">
              Documented LexLean MCP Host Effects Contract (Planned Windmill MCP Bridge)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Read directly from UOR-Foundation/lexlean-mcp/EFFECTS.md (E1..E10)
            </p>
          </div>
          <StatusTag value="DOCUMENTED" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2.5 px-5">Effect</th>
                <th className="py-2.5 px-4">Wire Name</th>
                <th className="py-2.5 px-4">Tag</th>
                <th className="py-2.5 px-5">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {LEXLEAN_MCP_HOST_EFFECTS.map((eff) => (
                <tr key={eff.effectId} className="hover:bg-slate-900/40">
                  <td className="py-2 px-5 font-mono text-slate-200">{eff.effectId}</td>
                  <td className="py-2 px-4 font-mono text-blue-300">{eff.wireName}</td>
                  <td className="py-2 px-4 font-mono text-slate-400 tabular-nums">{eff.tag}</td>
                  <td className="py-2 px-5 text-slate-300">{eff.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

