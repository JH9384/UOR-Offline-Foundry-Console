import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  classifyWindmillJobEvidenceStage,
  FailClosedLocalWindmillService,
  RecentJobRegistryState,
  WindmillExecutionService,
} from '../../adapters/windmillExecutionService';
import { createBrowserProxyWindmillTransport } from '../../adapters/windmillLocalReadOnlyAdapter';
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
  initialPageSize?: number;
}

export type StatusFilter = 'ALL' | 'RUNNING' | 'BUILT' | 'VERIFIED';
export type TimestampSortOrder = 'desc' | 'asc';
export type JobRegistrySourceIndicator = 'LIVE' | 'DEMO' | 'UNAVAILABLE';

interface ClassifiedJobItem {
  job: WindmillJobRecord;
  evidenceStage: RecentJobRegistryState;
  statusLabel: string;
  timestampIso: string;
  timestampMs: number;
  resultSummary: string;
  searchIndex: string;
}

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

function formatJobResultSummary(job: WindmillJobRecord): string {
  if (job.structuredResult && Object.keys(job.structuredResult).length > 0) {
    return JSON.stringify(job.structuredResult);
  }
  if (job.logs && job.logs.length > 0) {
    return job.logs[job.logs.length - 1];
  }
  return 'UNAVAILABLE';
}

interface JobRegistryRowProps {
  item: ClassifiedJobItem;
  isSelected: boolean;
  onSelect: (jobId: string) => void;
}

const JobRegistryRow: React.FC<JobRegistryRowProps> = React.memo(
  ({ item, isSelected, onSelect }) => {
    const { job, evidenceStage, statusLabel, timestampIso, resultSummary } = item;
    return (
      <tr
        data-testid={`job-registry-row-${job.jobId}`}
        onClick={() => onSelect(job.jobId)}
        className={`cursor-pointer transition-colors ${
          isSelected ? 'bg-blue-950/25' : 'hover:bg-slate-900/60'
        }`}
      >
        <td className="py-2.5 px-3 font-mono text-slate-200 whitespace-nowrap">
          {job.jobId}
        </td>
        <td className="py-2.5 px-3 text-slate-300">
          <div className="font-medium text-slate-200">{job.workflowName}</div>
          <div className="text-[11px] font-mono text-slate-500">
            {job.flowPath}
          </div>
        </td>
        <td className="py-2.5 px-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <StatusTag value={evidenceStage} />
            <span className="font-mono text-[11px] text-slate-300">
              {statusLabel} ({job.state})
            </span>
          </div>
        </td>
        <td
          data-testid={`job-registry-timestamp-${job.jobId}`}
          className="py-2.5 px-3 font-mono text-slate-400 tabular-nums whitespace-nowrap"
        >
          {timestampIso}
        </td>
        <td
          data-testid={`job-registry-result-${job.jobId}`}
          className="py-2.5 px-3 font-mono text-[11px] text-slate-300 max-w-[220px] truncate"
          title={resultSummary}
        >
          {resultSummary}
        </td>
        <td className="py-2.5 px-3 text-right font-mono text-[11px] whitespace-nowrap">
          {job.isSyntheticFixture ? (
            <span
              data-testid={`job-registry-origin-${job.jobId}`}
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-500/30 text-amber-300"
            >
              DEMO
            </span>
          ) : (
            <span
              data-testid={`job-registry-origin-${job.jobId}`}
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/30 text-emerald-300"
            >
              LIVE
            </span>
          )}
        </td>
      </tr>
    );
  }
);

JobRegistryRow.displayName = 'JobRegistryRow';

