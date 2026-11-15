import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  ProjectRecord,
  VerificationStatus,
  VerificationSuiteRecord,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface VerificationViewProps {
  projects: ProjectRecord[];
  verifications: VerificationSuiteRecord[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
}

export const VerificationView: React.FC<VerificationViewProps> = ({
  projects,
  verifications,
  selectedProjectId,
  onSelectProject,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | VerificationStatus>('ALL');
  const [projectScope, setProjectScope] = useState<string>(selectedProjectId || 'all');

  const filtered = verifications.filter((v) => {
    const matchProject = projectScope === 'all' || v.projectId === projectScope;
    const matchStatus = statusFilter === 'ALL' || v.status === statusFilter;
    return matchProject && matchStatus;
  });

  const [selectedSuiteId, setSelectedSuiteId] = useState<string>(
    filtered[0]?.id ?? verifications[0]?.id ?? ''
  );
  const activeSuite =
    filtered.find((v) => v.id === selectedSuiteId) ?? filtered[0];

  const counts = {
    PASS: verifications.filter((v) => v.status === 'PASS').length,
    FAIL: verifications.filter((v) => v.status === 'FAIL').length,
    'NOT RUN': verifications.filter((v) => v.status === 'NOT RUN').length,
    'NOT VERIFIED': verifications.filter((v) => v.status === 'NOT VERIFIED').length,
  };

  return (
    <div className="space-y-6">
      {/* Status Summary & Filters */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-sm text-slate-100">
              Independent Verification & Evidence Matrix
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Preserves independent ownership of LexLean, PrismPM, Forge Kernel, Hologram Forge Application Core, and Browser/Identity acceptance suites.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-emerald-300">PASS: {counts.PASS}</span>
            <span className="text-slate-600">·</span>
            <span className="text-rose-300">FAIL: {counts.FAIL}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-300">NOT RUN: {counts['NOT RUN']}</span>
            <span className="text-slate-600">·</span>
            <span className="text-amber-300">NOT VERIFIED: {counts['NOT VERIFIED']}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <label htmlFor="ver-project-select" className="text-xs text-slate-400">
              Project Scope:
            </label>
            <select
              id="ver-project-select"
              value={projectScope}
              onChange={(e) => {
                setProjectScope(e.target.value);
                if (e.target.value !== 'all') {
                  onSelectProject(e.target.value);
                }
              }}
              className="px-3 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-md overflow-x-auto">
            {(['ALL', 'PASS', 'FAIL', 'NOT RUN', 'NOT VERIFIED'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400">
                  <th className="py-3 px-5">Authority & Suite</th>
                  <th className="py-3 px-4">Evidence ID</th>
                  <th className="py-3 px-4">Condition</th>
                  <th className="py-3 px-5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      No verification suites match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((suite) => {
                    const project = projects.find((p) => p.id === suite.projectId);
                    const selected = activeSuite?.id === suite.id;
                    return (
                      <tr
                        key={suite.id}
                        onClick={() => setSelectedSuiteId(suite.id)}
                        className={`cursor-pointer transition-colors ${
                          selected ? 'bg-slate-800/70' : 'hover:bg-slate-900/50'
                        }`}
                      >
                        <td className="py-3 px-5">
                          <div className="font-medium text-slate-100">{suite.suiteName}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {suite.authority} · {project?.name ?? suite.projectId}
                            {suite.isSimulated ? ' · MOCK DEMO' : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">{suite.evidenceId}</td>
                        <td className="py-3 px-4">
                          <StatusTag value={suite.epistemicCondition} />
                        </td>
                        <td className="py-3 px-5 text-right">
                          <StatusTag value={suite.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="xl:col-span-5 bg-[#111827] border border-slate-800/90 rounded-lg p-6">
          {!activeSuite ? (
            <p className="text-sm text-slate-400">Select a verification record to inspect evidence metadata.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2 pb-4 border-b border-slate-800">
                <div>
                  <div className="text-xs font-mono text-slate-400">{activeSuite.authority}</div>
                  <h3 className="font-display font-semibold text-base text-slate-100 mt-0.5">
                    {activeSuite.suiteName}
                  </h3>
                </div>
                <StatusTag value={activeSuite.status} />
              </div>

              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="text-slate-500">Evidence Identifier</dt>
                  <dd className="mt-1 font-mono text-slate-200">{activeSuite.evidenceId}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Source Revision</dt>
                  <dd className="mt-1 font-mono text-slate-200">{activeSuite.sourceRevision}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Toolchain Identity</dt>
                  <dd className="mt-1 font-mono text-slate-200">{activeSuite.toolchainIdentity}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Artifact / IR Hash</dt>
                  <dd className="mt-1 font-mono text-slate-300 break-all bg-[#0B0F17] border border-slate-800 rounded p-2">
                    {activeSuite.artifactHash ?? 'UNAVAILABLE — No verified artifact hash'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Execution Record</dt>
                  <dd className="mt-1 text-slate-300 leading-relaxed">{activeSuite.executionRecord}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Boundary Notes</dt>
                  <dd className="mt-1 text-slate-300 leading-relaxed">{activeSuite.notes}</dd>
                </div>
              </dl>

              {activeSuite.isSimulated && (
                <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded text-xs text-indigo-200 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Mock verification entry from browser synthetic demo. Never substitutes for real Mac Studio toolchain execution.
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
