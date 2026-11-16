import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  classifyWindmillJobEvidenceStage,
  RecentJobRegistryState,
  WindmillExecutionService,
} from '../../adapters/windmillExecutionService';
import { WINDMILL_TARGET_CONFIG } from '../../adapters/windmillAdapter';
import { DEMO_WINDMILL_JOB_FIXTURES } from '../../data/seedFoundryData';
import {
  WindmillConnectionDiagnostic,
  WindmillJobRecord,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';

export interface JobRegistryPanelProps {
  windmillService?: WindmillExecutionService;
  initialJobs?: WindmillJobRecord[];
  projectId?: string;
  title?: string;
}

type StatusFilter = 'ALL' | 'RUNNING' | 'BUILT' | 'VERIFIED';

const STATE_DISPLAY_LABEL: Record<RecentJobRegistryState, string> = {
  RUNNING: 'Running',
  BUILT: 'Built',
  VERIFIED: 'Verified',
  BLOCKED: 'Blocked',
};

const STATE_BAR_COLORS: Record<RecentJobRegistryState, string> = {
  RUNNING: '#38bdf8',
  BUILT: '#fbbf24',
  VERIFIED: '#34d399',
  BLOCKED: '#fb7185',
};

export const JobRegistryPanel: React.FC<JobRegistryPanelProps> = ({
  windmillService,
  initialJobs,
  projectId,
  title = 'Recent Job Registry',
}) => {
  const defaultJobs = useMemo(
    () =>
      initialJobs ??
      (projectId
        ? DEMO_WINDMILL_JOB_FIXTURES.filter((j) => j.projectId === projectId)
        : DEMO_WINDMILL_JOB_FIXTURES),
    [initialJobs, projectId]
  );

  const [jobs, setJobs] = useState<WindmillJobRecord[]>(defaultJobs);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    defaultJobs[0]?.jobId ?? null
  );
  const [diagnostic, setDiagnostic] =
    useState<WindmillConnectionDiagnostic | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialJobs) {
      setJobs(initialJobs);
      if (initialJobs.length > 0 && !selectedJobId) {
        setSelectedJobId(initialJobs[0].jobId);
      }
    }
  }, [initialJobs, selectedJobId]);

  const handleRefreshJobs = async () => {
    if (!windmillService) {
      const fallback = projectId
        ? DEMO_WINDMILL_JOB_FIXTURES.filter((j) => j.projectId === projectId)
        : DEMO_WINDMILL_JOB_FIXTURES;
      setJobs(fallback);
      setDiagnostic({
        timestamp: new Date().toISOString(),
        endpoint: WINDMILL_TARGET_CONFIG.baseUrl,
        workspace: WINDMILL_TARGET_CONFIG.workspace,
        code: 'NOT_CONNECTED',
        message:
          'Displaying browser-local reference job fixtures. Live Windmill runtime (http://127.0.0.1:8080, workspace uor-offline-foundry) is NOT CONNECTED.',
        browserNavigatorOnline:
          typeof navigator !== 'undefined' ? navigator.onLine : false,
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await windmillService.listApprovedExecutionHistory(projectId);
      setJobs(response.records);
      setDiagnostic(response.diagnostic ?? null);
      if (response.records.length > 0) {
        setSelectedJobId(response.records[0].jobId);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const classifiedJobs = useMemo(
    () =>
      jobs.map((job) => {
        const evidenceStage = classifyWindmillJobEvidenceStage(job);
        return {
          job,
          evidenceStage,
          statusLabel: STATE_DISPLAY_LABEL[evidenceStage],
        };
      }),
    [jobs]
  );

  const distributionCounts = useMemo(() => {
    const counts: Record<'RUNNING' | 'BUILT' | 'VERIFIED' | 'BLOCKED', number> = {
      RUNNING: 0,
      BUILT: 0,
      VERIFIED: 0,
      BLOCKED: 0,
    };
    for (const item of classifiedJobs) {
      counts[item.evidenceStage] += 1;
    }
    return counts;
  }, [classifiedJobs]);

  const chartData = useMemo(
    () => [
      {
        stateKey: 'RUNNING' as const,
        name: 'Running',
        count: distributionCounts.RUNNING,
        fill: STATE_BAR_COLORS.RUNNING,
      },
      {
        stateKey: 'BUILT' as const,
        name: 'Built',
        count: distributionCounts.BUILT,
        fill: STATE_BAR_COLORS.BUILT,
      },
      {
        stateKey: 'VERIFIED' as const,
        name: 'Verified',
        count: distributionCounts.VERIFIED,
        fill: STATE_BAR_COLORS.VERIFIED,
      },
    ],
    [distributionCounts]
  );

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classifiedJobs.filter(({ job, evidenceStage, statusLabel }) => {
      if (statusFilter !== 'ALL' && evidenceStage !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        job.jobId.toLowerCase().includes(q) ||
        job.workflowName.toLowerCase().includes(q) ||
        job.flowPath.toLowerCase().includes(q) ||
        statusLabel.toLowerCase().includes(q)
      );
    });
  }, [classifiedJobs, searchQuery, statusFilter]);

  const selectedJobEntry = useMemo(
    () =>
      filteredJobs.find((item) => item.job.jobId === selectedJobId) ??
      filteredJobs[0] ??
      null,
    [filteredJobs, selectedJobId]
  );

  return (
    <section
      data-testid="job-registry-panel"
      className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <h2 className="font-display font-semibold text-sm text-slate-100">
              {title}
            </h2>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Workspace: {WINDMILL_TARGET_CONFIG.workspace}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Endpoint: {WINDMILL_TARGET_CONFIG.baseUrl}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Read-only Windmill execution history distinguishing Running, Built, and Verified states. Compiler execution and production release remain disabled.
          </p>
        </div>

        <button
          type="button"
          data-testid="job-registry-refresh-btn"
          onClick={handleRefreshJobs}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0B0F17] hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
          <span>{isLoading ? 'Syncing...' : 'Refresh Job Registry'}</span>
        </button>
      </div>

      {diagnostic && (
        <div
          data-testid="job-registry-diagnostic"
          className="px-5 py-2.5 bg-amber-950/20 border-b border-amber-500/25 text-xs font-mono text-amber-200"
        >
          [{diagnostic.code}] {diagnostic.message}
        </div>
      )}

      <div className="p-5 grid grid-cols-1 xl:grid-cols-3 gap-5 border-b border-slate-800/80">
        {/* Recharts Job State Distribution */}
        <div className="bg-[#0B0F17] border border-slate-800 rounded-md p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-200">
                Job State Distribution
              </h3>
              <p className="text-[11px] text-slate-400">
                Running vs. Built vs. Verified
              </p>
            </div>
            <div
              data-testid="job-registry-summary-counts"
              className="flex items-center gap-2 text-[11px] font-mono text-slate-400"
            >
              <span className="text-sky-300">Running: {distributionCounts.RUNNING}</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300">Built: {distributionCounts.BUILT}</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-300">Verified: {distributionCounts.VERIFIED}</span>
            </div>
          </div>

          <div
            data-testid="job-registry-chart-container"
            className="w-full h-36 min-h-[144px]"
          >
            <ResponsiveContainer width="100%" height={140} minWidth={200}>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(30, 41, 59, 0.45)' }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#f1f5f9',
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.stateKey} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Interactive Filter & Search + Table */}
        <div className="xl:col-span-2 flex flex-col justify-between space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Filter jobs by evidence stage"
              className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-md"
            >
              {(
                [
                  { id: 'ALL', label: `All (${classifiedJobs.length})` },
                  { id: 'RUNNING', label: `Running (${distributionCounts.RUNNING})` },
                  { id: 'BUILT', label: `Built (${distributionCounts.BUILT})` },
                  { id: 'VERIFIED', label: `Verified (${distributionCounts.VERIFIED})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`job-registry-filter-${tab.id.toLowerCase()}`}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search
                className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by Job ID or workflow..."
                aria-label="Filter recent Windmill jobs"
                data-testid="job-registry-search-input"
                className="w-full bg-[#0B0F17] border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800 rounded-md overflow-x-auto">
            <table
              data-testid="job-registry-table"
              className="w-full text-left border-collapse"
            >
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400">
                  <th className="py-2.5 px-3">Job ID</th>
                  <th className="py-2.5 px-3">Workflow / Flow Path</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Origin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 px-4 text-center font-mono text-slate-500"
                    >
                      No Windmill jobs match the active filter.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map(({ job, evidenceStage, statusLabel }) => {
                    const isSelected = selectedJobEntry?.job.jobId === job.jobId;
                    const timestamp = job.completedAt ?? job.startedAt;
                    return (
                      <tr
                        key={job.jobId}
                        data-testid={`job-registry-row-${job.jobId}`}
                        onClick={() => setSelectedJobId(job.jobId)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-950/25'
                            : 'hover:bg-slate-900/60'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-200 whitespace-nowrap">
                          {job.jobId}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          <div className="font-medium text-slate-200">
                            {job.workflowName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {job.flowPath}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <StatusTag value={evidenceStage} />
                            <span className="font-mono text-[11px] text-slate-300">
                              {statusLabel}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                          {timestamp}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[11px] whitespace-nowrap">
                          {job.isSyntheticFixture ? (
                            <span className="text-amber-300">DEMO FIXTURE</span>
                          ) : (
                            <span className="text-emerald-300">LIVE WINDMILL</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Selected Job Read-Only Detail Strip */}
      {selectedJobEntry && (
        <div
          data-testid="job-registry-selected-detail"
          className="px-5 py-3 bg-[#0E131D] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-300"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">Selected Job:</span>
            <span className="text-slate-100">{selectedJobEntry.job.jobId}</span>
            <span aria-hidden="true">·</span>
            <span>Stage Classification: {selectedJobEntry.statusLabel}</span>
            <span aria-hidden="true">·</span>
            <span>Revision: {selectedJobEntry.job.sourceRevision}</span>
          </div>
          <div className="text-slate-400 truncate max-w-xl">
            {selectedJobEntry.job.logs[selectedJobEntry.job.logs.length - 1] ??
              'No execution log lines recorded.'}
          </div>
        </div>
      )}
    </section>
  );
};