export const JobRegistryPanel: React.FC<JobRegistryPanelProps> = ({
  windmillService,
  initialJobs,
  projectId,
  title = 'Recent Job Registry',
  initialPageSize = 50,
}) => {
  const isLocalServiceBound = windmillService?.mode === 'LOCAL';

  const demoJobs = useMemo(
    () =>
      projectId
        ? DEMO_WINDMILL_JOB_FIXTURES.filter((j) => j.projectId === projectId)
        : DEMO_WINDMILL_JOB_FIXTURES,
    [projectId]
  );

  const initialRecordList = useMemo(() => {
    if (initialJobs) return initialJobs;
    // Never seed synthetic DEMO fixtures when bound to a LOCAL Windmill service
    if (isLocalServiceBound) return [];
    return demoJobs;
  }, [initialJobs, isLocalServiceBound, demoJobs]);

  const [sourceMode, setSourceMode] = useState<'DEMO' | 'LOCAL'>(
    isLocalServiceBound ? 'LOCAL' : 'DEMO'
  );
  const [sourceIndicator, setSourceIndicator] =
    useState<JobRegistrySourceIndicator>(() => {
      if (initialJobs) {
        return initialJobs.some((j) => !j.isSyntheticFixture) ? 'LIVE' : 'DEMO';
      }
      return isLocalServiceBound ? 'UNAVAILABLE' : 'DEMO';
    });
  const [jobs, setJobs] = useState<WindmillJobRecord[]>(initialRecordList);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortOrder, setSortOrder] = useState<TimestampSortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialRecordList[0]?.jobId ?? null
  );
  const [diagnostic, setDiagnostic] =
    useState<WindmillConnectionDiagnostic | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const defaultBrowserLocalService = useMemo(
    () =>
      new FailClosedLocalWindmillService(
        'VITE_AUTHENTICATED_LOCAL_PROXY',
        createBrowserProxyWindmillTransport()
      ),
    []
  );

  useEffect(() => {
    if (initialJobs) {
      setJobs(initialJobs);
      setCurrentPage(1);
      setSourceIndicator(
        initialJobs.some((j) => !j.isSyntheticFixture) ? 'LIVE' : 'DEMO'
      );
      if (initialJobs.length > 0 && !selectedJobId) {
        setSelectedJobId(initialJobs[0].jobId);
      }
    }
  }, [initialJobs, selectedJobId]);

  const fetchLiveJobs = useCallback(
    async (serviceToQuery: WindmillExecutionService) => {
      setIsLoading(true);
      try {
        const response =
          await serviceToQuery.listApprovedExecutionHistory(projectId);
        if (!response.ok) {
          // Strict fail-closed: never silently fall back to synthetic DEMO fixtures
          setJobs([]);
          setSelectedJobId(null);
          setSourceIndicator('UNAVAILABLE');
          setDiagnostic(
            response.diagnostic ?? {
              timestamp: new Date().toISOString(),
              endpoint: WINDMILL_TARGET_CONFIG.baseUrl,
              workspace: WINDMILL_TARGET_CONFIG.workspace,
              code: 'NOT_CONNECTED',
              message:
                'Live Windmill job retrieval is UNAVAILABLE. Synthetic DEMO fixtures are suppressed in LOCAL mode.',
              browserNavigatorOnline:
                typeof navigator !== 'undefined' ? navigator.onLine : false,
            }
          );
          return;
        }

        const liveRecords = response.records.filter(
          (r) => !r.isSyntheticFixture
        );
        setJobs(liveRecords);
        setCurrentPage(1);
        setSourceIndicator('LIVE');
        setDiagnostic(response.diagnostic ?? null);
        setSelectedJobId(liveRecords[0]?.jobId ?? null);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  const handleRefreshJobs = useCallback(async () => {
    if (windmillService) {
      if (windmillService.mode === 'LOCAL') {
        setSourceMode('LOCAL');
        await fetchLiveJobs(windmillService);
        return;
      }
      const response =
        await windmillService.listApprovedExecutionHistory(projectId);
      setJobs(response.records);
      setCurrentPage(1);
      setSourceIndicator('DEMO');
      setDiagnostic(response.diagnostic ?? null);
      if (response.records.length > 0) {
        setSelectedJobId(response.records[0].jobId);
      }
      return;
    }

    if (sourceMode === 'LOCAL') {
      await fetchLiveJobs(defaultBrowserLocalService);
      return;
    }

    setJobs(demoJobs);
    setCurrentPage(1);
    setSourceIndicator('DEMO');
    setDiagnostic({
      timestamp: new Date().toISOString(),
      endpoint: WINDMILL_TARGET_CONFIG.baseUrl,
      workspace: WINDMILL_TARGET_CONFIG.workspace,
      code: 'NOT_CONNECTED',
      message:
        'Displaying browser-local DEMO job fixtures. Switch to LOCAL to query http://127.0.0.1:8080 (workspace uor-offline-foundry) via the server-side read-only adapter.',
      browserNavigatorOnline:
        typeof navigator !== 'undefined' ? navigator.onLine : false,
    });
  }, [
    windmillService,
    sourceMode,
    fetchLiveJobs,
    projectId,
    defaultBrowserLocalService,
    demoJobs,
  ]);

  const handleSwitchSourceMode = useCallback(
    async (nextMode: 'DEMO' | 'LOCAL') => {
      setSourceMode(nextMode);
      setCurrentPage(1);
      if (nextMode === 'DEMO') {
        setJobs(demoJobs);
        setSelectedJobId(demoJobs[0]?.jobId ?? null);
        setSourceIndicator('DEMO');
        setDiagnostic(null);
      } else {
        const targetSvc =
          windmillService?.mode === 'LOCAL'
            ? windmillService
            : defaultBrowserLocalService;
        await fetchLiveJobs(targetSvc);
      }
    },
    [demoJobs, windmillService, defaultBrowserLocalService, fetchLiveJobs]
  );

  // Precompute classification, numeric epoch timestamp, result summary, and lowercase search index once per jobs list
  const classifiedJobs = useMemo<ClassifiedJobItem[]>(
    () =>
      jobs.map((job) => {
        const evidenceStage = classifyWindmillJobEvidenceStage(job);
        const statusLabel = STATE_DISPLAY_LABEL[evidenceStage];
        const timestampIso = job.completedAt ?? job.startedAt;
        const parsedMs = Date.parse(timestampIso);
        const timestampMs = Number.isNaN(parsedMs) ? 0 : parsedMs;
        const resultSummary = formatJobResultSummary(job);
        const searchIndex = `${job.jobId} ${job.workflowName} ${job.flowPath} ${statusLabel} ${job.state} ${resultSummary}`.toLowerCase();
        return {
          job,
          evidenceStage,
          statusLabel,
          timestampIso,
          timestampMs,
          resultSummary,
          searchIndex,
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
    for (let i = 0; i < classifiedJobs.length; i += 1) {
      counts[classifiedJobs[i].evidenceStage] += 1;
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

  // Performant client-side filtering & timestamp sorting over pre-indexed items
  const filteredAndSortedJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered: ClassifiedJobItem[] = [];

    for (let i = 0; i < classifiedJobs.length; i += 1) {
      const item = classifiedJobs[i];
      if (statusFilter !== 'ALL' && item.evidenceStage !== statusFilter) {
        continue;
      }
      if (q && !item.searchIndex.includes(q)) {
        continue;
      }
      filtered.push(item);
    }

    filtered.sort((a, b) => {
      const diff =
        sortOrder === 'asc'
          ? a.timestampMs - b.timestampMs
          : b.timestampMs - a.timestampMs;
      if (diff !== 0) return diff;
      return a.job.jobId.localeCompare(b.job.jobId);
    });

    return filtered;
  }, [classifiedJobs, searchQuery, statusFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedJobs.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedJobs = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredAndSortedJobs.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedJobs, safeCurrentPage, pageSize]);

  const selectedJobEntry = useMemo(
    () =>
      filteredAndSortedJobs.find((item) => item.job.jobId === selectedJobId) ??
      filteredAndSortedJobs[0] ??
      null,
    [filteredAndSortedJobs, selectedJobId]
  );

  const handleStatusFilterChange = useCallback((nextFilter: StatusFilter) => {
    setStatusFilter(nextFilter);
    setCurrentPage(1);
  }, []);

  const handleToggleSortOrder = useCallback(() => {
    setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    setCurrentPage(1);
  }, []);

  const handleSelectRow = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
  }, []);

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
            <span
              data-testid="job-registry-mode-indicator"
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${
                sourceIndicator === 'LIVE'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : sourceIndicator === 'DEMO'
                    ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                    : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
              }`}
            >
              {sourceIndicator}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Workspace: {WINDMILL_TARGET_CONFIG.workspace}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Endpoint: {WINDMILL_TARGET_CONFIG.baseUrl}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Read-only Windmill execution history distinguishing Running, Built, and Verified states. No silent fallback from LOCAL to DEMO; compiler execution and release remain disabled.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Job Registry source mode"
            className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-md"
          >
            <button
              type="button"
              data-testid="job-registry-source-mode-demo"
              aria-pressed={sourceMode === 'DEMO'}
              onClick={() => void handleSwitchSourceMode('DEMO')}
              className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                sourceMode === 'DEMO'
                  ? 'bg-amber-600/80 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DEMO
            </button>
            <button
              type="button"
              data-testid="job-registry-source-mode-local"
              aria-pressed={sourceMode === 'LOCAL'}
              onClick={() => void handleSwitchSourceMode('LOCAL')}
              className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                sourceMode === 'LOCAL'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              LOCAL (127.0.0.1:8080)
            </button>
          </div>

          <button
            type="button"
            data-testid="job-registry-refresh-btn"
            onClick={() => void handleRefreshJobs()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0B0F17] hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            <span>{isLoading ? 'Syncing...' : 'Refresh Job Registry'}</span>
          </button>
        </div>
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
            className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-[144px]"
          >
            <div data-testid="job-registry-pie-chart" className="w-full h-36">
              <ResponsiveContainer width="100%" height={140} minWidth={140}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={28}
                    outerRadius={52}
                    paddingAngle={2}
                    stroke="#0B0F17"
                    strokeWidth={2}
                  >
                    {chartData.map((entry) => (
                      <Cell key={`pie-${entry.stateKey}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#f1f5f9',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="w-full h-36">
              <ResponsiveContainer width="100%" height={140} minWidth={140}>
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
        </div>

        {/* Interactive Filter, Timestamp Sort & Search + Table */}
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
                  aria-pressed={statusFilter === tab.id}
                  data-testid={`job-registry-filter-${tab.id.toLowerCase()}`}
                  onClick={() => handleStatusFilterChange(tab.id)}
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

            <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
              <button
                type="button"
                data-testid="job-registry-sort-toggle"
                onClick={handleToggleSortOrder}
                aria-label={`Sort by timestamp (${sortOrder === 'desc' ? 'newest first' : 'oldest first'})`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-slate-300 bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 rounded-md transition-colors"
              >
                {sortOrder === 'desc' ? (
                  <ArrowDown className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                )}
                <span>Timestamp: {sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
              </button>

              <div className="relative min-w-[200px] max-w-xs flex-1">
                <Search
                  className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Filter by Job ID or workflow..."
                  aria-label="Filter recent Windmill jobs"
                  data-testid="job-registry-search-input"
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
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
                  <th
                    aria-sort={sortOrder === 'asc' ? 'ascending' : 'descending'}
                    className="py-2.5 px-3"
                  >
                    <button
                      type="button"
                      data-testid="job-registry-sort-timestamp"
                      onClick={handleToggleSortOrder}
                      className="inline-flex items-center gap-1 font-medium text-slate-300 hover:text-white transition-colors"
                    >
                      <span>Timestamp</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Result</th>
                  <th className="py-2.5 px-3 text-right">Origin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {paginatedJobs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      data-testid="job-registry-empty-row"
                      className="py-6 px-4 text-center font-mono text-slate-400"
                    >
                      {sourceIndicator === 'UNAVAILABLE'
                        ? 'UNAVAILABLE — Live Windmill job history is not connected or not yet queried. Synthetic DEMO fixtures are not shown in LOCAL mode.'
                        : 'No Windmill jobs match the active filter.'}
                    </td>
                  </tr>
                ) : (
                  paginatedJobs.map((item) => (
                    <JobRegistryRow
                      key={item.job.jobId}
                      item={item}
                      isSelected={selectedJobEntry?.job.jobId === item.job.jobId}
                      onSelect={handleSelectRow}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Client-side pagination controls for large job histories */}
          {filteredAndSortedJobs.length > pageSize && (
            <div
              data-testid="job-registry-pagination"
              className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-mono text-slate-400"
            >
              <span>
                Showing {(safeCurrentPage - 1) * pageSize + 1}–
                {Math.min(safeCurrentPage * pageSize, filteredAndSortedJobs.length)} of{' '}
                {filteredAndSortedJobs.length} matching jobs
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px]">
                  <span>Rows:</span>
                  <select
                    data-testid="job-registry-page-size-select"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-[#0B0F17] border border-slate-800 rounded px-1.5 py-0.5 text-slate-200"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
                <button
                  type="button"
                  data-testid="job-registry-prev-page"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-[#0B0F17] border border-slate-800 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Prev</span>
                </button>
                <span data-testid="job-registry-page-indicator">
                  Page {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  data-testid="job-registry-next-page"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-[#0B0F17] border border-slate-800 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
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
            <span>
              Origin: {selectedJobEntry.job.isSyntheticFixture ? 'DEMO' : 'LIVE'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Stage Classification: {selectedJobEntry.statusLabel}</span>
            <span aria-hidden="true">·</span>
            <span>Revision: {selectedJobEntry.job.sourceRevision}</span>
          </div>
          <div
            data-testid="job-registry-selected-result"
            className="text-slate-300 truncate max-w-xl"
          >
            Result: {selectedJobEntry.resultSummary}
          </div>
        </div>
      )}
    </section>
  );
};
