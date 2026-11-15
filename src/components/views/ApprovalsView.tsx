import React from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { ApprovalDecisionRecord, ProjectRecord } from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface ApprovalsViewProps {
  projects: ProjectRecord[];
  approvals: ApprovalDecisionRecord[];
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({ projects, approvals }) => {
  return (
    <div className="space-y-6">
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <h2 className="font-display font-semibold text-sm text-slate-100">
            Approvals & Release Governance
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Enforces JH9384/UOR-Workflow separation of duties: execution, technical qualification, and release authorization are distinct human decisions. AI systems may never authorize a release.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Production Release Authorization is disabled in browser preview and blocked until all verification suites pass."
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-500 bg-slate-900 border border-slate-800 rounded-md cursor-not-allowed whitespace-nowrap shrink-0"
        >
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Authorize Production Release (Blocked)</span>
        </button>
      </section>

      <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm text-slate-100">
            Governance Decision Records
          </h3>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {approvals.length} gates
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400">
                <th className="py-3 px-5">Project & Gate</th>
                <th className="py-3 px-4">Required Role</th>
                <th className="py-3 px-4">Authorized Reviewer</th>
                <th className="py-3 px-4">AI Permitted</th>
                <th className="py-3 px-5 text-right">Disposition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {approvals.map((apr) => {
                const project = projects.find((p) => p.id === apr.projectId);
                return (
                  <tr key={apr.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-3.5 px-5 max-w-md">
                      <div className="font-medium text-slate-100">{apr.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {project?.name ?? apr.projectId} · <span className="font-mono">{apr.gate}</span>
                        {apr.authorizationScope && (
                          <span> · Scope: <span className="font-mono">{apr.authorizationScope}</span></span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{apr.rationale}</p>
                      {(apr.sourceRevision || apr.artifactDigest) && (
                        <div className="mt-1.5 text-[10px] font-mono text-slate-500 truncate">
                          {apr.sourceRevision ? `rev: ${apr.sourceRevision}` : ''}
                          {apr.artifactDigest ? ` · digest: ${apr.artifactDigest.slice(0, 12)}...` : ''}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 align-top">{apr.requiredRole}</td>
                    <td className="py-3.5 px-4 text-slate-300 align-top">
                      <div>{apr.authorizedReviewer}</div>
                      {apr.authenticatedApproverId && (
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          ID: {apr.authenticatedApproverId}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-rose-300 align-top">NO (Prohibited)</td>
                    <td className="py-3.5 px-5 text-right align-top">
                      <StatusTag value={apr.disposition} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg flex items-start gap-2.5 text-xs text-slate-300">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Per <span className="font-mono text-slate-200">acceptance-policy.example.json</span>, technical acceptance defaults to <span className="font-mono">NOT_ASSESSED</span> and release authorization defaults to <span className="font-mono">DEFER</span> until independent evidence is verified locally.
        </span>
      </div>
    </div>
  );
};
